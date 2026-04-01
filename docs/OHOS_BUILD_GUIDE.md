# Bun OHOS 交叉编译完全指南

> 从零开始构建 OHOS 版本 Bun 的完整自动化流程
>
> **更新日期**: 2026-03-31  
> **目标平台**: OpenHarmony / HarmonyOS aarch64  
> **Bun 版本**: 1.3.11-canary.1+e59a147d6  
> **OHOS SDK**: 5.0 Release (Clang 15.0.4)

---

## 目录

1. [环境准备](#1-环境准备)
2. [获取源码](#2-获取源码)
3. [应用 OHOS 补丁](#3-应用-ohos-补丁)
4. [配置构建](#4-配置构建)
5. [构建 WebKit](#5-构建-webkit)
6. [构建 Bun](#6-构建-bun)
7. [验证与测试](#7-验证与测试)
8. [打包发布](#8-打包发布)
9. [自动化脚本](#9-自动化脚本)
10. [常见问题](#10-常见问题)
11. [修改文件清单](#11-修改文件清单)

---

## 1. 环境准备

### 1.1 系统要求

- **操作系统**: Ubuntu 22.04+ / Debian 12+
- **架构**: x86_64 (交叉编译目标为 aarch64)
- **内存**: 至少 32 GB (WebKit 构建需要 16 GB+)
- **磁盘**: 至少 50 GB 可用空间
- **CPU**: 推荐 8 核以上

### 1.2 安装系统依赖

```bash
sudo apt update && sudo apt install -y \
    build-essential \
    cmake \
    ninja-build \
    pkg-config \
    python3 \
    python3-pip \
    git \
    curl \
    wget \
    unzip \
    autoconf \
    automake \
    libtool \
    bison \
    flex \
    gperf \
    gawk \
    ruby \
    ruby-dev \
    nodejs \
    npm \
    qemu-user \
    qemu-user-static \
    llvm-21 \
    clang-21 \
    lld-21
```

### 1.3 安装 Rust (lolhtml 需要)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup default stable
rustup target add aarch64-unknown-linux-ohos 2>/dev/null || true
```

### 1.4 安装 OHOS SDK

```bash
# 创建 SDK 目录
mkdir -p ~/hmos-tools/sdk

# 下载 OHOS SDK (以 5.0 Release 为例)
# 请从 OpenHarmony 官方渠道获取最新 SDK
SDK_URL="https://contentcenter-vali-drcn.dbankcdn.cn/pvt_2/DeveloperAlliance_package_901_9/openharmony/sdk/3rd/openharmony-sdk-5.0.0.61-linux_x86_64.zip"
wget -O ~/hmos-tools/openharmony-sdk.zip "$SDK_URL"

# 解压
cd ~/hmos-tools
unzip openharmony-sdk.zip

# 验证 SDK 安装
ls ~/hmos-tools/sdk/default/openharmony/native/llvm/bin/
# 应该看到: clang, clang++, ld.lld 等
```

### 1.5 配置环境变量

```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
export OHOS_SDK_NATIVE="$HOME/hmos-tools/sdk/default/openharmony/native"
export PATH="$OHOS_SDK_NATIVE/llvm/bin:$PATH"
export PATH="/usr/lib/llvm-21/bin:$PATH"
```

---

## 2. 获取源码

### 2.1 克隆 Bun 仓库

```bash
cd ~/sources
git clone https://github.com/oven-sh/bun.git
cd bun
```

### 2.2 初始化子模块

```bash
git submodule update --init --recursive
```

### 2.3 安装 Bun 依赖

```bash
# 使用系统 Bun 或 npm
npm install
```

---

## 3. 应用 OHOS 补丁

以下是所有需要修改的文件。每个修改都附带了完整的 patch 内容。

### 3.1 CMake 工具链文件 (新建)

**文件**: `cmake/toolchains/ohos-aarch64.cmake`

```cmake
# OHOS (OpenHarmony) aarch64 toolchain configuration for CMake
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_SYSTEM_VERSION 1)

set(ABI musl)
set(OHOS_BUILD ON CACHE BOOL "Building for OHOS platform")

# SDK path detection
if(NOT DEFINED OHOS_SDK_NATIVE)
    if(DEFINED ENV{OHOS_SDK_NATIVE})
        set(OHOS_SDK_NATIVE "$ENV{OHOS_SDK_NATIVE}")
    elseif(EXISTS "$ENV{HOME}/hmos-tools/sdk/default/openharmony/native")
        set(OHOS_SDK_NATIVE "$ENV{HOME}/hmos-tools/sdk/default/openharmony/native")
    else()
        message(FATAL_ERROR
            "OHOS SDK not found. Set OHOS_SDK_NATIVE environment variable."
        )
    endif()
endif()

message(STATUS "OHOS SDK: ${OHOS_SDK_NATIVE}")

set(OHOS_LLVM_DIR "${OHOS_SDK_NATIVE}/llvm")
set(LLD_PROGRAM "${OHOS_LLVM_DIR}/bin/ld.lld" CACHE INTERNAL "LLD linker path")

set(CMAKE_C_COMPILER "${OHOS_LLVM_DIR}/bin/aarch64-unknown-linux-ohos-clang")
set(CMAKE_CXX_COMPILER "${OHOS_LLVM_DIR}/bin/aarch64-unknown-linux-ohos-clang++")
set(CMAKE_AR "${OHOS_LLVM_DIR}/bin/llvm-ar")
set(CMAKE_RANLIB "${OHOS_LLVM_DIR}/bin/llvm-ranlib")
set(CMAKE_LINKER "${OHOS_LLVM_DIR}/bin/ld.lld")
set(CMAKE_STRIP "${OHOS_LLVM_DIR}/bin/llvm-strip")
set(CMAKE_OBJCOPY "${OHOS_LLVM_DIR}/bin/llvm-objcopy")
set(CMAKE_OBJDUMP "${OHOS_LLVM_DIR}/bin/llvm-objdump")

set(CMAKE_SYSROOT "${OHOS_SDK_NATIVE}/sysroot")
set(CMAKE_FIND_ROOT_PATH "${OHOS_SDK_NATIVE}/sysroot")
set(OHOS_LIB_DIR "${OHOS_LLVM_DIR}/lib/aarch64-linux-ohos")

set(CMAKE_C_FLAGS "--target=aarch64-linux-ohos -fPIC" CACHE STRING "" FORCE)
set(CMAKE_CXX_FLAGS "--target=aarch64-linux-ohos -stdlib=libc++ -fPIC" CACHE STRING "" FORCE)
set(CMAKE_EXE_LINKER_FLAGS "-static -L${OHOS_LIB_DIR}" CACHE STRING "" FORCE)
set(CMAKE_SHARED_LINKER_FLAGS "-static -L${OHOS_LIB_DIR}" CACHE STRING "" FORCE)

set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
set(CMAKE_CROSSCOMPILING ON CACHE BOOL "Cross-compiling for OHOS" FORCE)
set(CMAKE_C_COMPILER_WORKS ON)
set(CMAKE_CXX_COMPILER_WORKS ON)

set(OHOS_LIB_DIR "${OHOS_LIB_DIR}" CACHE INTERNAL "OHOS library directory")
set(OHOS_INCLUDE_DIR "${OHOS_SDK_NATIVE}/sysroot/usr/include" CACHE INTERNAL "OHOS include directory")
set(ICU_ROOT "${OHOS_SDK_NATIVE}/sysroot/usr" CACHE INTERNAL "ICU root directory")
set(ICU_INCLUDE_DIR "${OHOS_SDK_NATIVE}/sysroot/usr/include" CACHE INTERNAL "ICU include directory")
set(ICU_LIBRARY "${OHOS_SDK_NATIVE}/sysroot/usr/lib/aarch64-linux-ohos" CACHE INTERNAL "ICU library directory")
```

### 3.2 CMakeLists.txt

在 `include(Options)` 和 `include(CompilerFlags)` 之后添加：

```cmake
# For OHOS cross-compilation, add the toolchain compilers to CMAKE_ARGS
if(OHOS_BUILD)
    message(STATUS "Adding OHOS compilers to CMAKE_ARGS for dependency builds")
    list(APPEND CMAKE_ARGS -DCMAKE_C_COMPILER=${CMAKE_C_COMPILER})
    list(APPEND CMAKE_ARGS -DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER})
endif()
```

### 3.3 build.zig

在 `getTranslateC` 函数中，`translate_c.addIncludePath(b.path("vendor/zstd/lib"))` 之后添加：

```zig
// For OHOS cross-compilation, add sysroot include paths
if (target.result.os.tag == .linux and target.result.abi == .ohos) {
    if (b.graph.env_map.get("OHOS_SDK_NATIVE")) |ohos_sdk| {
        const sysroot = b.pathJoin(&.{ ohos_sdk, "sysroot" });
        translate_c.addSystemIncludePath(.{ .cwd_relative = b.pathJoin(&.{ sysroot, "usr", "include" }) });
        translate_c.addSystemIncludePath(.{ .cwd_relative = b.pathJoin(&.{ sysroot, "usr", "include", "aarch64-linux-ohos" }) });
    } else if (b.graph.env_map.get("HOME")) |home| {
        const default_sdk = b.pathJoin(&.{ home, "hmos-tools", "sdk", "default", "openharmony", "native" });
        const sysroot = b.pathJoin(&.{ default_sdk, "sysroot" });
        translate_c.addSystemIncludePath(.{ .cwd_relative = b.pathJoin(&.{ sysroot, "usr", "include" }) });
        translate_c.addSystemIncludePath(.{ .cwd_relative = b.pathJoin(&.{ sysroot, "usr", "include", "aarch64-linux-ohos" }) });
    }
}
```

### 3.4 cmake/Options.cmake

将 LINUX 部分的 ABI 检测修改为：

```cmake
if(LINUX)
    # Check for OHOS SDK first (highest priority)
    if(DEFINED ENV{OHOS_SDK_NATIVE} AND EXISTS "$ENV{OHOS_SDK_NATIVE}/llvm")
        set(DEFAULT_ABI "musl")
        set(DEFAULT_OHOS_BUILD ON)
        message(STATUS "Detected OHOS SDK at $ENV{OHOS_SDK_NATIVE}")
    elseif(EXISTS "$ENV{HOME}/hmos-tools/sdk/default/openharmony/native/llvm")
        set(DEFAULT_ABI "musl")
        set(DEFAULT_OHOS_BUILD ON)
        message(STATUS "Detected OHOS SDK at $ENV{HOME}/hmos-tools/sdk/default/openharmony/native")
    elseif(EXISTS "/etc/alpine-release")
        set(DEFAULT_ABI "musl")
        set(DEFAULT_OHOS_BUILD OFF)
    else()
        set(DEFAULT_ABI "gnu")
        set(DEFAULT_OHOS_BUILD OFF)
    endif()

    optionx(ABI "musl|gnu" "The ABI to use (e.g. musl, gnu)" DEFAULT ${DEFAULT_ABI})
    optionx(OHOS_BUILD BOOL "Build for OHOS platform" DEFAULT ${DEFAULT_OHOS_BUILD})
endif()
```

将 ASAN 检测修改为：

```cmake
if(DEBUG AND ((APPLE AND ARCH STREQUAL "aarch64") OR LINUX) AND NOT OHOS_BUILD)
    set(DEFAULT_ASAN ON)
    set(DEFAULT_VALGRIND OFF)
else()
    set(DEFAULT_ASAN OFF)
    set(DEFAULT_VALGRIND OFF)
endif()
```

将 TinyCC 检测修改为：

```cmake
if((WIN32 AND ARCH STREQUAL "aarch64") OR OHOS_BUILD)
    set(DEFAULT_ENABLE_TINYCC OFF)
else()
    set(DEFAULT_ENABLE_TINYCC ON)
endif()
```

### 3.5 cmake/CompilerFlags.cmake

将 debug symbols 部分修改为：

```cmake
if(DEFINED ENV{NIX_CC} OR OHOS_BUILD)
    register_compiler_flags(
        DESCRIPTION "Enable debug symbols (zlib-compressed for Nix/OHOS)"
        -g3 -gz=zlib ${DEBUG}
        -g1 ${RELEASE}
    )
else()
    register_compiler_flags(
        DESCRIPTION "Enable debug symbols (zstd-compressed)"
        -g3 -gz=zstd ${DEBUG}
        -g1 ${RELEASE}
    )
endif()
```

将 C23 extensions 部分修改为：

```cmake
if(OHOS_BUILD)
    register_compiler_flags(
        DESCRIPTION "Allow C23 extensions (OHOS compatible)"
        -Wno-c2x-extensions
    )
else()
    register_compiler_flags(
        DESCRIPTION "Allow C23 extensions"
        -Wno-c23-extensions
    )
endif()
```

### 3.6 cmake/tools/SetupLLVM.cmake

在 `find_llvm_command` 部分，`if(WIN32)` 之后添加 OHOS 分支：

```cmake
if(WIN32)
    find_llvm_command(CMAKE_C_COMPILER clang-cl)
    find_llvm_command(CMAKE_CXX_COMPILER clang-cl)
    # ... existing Windows code ...
elseif(DEFINED CMAKE_TOOLCHAIN_FILE AND CMAKE_TOOLCHAIN_FILE MATCHES "ohos")
    message(STATUS "OHOS toolchain detected, skipping LLVM compiler detection")
elseif(OHOS_BUILD)
    message(STATUS "OHOS_BUILD detected, using OHOS toolchain compilers")
    message(STATUS "CMAKE_C_COMPILER = ${CMAKE_C_COMPILER}")
    message(STATUS "CMAKE_CXX_COMPILER = ${CMAKE_CXX_COMPILER}")
    list(APPEND CMAKE_ARGS -DCMAKE_C_COMPILER=${CMAKE_C_COMPILER})
    list(APPEND CMAKE_ARGS -DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER})
    find_llvm_command_no_version(CMAKE_LINKER llvm-link)
    find_llvm_command_no_version(CMAKE_AR llvm-ar)
    find_llvm_command_no_version(CMAKE_RANLIB llvm-ranlib)
    find_llvm_command(LLD_PROGRAM ld.lld)
    list(APPEND CMAKE_ARGS -DCMAKE_EXE_LINKER_FLAGS=--ld-path=${LLD_PROGRAM})
    list(APPEND CMAKE_ARGS -DCMAKE_SHARED_LINKER_FLAGS=--ld-path=${LLD_PROGRAM})
else()
    find_llvm_command(CMAKE_C_COMPILER clang)
    find_llvm_command(CMAKE_CXX_COMPILER clang++)
    # ... existing Linux code ...
endif()
```

### 3.7 cmake/tools/SetupWebKit.cmake

在文件开头添加：

```cmake
if(OHOS_BUILD AND NOT WEBKIT_LOCAL)
    set(WEBKIT_LOCAL ON CACHE BOOL "Build WebKit locally for OHOS" FORCE)
    message(STATUS "OHOS build: Forcing WEBKIT_LOCAL=ON")
endif()
```

在 WebKit 本地构建配置中，Windows 分支之后添加 OHOS 分支（见上文完整 diff）。

在文件末尾添加：

```cmake
if(OHOS_BUILD)
    message(STATUS "OHOS build detected: WebKit must be built locally")
    if(NOT WEBKIT_LOCAL)
        set(WEBKIT_LOCAL ON CACHE BOOL "Build WebKit locally for OHOS" FORCE)
    endif()
    set(WEBKIT_SUFFIX "-ohos")
endif()
```

### 3.8 cmake/tools/SetupZig.cmake

将 Zig target 配置修改为：

```cmake
if(APPLE)
    set(DEFAULT_ZIG_TARGET ${DEFAULT_ZIG_ARCH}-macos-none)
elseif(WIN32)
    set(DEFAULT_ZIG_TARGET ${DEFAULT_ZIG_ARCH}-windows-msvc)
elseif(LINUX)
    if(OHOS_BUILD)
        set(DEFAULT_ZIG_TARGET ${DEFAULT_ZIG_ARCH}-linux-ohos)
        message(STATUS "Configured Zig for OHOS target: ${DEFAULT_ZIG_TARGET}")
    elseif(ABI STREQUAL "musl")
        set(DEFAULT_ZIG_TARGET ${DEFAULT_ZIG_ARCH}-linux-musl)
    else()
        set(DEFAULT_ZIG_TARGET ${DEFAULT_ZIG_ARCH}-linux-gnu)
    endif()
else()
    unsupported(CMAKE_SYSTEM_NAME)
endif()
```

### 3.9 cmake/targets/BuildBun.cmake

在文件开头添加：

```cmake
if(OHOS_BUILD)
    add_compile_definitions(__OHOS__)
endif()
```

在 PCH 部分修改为：

```cmake
if(NOT OHOS_BUILD AND (NOT CI OR (CI AND BUN_CPP_ONLY)))
    target_precompile_headers(${bun} PRIVATE
        "$<$<COMPILE_LANGUAGE:CXX>:${CWD}/src/bun.js/bindings/root.h>"
    )
endif()
```

在编译选项部分，将 `-Wno-c++23-lambda-attributes` 和 `-Wno-character-conversion` 包裹在条件中：

```cmake
if(NOT OHOS_BUILD)
    target_compile_options(${bun} PUBLIC
        -Wno-c++23-lambda-attributes
        -Wno-character-conversion
    )
endif()
```

在链接选项部分修改为：

```cmake
if(NOT ABI STREQUAL "musl")
    target_link_options(${bun} PUBLIC -static-libstdc++ -static-libgcc)
elseif(OHOS_BUILD)
    target_link_options(${bun} PUBLIC -lstdc++)
else()
    target_link_options(${bun} PUBLIC -lstdc++ -lgcc)
endif()
```

在 target_link_libraries 部分：

```cmake
if(LINUX)
    target_link_libraries(${bun} PRIVATE c pthread dl)
    if(NOT OHOS_BUILD)
        if(USE_STATIC_LIBATOMIC)
            target_link_libraries(${bun} PRIVATE libatomic.a)
        else()
            target_link_libraries(${bun} PUBLIC libatomic.so)
        endif()
    endif()
endif()
```

### 3.10 cmake/targets/BuildMimalloc.cmake

在 mimalloc 配置中添加 OHOS 分支：

```cmake
elseif(APPLE OR LINUX)
    if(APPLE)
        list(APPEND MIMALLOC_CMAKE_ARGS -DMI_OVERRIDE=OFF)
        list(APPEND MIMALLOC_CMAKE_ARGS -DMI_OSX_ZONE=OFF)
        list(APPEND MIMALLOC_CMAKE_ARGS -DMI_OSX_INTERPOSE=OFF)
    elseif(OHOS_BUILD)
        list(APPEND MIMALLOC_CMAKE_ARGS -DMI_OVERRIDE=OFF)
    else()
        list(APPEND MIMALLOC_CMAKE_ARGS -DMI_OVERRIDE=ON)
    endif()
```

### 3.11 cmake/targets/BuildLolHtml.cmake

在 Windows ARM64 分支之后添加：

```cmake
if(OHOS_BUILD)
    set(LOLHTML_TARGET aarch64-unknown-linux-ohos)
    list(APPEND LOLHTML_BUILD_ARGS --target ${LOLHTML_TARGET})
    set(LOLHTML_LIBRARY ${LOLHTML_BUILD_PATH}/${LOLHTML_TARGET}/${LOLHTML_BUILD_TYPE}/${CMAKE_STATIC_LIBRARY_PREFIX}lolhtml${CMAKE_STATIC_LIBRARY_SUFFIX})
    message(STATUS "lolhtml: Building for OHOS target: ${LOLHTML_TARGET}")
endif()
```

### 3.12 cmake/targets/BuildTinyCC.cmake

在文件开头添加早退出：

```cmake
if(OHOS_BUILD)
    message(STATUS "Skipping TinyCC for OHOS (x86/x86_64 only)")
    return()
endif()
```

### 3.13 源码修改

#### src/Global.zig

```zig
pub fn setThreadName(name: [:0]const u8) void {
    if (Environment.isLinux) {
        if (!Environment.isMusl) {
            _ = std.posix.prctl(.SET_NAME, .{@intFromPtr(name.ptr)}) catch 0;
        }
    } else if (Environment.isMac) {
        _ = std.c.pthread_setname_np(name);
    } else if (Environment.isWindows) {
        // ...
    }
}
```

#### src/bun.js/bindings/c-bindings.cpp

```cpp
extern "C" ssize_t bun_close_range(unsigned int start, unsigned int end, unsigned int flags)
{
#ifdef __OHOS__
    errno = ENOSYS;
    return -1;
#else
    return syscall(__NR_close_range, start, end, flags);
#endif
}

static void close_range_fallback(unsigned int start, unsigned int end)
{
    int maxfd = (end == ~0U) ? sysconf(_SC_OPEN_MAX) : (int)end;
    if (maxfd < 0 || maxfd > 65536) maxfd = 1024;
    for (int fd = (int)start; fd < maxfd; fd++) {
        close(fd);
    }
}

extern "C" void on_before_reload_process_linux()
{
    // ...
#ifdef __OHOS__
    close_range_fallback(3, ~0U);
#else
    bun_close_range(3, ~0U, CLOSE_RANGE_CLOEXEC);
#endif
    // ...
}
```

#### src/bun.js/bindings/bun-spawn.cpp

```cpp
static inline void closeRangeOrLoop(int start, int end, bool cloexec_only)
{
#if OS(LINUX) && !defined(__OHOS__)
    unsigned int flags = cloexec_only ? CLOSE_RANGE_CLOEXEC : 0;
    if (bun_close_range(start, end, flags) == 0) {
        return;
    }
#endif
    closeRangeLoop(start, end, cloexec_only);
}
```

#### src/bun.js/bindings/sqlite/sqlite3.c

在 `SQLITE_WASI` 分支之后添加：

```c
#elif defined(__OHOS__)
# undef HAVE_MREMAP
# define HAVE_MREMAP 0
```

#### src/napi/napi.zig

```zig
const posix_platform_specific_v8_apis = switch (bun.Environment.os) {
    .mac => struct {
        pub extern fn _ZN2v85Array3NewENS_5LocalINS_7ContextEEEmNSt3__18functionIFNS_10MaybeLocalINS_5ValueEEEvEEE() *anyopaque;
    },
    .linux => if (bun.Environment.isMusl) struct {
        pub extern fn _ZN2v85Array3NewENS_5LocalINS_7ContextEEEmNSt4__n18functionIFNS_10MaybeLocalINS_5ValueEEEvEEE() *anyopaque;
    } else struct {
        pub extern fn _ZN2v85Array3NewENS_5LocalINS_7ContextEEEmSt8functionIFNS_10MaybeLocalINS_5ValueEEEvEE() *anyopaque;
    },
    .windows => struct {},
    else => unreachable,
};
```

#### src/bun.js/bindings/Bindgen/IDLConvertBase.h

```cpp
#if defined(__OHOS__)
explicit constexpr LiteralConversionContext(WTF::ASCIILiteral name) : m_name(name) { }
#else
explicit consteval LiteralConversionContext(WTF::ASCIILiteral name) : m_name(name) { }
#endif
```

#### src/bun.js/bindings/BunIDLHumanReadable.h

```cpp
#if !defined(__OHOS__)
template<HasIDLHumanReadableName IDLElement>
void throwNotArray(JSC::JSGlobalObject& global, JSC::ThrowScope& scope) {
    // ...
}
#endif
```

#### src/bun.js/bindings/BunIDLConvertContext.h

```cpp
#if !defined(__OHOS__)
template<typename IDLElement>
JSC::EncodedJSValue throwNotArray(JSC::JSGlobalObject& global, JSC::ThrowScope& scope) {
    // ...
}
#endif
```

#### src/bun.js/bindings/ConcatCStrings.h

```cpp
#if defined(__OHOS__)
explicit constexpr ConcatCStrings(Args&&... args) : m_strings(std::forward<Args>(args)...) { }
#else
explicit consteval ConcatCStrings(Args&&... args) : m_strings(std::forward<Args>(args)...) { }
#endif
```

#### src/codegen/bindgenv2/internal/dictionary.ts

在生成的 C++ 代码中添加 `#if defined(__OHOS__)` 条件编译。

---

## 4. 配置构建

### 4.1 Release 构建（推荐）

```bash
cmake -B build/ohos-release -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE=cmake/toolchains/ohos-aarch64.cmake \
    -DCMAKE_BUILD_TYPE=Release
```

### 4.2 Debug 构建（用于调试）

```bash
cmake -B build/ohos-test -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE=cmake/toolchains/ohos-aarch64.cmake \
    -DCMAKE_BUILD_TYPE=Debug
```

---

## 5. 构建 WebKit

WebKit 构建是整个过程最耗时的部分（约 30-60 分钟）。

```bash
ninja -C build/ohos-release jsc
```

构建结果位于：

```
vendor/WebKit/WebKitBuild/Release/lib/libJavaScriptCore.a
vendor/WebKit/WebKitBuild/Release/lib/libWTF.a
vendor/WebKit/WebKitBuild/Release/lib/libbmalloc.a
```

---

## 6. 构建 Bun

### 6.1 完整构建

```bash
ninja -C build/ohos-release bun
```

构建步骤：

1. 编译所有 Zig 源码 → `bun-zig.o`（约 18 分钟，峰值内存 10 GB）
2. 链接 C++ 对象和 Zig 对象 → `bun-profile`
3. Strip 调试信息 → `bun`

### 6.2 构建产物

```
build/ohos-release/bun          # Release 版本 (~102 MB)
build/ohos-release/bun-profile  # 带调试符号的版本
```

---

## 7. 验证与测试

### 7.1 文件类型检查

```bash
file build/ohos-release/bun
# 输出: ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV), dynamically linked
```

### 7.2 QEMU 测试

```bash
# 版本检查
qemu-aarch64 build/ohos-release/bun --version
# 输出: 1.3.11

# JavaScript 执行
qemu-aarch64 build/ohos-release/bun -e 'console.log("Hello OHOS!")'
# 输出: Hello OHOS!

# 完整功能测试
qemu-aarch64 build/ohos-release/bun -e '
const arr = [1, 2, 3, 4, 5];
console.log("Map:", arr.map(x => x * 2));
console.log("Filter:", arr.filter(x => x > 2));
console.log("Reduce:", arr.reduce((a, b) => a + b, 0));
'
```

### 7.3 真机测试

将 `bun` 复制到 OHOS 设备：

```bash
# 通过 hdc 传输
hdc file send build/ohos-release/bun /data/local/tmp/bun
hdc shell chmod +x /data/local/tmp/bun

# 运行测试
hdc shell /data/local/tmp/bun --version
hdc shell /data/local/tmp/bun -e 'console.log("hello bun for ohos!")'
```

---

## 8. 打包发布

### 8.1 创建发布包

```bash
# 创建发布目录
mkdir -p bun-ohos-aarch64
cp build/ohos-release/bun bun-ohos-aarch64/
cp LICENSE bun-ohos-aarch64/

# 压缩
tar czf bun-ohos-aarch64-1.3.11.tar.gz bun-ohos-aarch64/
```

### 8.2 包内容

```
bun-ohos-aarch64/
├── bun          # 主可执行文件 (102 MB)
└── LICENSE      # 许可证
```

---

## 9. 自动化脚本

### 9.1 一键构建脚本

创建 `scripts/build-ohos.sh`：

```bash
#!/bin/bash
set -euo pipefail

# 配置
OHOS_SDK_NATIVE="${OHOS_SDK_NATIVE:-$HOME/hmos-tools/sdk/default/openharmony/native}"
BUILD_TYPE="${1:-Release}"
BUILD_DIR="build/ohos-${BUILD_TYPE,,}"

echo "=== Bun OHOS 交叉编译 ==="
echo "SDK: $OHOS_SDK_NATIVE"
echo "构建类型: $BUILD_TYPE"
echo "构建目录: $BUILD_DIR"

# 检查 SDK
if [ ! -d "$OHOS_SDK_NATIVE" ]; then
    echo "错误: OHOS SDK 不存在于 $OHOS_SDK_NATIVE"
    exit 1
fi

# 清理旧构建
rm -rf "$BUILD_DIR"

# 配置
cmake -B "$BUILD_DIR" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE=cmake/toolchains/ohos-aarch64.cmake \
    -DCMAKE_BUILD_TYPE="$BUILD_TYPE"

# 构建
ninja -C "$BUILD_DIR" bun

# 验证
echo ""
echo "=== 构建完成 ==="
ls -lh "$BUILD_DIR/bun"
file "$BUILD_DIR/bun"

echo ""
echo "=== QEMU 测试 ==="
qemu-aarch64 "$BUILD_DIR/bun" --version
qemu-aarch64 "$BUILD_DIR/bun" -e 'console.log("OHOS build OK!")'
```

使用方法：

```bash
chmod +x scripts/build-ohos.sh
./scripts/build-ohos.sh Release
```

### 9.2 CI/CD 配置示例

```yaml
# .github/workflows/build-ohos.yml
name: Build Bun for OHOS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-ohos:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Setup environment
        run: |
          sudo apt update
          sudo apt install -y build-essential cmake ninja-build pkg-config \
              python3 curl wget unzip autoconf automake libtool bison flex gperf gawk \
              ruby ruby-dev nodejs npm llvm-21 clang-21 lld-21 qemu-user
          curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
          source "$HOME/.cargo/env"

      - name: Install OHOS SDK
        run: |
          mkdir -p ~/hmos-tools/sdk
          wget -O ~/hmos-tools/openharmony-sdk.zip "$SDK_URL"
          cd ~/hmos-tools && unzip openharmony-sdk.zip
          echo "OHOS_SDK_NATIVE=$HOME/hmos-tools/sdk/default/openharmony/native" >> $GITHUB_ENV

      - name: Apply OHOS patches
        run: |
          git apply patches/ohos-support.patch

      - name: Configure
        run: |
          cmake -B build/ohos-release -G Ninja \
              -DCMAKE_TOOLCHAIN_FILE=cmake/toolchains/ohos-aarch64.cmake \
              -DCMAKE_BUILD_TYPE=Release

      - name: Build
        run: ninja -C build/ohos-release bun

      - name: Test
        run: |
          qemu-aarch64 build/ohos-release/bun --version
          qemu-aarch64 build/ohos-release/bun -e 'console.log("OK")'

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: bun-ohos-aarch64
          path: build/ohos-release/bun
```

---

## 10. 常见问题

### Q1: WebKit 构建失败

**原因**: 内存不足或编译器版本不兼容

**解决**:

```bash
# 确保至少 16 GB 可用内存
free -h

# 使用系统 LLVM 21 编译器
export CC=/usr/lib/llvm-21/bin/clang
export CXX=/usr/lib/llvm-21/bin/clang++
```

### Q2: Zig 编译内存不足

**解决**: 增加 swap 空间

```bash
sudo fallocate -l 16G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Q3: 链接时找不到符号

**原因**: OHOS SDK 的 libc++ 使用 `std::__n` 命名空间

**解决**: 确保 `src/napi/napi.zig` 中使用了正确的符号名称 `NSt4__n18function`

### Q4: 真机运行报 "invalid system call"

**原因**: 系统调用不兼容（prctl, close_range, mremap）

**解决**: 应用本指南中的所有源码修改

### Q5: mimalloc 符号冲突

**解决**: 确保 `cmake/targets/BuildMimalloc.cmake` 中为 OHOS 设置了 `-DMI_OVERRIDE=OFF`

---

## 11. 修改文件清单

### 新建文件 (1)

| 文件                                  | 说明                    |
| ------------------------------------- | ----------------------- |
| `cmake/toolchains/ohos-aarch64.cmake` | OHOS 交叉编译工具链配置 |

### 修改的 CMake 文件 (9)

| 文件                                | 修改内容                                      |
| ----------------------------------- | --------------------------------------------- |
| `CMakeLists.txt`                    | 添加 OHOS 编译器到 CMAKE_ARGS                 |
| `build.zig`                         | 添加 OHOS sysroot include 路径                |
| `cmake/Options.cmake`               | 自动检测 OHOS SDK，禁用 ASAN/TinyCC           |
| `cmake/CompilerFlags.cmake`         | 使用 zlib 压缩，OHOS 兼容的 C23 扩展          |
| `cmake/tools/SetupLLVM.cmake`       | 跳过 OHOS 的 LLVM 编译器检测                  |
| `cmake/tools/SetupWebKit.cmake`     | OHOS WebKit 构建配置（LLVM 21 + OHOS libc++） |
| `cmake/tools/SetupZig.cmake`        | Zig target 设为 `aarch64-linux-ohos`          |
| `cmake/targets/BuildBun.cmake`      | 定义 `__OHOS__`，禁用 PCH，修复链接           |
| `cmake/targets/BuildMimalloc.cmake` | OHOS 设置 `MI_OVERRIDE=OFF`                   |
| `cmake/targets/BuildLolHtml.cmake`  | 添加 OHOS Cargo target                        |
| `cmake/targets/BuildTinyCC.cmake`   | OHOS 跳过 TinyCC                              |

### 修改的 C++ 文件 (5)

| 文件                                           | 修改内容                       |
| ---------------------------------------------- | ------------------------------ |
| `src/bun.js/bindings/c-bindings.cpp`           | OHOS close_range fallback      |
| `src/bun.js/bindings/bun-spawn.cpp`            | OHOS 跳过 close_range          |
| `src/bun.js/bindings/sqlite/sqlite3.c`         | 禁用 OHOS 的 mremap            |
| `src/bun.js/bindings/Bindgen/IDLConvertBase.h` | OHOS 使用 constexpr            |
| `src/bun.js/bindings/BunIDLHumanReadable.h`    | OHOS 禁用 idlHumanReadableName |
| `src/bun.js/bindings/BunIDLConvertContext.h`   | OHOS 禁用相关函数              |
| `src/bun.js/bindings/ConcatCStrings.h`         | OHOS 使用 constexpr            |

### 修改的 Zig 文件 (2)

| 文件                | 修改内容                   |
| ------------------- | -------------------------- |
| `src/Global.zig`    | 跳过 musl/OHOS 的 prctl    |
| `src/napi/napi.zig` | 使用正确的 libc++ 符号名称 |

### 修改的 TypeScript 文件 (1)

| 文件                                           | 修改内容           |
| ---------------------------------------------- | ------------------ |
| `src/codegen/bindgenv2/internal/dictionary.ts` | 生成 OHOS 条件代码 |

---

## 附录：关键发现

### OHOS SDK libc++ 命名空间

```
标准 libc++ (macOS):  std::__1::function  →  NSt3__18function
OHOS libc++:          std::__n::function  →  NSt4__n18function
GNU libstdc++:        std::function       →  St8function
```

### 系统调用差异

| 系统调用          | 标准 Linux | OHOS        | 处理方式          |
| ----------------- | ---------- | ----------- | ----------------- |
| `prctl(SET_NAME)` | ✅         | ⚠️ 参数不同 | 跳过              |
| `close_range`     | ✅         | ⚠️ 不可靠   | 使用循环 fallback |
| `mremap`          | ✅         | ❌ 不支持   | 禁用              |

### 构建时间参考

| 阶段        | 时间              | 内存峰值  |
| ----------- | ----------------- | --------- |
| CMake 配置  | 1-2 分钟          | 500 MB    |
| WebKit 构建 | 30-60 分钟        | 16 GB     |
| Zig 编译    | 18 分钟           | 10 GB     |
| 链接        | 2-5 分钟          | 4 GB      |
| **总计**    | **约 1-1.5 小时** | **16 GB** |

---

_文档创建时间: 2026-03-31_
_基于 Bun 1.3.11-canary.1+e59a147d6_
