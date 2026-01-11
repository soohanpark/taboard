# Architecture Overview

> Navigate back to [CLAUDE.md](../../CLAUDE.md) for full context.

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
├─────────────────────────────────────────────────────────────┤
│  manifest.json                                               │
│  ├── permissions: tabs, tabGroups, storage, identity         │
│  ├── new tab override → newtab/index.html                    │
│  └── service worker → background.js                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      newtab/                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  index.html ──────────────────────────────────────────────  │
│       │                                                      │
│       ├── style.css (Design Tokens, Components)              │
│       │                                                      │
│       └── app.js (Entry Point)                               │
│             │                                                │
│             ├── state.js ────► Pure state functions          │
│             │                                                │
│             ├── storage.js ──► chrome.storage.local          │
│             │                                                │
│             └── drive.js ────► Google Drive API              │
│                                    │                         │
└────────────────────────────────────│─────────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────┐
                          │   Google Drive   │
                          │ TaboardSync.json │
                          └──────────────────┘
```

## Module Architecture

### Layered Structure

```
┌─────────────────────────────────────┐
│           Presentation              │
│  app.js: DOM, Events, Drag/Drop     │
├─────────────────────────────────────┤
│           Business Logic            │
│  state.js: Pure state operations    │
├─────────────────────────────────────┤
│           Persistence               │
│  storage.js: Local storage          │
│  drive.js: Cloud sync               │
└─────────────────────────────────────┘
```

### Data Flow

```
User Action
    │
    ▼
app.js (Event Handler)
    │
    ├── state.js (Modify State)
    │       │
    │       ▼
    ├── storage.js (Persist Locally)
    │       │
    │       ▼
    └── app.js (Update DOM)
            │
            ▼
        UI Updated
```

## Key Components

### 1. Tab Drawer (Left Panel)
- Lists tabs in current window
- Search/filter functionality
- Drag tabs to board to create cards
- Click to switch, close button to remove

### 2. Space Tabs (Top)
- Multiple spaces for organization
- Create/rename/delete spaces
- Special "Favorites" tab

### 3. Board Columns
- Vertical columns within each space
- Contains cards
- "Open all" button for bulk tab opening
- Drag-and-drop reordering

### 4. Cards
- Three types: link, note, todo
- Properties: title, url, done, favorite, tags
- Drag-and-drop between boards

## State Structure

```javascript
// Root state object
{
  spaces: Space[],
  activeSpaceId: string,
  settings: Settings
}

// Space
{
  id: string,
  name: string,
  boards: Board[]
}

// Board
{
  id: string,
  name: string,
  cards: Card[]
}

// Card
{
  id: string,
  type: "link" | "note" | "todo",
  title: string,
  url?: string,
  content?: string,
  done: boolean,
  fav: boolean,
  tags: string[]
}
```

## Design Decisions

### Why Vanilla JS?
- No build step needed
- Faster initial load
- Simpler maintenance
- Chrome Extension constraints

### Why Local-First?
- Privacy by default
- Works offline
- Optional cloud sync for those who need it

### Why Google Drive?
- User-controlled storage
- No server infrastructure needed
- Familiar to users
