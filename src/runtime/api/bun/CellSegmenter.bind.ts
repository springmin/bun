import * as b from "../../../codegen/bindgen-lib.ts";

const method = { capability: "js", returns: b.any, throws: true } as const;
const getter = { getter: b.any, capability: "heap", throws: true } as const;

export const CellSegmenter = b.class({
  rustPath: "crate::api::ant::CellSegmenter",
  construct: { args: { options: b.any }, capability: "js", throws: true, length: 1 },
  proto: {
    graphemes: getter,
    sgrKeys: getter,
    sgrCloseKeys: getter,
    uris: getter,
    segment: {
      ...method,
      args: { text: b.any, cells: b.any, runs: b.any, reordered: b.any },
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
    },
  },
});
