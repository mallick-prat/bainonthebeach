# Asset attribution

Machine-readable provenance: docs/asset-manifest.json

## Original (this repository)

- All world art, character sprites, UI art, and the pixel cursors
  (public/assets/ui/cursor-*.png) are original, drawn in code for this
  project. License: same as the repository.
- The chiptune tracks (SUNNY LOOP, CRUNCH TIME, LOW TIDE, OFFICE PARTY)
  are original compositions generated at runtime with WebAudio; no audio
  files exist for them.

## Third party

- Lo-fi music (public/assets/audio/*.mp3): from Open Lo-Fi by Baber Tahir,
  https://github.com/btahir/open-lofi, release v1.0.0. License: CC0 1.0
  Universal (public domain; no attribution required, credited anyway).
  Files: tide-pools-at-twilight.mp3, sunset-offbeat.mp3,
  golden-afternoon-groove.mp3, burnt-sunset-groove.mp3,
  blue-below-the-surface.mp3, tide-stained-polaroids.mp3,
  porchlight-golden-hour.mp3. Unmodified. Used by the in-game jukebox.
- Press Start 2P by CodeMan38, SIL Open Font License 1.1, self-hosted via
  next/font (Google Fonts). Used for pixel UI text.
- JetBrains Mono by JetBrains, SIL Open Font License 1.1, self-hosted via
  next/font. Used for body text.
- Bain brand images (public/assets/ui/bain-logo.png, bain-banner.png; also
  app/icon.png and app/apple-icon.png derived from them): fetched from the
  logo.dev brand API at the owner's request; trademarks belong to Bain &
  Company. This site is unofficial and just for fun. The in-world BAIN sign
  and BAIN&CO lawn banner are original pixel recreations, not traced
  assets.

No runtime asset is hotlinked; everything above is vendored in the
repository.
