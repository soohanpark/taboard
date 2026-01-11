# Development Guide

> Navigate back to [CLAUDE.md](../../CLAUDE.md) for full context.

## Prerequisites

- Google Chrome (latest)
- Node.js (for Prettier, optional)
- Text editor / IDE

## Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd taboard
```

### 2. Configure OAuth (Optional, for Drive sync)

```bash
# Copy example manifest
cp manifest.example.json manifest.json

# Edit manifest.json and add your OAuth client ID
# in the "oauth2.client_id" field
```

### 3. Load Extension

**Option A: Chrome UI**
1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `taboard` folder

**Option B: Command Line (macOS)**
```bash
open -a "Google Chrome" --args --load-extension="$PWD"
```

### 4. Open New Tab
- Press `Cmd+T` (macOS) or `Ctrl+T` (Windows/Linux)
- Taboard should appear as your new tab page

## Development Workflow

### Making Changes

1. Edit files in your editor
2. Save changes
3. Refresh the new tab page (`Cmd+R` / `Ctrl+R`)
4. For `manifest.json` changes, reload extension in `chrome://extensions`

### Code Formatting

```bash
npx prettier@latest newtab/*.js --write
```

### File Responsibilities

| When changing... | Edit... |
|-----------------|---------|
| UI layout | `newtab/index.html` |
| Styling | `newtab/style.css` |
| Event handlers, DOM | `newtab/app.js` |
| State operations | `newtab/state.js` |
| Local storage | `newtab/storage.js` |
| Drive sync | `newtab/drive.js` |
| Permissions | `manifest.json` |

## Debugging

### DevTools
1. Right-click on new tab page
2. Select "Inspect"
3. Use Console, Network, Application tabs

### Common Debug Commands

```javascript
// View current state
console.log(await chrome.storage.local.get());

// Clear all data (use with caution)
chrome.storage.local.clear();

// Check extension errors
// Go to chrome://extensions → Taboard → "Errors"
```

### Service Worker Logs
1. Go to `chrome://extensions`
2. Find Taboard
3. Click "service worker" link under "Inspect views"

## Code Style

### JavaScript
- ES modules (`import`/`export`)
- 2-space indentation
- Semicolons required
- camelCase for variables/functions
- UPPER_CASE for constants

### HTML/CSS
- kebab-case for IDs and classes
- CSS custom properties for theming
- BEM-like naming for components

### Examples

```javascript
// Good
const activeSpaceId = getActiveSpace();
const MAX_CARDS_PER_BOARD = 100;

// Bad
const activespaceid = getActiveSpace();
const maxCards = 100;
```

```html
<!-- Good -->
<div id="tab-drawer" class="drawer-panel">

<!-- Bad -->
<div id="tabDrawer" class="drawerPanel">
```

## Git Workflow

### Branch Naming
```
feature/short-description
fix/issue-description
refactor/what-changed
```

### Commit Messages
Use Conventional Commits:
```
feat: add card tagging feature
fix: prevent duplicate space IDs
refactor: extract card renderer
docs: update development guide
```

### Pull Request Checklist
- [ ] Code formatted with Prettier
- [ ] Manually tested in Chrome
- [ ] No console errors
- [ ] Commit message follows convention
- [ ] PR description includes test notes
