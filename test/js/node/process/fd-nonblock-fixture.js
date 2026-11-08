// Prints "<fd>:blocking" or "<fd>:nonblocking" for each fd in argv to fd PROBE_OUT_FD (default 1), via fs.writeSync so this process sets no flags itself.
import { dlopen } from "bun:ffi";
import { existsSync, readFileSync, writeSync } from "node:fs";

let fcntl;
const nonblockingViaFcntl = fd => {
  // Linux and Android resolve the bare SONAME; FreeBSD and Darwin name it otherwise.
  fcntl ??= dlopen(
    process.platform === "darwin" ? "libSystem.B.dylib" : process.platform === "freebsd" ? "libc.so.7" : "libc.so",
    { fcntl: { args: ["i32", "i32", "i32"], returns: "i32" } },
  ).symbols.fcntl;
  return (fcntl(fd, 3 /* F_GETFL */, 0) & 4) /* O_NONBLOCK */ !== 0;
};
let isNonblocking;
if (existsSync("/proc/self/fdinfo")) {
  isNonblocking = fd => {
    try {
      return (parseInt(readFileSync(`/proc/self/fdinfo/${fd}`, "utf8").match(/^flags:\s*([0-7]+)/m)[1], 8) & 0o4000) !== 0;
    } catch {
      // OHOS: stdio created by Bun are unix sockets, and this kernel answers a
      // read of a socket's fdinfo with ENOENT though the entry exists; the fd
      // itself is open, so ask fcntl instead.
      return nonblockingViaFcntl(fd);
    }
  };
} else {
  isNonblocking = nonblockingViaFcntl;
}

writeSync(
  Number(process.env.PROBE_OUT_FD ?? 1),
  process.argv
    .slice(2)
    .map(fd => `${fd}:${isNonblocking(Number(fd)) ? "nonblocking" : "blocking"}`)
    .join(" ") + "\n",
);
