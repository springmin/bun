import * as b from "../../../codegen/bindgen-lib.ts";

export default b.module({ rustPath: "crate::api::ant" });

/** `Bun.ant.setDumpable(flag?)`: `flag` false clears, anything else sets. */
export const setDumpable = b.fn({
  export: "Bun__ant__setDumpable",
  args: { flag: b.any },
  returns: b.bool,
  capability: "js",
});

/** The uid of the peer of `fd`, or `null`. */
export const getPeerUid = b.fn({
  export: "Bun__ant__getPeerUid",
  args: { fd: b.any },
  returns: b.u32.nullable,
  capability: "js",
});

/** The pid of the peer of `fd`, or `null`. */
export const getPeerPid = b.fn({
  export: "Bun__ant__getPeerPid",
  args: { fd: b.any },
  returns: b.i32.nullable,
  capability: "js",
});

/** The current memory pressure level, or `null` where the kernel does not report one. */
export const memoryPressureLevel = b.fn({
  export: "Bun__ant__memoryPressureLevel",
  returns: b.i32.nullable,
  capability: "js",
});
