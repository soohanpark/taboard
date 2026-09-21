# Repository Guidelines

## Project Structure & Module Organization

Taboard is a build-free Manifest V3 Chrome extension. The new-tab UI lives in `newtab/`: `app.js` coordinates events, `state.js` contains state operations, `storage.js` handles local persistence, `drive.js` and `drive-ui.js` implement Google Drive sync, and `render.js`, `modals.js`, `tabs.js`, and `drag.js` isolate UI concerns. `background.js` is the extension service worker. Automated tests are in `test/*.test.mjs`. Brand sources and generated icons live in `icons/`; Chrome Web Store screenshots and promos live in `store-assets/`. See `docs/` for architecture, development, and API notes, and `meta/` for project history.

## Build, Test, and Development Commands

- `npm test` runs the full Node test suite with ES module mocking enabled.
- `npm run assets:verify` checks generated brand assets only.
- `npm run assets:generate` regenerates extension icons and promotional artwork from source assets.
- `npm run assets:capture` refreshes store screenshots; Chrome may be required.
- `cp manifest.example.json manifest.json` creates a local manifest; add your OAuth client ID only when testing Drive sync.

There is no compilation step. Load the repository as an unpacked extension from `chrome://extensions`, then refresh the new-tab page after source changes. Reload the extension itself after manifest or service-worker changes.

## Coding Style & Naming Conventions

Use modern ES modules, 2-space indentation, semicolons, and double quotes. Follow existing Prettier-compatible formatting (`npx prettier@latest newtab/*.js test/*.mjs --write`). Use `camelCase` for variables and functions, `UPPER_SNAKE_CASE` for constants, and `kebab-case` for HTML IDs and CSS classes. Keep state transformations pure where practical and keep Chrome API or DOM work at module boundaries.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name files `<behavior>.test.mjs` and write test descriptions as observable outcomes. Add regression coverage for state, sync, modal, rendering, or asset changes. Before submitting, run `npm test` and manually verify the affected flow in Chrome, including console errors and persistence across reloads.

## Commit & Pull Request Guidelines

History follows Conventional Commits: `feat:`, `fix:`, `docs:`, `build:`, and scoped forms such as `fix(drive-sync):`. Keep commits focused and imperative. Pull requests should explain the user-visible change, note tests performed, link relevant issues, and include screenshots for UI or store-asset changes. Call out permission, OAuth, storage-schema, or sync behavior changes explicitly.

## Security & Configuration

Do not commit a real OAuth client ID or user data. Treat changes to `manifest.json`, Chrome permissions, Drive scopes, and sync conflict resolution as security-sensitive and test both signed-in and local-only behavior.
