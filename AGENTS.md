# Repository Guidelines

> **Source of Truth**: [CLAUDE.md](CLAUDE.md) contains the canonical project context.
> This file provides guidelines optimized for AI agents. For detailed navigation, see CLAUDE.md.

## Project Structure & Module Organization
- Root is a Manifest V3 extension; load the folder directly in Chrome.
- `manifest.json` declares permissions, OAuth client ID, and the new tab override.
- `background.js` contains lightweight service worker helpers.
- UI lives in `newtab/`: `index.html` (layout), `style.css`, `app.js` (UI orchestration, drag/drop, tab + Drive events), `state.js` (state utilities), `storage.js` (chrome.storage wrapper + Drive metadata), `drive.js` (Google Drive OAuth + sync).
- Assets: `icons/` holds browser icon variants. Use `manifest.example.json` as a safe template for secrets.

## Build, Test, and Development Commands
- No build step. Load via `chrome://extensions` → enable **Developer mode** → **Load unpacked** pointing to the repo root (or `open -a "Google Chrome" --args --load-extension="$PWD"` on macOS).
- Formatting: `npx prettier@latest newtab/*.js`.
- Manual verification happens inside Chrome with a fresh profile.

## Coding Style & Naming Conventions
- ES modules, two-space indentation, semicolons.
- Descriptive camelCase for variables (`driveModalEl`), kebab-case for DOM IDs/data attributes to match `index.html`.
- Keep DOM-heavy logic in `newtab/app.js`; pure helpers in `state.js`; persistence concerns in `storage.js`/`drive.js`.
- Run Prettier on multi-line edits; keep assets ASCII unless otherwise necessary.

## Testing Guidelines
- No automated tests. Manually check: left tab drawer (list/search/drag to board, close), space/board/card CRUD, drag-and-drop reorder/move, search input + `⌘/Ctrl + K`, favorites (★) view, board “x sites” button opens tabs/group fallback, snackbar messaging, Google Drive connect/sync/disconnect (5–30 min intervals).
- Clear `chrome.storage.local` via DevTools console when testing cold-start or migration behaviors.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat: drive reconnect UX`, `fix: prevent duplicate space IDs`).
- PRs should include: short summary, linked issue/task, manual verification notes (e.g., “loaded unpacked, created cards, synced Drive”), and UI screenshots/GIF for visual changes. Keep scope to a single feature/bugfix.

## Security & Configuration Tips
- Do not commit real Google OAuth Client IDs or tokens; keep them local using `manifest.example.json` as a base.
- Document any permission changes in `manifest.json` so reviewers can assess impact (tabs, tabGroups, identity, host permissions).

## Further Reading

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](CLAUDE.md) | Full project context & navigation index |
| [README.md](README.md) | User-facing project overview |
| [docs/architecture/](docs/architecture/) | System design details |
| [docs/guides/](docs/guides/) | Development & testing guides |
| [meta/](meta/) | Project metadata & changelog |
