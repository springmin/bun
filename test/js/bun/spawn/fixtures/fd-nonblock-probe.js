// Prints "<fd>:blocking" or "<fd>:nonblocking" for each fd number in argv.
// The flag is read before anything writes, so this process cannot change it.
// Must not touch process.stdout/process.stderr/process.send: those set
// O_NONBLOCK on their own fds.
import { dlopen } from "bun:ffi";
import { existsSync, readFileSync } from "node:fs";

let isNonblocking;
// OHOS: /proc/self/fdinfo exists but its entries are not readable (ENOENT),
// so probe readability and fall back to fcntl instead of trusting the
// directory's presence.
let useFdinfo = existsSync("/proc/self/fdinfo");
if (useFdinfo) {
  try {
    readFileSync(`/proc/self/fdinfo/${process.argv[2] ?? 0}`, "utf8");
  } catch {
    useFdinfo = false;
  }
}
if (useFdinfo) {
  isNonblocking = fd => {
    const flags = readFileSync(`/proc/self/fdinfo/${fd}`, "utf8").match(/^flags:\s*([0-7]+)/m)[1];
    return (parseInt(flags, 8) & 0o4000) !== 0;
  };
} else {
  // F_GETFL is 3 on every platform here. O_NONBLOCK is 0o4000 on Linux and 4 on macOS and the BSDs.
  const libc = { darwin: "libSystem.B.dylib", freebsd: "libc.so.7" }[process.platform] ?? "libc.so.6";
  const O_NONBLOCK = process.platform === "linux" ? 0o4000 : 4;
  const { fcntl } = dlopen(libc, {
    fcntl: { args: ["i32", "i32", "i32"], returns: "i32" },
  }).symbols;
  isNonblocking = fd => (fcntl(fd, 3, 0) & O_NONBLOCK) !== 0;
}

const out = process.argv
  .slice(2)
  .map(arg => `${arg}:${isNonblocking(Number(arg)) ? "nonblocking" : "blocking"}`)
  .join(" ");
console.log(out);
