import { test } from "bun:test";
import { isOhos } from "harness";

// The first quarter of the programs takes longer than the time that a file of this runner gets on OHOS.
// The programs do not run on OHOS, so do not load run.ts there.
if (isOhos) test.skip("trimmed-is-whole/programs-1", () => {});
else (await import("./run")).testTrimmedMatchesWhole(1, 4);
