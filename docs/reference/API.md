# Internal API Reference

> Navigate back to [CLAUDE.md](../../CLAUDE.md) for full context.

## Module: state.js

Pure functions for state manipulation.

### Spaces

```javascript
// Create a new space
createSpace(state, name) → { state, space }

// Update space name
updateSpace(state, spaceId, updates) → state

// Delete space
deleteSpace(state, spaceId) → state

// Get space by ID
getSpace(state, spaceId) → space | undefined
```

### Boards

```javascript
// Create a new board in space
createBoard(state, spaceId, name) → { state, board }

// Update board
updateBoard(state, spaceId, boardId, updates) → state

// Delete board
deleteBoard(state, spaceId, boardId) → state

// Reorder boards
reorderBoards(state, spaceId, fromIndex, toIndex) → state
```

### Cards

```javascript
// Create a card
createCard(state, spaceId, boardId, cardData) → { state, card }

// Card data structure:
// { type: "link"|"note"|"todo", title, url?, content?, tags? }

// Update card
updateCard(state, spaceId, boardId, cardId, updates) → state

// Delete card
deleteCard(state, spaceId, boardId, cardId) → state

// Move card between boards
moveCard(state, spaceId, fromBoardId, toBoardId, cardId, toIndex) → state

// Toggle favorite
toggleFavorite(state, spaceId, boardId, cardId) → state

// Toggle done (for todos)
toggleDone(state, spaceId, boardId, cardId) → state
```

### Queries

```javascript
// Get all favorited cards across all spaces
getFavorites(state) → Card[]

// Search cards by query
searchCards(state, query) → Card[]

// Get cards by tag
getCardsByTag(state, tag) → Card[]
```

---

## Module: storage.js

Chrome storage wrapper.

```javascript
// Load state from storage
loadState() → Promise<state>

// Save state to storage
saveState(state) → Promise<void>

// Get specific key
getStorageItem(key) → Promise<value>

// Set specific key
setStorageItem(key, value) → Promise<void>

// Clear all storage
clearStorage() → Promise<void>
```

### Storage Keys

| Key | Type | Description |
|-----|------|-------------|
| `taboard_state` | Object | Main application state |
| `taboard_settings` | Object | User preferences |
| `taboard_drive_meta` | Object | Drive sync metadata |

---

## Module: drive.js

Google Drive integration.

### Authentication

```javascript
// Initiate OAuth flow
authenticate() → Promise<token>

// Check if connected
isConnected() → boolean

// Disconnect from Drive
disconnect() → Promise<void>
```

### Sync Operations

```javascript
// Sync state to Drive
syncToDrive(state) → Promise<void>

// Load state from Drive
loadFromDrive() → Promise<state>

// Get sync status
getSyncStatus() → { lastSync, isConnected }
```

### File Operations

```javascript
// File: TaboardSync.json in Drive root

// Upload data
uploadFile(data) → Promise<fileId>

// Download data
downloadFile(fileId) → Promise<data>

// Find existing file
findSyncFile() → Promise<fileId | null>
```

---

## Module: app.js

Main UI controller (not a public API, but key functions).

### Initialization

```javascript
// Entry point - called on DOMContentLoaded
init() → void
```

### Rendering

```javascript
// Render entire UI from state
render(state) → void

// Render specific components
renderSpaceTabs(spaces) → void
renderBoards(boards) → void
renderCards(cards) → void
renderTabDrawer(tabs) → void
```

### Event Handlers

```javascript
// Tab drawer events
handleTabClick(tabId) → void
handleTabClose(tabId) → void
handleTabDragStart(event) → void

// Space events
handleSpaceCreate() → void
handleSpaceSelect(spaceId) → void
handleSpaceDelete(spaceId) → void

// Board events
handleBoardCreate(spaceId) → void
handleBoardDelete(spaceId, boardId) → void
handleBoardOpenAll(boardId) → void

// Card events
handleCardCreate(boardId, type) → void
handleCardEdit(cardId) → void
handleCardDelete(cardId) → void
handleCardDrop(event) → void
```

### Modals

```javascript
// Show/hide modals
showModal(type, data) → void
hideModal() → void

// Modal types: "card-edit", "confirm", "settings"
```

---

## Chrome APIs Used

### tabs

```javascript
// Get current window tabs
chrome.tabs.query({ currentWindow: true })

// Switch to tab
chrome.tabs.update(tabId, { active: true })

// Close tab
chrome.tabs.remove(tabId)

// Create tab
chrome.tabs.create({ url })
```

### tabGroups

```javascript
// Create tab group
chrome.tabs.group({ tabIds })

// Update group properties
chrome.tabGroups.update(groupId, { title, color })
```

### storage

```javascript
// Local storage
chrome.storage.local.get(keys)
chrome.storage.local.set(items)
chrome.storage.local.clear()
```

### identity

```javascript
// OAuth
chrome.identity.getAuthToken({ interactive: true })
chrome.identity.removeCachedAuthToken({ token })
```

---

## Data Structures

### Full State Example

```javascript
{
  spaces: [
    {
      id: "space-abc123",
      name: "Work",
      boards: [
        {
          id: "board-def456",
          name: "To Read",
          cards: [
            {
              id: "card-ghi789",
              type: "link",
              title: "Article Title",
              url: "https://example.com",
              done: false,
              fav: true,
              tags: ["reading", "tech"],
              createdAt: 1704067200000
            }
          ]
        }
      ]
    }
  ],
  activeSpaceId: "space-abc123",
  settings: {
    theme: "auto",
    syncEnabled: true
  }
}
```
