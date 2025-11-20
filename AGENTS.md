# Repository Guidelines

## Project Structure & Module Organization

Taboard is a Manifest V3 extension with a flat root: `manifest.json` defines permissions plus entrypoints, `background.js` hosts light helper events, and `icons/` stores browser assets. All UI and state live in `newtab/`, where `index.html` provides the layout, `style.css` tracks the tabextend-like visual system, and the ES modules split concerns (`app.js` for UI orchestration, `state.js` for data utilities, `storage.js` for the `chrome.storage` wrapper, `drive.js` for Google Drive sync).

## Build, Test, and Development Commands

No bundling step is required; load the folder directly into a Chromium browser. Typical macOS flow:

```bash
cd /path/to/taboard
open -a "Google Chrome" --args --load-extension="$PWD"
```

Otherwise, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select this directory, and press **Reload** after edits. Drive-specific flows must be exercised inside Chrome because the `identity` API used in `drive.js` is unavailable elsewhere.

## Coding Style & Naming Conventions

Source files use modern ES modules, two-space indentation, and semicolons. Favor descriptive camelCase names for variables (`driveModalEl`, `schedulePersist`) and kebab-case for DOM IDs/data attributes to stay aligned with `index.html`. Keep DOM-heavy logic in `newtab/app.js`, pure utilities in `newtab/state.js`, and persistence adapters isolated in `newtab/storage.js`. Run `npx prettier@latest newtab/*.js` (or the equivalent editor integration) before committing multi-line edits to keep formatting consistent.

## Testing Guidelines

There is no automated test harness; rely on manual verification inside a fresh Chrome profile. Validate the left hover tab list, kanban CRUD operations, drag-and-drop, snackbar messaging, and Google Drive backup/restore each run. When migrations or default data change, clear `chrome.storage.local` via the extension’s DevTools console so you cover cold-start behavior.

## Commit & Pull Request Guidelines

With no existing Git history, adopt Conventional Commits (`feat: drive reconnect UX`, `fix: prevent duplicate space IDs`) so changelog generation stays trivial. Every PR should include a concise summary, linked issue or task ID, manual verification notes (e.g., “loaded via chrome://extensions, created cards, synced Drive”), and UI screenshots or short Loom/GIF snippets for visible tweaks. Keep PRs scoped to a single feature or bugfix to simplify review and rollback.

## Security & Configuration Tips

Do not commit real Google OAuth Client IDs or refresh tokens; share them through 1Password or issue comments if collaboration is required. Describe any new permissions in `manifest.json` inside the PR so reviewers can assess the blast radius.
