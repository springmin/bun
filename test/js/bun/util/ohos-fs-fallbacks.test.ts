import { describe, expect, test } from "bun:test";
import { isOhos, tempDir } from "harness";
import { linkSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The OHOS sandbox refuses hardlinks (EACCES on hmdfs, EPERM under
// /storage). `bun_sys::linkat` emulates them with a byte copy — the same
// fallback the deleted LD_PRELOAD compat shim provided as a symbol
// interposer. These tests pin that fallback and the link(2)-shaped error
// cases so the de-shimmed behavior cannot regress silently.
describe.skipIf(!isOhos)("OHOS fs fallbacks without the compat shim", () => {
  function errorCode(body: () => unknown): string | undefined {
    try {
      body();
    } catch (error: any) {
      return error?.code;
    }
    return undefined;
  }

  test("linkSync produces the destination contents", () => {
    using dir = tempDir("ohos-link-copy", { "src.txt": "contents" });
    const src = join(String(dir), "src.txt");
    const dst = join(String(dir), "dst.txt");

    linkSync(src, dst);

    expect(readFileSync(dst, "utf8")).toBe("contents");
    // Falling back to a copy must not alias the source: writing through the
    // source leaves the destination alone.
    writeFileSync(src, "changed");
    expect(readFileSync(dst, "utf8")).toBe("contents");
  });

  test("linkSync keeps EEXIST and ENOENT semantics", () => {
    using dir = tempDir("ohos-link-errors", { "src.txt": "c" });
    const src = join(String(dir), "src.txt");
    const dst = join(String(dir), "dst.txt");

    linkSync(src, dst);
    expect(errorCode(() => linkSync(src, dst))).toBe("EEXIST");
    expect(errorCode(() => linkSync(join(String(dir), "absent"), join(String(dir), "other")))).toBe("ENOENT");
  });

  test("linkSync on a directory still fails with EPERM", () => {
    using dir = tempDir("ohos-link-dir", {});
    expect(errorCode(() => linkSync(String(dir), join(String(dir), "dirlink")))).toBe("EPERM");
  });

  test("symlinkSync works natively", () => {
    using dir = tempDir("ohos-symlink", { "target.txt": "t" });
    const target = join(String(dir), "target.txt");
    const link = join(String(dir), "link.txt");

    symlinkSync(target, link);

    expect(readlinkSync(link)).toBe(target);
    expect(readFileSync(link, "utf8")).toBe("t");
  });
});
