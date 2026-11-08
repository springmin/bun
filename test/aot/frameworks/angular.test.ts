import { isOhos } from "harness";
import { testFramework } from "./run-framework";

if (!isOhos) testFramework("angular", "one file");
