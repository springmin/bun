import { spawn } from "bun";
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, rm, writeFile } from "fs/promises";
import { bunExe, bunEnv as env, isArm64, isOhos, isWindows, tempDir } from "harness";
import { join } from "path";

// esbuild@0.19.8 does not support win32-arm64 at runtime
const isWindowsArm64 = isWindows && isArm64;

// OHOS: prefer the HarmonyOS port of esbuild (same API, OHOS binary).
const esbuildVersion = isOhos ? "0.25.5" : "0.19.8";
const esbuildOverride = isOhos ? { overrides: { esbuild: "npm:@ohos-ports/esbuild@0.25.5-beta.0" } } : {};

beforeAll(() => {
  setDefaultTimeout(1000 * 60 * 5);
});

describe.concurrent("esbuild integration test", () => {
  test.skipIf(isWindowsArm64)("install and use esbuild", async () => {
    using dir = tempDir("esbuild-test", {
      "package.json": JSON.stringify({
        name: "bun-esbuild-test",
        version: "1.0.0",
        // OHOS: install the HarmonyOS port under the `esbuild` name so its bin
        // and the package's self-require resolve.
        ...(isOhos ? { dependencies: { esbuild: "npm:@ohos-ports/esbuild@0.25.5-beta.0" } } : {}),
      }),
    });
    const packageDir = dir + "";

    var { stdout, stderr, exited } = spawn({
      cmd: isOhos ? [bunExe(), "install", "--os=openharmony", "--cpu=arm64"] : [bunExe(), "install", "esbuild@0.19.8"],
      cwd: packageDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    });

    var err = await stderr.text();
    var out = await stdout.text();
    expect(err).toContain("Saved lockfile");
    expect(out).toContain(isOhos ? "0.25.5" : "esbuild@0.19.8");
    expect(await exited).toBe(0);

    ({ stdout, stderr, exited } = spawn({
      cmd: [bunExe(), "esbuild", "--version"],
      cwd: packageDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    }));

    err = await stderr.text();
    out = await stdout.text();
    expect(err).toBe("");
    expect(out).toContain(esbuildVersion);
    expect(await exited).toBe(0);
  });

  test.skipIf(isWindowsArm64)("install and use estrella", async () => {
    using dir = tempDir("esbuild-estrella-test", {
      "package.json": JSON.stringify({
        name: "bun-esbuild-estrella-test",
        version: "1.0.0",
        ...esbuildOverride,
      }),
    });
    const packageDir = dir + "";

    let { stdout, stderr, exited } = spawn({
      cmd: [bunExe(), "install", "estrella@1.4.1"],
      cwd: packageDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    });
    let exitCode = 0;
    let err = "";
    let out = "";

    [err, out, exitCode] = await Promise.all([new Response(stderr).text(), new Response(stdout).text(), exited]);
    expect(err).toContain("Saved lockfile");
    expect(out).toContain("estrella@1.4.1");
    expect(exitCode).toBe(0);

    ({ stdout, stderr, exited } = spawn({
      cmd: [bunExe(), "estrella", "--estrella-version"],
      cwd: packageDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    }));

    [err, out, exitCode] = await Promise.all([new Response(stderr).text(), new Response(stdout).text(), exited]);
    expect(err).toBe("");
    expect(out).toContain("1.4.1");
    expect(exitCode).toBe(0);

    await cp(join(import.meta.dir, "build-file.js"), join(packageDir, "build-file.js"));

    ({ stdout, stderr, exited } = spawn({
      cmd: [bunExe(), "estrella", "build-file.js"],
      cwd: packageDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    }));

    [err, out, exitCode] = await Promise.all([stderr.text(), stdout.text(), exited]);

    await rm(join(packageDir, "node_modules"), { recursive: true, force: true });
    await rm(join(packageDir, "bun.lockb"), { force: true });

    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({
        name: "bun-esbuild-estrella-test",
        version: "1.0.0",
        dependencies: {
          "estrella": "1.4.1",
          // different version of esbuild
          // OHOS: the only fully-working HarmonyOS port is 0.25.5-beta.0; the
          // 0.28.1 ports look up an unpublished @esbuild/openharmony-arm64.
          "esbuild": isOhos ? "npm:@ohos-ports/esbuild@0.25.5-beta.0" : "0.19.8",
        },
        ...esbuildOverride,
      }),
    );

    ({ stdout, stderr, exited } = spawn({
      cmd: isOhos ? [bunExe(), "install", "--os=openharmony", "--cpu=arm64"] : [bunExe(), "install"],
      cwd: packageDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    }));

    [err, out, exitCode] = await Promise.all([stderr.text(), stdout.text(), exited]);
    expect(err).toContain("Saved lockfile");
    expect(out).toContain("estrella@1.4.1");
    expect(out).toContain(isOhos ? "0.25.5" : "esbuild@0.19.8");
    expect(exitCode).toBe(0);

    ({ stdout, stderr, exited } = spawn({
      cmd: [bunExe(), "estrella", "--estrella-version"],
      cwd: packageDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    }));

    [err, out, exitCode] = await Promise.all([stderr.text(), stdout.text(), exited]);
    expect(err).toBe("");
    expect(out).toContain("1.4.1");
    expect(exitCode).toBe(0);

    ({ stdout, stderr, exited } = spawn({
      cmd: [bunExe(), "esbuild", "--version"],
      cwd: packageDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    }));

    [err, out, exitCode] = await Promise.all([stderr.text(), stdout.text(), exited]);
    expect(err).toBe("");
    expect(out).toContain(isOhos ? "0.25.5" : "0.19.8");
    expect(exitCode).toBe(0);

    ({ stdout, stderr, exited } = spawn({
      cmd: [bunExe(), "esbuild", "--version"],
      cwd: join(packageDir, "node_modules/estrella"),
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    }));

    [err, out, exitCode] = await Promise.all([stderr.text(), stdout.text(), exited]);
    expect(err).toBe("");
    // OHOS: both slots resolve the same HarmonyOS port.
    expect(out).toContain(isOhos ? "0.25.5" : "0.11.23");
    expect(exitCode).toBe(0);

    ({ stdout, stderr, exited } = spawn({
      cmd: [bunExe(), "estrella", "build-file.js"],
      cwd: packageDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    }));

    [err, out, exitCode] = await Promise.all([stderr.text(), stdout.text(), exited]);
    expect(err).toBe("");
    expect(out).toBe('console.log("hello"),console.log("estrella");\n');
    expect(exitCode).toBe(0);
  });
});
