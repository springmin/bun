# OHOS (OpenHarmony) aarch64 toolchain using system Clang 21
#
# This toolchain uses the system Clang (LLVM 21) instead of OHOS SDK Clang 15
# to avoid the known compiler bugs in OHOS SDK's LLVM 15.0.4.
#
# Usage:
# cmake -B build/ohos-system-clang \
#   -DCMAKE_TOOLCHAIN_FILE=cmake/toolchains/ohos-aarch64-system-clang.cmake \
#   -DCMAKE_BUILD_TYPE=Debug
#
# Requirements:
# - OHOS SDK at ~/hmos-tools/sdk/default/openharmony/native/
# - System Clang 21 (apt install clang-21)

# Platform identification
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_SYSTEM_VERSION 1)

# OHOS-specific settings
set(ABI musl)
set(OHOS_BUILD ON CACHE BOOL "Building for OHOS platform")
set(USE_SYSTEM_CLANG ON CACHE BOOL "Using system Clang for OHOS")

# SDK path detection
if(NOT DEFINED OHOS_SDK_NATIVE)
    if(DEFINED ENV{OHOS_SDK_NATIVE})
        set(OHOS_SDK_NATIVE "$ENV{OHOS_SDK_NATIVE}")
    elseif(EXISTS "$ENV{HOME}/hmos-tools/sdk/default/openharmony/native")
        set(OHOS_SDK_NATIVE "$ENV{HOME}/hmos-tools/sdk/default/openharmony/native")
    else()
        message(FATAL_ERROR
            "OHOS SDK not found. Set OHOS_SDK_NATIVE environment variable.\n"
            "Expected location: ~/hmos-tools/sdk/default/openharmony/native/"
        )
    endif()
endif()

message(STATUS "OHOS SDK: ${OHOS_SDK_NATIVE}")

# Use system Clang 21
set(SYSTEM_CLANG_DIR "/usr/lib/llvm-21")

# Compiler binaries - use system Clang
set(CMAKE_C_COMPILER "${SYSTEM_CLANG_DIR}/bin/clang")
set(CMAKE_CXX_COMPILER "${SYSTEM_CLANG_DIR}/bin/clang++")
set(CMAKE_AR "${SYSTEM_CLANG_DIR}/bin/llvm-ar")
set(CMAKE_RANLIB "${SYSTEM_CLANG_DIR}/bin/llvm-ranlib")
set(CMAKE_LINKER "${SYSTEM_CLANG_DIR}/bin/ld.lld")
set(CMAKE_STRIP "${SYSTEM_CLANG_DIR}/bin/llvm-strip")
set(CMAKE_OBJCOPY "${SYSTEM_CLANG_DIR}/bin/llvm-objcopy")
set(CMAKE_OBJDUMP "${SYSTEM_CLANG_DIR}/bin/llvm-objdump")

# Sysroot - use OHOS SDK sysroot
set(CMAKE_SYSROOT "${OHOS_SDK_NATIVE}/sysroot")
set(CMAKE_FIND_ROOT_PATH "${OHOS_SDK_NATIVE}/sysroot")

# Library and runtime directories
set(OHOS_LIB_DIR "${OHOS_SDK_NATIVE}/llvm/lib/aarch64-linux-ohos")
set(OHOS_CRT_DIR "${OHOS_SDK_NATIVE}/sysroot/usr/lib/aarch64-linux-ohos")
set(OHOS_CLANG_RT_DIR "${OHOS_SDK_NATIVE}/llvm/lib/clang/15.0.4/lib/aarch64-linux-ohos")

# libc++ headers from OHOS SDK
set(OHOS_LIBCXX_INCLUDE "${OHOS_SDK_NATIVE}/llvm/include/libcxx-ohos/include/c++/v1")

# Compiler flags
# Target aarch64-linux-ohos (musl-based)
# Use sysroot for system headers
set(CMAKE_C_FLAGS "--target=aarch64-linux-ohos -fPIC --sysroot=${OHOS_SDK_NATIVE}/sysroot" CACHE STRING "" FORCE)
set(CMAKE_CXX_FLAGS 
    "--target=aarch64-linux-ohos -stdlib=libc++ -fPIC --sysroot=${OHOS_SDK_NATIVE}/sysroot -isystem ${OHOS_LIBCXX_INCLUDE}"
    CACHE STRING "" FORCE
)

# Linker flags - specify OHOS runtime library paths
set(CMAKE_EXE_LINKER_FLAGS
    "--target=aarch64-linux-ohos -fuse-ld=lld -L${OHOS_CRT_DIR} -L${OHOS_LIB_DIR} -L${OHOS_CLANG_RT_DIR} -static"
    CACHE STRING "" FORCE
)
set(CMAKE_SHARED_LINKER_FLAGS
    "--target=aarch64-linux-ohos -fuse-ld=lld -L${OHOS_CRT_DIR} -L${OHOS_LIB_DIR} -L${OHOS_CLANG_RT_DIR}"
    CACHE STRING "" FORCE
)

# Search paths
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)

# Cross-compilation flag
set(CMAKE_CROSSCOMPILING ON CACHE BOOL "Cross-compiling for OHOS" FORCE)

# Compiler checks - skip CMake's compiler test
set(CMAKE_C_COMPILER_WORKS ON)
set(CMAKE_CXX_COMPILER_WORKS ON)

# Export for other CMake files
set(OHOS_LIB_DIR "${OHOS_LIB_DIR}" CACHE INTERNAL "OHOS library directory")
set(OHOS_INCLUDE_DIR "${OHOS_SDK_NATIVE}/sysroot/usr/include" CACHE INTERNAL "OHOS include directory")

# ICU paths for WebKit
set(ICU_ROOT "${CMAKE_SOURCE_DIR}/vendor/icu-ohos" CACHE INTERNAL "ICU root directory")
set(ICU_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/vendor/icu-ohos/include" CACHE INTERNAL "ICU include directory")

# Print configuration summary
message(STATUS "OHOS Toolchain Configuration (System Clang 21):")
message(STATUS " C Compiler: ${CMAKE_C_COMPILER}")
message(STATUS " C++ Compiler: ${CMAKE_CXX_COMPILER}")
message(STATUS " C Flags: ${CMAKE_C_FLAGS}")
message(STATUS " C++ Flags: ${CMAKE_CXX_FLAGS}")
message(STATUS " Linker Flags: ${CMAKE_EXE_LINKER_FLAGS}")
message(STATUS " CRT Dir: ${OHOS_CRT_DIR}")
message(STATUS " Clang RT Dir: ${OHOS_CLANG_RT_DIR}")
message(STATUS " Sysroot: ${CMAKE_SYSROOT}")
