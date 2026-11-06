import * as b from "../../../codegen/bindgen-lib.ts";
import * as aot from "../../../codegen/builtins/lib.ts";

const method = { capability: "js", returns: b.any, throws: true, runsUnseenCode: false } as const;
const getter = {
  getter: b.any,
  capability: "heap",
  throws: true,
  runsUnseenCode: false,
  uses: { this: aot.inspected },
} as const;

export const CellSegmenter = b.class({
  rustPath: "crate::api::ant::CellSegmenter",
  runsUnseenCode: false,
  construct: { args: { options: b.any }, capability: "js", throws: true, length: 1 },
  proto: {
    graphemes: getter,
    sgrKeys: getter,
    sgrCloseKeys: getter,
    uris: getter,
    segment: {
      ...method,
      args: { text: b.any, cells: b.any, runs: b.any, reordered: b.any },
      uses: {
        this: aot.inspected,
        text: aot.inspected,
        cells: [aot.writesContents()],
        runs: [aot.writesContents()],
        reordered: aot.inspected,
      },
    },
    setCell: {
      ...method,
      args: {
        cells: b.any,
        screenWidth: b.any,
        x: b.any,
        y: b.any,
        charIndex: b.any,
        packed: b.any,
      },
      uses: {
        this: aot.inspected,
        cells: [aot.writesContents()],
        screenWidth: aot.inspected,
        x: aot.inspected,
        y: aot.inspected,
        charIndex: aot.inspected,
        packed: aot.inspected,
      },
    },
    paint: {
      ...method,
      args: {
        screenCells: b.any,
        screenWidth: b.any,
        x: b.any,
        y: b.any,
        lineCells: b.any,
        count: b.any,
        options: b.any,
        charMap: b.any,
        words: b.any,
      },
      uses: {
        this: aot.inspected,
        screenCells: [aot.writesContents()],
        screenWidth: aot.inspected,
        x: aot.inspected,
        y: aot.inspected,
        lineCells: [aot.writesContents()],
        count: aot.inspected,
        options: aot.inspected,
        charMap: [aot.writesContents()],
        words: [aot.writesContents()],
      },
    },
  },
});
