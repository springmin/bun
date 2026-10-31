import { isOhos } from "harness";
import { byUse } from "./by-use";

if (!isOhos) byUse(3, 16);
