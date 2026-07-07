# Taboard Brand and Chrome Web Store Assets Design

Date: 2026-07-06

## Objective

Replace Taboard's current icon with a distinctive, professional brand system and produce a complete English-language image set for publishing the extension in the Chrome Web Store.

The visual identity must reflect Taboard's product character: a focused, capable tool for controlling open tabs and organizing useful links, notes, and todos into personal boards. It must remain recognizable at 16 px and accurately represent the current product.

## Approved Direction

### Brand character

The primary impression is **a powerful, professional tab-management tool**. The identity should feel precise and dependable rather than playful or decorative.

### Symbol: Control Deck

The icon uses a compact control-deck metaphor built from four solid shapes:

1. A horizontal cobalt bar representing the browser tab strip.
2. A tall white panel on the lower left representing the tab drawer.
3. A white panel on the upper right representing an active board surface.
4. A cobalt panel on the lower right representing a second organized board region.

The symbol uses filled shapes rather than outlines so it remains legible at small sizes. It contains no letters, checkmarks, fine strokes, or decorative micro-details.

### Palette: Midnight Cobalt

| Role | Color |
| --- | --- |
| Midnight foundation | `#0B1324` |
| Cobalt accent | `#2F6BFF` |
| Ice foreground | `#F7FAFF` |

A restrained dark gradient may be used on larger brand surfaces. The 16 px icon should use simplified flat or near-flat color treatment where gradients or shadows reduce clarity.

### Wordmark

The wordmark is `Taboard`, set in a clean, strong sans-serif style. It appears in the README banner and store promotional assets, not inside extension icons.

## Deliverables

### Extension and repository assets

- Editable vector master for the Control Deck symbol.
- `icons/origin.png` at 1024 px for high-resolution reuse.
- `icons/icon16.png`.
- `icons/icon32.png`.
- `icons/icon48.png`.
- `icons/icon128.png`.
- A redesigned `icons/banner.png` at its current 1024×358 px size.
- Updated icon declarations in `manifest.json` and `manifest.example.json` to include the 32 px asset.

The 128 px store icon uses a 96×96 px visual area centered within a transparent 128×128 px canvas, following Chrome's published store icon guidance. Smaller icon sizes use optical adjustments to preserve the same silhouette without relying on a naive downscale.

### Chrome Web Store assets

Store deliverables live under `store-assets/` with stable, descriptive filenames.

- Five full-bleed screenshots at 1280×800 px.
- One small promotional image at 440×280 px.
- One marquee promotional image at 1400×560 px.

The store set is English-only and uses consistent Midnight Cobalt branding. Promotional text stays brief, and the product UI remains the dominant element in screenshots.

## Store Screenshot Narrative

The screenshots form a five-step product story:

1. **Your new tab, under control.**  
   Show the complete Taboard workspace with the tab drawer, spaces, board sidebar, and cards.

2. **Turn open tabs into useful cards.**  
   Emphasize the expanded tab drawer and the relationship between an open tab and a saved link card.

3. **Organize links, notes, and todos.**  
   Show a board containing all supported card types with realistic, synthetic demo content.

4. **Find anything across every space.**  
   Show card search results together with space and board navigation.

5. **Local first. Backed up when you choose.**  
   Show the Drive sync control in the actual UI and state clearly that core data is stored locally while Drive sync is optional.

Each screenshot uses a full-bleed Midnight Cobalt composition with a short headline and a large, current Taboard UI capture. Text is limited to the headline and, only where needed, one short supporting phrase. The composition must remain readable when Chrome downscales it to 640×400 px.

## Promotional Images

### Small promo tile

- Size: 440×280 px.
- Content: Control Deck icon, `Taboard` wordmark, and the short line `Tabs, organized.`
- Treatment: saturated Midnight Cobalt background with clear edges and high contrast.
- Avoid detailed screenshots, feature lists, badges, or performance claims.

### Marquee image

- Size: 1400×560 px.
- Content: `Taboard`, the line `Make every tab count.`, and one large product UI view.
- Treatment: uncluttered asymmetrical layout with enough separation between copy and product UI to remain legible at smaller display sizes.
- Avoid claims about ranking, endorsement, store status, or capabilities that are not present in the extension.

### README banner

- Size: 1024×358 px.
- Content: Control Deck icon and `Taboard` wordmark, with visual treatment consistent with store assets.
- Purpose: make the GitHub repository immediately recognizable as the same product shown in the Chrome Web Store.

## Production Architecture

### Source assets

The Control Deck icon and brand layouts should be authored as deterministic vector sources. Raster PNG files are exported from those sources at exact target dimensions. This preserves geometry across sizes and makes future changes reproducible.

### Product captures

Store screenshots use the actual unpacked extension rendered in Chrome at a controlled viewport. Only synthetic demo data is used. The capture states must correspond to real product functionality in version 0.3.2 or the current working version at implementation time.

No generated or reconstructed interface may be presented as an actual product screenshot. Brand framing, captions, and non-functional visual aids may be composited around real captures.

### Output organization

The implementation plan will assign exact source and output filenames, but final uploadable assets will be grouped as follows:

```text
icons/
  source/
  origin.png
  icon16.png
  icon32.png
  icon48.png
  icon128.png
  banner.png
store-assets/
  screenshots/
  promo/
```

## Error Handling and Safety

- Existing extension icon files may be replaced because replacement is explicitly requested.
- Unrelated working-tree changes must not be modified or committed.
- If a capture includes personal browser data, account information, or unrelated tabs, discard it and recapture with an isolated profile and synthetic data.
- If a rendered asset has incorrect dimensions, missing transparency, clipping, color fringes, or unreadable small text, it must not be applied or delivered.
- If a planned screenshot state cannot be produced by the current extension, revise the composition to show an existing state rather than fabricating the feature.

## Verification

Verification includes:

1. Confirm every output is a valid PNG at its specified pixel dimensions.
2. Confirm icon alpha channels and transparent padding, including the 128 px store icon's 96 px visual area.
3. Confirm `manifest.json` and `manifest.example.json` reference existing 16, 32, 48, and 128 px files.
4. Inspect the icon at 16, 32, 48, and 128 px on light and dark backgrounds.
5. Inspect every screenshot at both 1280×800 and its 640×400 downscaled presentation size.
6. Confirm screenshots show only current functionality and synthetic content.
7. Confirm promotional images remain clear when reduced to half size.
8. Confirm the README renders the replacement banner correctly.
9. Run the repository's relevant automated checks after manifest changes.

## Non-Goals

- Redesigning the new-tab application UI.
- Changing Taboard functionality or permissions.
- Localizing the store image set beyond English.
- Adding claims, testimonials, awards, ratings, or fabricated store endorsements.
- Creating a video or store description copy.

## References

- [Chrome Web Store: Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)
- [Chrome Web Store: Supplying Images](https://developer.chrome.com/webstore/images)
- [Chrome Extensions: Manifest icons](https://developer.chrome.com/docs/extensions/reference/manifest/icons)

