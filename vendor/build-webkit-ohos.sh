#!/bin/bash
# Build WebKit for OHOS using hybrid toolchain (LLVM 21 + OHOS libc++)

set -e
set -x

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
     -DICU_LIBRARY_DIR="$ICU_ROOT/lib" \
     -DCMAKE_INSTALL_PREFIX="$WEBKIT_SOURCE/WebKitBuild/Release"


# Build
echo ""
echo "=== Building WebKit (this will take 30-60 minutes) ==="
echo "Start time: $(date)"

ninja -C "$BUILD_DIR" jsc

echo ""
echo "=== Installing to $WEBKIT_SOURCE/WebKitBuild/Release/ ==="

# Create directories
mkdir -p "$WEBKIT_SOURCE/WebKitBuild/Release/lib"
mkdir -p "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/wtf"
mkdir -p "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/JavaScriptCore"

# Copy libraries
cp "$BUILD_DIR/lib/"*.a "$WEBKIT_SOURCE/WebKitBuild/Release/lib/"

# Copy cmakeconfig.h (needed for BuildBun.cmake includes)
if [ -f "$BUILD_DIR/cmakeconfig.h" ]; then
    cp "$BUILD_DIR/cmakeconfig.h" "$WEBKIT_SOURCE/WebKitBuild/Release/"
fi

# Copy WTF headers from source (patched) - use lowercase 'wtf' to match #include <wtf/...>
cp -r "$WEBKIT_SOURCE/Source/WTF/wtf/." "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/wtf/"

# Copy all JavaScriptCore header files, flattening the directory structure.
# This ensures headers like JSCJSValue.h (from runtime/) end up directly under Headers/JavaScriptCore/,
# which matches the expected include path <JavaScriptCore/JSCJSValue.h>.
mkdir -p "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/JavaScriptCore"
find "$WEBKIT_SOURCE/Source/JavaScriptCore" -type f \( -name "*.h" -o -name "*.hpp" -o -name "*.def" -o -name "*.inc" \) -exec cp {} "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/JavaScriptCore/" \;

# Copy bmalloc headers from the build output (generated headers, e.g., BPlatform.h)
# These are placed in ../../bmalloc/Headers/bmalloc relative to the build directory.
# Build directory is $BUILD_DIR (e.g., vendor/WebKit/webkit-build-ohos), so the path resolves to:
# - $BUILD_DIR/bmalloc/Headers/bmalloc (most likely, if generated from a subdir like CMakeFiles/bmalloc.dir)
# - vendor/WebKit/bmalloc/Headers/bmalloc (if generated from BUILD_DIR root)
# - vendor/bmalloc/Headers/bmalloc (fallback)
# Check all possible locations in order of likelihood.
echo "Checking for bmalloc headers in:"
echo "  Option 1: $BUILD_DIR/bmalloc/Headers/bmalloc"
echo "  Option 2: $WEBKIT_SOURCE/bmalloc/Headers/bmalloc"
echo "  Option 3: $SCRIPT_DIR/bmalloc/Headers/bmalloc"
if [ -d "$BUILD_DIR/bmalloc/Headers/bmalloc" ]; then
    echo "Found bmalloc headers at option 1 (BUILD_DIR)"
    cp -r "$BUILD_DIR/bmalloc/Headers/bmalloc/." "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/bmalloc/"
elif [ -d "$WEBKIT_SOURCE/bmalloc/Headers/bmalloc" ]; then
    echo "Found bmalloc headers at option 2 (WEBKIT_SOURCE)"
    cp -r "$WEBKIT_SOURCE/bmalloc/Headers/bmalloc/." "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/bmalloc/"
elif [ -d "$SCRIPT_DIR/bmalloc/Headers/bmalloc" ]; then
    echo "Found bmalloc headers at option 3 (SCRIPT_DIR)"
    cp -r "$SCRIPT_DIR/bmalloc/Headers/bmalloc/." "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/bmalloc/"
else
    echo "ERROR: bmalloc headers not found in any expected location!"
    echo "Listing candidate directories for debugging:"
    ls -la "$BUILD_DIR/bmalloc" 2>/dev/null || echo "  $BUILD_DIR/bmalloc does not exist"
    ls -la "$WEBKIT_SOURCE/bmalloc" 2>/dev/null || echo "  $WEBKIT_SOURCE/bmalloc does not exist"
    ls -la "$SCRIPT_DIR/bmalloc" 2>/dev/null || echo "  $SCRIPT_DIR/bmalloc does not exist"
    exit 1
fi

# Copy generated JavaScriptCore headers from build directory
# PrivateHeaders contains headers like Bytecodes.h, OpcodeSize.h, etc.
# Ensure destination parent directory exists.
mkdir -p "$WEBKIT_SOURCE/WebKitBuild/Release/JavaScriptCore"
mkdir -p "$WEBKIT_SOURCE/WebKitBuild/Release/JavaScriptCore/PrivateHeaders"
if [ -d "$BUILD_DIR/JavaScriptCore/PrivateHeaders" ]; then
    cp -r "$BUILD_DIR/JavaScriptCore/PrivateHeaders/." "$WEBKIT_SOURCE/WebKitBuild/Release/JavaScriptCore/PrivateHeaders/"
else
    echo "WARNING: $BUILD_DIR/JavaScriptCore/PrivateHeaders does not exist"
fi

echo "Copying any remaining JavaScriptCore headers from build..."
find "$BUILD_DIR/JavaScriptCore" -type f \( -name '*.h' -o -name '*.hpp' -o -name '*.def' -o -name '*.inc' \) -exec cp {} "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/JavaScriptCore/" \;

# Headers contains some additional generated headers (if any)
if [ -d "$BUILD_DIR/JavaScriptCore/Headers" ]; then
    cp -r "$BUILD_DIR/JavaScriptCore/Headers/." "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/JavaScriptCore/"
fi

# Copy internal headers if they exist (needed for some APIs)
if [ -d "$WEBKIT_SOURCE/Source/JavaScriptCore/internal" ]; then
    cp -r "$WEBKIT_SOURCE/Source/JavaScriptCore/internal/." "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/JavaScriptCore/" 2>/dev/null || true
fi

if [ -d "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/wtf/glib" ]; then
    echo "Removing wtf/glib headers (requires system glib)"
    rm -rf "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/wtf/glib"
fi

echo ""
echo "=== Build Summary ==="
echo "Libraries:"
ls -lh "$WEBKIT_SOURCE/WebKitBuild/Release/lib/"
echo "Headers:"
ls -lh "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/wtf/" | head -5
ls -lh "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/bmalloc/" | head -5
echo "JavaScriptCore headers (top 20):"
ls -lh "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/JavaScriptCore/" | head -20
for h in WasmOps.h Bytecodes.h OpcodeSize.h; do
    if [ -f "$WEBKIT_SOURCE/WebKitBuild/Release/Headers/JavaScriptCore/$h" ]; then
        echo "Found $h"
    else
        echo "WARNING: $h missing!"
    fi
done
