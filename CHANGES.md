# Changes — v24 (8 October 2026)

## Fixed: a removed connection coming back

There were two separate causes. The earlier v23 patch addressed neither properly.

**1. The sync server put it back.** `api/sync.js` merged connections with a plain union
of both copies, so a connection removed on one device returned the moment the server
merged in any copy that still had it — another device, or the server's own stored copy.
Connections now get the same treatment nodes already had:

- each connection carries `c.m`, the time it was last added or changed on a device;
- each document carries `d.conngone`, `{ id: time removed }`;
- the server merges both tombstone lists and keeps a connection only if it was touched
  after its removal. Undo re-stamps a restored connection, so undo still works.

The stamps and tombstones are worked out in `save()` by comparing with the previous save
(`stampConns`), not inside one delete function. That covers every way a connection can go:
the Remove button, the Delete key, deleting one of its nodes, and undo/redo. Tombstones are
kept for 60 days, at most 500 per document.

**2. A second open copy wrote it back, even with sync off.** Every time the app went into
the background it wrote its entire in-memory workspace to storage, whether or not anything
had changed in it. With the installed app and a browser tab both open, the idle copy put its
older workspace back over the one where the connection had just been removed. Now:

- a copy only writes when it has unsaved changes of its own;
- an idle copy takes on what another tab saves (the `storage` event), keeping its own open
  document, selection and camera.

Both causes were reproduced in a real browser before fixing, and are covered by the tests.

## Fixed: bending a connection with the mouse

Previously you had to click the connection first, then find and drag the small waypoint;
pressing on the line and dragging did nothing. Now pressing on the line and dragging bends
it straight away (mouse, touch and pen). The curve keeps the offset from where you grabbed
it, so it moves smoothly instead of jumping. A click without movement still just selects,
a double-click still names it, and the whole drag is one undo step.

## New: connection dot on nodes

As in MindNode, a small orange dot appears on the top-right corner of the node under the
pointer (or the selected node on a touch screen). Drag it to another node to connect the
two, or click it and then click the other node. Joining two already-joined nodes selects
the existing connection instead of stacking a duplicate.

## New: notes beside the node

- `Ctrl`/`Cmd` + `Shift` + `K`, *Add note* / *Edit note* in the right-click menu, or a click
  on a node's 📝 opens the note in a popover beside the node. It saves as you type, `Esc`
  or a click elsewhere closes it, and clearing the text removes the note.
- Hovering a node's 📝 shows the note text.
- `Ctrl`/`Cmd` + `5`, or *Notes panel* in the right-click menu, opens the side panel on
  its Note tab. The panel follows the selection, so you can click node after node and keep
  writing.

## Connection notes, corrected

v23 added a note editor to connections, but it used a colour variable that doesn't exist
(transparent background) and left inline styles stuck on the connection bar afterwards. It
now has its own CSS, closes with a click elsewhere or `Ctrl`+`Enter`, cancels with `Esc`,
and is not wiped by a redraw while you type. A connection with a note shows 📝 on the line,
and hovering the line shows the note.

## Also fixed

- The **+** buttons beside a node vanished as you moved the pointer onto them, unless that
  node was already selected. They now stay put.
- v23 changed `app.js` without bumping the asset version, so the service worker could keep
  serving the old file. All assets are now `?v=24` and the cache is `mindnote-v24`.

## Compatibility

Older saves and older sync data load unchanged: connections without a stamp count as
time 0, and a document without `conngone` simply has no tombstones. No migration.

## Deploying

GitHub Pages serves the app, but it cannot run `api/sync.js`; sync needs the Vercel
deployment described in the README. Redeploy the `api` folder there to get the server fix.
