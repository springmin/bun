// https://github.com/oven-sh/bun/issues/32492
import { expect, test } from "bun:test";
import { bunEnv, bunExe, isOhos, tempDir } from "harness";

test("concurrent bun build does not stall on worker-pool shutdown", async () => {
  const N_MODULES = 40;
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "repro-32492", version: "0.0.0" }),
  };
  // A chain of modules so each entry bundles real work and warms the pool.
  for (let i = 1; i <= N_MODULES; i++) {
    const next = i + 1;
    files[`src/m${i}.ts`] =
      i < N_MODULES
        ? `import { v${next} } from "./m${next}";\nexport const v${i} = ${i} + v${next};\nexport function f${i}() { return v${i} * 2; }\n`
        : `export const v${i} = ${i};\nexport function f${i}() { return v${i} * 2; }\n`;
  }
  const entries = ["browser", "node", "bun", "worker", "schema", "graph", "media", "compress"];
  for (const e of entries) {
    files[`src/${e}-entry.ts`] = `import { v1, f1 } from "./m1";\nconsole.log("${e}", v1, f1());\n`;
  }

  using dir = tempDir("bun-build-pool-shutdown", files);
  const root = String(dir);

  // OHOS: 24-way concurrency makes a normal build take ~18s on-device (measured:
  // 1.2s single, 3.7s at 4-way, 5.5s at 6-way, 18.2s at 24-way), which is past
  // the 10s stall floor and cannot be told apart from the regression. Six-way
  // oversubscription keeps a normal round at ~5.5s, so a stalled build (the
  // fixed 10s idle-futex timeout) still lands well above the threshold below.
  const CONCURRENCY = isOhos ? 6 : 24;
  const ROUNDS = isOhos ? 4 : 16;
  // The regression is a fixed 10s idle-futex timeout, so a stalled build always
  // exceeds 10s regardless of machine speed. A healthy build is well under a
  // second; keep the threshold high so 24-way oversubscription on a slow ASAN
  // shard can't trip it, while staying comfortably below the 10s floor.
  // OHOS: at 6-way concurrency a healthy round is ~5.5s; a stalled build adds
  // the fixed 10s idle-futex timeout (~15.5s), so 12s still separates the two.
  const STALL_MS = isOhos ? 12_000 : 9000;

  const buildOnce = async (round: number, i: number) => {
    const entry = entries[i % entries.length];
    const started = Date.now();
    await using proc = Bun.spawn({
      cmd: [
        bunExe(),
        "build",
        "--target=browser",
        "--sourcemap=external",
        "--packages=external",
        "--outdir",
        `${root}/out/d${round}_${i}`,
        `./src/${entry}-entry.ts`,
      ],
      env: bunEnv,
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    return { ms: Date.now() - started, exitCode, stdout, stderr };
  };

  for (let round = 0; round < ROUNDS; round++) {
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => buildOnce(round, i)));
    const failed = results.find(r => r.exitCode !== 0);
    if (failed) {
      throw new Error(`bun build exited with ${failed.exitCode}\nstdout:\n${failed.stdout}\nstderr:\n${failed.stderr}`);
    }
    const slowestMs = Math.max(...results.map(r => r.ms));
    expect(slowestMs).toBeLessThan(STALL_MS);
  }
}, isOhos ? 300_000 : 120_000);
