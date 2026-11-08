import { $, which } from "bun";
import { existsSync } from "node:fs";

const cmd = which("true");

const promises = [];

// OHOS spawns cost an order of magnitude more (~50ms each under load), so the
// 300-batch count below cannot fit the test's 90s budget; the guard is about
// the shell staying healthy across batches, not about the absolute count.
const isOHOS =
  Bun.env.BUN_OHOS === "1" || (process.platform === "linux" && existsSync("/system/lib/ld-musl-aarch64.so.1"));

const upperCount = process.platform === "darwin" ? 100 : isOHOS ? 3 : 300;

for (let j = 0; j < upperCount; j++) {
  for (let i = 0; i < 100; i++) {
    promises.push($`${cmd}`.text().then(() => {}));
  }
  if (j % 10 === 0) {
    await Promise.all(promises);
    promises.length = 0;
    console.count("Ran");
  }
}

await Promise.all(promises);
