# MindNote

A mind map and outline workspace that runs in the browser, with your documents kept in
step across every device you use. No sign-in and no build step: you type one workspace
code on each device and they share the same maps.

Edits are saved on the device first and sent up a couple of seconds later, so the app
keeps working on a train with no signal and catches up when the connection returns.

## Files in this folder

| File | What it is |
| --- | --- |
| `index.html` | The page |
| `styles.css` | All styling, including the screen sizes below |
| `app.js` | All behaviour |
| `sync.js` | Keeps this device in step with the others |
| `sw.js` | Lets the app start with no connection |
| `manifest.json` | Lets phones and tablets install it as an app |
| `api/sync.js` | The small service on Vercel that holds the shared copy |

Keep `api/sync.js` inside a folder called `api`. Vercel turns anything in that folder
into a working web service on its own.

## Put it on GitHub and Vercel

1. Go to github.com and choose **New repository**. Name it `mindnote`, keep it public
   or private, and create it.
2. On the new repository page choose **uploading an existing file**. Drag in the five
   loose files *and* the `api` folder. Do not drag the outer `mindnote` folder itself —
   drag what is inside it. Press **Commit changes**.
3. Go to vercel.com, sign in with GitHub, choose **Add New → Project**, and pick the
   `mindnote` repository.
4. Leave every setting alone. Framework Preset will say **Other**, which is correct
   here. Press **Deploy**.
5. After about half a minute Vercel gives you an address such as
   `mindnote-yourname.vercel.app`. Open it on any device.

At this point the app works, but only on the device in front of you. The next section
switches sync on.

To change something later, edit the file on GitHub (or upload a new copy of it) and
Vercel redeploys within a minute.

## Turn on sync

The shared copy lives in a Redis database. Vercel provisions one for you and hands the
password to your project automatically, so there is nothing to copy or paste.

1. Open your project on vercel.com and go to the **Storage** tab.
2. Choose **Create Database**, pick a **Redis** provider from the Marketplace —
   **Upstash** is the usual one — and accept the free plan. Give it any name.
3. When it asks which project to connect it to, choose `mindnote` and connect it. Vercel
   adds the connection details to your project as environment variables.
4. Go to the **Deployments** tab, open the most recent deployment's menu and choose
   **Redeploy**. A deployment only picks up new environment variables when it is rebuilt.
5. Open your app, press the **Sync is off** strip at the bottom of the documents panel,
   press **New code**, then **Turn on sync**. Write the code down.
6. On your next device, open the same address, press the same strip, type the same code
   and press **Turn on sync**. Both devices now share the same documents.

The strip shows a green dot and "Synced just now" when everything is up to date, amber
while sending, and orange when there is no connection.

### Things worth knowing about sync

- **The code is the password.** Anyone who types it sees these documents. Pick the
  generated one rather than something guessable, and do not put it in a shared note.
- **Joining replaces the starter maps.** When a device with only the two sample maps
  joins a workspace that already has real documents, the samples are dropped rather than
  added. Anything you have actually edited is always kept and merged in.
- **If the same document is edited on two devices at once**, the version saved most
  recently wins for that whole document. Editing different documents at the same time is
  always safe.
- **Deleting is deliberate.** A document deleted on one device disappears from the
  others and does not come back.
- **The view is per device.** Where you have panned and zoomed stays local, so the phone
  does not drag the desktop around.
- **Before step 3 is done**, the sync panel says storage is not connected yet, and the
  app carries on working on that device alone.

## Screen sizes it is built for

| Device | Behaviour |
| --- | --- |
| Windows PC and laptops | Documents on the left, map in the middle, inspector on the right |
| Fold 8 inner display, 7.6 in | Three panes until the window narrows, then the side panes float over the map |
| Fold 8 cover display, 5.5 in | Compact toolbar, panes become full-height drawers, an action bar appears under the map when a node is selected |
| iPhone 17 Pro Max, 6.9 in | Same as the cover display, with the notch and home indicator kept clear |

The map itself is pinch-zoomable and drag-pannable on touch screens, and the layout
recalculates whenever the foldable is opened or closed.

## What it does

**Mind maps** — an infinite canvas. Drag the background to pan, pinch or `Ctrl` and
scroll to zoom, **Fit** to frame everything.

**The node sheet (phones and folded screens)** — select a node and a sheet rises from
the bottom showing a row of tabs: add child, actions, style, note, media, tags and
connect. Tap a tab and it expands; tap it again and it folds back to the row. Along the
bottom sit undo, cut, copy, duplicate, delete and redo. Everything you can do to a node
is reachable without leaving the map. On a wide screen the same panels appear as tabs in
the right-hand inspector instead.

**Main nodes and detaching** — a document can hold more than one tree. "New main node"
in the canvas menu drops a free-standing node where you clicked, drawn with a dashed
border to show it stands on its own. Any branch can be pulled out of the tree: drag it
onto empty canvas, or choose Detach. To put a branch somewhere else, drag it onto the
node you want it under — with a mouse, or by dragging with your finger — and the target
lights up before you let go. Detached branches also appear in the outline, under their
own heading.

**Context menu** — right click anywhere on a PC, or press and hold on a phone or the
Fold. On empty canvas you get: new main node, paste, paste and keep style, zoom in, zoom
out, zoom to fit, unfold everything. On a node you get the full list of node actions.
Holding still is what opens it; if your finger moves, it stays a pan.

**Node actions** — edit title, add child, add sibling, wrap a node in a new parent, mark
as a task, fold, create a connection, sort children A to Z, cut, copy, paste into,
duplicate, delete, link to another document, and link to a web address.

**Branch shape** — curved, straight or elbow, per document, under Style.

**Adding nodes** — point at any node, or tap it on a touch screen, and two round **+**
buttons appear. The filled one on the outer edge, continuing the branch away from the
centre, adds a **child**. The outlined one underneath the node adds a **sibling** beside
it. Hover either one and it tells you which is which. The new node opens for typing straight away, and if you leave it empty
it removes itself. The same five actions — add child, add sibling, fold, connect, delete —
sit next to the Map and Outline switch at the top, and along the bottom of the screen on
a phone. They wake up as soon as a node is selected.

**Outlines** — the same document as a structured list. Switch with **Map / Outline** in
the toolbar. Edits in one view show up in the other.

**Layout options** — horizontal, vertical, compact and radial, from the dropdown in the
toolbar. Drag any node to empty space and the map switches to manual, keeping every
node exactly where you put it. Drop a node on top of another to move that whole branch
under it.

**Node shapes** — rounded, rectangle, pill, circle, square, hexagon, octagon, cloud,
line and embedded, in the inspector.

**Style inspector** — shape, border thickness, branch line style and colour. Colour
flows down a branch until a child sets its own.

**Tasks** — the checkmark button in the toolbar puts a circle on every node. Tick a
node and its children tick with it; a parent shows a half-filled circle while its
children are partly done.

**Notes** — every node can carry a note that stays hidden behind a small 📝 until you
open it.

**Visual tags** — create tags in the inspector, then use the sun icon beside a tag to
spotlight everything carrying it and fade the rest.

**Connections** — select a node, press the link tool, then tap a second node to draw a
relationship that ignores the hierarchy. Click a connection line to remove it.

**Link documents** — point a node at another document. It gets a 🔗 you can tap to jump
straight there.

**Focus mode** — dims everything except the selected node, its branch and its path back
to the centre. Useful when presenting.

**Folding** — the − circle on a node collapses its branch and shows how many nodes are
hidden. The toolbar's fold button collapses or expands everything at once.

**Images, stickers and emoji** — pick an emoji or add a picture from the device. Images
are shrunk before they are stored.

**Search** — the box in the sidebar searches node text and notes across every document,
opens the right one, unfolds the path and centres on the match.

**Dark mode** — the button at the bottom of the sidebar cycles Light, Dark and System.
System follows whatever your phone or PC is set to, including its night schedule.

**Undo and redo** — the two arrows at the left of the toolbar, or the usual keys. Sixty
steps are kept per document.

**Collapsed sidebar** — hide the documents panel on a wide screen and a slim icon rail
takes its place, so search, a new document, the theme and the sync light stay one click
away.

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` | New child |
| `Enter` | New sibling |
| `Space` | Fold a branch, or edit a node with no children |
| `F2` | Rename the selected node |
| `Ctrl` / `Cmd` + `C`, `V` | Copy and paste a whole branch |
| `Ctrl` / `Cmd` + `D` | Duplicate a branch |
| `Ctrl` / `Cmd` + `Shift` + `Z` | Redo |
| `Esc` while typing | Discard what you just typed |
| Arrow keys | Move between nodes |
| `Delete` | Delete the node and its branch |
| `Ctrl` / `Cmd` + `Z` | Undo |
| `Ctrl` / `Cmd` + `F` or `/` | Search |
| `Esc` | Deselect, or leave focus mode |

On touch screens: tap to select, tap twice to edit, drag to move, and use the action bar
at the bottom.

## Where your work lives

Every device keeps a full copy of your documents in its own browser storage, which is
what makes the app usable offline. With sync on, that copy is reconciled with the shared
one on Vercel every few seconds and whenever you return to the tab.

**Export** in the sidebar still saves a `.json` backup of everything, and **Import**
brings it back. Worth doing occasionally: browser storage can be cleared by the browser
itself, and the free Redis plan is not a backup service.
