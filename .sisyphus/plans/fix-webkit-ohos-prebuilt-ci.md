# Plan: Fix and Create Standalone WebKit OHOS Prebuilt Build CI

## TL;DR

> **Goal**: Create a clean, standalone WebKit OHOS prebuilt build CI that successfully builds and packages WebKit libraries for OHOS aarch64.
>
> **Deliverables**:
>
> - Updated `vendor/build-webkit-ohos.sh` with corrected output directory
> - New `.github/workflows/build-webkit-ohos.yml` workflow (standalone)
> - All necessary files tracked in git
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - single sequential task

---

## Context

### Current Situation

- ✅ **Bun OHOS CI** (24001555729): **SUCCESS** using prebuilt WebKit/ICU
- ❌ **WebKit OHOS CI** (24002898016): **FAILED** due to missing `build-webkit-ohos-v2.sh`
- Local prebuilt WebKit exists: `vendor/WebKit/WebKitBuild/Release/lib/*.a` (built Mar 30)
- Release `<https://github.com/springmin/bun/releases/tag/webkit-ohos-prebuilt>` confirms: "Built locally with OHOS SDK Clang 15 + libc++"

### Key Findings

1. **Successful build script**: `vendor/build-webkit-ohos.sh` (original, not `-v2`)
2. **Output directory**: Currently `WebKitBuild/NewBuild`, needs to be `WebKitBuild/Release`
3. **Toolchain**: Hybrid LLVM 21 + OHOS SDK works (proven by local build)
4. **C++ requirement**: C++20 (from script flags)
5. **OHOS SDK Clang 15**: Supports C++20 ✓

---

## Work Objectives

### Core Objective

Fix the WebKit build script output path and create a clean, standalone CI workflow that builds WebKit from source and publishes prebuilt packages.

### Concrete Deliverables

1. Modify `vendor/build-webkit-ohos.sh`: Change output from `WebKitBuild/NewBuild` to `WebKitBuild/Release`
2. Create new workflow `.github/workflows/build-webkit-ohos.yml`:
   - Minimal steps: checkout → setup env → OHOS SDK → download WebKit source → build → package → release
   - No ICU build (use prebuilt from release or cache)
   - No Bun build (separate CI)
   - No vendor/zig setup (not needed for JSCOnly)
3. Ensure all required files are tracked (`vendor/build-webkit-ohos.sh`, `vendor/ohos-shim/`)
4. Push to fork and trigger successful CI run

---

## Execution Strategy

### Single Task (Sequential - No Parallelism)

- **[ ] Task 1**: Fix build script output directory
  - **File**: `vendor/build-webkit-ohos.sh`
  - **Change**: Lines 87-89 (copy to `WebKitBuild/Release/lib/` instead of `WebKitBuild/NewBuild/lib/`)
  - **Also**: Update info messages to reflect new path
  - **References**:
    - Current script lines 87-89
    - Local successful build: `vendor/WebKit/WebKitBuild/Release/lib/` exists (already correct locally)

- **[ ] Task 2**: Create clean standalone WebKit build workflow
  - **File**: `.github/workflows/build-webkit-ohos.yml`
  - **Based on**: Existing workflow but stripped down to ONLY WebKit build
  - **Steps**:
    1. Checkout (submodules: recursive)
    2. Setup environment (install LLVM 21, cmake, ninja, etc.)
    3. Install OHOS SDK (use openharmony-rs/setup-ohos-sdk)
    4. **Setup ICU**: Download prebuilt ICU from release if `vendor/icu-ohos/lib` missing
    5. Download WebKit source (git clone if not exists)
    6. **Build WebKit** using `vendor/build-webkit-ohos.sh`
    7. Package: create `webkit-ohos-aarch64.tar.gz` containing:
       - `lib/libJavaScriptCore.a`
       - `lib/libWTF.a`
       - `lib/libbmalloc.a`
       - `Headers/` (JavaScriptCore/PrivateHeaders + WTF/Headers)
    8. Upload artifact
    9. Create/update GitHub release `webkit-ohos-prebuilt` (on dispatch or ohos branch push)
  - **Remove completely**:
    - ICU build step (use prebuilt from release)
    - Zig setup (not needed)
    - Cache steps (optional: keep WebKit cache)
    - Bun configure/build steps
    - Verify/run tests steps
  - **Trigger**: `workflow_dispatch` + push to `ohos` branch
  - **Note**: WebKit requires ICU libraries; we use prebuilt `icu-ohos-static-libs.tar.gz` from release

- **[ ] Task 3**: Ensure all build dependencies are tracked
  - Check: `vendor/build-webkit-ohos.sh` ✓ (exists)
  - Check: `vendor/ohos-shim/ohos-libcpp-shim.h` ✓ (exists, needed by toolchain)
  - If missing, restore from git history (commit 8258744467 for shim)

- **[ ] Task 4**: Commit, push to fork, and trigger CI
  - Commit changes with message "ci: standalone WebKit OHOS prebuilt build"
  - Push to fork `ohos` branch
  - Manually trigger workflow dispatch to test
  - Monitor until success

---

## Verification Strategy

After pushing, verify:

1. **Workflow triggered**: Check `<https://github.com/springmin/bun/actions>` for `build-webkit-ohos.yml` run
2. **Build progress**: Should see "Build WebKit for OHOS" step executing `build-webkit-ohos.sh`
3. **Completion**: All steps green, artifact uploaded
4. **Release updated**: New asset `webkit-ohos-aarch64.tar.gz` appears in `<https://github.com/springmin/bun/releases/tag/webkit-ohos-prebuilt>`
5. **Artifact contents**: Extract and verify structure:
   ```
   lib/
     libJavaScriptCore.a
     libWTF.a
     libbmalloc.a
   Headers/
     JavaScriptCore/PrivateHeaders/...
     WTF/Headers/...
   ```

---

## Potential Issues & Mitigations

| Issue                                                | Cause                                        | Fix                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `build-webkit-ohos.sh` fails with LLVM 21 ABI errors | OHOS libc.a incompatible with LLVM 21 linker | Script already worked locally; if fails in CI, adjust to use OHOS SDK tools exclusively                            |
| WebKit source download too slow (1GB+)               | GitHub clone timeout                         | Cache in actions/cache, or use shallow clone                                                                       |
| CI timeout (240min limit)                            | WebKit build takes 60-90min                  | Acceptable; optimize later if needed                                                                               |
| Missing ICU headers                                  | Build script expects ICU in vendor/icu-ohos  | Prebuilt package already uses vendor/icu-ohos from previous CI; ensure it exists or skip if not needed for JSCOnly |

---

## Commit Strategy

1. Single commit with all changes:

   ```
   ci: standalone WebKit OHOS prebuilt build workflow

   - Fix vendor/build-webkit-ohos.sh output directory (NewBuild → Release)
   - Add .github/workflows/build-webkit-ohos.yml (minimal, focused)
   - Remove all unrelated steps (ICU build, Bun build, etc.)
   - Release upload on workflow_dispatch and ohos branch push
   ```

---

## Success Criteria

- ✅ Workflow runs to completion without errors
- ✅ Artifact `webkit-ohos-aarch64.tar.gz` uploaded
- ✅ Release `webkit-ohos-prebuilt` updated with new asset
- ✅ Artifact contains correct library files and headers
- ✅ Total CI time < 240 minutes

---

## Next Steps After Success

Once WebKit prebuilt CI is stable:

- Ensure it runs automatically on ohos branch pushes
- Document build process in AGENTS.md or README
- Optionally: Add schedule trigger for periodic updates
- Link WebKit CI run status to Bun OHOS CI (cache invalidation)
