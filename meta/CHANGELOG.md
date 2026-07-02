# Changelog

> Navigate back to [CLAUDE.md](../CLAUDE.md) for full context.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Drag cards onto sidebar boards to move them between boards quickly
- UX overhaul (2026-04): tab drawer pin (T), 5s undo for deletes, single-key shortcuts (N/B/[/]/F/?), search match counts in sidebar, tag-click filter, "Add card" inline type chips, Drive menu click popover with last sync time

### Added
- Connecting Drive on a device that already has cards now asks before replacing them with the Drive version; cancelling disconnects without changing anything

### Fixed
- Card action menu is no longer covered by the cards below it
- Pending debounced local save is now flushed (not cancelled) on unload and when the tab is hidden — closing/discarding the tab right after a change no longer loses it
- A local change whose Drive push never fired (e.g. tab closed within the sync debounce) is pushed on next startup instead of being reverted by the Drive-first pull — unless another device wrote to Drive in between (then Drive still wins)
- Transient render `meta` no longer leaks into chrome.storage/Drive (stale `meta.action` made every later update behave like an add-card)
- Connecting Drive no longer wipes local spaces/boards that have no cards yet (structure counts as content)
- `activeSpaceId` is re-validated after adopting remote state (deleted-on-another-device space left no tab highlighted)
- Pretendard webfont actually loads now (inline `onload` was blocked by extension CSP); removed unused Inter font fetch
- Alt+1–9 board switching works on macOS (Option+digit types special characters; now keyed off `event.code`)
- Tab drawer no longer re-renders mid-drag (could detach the dragged item) and refreshes after a drag ends instead of staying stale
- Card links open with `noopener,noreferrer` so target pages can't script the new tab page

### 변경됨 — "kanban" 명칭을 "boards"로 통일

---

## [0.1.8]

### Added
- Boards sidebar navigation for quick space/board switching
- Sidebar UX improvements (collapse/expand, active board highlight)

### Fixed
- Drive sync mutex queue bug, token refresh, and data validation
- Stale state persistence from re-entrant ensureActiveBoardId
- Mobile sidebar overlay and dead code cleanup
- Guard queueMicrotask against page unload

---

## [0.1.7]

### Added
- Loading states, disabled controls, and inline validation feedback
- Board empty states and card type visual indicators
- Custom scrollbars and smooth scrolling behavior
- Focus-visible states, aria labels, and keyboard activation (a11y)

### Changed
- Major refactor: extract modules (drag.js, modals.js, tabs.js, render.js, drive-ui.js, constants.js)
- Rename "section" to "board" with storage migration compatibility
- Expand design tokens with font-size scale and consistent spacing
- Prioritize structuredClone and harden normalizeState validation
- Polish drag feedback and control micro-interactions

### Fixed
- Drive sync mutex, timeout, abort support, and retry boundaries
- Centralize cleanup and prevent listener/timer leaks
- Storage operation status and error propagation
- TypeError on frozen state meta deletion

### Performance
- Throttle dragover and cache layout computations
- Debounce tab filter and optimize board render diffing
- Optimize font loading with display=swap and preconnect
- Optimize performance across state management and DOM operations

---

## [0.1.5] - 2025-01-09

### Added
- Design Token System for consistent theming
- Dark Mode support
- Enhanced component animations

### Changed
- UI improvements across all components

### Fixed
- Drive sync error when syncing with new device

---

## [0.1.4] - Previous

### Fixed
- Google Drive sync issues

---

## Version History Summary

| Version | Highlights |
|---------|-----------|
| 0.1.8 | Boards sidebar navigation, Drive sync fixes |
| 0.1.7 | Major refactor, a11y, loading states, performance optimization |
| 0.1.5 | Design tokens, dark mode, animations |
| 0.1.4 | Drive sync fixes |
