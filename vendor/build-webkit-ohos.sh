#!/bin/bash
# Build WebKit for OHOS using hybrid toolchain (LLVM 21 + OHOS libc++)

set -e

# Environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BUN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"  # Repository root
export OHOS_SDK_NATIVE="${OHOS_SDK_NATIVE:-$HOME/setup-ohos-sdk/linux/native}"
export ICU_ROOT="$SCRIPT_DIR/icu-ohos"
WEBKIT_SOURCE="$SCRIPT_DIR/WebKit"

# Check prerequisites
if [ ! -d "$OHOS_SDK_NATIVE" ]; then
    echo "ERROR: OHOS_SDK_NATIVE not found at $OHOS_SDK_NATIVE"
    exit 1
fi

# Auto-detect ICU library directory (workflow tarball structure may vary)
if [ -d "$ICU_ROOT" ]; then
    ICU_LIB_DIR=""
    for dir in "$ICU_ROOT/lib" "$ICU_ROOT/lib64" "$ICU_ROOT/static/lib" "$ICU_ROOT"; do
      if [ -d "$dir" ] && ls "$dir"/*.a &>/dev/null; then
        ICU_LIB_DIR="$dir"
        break
      fi
    done

    if [ -z "$ICU_LIB_DIR" ]; then
      echo "ERROR: ICU libraries not found in $ICU_ROOT"
      echo "Searched in: lib, lib64, static/lib, or root"
      echo "Contents of $ICU_ROOT:"
      ls -la "$ICU_ROOT" || echo "Directory does not exist"
      exit 1
    fi

    echo "ICU libraries detected in: $ICU_LIB_DIR"

    # Standardize to $ICU_ROOT/lib for CMake FindICU
    if [ "$ICU_LIB_DIR" != "$ICU_ROOT/lib" ]; then
      echo "Standardizing ICU library location to \$ICU_ROOT/lib"
      mkdir -p "$ICU_ROOT/lib"
      cp -f "$ICU_LIB_DIR"/*.a "$ICU_ROOT/lib/" 2>/dev/null || true
      echo "ICU libraries now in \$ICU_ROOT/lib:"
      ls -lh "$ICU_ROOT/lib/" || echo "Warning: copy may have failed"
    fi
else
    echo "ERROR: ICU_ROOT directory does not exist: $ICU_ROOT"
    exit 1
fi


echo "=== WebKit OHOS Build ==="
echo "OHOS SDK: $OHOS_SDK_NATIVE"
echo "ICU: $ICU_ROOT"
BUILD_DIR="$(pwd)/webkit-build-ohos"
mkdir -p "$BUILD_DIR"

# Configure with pure OHOS SDK toolchain (via toolchain file)
# - Uses OHOS SDK clang (Clang 15) which supports C++20

echo ""

echo ""
   echo ""
   echo "=== Configuring WebKit ==="
   
   
   cmake -B "$BUILD_DIR" \
    -S "$WEBKIT_SOURCE" \
    -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DOHOS_BUILD=ON \
    -DCMAKE_TOOLCHAIN_FILE="${BUN_ROOT}/cmake/toolchains/ohos-aarch64.cmake" \
    -DPORT=JSCOnly \
    -DJavaScriptCore_EXPORT_PRIVATE_SYMBOLS=OFF \
    -DUSE_SYSTEM_MALLOC=OFF \
    -DENABLE_STATIC_JSC=ON \
    -DUSE_BUN_JSC_ADDITIONS=ON \
    -DUSE_THIN_ARCHIVES=OFF \
    -DENABLE_REMOTE_INSPECTOR=ON \
    -DICU_ROOT="$ICU_ROOT" \
    -DICU_INCLUDE_DIR="$ICU_ROOT/include" \
    -DICU_LIBRARY_DIR="$ICU_ROOT/lib"


# Build
echo ""
echo "=== Building WebKit (this will take 30-60 minutes) ==="
echo "Start time: $(date)"

ninja -C "$BUILD_DIR" jsc

echo ""
echo "=== Build Complete ==="
echo "End time: $(date)"

# Verify output
echo ""
echo "=== Build Output ==="
ls -lh "$BUILD_DIR/lib/"*.a

# Copy to standard location
echo ""
echo "=== Installing to $SCRIPT_DIR/WebKitBuild/Release/ ==="
mkdir -p "$WEBKIT_SOURCE/WebKitBuild/Release/lib"
cp "$BUILD_DIR/lib/"*.a "$WEBKIT_SOURCE/WebKitBuild/Release/lib/"

# Copy headers
if [ -d "$BUILD_DIR/JavaScriptCore/PrivateHeaders" ]; then
    cp -r "$BUILD_DIR/JavaScriptCore/PrivateHeaders" "$WEBKIT_SOURCE/WebKitBuild/Release/"
fi

if [ -d "$BUILD_DIR/WTF/Headers" ]; then
    cp -r "$BUILD_DIR/WTF/Headers" "$WEBKIT_SOURCE/WebKitBuild/Release/"
fi

echo ""
echo "=== Build Summary ==="
echo "Output: $WEBKIT_SOURCE/WebKitBuild/Release/"
ls -lh "$WEBKIT_SOURCE/WebKitBuild/Release/lib/"
