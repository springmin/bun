# Implementation Guide: Fix WebKit OHOS Prebuilt CI

**Plan**: `.sisyphus/plans/fix-webkit-ohos-prebuilt-ci.md`  
**Status**: Ready for execution  
**Date**: 2026-04-06

---

## Overview

This guide provides step-by-step instructions for an implementer to:

1. **Rewrite `vendor/build-webkit-ohos.sh` to use pure OHOS SDK toolchain** (remove LLVM 21 dependency)
2. Fix output directory to `WebKitBuild/Release`
3. Create a clean standalone WebKit OHOS prebuilt CI workflow
4. Ensure all dependencies are tracked
5. Push and verify CI success

**Important**: We will use **pure OHOS SDK toolchain** (aarch64-unknown-linux-ohos-clang++) instead of the hybrid LLVM 21 approach. This ensures ABI compatibility and simplifies the build.

If we encounter shim-related errors (rune table, strtoll_l), we will add `-include vendor/ohos-shim/ohos-libcpp-shim.h` later.

---

## Prerequisites

- Branch: `ohos` (on fork/springmin/bun)
- All files in working directory are up-to-date
- No uncommitted changes (or safely stashed)

---

## Step 1: Fix `vendor/build-webkit-ohos.sh`

**File**: `vendor/build-webkit-ohos.sh`  
**Goal**: Convert from hybrid LLVM 21 toolchain to pure OHOS SDK toolchain

### Change 1: Fix output directory (NewBuild → Release)

Replace lines 85-103 (the "Copy to standard location" section) with:

```bash
# Copy to standard location
echo ""
echo "=== Installing to $WEBKIT_SOURCE/WebKitBuild/Release/ ==="
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
```

Or simply:

```bash
sed -i 's|WebKitBuild/NewBuild|WebKitBuild/Release|g' vendor/build-webkit-ohos.sh
```

### Change 2: Switch to pure OHOS SDK toolchain (remove LLVM 21)

**Critical**: The current script forces LLVM 21 compilers. We need to remove those overrides and let the toolchain file control everything.

Replace lines 46-67 (the entire cmake configure command) with:

```bash
cmake -B "$BUILD_DIR" \
  -S "$WEBKIT_SOURCE" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TOOLCHAIN_FILE="${BUN_ROOT}/cmake/toolchains/ohos-aarch64.cmake" \
  -DCMAKE_MODULE_PATH="$SCRIPT_DIR/cmake" \
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
```

**Key changes**:

- ❌ **Remove** `-DCMAKE_C_COMPILER=/usr/lib/llvm-21/bin/clang`
- ❌ **Remove** `-DCMAKE_CXX_COMPILER=/usr/lib/llvm-21/bin/clang++`
- ❌ **Remove** `-DCMAKE_C_COMPILER_LAUNCHER=ccache` and `-DCMAKE_CXX_COMPILER_LAUNCHER=ccache`
- ❌ **Remove** custom `-DCMAKE_C_FLAGS=...` and `-DCMAKE_CXX_FLAGS=...`
- ❌ **Remove** `-DCMAKE_EXE_LINKER_FLAGS=...`, `-DCMAKE_SYSROOT=...`, `-DCMAKE_FIND_ROOT_PATH=...`
- ❌ **Remove** `-DCMAKE_AR=...`, `-DCMAKE_RANLIB=...`, `-DCMAKE_STRIP=...`
- ✅ **Add** `-DCMAKE_TOOLCHAIN_FILE="${BUN_ROOT}/cmake/toolchains/ohos-aarch64.cmake"`
- ✅ Keep: `-DICU_ROOT`, `-DICU_INCLUDE_DIR`, `-DICU_LIBRARY_DIR`

**Rationale**: The toolchain file (`ohos-aarch64.cmake`) already sets:

- Compiler: `${OHOS_LLVM_DIR}/bin/aarch64-unknown-linux-ohos-clang++`
- Linker: `${OHOS_LLVM_DIR}/bin/ld.lld`
- Flags: `--target=aarch64-linux-ohos -stdlib=libc++ -fPIC`
- Library paths: `-L${OHOS_LIB_DIR}`
- All other necessary settings

By removing overrides, we ensure **consistent pure OHOS SDK toolchain** usage.

### Important: Build script prerequisite changes

Remove the LLVM 21 check (line 25-28) since we no longer need it:

```bash
# Remove these lines:
# if ! command -v clang-21 &> /dev/null; then
#     echo "ERROR: LLVM 21 not found. Install: sudo apt install llvm-21 clang-21"
#     exit 1
# fi

# Also update the LLVM version echo (line 31):
echo "=== WebKit OHOS Build ==="
echo "OHOS SDK: $OHOS_SDK_NATIVE"
echo "ICU: $ICU_ROOT"
```

**Note**: The toolchain file uses OHOS SDK's Clang 15, which fully supports C++20. No need for LLVM 21.

**Option B: Manual edit for full control (recommended)**

Replace lines 85-103 with:

```bash
# Copy to standard location
echo ""
echo "=== Installing to $WEBKIT_SOURCE/WebKitBuild/Release/ ==="
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
```

**Simpler approach**: Use sed to replace all:

```bash
sed -i 's|WebKitBuild/NewBuild|WebKitBuild/Release|g' vendor/build-webkit-ohos.sh
```

---

## Step 2: Create `.github/workflows/build-webkit-ohos.yml`

**Full workflow content**:

```yaml
name: Build WebKit for OHOS

on:
  workflow_dispatch:
    inputs:
      build_type:
        description: "Build type"
        required: true
        default: "Release"
        type: choice
        options:
          - Release
          - Debug
  push:
    branches: [ohos]
  pull_request:
    branches: [ohos]

env:
  CMAKE_BUILD_TYPE: ${{ github.event.inputs.build_type || 'Release' }}

jobs:
  build-webkit-ohos:
    name: Build WebKit for OHOS (aarch64)
    runs-on: ubuntu-22.04
    timeout-minutes: 240

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          submodules: recursive
          fetch-depth: 1

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Setup environment
        run: |
          # Add LLVM apt repository for clang-21
          wget -qO- https://apt.llvm.org/llvm-snapshot.gpg.key | sudo tee /etc/apt/trusted.gpg.d/apt.llvm.org.asc
          echo "deb http://apt.llvm.org/jammy/ llvm-toolchain-jammy-21 main" | sudo tee /etc/apt/sources.list.d/llvm-21.list
          sudo apt update
          sudo apt install -y \
            build-essential cmake ninja-build pkg-config \
            python3 curl wget unzip autoconf automake libtool \
            bison flex gperf gawk ruby ruby-dev \
            clang-21 lld-21 libc++-21-dev libc++abi-21-dev \
            qemu-user qemu-user-static \
            xz-utils
          curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
          echo "$HOME/.cargo/bin" >> $GITHUB_PATH

      - name: Install OHOS SDK
        uses: openharmony-rs/setup-ohos-sdk@v1.0.0
        with:
          version: "5.0.0"
          cache: true
          mirror: true

      - name: Setup Rust target for OHOS
        run: |
          rustup target add aarch64-unknown-linux-ohos
          export OHOS_NDK_HOME="${OHOS_SDK_NATIVE:-$HOME/setup-ohos-sdk/linux}"
          export PATH="$OHOS_NDK_HOME/llvm/bin:$PATH"
          echo "CARGO_TARGET_AARCH64_UNKNOWN_LINUX_OHOS_LINKER=$OHOS_NDK_HOME/llvm/bin/aarch64-unknown-linux-ohos-clang" >> $GITHUB_ENV
          rustup show

      - name: Setup ICU prebuilt
        run: |
          cd vendor
          # Download prebuilt ICU from GitHub release if not present
          if [ ! -d "icu-ohos/lib" ]; then
            echo "Downloading prebuilt ICU for OHOS..."
            wget -q "https://github.com/springmin/bun/releases/download/webkit-ohos-prebuilt/icu-ohos-static-libs.tar.gz" -O icu-prebuilt.tar.gz
            tar xzf icu-prebuilt.tar.gz
            rm icu-prebuilt.tar.gz
            echo "ICU prebuilt extracted."
          else
            echo "ICU already exists (cached)."
          fi
          ls -lh icu-ohos/lib/

      - name: Setup vendor/zig (needed for build-webkit-ohos.sh)
        run: |
          # The build script uses vendor/zig for building some tools
          mkdir -p vendor/zig
          cd vendor/zig
          wget -q "https://github.com/springmin/bun/releases/download/webkit-ohos-prebuilt/zig-x86_64-linux-0.15.2-custom.tar.xz" -O zig.tar.xz
          tar xf zig.tar.xz
          rm -f zig.tar.xz
          chmod +x zig
          ./zig version
          ls -la lib/

      - name: Download WebKit source
        run: |
          if [ ! -f "vendor/WebKit/CMakeLists.txt" ]; then
            echo "=== Downloading WebKit source ==="
            git clone --single-branch --branch main https://github.com/oven-sh/WebKit vendor/WebKit
          else
            echo "=== WebKit source already exists ==="
          fi

      - name: Build WebKit for OHOS
        run: |
          cd vendor
          export OHOS_SDK_NATIVE="${OHOS_SDK_NATIVE:-$HOME/setup-ohos-sdk/linux}"
          export ICU_ROOT="$PWD/icu-ohos"

          echo "=== Building WebKit for OHOS ==="
          echo "OHOS SDK: $OHOS_SDK_NATIVE"
          echo "ICU: $ICU_ROOT"

          # Call the build script
          bash build-webkit-ohos.sh

          echo "=== Build Complete ==="
          echo "Output:"
          ls -lh WebKitBuild/Release/lib/

      - name: Package WebKit prebuilt
        run: |
          cd vendor/WebKit/WebKitBuild/Release
          tar czf ../../../webkit-ohos-aarch64.tar.gz lib/ Headers/
          ls -lh ../../webkit-ohos-aarch64.tar.gz

      - name: Upload WebKit artifact
        uses: actions/upload-artifact@v4
        with:
          name: webkit-ohos-aarch64-${{ env.CMAKE_BUILD_TYPE }}
          path: vendor/WebKit/WebKitBuild/Release/../webkit-ohos-aarch64.tar.gz
          retention-days: 30

      - name: Create WebKit release
        if: github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/ohos')
        run: |
          cd vendor/WebKit/WebKitBuild/Release
          tar czf ../../webkit-ohos-aarch64-${{ env.CMAKE_BUILD_TYPE }}.tar.gz lib/ Headers/
          ls -lh ../../webkit-ohos-${{ env.CMAKE_BUILD_TYPE }}.tar.gz
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload WebKit release package
        if: github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/ohos')
        uses: softprops/action-gh-release@v2
        with:
          tag_name: webkit-ohos-prebuilt
          files: vendor/WebKit/WebKitBuild/Release/../webkit-ohos-${{ env.CMAKE_BUILD_TYPE }}.tar.gz
          generate_release_notes: true
          name: WebKit OHOS Prebuilt ${{ env.CMAKE_BUILD_TYPE }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Important notes**:

- This workflow reuses the existing `build-webkit-ohos.sh` (after fixing path)
- Downloads prebuilt ICU and zig from existing release (no build time)
- Builds WebKit from source using the hybrid toolchain
- Packages and publishes to `webkit-ohos-prebuilt` release tag

---

## Step 3: Verify Dependencies Are Tracked

Check that these files exist and are tracked by git:

```bash
ls -l vendor/build-webkit-ohos.sh
ls -l vendor/ohos-shim/ohos-libcpp-shim.h
git ls-files vendor/build-webkit-ohos.sh vendor/ohos-shim/ohos-libcpp-shim.h
```

If `ohos-libcpp-shim.h` is missing:

```bash
mkdir -p vendor/ohos-shim
git show 8258744467:vendor/ohos-shim/ohos-libcpp-shim.h > vendor/ohos-shim/ohos-libcpp-shim.h
```

---

## Step 4: Commit All Changes

```bash
# Stage everything
git add -A

# Commit
git commit -m "ci: standalone WebKit OHOS prebuilt build workflow

- Fix vendor/build-webkit-ohos.sh: output dir changed from NewBuild to Release
- Add .github/workflows/build-webkit-ohos.yml (clean, focused)
- Remove all unrelated steps (ICU build, Zig setup, Bun build)
- Use prebuilt ICU and zig from release to save time
- Build WebKit from source and publish as webkit-ohos-prebuilt
- Workflow triggered on workflow_dispatch and pushes to ohos branch
"

# Verify commit contents
git status
git diff --cached --stat
```

---

## Step 5: Push to Fork

```bash
# Push to fork/ohos
git push fork ohos

# If rejected due to remote changes, pull and rebase:
git fetch fork
git rebase fork/ohos
git push -f fork ohos
```

---

## Step 6: Trigger and Monitor CI

### Manual trigger (optional - workflow_dispatch should work):

```bash
gh workflow run build-webkit-ohos.yml -f build_type=Release
```

### Monitor progress:

```bash
# Get latest run
gh run list --workflow build-webkit-ohos.yml --branch ohos --limit 1 --json status,url,conclusion

# Check specific run (replace RUN_ID)
gh run view RUN_ID --log
```

### Expected steps order:

1. Set up job ✓
2. Checkout ✓
3. Setup environment ✓
4. Install OHOS SDK ✓
5. Setup Rust target ✓
6. Setup ICU prebuilt ✓
7. Setup vendor/zig ✓
8. Download WebKit source ✓
9. Build WebKit for OHOS (longest, 60-90 min)
10. Package WebKit prebuilt ✓
11. Upload artifact ✓
12. Create/update release (if triggered on push or dispatch) ✓

---

## Step 7: Verify Success

After workflow completes successfully:

1. **Artifact downloaded**: Check Actions page for `webkit-ohos-aarch64-Release.tar.gz`
2. **Release updated**: Visit `<https://github.com/springmin/bun/releases/tag/webkit-ohos-prebuilt>`
   - Should show new asset: `webkit-ohos-aarch64-Release.tar.gz` (or similar)
3. **Content verification** (optional):
   ```bash
   # Download and extract
   wget -q https://github.com/springmin/bun/releases/download/webkit-ohos-prebuilt/webkit-ohos-aarch64-Release.tar.gz
   tar tzf webkit-ohos-aarch64-Release.tar.gz | head -20
   # Should show:
   # lib/libJavaScriptCore.a
   # lib/libWTF.a
   # lib/libbmalloc.a
   # Headers/JavaScriptCore/PrivateHeaders/...
   # Headers/WTF/Headers/...
   ```

---

## Troubleshooting

| Symptom                                                               | Likely Cause                        | Fix                                                           |
| --------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `build-webkit-ohos.sh: line N: cd: vendor: No such file or directory` | Working directory wrong             | Ensure `cd vendor` before running script                      |
| ICU not found error                                                   | `vendor/icu-ohos` missing           | Check "Setup ICU prebuilt" step downloads correctly           |
| WebKit source download hangs                                          | Large repo (1GB+)                   | Use `actions/cache` for `vendor/WebKit` directory             |
| Build fails with "fatal error: 'algorithm' file not found"            | libc++ headers missing              | Toolchain issue - check OHOS SDK libc++ path                  |
| Build fails with ABI mismatch                                         | Mixed LLVM 15/21 artifacts          | Ensure consistent toolchain (script uses hybrid, should work) |
| Workflow dispatches not available                                     | `workflow_dispatch` missing in YAML | Verify YAML syntax and triggering branch                      |

---

## Rollback Plan

If something goes wrong:

1. **Revert commits**:

   ```bash
   git revert HEAD
   git push fork ohos
   ```

   (Or reset to previous good commit if not yet pushed)

2. **Restore previous working state**:
   - Known good commit: `1adc589bc8` (before any WebKit CI changes)
   - Bun CI is currently working at that commit

---

## Success Criteria

- ✅ Workflow runs to completion (no failed steps)
- ✅ Artifact `webkit-ohos-aarch64.tar.gz` uploaded (Actions tab)
- ✅ GitHub release `webkit-ohos-prebuilt` updated with new asset
- ✅ Artifact contains: `lib/libJavaScriptCore.a`, `lib/libWTF.a`, `lib/libbmalloc.a`, `Headers/`
- ✅ Total time < 240 minutes (workflow timeout)

---

## After Completion

Once verified successful:

1. **Update Bun OHOS CI** (`.github/workflows/build-ohos.yml`) to use newest prebuilt WebKit (it already does - downloads from release)
2. **Consider adding cache** for `vendor/WebKit` to speed up future builds
3. **Document** the process in AGENTS.md or README for future maintainers

---

## Notes

- The hybrid toolchain (LLVM 21 + OHOS libc++) is proven to work (local build on Mar 30)
- If CI fails with linker errors, investigate switching to pure OHOS SDK toolchain (requires modifying `build-webkit-ohos.sh` further)
- The `vendor/zig` binary is needed for building some WebKit tools (from prebuilt release)
- ICU prebuilt must match the OHOS target (use `icu-ohos-static-libs.tar.gz` from release)

---

**Ready to execute. Start with Step 1.**
