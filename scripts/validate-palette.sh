#!/usr/bin/env bash
# Re-validates the chart palette in src/app/globals.css against the
# data-visualisation checks (lightness band, chroma floor, CVD separation,
# normal-vision floor, surface contrast) in both light and dark mode.
#
# Usage: ./scripts/validate-palette.sh /path/to/validate_palette.js
set -euo pipefail
VALIDATOR="${1:-}"
if [[ -z "$VALIDATOR" || ! -f "$VALIDATOR" ]]; then
  echo "usage: $0 <path-to-validate_palette.js>" >&2
  exit 2
fi

CORE="#725ee0,#0095ae,#c28700,#c8264a"
FULL="#725ee0,#0095ae,#c28700,#c8264a,#13a15e,#8a46a7"

echo "── Slots 1-4 (all pairs, both modes must PASS) ──"
node "$VALIDATOR" "$CORE" --mode light --pairs all
node "$VALIDATOR" "$CORE" --mode dark  --pairs all

echo "── Slots 1-6 (adjacent pairs, both modes must PASS) ──"
node "$VALIDATOR" "$FULL" --mode light
node "$VALIDATOR" "$FULL" --mode dark
