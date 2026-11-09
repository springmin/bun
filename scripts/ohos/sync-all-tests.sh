#!/usr/bin/env bash
# Sync the source tree into the long-lived all-tests mirror.
#
# The earlier command used `--exclude='build'`, which matches `build` at every
# depth and silently froze `scripts/build` at its September copy. Keep the
# excludes anchored to the repository root, and sync the fixture node_modules
# that the mirror deliberately omits.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="${ALL_TESTS_PATH:-/storage/Users/currentUser/usr/local/bun-test/all-tests}"

if [ ! -d "$DEST/test" ]; then
  echo "not an all-tests mirror: $DEST" >&2
  exit 1
fi

echo "sync $ROOT -> $DEST"

rsync -rc --no-owner --no-group --delete --force \
  --exclude='/.git' \
  --exclude='/build' \
  --exclude='/node_modules' \
  --exclude='/.bun' \
  --exclude='/tmp' \
  --exclude='/vendor/WebKit' \
  --exclude='/*.log' \
  "$ROOT/" "$DEST/"

# `scripts/build` is part of the tree, not the root build directory, but sync it
# explicitly so a future broad exclude cannot freeze it again.
rsync -rc --no-owner --no-group --delete --force \
  "$ROOT/scripts/build/" "$DEST/scripts/build/"

# Test-owned node_modules are not in the root package graph (they are fixtures),
# and the global node_modules exclude above leaves them out. Copy each fixture.
synced_fixtures=0
while IFS= read -r -d '' dir; do
  rel="${dir#"$ROOT"/}"
  rsync -rc --no-owner --no-group --delete --force "$dir/" "$DEST/$rel/"
  synced_fixtures=$((synced_fixtures + 1))
done < <(find "$ROOT/test/aot/parallel" "$ROOT/test/aot/parallel-test-runs" -type d -name node_modules -print0 2>/dev/null)

echo "synced $synced_fixtures fixture node_modules trees"
echo "note: the mirror's .git is not updated; vm-thread-door reads git ls-tree HEAD"
