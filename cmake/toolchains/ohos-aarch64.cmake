# OHOS (OpenHarmony) aarch64 toolchain configuration for CMake
#
# This toolchain file enables cross-compilation of Bun for OpenHarmony/HarmonyOS.
#
# Usage:
#   cmake -B build/ohos \
#       -DCMAKE_TOOLCHAIN_FILE=cmake/toolchains/ohos-aarch64.cmake \
#       -DCMAKE_BUILD_TYPE=Release
#
# Requirements:
#   - OHOS SDK at ~/hmos-tools/sdk/default/openharmony/native/
#   - Or set OHOS_SDK_NATIVE environment variable
#
# Key differences from Linux builds:
#   - Uses LLVM libc++ instead of GNU libstdc++
#   - Full static linking (no dynamic C++ runtime on device)
#   - musl libc based

# Platform identification
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_SYSTEM_VERSION 1)

# OHOS-specific settings
set(ABI musl)
set(OHOS_BUILD ON CACHE BOOL "Building for OHOS platform")

# Threading: OHOS uses musl where pthread is part of libc
# Prefer pthread and let FindThreads create the Threads::Threads target
set(THREADS_PREFER_PTHREADS TRUE)
set(CMAKE_USE_PTHREADS_INIT ON)
# No extra pthread library needed (pthread in libc)
set(CMAKE_THREAD_LIBS_INIT "")

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

# LLVM toolchain paths
set(OHOS_LLVM_DIR "${OHOS_SDK_NATIVE}/llvm")

# LLD program path for linker
set(LLD_PROGRAM "${OHOS_LLVM_DIR}/bin/ld.lld" CACHE INTERNAL "LLD linker path")

# Compiler binaries
set(CMAKE_C_COMPILER "${OHOS_LLVM_DIR}/bin/aarch64-unknown-linux-ohos-clang")
set(CMAKE_CXX_COMPILER "${OHOS_LLVM_DIR}/bin/aarch64-unknown-linux-ohos-clang++")
set(CMAKE_AR "${OHOS_LLVM_DIR}/bin/llvm-ar")
set(CMAKE_RANLIB "${OHOS_LLVM_DIR}/bin/llvm-ranlib")
set(CMAKE_LINKER "${OHOS_LLVM_DIR}/bin/ld.lld")
set(CMAKE_STRIP "${OHOS_LLVM_DIR}/bin/llvm-strip")
set(CMAKE_OBJCOPY "${OHOS_LLVM_DIR}/bin/llvm-objcopy")
set(CMAKE_OBJDUMP "${OHOS_LLVM_DIR}/bin/llvm-objdump")

# Sysroot
set(CMAKE_SYSROOT "${OHOS_SDK_NATIVE}/sysroot")
set(CMAKE_FIND_ROOT_PATH "${OHOS_SDK_NATIVE}/sysroot")

# Library directory
set(OHOS_LIB_DIR "${OHOS_LLVM_DIR}/lib/aarch64-linux-ohos")

# Compiler flags
# Use LLVM libc++ instead of GNU libstdc++
set(CMAKE_C_FLAGS "--target=aarch64-linux-ohos -fPIC" CACHE STRING "" FORCE)
set(CMAKE_CXX_FLAGS 
    "--target=aarch64-linux-ohos -stdlib=libc++ -fPIC" 
    CACHE STRING "" FORCE
)

# Linker flags - Full static linking required for OHOS
# (no dynamic libstdc++/libgcc on device)
set(CMAKE_EXE_LINKER_FLAGS 
    "-static -L${OHOS_LIB_DIR}" 
    CACHE STRING "" FORCE
)
set(CMAKE_SHARED_LINKER_FLAGS 
    "-static -L${OHOS_LIB_DIR}" 
    CACHE STRING "" FORCE
)

# Search paths
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)

# Cross-compilation flag
set(CMAKE_CROSSCOMPILING ON CACHE BOOL "Cross-compiling for OHOS" FORCE)

# Compiler checks
set(CMAKE_C_COMPILER_WORKS ON)
set(CMAKE_CXX_COMPILER_WORKS ON)

# Export for other CMake files
set(OHOS_LIB_DIR "${OHOS_LIB_DIR}" CACHE INTERNAL "OHOS library directory")
set(OHOS_INCLUDE_DIR "${OHOS_SDK_NATIVE}/sysroot/usr/include" CACHE INTERNAL "OHOS include directory")

# ICU paths for WebKit
# Use vendor/icu-ohos which has ICU headers copied from OHOS SDK
set(ICU_ROOT "${CMAKE_SOURCE_DIR}/vendor/icu-ohos" CACHE INTERNAL "ICU root directory")
set(ICU_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/vendor/icu-ohos/include" CACHE INTERNAL "ICU include directory")
set(ICU_LIBRARY "${CMAKE_SOURCE_DIR}/vendor/icu-ohos/lib" CACHE INTERNAL "ICU library directory")

# Print configuration summary
message(STATUS "OHOS Toolchain Configuration:")
message(STATUS "  C Compiler: ${CMAKE_C_COMPILER}")
message(STATUS "  C++ Compiler: ${CMAKE_CXX_COMPILER}")
message(STATUS "  C Flags: ${CMAKE_C_FLAGS}")
message(STATUS "  C++ Flags: ${CMAKE_CXX_FLAGS}")
message(STATUS "  Linker Flags: ${CMAKE_EXE_LINKER_FLAGS}")
message(STATUS "  Library Dir: ${OHOS_LIB_DIR}")
