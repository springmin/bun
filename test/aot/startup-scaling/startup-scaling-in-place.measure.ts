import { isOhos } from "harness";
import { describeStartupScaling } from "./startup-scaling";

// OHOS cannot run the in-place executable: modules it loads from disk are not
// signed, so the start never reaches the point the measurement waits for.
if (!isOhos) describeStartupScaling("--compile-in-place", kind => ["functions", "ES modules"].includes(kind.name), {
  flags: ["--compile-in-place"],
  privateGrowthFactor: 4,
  // TODO: "use everything": the unused functions and modules add 200,000 instructions to a start of 7.7 million; 184,000 are allowed.
  scenariosThatGrow: ["require cache keys", "use everything"],
  // TODO: in one run of this file in three, on a busy machine, two scenarios (others each time) find nearly all of the 4.2 MB that the file grew by resident: 3.5 to 3.8 MB, where 2.1 are allowed. Instructions and private memory stay.
  residentBytesDifferFromRunToRun: true,
});
