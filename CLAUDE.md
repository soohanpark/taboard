# Taboard - Claude Code Context

> This is the source of truth for AI assistants working on this project.
> For general project info, see [README.md](README.md).

## Quick Navigation

| Category | Document | Description |
|----------|----------|-------------|
| **Root** | [README.md](README.md) | Project overview for users |
| **Root** | [AGENTS.md](AGENTS.md) | Redirects to this file |
| **Meta** | [meta/PROJECT.md](meta/PROJECT.md) | Project metadata & goals |
| **Meta** | [meta/CHANGELOG.md](meta/CHANGELOG.md) | Version history |
| **Docs** | [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md) | System architecture |
| **Docs** | [docs/guides/DEVELOPMENT.md](docs/guides/DEVELOPMENT.md) | Development workflow |
| **Docs** | [docs/guides/TESTING.md](docs/guides/TESTING.md) | Testing procedures |
| **Docs** | [docs/reference/API.md](docs/reference/API.md) | Internal API reference |

---

## Project Overview

**Taboard** is a Chrome Extension (Manifest V3) that replaces the new tab page with a tab manager + personal kanban board.

### Core Features
- Tab drawer (sidebar): view/search/drag tabs to board
- Spaces/Boards/Cards hierarchy with link/note/todo card types
- Kanban board sidebar navigation for quick space/board switching
- Favorites view, bulk open, keyboard shortcuts
- Google Drive sync (optional, auto every 30 min)

---

## Project Structure

```
taboard/
├── manifest.json          # Extension manifest (permissions, OAuth)
├── manifest.example.json  # Template without secrets
├── background.js          # Service worker (install, messaging)
├── newtab/                # Main UI
│   ├── index.html         # Layout structure
│   ├── style.css          # Styles & design tokens
│   ├── app.js             # UI orchestration, event wiring, init
│   ├── state.js           # Immutable state helpers (CRUD)
│   ├── storage.js         # chrome.storage.local persistence
│   ├── drive.js           # Google Drive OAuth & sync logic
│   ├── drive-ui.js        # Drive UI controls & sync scheduling
│   ├── render.js          # DOM rendering (boards, cards, sidebar)
│   ├── drag.js            # Drag-and-drop logic (cards, boards, tabs)
│   ├── modals.js          # Modal dialogs, snackbar, confirm prompts
│   ├── tabs.js            # Tab drawer (list, filter, drag-to-board)
│   └── constants.js       # Shared constants & magic numbers
├── icons/                 # Extension icons
├── meta/                  # Project metadata
│   ├── PROJECT.md
│   └── CHANGELOG.md
└── docs/                  # Documentation
    ├── architecture/
    ├── guides/
    └── reference/
```

### Module Responsibilities

| File | Responsibility |
|------|---------------|
| `app.js` | Top-level orchestration: wires events, initializes modules, keyboard shortcuts |
| `state.js` | Pure immutable state helpers (CRUD for spaces/boards/cards, preferences) |
| `storage.js` | chrome.storage.local read/write wrapper |
| `drive.js` | Google Drive OAuth flow, push/pull sync, token refresh |
| `drive-ui.js` | Drive UI buttons, auto-sync scheduling, save/sync debouncing |
| `render.js` | DOM rendering for boards, cards, space tabs, sidebar navigation |
| `drag.js` | Drag-and-drop for cards between boards, board reordering, tab-to-card drops |
| `modals.js` | Card/space edit modals, confirm dialogs, snackbar notifications |
| `tabs.js` | Tab drawer panel: list current window tabs, filter, drag tabs to board |
| `constants.js` | Shared constants: timings, MIME types, view modes, defaults |
| `background.js` | Service worker: install handler, message listener (PING, NEW_TAB_READY) |

---

## Development Essentials

### Setup
```bash
# No build step required
# Load in Chrome:
# 1. chrome://extensions -> Developer mode -> Load unpacked
# 2. Or: open -a "Google Chrome" --args --load-extension="$PWD"
```

### Code Style
- ES modules, 2-space indent, semicolons
- camelCase for JS variables, kebab-case for DOM IDs
- Format with: `npx prettier@latest newtab/*.js`

### Commit Convention
- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Include manual verification notes in PRs

---

## Key Patterns

### State Management
State flows: `state.js` (pure immutable functions) -> `storage.js` (persistence) -> `render.js` (DOM update) <- `app.js` (event wiring)

All state mutations create new objects; no direct mutation.

### Module Initialization
`app.js` calls each module's `init()` function during startup, passing mutation callbacks so modules remain decoupled.

### Data Structure
```javascript
{
  spaces: [
    {
      id: "space-uuid",
      name: "Work",
      boards: [
        {
          id: "board-uuid",
          name: "To Research",
          cards: [
            { id: "card-uuid", type: "link|note|todo", title: "", url: "", done: false, fav: false, tags: [] }
          ]
        }
      ]
    }
  ],
  preferences: {
    activeSpaceId: "space-uuid",
    activeBoardId: "board-uuid"
  }
}
```

### Drive Sync
- File: `TaboardSync.json` in Google Drive root
- Auto-sync interval: 30 minutes
- Manual sync available via UI
- Mutex queue prevents concurrent sync operations

---

## Security Notes

- Never commit OAuth Client IDs or tokens
- Use `manifest.example.json` as base template
- Document permission changes in PRs

---

## When Working on This Project

1. **Before making changes**: Read relevant module(s) first
2. **UI rendering**: Modify `render.js` for DOM output, `style.css` for styling
3. **Event handling / orchestration**: Modify `app.js`
4. **State logic**: Keep pure immutable functions in `state.js`
5. **Drag-and-drop**: Modify `drag.js`
6. **Modals / dialogs**: Modify `modals.js`
7. **Tab drawer**: Modify `tabs.js`
8. **Storage/sync**: Use `storage.js` for local, `drive.js` / `drive-ui.js` for Drive
9. **Testing**: Manual verification in Chrome with fresh profile

---

*For detailed information, navigate to the linked documents above.*
