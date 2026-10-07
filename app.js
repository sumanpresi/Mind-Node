/* =====================================================================
   MindNote — a mind map + outline workspace.
   Plain JavaScript, no build step, no server. Data lives in the browser.
   ===================================================================== */

/* ------------------------------ helpers ---------------------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const PALETTE = ['#2fb6b0', '#f2842a', '#3a9bea', '#e9576b', '#f0b429', '#8b5cf6', '#3dbe73', '#ec6fb4'];
const ROOT_COLOR = '#5b4ce0';
const TAG_COLORS = ['#f0b429', '#f2842a', '#ec6fb4', '#8b5cf6', '#2fb6b0', '#3dbe73', '#3a9bea', '#e9576b'];
const SHAPES = [
  ['rounded', 'Rounded'], ['rect', 'Rectangle'], ['pill', 'Pill'], ['circle', 'Circle'],
  ['square', 'Square'], ['hexagon', 'Hexagon'], ['octagon', 'Octagon'], ['cloud', 'Cloud'],
  ['line', 'Line'], ['embedded', 'Embedded']
];
const EMOJI = ('💡 🎯 ✅ ⭐️ 🔥 📌 📝 📊 📈 🗺 🧭 🔍 🧠 ⚙️ 🛠 🚀 ⏰ 📅 📎 🔗 💬 ❓ ❗️ ⚠️ ' +
  '🪨 ⛏ 🌋 🏔 🧪 🔬 🌍 💧 🧲 ⚡️ 🛰 📡 🏗 🚧 🗂 📁 💾 🖥 📱 ✏️ 📐 🧮 ' +
  '🙂 😀 🤔 🎉 ❤️ 👍 👀 🌱 🌟 🏁 🥇 🧩 🎨 🎵 ☕️ 🍀').split(' ').filter(Boolean);

/* --------------------------- safe storage -------------------------- */
const store = (() => {
  try {
    localStorage.setItem('__mn', '1');
    localStorage.removeItem('__mn');
    return localStorage;
  } catch (e) {
    const mem = {};
    return {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: k => { delete mem[k]; }
    };
  }
})();
const KEY = 'mindnote.v1';

/* IndexedDB holds the working copy. It has a far larger quota than
   localStorage and survives better, and a browser that cannot open it
   simply falls back to the older store. localStorage is kept as a mirror
   while it fits, so an older build of the app still finds the data. */
const DB_NAME = 'mindnote', DB_STORE = 'state', DB_KEY = 'workspace';
const BACKUP_PREFIX = 'backup:';
const BACKUP_KEEP = 10;                 // rolling local backups
const BACKUP_EVERY = 20 * 60 * 60 * 1000;   // at most one a day, near enough
const SCHEMA = 1;                       // bump when the saved shape changes
let idbHandle = null, idbBroken = false;
let schemaBlocked = false;

function idbOpen() {
  if (idbBroken || typeof indexedDB === 'undefined') return Promise.reject(new Error('no indexeddb'));
  if (idbHandle) return Promise.resolve(idbHandle);
  return new Promise((res, rej) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { idbBroken = true; return rej(e); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => { idbHandle = req.result; res(idbHandle); };
    req.onerror = () => { idbBroken = true; rej(req.error); };
    req.onblocked = () => { idbBroken = true; rej(new Error('blocked')); };
  });
}
function idbGet(key) {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const r = tx.objectStore(DB_STORE).get(key || DB_KEY);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  }));
}
function idbSet(value, key) {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key || DB_KEY);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('aborted'));
  }));
}
function idbDel(key) {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  }));
}
function idbKeys() {
  return idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const r = tx.objectStore(DB_STORE).getAllKeys();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  }));
}

/* ---------------------------- image store --------------------------
   Images used to live inline as base64 inside each node (n.image), so
   every edit re-serialised and re-synced every photo the workspace had,
   and the 30 MB cloud budget filled up almost entirely with pictures
   instead of the text and structure that actually matter. Now a node
   just holds n.imageId; the bytes live in their own IndexedDB key,
   never touch JSON.stringify for change-detection or sync, and so never
   leave this device. Legacy n.image (from before this change, or from
   an older client still writing that way) is migrated the moment it is
   seen, so nothing already saved is ever lost or shown broken. */
const IMAGE_PREFIX = 'image:';
let imageCache = {};   // imageId -> data URL, populated for whatever is on screen

function migrateLegacyImages() {
  let changed = false;
  Object.values(S.docs).forEach(d => {
    Object.values(d.nodes).forEach(n => {
      if (!n.imageId && n.image) {
        const id = uid();
        imageCache[id] = n.image;
        idbSet(n.image, IMAGE_PREFIX + id).catch(() => { });
        n.imageId = id;
        n.image = '';
        changed = true;
      }
    });
  });
  return changed;
}
async function preloadImageCache() {
  const wanted = new Set();
  Object.values(S.docs).forEach(d => Object.values(d.nodes).forEach(n => {
    if (n.imageId && imageCache[n.imageId] === undefined) wanted.add(n.imageId);
  }));
  if (!wanted.size) return;
  let any = false;
  for (const id of wanted) {
    try {
      const val = await idbGet(IMAGE_PREFIX + id);
      if (val) { imageCache[id] = val; any = true; }
    } catch (e) { /* this device never had this image — render() shows nothing for it */ }
  }
  if (any) render();
}
function imageSrcFor(n) {
  if (n.imageId) return imageCache[n.imageId] || '';
  return n.image || '';           // not yet migrated, or arrived mid-session
}
function setNodeImage(n, dataUrl) {
  const id = uid();
  imageCache[id] = dataUrl;
  idbSet(dataUrl, IMAGE_PREFIX + id).catch(() => {
    toast('This device could not store that image.');
  });
  n.imageId = id;
  n.image = '';
}
function clearNodeImage(n) {
  const id = n.imageId;
  n.imageId = ''; n.image = '';
  if (!id) return;
  const stillUsed = Object.values(S.docs).some(d =>
    Object.values(d.nodes).some(x => x.imageId === id));
  if (!stillUsed) { delete imageCache[id]; idbDel(IMAGE_PREFIX + id).catch(() => { }); }
}
/* Exported files must stay self-contained — a .json backup opened five
   years from now, on a device that never held these images, still needs
   to show them. So export rehydrates imageId back into inline data. */
function embedImagesForExport(docsObj) {
  const copy = JSON.parse(JSON.stringify(docsObj));
  Object.values(copy).forEach(d => {
    Object.values(d.nodes || {}).forEach(n => {
      if (n.imageId) n.image = imageCache[n.imageId] || n.image || '';
      delete n.imageId;
    });
  });
  return copy;
}

function localRaw() {
  try { return store.getItem(KEY); } catch (e) { return null; }
}
function savedAtOf(raw) {
  try { return JSON.parse(raw).savedAt || 0; } catch (e) { return 0; }
}

let storageWarned = false;
function storeSave(json) {
  let mirrored = false;
  try { store.setItem(KEY, json); mirrored = true; } catch (e) { /* too big for the old store */ }
  idbSet(json).catch(() => {
    if (!mirrored && !storageWarned) {
      storageWarned = true;
      toast('This device will not save any more — export your work to a file.');
    }
  });
}

/* ------------------------------- state ----------------------------- */
let S = { docs: {}, order: [], active: null };
let UI = {
  view: 'map', theme: 'light', inspector: false,
  showTasks: false, showNotes: true, showImages: true, showTags: true,
  focusMode: false, highlightTag: null, selected: null,
  inspTab: 'style', sheetTab: null
};
let pendingFit = false;
let P = {};                 // id -> {x,y,w,h}
let editing = null;         // node id being text-edited
let connectFrom = null;     // pending connection source
let dragOffset = null;      // {ids:Set, dx, dy}
let undoStack = [];
let redoStack = [];
let clipboard = null;
let lastTap = { id: null, t: 0 };
let deletedDocs = {};       // id -> time it was deleted, so sync does not resurrect it
let contentSigs = {};       // id -> fingerprint, so panning does not count as an edit
let workspaceSig = '';      // which documents exist, so deletes and imports are noticed too
let hoverId = null;         // node the pointer is over, for the + handles

/* ------------------------- model constructors ---------------------- */
function mkNode(parent, text) {
  return {
    id: uid(), parent, text: text || '', children: [], collapsed: false,
    shape: 'rounded', color: null, border: 2, lineStyle: 'solid',
    note: '', tags: [], done: false, emoji: '', image: '', imageId: '', link: null,
    checklist: false,
    x: null, y: null
  };
}
function mkDoc(name) {
  const root = mkNode(null, name || 'New document');
  return {
    id: uid(), name: name || 'New document', root: root.id,
    nodes: { [root.id]: root }, connections: [], tags: [],
    layout: 'horizontal', cam: null, updated: Date.now()
  };
}
const doc = () => S.docs[S.active];
/* nodes with no parent that are not the central idea: free-standing branches */
const floatsOf = () => Object.values(doc().nodes).filter(n => !n.parent && n.id !== doc().root);
const rootsOf = () => [doc().root, ...floatsOf().map(n => n.id)];
const N = id => doc().nodes[id];
const kidsOf = n => n.children.filter(id => doc().nodes[id]);
const visKids = n => (n.collapsed ? [] : kidsOf(n));
/* Checklist children are drawn inside their parent's own node box (see
   buildChecklistBody), not as separate positioned map nodes. Every layout
   routine and edge-drawing routine must stop at a checklist parent — using
   visKids() there instead would try to size/position nodes that never get
   measured, since buildNodeEl() never creates a .node element for them. */
const layoutKids = n => (n.checklist ? [] : visKids(n));

function addChild(parentId, text) {
  const d = doc(), p = d.nodes[parentId];
  const n = mkNode(parentId, text || '');
  d.nodes[n.id] = n;
  p.children.push(n.id);
  p.collapsed = false;
  return n;
}
function addSibling(id, text) {
  const d = doc(), n = d.nodes[id];
  if (!n.parent) {                       // main nodes sit beside each other
    const s2 = mkNode(null, text || '');
    s2.x = (n.x == null ? 0 : n.x); s2.y = (n.y == null ? 0 : n.y) + 90;
    d.nodes[s2.id] = s2;
    return s2;
  }
  const p = d.nodes[n.parent];
  const kid = mkNode(n.parent, text || '');
  d.nodes[kid.id] = kid;
  p.children.splice(p.children.indexOf(id) + 1, 0, kid.id);
  return kid;
}
function descendants(id, out = []) {
  for (const c of kidsOf(N(id))) { out.push(c); descendants(c, out); }
  return out;
}
function ancestors(id) {
  const out = []; let n = N(id);
  while (n && n.parent) { out.push(n.parent); n = N(n.parent); }
  return out;
}
function removeNode(id) {
  const d = doc();
  if (id === d.root) return;
  const all = [id, ...descendants(id)];
  const p = d.nodes[N(id).parent];
  if (p) p.children = p.children.filter(c => c !== id);
  all.forEach(x => delete d.nodes[x]);
  d.connections = d.connections.filter(c => !all.includes(c.a) && !all.includes(c.b));
}
function colorOf(id) {
  const d = doc(); const path = []; let cur = d.nodes[id];
  while (cur) { path.push(cur); if (!cur.parent) break; cur = d.nodes[cur.parent]; }
  for (const n of path) if (n.color) return n.color;
  const top = path.find(n => n.parent === d.root);
  if (top) {
    const i = d.nodes[d.root].children.indexOf(top.id);
    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
  }
  const head = path[path.length - 1];
  if (head && head.id !== d.root) {
    const i = floatsOf().findIndex(f => f.id === head.id);
    return PALETTE[((i < 0 ? 0 : i) + 3) % PALETTE.length];
  }
  return ROOT_COLOR;
}
/* task state: 'done' | 'part' | 'open' — memoised per redraw */
let taskMemo = {};
function taskState(id) {
  if (taskMemo[id]) return taskMemo[id];
  return (taskMemo[id] = computeTaskState(id));
}
function computeTaskState(id) {
  const kids = kidsOf(N(id));
  if (!kids.length) return N(id).done ? 'done' : 'open';
  const states = kids.map(taskState);
  if (states.every(s => s === 'done')) return 'done';
  if (states.some(s => s !== 'open')) return 'part';
  return N(id).done ? 'done' : 'open';
}
function setDone(id, val) {
  taskMemo = {};
  N(id).done = val;
  descendants(id).forEach(c => { N(c).done = val; });
}
/* A checklist row is a single item, not a branch: toggling "Helmet" must
   never cascade to Helmet's own descendants the way setDone() does for the
   general fold-a-branch-into-one-task case. computeTaskState() already
   walks kidsOf() bottom-up, so the parent's ✓/part/○ state updates for
   free once this flips. */
function toggleChecklistItem(id) {
  taskMemo = {};
  N(id).done = !N(id).done;
}

/* =====================================================================
   Rolling local backups. One a day at most, ten kept, held in the same
   database as the working copy. This is the net for "I deleted something
   three weeks ago and only noticed now".
   ===================================================================== */
async function listBackups() {
  try {
    const keys = await idbKeys();
    return keys.filter(k => typeof k === 'string' && k.startsWith(BACKUP_PREFIX))
      .sort().reverse();
  } catch (e) { return []; }
}
async function maybeBackup() {
  if (schemaBlocked) return;
  try {
    const keys = await listBackups();
    const newest = keys.length ? Number(keys[0].slice(BACKUP_PREFIX.length)) : 0;
    if (Date.now() - newest < BACKUP_EVERY) return;
    const body = JSON.stringify({
      app: 'MindNote', schemaVersion: SCHEMA,
      docs: S.docs, order: S.order, deleted: deletedDocs, savedAt: Date.now()
    });
    await idbSet(body, BACKUP_PREFIX + Date.now());
    const after = await listBackups();
    for (const old of after.slice(BACKUP_KEEP)) await idbDel(old);
  } catch (e) { /* backups are best effort */ }
}
function describeBackup(key, raw) {
  const when = Number(key.slice(BACKUP_PREFIX.length));
  let documents = 0, nodes = 0, names = [];
  try {
    const st = JSON.parse(raw);
    const list = Object.values(st.docs || {});
    documents = list.length;
    nodes = list.reduce((a, d) => a + Object.keys(d.nodes || {}).length, 0);
    names = list.map(d => d.name).slice(0, 4);
  } catch (e) { }
  return { key, when, documents, nodes, names, bytes: raw ? raw.length : 0 };
}
async function restoreBackup(key) {
  const raw = await idbGet(key);
  if (!raw) return toast('That backup is no longer stored');
  pushUndo();
  if (!hydrate(raw)) return toast('That backup could not be read');
  UI.selected = null;
  primeSigs();
  persistNow();
  render();
  if (window.MNSync && window.MNSync.isOn()) window.MNSync.now();
  toast('Backup restored');
}

/* =====================================================================
   SIDEBAR CONTROLLER

   One panel, three modes, one animated property (width). The old build
   animated margin-left on the panel while a separate 52px rail appeared
   underneath it with `display`, which cannot animate — so the canvas was
   shoved one way and dragged the other in the same frame, and every
   intermediate frame showed document names cut in half.

   Here the mode decides the presentation and the width follows. Crossing
   a mode boundary swaps names for chips instantly, so there is no width
   at which the panel is unreadable.

   Width lives on the device, not in the synced workspace: a phone and a
   27-inch monitor do not want the same number.
   ===================================================================== */
const SIDE_KEY   = 'mindnote.sidebar';
const RAIL_W     = 64;    // icon + chip rail
const MIN_WIDE   = 240;   // narrowest width a document name is still readable at
const MAX_WIDE   = 420;
const RAIL_SNAP  = 150;   // release left of this and the panel becomes a rail

let side = { mode: 'wide', width: 260 };

function sideLoad() {
  try {
    const raw = localStorage.getItem(SIDE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object') {
        if (['wide', 'rail', 'hidden'].includes(v.mode)) side.mode = v.mode;
        if (Number.isFinite(v.width)) side.width = clamp(v.width, MIN_WIDE, MAX_WIDE);
      }
    }
  } catch (e) { /* first run, or storage unavailable */ }
}
function sideSave() {
  try { localStorage.setItem(SIDE_KEY, JSON.stringify(side)); } catch (e) { }
}

/* A 64px rail is a poor trade on a phone, so narrow screens only ever
   show the panel or hide it.

   side.mode is what the person chose; sideMode() is what fits on the
   screen in front of them. Keeping the two apart means folding the phone
   shut does not quietly throw away a rail preference — unfolding brings
   it straight back. */
const railAllowed = () => window.innerWidth > 900;
function sideMode() {
  if (side.mode === 'rail' && !railAllowed()) return 'hidden';
  return side.mode;
}

function applySidebar() {
  const app = document.getElementById('app');
  if (!app) return;
  const m = sideMode();
  app.dataset.side = m;
  const w = m === 'rail' ? RAIL_W : m === 'hidden' ? 0 : side.width;
  app.style.setProperty('--side-w', w + 'px');
  const res = document.getElementById('sideResizer');
  if (res) {
    res.setAttribute('aria-valuenow', String(w));
    res.setAttribute('aria-valuemin', String(RAIL_W));
    res.setAttribute('aria-valuemax', String(MAX_WIDE));
  }
}

/* The dimmer behind a floating panel is not part of the map, so changing
   modes must not cost a full map redraw to keep it in step. */
function syncScrim() {
  const sc = document.getElementById('scrim');
  if (sc) sc.hidden = !(window.innerWidth <= 900 && (sideMode() === 'wide' || UI.inspector));
}

function setSide(mode, opts) {
  side.mode = mode;
  applySidebar();
  sideSave();
  if (!opts || !opts.quiet) renderDocList();
  syncScrim();
  hideSideTip();
}
function toggleSide() {
  if (sideMode() === 'wide') setSide(railAllowed() ? 'rail' : 'hidden');
  else setSide('wide');
}

/* ---------------------------- tooltips ----------------------------- */
/* A rail is only usable if you can still tell what each chip is. */
let sideTipEl = null, sideTipTimer = null;
function sideTip(target, title, sub) {
  if (sideMode() !== 'rail') return;
  if (!sideTipEl) {
    sideTipEl = document.createElement('div');
    sideTipEl.className = 'side-tip';
    sideTipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(sideTipEl);
  }
  sideTipEl.innerHTML = '';
  sideTipEl.appendChild(document.createTextNode(title));
  if (sub) {
    const s2 = document.createElement('span');
    s2.className = 'tip-sub';
    s2.textContent = sub;
    sideTipEl.appendChild(s2);
  }
  const r = target.getBoundingClientRect();
  sideTipEl.style.left = (r.right + 10) + 'px';
  sideTipEl.style.top = Math.max(6, r.top + r.height / 2 - 18) + 'px';
  sideTipEl.classList.add('show');
}
function hideSideTip() {
  clearTimeout(sideTipTimer);
  if (sideTipEl) sideTipEl.classList.remove('show');
}

/* ------------------------- resize interaction ---------------------- */
function wireResizer() {
  const res = document.getElementById('sideResizer');
  const app = document.getElementById('app');
  if (!res || !app) return;
  let dragging = false, moved = false;

  const widthFor = x => {
    const max = Math.min(MAX_WIDE, Math.round(window.innerWidth * 0.5));
    /* Two detents. Left of RAIL_SNAP the panel locks to the rail, between
       RAIL_SNAP and MIN_WIDE it resists at MIN_WIDE. The panel is therefore
       never rendered at a width its own content cannot be read at. */
    if (x < RAIL_SNAP && railAllowed()) return { mode: 'rail', width: side.width };
    return { mode: 'wide', width: clamp(x, MIN_WIDE, max) };
  };

  res.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true; moved = false;
    res.setPointerCapture(e.pointerId);
    app.classList.add('side-dragging');
    hideSideTip();
    e.preventDefault();
  });

  res.addEventListener('pointermove', e => {
    if (!dragging) return;
    moved = true;
    const next = widthFor(e.clientX);
    const changedMode = next.mode !== sideMode();
    side.mode = next.mode;
    side.width = next.width;
    applySidebar();
    if (changedMode) renderDocList();   // swap names for chips at the boundary
  });

  const end = e => {
    if (!dragging) return;
    dragging = false;
    app.classList.remove('side-dragging');
    try { res.releasePointerCapture(e.pointerId); } catch (err) { }
    if (moved) { sideSave(); renderDocList(); fitAfterResize(); }
  };
  res.addEventListener('pointerup', end);
  res.addEventListener('pointercancel', end);

  res.addEventListener('dblclick', () => { toggleSide(); fitAfterResize(); });

  res.addEventListener('keydown', e => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (sideMode() === 'rail') return;
      const w = side.width - step;
      if (w < RAIL_SNAP && railAllowed()) setSide('rail');
      else { side.width = clamp(w, MIN_WIDE, MAX_WIDE); applySidebar(); sideSave(); }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (sideMode() !== 'wide') { setSide('wide'); return; }
      side.width = clamp(side.width + step, MIN_WIDE, MAX_WIDE);
      applySidebar(); sideSave();
    } else if (e.key === 'Home') { e.preventDefault(); setSide(railAllowed() ? 'rail' : 'hidden'); }
    else if (e.key === 'End') { e.preventDefault(); side.width = MAX_WIDE; setSide('wide'); }
    else return;
    fitAfterResize();
  });

  /* the canvas is a different size now, so edges and handles must be redrawn */
  const sb = document.getElementById('sidebar');
  if (sb) sb.addEventListener('transitionend', e => {
    if (e.propertyName === 'width') fitAfterResize();
  });
}
function fitAfterResize() {
  if (typeof editing !== 'undefined' && editing) return;
  if (UI.view === 'map') { renderMap(); } 
}

/* ------------------------- swipe gestures -------------------------- */
/* Swipe in from the left edge to open, swipe the panel away to close. */
function wireSwipe() {
  let track = null;
  const EDGE = 26, THRESH = 55;

  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    if (e.target.closest('#ctx, .side-resizer, input, textarea, [contenteditable="true"]')) return;
    const onPanel = !!e.target.closest('#sidebar');
    const fromEdge = e.clientX <= EDGE;
    if (fromEdge && sideMode() !== 'wide') track = { x: e.clientX, y: e.clientY, kind: 'open' };
    else if (onPanel && sideMode() === 'wide') track = { x: e.clientX, y: e.clientY, kind: 'close' };
    else track = null;
  }, true);

  document.addEventListener('pointermove', e => {
    if (!track) return;
    const dx = e.clientX - track.x, dy = e.clientY - track.y;
    if (Math.abs(dy) > Math.abs(dx)) { track = null; return; }   // a vertical scroll
    if (track.kind === 'open' && dx > THRESH) {
      setSide('wide'); fitAfterResize(); track = null;
    } else if (track.kind === 'close' && dx < -THRESH) {
      setSide(railAllowed() ? 'rail' : 'hidden'); fitAfterResize(); track = null;
    }
  }, true);

  const drop = () => { track = null; };
  document.addEventListener('pointerup', drop, true);
  document.addEventListener('pointercancel', drop, true);
}

/* ------------------------------ persistence ------------------------ */
let saveTimer = null;
function contentSig(d) {
  return JSON.stringify({ n: d.nodes, m: d.name, c: d.connections, t: d.tags, l: d.layout, r: d.root });
}
function wsSig() {
  return S.order.join(',') + '|' + Object.keys(S.docs).sort().join(',') + '|' + Object.keys(deletedDocs).sort().join(',');
}
function primeSigs() {
  contentSigs = {};
  Object.values(S.docs).forEach(d => { contentSigs[d.id] = contentSig(d); });
  workspaceSig = wsSig();
}
function save() {
  const d = doc();
  let changed = false;
  const ws = wsSig();
  if (ws !== workspaceSig) { workspaceSig = ws; changed = true; }
  if (d) {
    const sig = contentSig(d);
    if (contentSigs[d.id] !== sig) {
      contentSigs[d.id] = sig; d.updated = Date.now(); changed = true;
      delete d.demo;
    }
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 250);
  if (changed && window.MNSync) window.MNSync.touch();
}
function persistNow() {
  clearTimeout(saveTimer);
  if (schemaBlocked) return;            // never write over data we do not understand
  storeSave(JSON.stringify({
    app: 'MindNote', schemaVersion: SCHEMA,
    docs: S.docs, order: S.order, active: S.active, ui: UI, deleted: deletedDocs,
    savedAt: Date.now()
  }));
}
/* Older saves carry no version and are read as version 1. A save from a
   newer version of MindNote than this one is left strictly alone: better a
   clear message than a silent, lossy read. */
function hydrate(raw) {
  try {
    if (!raw) return false;
    const data = JSON.parse(raw);
    const found = data.schemaVersion || 1;
    if (found > SCHEMA) {
      schemaBlocked = true;
      return false;
    }
    if (!data.docs || !data.order || !data.order.length) return false;
    S = { docs: data.docs, order: data.order, active: data.active || data.order[0] };
    if (!S.docs[S.active]) S.active = S.order[0];
    UI = Object.assign(UI, data.ui || {});
    deletedDocs = data.deleted || {};
    Object.values(S.docs).forEach(d => {
      d.connections = d.connections || []; d.tags = d.tags || [];
      Object.values(d.nodes).forEach(n => { n.tags = n.tags || []; });
      contentSigs[d.id] = contentSig(d);
    });
    migrateLegacyImages();
    workspaceSig = wsSig();
    return true;
  } catch (e) { return false; }
}
function snapDoc() { return JSON.stringify({ id: S.active, doc: doc() }); }
function pushUndo() {
  undoStack.push(snapDoc());
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];                       // a fresh edit ends the redo trail
}
function applySnap(snap) {
  const { id, doc: d } = JSON.parse(snap);
  S.docs[id] = d; S.active = id;
  if (UI.selected && !d.nodes[UI.selected]) UI.selected = null;
  save(); render();
}
function undo() {
  if (!undoStack.length) return toast('Nothing to undo');
  redoStack.push(snapDoc());
  applySnap(undoStack.pop());
}
function redo() {
  if (!redoStack.length) return toast('Nothing to redo');
  undoStack.push(snapDoc());
  applySnap(redoStack.pop());
}

/* ---------------------- copy, paste, duplicate --------------------- */
function copyBranch(id, quiet) {
  const d = doc(), ids = [id, ...descendants(id)];
  const nodes = {};
  ids.forEach(x => { nodes[x] = JSON.parse(JSON.stringify(d.nodes[x])); });
  clipboard = { root: id, roots: [id], nodes };
  if (!quiet) toast(ids.length > 1 ? `Copied ${ids.length} nodes` : 'Copied');
}
/* One branch out of the clipboard and into intoId. Shared by paste and by
   duplicate, and called once per branch when several were copied. */
function pasteOne(oldId, intoId, plain) {
  const d = doc();
  const clone = (srcId, parent) => {
    const src = clipboard.nodes[srcId];
    if (!src) return null;
    const n = JSON.parse(JSON.stringify(src));
    n.id = uid(); n.parent = parent; n.children = []; n.x = null; n.y = null;
    if (plain) {                       // arrive with the branch's own look
      n.shape = 'rounded'; n.color = null; n.border = 2; n.lineStyle = 'solid';
      n.emoji = ''; n.image = ''; n.imageId = '';
    }
    d.nodes[n.id] = n;
    (src.children || []).forEach(c => { const k = clone(c, n.id); if (k) n.children.push(k.id); });
    return n;
  };
  const top = clone(oldId, intoId);
  if (!top) return null;
  N(intoId).children.push(top.id);
  N(intoId).collapsed = false;
  return top;
}

function pasteBranch(intoId, plain) {
  if (!clipboard) return toast('Nothing copied yet');
  if (!N(intoId)) return;
  pushUndo();
  const roots = clipboard.roots && clipboard.roots.length ? clipboard.roots : [clipboard.root];
  const made = [];
  roots.forEach(r => { const t = pasteOne(r, intoId, plain); if (t) made.push(t.id); });
  if (!made.length) return;
  if (made.length > 1) setMarked(made); else { clearMarked(); UI.selected = made[0]; }
  save(); render();
}
/* A main node stands on its own, beside the central idea rather than under
   it. Drag it onto any node later to attach it. */
function newMainNode(worldX, worldY) {
  const d = doc();
  pushUndo();
  const n = mkNode(null, '');
  const at = (worldX == null) ? viewCentre() : { x: worldX, y: worldY };
  n.x = at.x; n.y = at.y;
  d.nodes[n.id] = n;
  UI.selected = n.id;
  save(); render(); editNode(n.id);
}
function viewCentre() {
  const c = cam(), el = $('#canvas');
  return { x: (el.clientWidth / 2 - c.x) / c.s - 60, y: (el.clientHeight / 2 - c.y) / c.s - 20 };
}
function toWorld(clientX, clientY) {
  const c = cam(), r = $('#canvas').getBoundingClientRect();
  return { x: (clientX - r.left - c.x) / c.s, y: (clientY - r.top - c.y) / c.s };
}
function detachNode(id) {
  const n = N(id);
  if (!n) return;
  if (id === doc().root) return toast('The central idea cannot be detached');
  if (!n.parent) return toast('Already a main node');
  pushUndo();
  const p = N(n.parent);
  p.children = p.children.filter(c => c !== id);
  n.parent = null;
  const pos = P[id] || { x: 0, y: 0 };
  n.x = pos.x; n.y = pos.y;
  UI.selected = id;
  save(); render();
  toast('Detached — drag it onto a node to attach it again');
}
function attachToRoot(id) {
  const d = doc();
  if (!N(id) || N(id).parent) return;
  pushUndo();
  reparent(id, d.root);
  save(); render();
}
function cutBranch(id) {
  if (!N(id) || !N(id).parent) return toast('The central idea stays');
  copyBranch(id, true);
  UI.selected = id;
  deleteSelected();
  toast('Cut');
}
function sortChildren(id) {
  const n = N(id);
  if (!n || n.children.length < 2) return toast('Nothing to sort');
  pushUndo();
  n.children.sort((a, b) => (N(a).text || '').localeCompare(N(b).text || '', undefined, { sensitivity: 'base' }));
  save(); render();
  toast('Sorted A to Z');
}
function createParent(id) {
  const d = doc(), n = N(id);
  if (!n || !n.parent) return toast('The central idea is already at the top');
  pushUndo();
  const p = N(n.parent);
  const np = mkNode(n.parent, '');
  d.nodes[np.id] = np;
  p.children[p.children.indexOf(id)] = np.id;
  np.children = [id];
  n.parent = np.id;
  UI.selected = np.id;
  save(); render(); editNode(np.id);
}
function duplicateNode(id) {
  const n = N(id);
  if (!n || !n.parent) return toast('The central idea cannot be duplicated');
  copyBranch(id, true);
  pasteBranch(n.parent);
}

/* ------------------------------- toast ----------------------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* =====================================================================
   RENDER
   ===================================================================== */
let cycleTheme = () => { };
function themeMode() {
  if (UI.theme !== 'system') return UI.theme;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function render() {
  if (!document.getElementById('app')) return;   // the page has been replaced
  if (editing) {
    // still genuinely editing? if the field vanished, recover instead of freezing
    const live = document.querySelector('[data-editing="1"]');
    if (live) return;
    editing = null;
  }
  const d = doc();
  $('#app').dataset.theme = themeMode();
  applySidebar();
  $('#app').classList.toggle('insp-open', UI.inspector);
  $('#themeBtn').textContent = UI.theme === 'light' ? 'Light' : UI.theme === 'dark' ? 'Dark' : 'System';
  if ($('#docTitle').textContent !== d.name) $('#docTitle').textContent = d.name;
  $('#layoutSel').value = d.layout;
  $$('.seg-btn').forEach(b => b.classList.toggle('is-on', b.dataset.view === UI.view));
  $$('.tool[data-toggle]').forEach(b => b.classList.toggle('is-on', !!UI[b.dataset.toggle]));
  $$('.act').forEach(b => { b.disabled = !UI.selected; });
  $('#connectBtn').classList.toggle('is-on', !!connectFrom);
  $('#connectHint').hidden = !connectFrom && !moveInto;
  if (moveInto) $('#connectHint').textContent = `Tap the node these ${marked.size || 1} should sit under.`;
  else if (connectFrom) $('#connectHint').textContent = 'Pick the first node, then the second.';
  syncSelBar();
  $('#canvas').hidden = UI.view !== 'map';
  $('#zoombar').hidden = UI.view !== 'map';
  $('#outline').hidden = UI.view !== 'outline';
  syncScrim();

  renderDocList();
  if (UI.view === 'map') renderMap(); else renderOutline();
  renderInspector();
  renderSheet();
}

/* --------------------------- documents list ------------------------ */
/* Initials are the rail's only label, so they are derived the way a person
   would read the name aloud: first letters of the first two words, or the
   first two characters of a single word. Codepoint-safe for emoji names. */
const SKIP_WORDS = new Set(['a', 'an', 'the', 'is', 'of', 'and', 'or', 'for', 'in', 'on', 'to', 'my', 'at', '&']);
function docInitials(name) {
  const raw = String(name || '').trim();
  if (!raw) return '—';
  const first = Array.from(raw)[0];
  /* a name that opens with an emoji already has a better icon than any
     pair of letters could be, so use it */
  if (/\p{Extended_Pictographic}/u.test(first)) return first;

  let words = raw.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return Array.from(raw).slice(0, 2).join('');
  /* "What is MindNote?" should read WM, not WI */
  const strong = words.filter(w => !SKIP_WORDS.has(w.toLowerCase()));
  if (strong.length) words = strong;
  const chars = w => Array.from(w);
  if (words.length === 1) return chars(words[0]).slice(0, 2).join('');
  return chars(words[0])[0] + chars(words[1])[0];
}

function renderDocList() {
  const ul = $('#docList');
  if (!ul) return;
  ul.innerHTML = '';
  const rail = sideMode() === 'rail';

  S.order.forEach(id => {
    const d = S.docs[id]; if (!d) return;
    const colour = PALETTE[S.order.indexOf(id) % PALETTE.length];
    const count = Object.keys(d.nodes).length;

    const li = document.createElement('li');
    li.className = 'doc-item' + (id === S.active ? ' is-active' : '');
    li.style.setProperty('--dc', colour);
    li.setAttribute('role', 'button');
    li.tabIndex = 0;
    /* The accessible name is the real name in both modes, so a screen
       reader never has to interpret the initials. */
    li.setAttribute('aria-label', `${d.name}, ${count} nodes`);
    if (id === S.active) li.setAttribute('aria-current', 'true');

    const chip = document.createElement('span');
    chip.className = 'doc-chip';
    chip.textContent = docInitials(d.name);
    chip.setAttribute('aria-hidden', 'true');
    li.appendChild(chip);

    if (!rail) {
      const nm = document.createElement('span');
      nm.className = 'doc-name';
      nm.textContent = d.name;
      li.appendChild(nm);

      const ct = document.createElement('span');
      ct.className = 'doc-count';
      ct.textContent = String(count);
      li.appendChild(ct);

      const kill = document.createElement('button');
      kill.className = 'doc-kill';
      kill.title = 'Delete document';
      kill.setAttribute('aria-label', `Delete ${d.name}`);
      kill.textContent = '✕';
      kill.addEventListener('click', e => {
        e.stopPropagation();
        if (S.order.length === 1) return toast('Keep at least one document');
        if (!confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
        deletedDocs[id] = Date.now();
        delete S.docs[id];
        S.order = S.order.filter(x => x !== id);
        if (S.active === id) S.active = S.order[0];
        save(); render();
      });
      li.appendChild(kill);
    } else {
      /* hover and long-press both reveal the full name */
      li.addEventListener('pointerenter', e => {
        if (e.pointerType === 'mouse') sideTip(li, d.name, `${count} nodes`);
      });
      li.addEventListener('pointerleave', hideSideTip);
      li.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') return;
        clearTimeout(sideTipTimer);
        sideTipTimer = setTimeout(() => sideTip(li, d.name, `${count} nodes`), 400);
      });
      li.addEventListener('pointerup', () => setTimeout(hideSideTip, 900));
      li.addEventListener('pointercancel', hideSideTip);
    }

    const open = () => { hideSideTip(); openDoc(id); };
    li.addEventListener('click', e => {
      if (e.target.closest('.doc-kill')) return;
      open();
    });
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    ul.appendChild(li);
  });
}

function duplicateDoc(id) {
  const src = S.docs[id];
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = src.name + ' copy';
  copy.updated = Date.now();
  delete copy.demo;
  copy.nodes[copy.root].text = copy.name;
  S.docs[copy.id] = copy;
  S.order.splice(S.order.indexOf(id) + 1, 0, copy.id);
  openDoc(copy.id);
  toast('Document duplicated');
}

function openDoc(id) {
  S.active = id; UI.selected = null; connectFrom = null; clearMarked(); findAt = -1; refreshFindRing();
  if (window.innerWidth <= 900 && sideMode() === 'wide') setSide('hidden', { quiet: true });
  const needsFit = !S.docs[id].cam;
  save(); render();
  if (needsFit) fitView();
}

/* ============================== MAP ================================ */
function renderMap() {
  const d = doc(), layer = $('#nodes');
  layer.innerHTML = '';
  P = {};
  taskMemo = {};
  refreshFocusSet();

  const visible = [];
  const walk = id => { visible.push(id); layoutKids(N(id)).forEach(walk); };
  rootsOf().forEach(walk);

  // 1. build elements, holding on to them: re-querying per node is quadratic
  const els = {};
  visible.forEach(id => { const el = buildNodeEl(id); els[id] = el; layer.appendChild(el); });

  // 2. measure
  visible.forEach(id => {
    const el = els[id];
    P[id] = { w: el.offsetWidth, h: el.offsetHeight, x: 0, y: 0 };
  });

  // 3. lay out: the central idea first, then each detached branch where it sits
  if (d.layout === 'manual') {
    layoutManual();
  } else {
    const algo = { horizontal: layoutHorizontal, vertical: layoutVertical,
                   compact: layoutCompact, radial: layoutRadial }[d.layout];
    algo(d.root, 0, 0);
    let spare = 0;
    floatsOf().forEach(f => {
      if (f.x == null || f.y == null) {          // never positioned: park it clear of the map
        const b = bboxOf(visible);
        f.x = b.x2 + 90; f.y = b.y1 + (spare++ * 90);
      }
      algo(f.id, f.x + P[f.id].w / 2, f.y + P[f.id].h / 2);
    });
  }

  // 4. position
  visible.forEach(id => {
    const el = els[id];
    el.style.left = P[id].x + 'px';
    el.style.top = P[id].y + 'px';
  });

  // 5. fold handles
  visible.forEach(id => {
    const n = N(id);
    if (!n.children.length) return;
    const b = document.createElement('button');
    const hidden = n.collapsed;
    b.className = 'n-fold' + (hidden ? ' count' : '');
    b.textContent = hidden ? String(n.children.length) : '−';
    b.style.setProperty('--nc', colorOf(id));
    b.dataset.fold = id;
    const p = P[id], dirV = (d.layout === 'vertical');
    if (dirV) { b.style.left = (p.x + p.w / 2 - 9.5) + 'px'; b.style.top = (p.y + p.h - 9.5) + 'px'; }
    else {
      const right = childSide(id) >= 0;
      b.style.left = (right ? p.x + p.w - 9.5 : p.x - 9.5) + 'px';
      b.style.top = (p.y + p.h / 2 - 9.5) + 'px';
    }
    b.style.borderColor = colorOf(id); b.style.color = colorOf(id);
    layer.appendChild(b);
  });

  buildHandles();
  applyDimming(visible, els);
  drawEdges(visible);
  applyCam();
  positionHandles();
}

/* Two round + buttons that follow the node under the pointer: one adds a
   child on the outer edge, one drops a sibling in on the branch itself.
   Both open the new node for typing straight away. */
function buildHandles() {
  const layer = $('#nodes');
  ['child', 'sibling'].forEach(kind => {
    const b = document.createElement('button');
    b.className = 'add-handle' + (kind === 'sibling' ? ' sib' : '');
    b.id = 'h-' + kind;
    b.dataset.add = kind;
    b.dataset.label = kind === 'child' ? 'Add child' : 'Add sibling';
    b.textContent = '+';
    b.title = kind === 'child' ? 'Add a child of this node' : 'Add a node beside this one';
    layer.appendChild(b);
  });
}
function positionHandles() {
  const kid = $('#h-child'), sib = $('#h-sibling');
  if (!kid || !sib) return;
  const id = (hoverId && P[hoverId]) ? hoverId : ((UI.selected && P[UI.selected]) ? UI.selected : null);
  if (!id || editing || nodeDrag || connectFrom) {
    kid.classList.remove('show'); sib.classList.remove('show');
    return;
  }
  const d = doc(), p = P[id], vertical = d.layout === 'vertical', side = sideOf(id);
  kid.dataset.for = id; sib.dataset.for = id;

  /* child continues the branch outwards; sibling sits underneath, so the
     two can never be mistaken for one another */
  if (vertical) {
    kid.style.left = (p.x + p.w / 2 - 11) + 'px';
    kid.style.top = (p.y + p.h - 8) + 'px';
    sib.style.left = (p.x + p.w - 8) + 'px';
    sib.style.top = (p.y + p.h / 2 - 11) + 'px';
  } else {
    kid.style.left = (side > 0 ? p.x + p.w - 8 : p.x - 14) + 'px';
    kid.style.top = (p.y + p.h / 2 - 11) + 'px';
    sib.style.left = (p.x + p.w / 2 - 11) + 'px';
    sib.style.top = (p.y + p.h - 8) + 'px';
  }
  kid.classList.add('show');
  sib.classList.toggle('show', !!N(id).parent);
}

function sideOf(id) {
  const n = N(id);
  if (!n.parent || !P[n.parent] || !P[id]) return 1;
  return P[id].x >= P[n.parent].x ? 1 : -1;
}
function bboxOf(ids) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  ids.forEach(id => {
    const p = P[id]; if (!p) return;
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x + p.w); y2 = Math.max(y2, p.y + p.h);
  });
  if (x1 === Infinity) return { x1: 0, y1: 0, x2: 0, y2: 0 };
  return { x1, y1, x2, y2 };
}
function childSide(id) {
  const kids = layoutKids(N(id));
  if (!kids.length) return 1;
  return (P[kids[0]].x >= P[id].x) ? 1 : -1;
}

function buildNodeEl(id) {
  const d = doc(), n = N(id), c = colorOf(id);
  const el = document.createElement('div');
  el.className = `node sh-${n.shape}` + (id === d.root ? ' is-root' : '') +
    (!n.parent && id !== d.root ? ' is-float' : '') +
    (id === UI.selected ? ' is-sel' : '') +
    (marked.has(id) ? ' is-marked' : '') +
    (findQuery && nodeMatches(n, findQuery) ? ' is-hit' : '');
  el.dataset.id = id;
  el.style.setProperty('--nc', c);
  if (n.shape !== 'line' && n.shape !== 'embedded') el.style.borderWidth = n.border + 'px';

  /* Everything that used to be appended straight to the node box now goes
     in .node-head instead, so a checklist body (see below) can stack under
     it. .node-head carries the exact flex-row rules .node used to have —
     see .node.has-checklist / .node-head in styles.css — so a node with no
     checklist looks and measures exactly as before. */
  const head = document.createElement('div');
  head.className = 'node-head';

  if (UI.showTasks && id !== d.root) {
    const st = taskState(id);
    const t = document.createElement('span');
    t.className = 'n-task ' + (st === 'done' ? 'done' : st === 'part' ? 'part' : '');
    t.dataset.task = id;
    t.textContent = st === 'done' ? '✓' : '';
    head.appendChild(t);
  }
  if (UI.showImages && n.emoji) {
    const e = document.createElement('span');
    e.className = 'n-emoji'; e.textContent = n.emoji; head.appendChild(e);
  }
  const txt = document.createElement('span');
  const headerLinked = !!(n.url && n.url.trim());
  txt.className = 'txt' + (headerLinked ? ' has-link' : '');
  /* A node with no text yet is kept, not deleted, so it has to be visible
     and big enough to click. */
  if (n.text) {
    txt.textContent = n.text;
  } else {
    txt.textContent = 'Untitled';
    txt.classList.add('is-untitled');
  }
  if (headerLinked) txt.dataset.linkpeek = id;
  head.appendChild(txt);

  const meta = [];
  if (UI.showNotes && n.note.trim()) meta.push(`<span class="n-note-ic" data-note="${id}">📝</span>`);
  if (n.link && S.docs[n.link]) meta.push(`<span class="n-link-ic" data-link="${id}" title="Open linked document">🔗</span>`);
  meta.push(`<span class="n-url-ic link-manage${headerLinked ? ' has-url' : ''}" data-linkbtn="${id}" title="${headerLinked ? 'Edit link' : 'Add link'}">${headerLinked ? '↗' : '🔗'}</span>`);
  if (meta.length) {
    const m = document.createElement('span');
    m.className = 'n-meta'; m.innerHTML = meta.join('');
    head.appendChild(m);
  }
  if (UI.showImages && imageSrcFor(n)) {
    const img = document.createElement('img');
    img.className = 'n-img'; img.src = imageSrcFor(n); img.alt = '';
    head.appendChild(img);
  }
  if (UI.showTags && n.tags.length) {
    const tw = document.createElement('span');
    tw.className = 'n-tags';
    n.tags.forEach(tid => {
      const tag = d.tags.find(t => t.id === tid); if (!tag) return;
      const s = document.createElement('span');
      s.className = 'n-tag'; s.style.background = tag.color; tw.appendChild(s);
    });
    head.appendChild(tw);
  }
  el.appendChild(head);

  /* Checklist mode: children render inline, inside this same node box,
     instead of as separate map nodes. Collapsing still hides them — the
     branch's real fold flag is untouched, we just skip building the body. */
  if (n.checklist && !n.collapsed) {
    el.classList.add('has-checklist');
    el.appendChild(kidsOf(n).length ? buildChecklistBody(n) : buildChecklistAddOnly(id));
  }
  return el;
}

/* The checklist list itself: one row per real child (same nodes[], same
   .done field, same save/sync path as everything else), plus a trailing
   "+" row that reuses newChild() exactly like the rest of the app does. */
function buildChecklistBody(n) {
  const wrap = document.createElement('div');
  wrap.className = 'checklist';
  kidsOf(n).forEach(cid => {
    const c = N(cid);
    const row = document.createElement('div');
    row.className = 'check-row';

    const hit = document.createElement('button');
    hit.type = 'button';
    hit.className = 'check-hit';
    hit.dataset.checkbox = cid;
    hit.setAttribute('aria-label', c.done ? 'Mark as not done' : 'Mark as done');
    const box = document.createElement('span');
    box.className = 'check-box' + (c.done ? ' done' : '');
    hit.appendChild(box);
    row.appendChild(hit);

    const txt = document.createElement('span');
    const linked = !!(c.url && c.url.trim());
    txt.className = 'check-txt' + (c.done ? ' done' : '') + (linked ? ' has-link' : '');
    txt.textContent = c.text || 'Untitled';
    txt.dataset.txt = cid;
    if (linked) txt.dataset.linkpeek = cid;
    row.appendChild(txt);

    const linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'check-link-hit' + (linked ? ' has-url' : '');
    linkBtn.dataset.linkbtn = cid;
    linkBtn.setAttribute('aria-label', linked ? 'Edit link' : 'Add link');
    const glyph = document.createElement('span');
    glyph.className = 'check-link';
    glyph.textContent = '🔗';
    linkBtn.appendChild(glyph);
    row.appendChild(linkBtn);

    wrap.appendChild(row);
  });
  wrap.appendChild(buildChecklistAddRow(n.id));
  return wrap;
}
/* A checklist that has just been switched on and has no items yet: show
   only the "+" so there is still a way to add the first one. */
function buildChecklistAddOnly(id) {
  const wrap = document.createElement('div');
  wrap.className = 'checklist checklist-empty';
  wrap.appendChild(buildChecklistAddRow(id));
  return wrap;
}
function buildChecklistAddRow(parentId) {
  const row = document.createElement('div');
  row.className = 'check-row check-add-row';
  const hit = document.createElement('button');
  hit.type = 'button';
  hit.className = 'check-add-hit';
  hit.dataset.checkadd = parentId;
  hit.setAttribute('aria-label', 'Add checklist item');
  const dot = document.createElement('span');
  dot.className = 'check-add';
  dot.textContent = '+';
  hit.appendChild(dot);
  row.appendChild(hit);
  return row;
}

/* -------------------------- layout engines ------------------------- */
const GAP_X = 54, GAP_Y = 16, GAP_VX = 26, GAP_VY = 64, RSTEP = 210;
let memoH = {}, memoW = {}, memoL = {};

function subH(id) {
  if (memoH[id] != null) return memoH[id];
  const kids = layoutKids(N(id));
  let v = P[id].h;
  if (kids.length) {
    let sum = 0;
    kids.forEach((k, i) => { sum += subH(k) + (i ? GAP_Y : 0); });
    v = Math.max(v, sum);
  }
  return (memoH[id] = v);
}
function subW(id) {
  if (memoW[id] != null) return memoW[id];
  const kids = layoutKids(N(id));
  let v = P[id].w;
  if (kids.length) {
    let sum = 0;
    kids.forEach((k, i) => { sum += subW(k) + (i ? GAP_VX : 0); });
    v = Math.max(v, sum);
  }
  return (memoW[id] = v);
}
function leaves(id) {
  if (memoL[id] != null) return memoL[id];
  const kids = layoutKids(N(id));
  return (memoL[id] = kids.length ? kids.reduce((a, k) => a + leaves(k), 0) : 1);
}
function resetMemo() { memoH = {}; memoW = {}; memoL = {}; }

function layoutHorizontal(rootId, cx, cy) {
  resetMemo();
  const root = N(rootId), rp = P[rootId];
  rp.x = cx - rp.w / 2; rp.y = cy - rp.h / 2;
  const kids = layoutKids(root);
  const half = Math.ceil(kids.length / 2);
  const right = kids.slice(0, half), left = kids.slice(half);
  stackH(right, rp.x + rp.w + GAP_X, 1, cy);
  stackH(left, rp.x - GAP_X, -1, cy);
}
function stackH(list, x, dir, centre) {
  if (!list.length) return;
  const total = list.reduce((a, k, i) => a + subH(k) + (i ? GAP_Y : 0), 0);
  let y = centre - total / 2;
  list.forEach(k => { const h = subH(k); placeH(k, x, y + h / 2, dir); y += h + GAP_Y; });
}
function placeH(id, x, cy, dir) {
  const p = P[id];
  p.x = dir > 0 ? x : x - p.w;
  p.y = cy - p.h / 2;
  const kids = layoutKids(N(id));
  if (!kids.length) return;
  const nx = dir > 0 ? p.x + p.w + GAP_X : p.x - GAP_X;
  const total = kids.reduce((a, k, i) => a + subH(k) + (i ? GAP_Y : 0), 0);
  let y = cy - total / 2;
  kids.forEach(k => { const h = subH(k); placeH(k, nx, y + h / 2, dir); y += h + GAP_Y; });
}

function layoutVertical(rootId, cx, cy) {
  resetMemo();
  const rp = P[rootId];
  placeV(rootId, cx, cy - rp.h / 2);
}
function placeV(id, cx, top) {
  const p = P[id];
  p.x = cx - p.w / 2; p.y = top;
  const kids = layoutKids(N(id));
  if (!kids.length) return;
  const total = kids.reduce((a, k, i) => a + subW(k) + (i ? GAP_VX : 0), 0);
  let x = cx - total / 2;
  kids.forEach(k => {
    const w = subW(k);
    placeV(k, x + w / 2, top + p.h + GAP_VY);
    x += w + GAP_VX;
  });
}

function layoutCompact(rootId, cx, cy) {
  resetMemo();
  const rp = P[rootId];
  placeC(rootId, cx - rp.w / 2, cy - rp.h / 2);
}
function placeC(id, x, top) {
  const p = P[id];
  p.x = x; p.y = top;
  const kids = layoutKids(N(id));
  if (!kids.length) return;
  const nx = x + p.w + 34;
  let y = top;
  kids.forEach(k => { placeC(k, nx, y); y += subH(k) + 10; });
}

function layoutRadial(rootId, cx, cy) {
  resetMemo();
  const root = N(rootId), rp = P[rootId];
  rp.x = cx - rp.w / 2; rp.y = cy - rp.h / 2;
  const kids = layoutKids(root);
  const tot = kids.reduce((a, k) => a + leaves(k), 0) || 1;
  let a0 = -Math.PI / 2;
  kids.forEach(k => {
    const span = (leaves(k) / tot) * Math.PI * 2;
    placeR(k, 1, a0, a0 + span, cx, cy);
    a0 += span;
  });
}
function placeR(id, depth, a0, a1, cx, cy) {
  const mid = (a0 + a1) / 2, r = depth * RSTEP, p = P[id];
  p.x = cx + Math.cos(mid) * r - p.w / 2;
  p.y = cy + Math.sin(mid) * r - p.h / 2;
  const kids = layoutKids(N(id));
  if (!kids.length) return;
  const tot = kids.reduce((a, k) => a + leaves(k), 0) || 1;
  let s = a0;
  kids.forEach(k => {
    const span = (a1 - a0) * leaves(k) / tot;
    placeR(k, depth + 1, s, s + span, cx, cy);
    s += span;
  });
}

function layoutManual() {
  const d = doc();
  const walk = id => {
    const n = d.nodes[id], p = P[id];
    if (n.x == null || n.y == null) {
      if (n.parent && P[n.parent]) {
        const pp = P[n.parent], gp = d.nodes[n.parent].parent;
        const dir = (gp && P[gp]) ? (pp.x >= P[gp].x ? 1 : -1) : 1;
        n.x = dir > 0 ? pp.x + pp.w + 60 : pp.x - p.w - 60;
        n.y = pp.y + kidsOf(N(n.parent)).indexOf(id) * (p.h + 16);
      } else { n.x = -p.w / 2; n.y = -p.h / 2; }
    }
    p.x = n.x; p.y = n.y;
    layoutKids(n).forEach(walk);
  };
  rootsOf().forEach(walk);
}
function pinAll() {
  const d = doc();
  Object.keys(P).forEach(id => { d.nodes[id].x = P[id].x; d.nodes[id].y = P[id].y; });
}

/* ------------------------------ edges ------------------------------ */
function off(id) {
  if (dragOffset && dragOffset.ids.has(id)) return { dx: dragOffset.dx, dy: dragOffset.dy };
  return { dx: 0, dy: 0 };
}
function box(id) {
  const p = P[id], o = off(id);
  return { x: p.x + o.dx, y: p.y + o.dy, w: p.w, h: p.h };
}
function drawEdges(visible) {
  const eL = $('#edgeLayer'), lL = $('#linkLayer');
  eL.innerHTML = ''; lL.innerHTML = '';
  const d = doc();
  const dashOf = s => (s === 'dashed' ? '9 7' : s === 'dotted' ? '1 6' : '');

  visible.forEach(id => {
    const n = N(id);
    if (!n.parent || !P[n.parent]) return;
    const a = box(n.parent), b = box(id);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', curve(a, b));
    path.setAttribute('class', 'edge');
    path.setAttribute('stroke', colorOf(id));
    path.setAttribute('stroke-width', n.parent === d.root ? 3.6 : 2.6);
    const dash = dashOf(n.lineStyle);
    if (dash) path.setAttribute('stroke-dasharray', dash);
    if (isDimmed(id) || isDimmed(n.parent)) path.setAttribute('class', 'edge dim');
    eL.appendChild(path);
  });

  d.connections.forEach(c => {
    if (!P[c.a] || !P[c.b]) return;
    const a = box(c.a), b = box(c.b);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', curve(a, b, true));
    p.setAttribute('class', 'xlink');
    p.dataset.conn = c.id;
    p.addEventListener('click', () => {
      pushUndo();
      doc().connections = doc().connections.filter(x => x.id !== c.id);
      save(); render(); toast('Connection removed');
    });
    lL.appendChild(p);
  });
}
function curve(a, b, arc) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  if (arc) {
    const mx = (ac.x + bc.x) / 2 + dy * 0.16, my = (ac.y + bc.y) / 2 - dx * 0.16;
    return `M${ac.x} ${ac.y} Q${mx} ${my} ${bc.x} ${bc.y}`;
  }
  const kind = doc().branch || 'curved';
  if (Math.abs(dx) >= Math.abs(dy)) {
    const x1 = dx > 0 ? a.x + a.w : a.x, x2 = dx > 0 ? b.x : b.x + b.w;
    const m = (x1 + x2) / 2;
    if (kind === 'straight') return `M${x1} ${ac.y} L${x2} ${bc.y}`;
    if (kind === 'elbow') return `M${x1} ${ac.y} H${m} V${bc.y} H${x2}`;
    return `M${x1} ${ac.y} C${m} ${ac.y} ${m} ${bc.y} ${x2} ${bc.y}`;
  }
  const y1 = dy > 0 ? a.y + a.h : a.y, y2 = dy > 0 ? b.y : b.y + b.h;
  const m = (y1 + y2) / 2;
  if (kind === 'straight') return `M${ac.x} ${y1} L${bc.x} ${y2}`;
  if (kind === 'elbow') return `M${ac.x} ${y1} V${m} H${bc.x} V${y2}`;
  return `M${ac.x} ${y1} C${ac.x} ${m} ${bc.x} ${m} ${bc.x} ${y2}`;
}

/* --------------------- focus mode + tag highlight ------------------ */
let focusSet = null;
function refreshFocusSet() {
  focusSet = null;
  if (UI.focusMode && UI.selected && N(UI.selected)) {
    focusSet = new Set([UI.selected, ...descendants(UI.selected), ...ancestors(UI.selected)]);
  }
}
function isDimmed(id) {
  if (id === doc().root) return false;
  if (UI.highlightTag) return !N(id).tags.includes(UI.highlightTag);
  if (focusSet) return !focusSet.has(id);
  return false;
}
function applyDimming(visible, els) {
  visible.forEach(id => {
    const el = els ? els[id] : $(`#nodes .node[data-id="${id}"]`);
    if (el) el.classList.toggle('dim', isDimmed(id));
  });
}

/* ----------------------------- camera ------------------------------ */
function cam() {
  const d = doc();
  if (!d.cam) d.cam = { x: $('#canvas').clientWidth / 2, y: $('#canvas').clientHeight / 2, s: 1 };
  return d.cam;
}
function applyCam() {
  const c = cam();
  $('#world').style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.s})`;
  const z = $('#zoomFit');
  if (z) z.textContent = Math.round(c.s * 100) + '%';
}
function zoomBy(f, px, py) {
  const c = cam(), s2 = clamp(c.s * f, 0.2, 3);
  const rect = $('#canvas').getBoundingClientRect();
  const cx = px == null ? rect.width / 2 : px - rect.left;
  const cy = py == null ? rect.height / 2 : py - rect.top;
  c.x = cx - (cx - c.x) * (s2 / c.s);
  c.y = cy - (cy - c.y) * (s2 / c.s);
  c.s = s2;
  applyCam(); save();
}
function fitView() {
  if (UI.view !== 'map') return;
  const ids = Object.keys(P);
  if (!ids.length) return;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  ids.forEach(id => {
    const p = P[id];
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x + p.w); y2 = Math.max(y2, p.y + p.h);
  });
  const el = $('#canvas'), pad = 48;
  const s = clamp(Math.min((el.clientWidth - pad * 2) / (x2 - x1), (el.clientHeight - pad * 2) / (y2 - y1)), 0.2, 1.4);
  const c = cam();
  c.s = s;
  c.x = el.clientWidth / 2 - ((x1 + x2) / 2) * s;
  c.y = el.clientHeight / 2 - ((y1 + y2) / 2) * s;
  applyCam(); save();
}

/* =====================================================================
   INTERACTION — pointer, drag, pan, pinch
   ===================================================================== */
const pointers = new Map();
let pan = null, nodeDrag = null, pinch = null;
let lpTimer = null, lpStart = null, lastCtxAt = 0;
let pendingCtx = null;   // a right-click waiting to see whether it becomes a drag

function cancelGestures() {
  clearTimeout(lpTimer); lpTimer = null; lpStart = null;
  if (band) { band = null; hideBand(); clearPreview(); }
  pendingCtx = null;
  pan = null; pinch = null; pointers.clear();
  if (nodeDrag) { nodeDrag = null; dragOffset = null; render(); }
}

function canvasSetup() {
  const canvas = $('#canvas');

  canvas.addEventListener('pointerdown', e => {
    const foldBtn = e.target.closest('[data-fold]');
    const taskBtn = e.target.closest('[data-task]');
    const noteIc = e.target.closest('[data-note]');
    const linkIc = e.target.closest('[data-link]');
    const urlIc = e.target.closest('[data-url]');
    const addBtn = e.target.closest('[data-add]');
    const checkCtl = e.target.closest('[data-checkbox], [data-checkadd]');
    const linkCtl = e.target.closest('[data-linkbtn], [data-linkpeek]');
    /* Controls sitting on top of the canvas must not start a pan. Capturing
       the pointer would send their click to the canvas instead of to them. */
    const overlay = e.target.closest('#zoombar, #ctx, .hint, #linkPop');
    if (foldBtn || taskBtn || noteIc || linkIc || urlIc || addBtn || checkCtl || linkCtl || overlay) return;
    /* While a node is being typed into, the canvas stays put. The browser
       still blurs the field, which commits the text. */
    if (editing) return;

    /* Right button: this is either a context menu or the start of a
       selection band. Which one it is only becomes clear on release, so
       hold the menu back until then. */
    if (e.pointerType === 'mouse' && e.button === 2) {
      const over = e.target.closest('.node');
      band = {
        sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, moved: false,
        additive: e.shiftKey || e.ctrlKey || e.metaKey,
        onNode: over ? over.dataset.id : null
      };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      pan = null; nodeDrag = null;
      return;
    }
    const nodeEl = e.target.closest('.node');
    /* A checklist row (its text/whitespace, not the checkbox or + which are
       already excluded above) belongs to one specific child, not the whole
       parent branch: it must not drag the parent, but long-press should
       still open a context menu — for that child, not the parent. */
    const checkRow = e.target.closest('.check-row:not(.check-add-row)');
    const checkRowTxt = checkRow ? checkRow.querySelector('[data-txt]') : null;
    canvas.setPointerCapture(e.pointerId);

    /* touch and pen: hold still for half a second to get the menu */
    if (e.pointerType !== 'mouse') {
      lpStart = { x: e.clientX, y: e.clientY };
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => {
        lpTimer = null;
        if (Date.now() - lastCtxAt < 700) return;   // the browser already offered one
        const target = checkRowTxt ? checkRowTxt.dataset.txt : (nodeEl ? nodeEl.dataset.id : null);
        const at = lpStart;
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { } }

        if (target) { cancelGestures(); openContextMenu(at.x, at.y, target); return; }

        /* Held on empty canvas: arm a selection band. Drag from here to
           sweep up nodes; lift without moving and the canvas menu opens,
           which is what a plain hold has always done. */
        pan = null; nodeDrag = null;
        band = { sx: at.x, sy: at.y, cx: at.x, cy: at.y, moved: false, additive: false, onNode: null, touch: true };
        pendingCtx = { x: at.x, y: at.y, id: null };
        teachOnce('band', 'Drag to select, or lift for the menu');
      }, 520);
    }
    if (checkRow) {
      // no drag, no pan — just wait to see if this becomes a long-press or a plain tap
    } else if (nodeEl && !editing) {
      const id = nodeEl.dataset.id;
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      /* dragging any member of a selection carries the whole selection */
      const heads = (!additive && marked.has(id) && marked.size > 1) ? topLevel(selIds()) : [id];
      const ids = new Set();
      heads.forEach(h => { ids.add(h); descendants(h).forEach(x => ids.add(x)); });
      nodeDrag = { id, heads, additive, sx: e.clientX, sy: e.clientY, moved: false, ids };
    } else {
      pan = { sx: e.clientX, sy: e.clientY, cx: cam().x, cy: cam().y, moved: false };
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (band) {
      band.cx = e.clientX; band.cy = e.clientY;
      if (!band.moved && Math.hypot(e.clientX - band.sx, e.clientY - band.sy) > 6) {
        band.moved = true;
        pendingCtx = null;              // it turned into a drag, so no menu
      }
      if (band.moved) {
        showBand(band.sx, band.sy, band.cx, band.cy);
        previewBand(nodesInBand(band.sx, band.sy, band.cx, band.cy));
      }
      return;
    }
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (lpTimer && lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 8) {
      clearTimeout(lpTimer); lpTimer = null;
    }

    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 0) zoomBy(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.d = d;
      return;
    }
    if (pan) {
      const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
      if (Math.hypot(dx, dy) > 3) pan.moved = true;
      cam().x = pan.cx + dx; cam().y = pan.cy + dy;
      applyCam();
      return;
    }
    if (nodeDrag) {
      const s = cam().s;
      const dx = (e.clientX - nodeDrag.sx) / s, dy = (e.clientY - nodeDrag.sy) / s;
      if (!nodeDrag.moved && Math.hypot(dx, dy) < 5) return;
      nodeDrag.moved = true;
      dragOffset = { ids: nodeDrag.ids, dx, dy };
      nodeDrag.ids.forEach(id => {
        const el = $(`#nodes .node[data-id="${id}"]`);
        if (el) el.style.transform = `translate(${dx}px,${dy}px)`;
      });
      // drop target highlight
      const target = hitNode(e.clientX, e.clientY, nodeDrag.ids);
      $$('#nodes .node.is-drop').forEach(el => el.classList.remove('is-drop'));
      if (target) $(`#nodes .node[data-id="${target}"]`).classList.add('is-drop');
      nodeDrag.target = target;
      positionHandles();
      drawEdges(Object.keys(P));
    }
  });

  const finish = e => {
    clearTimeout(lpTimer); lpTimer = null;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;

    if (band) {
      const b = band; band = null;
      hideBand();
      if (b.moved) { commitBand(b, b.additive); }
      else if (pendingCtx) {
        const pc = pendingCtx; pendingCtx = null;
        openContextMenu(pc.x, pc.y, pc.id != null ? pc.id : b.onNode);
      }
      return;
    }

    if (nodeDrag) {
      const nd = nodeDrag; nodeDrag = null; dragOffset = null;
      if (!nd.moved) {
        handleNodeTap(nd.id, nd.additive);
      } else if (nd.target) {
        /* dropped onto a node: every head of the drag moves under it */
        pushUndo();
        const heads = (nd.heads || [nd.id]).filter(h => h !== nd.target && !descendants(h).includes(nd.target));
        heads.forEach(h => reparent(h, nd.target));
        save(); render();
        if (heads.length > 1) toast(`${heads.length} branches moved`);
      } else {
        pushUndo();
        const d = doc();
        const s = cam().s;
        const dx = (e.clientX - nd.sx) / s, dy = (e.clientY - nd.sy) / s;
        const heads = nd.heads || [nd.id];
        let detached = 0;

        heads.forEach(hid => {
          const node = d.nodes[hid];
          if (!node) return;
          if (d.layout === 'manual') {
            [hid, ...descendants(hid)].forEach(id => {
              if (d.nodes[id]) { d.nodes[id].x += dx; d.nodes[id].y += dy; }
            });
          } else if (node.parent) {
            /* pulled clear of everything: it becomes a main node of its own */
            const p = N(node.parent);
            if (p) p.children = p.children.filter(c => c !== hid);
            node.parent = null;
            node.x = (P[hid] ? P[hid].x : 0) + dx;
            node.y = (P[hid] ? P[hid].y : 0) + dy;
            detached++;
          } else {
            node.x = (node.x == null ? (P[hid] ? P[hid].x : 0) : node.x) + dx;
            node.y = (node.y == null ? (P[hid] ? P[hid].y : 0) : node.y) + dy;
          }
        });
        save(); render();
        if (detached === 1) toast('Detached — drop it on a node to attach it again');
        else if (detached > 1) toast(`${detached} branches detached`);
      }
      return;
    }
    if (pan) {
      const moved = pan.moved; pan = null;
      save();
      if (!moved && !editing) {
        if (moveInto) { moveInto = false; render(); return; }
        if (connectFrom) { connectFrom = null; render(); return; }
        if (marked.size) { clearMarked(); UI.selected = null; render(); return; }
        if (UI.selected) { UI.selected = null; render(); }
      }
    }
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  canvas.addEventListener('wheel', e => {
    if (editing) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomBy(e.deltaY > 0 ? 0.92 : 1.08, e.clientX, e.clientY);
    else { const c = cam(); c.x -= e.deltaX; c.y -= e.deltaY; applyCam(); save(); }
  }, { passive: false });

  canvas.addEventListener('contextmenu', e => {
    if (editing) return;                       // let the browser handle text fields
    e.preventDefault();
    lastCtxAt = Date.now();

    /* Browsers disagree about whether this fires on press or on release.
       If a band is armed, remember the request and decide on release:
       a plain right-click opens the menu, a right-drag selects instead. */
    if (band) {
      const el0 = e.target.closest('.node');
      pendingCtx = { x: e.clientX, y: e.clientY, id: el0 ? el0.dataset.id : null };
      return;
    }
    /* elementFromPoint finds the node under a long-press even when the
       event landed on an overlay; fall back if the host lacks it */
    const real = (typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(e.clientX, e.clientY) : null) || e.target;
    const checkTxt = real.closest('[data-txt]');
    const el = real.closest('.node');
    const at = { x: e.clientX, y: e.clientY };
    const target = checkTxt ? checkTxt.dataset.txt : (el ? el.dataset.id : null);
    cancelGestures();
    openContextMenu(at.x, at.y, target);
  });

  document.addEventListener('pointerdown', e => {
    if ($('#ctx') && !e.target.closest('#ctx')) closeContextMenu();
    if ($('#linkPop') && !e.target.closest('#linkPop') && !e.target.closest('[data-linkbtn], [data-linkpeek]')) closeLinkPopover();
  }, true);
  window.addEventListener('blur', closeContextMenu);

  canvas.addEventListener('pointerover', e => {
    const el = e.target.closest('.node');
    const id = el ? el.dataset.id : null;
    if (id !== hoverId) { hoverId = id; positionHandles(); }
  });
  canvas.addEventListener('pointerleave', () => { hoverId = null; positionHandles(); });

  canvas.addEventListener('dblclick', e => {
    // setPointerCapture() on this canvas can retarget the derived dblclick
    // event to the canvas itself once a drag/pan gesture was armed for this
    // pointer; resolving by coordinate sidesteps that entirely.
    /* elementFromPoint finds the node under a long-press even when the
       event landed on an overlay; fall back if the host lacks it */
    const real = (typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(e.clientX, e.clientY) : null) || e.target;
    const checkTxt = real.closest('[data-txt]');
    if (checkTxt) { editNode(checkTxt.dataset.txt); return; }
    const el = real.closest('.node');
    if (el) editNode(el.dataset.id);
  });

  // delegated clicks for the small controls
  canvas.addEventListener('click', e => {
    const fold = e.target.closest('[data-fold]');
    if (fold) {
      const n = N(fold.dataset.fold);
      n.collapsed = !n.collapsed; save(); render(); return;
    }
    const task = e.target.closest('[data-task]');
    if (task) {
      pushUndo();
      const id = task.dataset.task;
      setDone(id, taskState(id) !== 'done');
      save(); render(); return;
    }
    const note = e.target.closest('[data-note]');
    if (note) { UI.selected = note.dataset.note; UI.inspector = true; render(); return; }
    const link = e.target.closest('[data-link]');
    if (link) { const t = N(link.dataset.link).link; if (S.docs[t]) openDoc(t); return; }
    const urlIc = e.target.closest('[data-url]');
    if (urlIc) {
      const u = N(urlIc.dataset.url).url;
      if (u) window.open(/^https?:\/\//i.test(u) ? u : 'https://' + u, '_blank', 'noopener');
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      const id = add.dataset.for;
      if (!id || !N(id)) return;
      UI.selected = id;
      if (add.dataset.add === 'child') newChild(id); else newSibling(id);
      return;
    }
    const checkbox = e.target.closest('[data-checkbox]');
    if (checkbox) {
      pushUndo();
      toggleChecklistItem(checkbox.dataset.checkbox);
      save(); render(); return;
    }
    const checkAdd = e.target.closest('[data-checkadd]');
    if (checkAdd) {
      const id = checkAdd.dataset.checkadd;
      if (!id || !N(id)) return;
      newChild(id); return;
    }
    const linkBtn = e.target.closest('[data-linkbtn]');
    if (linkBtn) {
      const id = linkBtn.dataset.linkbtn;
      if (!id || !N(id)) return;
      const r = linkBtn.getBoundingClientRect();
      openLinkPopover(id, r.left, r.bottom + 6);
      return;
    }
    const linkPeek = e.target.closest('[data-linkpeek]');
    if (linkPeek) {
      const id = linkPeek.dataset.linkpeek;
      if (!id || !N(id)) return;
      const r = linkPeek.getBoundingClientRect();
      openLinkPopover(id, r.left, r.bottom + 6);
      return;
    }
  });
}

function hitNode(clientX, clientY, exclude) {
  const els = $$('#nodes .node').reverse();
  for (const el of els) {
    const id = el.dataset.id;
    if (exclude && exclude.has(id)) continue;
    const r = el.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return id;
  }
  return null;
}
function reparent(id, newParent) {
  const d = doc();
  if (id === d.root) return;
  if (newParent === id || descendants(id).includes(newParent)) return;
  const n = N(id);
  if (n.parent) {
    const old = N(n.parent);
    if (old) old.children = old.children.filter(c => c !== id);
  }
  n.parent = newParent;
  if (d.layout !== 'manual') { n.x = null; n.y = null; }   // let the layout take over again
  N(newParent).children.push(id);
  N(newParent).collapsed = false;
}

function handleNodeTap(id, additive) {
  if (moveInto) { moveSelectionInto(id); return; }
  if (additive) {                    // shift or ctrl click adds and removes
    /* a modifier click is not half of a double tap: clear the candidate,
       or the next plain click on the same node opens the editor */
    lastTap = { id: null, t: 0 };
    toggleMark(id);
    render();
    return;
  }
  if (connectFrom) {
    if (connectFrom !== id) {
      pushUndo();
      doc().connections.push({ id: uid(), a: connectFrom, b: id });
      toast('Connection added');
    }
    connectFrom = null; save(); render(); return;
  }
  const now = Date.now();
  if (lastTap.id === id && now - lastTap.t < 380) { lastTap = { id: null, t: 0 }; editNode(id); return; }
  lastTap = { id, t: now };
  /* tapping a node that is part of a wider selection keeps that selection,
     so you can pick one up and drag the whole set */
  if (!marked.has(id)) clearMarked();
  UI.selected = id;
  render();
}

/* =====================================================================
   Context menu — right click on a desktop, long press on a touch screen.
   ===================================================================== */
function placeContextMenu(menu, x, y) {
  const r = menu.getBoundingClientRect(), pad = 8;
  menu.style.left = Math.max(pad, Math.min(x, window.innerWidth - r.width - pad)) + 'px';
  menu.style.top = Math.max(pad, Math.min(y, window.innerHeight - r.height - pad)) + 'px';
}

function closeContextMenu() {
  const m = $('#ctx');
  if (m) m.remove();
}
function openContextMenu(x, y, id) {
  closeContextMenu();
  closeLinkPopover();
  if (editing) return;
  const d = doc();
  const menu = document.createElement('div');
  menu.id = 'ctx';
  menu.setAttribute('role', 'menu');

  const item = (label, fn, opts = {}) => {
    if (opts.skip) return;
    const b = document.createElement('button');
    b.className = 'ctx-item' + (opts.danger ? ' danger' : '');
    b.textContent = label;
    b.setAttribute('role', 'menuitem');
    if (opts.hint) {
      const k = document.createElement('span');
      k.className = 'ctx-key';
      k.textContent = opts.hint;
      b.appendChild(k);
    }
    if (opts.disabled) { b.disabled = true; }
    else b.addEventListener('click', () => { closeContextMenu(); fn(); });
    menu.appendChild(b);
  };
  const sep = () => { const s2 = document.createElement('div'); s2.className = 'ctx-sep'; menu.appendChild(s2); };

  /* Several nodes held: offer what makes sense for a set, not for one. */
  if (marked.size > 1 && (!id || marked.has(id))) {
    const ids = selIds(), heads = topLevel(ids);
    const head = document.createElement('div');
    head.className = 'ctx-head';
    head.textContent = `${ids.length} nodes selected`;
    menu.appendChild(head);

    item('Move into…', () => armMoveInto());
    item('Detach from parents', () => detachSelection());
    item('Fold branches', () => foldSelection(true));
    item('Unfold branches', () => foldSelection(false));
    item('Mark as done', () => markSelectionDone(true));
    item('Clear task marks', () => markSelectionDone(false));
    sep();
    item('Colour and shape…', () => {
      if (window.innerWidth > 900) { UI.inspector = true; UI.inspTab = 'style'; }
      else UI.sheetTab = 'style';
      save(); render();
    });
    item('Sort each branch A–Z', () => {
      pushUndo();
      ids.forEach(x => { const nn = N(x); if (nn && nn.children.length > 1) nn.children.sort((a, b) => (N(a).text || '').localeCompare(N(b).text || '', undefined, { sensitivity: 'base' })); });
      save(); render();
    });
    sep();
    item('Copy', () => copySelection(), { hint: 'Ctrl C' });
    item('Duplicate', () => duplicateSelection(), { hint: 'Ctrl D' });
    item('Select all', () => { markAll(); render(); }, { hint: 'Ctrl A' });
    item('Clear selection', () => { clearMarked(); render(); }, { hint: 'Esc' });
    sep();
    item(`Delete ${heads.length === 1 ? 'branch' : heads.length + ' branches'}`,
         () => deleteSelection(), { danger: true, hint: 'Del' });

    document.body.appendChild(menu);
    placeContextMenu(menu, x, y);
    return;
  }

  if (id && N(id)) {
    const n = N(id), isRoot = id === d.root, st = taskState(id);
    if (!marked.has(id)) clearMarked();
    UI.selected = id;
    const head = document.createElement('div');
    head.className = 'ctx-head';
    head.textContent = n.text || 'Untitled node';
    menu.appendChild(head);

    item('Edit title', () => editNode(id), { hint: 'F2' });
    item('Add child', () => newChild(id), { hint: 'Tab' });
    item('Add sibling', () => newSibling(id), { hint: 'Enter', skip: isRoot });
    item('New parent', () => createParent(id), { skip: isRoot });
    sep();
    item(n.collapsed ? 'Unfold branch' : 'Fold branch', () => { N(id).collapsed = !N(id).collapsed; save(); render(); },
      { skip: !n.children.length, hint: 'Space' });
    item(st === 'done' ? 'Clear task' : 'Add task', () => { pushUndo(); setDone(id, st !== 'done'); UI.showTasks = true; save(); render(); }, { skip: isRoot });
    item(n.checklist ? 'Turn off checklist view' : 'Show as checklist',
      () => {
        pushUndo();
        n.checklist = !n.checklist;
        if (n.checklist) UI.showTasks = true;   // so the parent's ✓/part/○ dot is visible right away
        save(); render();
      }, { skip: isRoot });
    item('Create connection', () => doAct('connect'));
    item('Sort children A–Z', () => sortChildren(id), { skip: n.children.length < 2 });
    sep();
    item('Select this branch', () => { markBranch(id); render(); }, { skip: !n.children.length });
    item('Select siblings', () => { markSiblings(id); render(); });
    item('Select all', () => { markAll(); render(); }, { hint: 'Ctrl A' });
    item('Detach from parent', () => detachNode(id), { skip: isRoot || !n.parent });
    item('Attach to central idea', () => attachToRoot(id), { skip: isRoot || !!n.parent });
    sep();
    item('Cut', () => cutBranch(id), { skip: isRoot });
    item('Copy', () => copyBranch(id), { hint: 'Ctrl C' });
    item('Paste into', () => pasteBranch(id), { disabled: !clipboard, hint: 'Ctrl V' });
    item('Paste and keep style', () => pasteBranch(id, false), { disabled: !clipboard });
    item('Duplicate', () => duplicateNode(id), { skip: isRoot, hint: 'Ctrl D' });
    sep();
    item('Style and notes…', () => {
      if (window.innerWidth > 900) { UI.inspector = true; UI.inspTab = 'style'; }
      else UI.sheetTab = 'style';
      save(); render();
    });
    item('Delete', () => deleteSelected(), { danger: true, skip: isRoot, hint: 'Del' });
  } else {
    const at = toWorld(x, y);
    item('New main node', () => newMainNode(at.x, at.y));
    item('Paste', () => pasteBranch(d.root, true), { disabled: !clipboard });
    item('Paste and keep style', () => pasteBranch(d.root, false), { disabled: !clipboard });
    sep();
    item('Select all', () => { markAll(); render(); }, { hint: 'Ctrl A' });
    sep();
    item('Zoom in', () => zoomBy(1.15));
    item('Zoom out', () => zoomBy(0.87));
    item('Zoom to fit', () => fitView());
    sep();
    item('Unfold everything', () => {
      Object.values(d.nodes).forEach(n => { n.collapsed = false; });
      save(); render();
    });
  }

  document.body.appendChild(menu);
  placeContextMenu(menu, x, y);
  if (id) render();
}

/* =====================================================================
   Link popover — a quick way to attach a URL to a task or checklist
   subtask without leaving the map for the full "Style and notes" panel.
   Reuses the same n.url field and open-link logic the Inspector and the
   header ↗ icon already use; this is just a faster way to reach it.
   ===================================================================== */
let linkPopEl = null;
function closeLinkPopover() {
  if (linkPopEl) { linkPopEl.remove(); linkPopEl = null; }
}
function positionFloating(el, x, y) {
  const r = el.getBoundingClientRect(), pad = 8;
  const left = Math.max(pad, Math.min(x, window.innerWidth - r.width - pad));
  const top = Math.max(pad, Math.min(y, window.innerHeight - r.height - pad));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
function openUrl(u) {
  if (u) window.open(/^https?:\/\//i.test(u) ? u : 'https://' + u, '_blank', 'noopener');
}
function openLinkPopover(id, x, y, forceEdit) {
  const n = N(id);
  if (!n) return;
  closeLinkPopover(); closeContextMenu();
  const hasUrl = !!(n.url && n.url.trim());
  const editing2 = forceEdit || !hasUrl;
  const box = document.createElement('div');
  box.id = 'linkPop';
  box.innerHTML = editing2
    ? `<input type="text" placeholder="Paste a link, e.g. docs.google.com/…">
       <div class="lp-row">
         ${hasUrl ? '<button type="button" class="lp-btn lp-remove">Remove</button>' : ''}
         <button type="button" class="lp-btn lp-save">Save</button>
       </div>`
    : `<div class="lp-url">${escapeHtml(n.url)}</div>
       <div class="lp-row">
         <button type="button" class="lp-btn lp-remove">Remove</button>
         <button type="button" class="lp-btn lp-edit">Edit</button>
         <button type="button" class="lp-btn lp-open">Open ↗</button>
       </div>`;
  document.body.appendChild(box);
  positionFloating(box, x, y);
  linkPopEl = box;

  const remove = box.querySelector('.lp-remove');
  if (remove) remove.addEventListener('click', () => {
    pushUndo(); n.url = ''; save(); render(); closeLinkPopover();
  });

  if (editing2) {
    const input = box.querySelector('input');
    input.value = n.url || '';
    input.focus(); input.select();
    const commit = () => {
      pushUndo();
      n.url = input.value.trim();
      save(); render();
      closeLinkPopover();
    };
    box.querySelector('.lp-save').addEventListener('click', commit);
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeLinkPopover(); }
    });
  } else {
    box.querySelector('.lp-open').addEventListener('click', () => { const u = n.url; closeLinkPopover(); openUrl(u); });
    box.querySelector('.lp-edit').addEventListener('click', () => openLinkPopover(id, x, y, true));
  }
}

/* A count with a way out. Without it a selection made by sweeping is easy
   to forget about, and on a touch screen there is no Escape key. */
function syncSelBar() {
  const bar = $('#selBar');
  if (!bar) return;
  const n = marked.size;
  bar.hidden = !(n > 1 && UI.view === 'map');
  if (n > 1) $('#selCount').textContent = `${n} nodes selected`;
}

/* Worth saying the first few times, tiresome every time after that. */
function teachOnce(key, message, times) {
  const k = 'mindnote.taught.' + key;
  let n = 0;
  try { n = parseInt(localStorage.getItem(k) || '0', 10) || 0; } catch (e) { return; }
  if (n >= (times || 3)) return;
  try { localStorage.setItem(k, String(n + 1)); } catch (e) { }
  toast(message);
}

/* ------------------------------ marquee ---------------------------- */
/* A rubber band drawn over the canvas. Held in client coordinates while
   it is on screen and converted to world coordinates to decide what it
   caught, so it stays correct at any pan or zoom. */
let band = null, bandEl = null;

function showBand(x0, y0, x1, y1) {
  const canvas = $('#canvas');
  if (!bandEl) {
    bandEl = document.createElement('div');
    bandEl.id = 'marquee';
    canvas.appendChild(bandEl);
  }
  const r = canvas.getBoundingClientRect();
  const l = Math.min(x0, x1) - r.left, t = Math.min(y0, y1) - r.top;
  bandEl.style.left = l + 'px';
  bandEl.style.top = t + 'px';
  bandEl.style.width = Math.abs(x1 - x0) + 'px';
  bandEl.style.height = Math.abs(y1 - y0) + 'px';
  bandEl.hidden = false;
}
function hideBand() { if (bandEl) bandEl.hidden = true; }

function nodesInBand(x0, y0, x1, y1) {
  const a = toWorld(Math.min(x0, x1), Math.min(y0, y1));
  const b = toWorld(Math.max(x0, x1), Math.max(y0, y1));
  const hit = [];
  Object.keys(P).forEach(id => {
    const p = P[id];
    /* any overlap counts, so you do not have to lasso a node exactly */
    if (p.x < b.x && p.x + p.w > a.x && p.y < b.y && p.y + p.h > a.y) hit.push(id);
  });
  return hit;
}

/* live preview while the band is being dragged */
function previewBand(ids) {
  const want = new Set(ids);
  $$('#nodes .node').forEach(el => el.classList.toggle('in-band', want.has(el.dataset.id)));
}
function clearPreview() { $$('#nodes .node.in-band').forEach(el => el.classList.remove('in-band')); }

/* the rect is passed in: by the time this runs the live band is gone */
function commitBand(b, additive) {
  const ids = nodesInBand(b.sx, b.sy, b.cx, b.cy);
  clearPreview();
  if (additive) {
    const merged = new Set([...selIds(), ...ids]);
    setMarked([...merged]);
  } else {
    setMarked(ids);
  }
  if (!ids.length && !additive) { clearMarked(); UI.selected = null; }
  render();
}

/* =====================================================================
   MULTI-SELECTION

   UI.selected stays the anchor — the one node that "add child" or "rename"
   act on. `marked` holds a wider selection on top of it. While marked
   holds nothing or one node, every existing behaviour is unchanged.

   Reached by: right-button drag on the canvas, press-and-hold then drag on
   a touch screen, shift or ctrl clicking nodes, Ctrl+A, or "Select branch"
   in the context menu.
   ===================================================================== */
let marked = new Set();
let moveInto = false;    // armed: the next node tapped becomes the new parent

function selIds() {
  if (marked.size) return [...marked].filter(id => N(id));
  return (UI.selected && N(UI.selected)) ? [UI.selected] : [];
}
const multi = () => marked.size > 1;

/* Deleting, moving or copying a parent already carries its children, so
   those operations work on the heads of the selection rather than every
   node in it — otherwise a branch would be processed twice. */
function topLevel(ids) {
  const set = new Set(ids);
  return ids.filter(id => !ancestors(id).some(a => set.has(a)));
}

function setMarked(ids) {
  marked = new Set(ids.filter(id => N(id)));
  if (marked.size && (!UI.selected || !marked.has(UI.selected))) UI.selected = [...marked][0];
}
function clearMarked() {
  if (!marked.size) return false;
  marked.clear();
  return true;
}
function toggleMark(id) {
  if (!N(id)) return;
  if (!marked.size && UI.selected && UI.selected !== id) marked.add(UI.selected);
  if (marked.has(id)) {
    marked.delete(id);
    if (UI.selected === id) UI.selected = marked.size ? [...marked][0] : null;
  } else {
    marked.add(id);
    UI.selected = id;
  }
  if (marked.size === 1) { UI.selected = [...marked][0]; marked.clear(); }
}
function markBranch(id) {
  if (!N(id)) return;
  setMarked([id, ...descendants(id)]);
}
function markAll() {
  const ids = [];
  rootsOf().forEach(function walk(x) { ids.push(x); kidsOf(N(x)).forEach(walk); });
  setMarked(ids);
}
function markSiblings(id) {
  const n = N(id);
  if (!n) return;
  if (!n.parent) return setMarked(rootsOf());
  setMarked(kidsOf(N(n.parent)));
}

/* ------------------------- acting on a selection ------------------- */
/* Dragging a dozen nodes across a large map is awkward, especially with a
   finger. Arming a move instead lets you pick the destination calmly. */
function armMoveInto() {
  if (!selIds().length) return;
  moveInto = true;
  connectFrom = null;
  render();
}
function moveSelectionInto(targetId) {
  moveInto = false;
  if (!N(targetId)) { render(); return; }
  const heads = topLevel(selIds())
    .filter(h => h !== targetId && h !== doc().root && !descendants(h).includes(targetId));
  if (!heads.length) { toast('Pick a node outside the selection'); render(); return; }
  pushUndo();
  heads.forEach(h => reparent(h, targetId));
  save(); render();
  toast(heads.length > 1 ? `${heads.length} branches moved` : 'Moved');
}

function deleteSelection() {
  const heads = topLevel(selIds()).filter(id => id !== doc().root);
  if (!heads.length) return toast('The central idea stays');
  pushUndo();
  const fallback = N(heads[0]).parent;
  heads.forEach(removeNode);
  clearMarked();
  UI.selected = (fallback && N(fallback)) ? fallback : null;
  save(); render();
  toast(heads.length > 1 ? `Deleted ${heads.length} branches` : 'Deleted');
}

function detachSelection() {
  const heads = topLevel(selIds()).filter(id => id !== doc().root && N(id).parent);
  if (!heads.length) return toast('Nothing here has a parent to leave');
  pushUndo();
  heads.forEach(id => {
    const n = N(id), p = N(n.parent);
    if (p) p.children = p.children.filter(c => c !== id);
    n.parent = null;
    const pos = P[id] || { x: 0, y: 0 };
    n.x = pos.x; n.y = pos.y;
  });
  save(); render();
  toast(heads.length > 1 ? `${heads.length} branches detached` : 'Detached — drag it onto a node to attach it again');
}

/* styling applies to every node in the selection, not just the heads */
function styleSelection(apply) {
  const ids = selIds();
  if (!ids.length) return;
  pushUndo();
  ids.forEach(id => { const n = N(id); if (n) apply(n, id); });
  save(); render();
}

function foldSelection(collapse) {
  const ids = selIds().filter(id => N(id) && N(id).children.length);
  if (!ids.length) return toast('Nothing here has children to fold');
  pushUndo();
  ids.forEach(id => { N(id).collapsed = collapse; });
  save(); render();
}

function copySelection() {
  const heads = topLevel(selIds());
  if (!heads.length) return;
  const d = doc(), nodes = {};
  heads.forEach(h => [h, ...descendants(h)].forEach(x => { nodes[x] = JSON.parse(JSON.stringify(d.nodes[x])); }));
  clipboard = { roots: heads.slice(), root: heads[0], nodes };
  toast(heads.length > 1 ? `Copied ${heads.length} branches` : 'Copied');
}

function duplicateSelection() {
  const heads = topLevel(selIds()).filter(id => N(id).parent);
  if (!heads.length) return toast('The central idea cannot be duplicated');
  copySelection();
  pushUndo();
  const made = [];
  heads.forEach(h => {
    const into = N(h).parent;
    const before = new Set(N(into).children);
    pasteOne(h, into, false);
    N(into).children.forEach(c => { if (!before.has(c)) made.push(c); });
  });
  setMarked(made);
  save(); render();
  toast(made.length > 1 ? `Duplicated ${made.length} branches` : 'Duplicated');
}

function markSelectionDone(done) {
  const ids = topLevel(selIds()).filter(id => id !== doc().root);
  if (!ids.length) return;
  pushUndo();
  ids.forEach(id => setDone(id, done));
  UI.showTasks = true;
  save(); render();
}

/* ---------------------------- text editing ------------------------- */
function readText(el) {
  const t = (el.innerText != null) ? el.innerText : el.textContent;
  return (t || '');
}
/* Set while a node is open for editing, so the text can be rescued from
   outside this closure — on pagehide, on the app being backgrounded, or
   anywhere else the element might vanish without a blur. */
let commitEditor = null;

function editNode(id) {
  closeLinkPopover();
  if (editing === id) return;
  const el = $(`#nodes .node[data-id="${id}"] .txt`) || $(`#nodes [data-txt="${id}"]`) || $(`#outline [data-txt="${id}"]`);
  if (!el) return;
  const node0 = N(id);
  if (!node0) return;

  const wasText = node0.text || '';
  const startedBlank = !wasText.trim();

  editing = id;
  const wrap = el.closest('.node');
  if (wrap) wrap.classList.add('editing');
  /* an empty node shows a muted placeholder: clear it so the caret starts
     on nothing rather than on the word "Untitled" */
  if (el.classList.contains('is-untitled')) { el.textContent = ''; el.classList.remove('is-untitled'); }
  el.contentEditable = 'true';
  el.dataset.editing = '1';
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);

  /* The model is the record, not the DOM. Every keystroke lands in the
     node immediately, so text cannot be lost when the element goes away
     without a blur — a phone keyboard dismissed by a system gesture, the
     browser backgrounded and reclaimed, a tab closed mid-word. */
  const liveCommit = () => {
    const node = N(id);
    if (!node) return false;
    const t = readText(el).replace(/\s+$/, '');
    if (node.text === t) return false;
    node.text = t;
    if (id === doc().root) doc().name = t || 'Untitled';
    return true;
  };
  let liveTimer = null;
  const onInput = () => {
    if (!liveCommit()) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(save, 350);   // to disk shortly after, not per keystroke
  };
  commitEditor = () => { clearTimeout(liveTimer); if (liveCommit()) persistNow(); };

  const done = commit => {
    clearTimeout(liveTimer);
    commitEditor = null;
    el.removeEventListener('blur', onBlur);
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('input', onInput);
    const text = readText(el).replace(/\s+$/, '');
    editing = null;
    const node = N(id);

    if (!commit) {
      /* Escape means "forget this edit". A node that was blank when the
         edit began and is blank still was a mis-tap, so it goes; anything
         else is put back the way it was. */
      if (node) {
        if (startedBlank && !node.children.length && node.parent) {
          const parent = node.parent;
          removeNode(id);
          UI.selected = parent;
          save(); render();
          return;
        }
        node.text = wasText;
        if (id === doc().root) doc().name = wasText || 'Untitled';
      }
      save(); render();
      return;
    }

    /* Committing keeps the node even when it is still empty: tapping away
       should never cost you a node you deliberately made. It renders as a
       muted "Untitled" until you name it. */
    if (node) {
      node.text = text;
      if (id === doc().root) doc().name = text || 'Untitled';
      save();
    }
    render();
  };

  const onBlur = () => done(true);
  const onKey = e => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(true); }
    else if (e.key === 'Escape') { e.preventDefault(); done(false); }
    else if (e.key === 'Tab') { e.preventDefault(); done(true); newChild(id); }
  };
  el.addEventListener('blur', onBlur);
  el.addEventListener('keydown', onKey);
  el.addEventListener('input', onInput);
  setTimeout(keepEditVisible, 220);
}

function newChild(id) {
  pushUndo();
  const n = addChild(id, '');
  UI.selected = n.id;
  save(); render(); editNode(n.id);
}
function newSibling(id) {
  pushUndo();
  const n = addSibling(id, '');
  UI.selected = n.id;
  save(); render(); editNode(n.id);
}
function deleteSelected() {
  const id = UI.selected;
  if (!id || id === doc().root) return toast('The central idea stays');
  pushUndo();
  const p = N(id).parent;
  removeNode(id);
  UI.selected = p;
  save(); render();
}

function doAct(act) {
  const id = UI.selected;
  if (!id || !N(id)) return;
  if (act === 'child') newChild(id);
  else if (act === 'sibling') newSibling(id);
  else if (act === 'fold') { N(id).collapsed = !N(id).collapsed; save(); render(); }
  else if (act === 'connect') {
    connectFrom = connectFrom ? null : id;
    if (connectFrom) toast('Now tap the other node');
    render();
  }
  else if (act === 'delete') deleteSelected();
  else { UI.inspector = true; render(); }
}

/* When a phone keyboard opens it covers the bottom of the screen. Nudge the
   canvas so the node being typed into stays in the visible strip. */
function keepEditVisible() {
  if (!editing || UI.view !== 'map') return;
  const vv = window.visualViewport;
  if (!vv) return;
  const el = document.querySelector(`.node[data-id="${editing}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const visibleBottom = vv.offsetTop + vv.height;
  const margin = 28;
  if (r.bottom > visibleBottom - margin) {
    cam().y -= (r.bottom - (visibleBottom - margin));
    applyCam();
  } else if (r.top < vv.offsetTop + margin) {
    cam().y += (vv.offsetTop + margin - r.top);
    applyCam();
  }
}

/* ----------------------------- keyboard ---------------------------- */
function keySetup() {
  document.addEventListener('keydown', e => {
    if (editing) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); markAll(); render(); return; }
    if (mod && e.key.toLowerCase() === 'c' && UI.selected) { e.preventDefault(); multi() ? copySelection() : copyBranch(UI.selected); return; }
    if (mod && e.key.toLowerCase() === 'v' && UI.selected) { e.preventDefault(); pasteBranch(UI.selected); return; }
    if (mod && e.key.toLowerCase() === 'd' && UI.selected) { e.preventDefault(); multi() ? duplicateSelection() : duplicateNode(UI.selected); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSide(); fitAfterResize(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setSide('wide'); $('#search').focus(); return; }
    if (e.key === '/') { e.preventDefault(); setSide('wide'); $('#search').focus(); return; }
    if (e.key === 'Escape') {
      if ($('#ctx')) { closeContextMenu(); return; }
      if (moveInto) { moveInto = false; render(); return; }
      if (marked.size) { clearMarked(); render(); return; }
      if ($('#linkPop')) { closeLinkPopover(); return; }
      if (connectFrom) { connectFrom = null; render(); }
      else if (UI.focusMode) { UI.focusMode = false; render(); }
      else if (UI.highlightTag) { UI.highlightTag = null; render(); }
      else { UI.selected = null; render(); }
      return;
    }
    const id = UI.selected;
    if (!id) return;
    if (e.key === 'Tab') { e.preventDefault(); newChild(id); }
    else if (e.key === 'Enter') { e.preventDefault(); newSibling(id); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); multi() ? deleteSelection() : deleteSelected(); }
    else if (e.key === 'F2') { e.preventDefault(); editNode(id); }
    else if (e.key === ' ' && multi()) {
      e.preventDefault();
      const anyOpen = selIds().some(x => N(x).children.length && !N(x).collapsed);
      foldSelection(anyOpen);
    }
    else if (e.key === ' ') {
      e.preventDefault();
      if (N(id).children.length) { N(id).collapsed = !N(id).collapsed; save(); render(); }
      else editNode(id);
    }
    else if (e.key.startsWith('Arrow')) { e.preventDefault(); navigate(e.key); }
  });
}
function navigate(key) {
  const id = UI.selected, n = N(id);
  let next = null;
  if (key === 'ArrowLeft') next = n.parent;
  else if (key === 'ArrowRight') next = visKids(n)[0];
  else {
    const p = n.parent && N(n.parent);
    if (p) {
      const sibs = visKids(p), i = sibs.indexOf(id);
      next = key === 'ArrowUp' ? sibs[i - 1] : sibs[i + 1];
    }
  }
  if (next) { clearMarked(); UI.selected = next; render(); }
}

/* =====================================================================
   OUTLINE VIEW
   ===================================================================== */
function renderOutline() {
  taskMemo = {};
  const d = doc(), host = $('#outline');
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'ol-wrap';
  wrap.appendChild(olNode(d.root, 0));
  const floats = floatsOf();
  if (floats.length) {
    const lbl = document.createElement('div');
    lbl.className = 'ol-section';
    lbl.textContent = floats.length === 1 ? 'Detached branch' : 'Detached branches';
    wrap.appendChild(lbl);
    floats.forEach(f => wrap.appendChild(olNode(f.id, 0)));
  }
  host.appendChild(wrap);
}
function olNode(id, lvl) {
  const d = doc(), n = N(id), box = document.createElement('div');
  const linked = !!(n.url && n.url.trim());
  box.className = 'ol-lvl' + lvl;

  const row = document.createElement('div');
  row.className = 'ol-row' + (id === UI.selected ? ' is-sel' : '');

  const chev = document.createElement('span');
  chev.className = 'ol-chev';
  chev.textContent = n.children.length ? (n.collapsed ? '▶' : '▼') : '';
  chev.addEventListener('click', () => { n.collapsed = !n.collapsed; save(); render(); });
  row.appendChild(chev);

  if (UI.showTasks && id !== d.root) {
    const st = taskState(id);
    const t = document.createElement('span');
    t.className = 'n-task ' + (st === 'done' ? 'done' : st === 'part' ? 'part' : '');
    t.style.setProperty('--nc', colorOf(id));
    t.textContent = st === 'done' ? '✓' : '';
    t.addEventListener('click', () => { pushUndo(); setDone(id, st !== 'done'); save(); render(); });
    row.appendChild(t);
  } else {
    const b = document.createElement('span');
    b.className = 'ol-bullet'; b.style.background = colorOf(id);
    row.appendChild(b);
  }

  const txt = document.createElement('div');
  txt.className = 'ol-txt' + (linked ? ' has-link' : '');
  txt.dataset.txt = id;
  txt.textContent = (n.emoji ? n.emoji + ' ' : '') + (n.text || 'Untitled');
  txt.addEventListener('click', () => { UI.selected = id; render(); });
  txt.addEventListener('dblclick', () => editOutline(id, txt));
  row.appendChild(txt);

  const linkBtn = document.createElement('button');
  linkBtn.type = 'button';
  linkBtn.className = 'ol-link-ic' + (linked ? ' has-url' : '');
  linkBtn.title = linked ? 'Edit link' : 'Add link';
  linkBtn.setAttribute('aria-label', linked ? 'Edit link' : 'Add link');
  linkBtn.textContent = linked ? '↗' : '🔗';
  linkBtn.addEventListener('click', e => {
    e.stopPropagation();
    const r = linkBtn.getBoundingClientRect();
    openLinkPopover(id, r.left, r.bottom + 6);
  });
  row.appendChild(linkBtn);

  n.tags.forEach(tid => {
    const tag = d.tags.find(t => t.id === tid); if (!tag) return;
    const c = document.createElement('span');
    c.className = 'ol-chip';
    c.style.background = tag.color + '22'; c.style.color = tag.color;
    c.textContent = tag.name;
    row.appendChild(c);
  });

  box.appendChild(row);
  if (UI.showNotes && n.note.trim()) {
    const nt = document.createElement('div');
    nt.className = 'ol-note'; nt.textContent = n.note;
    box.appendChild(nt);
  }
  const kids = visKids(n);
  if (kids.length) {
    const k = document.createElement('div');
    k.className = 'ol-kids';
    kids.forEach(c => k.appendChild(olNode(c, lvl + 1)));
    box.appendChild(k);
  }
  return box;
}
function editOutline(id, el) {
  editing = id;
  el.contentEditable = 'true';
  el.dataset.editing = '1';
  el.textContent = N(id).text;
  el.focus();
  const done = commit => {
    el.removeEventListener('blur', onBlur);
    el.removeEventListener('keydown', onKey);
    const t = readText(el).trim();
    editing = null;
    if (commit) { N(id).text = t; save(); }
    render();
  };
  const onBlur = () => done(true);
  const onKey = e => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(true); newSibling(id); }
    else if (e.key === 'Escape') { e.preventDefault(); done(false); }
    else if (e.key === 'Tab') { e.preventDefault(); done(true); newChild(id); }
  };
  el.addEventListener('blur', onBlur);
  el.addEventListener('keydown', onKey);
}

/* =====================================================================
   INSPECTOR
   ===================================================================== */
const PANEL_TABS = [
  ['actions', 'Actions', '<svg viewBox="0 0 20 20" class="ic"><circle cx="5" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="15" cy="10" r="1.3"/></svg>'],
  ['style', 'Style', '<svg viewBox="0 0 20 20" class="ic"><path d="M6 13c-1.5 0-2.5 1-2.5 3 2.5 0 3.5-1 3.5-2"/><path d="M8 14l7.5-7.5a1.8 1.8 0 00-2.5-2.5L5.5 11.5"/></svg>'],
  ['note', 'Note', '<svg viewBox="0 0 20 20" class="ic"><rect x="4" y="3" width="12" height="14" rx="2"/><path d="M7 7h6M7 10h6M7 13h4"/></svg>'],
  ['media', 'Media', '<svg viewBox="0 0 20 20" class="ic"><rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.4"/><path d="M4 14l4-4 3.5 3.5L14 11l2 2"/></svg>'],
  ['tags', 'Tags', '<svg viewBox="0 0 20 20" class="ic"><path d="M3 8.5V4h4.5l8.5 8.5-4.5 4.5L3 8.5z"/><circle cx="6.6" cy="6.6" r="1.1"/></svg>']
];

function renderInspector() {
  if (!UI.inspector) return;
  const body = $('#inspBody'), id = UI.selected;
  body.innerHTML = '';
  if (!id || !N(id)) {
    $('#inspTitle').textContent = 'Document';
    body.appendChild(panelDoc());
    return;
  }
  $('#inspTitle').textContent = multi() ? `${marked.size} nodes` : (N(id).text ? N(id).text.slice(0, 24) : 'Node');
  body.appendChild(tabRow('insp'));
  body.appendChild(buildPanel(UI.inspTab || 'style', id));
}

function tabRow(where) {
  const row = document.createElement('div');
  row.className = 'tab-row';
  const active = where === 'insp' ? (UI.inspTab || 'style') : UI.sheetTab;
  PANEL_TABS.forEach(([k, label, icon]) => {
    const b = document.createElement('button');
    b.className = 'tab-btn' + (active === k ? ' is-on' : '');
    b.innerHTML = icon;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => {
      if (where === 'insp') UI.inspTab = k;
      else UI.sheetTab = (UI.sheetTab === k ? null : k);
      save(); render();
    });
    row.appendChild(b);
  });
  return row;
}

function buildPanel(tab, id) {
  const wrap = document.createElement('div');
  const fn = { actions: panelActions, style: panelStyle, note: panelNote, media: panelMedia, tags: panelTags }[tab] || panelStyle;
  fn(id, wrap);
  return wrap;
}

/* ------------------------------ panels ----------------------------- */
function panelActions(id, w) {
  const d = doc(), n = N(id), isRoot = id === d.root;

  if (multi()) {
    const heads = topLevel(selIds());
    const lead = document.createElement('div');
    lead.className = 'help';
    lead.style.margin = '0 0 12px';
    lead.textContent = `${marked.size} nodes selected, in ${heads.length} branch${heads.length === 1 ? '' : 'es'}.`;
    w.appendChild(lead);
    w.appendChild(group('Selection', rowOf([
      chipBtn('Move into…', () => armMoveInto()),
      chipBtn('Detach', () => detachSelection()),
      chipBtn('Fold', () => foldSelection(true)),
      chipBtn('Unfold', () => foldSelection(false)),
      chipBtn('Mark done', () => markSelectionDone(true)),
      chipBtn('Copy', () => copySelection()),
      chipBtn('Duplicate', () => duplicateSelection()),
      chipBtn('Clear selection', () => { clearMarked(); render(); }),
      chipBtn('Delete', () => deleteSelection(), false, true)
    ])));
    return;
  }
  w.appendChild(group('Edit', rowOf([
    chipBtn('Edit title', () => { UI.inspector = UI.inspector && window.innerWidth > 900; render(); editNode(id); }),
    chipBtn('Add child', () => newChild(id)),
    chipBtn('Add sibling', () => newSibling(id)),
    chipBtn('New parent', () => createParent(id))
  ])));

  const st = taskState(id);
  w.appendChild(group('Node', rowOf([
    chipBtn(st === 'done' ? 'Done' : 'Add task', () => { pushUndo(); setDone(id, st !== 'done'); UI.showTasks = true; save(); render(); }, st === 'done'),
    chipBtn(n.collapsed ? 'Unfold' : 'Fold', () => { N(id).collapsed = !N(id).collapsed; save(); render(); }),
    chipBtn('Create connection', () => doAct('connect'), !!connectFrom),
    chipBtn('Sort children A–Z', () => sortChildren(id)),
    n.parent && !isRoot ? chipBtn('Detach', () => detachNode(id)) : null,
    !n.parent && !isRoot ? chipBtn('Attach to centre', () => attachToRoot(id)) : null
  ])));

  w.appendChild(group('Clipboard', rowOf([
    chipBtn('Cut', () => cutBranch(id)),
    chipBtn('Copy', () => copyBranch(id)),
    chipBtn('Paste into', () => pasteBranch(id)),
    chipBtn('Duplicate', () => duplicateNode(id)),
    chipBtn('Delete', () => deleteSelected(), false, true)
  ])));

  /* links out: to another document, or to a web address */
  const links = document.createElement('div');
  const sel = document.createElement('select');
  sel.className = 'f-sel';
  sel.innerHTML = '<option value="">No linked document</option>' +
    S.order.filter(x => x !== d.id).map(x => `<option value="${x}">${escapeHtml(S.docs[x].name)}</option>`).join('');
  sel.value = n.link || '';
  sel.addEventListener('change', () => { pushUndo(); n.link = sel.value || null; save(); render(); });
  links.appendChild(sel);

  const url = document.createElement('input');
  url.className = 'f-input';
  url.style.marginTop = '6px';
  url.placeholder = 'Web address, e.g. gsi.gov.in';
  url.value = n.url || '';
  url.addEventListener('change', () => { pushUndo(); n.url = url.value.trim(); save(); render(); });
  links.appendChild(url);
  w.appendChild(group('Links', links));

  if (isRoot) {
    const note = document.createElement('div');
    note.className = 'help';
    note.textContent = 'This is the central idea. It cannot be deleted, cut or given a parent.';
    w.appendChild(note);
  }
}

function panelStyle(id, w) {
  const d = doc(), n = N(id);
  /* with several nodes held, every control here acts on all of them */
  const put = (key, v) => styleSelection(x => { x[key] = v; });

  if (multi()) {
    const note = document.createElement('div');
    note.className = 'help';
    note.style.margin = '0 0 12px';
    note.textContent = `Applies to all ${marked.size} selected nodes.`;
    w.appendChild(note);
  }

  w.appendChild(group('Shape', rowOf(SHAPES.map(([v, label]) =>
    chipBtn(label, () => put('shape', v), n.shape === v)))));
  w.appendChild(group('Border', rowOf([1, 2, 4, 6].map(v =>
    chipBtn(v + ' pt', () => put('border', v), n.border === v)))));
  w.appendChild(group('Branch line', rowOf([['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']].map(([v, l]) =>
    chipBtn(l, () => put('lineStyle', v), n.lineStyle === v)))));

  const colors = document.createElement('div');
  colors.className = 'row';
  [null, ...PALETTE, ROOT_COLOR].forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch' + (n.color === c ? ' is-on' : '');
    b.style.background = c || 'transparent';
    b.style.boxShadow = c ? 'none' : 'inset 0 0 0 2px var(--line)';
    b.title = c ? c : 'Inherit from branch';
    b.setAttribute('aria-label', c ? 'Colour ' + c : 'Inherit colour from branch');
    b.addEventListener('click', () => put('color', c));
    colors.appendChild(b);
  });
  w.appendChild(group('Colour', colors));

  w.appendChild(group('Whole map', rowOf([
    ...[['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['compact', 'Compact'], ['radial', 'Radial'], ['manual', 'Manual']]
      .map(([v, l]) => chipBtn(l, () => {
        pushUndo();
        if (v === 'manual') pinAll();
        else Object.values(d.nodes).forEach(x => { x.x = null; x.y = null; });
        d.layout = v; save(); render();
      }, d.layout === v))
  ])));
  w.appendChild(group('Branch shape', rowOf([['curved', 'Curved'], ['straight', 'Straight'], ['elbow', 'Elbow']].map(([v, l]) =>
    chipBtn(l, () => { pushUndo(); d.branch = v; save(); render(); }, (d.branch || 'curved') === v)))));
}

function panelNote(id, w) {
  const n = N(id);
  const ta = document.createElement('textarea');
  ta.className = 'f-area';
  ta.placeholder = 'Tap to enter notes. They stay hidden behind a small marker until you open them.';
  ta.value = n.note;
  ta.addEventListener('input', () => { n.note = ta.value; save(); });
  ta.addEventListener('blur', () => render());
  w.appendChild(group('Note', ta));
}

function panelMedia(id, w) {
  const n = N(id);
  const grid = document.createElement('div');
  grid.className = 'emoji-grid';
  EMOJI.forEach(em => {
    const b = document.createElement('button');
    b.textContent = em;
    b.setAttribute('aria-label', 'Sticker ' + em);
    b.addEventListener('click', () => { pushUndo(); n.emoji = n.emoji === em ? '' : em; save(); render(); });
    grid.appendChild(b);
  });
  w.appendChild(group('Stickers and emoji', grid));

  const media = document.createElement('div');
  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'image/*'; file.className = 'f-input';
  file.addEventListener('change', () => {
    const f = file.files[0]; if (!f) return;
    shrinkImage(f, dataUrl => { pushUndo(); setNodeImage(n, dataUrl); save(); render(); });
  });
  media.appendChild(file);
  if (imageSrcFor(n)) media.appendChild(chipBtn('Remove image', () => { pushUndo(); clearNodeImage(n); save(); render(); }));
  w.appendChild(group('Image', media));
}

function panelTags(id, w) {
  w.appendChild(group('Tags', tagManager(id)));
  const h = document.createElement('div');
  h.className = 'help';
  h.textContent = 'The sun beside a tag spotlights everything carrying it and fades the rest.';
  w.appendChild(h);
}

function panelDoc() {
  const d = doc(), w = document.createElement('div');
  w.appendChild(group('Layout', selectRow(
    [['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['compact', 'Compact'], ['radial', 'Radial'], ['manual', 'Manual']],
    d.layout, v => {
      pushUndo();
      if (v === 'manual') pinAll();
      else Object.values(d.nodes).forEach(n => { n.x = null; n.y = null; });
      d.layout = v; save(); render();
    })));
  w.appendChild(group('Branch shape', selectRow(
    [['curved', 'Curved'], ['straight', 'Straight'], ['elbow', 'Elbow']],
    d.branch || 'curved', v => { pushUndo(); d.branch = v; save(); render(); })));
  w.appendChild(group('Tags', tagManager()));
  w.appendChild(group('Connections', connectionList()));
  const stats = document.createElement('div');
  stats.className = 'help';
  stats.textContent = `${Object.keys(d.nodes).length} nodes · ${d.connections.length} connections · ` +
    `${Object.values(d.nodes).filter(n => n.note.trim()).length} notes`;
  w.appendChild(group('This document', stats));
  w.appendChild(group(' ', rowOf([
    chipBtn('Duplicate document', () => duplicateDoc(d.id)),
    chipBtn('Export this document', () => exportDoc(d))
  ])));
  return w;
}

/* ===================================================================
   Node sheet — the touch counterpart of the inspector. It sits over the
   bottom of the canvas whenever a node is selected: a row of tabs, the
   chosen panel, and the clipboard row underneath.
   =================================================================== */
function renderSheet() {
  const host = $('#sheet');
  if (!host) return;
  const narrow = window.innerWidth <= 900;
  const id = UI.selected;
  if (!narrow || !id || !N(id) || UI.view !== 'map' || editing) {
    host.hidden = true; host.innerHTML = '';
    return;
  }
  host.hidden = false;
  host.innerHTML = '';
  host.classList.toggle('open', !!UI.sheetTab);

  const head = document.createElement('div');
  head.className = 'sheet-head';

  const quick = (label, aria, fn, cls) => {
    const b = document.createElement('button');
    b.className = 'tab-btn ' + (cls || '');
    b.innerHTML = label;
    b.title = aria;
    b.setAttribute('aria-label', aria);
    b.addEventListener('click', fn);
    return b;
  };
  head.appendChild(quick('<svg viewBox="0 0 20 20" class="ic"><rect x="2" y="6.5" width="7" height="7" rx="2"/><path d="M9 10h2.5"/><path d="M14.5 7.5v5M12 10h5"/></svg>',
    'Add child', () => newChild(id), 'accent'));
  head.appendChild(tabRow('sheet'));
  head.appendChild(quick('<svg viewBox="0 0 20 20" class="ic"><path d="M8 12l4-4"/><path d="M11.5 5.5a3 3 0 014.2 4.2l-1.8 1.8"/><path d="M8.5 14.5a3 3 0 01-4.2-4.2l1.8-1.8"/></svg>',
    'Create connection', () => doAct('connect'), connectFrom ? 'is-on' : ''));
  host.appendChild(head);

  if (!UI.sheetTab) return;

  const title = document.createElement('div');
  title.className = 'sheet-title';
  title.textContent = N(id).text || 'Untitled node';
  host.appendChild(title);

  const body = document.createElement('div');
  body.className = 'sheet-body';
  body.appendChild(buildPanel(UI.sheetTab, id));
  host.appendChild(body);

  const foot = document.createElement('div');
  foot.className = 'sheet-foot';
  const fb = (icon, aria, fn, danger) => {
    const b = document.createElement('button');
    b.innerHTML = icon;
    b.title = aria;
    b.setAttribute('aria-label', aria);
    if (danger) b.className = 'danger-btn';
    b.addEventListener('click', fn);
    return b;
  };
  foot.appendChild(fb('<svg viewBox="0 0 20 20" class="ic"><path d="M7 7L4 10l3 3"/><path d="M4 10h7.5a3.5 3.5 0 010 7H9"/></svg>', 'Undo', undo));
  foot.appendChild(fb('<svg viewBox="0 0 20 20" class="ic"><circle cx="5.5" cy="14.5" r="2"/><circle cx="5.5" cy="5.5" r="2"/><path d="M7 6l9 8M7 14l9-8"/></svg>', 'Cut', () => cutBranch(id)));
  foot.appendChild(fb('<svg viewBox="0 0 20 20" class="ic"><rect x="7" y="3" width="10" height="12" rx="2"/><path d="M13 17H5a2 2 0 01-2-2V7"/></svg>', 'Copy', () => copyBranch(id)));
  foot.appendChild(fb('<svg viewBox="0 0 20 20" class="ic"><rect x="3" y="3" width="9" height="9" rx="2"/><rect x="8" y="8" width="9" height="9" rx="2"/></svg>', 'Duplicate', () => duplicateNode(id)));
  foot.appendChild(fb('<svg viewBox="0 0 20 20" class="ic"><path d="M4 6h12"/><path d="M8 6V4h4v2"/><path d="M6 6l.8 10h6.4L14 6"/></svg>', 'Delete', () => deleteSelected(), true));
  foot.appendChild(fb('<svg viewBox="0 0 20 20" class="ic"><path d="M13 7l3 3-3 3"/><path d="M16 10H8.5a3.5 3.5 0 000 7H11"/></svg>', 'Redo', redo));
  host.appendChild(foot);
}

function group(title, child) {
  const g = document.createElement('div');
  g.className = 'grp';
  if (title.trim()) { const h = document.createElement('h4'); h.textContent = title; g.appendChild(h); }
  g.appendChild(child);
  return g;
}
function rowOf(children) {
  const r = document.createElement('div');
  r.className = 'row';
  children.filter(Boolean).forEach(c => r.appendChild(c));
  return r;
}
function chipBtn(label, fn, on, danger) {
  const b = document.createElement('button');
  b.className = 'chip' + (on ? ' is-on' : '') + (danger ? ' danger' : '');
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}
function selectRow(opts, val, fn) {
  return rowOf(opts.map(([v, l]) => chipBtn(l, () => fn(v), v === val)));
}
function tagManager(nodeId) {
  const d = doc(), wrap = document.createElement('div');
  d.tags.forEach(t => {
    const count = Object.values(d.nodes).filter(n => n.tags.includes(t.id)).length;
    const line = document.createElement('div');
    const onNode = nodeId && N(nodeId).tags.includes(t.id);
    line.className = 'tag-line' + (onNode ? ' is-on' : '');
    line.innerHTML = `<span class="sw" style="background:${t.color}"></span>
      <span class="nm"></span><span class="ct">${count}</span>
      <span class="hl" title="Highlight this tag">${UI.highlightTag === t.id ? '☀' : '☼'}</span>`;
    line.querySelector('.nm').textContent = t.name;
    line.querySelector('.hl').addEventListener('click', e => {
      e.stopPropagation();
      UI.highlightTag = UI.highlightTag === t.id ? null : t.id;
      save(); render();
    });
    line.addEventListener('click', () => {
      if (!nodeId) { UI.highlightTag = UI.highlightTag === t.id ? null : t.id; save(); render(); return; }
      pushUndo();
      const n = N(nodeId);
      n.tags = n.tags.includes(t.id) ? n.tags.filter(x => x !== t.id) : [...n.tags, t.id];
      save(); render();
    });
    wrap.appendChild(line);
  });
  const inp = document.createElement('input');
  inp.className = 'f-input';
  inp.placeholder = 'Add new tag…';
  inp.style.marginTop = '6px';
  inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !inp.value.trim()) return;
    pushUndo();
    const t = { id: uid(), name: inp.value.trim(), color: TAG_COLORS[d.tags.length % TAG_COLORS.length] };
    d.tags.push(t);
    if (nodeId) N(nodeId).tags.push(t.id);
    inp.value = ''; save(); render();
  });
  wrap.appendChild(inp);
  return wrap;
}
function connectionList() {
  const d = doc(), wrap = document.createElement('div');
  if (!d.connections.length) {
    const p = document.createElement('div');
    p.className = 'help';
    p.textContent = 'Pick the link tool in the toolbar, then tap two nodes to draw a relationship that ignores the hierarchy.';
    wrap.appendChild(p);
    return wrap;
  }
  d.connections.forEach(c => {
    const line = document.createElement('div');
    line.className = 'tag-line';
    const a = d.nodes[c.a], b = d.nodes[c.b];
    line.innerHTML = `<span class="nm"></span><span class="ct">✕</span>`;
    line.querySelector('.nm').textContent = `${a ? a.text : '?'} → ${b ? b.text : '?'}`;
    line.addEventListener('click', () => {
      pushUndo();
      d.connections = d.connections.filter(x => x.id !== c.id);
      save(); render();
    });
    wrap.appendChild(line);
  });
  return wrap;
}
function shrinkImage(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 360, scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* =====================================================================
   SEARCH
   ===================================================================== */
/* On a map of a few hundred nodes a list of results is not enough: you
   need to see where the matches are. The query is kept so render() can
   mark every matching node, and Enter walks through them. */
let findQuery = '';
let findRing = [];      // matching ids in the open document, in map order
let findAt = -1;

function nodeMatches(n, q) {
  return ((n.text || '') + ' ' + (n.note || '')).toLowerCase().includes(q);
}
function refreshFindRing() {
  findRing = [];
  if (!findQuery) return;
  const d = doc();
  if (!d) return;
  const walk = id => {
    const n = d.nodes[id];
    if (!n) return;
    if (nodeMatches(n, findQuery)) findRing.push(id);
    kidsOf(n).forEach(walk);
  };
  rootsOf().forEach(walk);
}
function jumpToNextMatch(back) {
  if (!findRing.length) return;
  findAt = (findAt + (back ? -1 : 1) + findRing.length) % findRing.length;
  const id = findRing[findAt];
  ancestors(id).forEach(a => { if (N(a)) N(a).collapsed = false; });
  UI.selected = id;
  save(); render(); centerOn(id);
  toast(`Match ${findAt + 1} of ${findRing.length}`);
}

function runSearch(q) {
  const box = $('#searchResults');
  q = q.trim().toLowerCase();
  findQuery = q;
  findAt = -1;
  refreshFindRing();
  if (!q) { box.hidden = true; box.innerHTML = ''; render(); return; }
  render();   // light up the matches on the map
  const hits = [];
  S.order.forEach(did => {
    const d = S.docs[did];
    Object.values(d.nodes).forEach(n => {
      const hay = (n.text + ' ' + n.note).toLowerCase();
      if (hay.includes(q)) hits.push({ did, id: n.id, text: n.text, docName: d.name });
    });
  });
  box.hidden = false;
  box.innerHTML = '';
  if (!hits.length) {
    box.innerHTML = '<div class="sr-empty">No matches. Try a shorter word.</div>';
    return;
  }
  if (findRing.length) {
    const head = document.createElement('div');
    head.className = 'sr-head';
    head.textContent = `${findRing.length} in this map — press Enter to step through them`;
    box.appendChild(head);
  }
  hits.slice(0, 40).forEach(h => {
    const el = document.createElement('div');
    el.className = 'sr';
    el.innerHTML = '<b></b><span></span>';
    el.querySelector('b').textContent = h.text || 'Untitled';
    el.querySelector('span').textContent = h.docName;
    el.addEventListener('click', () => {
      S.active = h.did;
      UI.selected = h.id;
      ancestors(h.id).forEach(a => { S.docs[h.did].nodes[a].collapsed = false; });
      if (window.innerWidth <= 900 && sideMode() === 'wide') setSide('hidden', { quiet: true });
      save(); render(); centerOn(h.id);
    });
    box.appendChild(el);
  });
}
function centerOn(id) {
  if (UI.view !== 'map' || !P[id]) return;
  const c = cam(), el = $('#canvas'), p = P[id];
  c.x = el.clientWidth / 2 - (p.x + p.w / 2) * c.s;
  c.y = el.clientHeight / 2 - (p.y + p.h / 2) * c.s;
  applyCam(); save();
}

/* =====================================================================
   IMPORT / EXPORT
   ===================================================================== */
function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function envelope(docs, order) {
  return JSON.stringify({
    app: 'MindNote', kind: 'mindnote', schemaVersion: SCHEMA,
    exportedAt: new Date().toISOString(), docs, order
  }, null, 2);
}
function exportAll() {
  download('mindnote-' + stamp() + '.json', envelope(embedImagesForExport(S.docs), S.order));
  toast('Exported every document');
}
function exportDoc(d) {
  download(d.name.replace(/[^\w\- ]/g, '') + '-' + stamp() + '.json', envelope(embedImagesForExport({ [d.id]: d }), [d.id]));
  toast('Exported this document');
}
function importJSON(text) {
  try {
    const data = JSON.parse(text);
    if ((data.schemaVersion || 1) > SCHEMA) {
      toast('That file was written by a newer version of MindNote');
      return;
    }
    if (!data.docs || !data.order) throw new Error('bad file');
    data.order.forEach(id => {
      const d = data.docs[id]; if (!d) return;
      const fresh = JSON.parse(JSON.stringify(d));
      fresh.id = uid();
      S.docs[fresh.id] = fresh;
      S.order.push(fresh.id);
    });
    migrateLegacyImages();
    save(); render();
    toast('Import finished');
  } catch (e) {
    toast('That file is not a MindNote export');
  }
}

/* =====================================================================
   Data and backup panel
   ===================================================================== */
function bytesText(n) {
  const kb = n / 1024;
  return kb < 1024 ? kb.toFixed(1) + ' KB' : (kb / 1024).toFixed(2) + ' MB';
}
function agoText(ms) {
  if (!ms) return 'unknown';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return mins < 1 ? 'just now' : mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hrs / 24);
  return days + (days === 1 ? ' day ago' : ' days ago');
}
async function openDataPanel() {
  const host = $('#modal');
  host.hidden = false;
  host.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'modal-card';
  const size = JSON.stringify({ docs: S.docs, order: S.order }).length;
  const images = Object.values(S.docs).reduce((a, d) =>
    a + Object.values(d.nodes).filter(n => n.imageId || n.image).length, 0);

  card.innerHTML = `
    <div class="modal-head">
      <h3>Data and backup</h3>
      <button class="icon-btn" data-close aria-label="Close">✕</button>
    </div>
    <div class="modal-body">
      <p class="modal-p">Your documents live on this device and, when sync is on, on the server too.
      A file you keep yourself is the copy no service can take away.</p>
      <div class="modal-actions">
        <button class="solid-btn" data-export>Save a backup file</button>
        <button class="chip" data-import>Open a backup file</button>
      </div>
      <p class="modal-note" id="dataSize"></p>
      <div class="modal-label" style="margin-top:18px">Automatic backups on this device</div>
      <p class="modal-note" style="margin-top:0">Taken about once a day, ten kept. They live in this
      browser, so they survive a mistake but not a lost phone — keep a file as well.</p>
      <div id="backupList"><p class="modal-note">Looking…</p></div>
    </div>`;
  host.appendChild(card);

  const warn = size > 5 * 1024 * 1024 ? ' — getting large; images are the usual cause'
    : size > 2 * 1024 * 1024 ? ' — comfortable, but worth watching' : '';
  card.querySelector('#dataSize').textContent =
    `${Object.keys(S.docs).length} documents · ${bytesText(size)}` +
    (images ? ` · ${images} embedded image${images === 1 ? '' : 's'}` : '') + warn;

  const close = () => { host.hidden = true; host.innerHTML = ''; };
  host.addEventListener('click', e => { if (e.target === host) close(); });
  card.querySelector('[data-close]').addEventListener('click', close);
  card.querySelector('[data-export]').addEventListener('click', exportAll);
  card.querySelector('[data-import]').addEventListener('click', () => $('#importFile').click());

  const list = card.querySelector('#backupList');
  const keys = await listBackups();
  if (!keys.length) {
    list.innerHTML = '<p class="modal-note">None yet. The first is taken shortly after you start using the app.</p>';
    return;
  }
  list.innerHTML = '';
  for (const key of keys) {
    let raw = null;
    try { raw = await idbGet(key); } catch (e) { }
    const info = describeBackup(key, raw);
    const row = document.createElement('div');
    row.className = 'ver-row';
    row.innerHTML = `<span class="ver-when"></span>
      <span class="ver-meta">${info.documents} docs · ${info.nodes} nodes · ${bytesText(info.bytes)}</span>
      <button class="chip" data-save>Save</button>
      <button class="chip" data-put>Restore</button>`;
    row.querySelector('.ver-when').textContent = agoText(info.when);
    row.querySelector('[data-save]').addEventListener('click', () => {
      download('mindnote-backup-' + new Date(info.when).toISOString().slice(0, 10) + '.json', raw || '');
    });
    row.querySelector('[data-put]').addEventListener('click', async () => {
      const names = info.names.length ? '\n\nDocuments: ' + info.names.join(', ') : '';
      if (!confirm('Put the backup from ' + agoText(info.when) + ' back?' + names +
        '\n\nWhat is on this device now will be replaced. You can undo it straight afterwards.')) return;
      close();
      await restoreBackup(key);
    });
    list.appendChild(row);
  }
}

/* =====================================================================
   SEED CONTENT
   ===================================================================== */
function seed() {
  const d = mkDoc('What is MindNote?');
  const rootN = d.nodes[d.root];
  rootN.emoji = '💡';
  const branches = {
    'Writing': ['Articles', 'Thesis', 'Notes', 'Blogs', 'Essays'],
    'Organizing': ['Structure and relationships', 'Outline and framework design', 'Organisational charts'],
    'More': ['Expressing creativity', 'Team building', 'Family trees'],
    'Capturing ideas': ['Problem solving', 'Projects', 'Brainstorming'],
    'Planning': ['Shopping lists', 'Field checklists', 'Project management', 'Weekly goals', 'Homework'],
    'Note taking': ['Courses', 'Presentations', 'Lectures', 'Studying']
  };
  const emojis = { 'Writing': '📝', 'Organizing': '📐', 'More': '🧪', 'Capturing ideas': '🧠', 'Planning': '📅', 'Note taking': '🖍' };
  Object.entries(branches).forEach(([b, kids]) => {
    const bn = (() => { const n = mkNode(d.root, b); d.nodes[n.id] = n; rootN.children.push(n.id); return n; })();
    bn.emoji = emojis[b] || '';
    kids.forEach(k => { const n = mkNode(bn.id, k); d.nodes[n.id] = n; bn.children.push(n.id); });
  });
  const planning = Object.values(d.nodes).find(n => n.text === 'Planning');
  ['Shopping lists', 'Field checklists', 'Project management'].forEach(t => {
    const n = Object.values(d.nodes).find(x => x.text === t); if (n) n.done = true;
  });
  const note = Object.values(d.nodes).find(n => n.text === 'Brainstorming');
  if (note) note.note = 'Notes hold the detail a node should not carry: sources, numbers, reminders. They stay hidden until you open them.';
  d.tags = [
    { id: 'tg1', name: 'Confirmed', color: TAG_COLORS[0] },
    { id: 'tg2', name: 'In progress', color: TAG_COLORS[1] },
    { id: 'tg3', name: 'More research needed', color: TAG_COLORS[2] }
  ];
  if (planning) planning.tags = ['tg2'];
  const org = Object.values(d.nodes).find(n => n.text === 'Organizing');
  if (org && note) d.connections.push({ id: uid(), a: org.id, b: note.id });

  const d2 = mkDoc('Field trip checklist');
  const r2 = d2.nodes[d2.root];
  r2.emoji = '🧭';
  const groups = {
    'Clothing': ['Field jacket', 'Boots', 'Sun hat', 'Rain cover'],
    'Equipment': ['Hammer', 'Hand lens', 'Compass and clinometer', 'GPS unit', 'Sample bags'],
    'Miscellaneous': ['Notebook', 'Water', 'First aid kit', 'Permits']
  };
  Object.entries(groups).forEach(([g, items]) => {
    const gn = mkNode(d2.root, g); d2.nodes[gn.id] = gn; r2.children.push(gn.id);
    items.forEach((it, i) => {
      const n = mkNode(gn.id, it); n.done = i < 2; d2.nodes[n.id] = n; gn.children.push(n.id);
    });
  });

  d.demo = true; d2.demo = true;      // sample maps: replaced when joining an existing workspace
  S.docs = { [d.id]: d, [d2.id]: d2 };
  S.order = [d.id, d2.id];
  S.active = d.id;
  UI.showTasks = false;
  primeSigs();                        // opening them is not an edit, so they stay samples
}

/* =====================================================================
   WIRING
   ===================================================================== */
function wire() {
  /* the hamburger cycles the panel; the chevron and the scrim put it away */
  $('#openSidebar').addEventListener('click', () => { toggleSide(); fitAfterResize(); });
  $('#brandBtn').addEventListener('click', () => { toggleSide(); fitAfterResize(); });
  $('#closeSidebar').addEventListener('click', () => {
    setSide(railAllowed() ? 'rail' : 'hidden'); fitAfterResize();
  });
  $('#scrim').addEventListener('click', () => {
    if (sideMode() === 'wide') setSide('hidden');
    UI.inspector = false; save(); render();
  });
  $('#inspectorBtn').addEventListener('click', () => { UI.inspector = !UI.inspector; save(); render(); });
  $('#closeInspector').addEventListener('click', () => { UI.inspector = false; save(); render(); });

  const newDocument = () => {
    const d = mkDoc('Untitled map');
    d.updated = Date.now();
    S.docs[d.id] = d; S.order.push(d.id);
    openDoc(d.id);
    if (window.MNSync) window.MNSync.touch();
    toast('New document ready');
  };
  $('#newDoc').addEventListener('click', newDocument);

  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);

  /* rail-mode counterparts of the controls the wide panel shows as text */
  $('#railSearch').addEventListener('click', () => {
    setSide('wide'); fitAfterResize(); $('#search').focus();
  });
  $('#railTheme').addEventListener('click', () => cycleTheme());
  $('#railData').addEventListener('click', openDataPanel);
  $$('.rail-btn, #newDoc, .sync-strip').forEach(b => {
    const label = b.dataset.tip;
    if (!label) return;
    b.addEventListener('pointerenter', e => {
      if (e.pointerType === 'mouse') sideTip(b, label);
    });
    b.addEventListener('pointerleave', hideSideTip);
  });

  $('#selClear').addEventListener('click', () => { clearMarked(); render(); });
  $('#selMenu').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    openContextMenu(r.left, r.bottom + 6, UI.selected);
  });

  wireResizer();
  wireSwipe();

  $('#docTitle').addEventListener('blur', () => {
    const t = $('#docTitle').textContent.trim() || 'Untitled';
    doc().name = t;
    N(doc().root).text = t;
    save(); render();
  });
  $('#docTitle').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#docTitle').blur(); }
  });

  $$('.seg-btn').forEach(b => b.addEventListener('click', () => {
    const needsFit = !doc().cam;
    UI.view = b.dataset.view; save(); render();
    if (UI.view === 'map' && needsFit) fitView();
  }));

  $$('.tool[data-toggle]').forEach(b => b.addEventListener('click', () => {
    UI[b.dataset.toggle] = !UI[b.dataset.toggle];
    if (b.dataset.toggle === 'focusMode' && UI.focusMode && !UI.selected) toast('Pick a node to focus on');
    save(); render();
  }));

  $('#foldBtn').addEventListener('click', () => {
    const d = doc();
    const anyOpen = Object.values(d.nodes).some(n => n.children.length && !n.collapsed && n.id !== d.root);
    Object.values(d.nodes).forEach(n => { if (n.id !== d.root && n.children.length) n.collapsed = anyOpen; });
    save(); render();
  });

  $('#layoutSel').addEventListener('change', e => {
    pushUndo();
    if (e.target.value === 'manual') pinAll();
    else Object.values(doc().nodes).forEach(n => { n.x = null; n.y = null; });
    doc().layout = e.target.value;
    save(); render();
  });

  $('#zoomIn').addEventListener('click', () => zoomBy(1.15));
  $('#zoomOut').addEventListener('click', () => zoomBy(0.87));
  $('#zoomFit').addEventListener('click', fitView);

  $('#search').addEventListener('input', e => runSearch(e.target.value));
  $('#search').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); jumpToNextMatch(e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); e.target.value = ''; runSearch(''); e.target.blur(); }
  });

  cycleTheme = () => {
    UI.theme = UI.theme === 'light' ? 'dark' : UI.theme === 'dark' ? 'system' : 'light';
    save(); render();
  };
  $('#themeBtn').addEventListener('click', cycleTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => { if (UI.theme === 'system') render(); };
    mq.addEventListener ? mq.addEventListener('change', onScheme) : mq.addListener(onScheme);
  }
  $('#dataBtn').addEventListener('click', openDataPanel);
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => importJSON(r.result);
    r.readAsText(f);
    e.target.value = '';
  });

  $('#acts').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) doAct(b.dataset.act);
  });

  let rt = null;
  const onViewportChange = () => {
    hideSideTip();
    /* unfolding the Fold makes the rail viable again; the stored
       preference is untouched, only what fits is recomputed */
    applySidebar();
    syncScrim();
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (editing) keepEditVisible();
      else render();
    }, 140);
  };
  window.addEventListener('resize', () => { closeContextMenu(); onViewportChange(); });
  window.addEventListener('orientationchange', onViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (editing) setTimeout(keepEditVisible, 60); else onViewportChange();
    });
  }

  /* A browser can discard a page without warning — a tab closed, a phone
     switching apps, the OS reclaiming memory. Commit whatever is being
     typed and write it out synchronously before that happens. These are
     the events that actually fire on mobile; beforeunload often does not. */
  const flushNow = () => {
    try { if (commitEditor) commitEditor(); } catch (e) { }
    persistNow();
  };
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { });
    });
  }

  canvasSetup();
  keySetup();
}

/* =====================================================================
   Interface used by sync.js. Nothing else reaches into the app state.
   ===================================================================== */
window.MNApp = {
  /* everything worth sending, minus each device's own camera position */
  snapshot(exclude) {
    if (!booted) return { docs: {}, order: [], deleted: {} };
    const skip = new Set(exclude || []);
    const docs = {};
    for (const [id, d] of Object.entries(S.docs)) {
      if (skip.has(id)) continue;
      const copy = Object.assign({}, d);
      delete copy.cam;
      docs[id] = copy;
    }
    return { docs, order: S.order.filter(id => !skip.has(id)), deleted: deletedDocs };
  },

  /* the starter maps, while they are still untouched */
  sampleIds: () => Object.values(S.docs).filter(d => d.demo).map(d => d.id),

  /* take the server's version of the workspace; returns false if it was skipped */
  merge(state) {
    if (!booted) return false;          // never overwrite a workspace that has not loaded
    if (editing) return false;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return false;
    if (!state || !state.docs || !Object.keys(state.docs).length) return false;

    const cams = {};
    for (const [id, d] of Object.entries(S.docs)) if (d.cam) cams[id] = d.cam;

    const docs = {};
    for (const [id, d] of Object.entries(state.docs)) {
      if (cams[id]) d.cam = cams[id];
      docs[id] = d;
    }
    S.docs = docs;
    S.order = (state.order || []).filter(id => docs[id]);
    for (const id of Object.keys(docs)) if (!S.order.includes(id)) S.order.push(id);
    deletedDocs = state.deleted || {};
    migrateLegacyImages();
    preloadImageCache();

    if (!S.docs[S.active]) { S.active = S.order[0]; UI.selected = null; }
    if (UI.selected && S.docs[S.active] && !S.docs[S.active].nodes[UI.selected]) UI.selected = null;
    primeSigs();
    persistNow();
    render();
    return true;
  },

  isBusy: () => !!editing,
  isReady: () => booted && !schemaBlocked,
  toast: msg => toast(msg)
};

/* ------------------------------- start ----------------------------- */
let booted = false;

/* Paint from whatever is on hand immediately, then reconcile with
   IndexedDB a moment later. Waiting on the database before the first
   frame would make the app feel slow to open. */
function boot() {
  const raw = localRaw();
  if (!hydrate(raw)) {
    if (schemaBlocked) {
      document.body.innerHTML =
        '<div style="font-family:Manrope,system-ui,sans-serif;max-width:34rem;margin:18vh auto;padding:0 24px;line-height:1.6">' +
        '<h1 style="font-size:20px;margin:0 0 12px">This device holds newer MindNote data</h1>' +
        '<p style="color:#555">The saved workspace was written by a later version of MindNote than the one loaded here, ' +
        'so it has been left untouched rather than read incorrectly.</p>' +
        '<p style="color:#555">Reload the page to pick up the current version. If that does not help, the copy on this ' +
        'device is safe and can be exported once the newer version loads.</p></div>';
      return;
    }
    seed();
  }
  booted = true;

  sideLoad();
  if (window.innerWidth <= 900 && side.mode === 'wide') side.mode = 'hidden';
  applySidebar();
  UI.selected = null;
  pendingFit = !doc().cam;

  wire();
  render();
  if (pendingFit) { pendingFit = false; fitView(); }

  reconcile(raw);
}

async function reconcile(raw) {
  if (schemaBlocked) return;
  let fromIdb = null;
  try { fromIdb = await idbGet(); } catch (e) { fromIdb = null; }

  /* The larger store wins when it holds something newer — which happens
     when the workspace outgrew localStorage, or that copy was cleared. */
  if (fromIdb && fromIdb !== raw && savedAtOf(fromIdb) > savedAtOf(raw)) {
    if (hydrate(fromIdb) && !editing) {
      UI.selected = null;
      render();
    }
  }
  persistNow();                        // carries an old copy across into IndexedDB

  if (navigator.storage && navigator.storage.persist) {
    try {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    } catch (e) { /* the browser may simply not offer this */ }
  }

  document.dispatchEvent(new Event('mindnote:ready'));

  preloadImageCache();
  maybeBackup();
  setInterval(maybeBackup, 60 * 60 * 1000);
}

boot();
