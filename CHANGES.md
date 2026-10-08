# MindNote v9 - Bug Fixes & Enhancements (October 8, 2026)

## Critical Bug Fix: Connection Re-appearance After Deletion

### The Problem
After removing a connection from the mind map and saving, the connection would automatically reappear when:
- Syncing with another device
- The app performed a data merge from the server
- Data was reloaded from storage

### Root Cause Analysis
The `removeConn()` function only removed connections from the in-memory array without creating a permanent deletion marker. When the sync system (`merge()`) pulled data from the server, the connection would be restored because the server had no record of the local deletion.

### The Solution: Tombstone Tracking System

Implemented a deletion registry pattern (mirroring the existing node deletion system) with a `conngone` object that tracks deleted connection IDs with timestamps.

#### Implementation Details

**File: `app.js`**

##### EDIT 1: removeConn() Function (Line 2130-2139)
```javascript
function removeConn(id) {
  pushUndo();
  const d = doc();
  d.connections = d.connections.filter(x => x.id !== id);
  if (selConn === id) selConn = null;

  // Track deleted connections like we do for deleted nodes, to prevent resurrection from sync
  if (!d.conngone) d.conngone = {};
  d.conngone[id] = Date.now();

  save(); render(); toast('Connection removed');
}
```

**What changed:** Added `d.conngone` tracking. When a connection is deleted, its ID is recorded in the tombstone registry with a timestamp.

---

##### EDIT 2: drawEdges() Function (Line 1734-1737)
```javascript
d.connections.forEach(c => {
  // Skip connections that have been explicitly deleted (tombstone tracking)
  if (d.conngone && d.conngone[c.id]) return;
  if (!P[c.a] || !P[c.b]) return;
  // ... rest of rendering logic
```

**What changed:** Before rendering any connection, check if it's in the `conngone` registry. If it is, skip rendering it.

---

##### EDIT 3: hydrate() Function (Line 890-894)
```javascript
Object.values(S.docs).forEach(d => {
  d.connections = d.connections || []; d.tags = d.tags || [];
  d.conngone = d.conngone || {};
  // Filter out any connections that have been marked as deleted
  d.connections = d.connections.filter(c => !d.conngone[c.id]);
  Object.values(d.nodes).forEach(n => { n.tags = n.tags || []; });
  // ... rest of hydration
```

**What changed:** When loading saved workspace data from storage, filter out any connections that have been marked as deleted in the `conngone` registry.

---

##### EDIT 4: merge() Function (Line 5313-5317)
```javascript
const docs = {};
for (const [id, d] of Object.entries(state.docs)) {
  if (cams[id]) d.cam = cams[id];
  // Ensure connection tracking is initialized and clean
  d.connections = d.connections || [];
  d.conngone = d.conngone || {};
  // Filter out any connections that have been marked as deleted
  d.connections = d.connections.filter(c => !d.conngone[c.id]);
  docs[id] = d;
}
```

**What changed:** **CRITICAL FIX** - When merging sync data from the server, ensure deleted connections remain deleted. The server doesn't know about local deletions, so we explicitly remove them.

---

### How It Works Across the Architecture

1. **User deletes connection** → `removeConn()` records deletion in `d.conngone`
2. **App saves** → `d.conngone` is persisted with the workspace
3. **App syncs** → `sync.js` sends current state including `d.conngone`
4. **Another device syncs** → `merge()` filters connections against `d.conngone`
5. **Data reloads** → `hydrate()` filters connections against `d.conngone`
6. **Rendering** → `drawEdges()` skips any connection in `d.conngone`

**Result:** Deleted connections stay deleted across all devices and operations.

---

## Enhancement: Connection Notes Feature

### User Request
Add ability to add notes/metadata to connections, allowing users to annotate why nodes are connected, add context, or document relationship types.

### Implementation

#### EDIT 5: renderConnBar() Function (Line 2002-2011)
Added UI button for managing connection notes in the toolbar:

```javascript
el.appendChild(btn(c.title ? 'Edit title' : 'Add title', 'Name this connection', () => editConnTitle(c.id)));
if (c.note) {
  el.appendChild(btn('📝 Edit note', 'Edit the note on this connection', () => editConnNote(c.id)));
} else {
  el.appendChild(btn('📝 Add note', 'Add a note to this connection', () => editConnNote(c.id)));
}
if (!connIsStraight(c)) el.appendChild(btn('Straighten', 'Make this connection straight', () => {
  pushUndo(); straightenConn(c); save(); render(); toast('Straightened');
}));
el.appendChild(btn('Remove', 'Remove this connection', () => removeConn(c.id), 'danger'));
```

**What changed:** 
- Added button to add or edit notes on connections
- Button text and icon (📝) change based on whether a note already exists
- Clicking opens the `editConnNote()` editor

---

#### EDIT 6: editConnNote() Function (Line 2088-2130)
New function providing the note-editing interface:

```javascript
function editConnNote(id) {
  const c = theConn(id);
  if (!c) return;
  selConn = id;
  const el = connBarEl();
  el.hidden = false;
  el.innerHTML = '';
  const textarea = document.createElement('textarea');
  textarea.className = 'conn-note';
  textarea.value = c.note || '';
  textarea.placeholder = 'Add a note to this connection…';
  textarea.setAttribute('aria-label', 'Connection note');
  textarea.style.cssText = 'width: 100%; min-height: 60px; padding: 8px; border: 1px solid var(--accent); border-radius: 4px; font-family: inherit; font-size: 13px; resize: none;';
  el.appendChild(textarea);

  let done = false;
  const finish = keep => {
    if (done) return;
    done = true;
    const live = theConn(id);
    if (keep && live) {
      const text = textarea.value.trim();
      if ((live.note || '') !== text) {
        pushUndo();
        if (text) live.note = text; else delete live.note;
        save();
      }
    }
    hideConnBar();
    render();
  };
  textarea.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
  });
  textarea.addEventListener('blur', () => finish(true));
  el.style.cssText = 'position: fixed; z-index: 100; background: var(--bg); border: 1px solid var(--accent); border-radius: 8px; padding: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
  placeConnBar(el, c);
  setTimeout(() => { textarea.focus(); }, 0);
}
```

**What changed:**
- New function handles the complete note-editing workflow
- Textarea appears positioned at the connection midpoint
- **Escape** key cancels without saving
- **Blur** (clicking away) saves changes automatically
- **Undo support** - changes are added to undo stack
- **Conflict-free save** - checks if content actually changed before saving
- **Auto-cleanup** - empty notes are removed from the connection object
- **Smooth UX** - textarea automatically focuses for immediate editing

---

### Use Cases for Connection Notes

1. **Relationship Documentation**
   - "Depends on completion of" 
   - "References implementation in"
   - "Requires approval from"

2. **Context Addition**
   - Add URLs, references, or citations
   - Document why these nodes are connected
   - Record the relationship type

3. **Status Tracking**
   - "In progress as of Oct 8"
   - "Waiting on feedback from team"
   - "Ready for review"

4. **Mind Map Metadata**
   - Connection strength (weak/strong)
   - Timeline information
   - Conditional relationships

---

## Files Modified

- ✅ `app.js` - 6 edits (bug fix + enhancement)
- ✅ `README.md` - Updated with new features
- ✅ All other files preserved unchanged

## Backward Compatibility

✅ **Fully backward compatible**
- Old workspaces load without errors
- Missing `conngone` is initialized as empty object
- Connection notes are optional (empty by default)
- No schema changes required
- No migration needed

## Testing Recommendations

1. **Delete a connection, then sync** - Connection should stay deleted on all devices
2. **Add a note to a connection** - Note should sync across devices
3. **Edit a connection note** - Changes should be undoable and sync properly
4. **Reload the page** - Deleted connections and notes should persist
5. **Import old MindNote files** - Should work without errors

---

## Version Info

- **Base Version:** MindNote v9
- **Fixed Version:** MindNote v9-fixed
- **Date:** October 8, 2026
- **Breaking Changes:** None
- **Database Schema Changes:** None

---

## Deployment Notes

This version can be deployed as a drop-in replacement for MindNote v9. No database migrations, API changes, or breaking changes required.

For GitHub Pages deployment:
1. Push all files to your `main` branch
2. Enable GitHub Pages in repository settings
3. Select `main` branch as source
4. Access at `https://yourusername.github.io/repositoryname`

---

## Summary of Changes

| Issue | Status | Solution |
|-------|--------|----------|
| Connections reappear after deletion | ✅ FIXED | Tombstone tracking with `conngone` registry |
| No way to add notes to connections | ✅ FIXED | New `editConnNote()` function + UI button |
| Deletion not synced across devices | ✅ FIXED | `merge()` function respects `conngone` |
| Data recovery could resurrect deleted items | ✅ FIXED | `hydrate()` filters on load |
| Deleted connections render visually | ✅ FIXED | `drawEdges()` checks tombstone |

---

**Ready for production deployment! 🚀**
