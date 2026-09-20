#!/usr/bin/env bash

echoerr() { echo "$@" 1>&2; }

echoerr "bun-streams-test-fifo.sh: starting"
# OHOS denies open(O_APPEND) on a FIFO (EACCES), which deadlocks the reader
# (bash `>>`); a plain `>` writes the same bytes there.
echo -e "$FIFO_TEST" >${@: -1}
echoerr "bun-streams-test-fifo.sh: ending"
exit 0
