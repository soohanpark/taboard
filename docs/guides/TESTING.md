# Testing Guide

> Navigate back to [CLAUDE.md](../../CLAUDE.md) for full context.

## Overview

Taboard uses manual testing. There are no automated tests. This guide covers the manual testing procedures.

## Test Environment Setup

### Fresh Profile
```bash
# Create a new Chrome profile for testing
# Or use Incognito mode with extension enabled

# Clear extension data:
# DevTools → Application → Storage → Clear site data
```

### DevTools Console
```javascript
// Clear all data for fresh start
chrome.storage.local.clear();
location.reload();
```

## Test Checklist

### Tab Drawer (Left Panel)

| Test | Steps | Expected |
|------|-------|----------|
| Tab list | Open new tab | Current window tabs appear |
| Tab search | Type in search box | Tabs filter by title/URL |
| Tab click | Click a tab item | Browser switches to that tab |
| Tab close | Click X on tab item | Tab closes, list updates |
| Drag to board | Drag tab to a board | Link card created with tab info |

### Spaces

| Test | Steps | Expected |
|------|-------|----------|
| Create space | Click + in tab bar | New space appears |
| Rename space | Right-click → Rename | Name updates |
| Delete space | Right-click → Delete | Space removed (with confirmation) |
| Switch space | Click space tab | Boards update to show space content |
| Favorites tab | Click star tab | Shows only favorited cards |

### Boards

| Test | Steps | Expected |
|------|-------|----------|
| Create board | Click + in space | New column appears |
| Rename board | Click board title | Inline edit, saves on blur/enter |
| Delete board | Click board menu → Delete | Board removed |
| Reorder boards | Drag board header | Boards reorder |
| Open all | Click "x sites" button | All link cards open as tab group |

### Cards

| Test | Steps | Expected |
|------|-------|----------|
| Create link | Board + → Link | Link card form appears |
| Create note | Board + → Note | Note card form appears |
| Create todo | Board + → Todo | Todo card form appears |
| Edit card | Click card | Edit modal opens |
| Delete card | Card menu → Delete | Card removed |
| Move card | Drag card to other board | Card moves |
| Favorite | Click star icon | Card marked favorite |
| Complete todo | Click checkbox | Done state toggles |

### Search & Shortcuts

| Test | Steps | Expected |
|------|-------|----------|
| Global search | Type in top search | Cards filter across all boards |
| Focus search | Press `Cmd/Ctrl + K` | Search input focuses |
| Close modal | Press `Esc` | Modal closes |

### Google Drive Sync

| Test | Steps | Expected |
|------|-------|----------|
| Connect | Click Drive button → Connect | OAuth flow, connection success |
| Manual sync | Menu → Manual sync | Data syncs to Drive |
| Auto sync | Wait 30 minutes | Automatic backup occurs |
| Disconnect | Menu → Disconnect | Drive unlinked |
| Restore | New device → Connect | Data restored from Drive |

### Snackbar Messages

| Action | Expected Message |
|--------|-----------------|
| Save success | "Saved" or similar |
| Drive sync | "Synced to Drive" |
| Error | Error description shown |

## Edge Cases

### Empty States
- No spaces: Should show create prompt
- No boards in space: Should show create prompt
- No cards in board: Should show empty state

### Data Limits
- Many spaces (10+): Should remain responsive
- Many boards (20+): Should scroll properly
- Many cards (100+): Should remain responsive
- Long titles: Should truncate/wrap properly

### Error Handling
- Drive API error: Should show error message
- Storage quota exceeded: Should warn user
- Invalid data: Should handle gracefully

## Regression Testing

After any code change, verify:

1. [ ] New tab loads without errors
2. [ ] Existing data loads correctly
3. [ ] Basic CRUD operations work
4. [ ] Drag-and-drop functions
5. [ ] Search filters properly
6. [ ] Keyboard shortcuts work
7. [ ] No console errors

## Reporting Issues

When reporting bugs:

```markdown
**Environment**
- Chrome version:
- OS:
- Extension version:

**Steps to Reproduce**
1.
2.
3.

**Expected Behavior**

**Actual Behavior**

**Console Errors** (if any)

**Screenshots** (if applicable)
```
