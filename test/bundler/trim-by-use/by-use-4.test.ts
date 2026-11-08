import { isOhos } from "harness";
import { byUse } from "./by-use";

if (!isOhos) byUse(4, 16);
