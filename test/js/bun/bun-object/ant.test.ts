import { describe, expect, test } from "bun:test";

// `Bun.ant` mirrors the internal runtime API Anthropic's Bun build exposes for
// Claude Code >= 2.1.272. These tests pin the wire format that Claude Code's
// Ink renderer drives.
const ant = (Bun as any).ant as {
  setDumpable(flag: boolean): boolean;
  getPeerUid(fd: number): number | null;
  getPeerPid(fd: number): number | null;
  memoryPressureLevel(): number | null;
  CellSegmenter: new (options: any) => any;
};

function makeSegmenter(overrides: Record<string, unknown> = {}) {
  return new ant.CellSegmenter({
    ambiguousIsNarrow: true,
    substitute: [],
    screen: {
      widthMask: 3,
      narrow: 0,
      wide: 1,
      spacerTail: 2,
      spacerHead: 3,
      emptyCharIndex: 0,
      spacerCharIndex: 1,
      emptyWord: 0,
      tabWidth: 8,
    },
    ...overrides,
  });
}

describe("Bun.ant", () => {
  test("exposes the API", () => {
    expect(typeof ant).toBe("object");
    expect(typeof ant.setDumpable).toBe("function");
    expect(typeof ant.getPeerUid).toBe("function");
    expect(typeof ant.getPeerPid).toBe("function");
    expect(typeof ant.memoryPressureLevel).toBe("function");
    expect(typeof ant.CellSegmenter).toBe("function");
  });

  test("setDumpable", () => {
    expect(ant.setDumpable(false)).toBe(true);
    expect(ant.setDumpable(true)).toBe(true);
  });

  test("memoryPressureLevel", () => {
    const level = ant.memoryPressureLevel();
    if (level !== null) {
      expect([1, 2, 4]).toContain(level as never);
    }
  });

  test("getPeerUid / getPeerPid", () => {
    // Invalid fds must be graceful (null), never throw.
    expect(ant.getPeerUid(-1)).toBeNull();
    expect(ant.getPeerPid(-1)).toBeNull();

    let fds: Int32Array | undefined;
    try {
      const { dlopen, FFIType } = require("bun:ffi");
      const lib = dlopen(null, {
        socketpair: { args: [FFIType.int, FFIType.int, FFIType.int, FFIType.ptr], returns: FFIType.int },
      });
      const pair = new Int32Array(2);
      if (lib.symbols.socketpair(1 /* AF_UNIX */, 1 /* SOCK_STREAM */, 0, pair) === 0) {
        fds = pair;
      } else {
        lib.close?.();
      }
    } catch {}

    if (fds) {
      expect(ant.getPeerUid(fds[0]!)).toBe(process.getuid?.() ?? null);
      expect(ant.getPeerPid(fds[0]!)).toBe(process.pid);
    }
  });
});

describe("Bun.ant.CellSegmenter", () => {
  test("ASCII fast path", () => {
    const seg = makeSegmenter();
    const cells = new Int32Array(64);
    const runs = new Int32Array(64);
    expect(seg.segment("hello", cells, runs, false)).toBe(5);

    for (let i = 0; i < 5; i++) {
      expect(cells[i * 2 + 1] & 0xff).toBe(1); // width
      expect((cells[i * 2 + 1] & 0x100) !== 0).toBe(false); // not a tab
      expect(cells[i * 2 + 1] >>> 10).toBe(0); // default style
    }

    // graphemes[0] is reserved; the rest are interned on demand and deduped.
    expect(seg.graphemes[0]).toBe("");
    expect(seg.graphemes.slice(1).sort()).toEqual(["e", "h", "l", "o"]);
    expect(cells[2 * 2]).toBe(cells[2 * 3]); // 'l' in both positions -> same index
  });

  test("wide characters", () => {
    const seg = makeSegmenter();
    const cells = new Int32Array(64);
    const runs = new Int32Array(64);
    expect(seg.segment("你好", cells, runs, false)).toBe(2);
    expect(cells[1] & 0xff).toBe(2);
    expect(cells[3] & 0xff).toBe(2);
  });

  test("grapheme clusters", () => {
    const seg = makeSegmenter();
    const cells = new Int32Array(64);
    const runs = new Int32Array(64);

    // combining mark
    expect(seg.segment("e\u0301", cells, runs, false)).toBe(1);
    expect(cells[1] & 0xff).toBe(1);

    // ZWJ emoji sequence
    expect(seg.segment("👨‍👩‍👧", cells, runs, false)).toBe(1);
    expect(cells[1] & 0xff).toBe(2);

    // regional-indicator flag
    expect(seg.segment("🇨🇳", cells, runs, false)).toBe(1);
    expect(cells[1] & 0xff).toBe(2);
  });

  test("tabs set the tab flag", () => {
    const seg = makeSegmenter();
    const cells = new Int32Array(64);
    const runs = new Int32Array(64);
    expect(seg.segment("\t", cells, runs, false)).toBe(1);
    expect(cells[1] & 0x100).toBe(0x100);
  });

  test("negative return when the buffer is too small", () => {
    const seg = makeSegmenter();
    const cells = new Int32Array(2);
    const runs = new Int32Array(2);
    expect(seg.segment("hello", cells, runs, false)).toBe(-5);
  });

  test("SGR sequences intern sgrKeys / sgrCloseKeys and style ids", () => {
    const seg = makeSegmenter();
    const cells = new Int32Array(64);
    const runs = new Int32Array(64);

    const count = seg.segment("\x1b[31mred\x1b[0m", cells, runs, false);
    expect(count).toBe(3);

    // cells 0..2 are the styled ones, style id 1.
    expect(cells[1] >>> 10).toBe(1);
    expect(cells[3] >>> 10).toBe(1);
    expect(cells[5] >>> 10).toBe(1);

    expect(seg.sgrKeys[1]).toBe("\x1b[31m");
    expect(seg.sgrCloseKeys[1]).toBe("\x1b[39m");
    expect(runs[2]).toBe(1); // style 1 -> sgr key 1
    expect(runs[3]).toBe(0); // no hyperlink
  });

  test("OSC 8 hyperlinks intern uris and attach to runs", () => {
    const seg = makeSegmenter();
    const cells = new Int32Array(64);
    const runs = new Int32Array(64);

    const count = seg.segment("\x1b]8;;https://example.com\x1b\\x", cells, runs, false);
    expect(count).toBe(1);
    expect(seg.uris[1]).toBe("https://example.com");

    const style = cells[1] >>> 10;
    expect(style).toBeGreaterThan(0);
    expect(runs[style * 2 + 1]).toBe(1);
  });

  test("setCell writes cells and packs damage", () => {
    const seg = makeSegmenter();
    const width = 10;
    const screen = new Int32Array(width * 3 * 2);

    // narrow cell
    let damage = seg.setCell(screen, width, 1, 0, 42, (0 << 17) | (0 << 2) | 0);
    expect(screen[(0 * width + 1) * 2]).toBe(42);
    expect(screen[(0 * width + 1) * 2 + 1] & 3).toBe(0);
    expect(damage % 2 ** 20).toBe(2); // new x = 1 + 1

    // wide cell writes a spacer tail
    damage = seg.setCell(screen, width, 3, 1, 7, (0 << 17) | (0 << 2) | 1);
    expect(screen[(1 * width + 3) * 2]).toBe(7);
    expect(screen[(1 * width + 3) * 2 + 1] & 3).toBe(1);
    expect(screen[(1 * width + 4) * 2 + 1] & 3).toBe(2); // spacerTail
    expect(damage % 2 ** 20).toBe(5); // new x = 3 + 2
  });

  test("paint renders a parsed line into a screen buffer", () => {
    const seg = makeSegmenter();
    const width = 8;
    const screen = new Int32Array(width * 2 * 2);
    const cells = new Int32Array(64);
    const runs = new Int32Array(64);

    const count = seg.segment("ab", cells, runs, false);
    expect(count).toBe(2);

    // charMap: grapheme index -> char pool id (use the index itself here).
    const charMap = new Int32Array(seg.graphemes.length);
    for (let i = 0; i < charMap.length; i++) charMap[i] = 100 + i;
    const words = new Int32Array(1);
    words[0] = 0;

    const damage = seg.paint(screen, width, 2, 1, cells, count, undefined, charMap, words);
    expect(damage % 2 ** 20).toBe(4); // two narrow cells -> cursor 2 + 2
    expect(screen[(1 * width + 2) * 2]).toBe(charMap[cells[0]]);
    expect(screen[(1 * width + 3) * 2]).toBe(charMap[cells[2]]);
  });

  test("widths agree with Intl.Segmenter + Bun.stringWidth", () => {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
    const seg = makeSegmenter();
    const cells = new Int32Array(256);
    const runs = new Int32Array(256);
    const corpus = ["hello", "你好", "e\u0301", "👨‍👩‍👧", "🇨🇳", "漢字abc", "👍🏽", "أهلاً", "한글"];

    for (const text of corpus) {
      const clusters = [...segmenter.segment(text)].map((x: any) => x.segment);
      const expected = clusters.map((c: string) => Math.max(1, Bun.stringWidth(c, { ambiguousIsNarrow: true })));

      const count = seg.segment(text, cells, runs, false);
      expect(count).toBe(clusters.length);

      const actual = [];
      for (let i = 0; i < count; i++) actual.push(cells[i * 2 + 1] & 0xff);
      expect(actual).toEqual(expected);
    }
  });
});

// Mirrors the parts of Claude Code's `_d` consumer (2.1.272) that drive the
// native CellSegmenter, so the wire format stays pinned end to end.
describe("Bun.ant.CellSegmenter consumer semantics", () => {
  function segmentOnce(seg: any, text: string, capacity = 1024) {
    const cells = new Int32Array(capacity);
    const runs = new Int32Array(capacity);
    const count = seg.segment(text, cells, runs, false);
    return { count, cells, runs };
  }

  // `_d.width(text, startWidth, reordered)`
  function consumedWidth(seg: any, text: string, startWidth = 0, tabWidth = 8) {
    const { count, cells } = segmentOnce(seg, text);
    let width = startWidth;
    for (let i = 0; i < count; i++) {
      const meta = cells[i * 2 + 1];
      width += (meta & 0x100) !== 0 ? tabWidth - (width % tabWidth) : meta & 0xff;
    }
    return width - startWidth;
  }

  test("width() semantics", () => {
    const seg = makeSegmenter();
    expect(consumedWidth(seg, "hello")).toBe(5);
    expect(consumedWidth(seg, "你好")).toBe(4);
    expect(consumedWidth(seg, "a\tb")).toBe(9);
    expect(consumedWidth(seg, "a\tb", 3)).toBe(6); // tab stop is absolute (3 -> 8)
    expect(consumedWidth(seg, "\x1b[31mred\x1b[0m")).toBe(3);
  });

  test("paint advances tabs to the absolute tab stop", () => {
    const seg = makeSegmenter();
    const width = 16;
    const screen = new Int32Array(width * 2 * 2);
    const { count, cells, runs } = segmentOnce(seg, "a\tb");
    const map = new Int32Array(seg.graphemes.length);
    for (let i = 0; i < map.length; i++) map[i] = i;
    const words = new Int32Array(1);

    const damage = seg.paint(screen, width, 0, 0, cells, count, undefined, map, words);
    expect(damage % 2 ** 20).toBe(9); // a + 7 tab columns + b
    expect(screen[(0 * width + 0) * 2]).toBe(map[cells[0]]);
    expect(screen[(0 * width + 8) * 2]).toBe(map[cells[4]]);

    // Painting at a non-zero column snaps to the next absolute tab stop.
    const screen2 = new Int32Array(width * 2 * 2);
    const cells2 = new Int32Array(64);
    const runs2 = new Int32Array(64);
    const count2 = seg.segment("\t", cells2, runs2, false);
    const damage2 = seg.paint(screen2, width, 3, 0, cells2, count2, undefined, map, words);
    expect(damage2 % 2 ** 20).toBe(8); // column 3 -> tab stop at 8

    void runs;
  });

  test("runWords maps style ids onto sgrKeys and uris", () => {
    const seg = makeSegmenter();
    const { count, cells, runs } = segmentOnce(seg, "\x1b[31mred\x1b]8;;https://x\x1b\\ blue");
    expect(count).toBeGreaterThan(0);

    // red -> style 1 (sgr key 1, no uri); the OSC 8 hyperlink creates style 2.
    expect(seg.sgrKeys[1]).toBe("\x1b[31m");
    expect(seg.sgrCloseKeys[1]).toBe("\x1b[39m");
    expect(seg.uris[1]).toBe("https://x");

    expect(cells[1] >>> 10).toBe(1);
    expect(cells[7] >>> 10).toBe(2);
    expect(runs[2]).toBe(1);
    expect(runs[3]).toBe(0);
    expect(runs[4]).toBe(1);
    expect(runs[5]).toBe(1);

    // Every referenced style/uri index is inside its table.
    for (let i = 0; i < count; i++) {
      const style = cells[i * 2 + 1] >>> 10;
      expect(runs[style * 2]).toBeLessThan(seg.sgrKeys.length);
      expect(runs[style * 2 + 1]).toBeLessThan(seg.uris.length);
    }
  });
});
