import { describe, expect, test } from "bun:test";
import { cwdScope, isWindows, tempDir, tmpdirSync } from "harness";
import { basename, dirname, join } from "node:path";

test("stop(true) clears the listener's data while a connection is still open", async () => {
  const accepted = Promise.withResolvers<void>();
  using listener = Bun.listen<{ tag: string }>({
    hostname: "127.0.0.1",
    port: 0,
    data: { tag: "of the listener" },
    socket: {
      open: accepted.resolve,
      data() {},
      close() {},
      error() {},
    },
  });
  const client = await Bun.connect({
    hostname: "127.0.0.1",
    port: listener.port,
    socket: { data() {}, close() {}, error() {} },
  });
  await accepted.promise;
  expect(listener.data).toEqual({ tag: "of the listener" });
  client.end();
  listener.stop(true);
  expect(listener.data).toBeUndefined();
});

describe.if(!isWindows)("unix socket", () => {
  test("valid", () => {
    using server = Bun.listen({
      unix: join(tmpdirSync(), Math.random().toString(32).slice(2, 15) + ".sock"),
      socket: {
        open() {},
        close() {},
        data() {},
        drain() {},
      },
    });
    server.stop();
  });

  describe("allows", () => {
    const permutations = [
      {
        unix: join(tmpdirSync(), Math.random().toString(32).slice(2, 15) + ".sock"),
        port: 0,
        hostname: "",
      },
      {
        unix: join(tmpdirSync(), Math.random().toString(32).slice(2, 15) + ".sock"),
        hostname: undefined,
      },
      {
        unix: join(tmpdirSync(), Math.random().toString(32).slice(2, 15) + ".sock"),
        hostname: null,
      },
      {
        unix: join(tmpdirSync(), Math.random().toString(32).slice(2, 15) + ".sock"),
        hostname: false,
      },
    ];

    for (const args of permutations) {
      test(`${JSON.stringify(args)}`, async () => {
        await using tempdir = tempDir("test-socket", {
          "foo.txt": "bar",
        });
        using cwd = cwdScope(String(tempdir));
        for (let i = 0; i < 100; i++) {
          using server = Bun.listen({
            ...args,
            // i prefixes the socket NAME (the old relative form relied on
            // i + "name.sock"); with an absolute path the prefix must go on
            // the basename.
            unix: args.unix.startsWith("unix://")
              ? "unix://" + i + args.unix.slice(7)
              : join(dirname(args.unix), i + basename(args.unix)),
            socket: {
              open() {},
              close() {},
              data() {},
              drain() {},
            },
          });
          server.stop();
        }
      });
    }
  });
});
