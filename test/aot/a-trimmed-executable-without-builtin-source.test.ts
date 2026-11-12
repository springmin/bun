// OHOS: a trimmed executable has no built-in source text. JSC links the built-ins that a realm starts with from the image; if one is
// missing it aborts in allocateCell<NativeExecutable>. The image has to hold every one of them.
import { expect } from "bun:test";
import { bunEnv, bunExe, isOhos, tempDir } from "harness";
import { join } from "node:path";
import { canTrim } from "../bundler/compile-trim-features";
import { run } from "./harness/run";
import { withoutDebugInformation } from "./harness/without-debug-information";
import { describe, test } from "./supported";

describe.skipIf(!isOhos || !canTrim)("a trimmed executable without the source of the built-ins", () => {
  test(
    "runs, and its image validates",
    async () => {
      using dir = tempDir("aot-trim-no-source", {
        "main.js": `console.log(40 + 2);\n`,
      });
      const executable = join(String(dir), "program");
      const built = await run(
        [
          bunExe(),
          "build",
          "--compile",
          ...withoutDebugInformation,
          "--aot",
          "--trim",
          "main.js",
          "--outfile",
          executable,
        ],
        String(dir),
      );
      expect({ stderr: built.stderr, exitCode: built.exitCode }).toEqual({
        stderr: expect.any(String),
        exitCode: 0,
      });

      const ran = await run([executable], String(dir));
      expect(ran.stdout).toBe("42\n");
      expect(ran.stderr).toBe("");
      expect(ran.exitCode).toBe(0);

      const validated = await run([executable], String(dir), {
        ...bunEnv,
        BUN_JSC_validateBytecode: "true",
      });
      expect(validated.stdout).toBe("42\n");
      expect(validated.exitCode).toBe(0);
    },
    120_000,
  );
});
