#!/usr/bin/env bash
#===============================================================================
# build-bun-ohos-native.sh — OHOS aarch64 原生编译 Bun (CI 模式)
#
# 参考 social4hyq/homebrew-core bottle-build CI (bun.rb formula) 的逻辑。
#
# 工具链: Homebrew llvm 23 (opt/llvm, 别名 llvm@23) + lld 23 (opt/lld)
#   - opt/llvm 的 include/aarch64-linux-ohos/c++/v1 作为 OHOS libc++ 头文件
#   - opt/llvm 的 lib/aarch64-linux-ohos/libc++_static.a 作为 libc++ 实现
#     (homebrew 的 libc++.a 是空占位, 真实实现在 libc++_static.a)
#     ABI namespace 为 std::__n1, 与 llvm@21/brew ICU 相同, 可直接混链.
#   - opt/llvm 的 clang/clang++ + --target=aarch64-linux-ohos 作为 OHOS 交叉编译器
#     (brew 的 llvm 23 keg 不再提供 aarch64-linux-ohos-clang* 三前缀链接,
#      脚本在 .bin 里补齐)
#   - 上游 tools.ts 的 LLVM_VERSION_RANGE = >=23.1.0 <23.1.99; .bin/clang 即
#     23.1.1, configure 不再需要事后改写 build.ninja
#
# 核心思路:
#   1. build/ohos-cross-libs → opt/llvm OHOS 头文件/库的符号链接
#   2. CC/CXX 指向 Homebrew 的 cc/c++ shims (llvm-gcc-compat → ohos-sdk clang,
#      供 node-gyp 等子进程使用)
#   3. bun scripts/build.ts 直接驱动构建 (--webkit=local + $BUN_WEBKIT_PATH 编译 WebKit)
#   4. rust nightly (nightly-2026-07-20, aarch64-linux-ohos) 预装于
#      ~/.rust-nightly/nightly-2026-07-20 (已签名, 持久目录);
#      rust-toolchain.toml 里的 channel 只影响裸 cargo, 构建用 RUST_HOME 硬钉
#   5. ICU 用 OHOS libc++ (std::__n1) 编译, 由 libc++_static.a 真实解析, 无需 shim
#
# 产物: build/release/bun (已签名, 直接运行)
#===============================================================================

set -euo pipefail

# ─── 色彩 ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ─── 路径 ─────────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUN="${BUN:-/storage/Users/currentUser/.bun/bun}"

HOMEBREW_PREFIX="/storage/Users/currentUser/.harmonybrew"
LLVM_HOME="$HOMEBREW_PREFIX/opt/llvm"
LLD_HOME="$HOMEBREW_PREFIX/opt/lld"
OHOS_SDK="$HOMEBREW_PREFIX/opt/ohos-sdk"
# Use the stable `opt/` symlink, not a versioned Cellar path: upgrading
# ohos-sdk re-points opt/ and removes the old version dir, which broke every
# baked path when 26.0.0.18_1 -> _2 happened mid-build. An explicit
# OHOS_SYSROOT still wins, but a stale value that no longer exists falls back
# to the symlink instead of failing the configure.
SYSROOT="${OHOS_SYSROOT:-$HOMEBREW_PREFIX/opt/ohos-sdk/native/sysroot}"
[ -d "$SYSROOT/usr/include" ] || SYSROOT="$HOMEBREW_PREFIX/opt/ohos-sdk/native/sysroot"

# llvm 23 tools (llvm-nm, llvm-ar, ...) take precedence over the LLVM 15 that
# ships with the OHOS SDK: scripts/build/tools.ts requires clang/llvm in the
# >=23.1.0 <23.1.99 range, so the brew keg has to win.
export PATH="$LLVM_HOME/bin:$LLD_HOME/bin:$PATH"

WEBKIT_SRC="${WEBKIT_SRC:-/storage/Users/currentUser/springsources/WebKit}"
WEBKIT_COMMIT=$(grep "export const WEBKIT_VERSION" "$REPO_ROOT/scripts/build/deps/webkit.ts" | head -1 | sed 's/.*"\([a-f0-9]\{40\}\)".*/\1/')
[ -z "$WEBKIT_COMMIT" ] && { err "无法从 scripts/build/deps/webkit.ts 解析 WEBKIT_VERSION"; exit 1; }

# ICU: brew icu4c@78 (OHOS 原生安装, 与上游 bundled ICU 78.3 一致)。
# 原生编译直接用 brew 的库/头文件/工具, 无需 build/ohos-icu 交叉构建。
# 保留 build/ohos-icu 布局 (target + host/bin) 以兼容 webkit.ts 的路径期望,
# 内容为指向 brew 的符号链接。
ICU_BREW="${ICU_BREW:-$HOMEBREW_PREFIX/opt/icu4c}"
ICU_DIR="$REPO_ROOT/build/ohos-icu"
ICU_TARGET="$ICU_DIR/target"
ICU_LIB="$ICU_TARGET/lib"
OUTDIR="$REPO_ROOT/build/release"

# Rust nightly (CI 匹配版本)
# 安装位置: ~/.rust-nightly/nightly-<date>/ (避免 /data/storage/el2/base/tmp 被清理)
RUST_VER="nightly-2026-07-20"
RUST_HOME="${RUST_HOME:-$HOME/.rust-nightly/nightly-2026-07-20}"
RUST_READY="$RUST_HOME/BREW_SIGNED_OK"

# 已知的陈旧 libc++ ABI 命名空间 (mangled 前缀)。std 里没有以双下划线开头的
# 公开实体, 该前缀只会来自内联 ABI 命名空间, 不会误伤正常符号。
KNOWN_STALE_ABI_MARKERS="_ZNSt3__h"

export TMPDIR=/data/storage/el2/base/tmp
export SSL_CERT_FILE="$HOMEBREW_PREFIX/etc/ca-certificates/cert.pem"
export CURL_CA_BUNDLE="$SSL_CERT_FILE"

# ─── 阶段1: 环境检查 ────────────────────────────────────────────────────────
phase_check() {
  info "=== 环境检查 ==="
  local fail=0
  for cmd in "$BUN" cmake ninja git perl python3; do
    command -v "$cmd" &>/dev/null || { err "缺少: $cmd"; fail=1; }
  done
  [ -f "$LLVM_HOME/bin/clang" ]  || { err "brew llvm clang 未找到 (brew install llvm)"; fail=1; }
  [ -d "$LLVM_HOME/include/aarch64-linux-ohos/c++/v1" ] \
                                 || { err "llvm OHOS libc++ 头文件未找到"; fail=1; }
  [ -f "$LLD_HOME/bin/ld.lld" ]  || { err "brew lld 未找到 (brew install lld)"; fail=1; }
  [ -d "$SYSROOT/usr/include" ]  || { err "ohos-sdk sysroot 未找到"; fail=1; }
  command -v binary-sign-tool &>/dev/null || { err "binary-sign-tool 不在 PATH"; fail=1; }
  [ -f "$BUN" ]                  || { err "bootstrap bun 未找到: $BUN"; fail=1; }
  local missing_icu=0
  for lib in libicudata.a libicui18n.a libicuuc.a; do
    [ -f "$ICU_BREW/lib/$lib" ] || { err "brew ICU 库缺少: $ICU_BREW/lib/$lib (brew install icu4c@78)"; missing_icu=1; }
  done
  [ -f "$ICU_BREW/include/unicode/umachine.h" ] || { err "brew ICU 头文件缺少: $ICU_BREW/include/unicode"; missing_icu=1; }
  for tool in genrb genccode gencmn pkgdata; do
    found=""
    [ -f "$ICU_BREW/bin/$tool" ] && found="$ICU_BREW/bin/$tool"
    [ -f "$ICU_BREW/sbin/$tool" ] && found="$ICU_BREW/sbin/$tool"
    [ -z "$found" ] && { err "brew ICU 工具缺少: $tool"; missing_icu=1; }
  done
  [ "$missing_icu" = "1" ] && fail=1
  if [ "$fail" = "1" ]; then err "环境检查失败"; exit 1; fi
  ok "环境就绪"
}

# ─── 阶段2: Rust nightly 检查 ────────────────────────────────────────────────
phase_rust_nightly() {
  info "=== Rust nightly 检查 ==="

  if [ ! -f "$RUST_READY" ] || [ ! -f "$RUST_HOME/bin/rustc" ]; then
    err "Rust nightly $RUST_VER 未安装或未签名!"
    err "请手动安装:"
    err "  1. curl -fsSL 'https://static.rust-lang.org/dist/2026-07-20/rust-nightly-aarch64-unknown-linux-ohos.tar.gz' -o $TMPDIR/rust-tarballs/"
    err "  2. curl -fsSL 'https://static.rust-lang.org/dist/2026-07-20/rust-src-nightly.tar.gz' -o $TMPDIR/rust-tarballs/"
    err "  3. 解压 install.sh --prefix=$RUST_HOME"
    err "  4. binary-sign-tool 签名所有 ELF"
    err "  5. touch $RUST_READY"
    exit 1
  fi
  if [ ! -d "$RUST_HOME/lib/rustlib/src/rust/library" ]; then
    err "rust-src 未安装到 $RUST_HOME/lib/rustlib/src/"
    exit 1
  fi
  if ! readelf -S "$RUST_HOME/bin/rustc" 2>/dev/null | grep -q codesign; then
    err "rustc 未签名!"
    exit 1
  fi
  ok "Rust nightly $("$RUST_HOME/bin/rustc" --version) 就绪"
}

# ─── 阶段3: 准备 WebKit 源码 (编译由 build.ts --webkit=local + $BUN_WEBKIT_PATH 处理) ──
phase_webkit() {
  info "=== 准备 WebKit 源码 ==="

  if [ -d "$WEBKIT_SRC/.git" ]; then
    local current
    current=$(cd "$WEBKIT_SRC" && git rev-parse HEAD 2>/dev/null || true)
    if [ "$current" != "$WEBKIT_COMMIT" ]; then
      warn "WebKit 存在但不是目标 commit, 同步..."
      cd "$WEBKIT_SRC"
      git fetch --depth 1 origin "$WEBKIT_COMMIT" 2>&1 | tail -1
      git checkout "$WEBKIT_COMMIT"
    else
      ok "WebKit 已是目标 commit"
    fi
  else
    info "克隆 WebKit (depth=1)..."
    git clone --depth 1 https://github.com/oven-sh/WebKit.git "$WEBKIT_SRC"
    cd "$WEBKIT_SRC"
    git checkout "$WEBKIT_COMMIT"
  fi

  local perl_path
  perl_path=$(command -v perl 2>/dev/null || echo "$HOMEBREW_PREFIX/bin/perl")
  sed -i "s|\"perl\"|\"${perl_path}\"|g" \
    "$WEBKIT_SRC/Source/JavaScriptCore/inspector/scripts/generate-inspector-protocol-bindings.py" 2>/dev/null || true

  ok "WebKit 源码就绪: $WEBKIT_SRC ($WEBKIT_COMMIT)"
}

# ─── 阶段4: 构建布局 (build/ohos-icu, build/ohos-cross-libs) ──────────────
phase_setup_layout() {
  info "=== 设置构建布局 ==="

  # 4a: build/ohos-icu — 指向 brew icu4c@78 (原生安装) 的符号链接布局
  # webkit.ts 期望 ohosIcuDir="<prefix>/target" + hostBin="<prefix>/host/bin",
  # 所以保留该结构, 内容全部符号链接到 brew 安装 (原生编译, 无交叉构建)。
  rm -rf "$ICU_DIR"
  mkdir -p "$ICU_TARGET/include" "$ICU_TARGET/lib" "$ICU_DIR/host/bin"

  ln -sf "$ICU_BREW/include/unicode" "$ICU_TARGET/include/unicode" 2>/dev/null || true

  for lib in libicudata.a libicui18n.a libicuuc.a; do
    if [ -f "$ICU_BREW/lib/$lib" ]; then
      ln -sf "$ICU_BREW/lib/$lib" "$ICU_TARGET/lib/$lib"
    else
      err "brew ICU 库缺少: $ICU_BREW/lib/$lib"
      exit 1
    fi
  done

  for tool in genrb genccode gencmn pkgdata; do
    local t=""
    [ -f "$ICU_BREW/bin/$tool" ] && t="$ICU_BREW/bin/$tool"
    [ -f "$ICU_BREW/sbin/$tool" ] && t="$ICU_BREW/sbin/$tool"
    if [ -n "$t" ]; then
      ln -sf "$t" "$ICU_DIR/host/bin/$tool"
    else
      err "brew ICU 工具缺少: $tool"
      exit 1
    fi
  done

  # 4b: build/ohos-cross-libs — 指向 opt/llvm 的 OHOS libc++ (避免 musl 冲突)
  local cross="$REPO_ROOT/build/ohos-cross-libs"
  rm -rf "$cross"
  mkdir -p "$cross/libcxx/include" "$cross/libcxxabi" "$cross/libcxx/lib" "$cross/libcxxabi/lib" "$cross/libunwind/lib"

  ln -sf "$LLVM_HOME/include/aarch64-linux-ohos/c++/v1" "$cross/libcxx/include/v1"
  ln -sf "$LLVM_HOME/include/aarch64-linux-ohos/c++/v1" "$cross/libcxxabi/include"

  # OHOS 静态库链接映射:
  # - libc++ 的实际实现在 libc++_static.a (homebrew 的 libc++.a 是 38 字节空占位!)
  # - 链接时用 -lc++ 解析到 libc++_static.a 的真实实现
  for lib in libc++abi.a libunwind.a; do
    if [ -f "$LLVM_HOME/lib/aarch64-linux-ohos/$lib" ]; then
      ln -sf "$LLVM_HOME/lib/aarch64-linux-ohos/$lib" "$cross/libcxx/lib/$lib"
      ln -sf "$LLVM_HOME/lib/aarch64-linux-ohos/$lib" "$cross/libcxxabi/lib/$lib"
      ln -sf "$LLVM_HOME/lib/aarch64-linux-ohos/$lib" "$cross/libunwind/lib/$lib"
    fi
  done
  # libc++.a → libc++_static.a (真实实现)
  if [ -f "$LLVM_HOME/lib/aarch64-linux-ohos/libc++_static.a" ]; then
    ln -sf "$LLVM_HOME/lib/aarch64-linux-ohos/libc++_static.a" "$cross/libcxx/lib/libc++.a"
    ln -sf "$LLVM_HOME/lib/aarch64-linux-ohos/libc++_static.a" "$cross/libcxxabi/lib/libc++.a"
    ln -sf "$LLVM_HOME/lib/aarch64-linux-ohos/libc++_static.a" "$cross/libunwind/lib/libc++.a"
  fi

  ok "构建布局已设置 (ohos-cross-libs → llvm 23 OHOS)"
}

# ─── 阶段5: bun install ─────────────────────────────────────────────────────
phase_bun_install() {
  info "=== bun install ==="
  export PATH="$LLVM_HOME/bin:$PATH"

  cd "$REPO_ROOT"
  "$BUN" install 2>&1 | tail -3

  cd "$REPO_ROOT/src/node-fallbacks"
  "$BUN" install --frozen-lockfile 2>&1 | tail -3 || {
    warn "node-fallbacks install 失败, 尝试不带 frozen-lockfile..."
    "$BUN" install 2>&1 | tail -3
  }

  cd "$REPO_ROOT"
  ok "bun install 完成"

  # ─── 阶段5b: esbuild 补丁 (OHOS) ──────────────────────────────────────
  # esbuild 原生 ELF (npm 下载) 无法被 binary-sign-tool 签名, OHOS 内核
  # 拒绝 exec (EACCES, ninja code=126)。用 bun build 包装脚本替换原生
  # 二进制 (shell 脚本无需签名)。与本地 node_modules 的既有适配一致。
  phase_esbuild_patch() {
    info "=== esbuild 补丁 (bun-build wrapper) ==="
    local esb
    esb=$(readlink -f "$REPO_ROOT/node_modules/.bin/esbuild" 2>/dev/null)
    if [ -n "$esb" ] && [ -f "$esb" ]; then
      cat > "$esb" << 'ESBUILD'
#!/bin/sh
# Use bun build as esbuild replacement
# Strip esbuild-specific flags that bun build doesn't support
args=""
for a in "$@"; do
  case "$a" in
    --target=esnext|--target=es2020|--target=es2015|--target=es2017|--target=es2018|--target=es2019|--target=es2021|--target=es2022)
      # bun build doesn't support esnext/esXXXX targets, use --target=browser
      args="$args --target=browser"
      ;;
    --platform=node)
      args="$args --target=node"
      ;;
    --platform=browser)
      args="$args --target=browser"
      ;;
    --format=iife|--format=esm|--format=cjs)
      args="$args $a"
      ;;
    '--define:process.env.NODE_ENV="production"'|"--define:process.env.NODE_ENV=\"production\"")
      args="$args --define.process.env.NODE_ENV=\"production\""
      ;;
    --define:*)
      args="$args $a"
      ;;
    '--external:/bun:*')
      args="$args --external /bun/*"
      ;;
    --external:*)
      args="$args $a"
      ;;
    --minify)
      args="$args --minify"
      ;;
    --bundle)
      # bun build bundles by default
      ;;
    --outfile=*)
      args="$args $a"
      ;;
    --outdir=*)
      args="$args $a"
      ;;
    *)
      args="$args $a"
      ;;
  esac
done
exec /storage/Users/currentUser/.bun/bun build $args
ESBUILD
      chmod 755 "$esb"
      ok "esbuild 已替换为 bun-build wrapper: $esb"
    else
      warn "esbuild 二进制未找到, 跳过补丁"
    fi
  }
}

# ─── 阶段6: 构建环境变量 ───────────────────────────────────────────────────
phase_set_env() {
  info "=== 设置构建环境 ==="

  local bin_dir="$REPO_ROOT/.bin"
  mkdir -p "$bin_dir"

  # CC/CXX: Homebrew cc/c++ shims (llvm-gcc-compat → ohos-sdk clang, 子进程用)
  export CC="$HOMEBREW_PREFIX/bin/cc"
  export CXX="$HOMEBREW_PREFIX/bin/c++"

  # clang/clang++ wrapper (OHOS sysroot 用于 host 编译)
  cat > "$bin_dir/clang" << CLANG
#!/bin/sh
exec "$LLVM_HOME/bin/clang" --sysroot="$SYSROOT" "\$@"
CLANG
  chmod 755 "$bin_dir/clang"
  cat > "$bin_dir/clang++" << CLANGXX
#!/bin/sh
exec "$LLVM_HOME/bin/clang++" --sysroot="$SYSROOT" "\$@"
CLANGXX
  chmod 755 "$bin_dir/clang++"
  # brew 的 llvm 23 keg 不提供 aarch64-linux-ohos-clang* 三前缀链接; 补齐
  # (--target 在显式传参时被覆盖, 值相同无副作用)
  cat > "$bin_dir/aarch64-linux-ohos-clang" << CROSS
#!/bin/sh
exec "$LLVM_HOME/bin/clang" --target=aarch64-linux-ohos --sysroot="$SYSROOT" "\$@"
CROSS
  chmod 755 "$bin_dir/aarch64-linux-ohos-clang"
  cat > "$bin_dir/aarch64-linux-ohos-clang++" << CROSSXX
#!/bin/sh
exec "$LLVM_HOME/bin/clang++" --target=aarch64-linux-ohos --sysroot="$SYSROOT" "\$@"
CROSSXX
  chmod 755 "$bin_dir/aarch64-linux-ohos-clang++"

  # strip → llvm-strip
  ln -sf "$LLVM_HOME/bin/llvm-strip" "$bin_dir/strip" 2>/dev/null || true

  # PATH: .bin → nightly rust → llvm 23 → lld 23 → harmonybrew
  export PATH="$bin_dir:$RUST_HOME/bin:$LLVM_HOME/bin:$LLD_HOME/bin:$HOMEBREW_PREFIX/bin:$HOME/.cargo/bin:$PATH"

  # LD_LIBRARY_PATH (lld 依赖 libxml2/zlib, cargo 链接 openssl@3)
  export LD_LIBRARY_PATH="$HOMEBREW_PREFIX/opt/libxml2/lib:$HOMEBREW_PREFIX/opt/zlib/lib:$HOMEBREW_PREFIX/opt/openssl@3/lib:$LLVM_HOME/lib"

  # Rust 环境变量
  # CARGO_HOME: 统一使用 ~/.cargo (持久目录, 避免 /tmp 被清理;
  # 与系统默认 cargo 缓存合并, 避免重复下载 crate)
  export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
  mkdir -p "$CARGO_HOME"
  export RUSTUP_HOME="$RUST_HOME"
  export RUSTUP_TOOLCHAIN="$RUST_VER"
  # RUSTC: cargo resolves rustc via PATH, where harmonybrew's stable rust
  # (1.97.1) precedes RUST_HOME/bin in some shells → cargo would pick the
  # stable rustc and fail with "option Z is only accepted on the nightly
  # compiler" (and -Zbuild-std would pull stable rust-src). Pin it so the
  # nightly toolchain is used deterministically.
  export RUSTC="$RUST_HOME/bin/rustc"

  # OHOS 专用
  export OHOS_LLVM_PREFIX="$LLVM21"
  export BUN_WEBKIT_PATH="$WEBKIT_SRC"
  export OHOS_BUN_SIGNING_LINKER="$CXX"
  export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_OHOS_LINKER="$CXX"

  # 并行度: 默认 nproc, 可用 NINJA_JOBS 覆盖
  export NINJA_JOBS="${NINJA_JOBS:-$(nproc)}"

  # cargo sparse protocol
  mkdir -p "$HOME/.cargo"
  cat > "$HOME/.cargo/config.toml" << 'CARGO'
[registries.crates-io]
protocol = "sparse"
[net]
git-fetch-with-cli = true
retry = 3
CARGO

  ok "构建环境已设置 (CC=$CC, rustc=$("$RUST_HOME/bin/rustc" --version))"
}

# ─── 阶段6b: 扫描陈旧 ABI 对象 ────────────────────────────────────────────
# 背景: 2026-08-22 发现 obj/ 里混有早期用 OHOS SDK libc++ 头文件编译的对象
# (ABI 命名空间 std::__h), 与统一工具链 llvm@21 的 std::__n1 不一致, 且无任何
# 输入库提供 __h 符号 → 链接出 undefined symbol、产物运行时 Error relocating。
# ninja 因源文件未变不会重编这些坏对象。此处在每次构建启动时按 ABI 命名空间
# 归档签名 (_ZNSt<长度>__<命名空间>) 全量比对, 删除任何"好/坏命名空间集之外"
# 的对象迫使 ninja 重编。平台 grep 对二进制文件不可靠, 用 python3 读字节。
phase_scan_stale_abi() {
  local obj_dir="$OUTDIR/obj"
  [ -d "$obj_dir" ] || { info "obj/ 不存在, 跳过陈旧 ABI 扫描"; return 0; }
  command -v python3 >/dev/null || { warn "无 python3, 跳过陈旧 ABI 扫描"; return 0; }

  # 从两份 libc++_static.a 提取各自的 ABI 命名空间集合。
  # 统一工具链 (llvm@21) 的集合 = 好; SDK 有而 llvm@21 没有的 = 坏。
  # 另外始终内置已知的历史坏命名空间 (_ZNSt3__h): 2026-08 中旬某套已更换的
  # 工具链用 __h 编译过 vendor 对象导致链接失败; 当前 SDK/llvm@21/设备
  # libc++_shared.so 已全部是 __n1, 推导法拿不到它, 必须硬编码兜底。
  local good_ns bad_ns
  good_ns=$(nm -o "$LLVM_HOME/lib/aarch64-linux-ohos/libc++_static.a" 2>/dev/null \
    | grep -oE '_ZNSt[0-9]+__[a-z0-9]+' | sort -u)
  bad_ns=$(nm -o "$OHOS_SDK/native/llvm/lib/aarch64-linux-ohos/libc++_static.a" 2>/dev/null \
    | grep -oE '_ZNSt[0-9]+__[a-z0-9]+' | sort -u \
    | comm -23 - <(printf '%s\n' "$good_ns") || true)
  # 合并硬编码兜底标记, 并校验格式 (只收 _ZNSt<长度>__<小写命名空间> 形式)
  bad_ns="$(printf '%s\n' "$bad_ns" "$KNOWN_STALE_ABI_MARKERS" | grep -E '^_ZNSt[0-9]+__[a-z0-9]+$' | sort -u)"
  if [ -z "$good_ns" ] || [ -z "$bad_ns" ]; then
    info "未能确定 libc++ ABI 命名空间差异, 跳过陈旧 ABI 扫描"
    return 0
  fi

  STALE_ABI_LIST="$(mktemp)"
  if ! GOOD_NS="$good_ns" BAD_NS="$bad_ns" OBJ_DIR="$obj_dir" LIST="$STALE_ABI_LIST" python3 <<'PYEOF'
import os
bad_markers = [m.encode() for m in os.environ["BAD_NS"].split()]
obj_dir = os.environ["OBJ_DIR"]
count = 0
with open(os.environ["LIST"], "w") as out:
    for root, _, files in os.walk(obj_dir):
        for f in files:
            if not f.endswith(".o"):
                continue
            p = os.path.join(root, f)
            with open(p, "rb") as fh:
                data = fh.read()
            if any(m in data for m in bad_markers):
                out.write(p + "\n")
                count += 1
print(f"[INFO]  扫描完成: {count} 个对象引用非统一 ABI 命名空间")
PYEOF
  then
    err "陈旧 ABI 扫描失败"
    rm -f "$STALE_ABI_LIST"
    return 1
  fi

  local n
  n=$(wc -l < "$STALE_ABI_LIST")
  if [ "$n" -eq 0 ]; then
    ok "陈旧 ABI 扫描通过 (无混用对象)"
    rm -f "$STALE_ABI_LIST"
    return 0
  fi

  warn "发现 $n 个使用非统一工具链 ABI 命名空间的对象:"
  sed 's|'"$REPO_ROOT"'|.|' "$STALE_ABI_LIST" | while read -r f; do warn "  $f"; done

  if [ -n "${DRY_RUN:-}" ]; then
    warn "DRY_RUN=1, 不删除"
    rm -f "$STALE_ABI_LIST"
    return 0
  fi
  xargs rm -f < "$STALE_ABI_LIST"
  rm -f "$STALE_ABI_LIST"
  ok "已清除陈旧 ABI 对象, ninja 将用 llvm@21 重编它们"
}

# ─── 阶段7: 构建 Bun ───────────────────────────────────────────────────────
phase_build() {
  info "=== 构建 Bun (scripts/build.ts) ==="

  cd "$REPO_ROOT"
  mkdir -p "$OUTDIR"

  local cache_dir="$HOME/.bun/build-cache"
  mkdir -p "$cache_dir"

  # build-script 签名工具 (OHOS 内核拒绝 exec 未签名 ELF)
  sign_build_scripts() {
    local rust_target="$OUTDIR/rust-target"
    find "$rust_target/release/build" -name "build-script-build" -type f 2>/dev/null | while read -r f; do
      if ! readelf -S "$f" 2>/dev/null | grep -q codesign; then
        local tmp_f="${f}.unsigned"
        mv "$f" "$tmp_f" 2>/dev/null && \
        binary-sign-tool sign -selfSign 1 -inFile "$tmp_f" -outFile "$f" >/dev/null 2>&1 && \
        chmod 755 "$f" 2>/dev/null
        rm -f "$tmp_f" 2>/dev/null
      fi
    done
    # 清除 stamp 迫使 cargo 重跑 build-script
    find "$rust_target/release/build" -name "output" -type f 2>/dev/null | while read -r stamp; do
      rm -f "$stamp" 2>/dev/null
    done
  }

  local attempt=0
  local max_attempts=10
  while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))
    info "编译尝试 #$attempt"

    # 1. 只 configure (生成 build.ninja), 不运行 ninja
    # LTO off: upstream now defaults ThinLTO on for every release build
    # (config.ts), which flips WebKit's CMAKE_BUILD_TYPE RelWithDebInfo ->
    # Release and invalidates the existing WebKit build dir. OHOS has never
    # been validated with LTO; keep the previous codegen.
    if ! "$BUN" scripts/build.ts \
      --profile=release \
      --os=ohos \
      --arch=aarch64 \
      --webkit=local \
      --lto=off \
      --cache-dir="$cache_dir" \
      --ohos-sdk-root="$OHOS_SDK" \
      --ohos-sysroot="$SYSROOT" \
      --configure-only \
      2>&1 | tee "$TMPDIR/build.log"; then
      err "configure 失败 (查看 $TMPDIR/build.log)"
      return 1
    fi

    # 2. 运行 ninja 编译 (并行度 NINJA_JOBS)
    if ninja -C "$OUTDIR" -j"$NINJA_JOBS" bun 2>&1 | tee "$TMPDIR/build.log"; then
      ok "编译成功!"
      return 0
    fi

    # 3. 检测可恢复错误 (Text file busy / Permission denied — build-script 签名问题)
    if grep -qaE "Text file busy|Permission denied|could not execute process" "$TMPDIR/build.log"; then
      warn "检测到 build-script 签名问题, 修复后重试..."
      sign_build_scripts
      sync
      sleep 1
    else
      err "编译失败, 非签名问题 (查看 $TMPDIR/build.log)"
      return 1
    fi
  done

  err "重试 $max_attempts 次后仍失败"
  return 1
}

# ─── 阶段9: 签名 ─────────────────────────────────────────────────────────
phase_sign() {
  info "=== 签名最终产物 ==="
  local binary="$OUTDIR/bun"
  [ -f "$binary" ] || binary="$OUTDIR/bun-profile"
  [ -f "$binary" ] || { err "产物不存在"; return 1; }

  local unsigned="$binary.unsigned"
  mv "$binary" "$unsigned"
  binary-sign-tool sign -selfSign 1 -inFile "$unsigned" -outFile "$binary"
  chmod 755 "$binary"
  rm -f "$unsigned"

  echo ""
  echo "  产物: $OUTDIR/bun"
  echo "  大小: $(ls -lh "$binary" | awk '{print $5}')"
  ok "签名完成"
}

# ─── 主流程 ─────────────────────────────────────────────────────────────────
main() {
  info "Bun OHOS aarch64 原生编译 (CI 模式)"
  info "仓库: $REPO_ROOT"
  info "WebKit: $WEBKIT_COMMIT"
  echo ""

  phase_check
  phase_rust_nightly
  phase_webkit
  phase_setup_layout
  phase_bun_install
  phase_esbuild_patch
  phase_set_env
  phase_scan_stale_abi
  phase_build
  phase_sign

  ok "全部完成! 运行: $OUTDIR/bun --version"
}

main "$@"
