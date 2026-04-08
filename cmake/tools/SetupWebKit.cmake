# NOTE: Changes to this file trigger QEMU JIT stress tests in CI.
# See scripts/verify-jit-stress-qemu.sh for details.

option(WEBKIT_VERSION "The version of WebKit to use")
option(WEBKIT_LOCAL "If a local version of WebKit should be used instead of downloading")
option(WEBKIT_BUILD_TYPE "The build type for local WebKit (defaults to CMAKE_BUILD_TYPE)")
option(WEBKIT_PREBUILT "If a prebuilt WebKit tarball should be used instead of building (for OHOS CI)")

# OHOS must build WebKit locally (no prebuilt available) unless WEBKIT_PREBUILT is set
if(OHOS_BUILD AND NOT WEBKIT_LOCAL AND NOT WEBKIT_PREBUILT)
    set(WEBKIT_LOCAL ON CACHE BOOL "Build WebKit locally for OHOS" FORCE)
    message(STATUS "OHOS build: Forcing WEBKIT_LOCAL=ON")
endif()

if(NOT WEBKIT_VERSION)
set(WEBKIT_VERSION fc9f2fa7272fec64905df6a9c78e15d7912f14ca)
endif()


string(SUBSTRING ${WEBKIT_VERSION} 0 16 WEBKIT_VERSION_PREFIX)
string(SUBSTRING ${WEBKIT_VERSION} 0 8 WEBKIT_VERSION_SHORT)

if(WEBKIT_PREBUILT)
  # --- Prebuilt WebKit (for OHOS CI) ---
  # Skip all compilation, just use prebuilt libraries and headers
  # WEBKIT_PATH should point to extracted prebuilt tarball (Release/ directory)
  message(STATUS "Using prebuilt WebKit at ${WEBKIT_PATH}")

  # Convert to absolute path to avoid linker issues with relative paths
  get_filename_component(WEBKIT_PATH_ABS "${WEBKIT_PATH}" ABSOLUTE)

  set(WEBKIT_INCLUDE_PATH ${WEBKIT_PATH_ABS})
  set(WEBKIT_LIB_PATH ${WEBKIT_PATH_ABS}/lib)

   include_directories(
      ${WEBKIT_PATH_ABS}
      # New artifact layout (2026-04-07): Headers/ contains wtf/, JavaScriptCore/ subdirs
      ${WEBKIT_PATH_ABS}/Headers
      # Backward compatibility with old artifact layout
      ${WEBKIT_PATH_ABS}/JavaScriptCore/Headers
      ${WEBKIT_PATH_ABS}/JavaScriptCore/Headers/JavaScriptCore
      ${WEBKIT_PATH_ABS}/JavaScriptCore/PrivateHeaders
      ${WEBKIT_PATH_ABS}/Headers/bmalloc
      ${WEBKIT_PATH_ABS}/Headers/wtf
      ${WEBKIT_PATH_ABS}/JavaScriptCore/PrivateHeaders/JavaScriptCore
    )

  # No build target needed - libraries already built
  add_custom_target(jsc ALL
    COMMENT "Using prebuilt WebKit (no build needed)"
  )

  return()
endif()

if(WEBKIT_LOCAL)
  if(NOT WEBKIT_BUILD_TYPE)
    set(WEBKIT_BUILD_TYPE ${CMAKE_BUILD_TYPE})
  endif()
  set(DEFAULT_WEBKIT_PATH ${VENDOR_PATH}/WebKit/WebKitBuild/${WEBKIT_BUILD_TYPE})
else()
  set(DEFAULT_WEBKIT_PATH ${CACHE_PATH}/webkit-${WEBKIT_VERSION_PREFIX})
endif()

option(WEBKIT_PATH "The path to the WebKit directory")

if(NOT WEBKIT_PATH)
  set(WEBKIT_PATH ${DEFAULT_WEBKIT_PATH})
endif()

set(WEBKIT_INCLUDE_PATH ${WEBKIT_PATH}/include)
set(WEBKIT_LIB_PATH ${WEBKIT_PATH}/lib)

if(WEBKIT_LOCAL)
  set(WEBKIT_SOURCE_DIR ${VENDOR_PATH}/WebKit)

  if(WIN32)
    # --- Build ICU from source (Windows only) ---
    # On macOS, ICU is found automatically (Homebrew icu4c for headers, system for libs).
    # On Linux, ICU is found automatically from system packages (e.g. libicu-dev).
    # On Windows, there is no system ICU, so we build it from source.
    set(ICU_LOCAL_ROOT ${VENDOR_PATH}/WebKit/WebKitBuild/icu)
    if(NOT EXISTS ${ICU_LOCAL_ROOT}/lib/sicudt.lib)
      message(STATUS "Building ICU from source...")
      if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|ARM64|aarch64|AARCH64")
        set(ICU_PLATFORM "ARM64")
      else()
        set(ICU_PLATFORM "x64")
      endif()
      execute_process(
        COMMAND powershell -ExecutionPolicy Bypass -File
          ${WEBKIT_SOURCE_DIR}/build-icu.ps1
          -Platform ${ICU_PLATFORM}
          -BuildType ${WEBKIT_BUILD_TYPE}
          -OutputDir ${ICU_LOCAL_ROOT}
        RESULT_VARIABLE ICU_BUILD_RESULT
      )
      if(NOT ICU_BUILD_RESULT EQUAL 0)
        message(FATAL_ERROR "Failed to build ICU (exit code: ${ICU_BUILD_RESULT}).")
      endif()
    endif()

    # Copy ICU libs to WEBKIT_LIB_PATH with the names BuildBun.cmake expects.
    # Prebuilt WebKit uses 's' prefix (static) and 'd' suffix (debug).
    file(MAKE_DIRECTORY ${WEBKIT_LIB_PATH})
    if(WEBKIT_BUILD_TYPE STREQUAL "Debug")
      set(ICU_SUFFIX "d")
    else()
      set(ICU_SUFFIX "")
    endif()
    file(COPY_FILE ${ICU_LOCAL_ROOT}/lib/sicudt.lib ${WEBKIT_LIB_PATH}/sicudt${ICU_SUFFIX}.lib ONLY_IF_DIFFERENT)
    file(COPY_FILE ${ICU_LOCAL_ROOT}/lib/icuin.lib ${WEBKIT_LIB_PATH}/sicuin${ICU_SUFFIX}.lib ONLY_IF_DIFFERENT)
    file(COPY_FILE ${ICU_LOCAL_ROOT}/lib/icuuc.lib ${WEBKIT_LIB_PATH}/sicuuc${ICU_SUFFIX}.lib ONLY_IF_DIFFERENT)
  endif()

  # --- Configure JSC ---
  message(STATUS "Configuring JSC from local WebKit source at ${WEBKIT_SOURCE_DIR}...")

set(JSC_CMAKE_ARGS
    -S ${WEBKIT_SOURCE_DIR}
    -B ${WEBKIT_PATH}
    -G ${CMAKE_GENERATOR}
    -DPORT=JSCOnly
    -DENABLE_STATIC_JSC=ON
    -DUSE_THIN_ARCHIVES=OFF
    -DENABLE_FTL_JIT=ON
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
    -DUSE_BUN_JSC_ADDITIONS=ON
    -DUSE_BUN_EVENT_LOOP=ON
    -DENABLE_BUN_SKIP_FAILING_ASSERTIONS=ON
    -DALLOW_LINE_AND_COLUMN_NUMBER_IN_BUILTINS=ON
    -DCMAKE_BUILD_TYPE=${WEBKIT_BUILD_TYPE}
    -DCMAKE_C_COMPILER=${CMAKE_C_COMPILER}
    -DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER}
    -DENABLE_REMOTE_INSPECTOR=ON
    -DENABLE_MEDIA_SOURCE=OFF
    -DENABLE_MEDIA_STREAM=OFF
    -DENABLE_WEB_RTC=OFF
    -DOHOS_BUILD=${OHOS_BUILD}
)

if(WIN32)
    # ICU paths and Windows-specific compiler/linker settings
    list(APPEND JSC_CMAKE_ARGS
        -DICU_ROOT=${ICU_LOCAL_ROOT}
        -DICU_LIBRARY=${ICU_LOCAL_ROOT}/lib
        -DICU_INCLUDE_DIR=${ICU_LOCAL_ROOT}/include
        -DCMAKE_LINKER=lld-link
    )
    # Static CRT and U_STATIC_IMPLEMENTATION
    if(WEBKIT_BUILD_TYPE STREQUAL "Debug")
        set(JSC_MSVC_RUNTIME "MultiThreadedDebug")
    else()
        set(JSC_MSVC_RUNTIME "MultiThreaded")
    endif()
    list(APPEND JSC_CMAKE_ARGS
        -DCMAKE_MSVC_RUNTIME_LIBRARY=${JSC_MSVC_RUNTIME}
        "-DCMAKE_C_FLAGS=/DU_STATIC_IMPLEMENTATION"
        "-DCMAKE_CXX_FLAGS=/DU_STATIC_IMPLEMENTATION /clang:-fno-c++-static-destructors"
    )
elseif(OHOS_BUILD)
        # OHOS-specific WebKit build configuration
        # Use system LLVM 21.1.8 for compilation (supports C++20)
        # Use OHOS SDK libc++ headers (musl compatible) with C++20 features backported
        set(ICU_OHOS_ROOT "${VENDOR_PATH}/icu-ohos")

        # Determine OHOS SDK path
        if(NOT DEFINED OHOS_SDK_NATIVE)
            if(DEFINED ENV{OHOS_SDK_NATIVE})
                set(OHOS_SDK_NATIVE "$ENV{OHOS_SDK_NATIVE}")
            else()
                set(OHOS_SDK_NATIVE "$ENV{HOME}/hmos-tools/sdk/default/openharmony/native")
            endif()
        endif()

        # Use system LLVM 21 compiler
        set(LLVM21_BIN "/usr/lib/llvm-21/bin")
        set(LLVM21_LIB "/usr/lib/llvm-21/lib/clang/21")
        set(OHOS_CLANG_C "${LLVM21_BIN}/clang")
        set(OHOS_CLANG_CXX "${LLVM21_BIN}/clang++")

        # OHOS SDK paths
        set(OHOS_SYSROOT "${OHOS_SDK_NATIVE}/sysroot")
        set(OHOS_LIB_DIR "${OHOS_SDK_NATIVE}/llvm/lib/aarch64-linux-ohos")
        set(OHOS_ARCH_INCLUDE_DIR "${OHOS_SYSROOT}/usr/include/aarch64-linux-ohos")
        set(OHOS_CXX_INCLUDE_DIR "${OHOS_SDK_NATIVE}/llvm/include/libcxx-ohos/include/c++/v1")

        # LLVM 21 builtin headers
        set(LLVM21_INCLUDE_DIR "${LLVM21_LIB}/include")

# Compiler flags: target OHOS
set(OHOS_COMMON_FLAGS "--target=aarch64-linux-ohos -fPIC -stdlib=libc++")
set(OHOS_INCLUDE_FLAGS "-isystem ${OHOS_CXX_INCLUDE_DIR} -isystem ${LLVM21_INCLUDE_DIR} -isystem ${OHOS_ARCH_INCLUDE_DIR} -isystem ${OHOS_SYSROOT}/usr/include")
set(OHOS_C_FLAGS "${OHOS_COMMON_FLAGS} ${OHOS_INCLUDE_FLAGS}")
set(OHOS_CXX_FLAGS "${OHOS_COMMON_FLAGS} -std=c++20 ${OHOS_INCLUDE_FLAGS} -D_LIBCPP_DISABLE_ADDITIONAL_DIAGNOSTICS")
# Linker flags: use sysroot for cross-compilation
# Use OHOS SDK resource directory for runtime libraries
set(OHOS_SDK_RESOURCE_DIR "${OHOS_SDK_NATIVE}/llvm/lib/clang/15.0.4")
set(OHOS_LINKER_FLAGS "--target=aarch64-linux-ohos --sysroot=${OHOS_SYSROOT} -resource-dir ${OHOS_SDK_RESOURCE_DIR} -L${OHOS_LIB_DIR}")

# Disable sanitizers for OHOS (not available in SDK)
set(ENABLE_ASAN OFF CACHE BOOL "Disable ASAN for OHOS" FORCE)

# OHOS uses musl libc where pthread is part of libc, not a separate library
# Override CMake's thread detection to avoid linking -lpthreads
set(CMAKE_THREAD_LIBS_INIT "" CACHE STRING "No separate pthread library for OHOS/musl" FORCE)
set(CMAKE_HAVE_PTHREADS_CREATE OFF CACHE BOOL "pthread_create is in libc for OHOS/musl" FORCE)

        # QEMU cross-compiling emulator for running build-time tools
        # This allows LLIntSettingsExtractor to run on the host while being compiled for OHOS
        find_program(QEMU_AARCH64 qemu-aarch64)
        if(QEMU_AARCH64)
            set(OHOS_CROSSCOMPILING_EMULATOR "${QEMU_AARCH64}")
            message(STATUS "  Using QEMU for cross-compiling: ${QEMU_AARCH64}")
        endif()

list(APPEND JSC_CMAKE_ARGS
-DCMAKE_C_COMPILER=${OHOS_CLANG_C}
-DCMAKE_CXX_COMPILER=${OHOS_CLANG_CXX}
-DCMAKE_C_FLAGS=${OHOS_C_FLAGS}
-DCMAKE_CXX_FLAGS=${OHOS_CXX_FLAGS}
-DCMAKE_EXE_LINKER_FLAGS=${OHOS_LINKER_FLAGS}
-DCMAKE_SHARED_LINKER_FLAGS=${OHOS_LINKER_FLAGS}
-DCMAKE_SYSTEM_NAME=Linux
-DCMAKE_SYSTEM_PROCESSOR=aarch64
-DCMAKE_CROSSCOMPILING=ON
-DCMAKE_CROSSCOMPILING_EMULATOR=${OHOS_CROSSCOMPILING_EMULATOR}
-DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY
-DCMAKE_THREAD_LIBS_INIT=""
-DCMAKE_USE_PTHREADS_INIT=OFF
-DTHREADS_USE_PTHREADS_WIN32=OFF
-DTHREADS_PREFER_PTHREAD_FLAG=OFF
-DICU_ROOT=${ICU_OHOS_ROOT}
            -DICU_INCLUDE_DIR=${ICU_OHOS_ROOT}/include
            -DICU_LIBRARY=${ICU_OHOS_ROOT}/lib
            -DICU_UC_LIBRARIES=${ICU_OHOS_ROOT}/lib/libicuuc.a
            -DICU_I18N_LIBRARIES=${ICU_OHOS_ROOT}/lib/libicui18n.a
            -DICU_DATA_LIBRARIES=${ICU_OHOS_ROOT}/lib/libicudata.a
            -DOHOS_BUILD=${OHOS_BUILD}
        )
        message(STATUS "Configured WebKit for OHOS target with LLVM 21 + OHOS libc++")
        message(STATUS "  C Compiler: ${OHOS_CLANG_C}")
        message(STATUS "  C++ Compiler: ${OHOS_CLANG_CXX}")
        message(STATUS "  C++ Standard: C++20")
        message(STATUS "  libc++ headers: ${OHOS_CXX_INCLUDE_DIR}")
        message(STATUS "  ICU from: ${ICU_OHOS_ROOT}")
    endif()

  if(ENABLE_ASAN)
    list(APPEND JSC_CMAKE_ARGS -DENABLE_SANITIZERS=address)
  endif()

  # Pass through ccache if available
  if(CMAKE_C_COMPILER_LAUNCHER)
    list(APPEND JSC_CMAKE_ARGS -DCMAKE_C_COMPILER_LAUNCHER=${CMAKE_C_COMPILER_LAUNCHER})
  endif()
  if(CMAKE_CXX_COMPILER_LAUNCHER)
    list(APPEND JSC_CMAKE_ARGS -DCMAKE_CXX_COMPILER_LAUNCHER=${CMAKE_CXX_COMPILER_LAUNCHER})
  endif()

  execute_process(
    COMMAND ${CMAKE_COMMAND} ${JSC_CMAKE_ARGS}
    RESULT_VARIABLE JSC_CONFIGURE_RESULT
  )
  if(NOT JSC_CONFIGURE_RESULT EQUAL 0)
    message(FATAL_ERROR "Failed to configure JSC (exit code: ${JSC_CONFIGURE_RESULT}). "
      "Check the output above for errors.")
  endif()

  if(WIN32)
    set(JSC_BYPRODUCTS
      ${WEBKIT_LIB_PATH}/JavaScriptCore.lib
      ${WEBKIT_LIB_PATH}/WTF.lib
      ${WEBKIT_LIB_PATH}/bmalloc.lib
    )
  else()
    set(JSC_BYPRODUCTS
      ${WEBKIT_LIB_PATH}/libJavaScriptCore.a
      ${WEBKIT_LIB_PATH}/libWTF.a
      ${WEBKIT_LIB_PATH}/libbmalloc.a
    )
  endif()

  if(WIN32)
    add_custom_target(jsc ALL
      COMMAND ${CMAKE_COMMAND} --build ${WEBKIT_PATH} --config ${WEBKIT_BUILD_TYPE} --target jsc
      BYPRODUCTS ${JSC_BYPRODUCTS}
      COMMENT "Building JSC (${WEBKIT_PATH})"
    )
  else()
    add_custom_target(jsc ALL
      COMMAND ${CMAKE_COMMAND} --build ${WEBKIT_PATH} --config ${WEBKIT_BUILD_TYPE} --target jsc
      BYPRODUCTS ${JSC_BYPRODUCTS}
      COMMENT "Building JSC (${WEBKIT_PATH})"
      USES_TERMINAL
    )
  endif()

  include_directories(
    ${WEBKIT_PATH}
    # New artifact layout (2026-04-07): Headers/ contains wtf/, JavaScriptCore/ subdirs
    ${WEBKIT_PATH}/Headers
    # Backward compatibility with old artifact layout
    ${WEBKIT_PATH}/JavaScriptCore/Headers
    ${WEBKIT_PATH}/JavaScriptCore/Headers/JavaScriptCore
    ${WEBKIT_PATH}/JavaScriptCore/PrivateHeaders
    ${WEBKIT_PATH}/Headers/bmalloc
    ${WEBKIT_PATH}/Headers/wtf
    ${WEBKIT_PATH}/JavaScriptCore/PrivateHeaders/JavaScriptCore
  )

  # On Windows, add ICU headers from the local ICU build
  if(WIN32)
    include_directories(${ICU_LOCAL_ROOT}/include)
  endif()

  # After this point, only prebuilt WebKit is supported
  return()
endif()

if(WIN32)
  set(WEBKIT_OS "windows")
elseif(APPLE)
  set(WEBKIT_OS "macos")
elseif(UNIX)
  set(WEBKIT_OS "linux")
else()
  message(FATAL_ERROR "Unsupported operating system: ${CMAKE_SYSTEM_NAME}")
endif()

if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|ARM64|aarch64|AARCH64")
  set(WEBKIT_ARCH "arm64")
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "amd64|x86_64|x64|AMD64")
  set(WEBKIT_ARCH "amd64")
else()
  message(FATAL_ERROR "Unsupported architecture: ${CMAKE_SYSTEM_PROCESSOR}")
endif()

if(LINUX AND ABI STREQUAL "musl")
    set(WEBKIT_SUFFIX "-musl")
endif()

# OHOS-specific WebKit configuration
if(OHOS_BUILD)
    # OHOS doesn't have prebuilt WebKit, must build locally
    message(STATUS "OHOS build detected: WebKit must be built locally")
    if(NOT WEBKIT_LOCAL)
        set(WEBKIT_LOCAL ON CACHE BOOL "Build WebKit locally for OHOS" FORCE)
    endif()
    set(WEBKIT_SUFFIX "-ohos")
endif()

# Baseline WebKit artifacts (-march=nehalem, /arch:SSE2 ICU) exist for
# Linux amd64 (glibc + musl) and Windows amd64. No baseline variant for
# arm64 or macOS. Suffix order matches the release asset names:
# bun-webkit-linux-amd64-musl-baseline-lto.tar.gz
if(ENABLE_BASELINE AND WEBKIT_ARCH STREQUAL "amd64")
  set(WEBKIT_SUFFIX "${WEBKIT_SUFFIX}-baseline")
endif()

if(DEBUG)
  set(WEBKIT_SUFFIX "${WEBKIT_SUFFIX}-debug")
elseif(ENABLE_LTO)
  set(WEBKIT_SUFFIX "${WEBKIT_SUFFIX}-lto")
else()
  set(WEBKIT_SUFFIX "${WEBKIT_SUFFIX}")
endif()

if(ENABLE_ASAN)
  # We cannot mix and match ASan Bun + non-ASan WebKit, or vice versa, because some WebKit classes
  # change their layout according to whether ASan is used, for example:
  # https://github.com/oven-sh/WebKit/blob/eda8b0fb4fb1aa23db9c2b00933df8b58bcdd289/Source/WTF/wtf/Vector.h#L682
  set(WEBKIT_SUFFIX "${WEBKIT_SUFFIX}-asan")
endif()

setx(WEBKIT_NAME bun-webkit-${WEBKIT_OS}-${WEBKIT_ARCH}${WEBKIT_SUFFIX})
set(WEBKIT_FILENAME ${WEBKIT_NAME}.tar.gz)

if(WEBKIT_VERSION MATCHES "^autobuild-")
  set(WEBKIT_TAG ${WEBKIT_VERSION})
else()
  set(WEBKIT_TAG autobuild-${WEBKIT_VERSION})
endif()

setx(WEBKIT_DOWNLOAD_URL https://github.com/oven-sh/WebKit/releases/download/${WEBKIT_TAG}/${WEBKIT_FILENAME})

if(EXISTS ${WEBKIT_PATH}/package.json)
  file(READ ${WEBKIT_PATH}/package.json WEBKIT_PACKAGE_JSON)

  if(WEBKIT_PACKAGE_JSON MATCHES ${WEBKIT_VERSION})
    return()
  endif()
endif()

file(
  DOWNLOAD ${WEBKIT_DOWNLOAD_URL} ${CACHE_PATH}/${WEBKIT_FILENAME} SHOW_PROGRESS
  STATUS WEBKIT_DOWNLOAD_STATUS
)
if(NOT "${WEBKIT_DOWNLOAD_STATUS}" MATCHES "^0;")
  message(FATAL_ERROR "Failed to download WebKit: ${WEBKIT_DOWNLOAD_STATUS}")
endif()

file(ARCHIVE_EXTRACT INPUT ${CACHE_PATH}/${WEBKIT_FILENAME} DESTINATION ${CACHE_PATH} TOUCH)
file(REMOVE ${CACHE_PATH}/${WEBKIT_FILENAME})
file(REMOVE_RECURSE ${WEBKIT_PATH})
file(RENAME ${CACHE_PATH}/bun-webkit ${WEBKIT_PATH})

if(APPLE)
  file(REMOVE_RECURSE ${WEBKIT_INCLUDE_PATH}/unicode)
endif()
