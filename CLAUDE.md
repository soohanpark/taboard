# Taboard - Claude Code Context

> This is the source of truth for AI assistants working on this project.
> For general project info, see [README.md](README.md).
> For other AI agents, see [AGENTS.md](AGENTS.md).

## Quick Navigation

| Category | Document | Description |
|----------|----------|-------------|
| **Root** | [README.md](README.md) | Project overview for users |
| **Root** | [AGENTS.md](AGENTS.md) | Guidelines for AI agents |
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
- Tab drawer: view/search/drag tabs to board
- Spaces/Boards/Cards hierarchy with link/note/todo card types
- Favorites view, bulk open, keyboard shortcuts
- Google Drive sync (optional)

---

## Project Structure

```
taboard/
├── manifest.json          # Extension manifest (permissions, OAuth)
├── manifest.example.json  # Template without secrets
├── background.js          # Service worker
├── newtab/                # Main UI
│   ├── index.html         # Layout structure
│   ├── style.css          # Styles & design tokens
│   ├── app.js             # UI orchestration, events, drag/drop
│   ├── state.js           # State utilities
│   ├── storage.js         # chrome.storage wrapper
│   └── drive.js           # Google Drive OAuth & sync
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
| `app.js` | DOM manipulation, event handlers, drag/drop, modals |
| `state.js` | Pure state helpers (CRUD for spaces/boards/cards) |
| `storage.js` | chrome.storage.local persistence |
| `drive.js` | Google Drive OAuth flow, sync logic |

---

## Development Essentials

### Setup
```bash
# No build step required
# Load in Chrome:
# 1. chrome://extensions → Developer mode → Load unpacked
# 2. Or: open -a "Google Chrome" --args --load-extension="$PWD"
```

### Code Style
- ES modules, 2-space indent, semicolons
- camelCase for JS variables, kebab-case for DOM IDs
- Format with: `npx prettier@latest newtab/*.js`

### Commit Convention
- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`
- Include manual verification notes in PRs

---

## Key Patterns

### State Management
State flows: `state.js` (pure functions) → `storage.js` (persistence) → `app.js` (UI sync)

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
  ]
}
```

### Drive Sync
- File: `TaboardSync.json` in Google Drive root
- Auto-sync interval: 30 minutes
- Manual sync available via UI

---

## Security Notes

- Never commit OAuth Client IDs or tokens
- Use `manifest.example.json` as base template
- Document permission changes in PRs

---

## When Working on This Project

1. **Before making changes**: Read relevant module (`app.js`, `state.js`, etc.)
2. **UI changes**: Modify `app.js` for logic, `style.css` for styling
3. **State logic**: Keep pure functions in `state.js`
4. **Storage/sync**: Use `storage.js` for local, `drive.js` for Drive
5. **Testing**: Manual verification in Chrome with fresh profile

---

*For detailed information, navigate to the linked documents above.*
