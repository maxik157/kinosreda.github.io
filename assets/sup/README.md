# JP inflatable SUP reference assets

Source: image supplied by the user on 2026-11-12 (`reference.png`). The left board is the deck and the right board is the underside of the same JP Allround Air 10′6″ × 32″ board.

`prepare-sup-assets.cjs` extracts both silhouettes, preserves the printed lettering, removes the white background, upsamples to 512 × 2048 with Lanczos resampling and mild sharpening, and derives the rail texture and measured profile. This is deterministic resampling, not invented image detail.

Runtime images: `jp-sup-deck.webp`, `jp-sup-bottom.webp`, `jp-sup-rail.webp`. All three scene instances share these assets and geometry. Source mesh dimensions: 3.2004 × 0.8128 × 0.1524 metres. The playable hulls use uniform scale 1.48 (4.737 × 1.203 × 0.226 metres), preserving the photo proportions.

Regenerate with:

```sh
node scripts/prepare-sup-assets.cjs assets/sup/reference.png
```
