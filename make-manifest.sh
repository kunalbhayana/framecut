#!/usr/bin/env bash
# Build images.json for Framecut: a JSON array of every image under a folder.
#
#   ./make-manifest.sh ../my-site/images > images.json
#
# Paths are written relative to the folder you pass, so set CONFIG.base in
# framecut.js to that folder (e.g. base: '../my-site/').
set -euo pipefail
root="${1:-images}"
cd "$(dirname "$root")"
base="$(basename "$root")"
find "$base" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \
  -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.avif' \) \
  | LC_ALL=C sort \
  | awk 'BEGIN{printf "["} {printf "%s\"%s\"", (NR>1?",":""), $0} END{print "]"}'
