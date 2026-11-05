# OHOS upstream patch queue

Patches in this directory are generated from the fork's `ohos-aarch64` branch against
`oven/main` at `b1007f1177` (2026-11-05). They are the **source for preparing** an upstream PR; they
are not a request to apply all of them at once.

| Patch | State | Notes |
|-------|-------|-------|
| `P1-build.patch` | prepared | Build-only: 13 files under `scripts/build/`; ~349 insertions. Split if reviewers ask. |
| `P2-harness.patch` | prepared | `test/harness.ts` only; `isOhos`, TMPDIR, `--expose-internals`. |
| `P3-exitgroup.patch` | prepared, no focused test | Generic `rawExit` fallback; maintainers may fold it into the OHOS spawn PR. |
| `P4-cpuinfo.patch` | submitted | Superseded #30315; upstream PR `oven-sh/bun#47952`. |
| `P5-resolver-wip.patch` | **WIP** | Contains EACCES/EPERM (P5), setrlimit (P11) and temp-dir (P11); split before opening. |
| `P7-crash-wip.patch` | **WIP** | Contains IS_OHOS/IS_MUSL (foundation), SIGSYS (P8) and crash trace chars (P7); split. |
| `P8-openat2-wip.patch` | **WIP** | The fork hardcodes OHOS openat2; only this slice is separated. P6 (generic runtime probes) is still design-needed. |
| `webkit/P15-suspend-resume.patch` | prepared | Submit to `oven-sh/WebKit`, not Bun. |
| `webkit/P16-aot-anonymous-code.patch` | prepared | Submit to `oven-sh/WebKit`, not Bun. |

## Use the pipeline script

```bash
bun scripts/ohos/upstream-prs.ts status
bun scripts/ohos/upstream-prs.ts check P1
bun scripts/ohos/upstream-prs.ts prepare P1          # worktree under $TMPDIR/ohos-upstream-prs/p1
bun scripts/ohos/upstream-prs.ts open P1 --draft     # pushes and opens; gated by dependsOn
```

- `prepare` applies the patch with `git apply --3way` on a fresh worktree from `oven/main`; it
  commits locally but does not push unless `--push`.
- `open` refuses while a dependency has no merged PR (and always requires `--force` for P1, because
  the RFC is a decision rather than a PR). It does not run automatically.
- `check` only verifies that a patch applies on the current `oven/main`.

## Keeping the queue current

- If `oven/main` moves, set `BUN_OHOS_UPSTREAM_REF=<ref>` for `check`/`prepare`, or rebase the
  prepared worktree; patches generated against an old `main` may fail with `--3way`.
- WIP patches must be split by hunk/subsystem before `open`; never open a WIP patch as-is.
- The integration branch remains `ohos-aarch64`; the full implementation is there, and the queue is
  an extraction of it, not a second implementation.
