# Chrome Web Store Assets

Upload the generated assets in this order.

## Store icon

- `../icons/icon128.png` — 128×128 PNG with transparent padding.

## Screenshots

1. `screenshots/01-overview.png` — complete Taboard workspace.
2. `screenshots/02-save-tabs.png` — expanded tab drawer and saved links.
3. `screenshots/03-card-types.png` — link, note, and todo cards.
4. `screenshots/04-search.png` — search across boards and spaces.
5. `screenshots/05-local-first-sync.png` — local-first storage and optional Drive sync.

All screenshots are opaque 1280×800 PNG files.

## Promotional images

- `promo/small-promo-440x280.png` — required small promo tile.
- `promo/marquee-1400x560.png` — optional marquee tile.

## Regeneration

The renderer requires Google Chrome at the standard macOS application path and FFmpeg at `/opt/homebrew/bin/ffmpeg`.

```bash
npm run assets:capture
npm run assets:verify
```

`npm run assets:capture` starts an isolated local server, loads the real Taboard UI with synthetic demo data, captures five states, and composes every uploadable image. It does not use personal tabs, accounts, or browser storage.

`store-assets/.work/` contains disposable raw captures and render sheets. It is ignored by Git and must not be uploaded to the Chrome Web Store.

The OAuth-bearing local `manifest.json` remains ignored. `manifest.example.json` is the tracked manifest template and includes the 16, 32, 48, and 128 px icon declarations.
