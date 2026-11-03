import { test } from "bun:test";
import { isOhos } from "harness";

// The first quarter of the programs takes longer than the time that a file of this runner gets on OHOS.
// run.ts reads bun:internal-for-testing when it loads, which a release build does not have: import it only where the programs run.
if (isOhos) test.skip("trimmed-is-whole/programs-1", () => {});
else (await import("./run")).testTrimmedMatchesWhole(1, 4);
