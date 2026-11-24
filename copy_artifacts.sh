#!/usr/bin/env bash
set -euxo pipefail

TARGET="/mnt/c/Users/Wifey's Horse/Downloads/gap-semigroup-lab"
GAPSRC="$HOME/build/gap-src"

echo "Copying gap.wasm..."
cp "$GAPSRC/gap.wasm" "$TARGET/public/gap/gap.wasm"

echo "Copying gap.js..."
cp "$GAPSRC/gap.js" "$TARGET/public/gap/gap.js"

echo "Copying gap-fs.json..."
cp "$GAPSRC/gap-fs.json" "$TARGET/public/gap/gap-fs.json"

echo "Updating build-id..."
echo "semigroups-$(date +%s)" > "$TARGET/public/gap/build-id"

echo "Copying pkg/semigroups to .gap-cache..."
mkdir -p "$TARGET/.gap-cache/pkg"
rm -rf "$TARGET/.gap-cache/pkg/semigroups"
cp -r "$GAPSRC/pkg/semigroups" "$TARGET/.gap-cache/pkg/semigroups"

echo "All artifacts copied successfully!"
