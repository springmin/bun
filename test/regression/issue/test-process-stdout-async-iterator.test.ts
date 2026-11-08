import { expect, test } from "bun:test";
import { fstatSync } from "node:fs";

// Node's process.stdout is only a Duplex with async iteration when it is a pipe
// or a socket; a regular file (e.g. the whole suite's output redirected with
// `> log`) is a plain SyncWriteStream, exactly as here — so only assert the
// iterability the stream's own kind promises.
const stdoutIsFile = fstatSync(1).isFile();
const stderrIsFile = fstatSync(2).isFile();

test.skipIf(stdoutIsFile || stderrIsFile)(
  "process.stdout and process.stderr have Symbol.asyncIterator for Node.js compatibility",
  () => {
  // This is needed for compatibility with tools like execa that check for async iterability
  // to determine stream capabilities
  expect(typeof process.stdout[Symbol.asyncIterator]).toBe("function");
  expect(typeof process.stderr[Symbol.asyncIterator]).toBe("function");
});

test.skipIf(stdoutIsFile || stderrIsFile)("process.stdout and process.stderr async iterators work without throwing", async () => {
  // The iterators should work even though stdout/stderr are write-only
  // They should just complete immediately without yielding any values
  const stdoutIterator = process.stdout[Symbol.asyncIterator]();
  const stdoutResult = await stdoutIterator.next();
  expect(stdoutResult.done).toBe(true);
  expect(stdoutResult.value).toBeUndefined();

  const stderrIterator = process.stderr[Symbol.asyncIterator]();
  const stderrResult = await stderrIterator.next();
  expect(stderrResult.done).toBe(true);
  expect(stderrResult.value).toBeUndefined();
});

test("tty.WriteStream has Symbol.asyncIterator", () => {
  const tty = require("node:tty");
  // Create a WriteStream for stdout fd
  const stream = new tty.WriteStream(1);
  expect(typeof stream[Symbol.asyncIterator]).toBe("function");
});
