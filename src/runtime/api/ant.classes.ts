import { define } from "../../codegen/class-definitions.ts";

// `Bun.ant.CellSegmenter` — native terminal-cell segmenter used by Claude
// Code's Ink renderer (reverse-engineered from @anthropic-ai/bun-internal).
export default [
  define({
    name: "CellSegmenter",
    construct: true,
    finalize: true,
    configurable: false,
    JSType: "0b11101110",
    klass: {},
    proto: {
      graphemes: {
        getter: "getGraphemes",
      },
      sgrKeys: {
        getter: "getSgrKeys",
      },
      sgrCloseKeys: {
        getter: "getSgrCloseKeys",
      },
      uris: {
        getter: "getUris",
      },
      segment: {
        fn: "segment",
        length: 4,
      },
      setCell: {
        fn: "setCell",
        length: 6,
      },
      paint: {
        fn: "paint",
        length: 9,
      },
    },
  }),
];
