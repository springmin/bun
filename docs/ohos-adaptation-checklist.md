# OHOS (HarmonyOS) Bun 适配修改清单

> 基准版本: ohos-aarch64（持续合并上游，本清单最近一次校对 2026-09-17）
> 用途: merge 上游 oven/main 时，逐项检查上游改动是否触及以下适配点。
> 检查方法: `git diff <upstream>..HEAD -- <file>` 看该文件的上游改动是否与 OHOS 门控逻辑冲突。

---

## 一、OHOS 专属文件（上游完全没有，merge 不会冲突但需保留）

| 路径 | 用途 |
|---|---|
| `scripts/ohos/build-bun-ohos-native.sh` | 原生编译脚本（brew llvm 23 + lld 23 工具链、签名） |
| `scripts/ohos/build-bun-ohos.sh` | 交叉编译脚本（CI 模式） |
| `scripts/ohos/build-bun-ohos.sh` / `run-all-official*.sh` / `patch-node-gyp.sh` | 构建/测试辅助（`build.sh`/`prepare-cross-libs.sh` 于 2026-09-16 删除：旧 SDK 布局 + 已废弃） |
| `scripts/ohos/run-all-official-progress-optimized.sh` | runner 的 PATH 追加 `/system/bin`：设备工具（`mkfifo` 等）不在默认 PATH，`module-graph-isolation` 的 fixture 需要 mkfifo | 上游新增依赖系统工具的 fixture 时检查 |
| `src/ohos_sign/` | 纯字节签名库（descriptor/merkle/sha256、`sign_selfsign*`、`strip_codesign`、`is_validly_signed`、`is_elf64`）——**无 I/O、零依赖**（是 `bun_sys` 的依赖，不能反向依赖它） |
| `src/sys/ohos_sign_io.rs` | 文件级签名 I/O（bun_sys，OHOS-only）：`ensure_signed_inplace`（(dev,ino,size,mtime) 缓存 + `is_validly_signed` 校验，仅失效才重签；4 字节 magic 先探，脚本不被整读）、temp+rename 写（兼容执行后不可变 inode）、`ohos_ensure_elf_signed` FFI |
| `src/runtime/api/bun/ohos_node_userinfo.rs` | node:os userInfo 沙箱 uid 适配 |
| `src/install_types/resolver_hooks.rs` | OHOS 的 npm `os` 匹配 `CURRENT = LINUX`：`process.platform` 是 "linux" 且 libc 是 musl（同 Alpine），linux 声明的包必须继续匹配；**必须是单一 bit**（两 bit 会让 `os:["!linux"]` 仍经 openharmony 命中）；`openharmony` 名字保留在映射表 | 上游改 OperatingSystem/CURRENT 时检查；勿改回纯 OPENHARMONY（fixture 声明 os:[linux] 的上游 install 测试与真实包都会挂） |
| `patches/zstd/ohos-qsort-r.patch` | zstd qsort_r 适配 |
| `scripts/ohos/libcxx23-c-headers/` | LLVM 23.1.1 官方源码里的 12 个 libc++ C 兼容头（`string.h`/`wchar.h`/`errno.h`/`math.h`/`stdatomic.h`/`stdio.h`/`stdlib.h`/`uchar.h`/`wctype.h`/`complex.h`/`tgmath.h`/`__mbstate_t.h`）。brew 的 llvm ≥22 不再安装它们，而 libc++ 23 的 `<cstring>`/`<cwchar>` 仍要求，构建时叠加进 `build/ohos-cross-libs/libcxx/include/v1` |
| `.github/workflows/build-bun-ohos-native.yml` / `ohos-build-rust.yml` / `ohos-build-incremental.yml` | OHOS CI（`ohos-build.yml` 已删除） |
| `test/js/bun/spawn/spawn-ohos-node-userinfo.test.ts` | 对应测试 |

## 二、构建系统 OHOS 适配（scripts/build/*.ts + webkit.ts）

| 文件 | 适配内容 | merge 检查点 |
|---|---|---|
| `scripts/build/deps/webkit.ts` | **13 处 cfg.ohos**：prebuilt URL、ICU 库名、**cmake 配置块**（`CMAKE_SYSTEM_NAME: "Linux"`、CMAKE_FIND_ROOT_PATH/ohosSysroot、ICU_ROOT/ohosIcuDir、`CMAKE_SYSTEM_PROCESSOR: "aarch64"`、静态 JSC 等） | ⚠️ **上游 webkit.ts 无任何 ohos 引用**——上游改 cmake 参数时需检查 OHOS 块是否仍兼容；**WEBKIT_VERSION 升级时需重新构建并验证 OHOS** |
| `scripts/build/flags.ts` | `-fno-pic/-fno-pie/-no-pie` 对 OHOS 跳过（PIE 需要） | 上游改 flags 逻辑时检查 |
| `scripts/build/rust.ts` | OHOS target 的 RUSTUP_HOME/CARGO_HOME 持久化 | 上游改 rust 构建时检查 |
| 工具链（brew） | `opt/llvm` 23.1.1（OHOS libc++，ABI `std::__n1`）+ keg-only `opt/lld` 23；`ohos-sdk` 与 llvm 主 formula 冲突已 unlink（`cc/c++` shims 走绝对路径，不受影响）；构建脚本在 `.bin` 补齐 `aarch64-linux-ohos-clang*` 三前缀 | 上游 bump LLVM 必须同步安装对应版本：`tools.ts` 的 `LLVM_VERSION_RANGE` 是硬约束 |
| `scripts/build/workarounds.ts` | "ohos-node-userinfo-preload" 等 | 上游改 preload 机制时检查 |
| `src/spawn/process.rs` `WaiterThreadPosix::prewarm()` + `src/runtime/bin_entry/mod.rs` | OHOS 强制 waiter 线程，其 eventfd 原先在**首次 spawn 才创建**，使调用方的 FD 基线（`/proc/self/fd` 差值）在场景中多 1：`module-graph-isolation` 的 `leftOpen` 与 `module-graph-workers` 的 `fdsAboveBaseline` 因此确定性失败（6 例）。修复：启动时 `prewarm()` 只创建 eventfd 不启线程（仍然在首次 spawn 时启线程）| 上游改 waiter 线程/事件循环初始化时检查；`module-graph-isolation/workers` 必须保持全通过 |
| `test/js/bun/module-graph/module-graph-{isolation,workers}.test.ts` | fixture 的 FD 基线过滤**平台 socket**：OHOS 系统预载的 DFX 处理器（`libdfx_signalhandler.z.so`）在 **JSC 首次投递 SIGPWR**（GC 线程挂起信号，忙 worker 被 terminate 时）惰性连接 `/dev/unix/socket/hilogInput`（另见 faultloggerd），客户端 socket 随后常驻——`getpeername` 可确认对端路径。它不是 graph 的资源，故 `fds()`/`descriptors()` 用 `bun:ffi` 的 `getpeername` 排除对端为 `/dev/unix/socket/*` 的 fd（仅当 `/dev/unix/socket/hilogInput` 存在时启用；Linux/macOS 走原逻辑）| 上游改 fixture 的 FD 计数或 OHOS DFX 行为变化时复测；两文件现 479/412 全通过 |
| `src/runtime/napi/libc_check.rs` | OHOS 保留 glibc-addon 预检查（`IS_MUSL` 在 OHOS 为 true）：glibc 链接的 `.node` 在 OHOS 同样无法加载，应报 "linked against glibc" 而非 loader 的 Permission denied；提示语在 `BunProcess.cpp` 有 `#if defined(__OHOS__)` 专属分支 | 上游改该探测或其消息时检查两处分支 |
| `scripts/build.ts` / `bun.ts` / `config.ts` / `source.ts` / `shims.ts` / `tools.ts` / `deps/{cares,zstd}.ts` | OHOS 平台分支（工具链路径、依赖构建）；`bun.ts` 的 `systemLibs` 用**显式 `.a` 路径**链接本地 WebKit 的 OHOS ICU（`-licu*` 会优先 keg 里的 `.so`，把无 rpath 的 `DT_NEEDED libicu*.so.78` 烘进二进制） | 上游改构建管线/OHOS 库列表时检查 |
| OHOS 构建入口（`scripts/ohos/build-bun-ohos-native.sh`、`build-bun-ohos.sh`、`build.sh`、`.github/workflows/ohos-build-*.yml`） | 显式 `--lto=off`：上游 config.ts 把 ThinLTO 默认对所有 release 打开（原先只对 linux/darwin-cross/windows-cross），OHOS 从未用 LTO 验证过，且会翻转 WebKit 的 CMAKE_BUILD_TYPE（RelWithDebInfo→Release）使既有 WebKit 构建目录失效 | ⚠️ 上游再改 LTO 默认或 WebKit buildType 时重新评估 |
| `scripts/build/source.ts` | 依赖编译的 PIC 策略：OHOS 与 Android 一样必须 `-fPIC`（上游 #42556 把 `-fno-pic -fno-pie` 默认推广到所有 unix；OHOS 上非 PIC 依赖会让链接器发 R_AARCH64_COPY，OHOS musl 不填充这些 libc 数据 → 启动即 abort） | ⚠️ 上游改 PIC 策略/新增依赖时检查 |
| `rust-toolchain.toml` | nightly-2026-07-20（OHOS Tier3 需 build-std） | ⚠️ 上游 bump 时需确认 OHOS 可用 |
| `.rust-nightly-version` | nightly-2026-07-20 | 同上 |

## 三、spawn 管道机制（T50 内核 bug 适配）——⚠️ 最高风险区

**背景**：OHOS 内核 epoll 对 pipe/socketpair **永不报告 readable**（T50），但 `ioctl(FIONREAD)` 可见字节。所有读取需绕过 poll。

| 文件 | 适配内容 | merge 检查点 |
|---|---|---|
| `src/runtime/cli/multi_run.rs` | ① `ProcessHandle::start`（~237/253）：start 后 `deinit_poll_keep_fd()` 取消 epoll 注册 ② `drain_ohos_pipes`/`drain_one`（579/593）：raw `libc::read` 循环到 EAGAIN，EOF 靠 read=0；不再咨询 FIONREAD（其值从未被使用，且 ioctl 失败会导致该管道永不排空）；`drain_one` 返回是否有数据 ③ 主循环（1372）：`tick_without_idle` 非阻塞 tick + drain + 自适应 sleep（有数据 2ms，连续空转后 10ms） ④ `drain_and_close_pipes`（319-355）：OHOS 分支同步 raw drain + force-end | ⚠️ **上游已多次改动此文件**（#37206/#37286）：每次 merge 需确认 OHOS 门控保留且与新逻辑兼容（drain_and_close_pipes 的 OHOS 分支是"同步 drain 后再 force-end"，不能整体跳过也不能只用 BufferedReader::read） |
| `src/io/pipes.rs` | `PollOrFd::deinit_poll_keep_fd()`（pub，仅 OHOS multi_run 用） | 上游改 PollOrFd 时检查该方法保留 |
| `src/event_loop/MiniEventLoop.rs` | `tick_without_idle` 改 `pub`（OHOS multi_run 跨 crate 调用） | ⚠️ 上游是 `pub(crate)`——上游改回 pub(crate) 会破坏 OHOS 编译 |
| `src/runtime/cli/filter_run.rs` | ① `--workspaces/--filter` 的 pipe_setup（SOCKET|NONBLOCKING flags）② **OHOS T50 排空（2026-09-17 按 multi_run 补齐）**：启动后 `deinit_poll_keep_fd`（反注册 poll，tick 直读是唯一 reader）、主循环 `tick_without_idle` + `drain_ohos_pipes`/`drain_one` 原始 fd 直读到 EAGAIN（EOF 做 `remaining_fds` 记账 + `maybe_finish`）、退出路径先排空 fd 再 force-end | 上游改 filter_run 的 drain/event-loop 时检查；`test/cli/run/filter-workspace.test.ts` 必须保持全通过（LLVM23 构建中曾因旧「跳过」实现丢输出 23 失败） |
| `src/runtime/api/bun/spawn/stdio.rs` | `can_use_memfd`/`use_memfd` OHOS 返回 false（memfd 写入对 fstat 不可见 + 子进程崩溃） | ⚠️ 上游若改 memfd 逻辑，OHOS 必须保持禁用 |
| `src/sys/lib.rs` `can_use_memfd` | OHOS 全局禁用 memfd（`excluded even though memfd_create works`） | 同上，sys 层统一门控 |
| `src/spawn_sys/spawn_process.rs` | ① memfd fast-path 三处 `not(target_env="ohos")`（CStr import、'stdio label、use_memfd 块）→ OHOS 回退 socketpair ② **shebang 手动解析**（1004-1090）：OHOS 上 exec 脚本时手动读 shebang 构造 argv（内核 shebang 处理差异） | ⚠️ 上游改 spawn 时检查 memfd 门控 + shebang shim |
| `src/spawn_sys/lib.rs` | `waiter_thread_flag::SHOULD_USE_WAITER_THREAD` 在 OHOS 默认开启（2026-09-16 移植）：异步子进程退出走 pidfd + 共享 epoll 会丢唤醒——`Bun.serve` 服务 FIFO 响应 + `stop(true)` 之后 `Bun.spawn().exited` 永不 resolve、事件循环忙等、子进程成僵尸；独立 waiter 线程 `poll(eventfd)` 绕开共享循环 | ⚠️ 上游改 waiter 线程/pidfd 路径时检查默认值 |
| `src/install/PackageManager/PackageManagerLifecycle.rs` | lifecycle PATH 注入：前置 bun_dir + node_dir（`~/.harmonybrew/bin`）+ `NODE=bun`（411-445） | ⚠️ 上游改 PATH 注入时，OHOS 前置必须保留（测试 PATH="" 场景依赖） |
| `src/io/PipeWriter.rs` | F_SETPIPE_SZ 管道缓冲扩到 1MB（~283，每次写调用，待移到建管道时）；epoll-storm 检测器仅 OHOS 编译（163+） | 上游改 PipeWriter 时检查 |

## 四、syscall 层适配（src/sys/lib.rs + linux_syscall.rs）

| 位置 | 适配内容 | merge 检查点 |
|---|---|---|
| `fstat`（2117-2125） | **OHOS seccomp 对 pipe fd 的 fstat 返回 EACCES** → 返回 zeroed stat（否则 spawn 子进程初始化崩溃） | ⚠️ 上游改 fstat 时，OHOS EACCES→zeroed 分支必须保留 |
| `statx`（2183+） | OHOS 归入 musl/raw-syscall 分支（libc 无 statx wrapper） | 上游改 statx 时检查 cfg 分组 |
| `statx_fallback`（2369） | OHOS 的 EBADF 也触发 fallback（socket fd 上 statx 返回 EBADF），但**不再 latch** 全局禁用 statx（只有 ENOSYS/EOPNOTSUPP/EPERM/EINVAL 才禁用） | 同上 |
| `getcwd`（2684） | OHOS hmdfs 缓存已删 cwd → stat(".") 探测 ENOENT | 上游改 getcwd 时检查 |
| `linkat`（~2710） | OHOS 沙箱拒绝硬链接（hmdfs EACCES、/storage EPERM）→ **源码内字节复制回退**（`linkat_copy_fallback`，`#[cfg(target_env="ohos")]`；2026-09-16 起替代已删除的 LD_PRELOAD shim 的 `linkat` interpose）；复制产物 inode 不同，`EEXIST/ENOENT/目录 EPERM` 语义保持 | ⚠️ 上游改 linkat 时检查回退仍在，且 node_fs/install 调用点未被绕过 |
| `lchmod`（2955 附近） | **OHOS 无 fchmodat2（syscall 452 被 seccomp SIGSYS）** → 回退普通 chmod（bin 链接执行位依赖） | ⚠️ 上游改 lchmod 时，OHOS 回退必须保留（node-gyp 测试依赖） |
| `src/sys/linux_syscall.rs` | OHOS syscall 包装差异（fstat/statx 等） | 上游改时检查 |
| `src/bun_core/env.rs` | `IS_MUSL = cfg!(musl \|\| ohos)`；另新增 `IS_OHOS`（`cfg(target_env = "ohos")`，用于 NAPI glibc 检查等需要区分 Alpine 的场景） | 上游改 env 检测时检查 |

## 五、CLI / 运行时代码适配

| 文件 | 适配内容 | merge 检查点 |
|---|---|---|
| `src/runtime/cli/run_command.rs` | ① 目录遍历 EACCES/EPERM 时 fallback HOME package.json（630-720）② **`bun node <file>`**：`IS_NODE_ARG` 检测 + exec_as_if_node 移除 "node" 占位 + 重解析 node flags（3077+） | ⚠️ 上游改 run_command 时，IS_NODE_ARG 逻辑和 OHOS 目录 fallback 必须保留（as-node 测试 11 个依赖） |
| `src/runtime/cli/mod.rs` | `IS_NODE_ARG` 静态标志 + which() 的 `first_arg_name == "node"` 分支 | 同上 |
| `src/runtime/ffi/ffi_body.rs` | aarch64 系统头/库路径：OHOS_SYSROOT → /system/include → /usr/include/aarch64-linux-gnu | 上游改 FFI 默认路径时检查 |
| `src/runtime/napi/napi_body.rs` | OHOS 的 V8 符号引用（Array::New/CpuProfiler::CollectSample，`NSt4__n1` 拼写）——由 `src/jsc/bindings/v8/V8CpuProfiler.cpp`/`V8Array.cpp` 用 OHOS libc++ 自然 mangling 提供；历史 `v8_stub.cpp`（`NSt3__1`）+ 链接注入机制已于 2026-09-16 删除（注入规则在上游 link rule 重构后不再匹配、stub 符号无引用） | 上游改 napi 引用 V8 符号时，确认 C++ 兼容层仍有对应实现 |
| `src/runtime/node/node_fs.rs` | `link` OHOS 走 `bun_sys::linkat`（继承复制回退），`fs.linkSync` 因此可用 | 上游改 node:fs link 时检查 |
| `src/jsc/bindings/v8/V8Array.cpp` | `__MUSL__` 条件（禁用 libstdc++ 拼写的 alias；OHOS libc++ 走 `NSt4__n1`） | 上游改 V8Array 时检查 |
| `src/jsc/bindings/highway_json.cpp` / `src/jsc/bindings/highway_sourcemap.cpp` / `src/jsc/bindings/highway_xml.cpp` | aarch64 SVE 禁用（`HWY_DISABLED_TARGETS`）——scalable SVE 缺符号 | 上游改 highway 时检查 |
| `src/jsc/bindings/webcore/MessagePort.h` / `src/jsc/bindings/webcore/MessagePort.cpp` | ~~`m_closeEventPending` leak fix~~ 该字段从未被置位（已清理）；保留 `m_closeEventDispatched` 的 pending-activity 逻辑 | 上游改 MessagePort 生命周期时检查 |
| `src/jsc/bindings/bun-spawn.cpp` | OHOS spawn 平台分支 | 上游改时检查 |
| `src/jsc/bindings/c-bindings.cpp` | close_range 的 `#if OS(LINUX)||OS(FREEBSD)` 块闭合 | 上游改 close_range 时检查 |
| `src/jsc/bindings/BunProcess.cpp` / `bun-spawn.cpp` | OHOS 平台分支 | 上游改时检查 |
| `src/install/PackageManager.rs` | node-gyp 的 CC/CXX 默认值（cc/c++，~1237）；**不再传 `-Wl,--code-sign`**（现有 ld.lld 都不接受；签名由 install/dlopen 时的 `bun_sys::ensure_signed_inplace` 负责） | ⚠️ 上游改 node-gyp 环境时，OHOS 默认编译器必须保留 |
| `src/install/PackageInstaller.rs` / `src/install/isolated_install.rs` / `src/install/isolated_install/Hardlinker.rs` | OHOS 文件系统/硬链接差异 | 上游改 install 时检查 |
| `src/resolver/lib.rs` / `src/resolver/resolver.rs` | OHOS 目录权限 fallback | 上游改 resolver 时检查 |
| `src/runtime/api/bun/js_bun_spawn_bindings.rs` | OHOS node userInfo env 注入（ohos_node_userinfo，1015） | 上游改 spawn env 时检查 |
| `src/runtime/shell/subproc.rs` | OHOS spawn 差异 | 上游改 shell 时检查 |
| `src/runtime/webcore/blob/read_file.rs` | OHOS 读文件差异 | 上游改 blob 时检查 |
| `src/spawn/process.rs` | OHOS watcher/pidfd 差异 | 上游改 spawn 时检查 |
| `src/crash_handler/lib.rs` | OHOS crash 处理 | 上游改时检查 |
| `src/dns/lib.rs` / `src/runtime/dns_jsc/dns.rs` | OHOS DNS | 上游改时检查 |
| `src/standalone_graph/StandaloneModuleGraph.rs` | OHOS 差异 | 上游改时检查 |
| `src/options_types/context.rs` | OHOS 差异 | 上游改时检查 |
| `src/runtime/bin_entry/mod.rs` | OHOS 入口差异（TMPDIR 回退等） | 上游改时检查 |
| `src/runtime/api.rs` | OHOS API 注册 | 上游改时检查 |

## 六、测试文件 OHOS 特判

| 文件 | 内容 | merge 检查点 |
|---|---|---|
| `test/cli/run/garbage-env.test.ts` | `isOhos`（BUN_OHOS / musl loader 探测）下 binary-sign-tool 签名 | 上游改该测试时检查 |
| `test/js/bun/spawn/spawn-ohos-node-userinfo.test.ts` | OHOS 专属测试 | 保留 |

### 六-1、全量测试收集逻辑差异（OHOS 脚本 vs 上游 CI）——2026-08-12 记录

**结论：全量脚本 `run-all-official-progress-optimized.sh` 只跑 ~2025 个文件，而上游 CI 跑 5848 个，二者定义不同，非 bug。差异几乎全部来自 Node 官方测试目录。**

| 维度 | 全量脚本（OHOS） | 上游 CI（`scripts/runner.node.mjs`） |
|---|---|---|
| 收集方式 | `bun -e` 递归遍历（精确复刻上游 isTest/isHidden，受 `SKIP_VENDORED_NODE_TESTS` 控制） | 递归扫描 + 目录特判 |
| 匹配规则 | 仅 `*.test.ts/js/tsx/jsx/mjs/cjs/mts/cts` + `*.spec.ts/tsx/js/cjs/mjs/cts` | `isJavaScript`（`.js/.ts/.jsx/.tsx/.mjs/.cjs/.mts/.cts`）+ 文件名含 `.test` 或 `spec.`，**或** `isNodeTest`，**或** `isClusterTest` |
| node 官方测试目录 | ❌ **不收** | ✅ **整个目录都收**：`js/node/test/parallel/`（3658 个）、`js/node/test/sequential/`（85 个）、`js/bun/test/parallel/`（83 个） |
| 默认排除 | 无 | `integration/bun-types`（22 个）+ `internal/source-lints` |
| 文件数 | **~2132**（2026-09-12 全量） | **5848**（CI 实际运行 5826） |

**原因**：Node 官方测试用 `test-*.js` 命名（无 `.test` 后缀），默认的 `SKIP_VENDORED_NODE_TESTS=1` 口径排除它们。OHOS 上测试比 Linux 慢 5-10x（7/21 全量：1868 files / 01:31:24 / 92 timeouts），加入 3658 个 node parallel 测试将使时长增至 5-6 小时且大量已知失败，故**有意排除**。

**若需完全对齐 CI**：把 3 个 node 目录加入 find（`-path "test/js/node/test/parallel/*"` 等），但 OHOS 上显著变慢。

---

## 六-2、无 LD_PRELOAD shim 行为矩阵（2026-09-16）

旧 `ohos_compat_shim.c`（LD_PRELOAD 符号 interpose）已删除。"完整去 shim"后每个曾由它补偿的行为都有源码级实现或确认无需；上游改动相关代码时查此表：

| 旧 shim 行为 | 现在由谁承担 | 守护测试 |
|---|---|---|
| `linkat` 硬链接回退 | `bun_sys::linkat` 的 `linkat_copy_fallback`（OHOS 字节复制） | `test/js/bun/util/ohos-fs-fallbacks.test.ts` |
| `symlinkat` | 设备原生支持（无需回退） | 同上 |
| `close_range` / `syscall` | `bun_close_range` 在 OHOS 返回 ENOSYS，调用点 `#if !defined(__OHOS__)` 走 close 循环 | spawn/fd 相关用例 |
| `fchmodat2`(452) | `sys/lib.rs` lchmod → `SYS_fchmodat` | node-gyp lifecycle |
| `getpwuid_r` | `ohos_node_userinfo`（注入 + `$USER/$LOGNAME` 回退）；遗留 `OHOS_COMPAT_SHIM_DISABLE` 开关已删除 | `test/js/bun/spawn/spawn-ohos-node-userinfo.test.ts` |
| `getcwd` | `bun_core::cwd_is_deleted_ohos`（`/proc/self/cwd` 探测） | deleted-cwd 用例 |
| `getaddrinfo` | 原生 DNS（loopback/ADDRCONFIG 对齐，T49） | T49 相关用例 |
| `tmpfile` | 启动期 `TMPDIR` 回退（`bin_entry`） | install 用例 |
| `splice` | 全仓无调用点，不需要 | — |
| `epoll_ctl`/`epoll_pwait`/`poll`/`ppoll`/`epoll_pipe` | T50 原生 workaround：multi_run drain / `deinit_poll_keep_fd` / `tick_without_idle`、Terminal `EPOLL_REARM_WATCH`、PipeWriter storm 检测 | `multi-run`、terminal 套件 |
| `close` | 仅 shim 内部簿记 | — |

## 七、merge 上游时的检查清单（按优先级）

### 🔴 必须人工验证（历史冲突/高风险）
1. **multi_run.rs** —— 上游每改一次都需重测 `multi-run.test.ts`（120+ 用例）+ 手动 parallel/sequential
2. **spawn_process.rs memfd 门控** —— 上游若改 memfd 逻辑，OHOS 必须禁用（uses-what-bin-slow SIGABRT 回归）
3. **sys/lib.rs lchmod** —— 上游若改 lchmod，OHOS 回退 chmod 必须保留（node-gyp 测试）
4. **PackageManagerLifecycle.rs PATH 注入** —— OHOS 前置 bun_dir/node_dir 必须保留（lifecycle 测试 PATH="" 场景）
5. **run_command.rs IS_NODE_ARG** —— `bun node` 支持（as-node 测试 11 个）
6. **webkit.ts** —— 上游版本号升级需重新构建验证；上游 cmake 改动需检查 OHOS 块

### 🟡 需检查（OHOS 门控存在但上游少动）
7. MiniEventLoop.rs `tick_without_idle` pub 可见性
8. filter_run.rs drain —— 2026-09-17 按 multi_run 补齐 T50 直读（见 §三 filter_run 行）；上游改 drain 逻辑时复测 `--filter/--workspaces`
9. MessagePort leak fix、highway SVE、V8Array、c-bindings
10. sys/lib.rs fstat/statx/getcwd/link
11. **工具链（LLVM/Rust nightly）** —— 上游 bump 时：`scripts/build/tools.ts` 的 `LLVM_VERSION_RANGE` 是硬约束（当前 `>=23.1.0 <23.1.99`），需要 brew 提供对应 LLVM（当前 llvm 23.1.1 + keg-only lld 23）；Rust 仍由脚本 `RUST_VER`/`RUST_HOME` 钉在 `nightly-2026-07-20`，与 `rust-toolchain.toml` 的 channel 解耦；`src/collections/*` 的 nightly 兼容层（`core_intrinsics`）保留，不随上游迁移到 `type_info` API

### 🟢 冲突概率低（上游不常动）
12. ffi_body 系统路径、node_fs link、PackageManager CC/CXX、其余

## 八、验证命令（merge 后必跑）

```bash
# 构建（脚本含 configure + 签名）
./scripts/ohos/build-bun-ohos-native.sh

# 核心回归（部署到 all-tests 后）
bun test test/cli/run/multi-run.test.ts            # 120+ 用例
bun test test/cli/run/as-node.test.ts              # 11 用例
bun test test/cli/install/bun-install-lifecycle-scripts.test.ts -t "node-gyp"  # 17 用例
# uwbs repro（memfd）
PATH="" bun install --no-save  # uses-what-bin-slow 场景
```

---

## 九、历史冲突记录（merge 教训）

| 上游 commit | 冲突 | 解决 |
|---|---|---|
| #37286 multi-run EOF fix | multi_run/filter_run drain_and_close_pipes | OHOS 分支同步 drain + force-end（不能整体跳过——detached 卡死；不能只 deinit——输出丢失） |
| #37228 WebKit bump | webkit.ts 无 OHOS 支持 | 保留 OHOS cmake 块 + 更新版本号；WebKit 源码用上游干净版 |
| c26e9d0aea c-bindings close_range | `#if` 块闭合 | 保留本地补丁 |
