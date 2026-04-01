#!/bin/bash
# build-ohos.sh - Bun OHOS 交叉编译构建脚本
#
# 使用方法:
#   ./scripts/build-ohos.sh [clean|configure|build|all]
#
# 依赖:
#   - OHOS SDK: ~/hmos-tools/sdk/default/openharmony/native/
#   - Zig (可选): /home/springmin/.local/bin/zig
#
# 参考: docs/OHOS_CROSS_COMPILE.md

set -e

# =============================================================================
# 配置
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$BUN_ROOT/build/ohos"

# OHOS SDK 路径
if [ -z "$OHOS_SDK_NATIVE" ]; then
    OHOS_SDK_NATIVE="$HOME/hmos-tools/sdk/default/openharmony/native"
fi

# 验证 SDK
if [ ! -d "$OHOS_SDK_NATIVE/llvm" ]; then
    echo "ERROR: OHOS SDK not found at $OHOS_SDK_NATIVE"
    echo "Set OHOS_SDK_NATIVE environment variable or install SDK"
    exit 1
fi

# 工具链路径
OHOS_LLVM="$OHOS_SDK_NATIVE/llvm"
OHOS_CC="$OHOS_LLVM/bin/aarch64-unknown-linux-ohos-clang"
OHOS_CXX="$OHOS_LLVM/bin/aarch64-unknown-linux-ohos-clang++"
OHOS_AR="$OHOS_LLVM/bin/llvm-ar"
OHOS_RANLIB="$OHOS_LLVM/bin/llvm-ranlib"

# 构建参数
CMAKE_BUILD_TYPE="${CMAKE_BUILD_TYPE:-Release}"
NPROC=$(nproc)

# =============================================================================
# 辅助函数
# =============================================================================
log_info() { echo -e "\033[32m[INFO]\033[0m $1"; }
log_warn() { echo -e "\033[33m[WARN]\033[0m $1"; }
log_error() { echo -e "\033[31m[ERROR]\033[0m $1"; }

check_toolchain() {
    log_info "验证 OHOS 工具链..."
    
    if [ ! -x "$OHOS_CC" ]; then
        log_error "编译器不存在: $OHOS_CC"
        exit 1
    fi
    
    # 显示版本
    log_info "Clang 版本:"
    "$OHOS_LLVM/bin/clang" --version | head -1
    
    # 验证 C++ 库
    if [ ! -f "$OHOS_LLVM/lib/aarch64-linux-ohos/libc++.a" ]; then
        log_error "libc++ 静态库不存在"
        exit 1
    fi
    
    log_info "工具链验证通过 ✓"
}

# =============================================================================
# 命令实现
# =============================================================================
do_clean() {
    log_info "清理构建目录: $BUILD_DIR"
    rm -rf "$BUILD_DIR"
    log_info "清理完成"
}

do_configure() {
    log_info "配置 Bun for OHOS..."
    
    mkdir -p "$BUILD_DIR"
    
    cmake -B "$BUILD_DIR" \
        -S "$BUN_ROOT" \
        -DCMAKE_TOOLCHAIN_FILE="$BUN_ROOT/cmake/toolchains/ohos-aarch64.cmake" \
        -DCMAKE_BUILD_TYPE="$CMAKE_BUILD_TYPE" \
        -DOHOS_BUILD=ON \
        -DWEBKIT_LOCAL=ON \
        -DWEBKIT_BUILD_TYPE="$CMAKE_BUILD_TYPE" \
        -G Ninja \
        "$@"
    
    log_info "配置完成"
}

do_build() {
    log_info "构建 Bun for OHOS..."
    log_info "并行任务数: $NPROC"
    
    if [ ! -d "$BUILD_DIR" ]; then
        log_error "构建目录不存在，请先运行 configure"
        exit 1
    fi
    
    cmake --build "$BUILD_DIR" -j"$NPROC"
    
    log_info "构建完成"
    show_build_info
}

show_build_info() {
    BUN_BIN="$BUILD_DIR/bun"
    
    if [ -f "$BUN_BIN" ]; then
        echo ""
        log_info "=== 构建产物信息 ==="
        echo "路径: $BUN_BIN"
        ls -la "$BUN_BIN"
        echo ""
        echo "文件类型:"
        file "$BUN_BIN"
        echo ""
        echo "动态依赖:"
        readelf -d "$BUN_BIN" 2>/dev/null || echo "(静态链接，无动态依赖)"
        echo ""
        log_info "构建成功! 🎉"
    else
        log_warn "构建产物未找到"
    fi
}

do_test_compile() {
    log_info "测试 OHOS 工具链..."
    
    TEST_SRC="/tmp/test_ohos_$$.cpp"
    TEST_OUT="/tmp/test_ohos_$$"
    
    cat > "$TEST_SRC" << 'EOF'
#include <iostream>
int main() {
    std::cout << "Hello from OHOS!" << std::endl;
    return 0;
}
EOF
    
    log_info "编译测试程序..."
    "$OHOS_CXX" -static -stdlib=libc++ -o "$TEST_OUT" "$TEST_SRC"
    
    log_info "编译结果:"
    file "$TEST_OUT"
    
    # 清理
    rm -f "$TEST_SRC" "$TEST_OUT"
    
    log_info "测试编译成功 ✓"
}

do_all() {
    check_toolchain
    do_clean
    do_configure
    do_build
}

# =============================================================================
# 主入口
# =============================================================================
usage() {
    cat << EOF
用法: $0 <命令> [选项]

命令:
    clean       清理构建目录
    configure   配置 CMake
    build       执行构建
    all         完整构建流程 (clean + configure + build)
    test        测试工具链编译
    info        显示配置信息

选项:
    -t, --type <type>     构建类型 (Debug/Release) [默认: Release]
    -j, --jobs <n>        并行任务数 [默认: nproc]
    -h, --help            显示帮助

环境变量:
    OHOS_SDK_NATIVE       OHOS SDK 路径
    CMAKE_BUILD_TYPE      构建类型

示例:
    $0 all                           # 完整构建
    $0 -t Debug configure build      # Debug 构建
    OHOS_SDK_NATIVE=/path/sdk $0 all # 指定 SDK 路径
EOF
}

# 解析参数
COMMAND=""
EXTRA_ARGS=()

while [ $# -gt 0 ]; do
    case "$1" in
        -t|--type)
            CMAKE_BUILD_TYPE="$2"
            shift 2
            ;;
        -j|--jobs)
            NPROC="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        clean|configure|build|all|test|info)
            COMMAND="$1"
            shift
            ;;
        *)
            EXTRA_ARGS+=("$1")
            shift
            ;;
    esac
done

# 执行命令
case "$COMMAND" in
    clean)
        do_clean
        ;;
    configure)
        check_toolchain
        do_configure "${EXTRA_ARGS[@]}"
        ;;
    build)
        do_build
        ;;
    all)
        do_all
        ;;
    test)
        check_toolchain
        do_test_compile
        ;;
    info)
        log_info "配置信息:"
        echo "  BUN_ROOT: $BUN_ROOT"
        echo "  BUILD_DIR: $BUILD_DIR"
        echo "  OHOS_SDK: $OHOS_SDK_NATIVE"
        echo "  CC: $OHOS_CC"
        echo "  CXX: $OHOS_CXX"
        echo "  BUILD_TYPE: $CMAKE_BUILD_TYPE"
        echo "  JOBS: $NPROC"
        ;;
    "")
        usage
        exit 1
        ;;
    *)
        log_error "未知命令: $COMMAND"
        usage
        exit 1
        ;;
esac
