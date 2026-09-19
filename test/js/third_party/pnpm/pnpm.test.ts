import { expect, it } from "bun:test";
import { bunEnv, bunExe, isOhos, tmpdirSync } from "harness";
import { cpSync } from "node:fs";
import * as path from "node:path";

// The fixture's build step runs vite 5, which bundles with esbuild. OHOS:
// prefer the HarmonyOS esbuild port, and install the musl rollup binding
// alongside the HarmonyOS one so the build can pick the one that loads.
it("successfully traverses pnpm-generated install directory", async () => {
  const package_dir = tmpdirSync();
  console.log(package_dir);

  cpSync(path.join(__dirname, "install_fixture"), package_dir, { recursive: true });

  if (isOhos) {
    const pkgPath = path.join(package_dir, "package.json");
    const pkg = await Bun.file(pkgPath).json();
    pkg.pnpm = {
      ...pkg.pnpm,
      overrides: { ...pkg.pnpm?.overrides, esbuild: "npm:@ohos-ports/esbuild@0.25.5-beta.0" },
      supportedArchitectures: { os: ["linux", "openharmony"], cpu: ["arm64"], libc: ["musl"] },
    };
    await Bun.write(pkgPath, JSON.stringify(pkg, null, 2));
    // The lockfile no longer matches the overrides above; pnpm would refuse a
    // frozen install.
    await Bun.write(path.join(package_dir, "pnpm-lock.yaml"), "");
  }

  let exited;

  //

  ({ exited } = Bun.spawn({
    // The esbuild port's postinstall validates the binary version and fails on
    // its prerelease package version; its binary is provided to the build via
    // ESBUILD_BINARY_PATH instead.
    cmd: isOhos ? [bunExe(), "x", "pnpm@9.15.6", "install", "--ignore-scripts"] : [bunExe(), "x", "pnpm@9.15.6", "install"],
    cwd: path.join(package_dir),
    stdio: ["ignore", "inherit", "inherit"],
    env: bunEnv,
  }));
  expect(await exited).toBe(0);
  console.log(2);

  //

  let buildEnv = bunEnv;
  let buildCmd = [bunExe(), "run", "build"];
  if (isOhos) {
    // Run the fixture's scripts on Bun so rollup selects its musl binding, and
    // point esbuild at the HarmonyOS binary the port installed.
    const esbuildBin = path.join(
      package_dir,
      "node_modules/.pnpm/@ohos-ports+esbuild-openharmony-arm64@0.25.5-beta.0/node_modules/@ohos-ports/esbuild-openharmony-arm64/bin/esbuild",
    );
    buildCmd = [bunExe(), "--bun", "run", "build"];
    buildEnv = { ...bunEnv, ESBUILD_BINARY_PATH: esbuildBin };
  }
  ({ exited } = Bun.spawn({
    cmd: buildCmd,
    cwd: path.join(package_dir),
    stdio: ["ignore", "inherit", "inherit"],
    env: buildEnv,
  }));
  expect(await exited).toBe(0);
  console.log(3);
}, isOhos ? 300_000 : 100_000);
