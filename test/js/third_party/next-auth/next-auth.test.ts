import { describe, expect, it } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { bunEnv, bunExe, bunRun, isCI, isOhos, isWindows, runBunInstall, tmpdirSync } from "harness";
import { join } from "path";
describe("next-auth", () => {
  // This test OOMs on Windows.
  it.todoIf(isCI && isWindows)(
    "should be able to call server action multiple times using auth middleware #18977",
    async () => {
      const testDir = tmpdirSync("next-auth-" + Date.now());

      cpSync(join(import.meta.dir, "fixture"), testDir, {
        recursive: true,
        force: true,
        filter: src => {
          if (src.includes("node_modules")) {
            return false;
          }
          if (src.startsWith(".next")) {
            return false;
          }
          return true;
        },
      });

      if (isOhos) {
        // OHOS: prefer the HarmonyOS port of next and its SWC binding. The
        // loader picks the OpenHarmony triple from the platform, which the
        // preload presents before next is imported.
        const pkgPath = join(testDir, "package.json");
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        pkg.dependencies.next = "npm:@ohos-ports/next@16.2.9-beta.0";
        pkg.dependencies["@ohos-ports/next-swc-openharmony-arm64"] = "16.2.9-beta.0";
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        writeFileSync(
          join(testDir, "ohos-platform-preload.js"),
          `Object.defineProperty(process, "platform", { value: "openharmony", configurable: true });\n` +
            `try { const os = require("os"); Object.defineProperty(os, "platform", { value: () => "openharmony", writable: true, configurable: true }); } catch {}\n`,
        );
        writeFileSync(join(testDir, "bunfig.toml"), `preload = ["./ohos-platform-preload.js"]\n`);

        // next 16 dropped the `eslint` config key that the fixture still sets.
        const configPath = join(testDir, "next.config.ts");
        writeFileSync(configPath, readFileSync(configPath, "utf8").replace(/\n\s*eslint:\s*\{\n[^}]*\},\n/, "\n"));

        // next 16 deprecated the `middleware` file convention in favour of
        // `proxy` (same default export), and warns until it is renamed.
        cpSync(join(testDir, "src/middleware.ts"), join(testDir, "src/proxy.ts"));
        rmSync(join(testDir, "src/middleware.ts"));
      }

      console.log("running bun install");
      if (isOhos) {
        // OHOS packages declare `os: ["openharmony"]`; the installer only
        // selects them with the platform flag.
        await using install = Bun.spawn({
          cmd: [bunExe(), "install", "--os=openharmony", "--cpu=arm64"],
          cwd: testDir,
          env: bunEnv,
          stdout: "pipe",
          stderr: "pipe",
        });
        const [stderr, exitCode] = await Promise.all([install.stderr.text(), install.exited]);
        if (exitCode !== 0) throw new Error(`bun install failed:\n${stderr}`);

        // The port's SWC package reports a prerelease version, which next warns
        // about; expose it under the name next resolves with the version it
        // expects.
        const swcPkgPath = join(testDir, "node_modules/@ohos-ports/next-swc-openharmony-arm64/package.json");
        const swcPkg = JSON.parse(readFileSync(swcPkgPath, "utf8"));
        swcPkg.version = "16.2.9";
        writeFileSync(swcPkgPath, JSON.stringify(swcPkg, null, 2));
        mkdirSync(join(testDir, "node_modules/@next"), { recursive: true });
        symlinkSync(
          "../@ohos-ports/next-swc-openharmony-arm64",
          join(testDir, "node_modules/@next/swc-openharmony-arm64"),
        );
      } else {
        await runBunInstall(bunEnv, testDir, { savesLockfile: false });
      }

      console.log("starting server");
      const result = await bunRun(join(testDir, "server.js"), {
        AUTH_SECRET: "I7Jiq12TSMlPlAzyVAT+HxYX7OQb/TTqIbfTTpr1rg8=",
      });

      console.log(result.stdout);
      console.log(result.stderr);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBeDefined();
      const lines = result.stdout?.split("\n") ?? [];
      expect(lines[lines.length - 1]).toMatch(/request sent/);
      expect(result.exitCode).toBe(0);
    },
    // The install of next plus the dev server startup takes ~1 minute on the
    // OHOS device.
    isOhos ? 300_000 : 90_000,
  );
});
