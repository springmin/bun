# OHOS upstream PR roadmap

Status: RFC [#47951](https://github.com/oven-sh/bun/issues/47951) is open; the umbrella PR
[#30917](https://github.com/oven-sh/bun/pull/30917) is closed; the first focused PR is
[#47952](https://github.com/oven-sh/bun/pull/47952).

The reference implementation is the `ohos-aarch64` branch of this fork. The file-level inventory
of every OHOS change is in [`docs/ohos-adaptation-checklist.md`](ohos-adaptation-checklist.md);
this document is the review/landing order, not a second inventory.

## Rules for every PR

- One concern per PR, scoped to the narrowest change that fixes it. Diff size itself is a reason
  for changes-requested.
- No behavior change on Linux/macOS/Windows. Every behavioral change ships a test; every existing
  test that must skip on OHOS carries the observed reason.
- Platform parity audit: grep every `cfg`/platform gate, dispatch chain, parallel build script,
  test skip and allowlist; comment why OHOS is included/excluded.
- `cfg(target_env = "ohos")` for platform code; `isOhos` in the test harness; no silent skips.
- Green CI on every existing platform is a hard precondition. A fork PR needs a maintainer to
  trigger Buildkite; the cross-build lane (P18) is the first ask.
- The PR description is the squash-commit message: root cause, exact change, test commands,
  platform matrix, `Fixes #N`.
- Rebase on `main`; no merge commits, no drive-by refactors, no debug residue or `.only`.
- Release/signing/SDK tooling stays in this fork unless maintainers explicitly want it.

## Preparation pipeline

The queue is machine-readable in [`docs/ohos-upstream-prs.json`](ohos-upstream-prs.json); the
extracted patches are in [`patches/ohos-upstream/`](../patches/ohos-upstream/); the helper is
`scripts/ohos/upstream-prs.ts`:

```bash
bun scripts/ohos/upstream-prs.ts status
bun scripts/ohos/upstream-prs.ts check P1
bun scripts/ohos/upstream-prs.ts prepare P1
bun scripts/ohos/upstream-prs.ts open P1 --draft   # gated by dependsOn; P1 needs --force until the RFC is answered
```

`prepare` only creates a worktree and applies the patch; nothing is opened automatically. The
integration branch `ohos-aarch64` stays the full implementation, and the queue is an extraction of
it.

Current queue status: P1/P2/P3 prepared (P3 has no focused test yet); P4 is the submitted
`#47952`; P5/P7/P8 patches are WIP and must be split; P6 is design-needed (the fork currently
hardcodes OHOS in the syscall layer instead of probing); P15/P16 are WebKit patches; P8–P14 and
P17–P19 are deferred until their prerequisites land; P20 stays downstream.

## Phase 1 — independent / generic

These do not require a new platform decision (P1 does; P3/P4/P6 are independent).

| ID | PR | Files / scope | Depends on | Tests |
|----|----|---------------|------------|-------|
| P1 | `build: add aarch64-unknown-linux-ohos as a cross-compile target` | `scripts/build/config.ts`, `flags.ts`, `rust.ts`, `source.ts`, `bun.ts`, `deps/{webkit,zstd}.ts`, CLI | RFC direction | cross-build job; no runtime change |
| P2 | `test: add isOhos and require a reason on platform skips` | `test/harness.ts`, harness helpers | P1 | existing suites |
| P3 | `spawn: fall back when exit_group is unavailable` | `src/jsc/bindings/bun-spawn.cpp` (`rawExit`) | — | needs a focused test or maintainer decision |
| P4 | `node:os: parse /proc/cpuinfo without hardcoded prefixes` | `src/runtime/node/node_os.rs` | — | **submitted #47952** (6 unit tests) |
| P5 | `resolver: ignore EACCES/EPERM from unreadable ancestors` | `src/resolver/{lib,resolver,fs,package_json}.rs` | P1 | resolver suite; OHOS-gated, not global |
| P6 | `sys: probe epoll_pwait2/close_range/openat2/fchmodat2 at runtime` | `src/sys/linux_syscall.rs`, `src/platform/linux.rs` | — | design needed: the fork's openat2 hunk is OHOS-gated and belongs to P8; a real probe must try the syscall and fall back on ENOSYS/EPERM |
| P7 | `crash_handler: give OHOS its own trace platform characters` | `src/crash_handler/lib.rs`, `src/bun_core/env.rs` | P1 | crash tests |

P3/P4/P6 can land before the platform decision. P1 is the enabler for every
`cfg(target_env = "ohos")` change; P2 follows P1. P5 is intentionally OHOS-gated: the old
generic #30914 changed resolver behavior on every platform, which is not wanted.

## Phase 2 — OHOS-gated runtime (one subsystem per PR)

All depend on P1 and P2; P9–P14 also depend on P8.

| ID | PR | Files / scope | Depends on |
|----|----|---------------|------------|
| P8 | `sys: OHOS syscall layer` | `src/sys/*`, `src/platform/*`, `src/spawn_sys/*` | P1, P6 |
| P9 | `event_loop: OHOS epoll rearm/EEXIST/one-shot` | `src/io/posix_event_loop.rs`, `PipeReader.rs`, `PipeWriter.rs` | P8 |
| P10 | `spawn: OHOS waiter-thread eventfd + fork path` | `src/spawn/process.rs`, `src/runtime/bin_entry/mod.rs`, `bun-spawn.cpp` | P8 |
| P11 | `fs: OHOS hmdfs/path watcher` | `src/runtime/node/node_fs.rs`, `path_watcher.rs`, resolver temp dir | P8 |
| P12 | `install: OHOS hardlink→copy, temp dir and os mapping` | `src/install/*`, `src/install_types/resolver_hooks.rs` | P8 |
| P13 | `terminal: OHOS epoll workaround` | `src/runtime/api/bun/Terminal.rs`, `src/io/*` | P9 |
| P14 | `node:os: OHOS userInfo sandbox` | `src/runtime/api/bun/ohos_node_userinfo.rs`, `node_os.rs` | P1 |

P8–P12 can be worked in parallel once P8 lands; P13 waits for P9. Every PR includes the tests
from the fork's `test/` tree and the relevant OHOS skips with reasons.

## Phase 3 — WebKit

The two OHOS patches are WebKit changes, not Bun runtime changes:

| ID | PR | Repository | Depends on |
|----|----|------------|------------|
| P15 | `suspend-resume` (WTF semaphore/sigsuspend hardening) | `oven-sh/WebKit` | — |
| P16 | `aot-anonymous-code` (AOT image loading) | `oven-sh/WebKit` | — |
| P17 | `build: bump WEBKIT_VERSION for OHOS` | `oven-sh/bun` (`scripts/build/deps/webkit.ts`) | P15, P16, P1 |

If WebKit does not accept an OHOS-only patch, the alternative is a WebKit fork revision pinned
from Bun; that needs maintainer agreement. Do not carry a build-time `git apply` patch against
vanilla WebKit in an upstream Bun PR.

## Phase 4 — CI and release

| ID | PR | Scope | Depends on |
|----|----|-------|------------|
| P18 | `ci: OHOS cross-build lane` | GitHub Actions/Buildkite cross-build only (Ubuntu + OHOS SDK) | P1 |
| P19 | `ci: OHOS device test lane` | self-hosted OHOS runner; full/gated suite | P2–P14 |
| P20 | release/signing | `src/ohos_sign`, `src/sys/ohos_sign_io.rs`, `scripts/ohos/*`, release workflow | downstream unless wanted |

P18 unblocks review of P1/P8–P14 without requiring a device. P19 is the long-term gate. P20 is
deliberately downstream: the OHOS SDK and signing policy are not Bun runtime concerns.

## Old small PRs

- `#30315` (ARM `/proc/cpuinfo`) — superseded by P4/#47952; the old diff was against Zig, P4 is
  the Rust implementation with tests.
- `#30316` (Blob nested arrays) — already fixed upstream; `new Blob([["hello"]])` returns
  `"hello"` on current main. No PR needed.
- `#30343` (spawn) — the vfork fallback is obsolete: upstream uses `bun_clone3_vfork`; only the
  `rawExit` feature check remains, as P3.
- `#30914` (resolver EPERM/EACCES) — not upstreamed; the fork now gates it to OHOS (P5).
- `#30915` (unused Zig codegen) — obsolete; the Zig codegen is gone.

## Validation matrix

- Existing platforms: `bun bd test` on Linux x64/aarch64 (glibc/musl), macOS x64/arm64, Windows;
  `bun run rust:check-all`; `bun run lint`/`fmt`.
- OHOS: the on-device runner in this fork; each `isOhos` skip names the observed failure.
- Build-only PRs: `--os=ohos --configure-only` cross-build in P18.
- WebKit: tests in the WebKit repository; P17 only bumps the pin and runs the Bun build.

## Open questions for maintainers

1. Does upstream want OHOS as a supported target at all?
2. Who sponsors the series and the CI lane (Buildkite cross-build first, device later)?
3. Are the two WebKit patches acceptable in `oven-sh/WebKit`, or should Bun pin a fork?
4. Should signing/release tooling stay downstream (current assumption)?

## AOT compiler rewrite (upstream #47942)

The fork is rebased on `oven-sh/bun` main `2596ac5d391` ("AOT: the Bun side of
the rewritten ahead-of-time compiler", #47942), with the OHOS adaptation
reapplied on top:

- WebKit pin: `5a61071f79134bf41844e7ea31a8449147d85dd4`.
- `aot-anonymous-code.patch`: the OHOS anonymous-code fallback is adapted to
  the new `mapCodeOfImage()` file branch.
- `suspend-resume.patch`: unchanged.
- `ohos-icu-utf16.patch`: the rewritten WTF headers need explicit
  `<unicode/utf16.h>`/`<unicode/uchar.h>` includes.
- `scripts/build/deps/webkit.ts`: OHOS takes ICU from `ohosIcuDir` (or
  `BUN_ICU_ROOT`), as Linux does.
- `scripts/ohos/build-bun-ohos-native.sh`: accepts a WebKit worktree whose
  `.git` is a file.

The 70 files matching `test/aot/*mock*.test.ts` run 0 fail on the merged
build, including `mock-builtin-live` and the layered jest/vitest cases.
`package.json` is `1.4.4`, matching the latest upstream release tag
`bun-v1.4.4`.

## Full test run (2026-11-09)

- 3,710 files. The merged run recorded 3,637 pass / 72 fail, with one file
  missing a report line because the first segment ended in an environment OOM.
- Isolated reruns and mirror fixes recovered 50; the final file-level result is
  **3,688 pass / 22 fail (99.41%)**, 0 timeout. AOT is **1,047 / 1,067
  (98.13%)**.
- 14 remaining failures are OHOS platform semantics: anonymous code mapping and
  the smaller ASLR range, `/proc` and memory accounting, the loader/ELF and
  temp-file permissions, and stack/fault/termios behavior. 8 are new AOT engine
  table/trim/payload gaps and stay visible until reproduced on Linux.
- Report: `/storage/Users/currentUser/exchanges/ci-test/ohos-test-report-20261109.md`.
- Mirror note: `rsync --exclude='build'` also excludes `scripts/build`; use
  `--exclude='/build'`. Test fixture `node_modules` must be copied separately.

## Test skip audit (2026-11-09)

Re-checked every `isOhos` skip in `test/` against the built runtime.

- Removed obsolete skips: `cpu-prof` (16/17 pass; only the `--parallel`
  extra-worker case remains), `node:vm` (374 pass), `bun:ffi` `cc` and
  `cc-shares`, `spawn.ipc`, and AOT `texts-that-tell-builds-apart`.
- Source fixes: `Listener.stop(true)` now clears `data` with connections
  still open; `operator new` reports OOM when OHOS `mi_new` returns null;
  `process.execve` stops/restarts the CPU profiler around the syscall.
- Kept skips that are real platform differences: sandbox hard links and
  `ulimit` limits, non-loopback interfaces, patchelf, memfd, AOT signal
  mapping, and the 78.3 vs 79.1 ICU floor.
- Fixed: `bun test --parallel` respawns a worker only for a range that no
  live worker owns, so `cpu-prof --parallel` writes two profiles again
  (1 pass / 0 fail).
- Kept as source candidates, not hidden: TLS/WebSocket send-path
  backpressure on OHOS, trim-report interpreter retention, and
  carrier/payload layout.

## NDK 26.0.0.38

- The installed SDK moved from `26.0.0.18_2` to `26.0.0.38`. The SDK's
  clang/lld are still 15.0.4 and the libc symbol set is unchanged.
- A shell exported before the upgrade kept `OHOS_SYSROOT` on the old
  Cellar path; because that directory still exists, the first post-upgrade
  build silently linked against the old NDK. `build-bun-ohos-native.sh`
  now compares `OHOS_SYSROOT` with the current `opt/ohos-sdk` sysroot and
  uses the current SDK with a warning.

- carrier tail: the plain `--compile` path also overwrites an appended
  tail; it is the signed ELF's `.codesign`/section-table overlay, not
  only the trim path.
- trim-report: the OHOS `--lto=off` build merges interpreter ranges with
  always-kept tool features; `--gc-sections` does not change the table.
  Matching Linux needs LTO or a linker-layout change.
