#!/bin/sh
# OHOS linker driver wrapper: run the real C++ linker, then sign the output.
#
# The OHOS kernel refuses to exec or dlopen an ELF without a valid .codesign
# section (EACCES). rustc links host build scripts and proc-macro dylibs with
# this linker; signing here — as part of the link step — keeps cargo's
# fingerprint consistent with what is on disk (signing after the fact makes
# cargo re-link, and the fresh binary is unsigned again).
set -u

REAL="${OHOS_REAL_CXX:-clang++}"
"$REAL" "$@" || exit $?

# Find the output path: the argument following the last `-o`.
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    out="$arg"
  fi
  prev="$arg"
done
[ -n "$out" ] && [ -f "$out" ] || exit 0

# Only link outputs need signing; object files and archives do not.
case "$out" in
  *.o | *.a | *.rlib | *.rmeta | *.d) exit 0 ;;
esac

[ "$(od -An -tx1 -N4 "$out" 2>/dev/null | tr -d ' \n')" = "7f454c46" ] || exit 0

SIGN_TOOL=$(command -v binary-sign-tool 2>/dev/null || true)
[ -n "$SIGN_TOOL" ] || exit 0

tmp="${out}.signing.$$"
if "$SIGN_TOOL" sign -selfSign 1 -inFile "$out" -outFile "$tmp" >/dev/null 2>&1; then
  mv "$tmp" "$out"
  chmod 755 "$out" 2>/dev/null
else
  rm -f "$tmp" 2>/dev/null
fi

exit 0
