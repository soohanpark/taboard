# Project Metadata

> Navigate back to [CLAUDE.md](../CLAUDE.md) for full context.

## Basic Info

| Field | Value |
|-------|-------|
| Name | Taboard |
| Type | Chrome Extension (Manifest V3) |
| Version | See [manifest.json](../manifest.json) |
| License | - |

## Purpose

Replace Chrome's new tab page with a productivity tool combining:
- Tab management (left drawer)
- Personal kanban board (main area)

## Target Users

- Users who manage many browser tabs
- Users who want quick access to saved links/notes/todos
- Users who prefer visual organization (kanban style)

## Technical Stack

| Component | Technology |
|-----------|------------|
| Platform | Chrome Extension API (Manifest V3) |
| Frontend | Vanilla JS (ES Modules) |
| Storage | chrome.storage.local |
| Sync | Google Drive API (optional) |
| Styling | CSS Custom Properties (Design Tokens) |

## Goals

1. **Simplicity**: No build step, pure vanilla JS
2. **Privacy**: Local-first storage, optional cloud sync
3. **Performance**: Lightweight, instant new tab load
4. **Usability**: Intuitive drag-and-drop, keyboard shortcuts

## Non-Goals

- Server-side backend
- Cross-browser support (Chrome only)
- Complex project management features
