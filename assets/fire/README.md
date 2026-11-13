# Campfire animation

`campfire-flames.webp` is a lossless 2048×2048 RGBA atlas of **64 distinct
presented video frames**, played at 24 fps with interpolation between frames.
It is extracted from **Fire.ogv — Cary Bass (User:Bastique), 3 March 2007**.
The author released the footage into the **public domain (PD-self)**.

- Source and license: https://commons.wikimedia.org/wiki/File:Fire.ogv
- Original: https://upload.wikimedia.org/wikipedia/commons/8/8f/Fire.ogv
- VP9 source used: https://upload.wikimedia.org/wikipedia/commons/transcoded/8/8f/Fire.ogv/Fire.ogv.480p.vp9.webm

Place the VP9 source at `.cache/campfire/source.webm`, start the local server
on port 8091 and run `node scripts/bake-campfire.cjs`. Preparation uses
`requestVideoFrameCallback` during actual playback, crops the flame, removes
the black background and resizes each frame to 256 px. It rejects a capture
unless at least 60 frames have distinct pixel hashes. The current asset has
64 distinct frames. The WebP is lossless and about 2.5 MB. During gameplay
there is no video decoding or external video request.

The former paused-video seek method produced a 64-cell atlas containing one
repeated image. That obsolete atlas is retained with the previous sources
under `.codex-artifacts/forest-camp-v5/before/`, outside shipped assets.

The charred logs, glowing embers, stone ring, steel cooking rack, chain and
hanging pot are separate three-dimensional props. Transparent flame, sparks
and smoke render after the lake while respecting opaque depth, so water
behind the camp cannot paint over them.
