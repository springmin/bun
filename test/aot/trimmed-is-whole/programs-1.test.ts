import { isOhos } from "harness";
import { testTrimmedMatchesWhole } from "./run";

// The first quarter of the programs takes longer than the time that a file of this runner gets on OHOS.
if (!isOhos) testTrimmedMatchesWhole(1, 4);
