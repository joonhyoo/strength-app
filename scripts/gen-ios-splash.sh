#!/bin/bash
# Regenerates the iOS launch images in static/apple-splash-*.png.
# Each is a solid #0D0D0F ground with the mark centred at 96 CSS px (× the
# device pixel ratio) — matching #app-splash in src/app.html. Portrait only.
# Requires ImageMagick. Run from the repo root: bash scripts/gen-ios-splash.sh
set -euo pipefail
cd "$(dirname "$0")/../static"

SRC=icon-512.png
BG='#0D0D0F'

# "deviceW x deviceH : pixelRatio"  (portrait, CSS px)
SPECS="
320x568:2 375x667:2 414x896:2
375x812:3 414x736:3 414x896:3 390x844:3 393x852:3
428x926:3 430x932:3 402x874:3 440x956:3
"

rm -f apple-splash-*.png
for spec in $SPECS; do
	wh=${spec%:*}; ratio=${spec#*:}
	cw=${wh%x*}; ch=${wh#*x}
	w=$((cw * ratio)); h=$((ch * ratio))
	logo=$((96 * ratio))
	magick -size "${w}x${h}" "xc:${BG}" \
		\( "$SRC" -resize "${logo}x${logo}" \) -gravity center -composite \
		-strip -dither None -colors 250 "png8:apple-splash-${w}-${h}.png"
	echo "apple-splash-${w}-${h}.png"
done
