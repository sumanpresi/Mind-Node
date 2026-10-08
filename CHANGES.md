# Changes — v28 (8 October 2026)

- **Attach files** picks several files at once (Ctrl- or Shift-click in the picker).
- **Folder** attaches a whole folder: it is rebuilt in Google Drive with its subfolders,
  sent file by file with one overall progress bar ("12 of 40 files"), and appears on the node
  as a single attachment that opens the folder in Drive. It is recorded only when every file
  has arrived; after a failure, Retry carries on without re-sending finished files; Cancel
  moves the half-sent folder to Drive's bin.
- **Drag and drop** files or folders onto the note box. If Google Drive is not connected yet,
  an "Upload …" button appears (sign-in needs a click). A file dropped anywhere else no longer
  makes the browser leave MindNote to display it.

# v27 (8 October 2026)

## Attachments in Google Drive

- **Attach file** in the note box uploads any file, any size, straight from the browser to
  the user's Google Drive (resumable, with progress, Cancel, and Retry; a dropped connection
  carries on from where it stopped). Nothing goes through the sync server.
- Files land in `MindNote Attachments/<map name>/`, found again by a tag rather than by name,
  so every device uses the same folders.
- The node keeps only `{ id, driveId, name, mime, size, modified }` per file and shows a 📎
  (with a count). Hovering lists the files; clicking opens the note box.
- **Open**: Word/Excel/PowerPoint in Google's editors in their own format (`rtpof=true`, no
  conversion); Google Docs/Sheets/Slides in their editors; PDF, images and everything else in
  Drive's viewer. The account is named in the link, for browsers signed in to several.
- Name, size and date refresh whenever the note opens (when already signed in), which is how
  edits made in Google's editor appear. A file deleted or binned in Drive shows as missing.
- ⋮ menu: Open, Open in Google Drive, Copy link, Download, Rename, Remove. Remove asks:
  *MindNote only* (file stays in Drive) or *also move it to the Drive bin* (recoverable for
  30 days). Nothing is ever erased outright, and undo restores a removed attachment record.
- Sign-in: Google's browser token flow, scope `drive.file`; no client secret, token kept in
  memory only. Data & backup shows the Drive status, with Connect / Disconnect.
- The node picture (shown on the map, kept on the device) is unchanged and sits next to
  Attach file. The footer no longer wraps when a long link is shown.

# v26 (8 October 2026)

- **Notes are always marked.** A node with a note now always shows a small notepad-and-
  pencil icon. Before, the marker was hidden whenever the toolbar's Notes toggle was off,
  which made notes impossible to spot. That toggle now only controls whether note text is
  printed under each row in the Outline view; when it is off, the Outline shows the same
  notepad icon instead. Hover the icon for a preview, click it to open the note.

# v25 (8 October 2026)

## Notes, the MindNode way

- **Note popover** — attached to the node with a pointer, its top edge in the node's
  colour, the node's name small and centred, a large writing area, and a grey footer:
  *No Attachment* on the left (click to attach a picture to the node; it then shows the
  thumbnail and a ✕ to remove it) and *Link…* on the right (adds or edits the node's web
  link and then shows it). The popover follows the node as you pan and zoom.
- **Note icon** — the 📝 emoji is replaced by a small lined-page button in the node's
  colour. Hovering it shows the note in a small tooltip underneath; clicking opens it.
- **The + beside a node** is now a white rounded square set a little way off the node,
  joined to it by a short stub in the branch colour. The handles no longer flicker away
  while the pointer crosses the gap to reach them.
- **The connection dot** on the node's corner takes the node's colour.

Asset version bumped to v25.

# v24 (8 October 2026)

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
