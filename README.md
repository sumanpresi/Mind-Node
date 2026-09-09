# MindNote

A mind map and outline workspace that runs entirely in the browser. No server, no
sign-in, no build step. Your documents are stored on the device you are using, and you
can export them to a file at any time.

## Files in this folder

| File | What it is |
| --- | --- |
| `index.html` | The page |
| `styles.css` | All styling, including the screen sizes below |
| `app.js` | All behaviour |
| `manifest.json` | Lets phones and tablets install it as an app |

Four files, nothing else needed.

## Put it on GitHub and Vercel

1. Go to github.com and choose **New repository**. Name it `mindnote`, keep it public
   or private, and create it.
2. On the new repository page choose **uploading an existing file**, then drag the four
   files above into the browser window. Do not drag the folder itself — drag the files
   that are inside it. Press **Commit changes**.
3. Go to vercel.com, sign in with GitHub, choose **Add New → Project**, and pick the
   `mindnote` repository.
4. Leave every setting alone. Framework Preset will say **Other**, which is correct for
   a plain HTML page. Press **Deploy**.
5. After about half a minute Vercel gives you an address such as
   `mindnote-yourname.vercel.app`. Open it on any device.

To change something later, edit the file on GitHub (or upload a new copy of it) and
Vercel redeploys within a minute.

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

**Dark mode** — the button at the bottom of the sidebar.

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` | New child |
| `Enter` | New sibling |
| `Space` | Edit the selected node |
| Arrow keys | Move between nodes |
| `Delete` | Delete the node and its branch |
| `Ctrl` / `Cmd` + `Z` | Undo |
| `Ctrl` / `Cmd` + `F` or `/` | Search |
| `Esc` | Deselect, or leave focus mode |

On touch screens: tap to select, tap twice to edit, drag to move, and use the action bar
at the bottom.

## Where your work lives

Documents are saved in the browser's local storage on the device you used, so a map made
on the phone will not appear on the PC. Use **Export** in the sidebar to save a `.json`
backup and **Import** to bring it into another device or browser.
