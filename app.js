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
/* ---------------------------- node markers -------------------------
   A marker is a small badge in its own slot on the node, apart from the
   text: a flag for "needs action now", a star for "important", a clock
   for "waiting on someone". A node can carry several.

   They are plain Unicode emoji, which means they cost nothing to store,
   sync to every device as text, render natively on Windows, Android and
   iOS, and can be pasted in from anywhere. Each line below is the emoji
   followed by the words that should find it. */
const MARKER_GROUPS = [
  ['Priority and status',
   '🚩 flag urgent priority action now|⭐ star important favourite key|🔥 fire hot urgent burning|' +
   '⚠️ warning caution risk careful|❗ exclamation important urgent critical|❓ question unknown query unclear|' +
   '✅ check done complete finished approved|❌ cross no cancel rejected wrong|⏳ hourglass waiting pending|' +
   '⏰ alarm deadline time due|🔒 lock locked blocked private|🔓 unlock open unblocked|' +
   '📌 pin pinned fixed note|🛑 stop halt blocked|🚧 construction progress wip ongoing|' +
   '🔔 bell reminder alert notify|💤 sleep dormant paused later|🏁 finish goal milestone end|' +
   '🆕 new fresh recent|🔝 top priority highest'],
  ['People and roles',
   '👤 person individual user|👥 people group team pair|🧑‍💼 officer official staff employee|' +
   '👨‍🔬 scientist researcher geologist|👩‍🔬 scientist researcher woman|🤝 handshake agreement deal partner|' +
   '🗣️ speaking voice spokesperson|👔 tie manager director senior|🧑‍⚖️ judge authority approval|' +
   '👮 police officer enforcement|🧑‍🏫 teacher trainer instructor|👷 worker engineer site'],
  ['Work and documents',
   '📝 memo note write draft|📄 page document file paper|📋 clipboard list checklist form|' +
   '📁 folder directory collection|🗂️ dividers index archive category|📊 chart bar graph data statistics|' +
   '📈 increase growth up trend rising|📉 decrease down falling decline|📅 calendar date schedule|' +
   '🗓️ calendar spiral planner|💼 briefcase business work case|📎 paperclip attach attachment|' +
   '✏️ pencil edit draft write|🖊️ pen sign signature|📚 books reference library study|' +
   '📰 news newspaper article press|📥 inbox received incoming|📤 outbox sent outgoing|' +
   '🧾 receipt invoice bill statement|📜 scroll order notification circular|' +
   '🏷️ label tag name|🖇️ clips linked documents|📒 ledger register record|🗒️ notepad jotting'],
  ['Communication',
   '📧 email mail message|✉️ envelope letter post|📞 phone call telephone|📱 mobile phone cell|' +
   '💬 speech comment discussion chat|📢 announce megaphone broadcast|🔊 loud sound volume|' +
   '📡 satellite transmission signal remote|🛰️ satellite orbit remote sensing'],
  ['Places and organisation',
   '🏢 office building headquarters chq|🏛️ government ministry institution|🏦 bank finance treasury|' +
   '🏭 factory plant industry|🏫 school college institute training|🏠 home house base|' +
   '🌍 world globe earth global|🗺️ map atlas region area|📍 location place marker spot|' +
   '🧭 compass direction navigation bearing|🚩 flag region zone'],
  ['Field and science',
   '🪨 rock stone boulder sample|⛏️ pick mining excavation|🔨 hammer field tool|' +
   '🏔️ mountain peak terrain relief|🌋 volcano volcanic igneous|🏜️ desert arid terrain|' +
   '🔬 microscope lab analysis petrology|🧪 test tube chemical assay geochemical|' +
   '⚗️ alembic laboratory experiment|🔭 telescope survey observation|💎 gem mineral crystal ore|' +
   '🧲 magnet magnetic geophysics|💧 water hydro drop fluid|🌊 wave sea marine offshore|' +
   '🪵 core log drill borehole|📐 ruler measure survey angle|📏 scale measure length|' +
   '🧮 calculate count tally abacus|⚡ power energy electric geophysics'],
  ['Money and approval',
   '💰 money budget funds cost|💵 cash rupee dollar payment|💳 card payment expenditure|' +
   '🪙 coin small amount token|🧮 estimate calculation costing|✍️ sign approve signature|' +
   '🖋️ signature approval sign off|⚖️ balance justice legal compare|🎯 target goal objective aim'],
  ['Technology',
   '💻 laptop computer machine|🖥️ desktop monitor workstation|🗄️ cabinet storage repository archive|' +
   '💾 save disk backup store|🖧 network link connection|☁️ cloud server hosting online|' +
   '⚙️ gear settings config process|🛠️ tools maintenance fix build|🔧 wrench repair adjust|' +
   '🔑 key access credential password|🛡️ shield security protection safe|🔗 link url reference|' +
   '🧰 toolbox kit resources|🐛 bug defect issue error|🔄 refresh sync update cycle'],
  ['Transport and logistics',
   '🚚 truck delivery transport dispatch|🚗 car vehicle travel|✈️ plane flight travel air|' +
   '🚂 train rail transport|🚢 ship vessel sea cargo|📦 package parcel consignment lot|' +
   '🛻 pickup field vehicle|🏍️ bike motorcycle'],
  ['Thinking and ideas',
   '💡 idea insight bulb suggestion|🧠 brain think analysis concept|🔍 search find investigate review|' +
   '🧩 piece part component fit|🎓 education qualification degree|🏆 trophy award achievement win|' +
   '🥇 medal first rank best|🚀 rocket launch start accelerate|🌱 seed start new growth|' +
   '♻️ recycle reuse rework revise|🔁 repeat loop recurring|📌 remember keep note']
];

/* flattened: [emoji, searchable words] */
const MARKER_INDEX = MARKER_GROUPS.flatMap(([group, spec]) =>
  spec.split('|').map(entry => {
    const parts = entry.trim().split(/\s+/);
    return { emoji: parts[0], words: parts.slice(1).join(' '), group };
  })
);
/* the handful worth a single tap, in the order a person reaches for them */
const QUICK_MARKERS = ['🚩', '⭐', '🔥', '⚠️', '⏰', '✅', '❓', '📌', '🔒', '🚧'];

/* A node written before markers existed carries a single n.emoji. It is
   read as the first marker and rewritten on the next change, so nothing
   already saved is lost and no migration pass is needed. */
function markersOf(n) {
  if (Array.isArray(n.markers)) return n.markers;
  return n.emoji ? [n.emoji] : [];
}
function setMarkers(n, list) {
  n.markers = list.slice(0, 6);        // more than a few stops being a signal
  n.emoji = n.markers[0] || '';        // kept so an older client still shows one
}
function toggleMarker(n, em) {
  const cur = markersOf(n);
  setMarkers(n, cur.includes(em) ? cur.filter(x => x !== em) : [...cur, em]);
}

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
let idbHandle = null, idbBroken = false, idbOpening = null;
let schemaBlocked = false;

const idbForget = () => { idbHandle = null; };

function idbOpen() {
  if (idbBroken || typeof indexedDB === 'undefined') return Promise.reject(new Error('no indexeddb'));
  if (idbHandle) return Promise.resolve(idbHandle);
  if (idbOpening) return idbOpening;      // one open at a time, however many callers
  idbOpening = new Promise((res, rej) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { idbBroken = true; return rej(e); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => {
      idbHandle = req.result;
      /* A connection can be closed underneath us — another tab upgrading
         the database, or the browser reclaiming storage. Keeping the dead
         handle would turn every later save into a silent failure until the
         page was reloaded, so it is dropped and the next call opens a
         fresh one. */
      idbHandle.onclose = idbForget;
      idbHandle.onversionchange = () => {
        try { idbHandle.close(); } catch (e) { }
        idbForget();
      };
      res(idbHandle);
    };
    req.onerror = () => { idbBroken = true; rej(req.error); };
    /* 'blocked' only means another tab still holds an older version open.
       That passes, so it is not a reason to abandon the database for the
       rest of the session. */
    req.onblocked = () => rej(new Error('blocked'));
  });
  idbOpening.catch(() => { }).then(() => { idbOpening = null; });
  return idbOpening;
}
/* Runs one transaction. If the connection turns out to have died, forgets
   it and tries the same work once more on a fresh one. */
function idbWork(run, retried) {
  return idbOpen().then(db => new Promise((res, rej) => run(db, res, rej))).catch(err => {
    const dead = err && (err.name === 'InvalidStateError' || err.name === 'TransactionInactiveError');
    if (retried || !dead) throw err;
    idbForget();
    return idbWork(run, true);
  });
}
function idbGet(key) {
  return idbWork((db, res, rej) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const r = tx.objectStore(DB_STORE).get(key || DB_KEY);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}
function idbSet(value, key) {
  return idbWork((db, res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key || DB_KEY);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('aborted'));
  });
}
function idbDel(key) {
  return idbWork((db, res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}
function idbKeys() {
  return idbWork((db, res, rej) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const r = tx.objectStore(DB_STORE).getAllKeys();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
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
  const pending = [];
  Object.values(S.docs).forEach(d => {
    Object.values(d.nodes).forEach(n => {
      if (!n.image) return;                 // nothing inline left to move
      const id = n.imageId || uid();
      const bytes = n.image;
      imageCache[id] = bytes;
      if (n.imageId !== id) { n.imageId = id; changed = true; }
      /* The inline copy is the only copy until the database has the bytes.
         Clearing it first and then failing the write would lose the
         picture for good, so it stays put until the write has actually
         happened — and a node that still carries both is simply retried
         the next time the workspace is opened. */
      pending.push(
        idbSet(bytes, IMAGE_PREFIX + id)
          .then(() => { if (n.image === bytes) { n.image = ''; return true; } return false; })
          .catch(() => false)
      );
    });
  });
  if (pending.length) {
    Promise.all(pending).then(done => { if (done.some(Boolean)) save(); }).catch(() => { });
  }
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
  if (n.imageId && imageCache[n.imageId]) return imageCache[n.imageId];
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
let selConn = null;         // the connection currently selected, if any
let wayDrag = null;         // a waypoint being dragged
let linkDrag = null;        // dragging from one node to another to connect
let dragOffset = null;      // {ids:Set, dx, dy}
let undoStack = [];
let redoStack = [];
let clipboard = null;
let lastTap = { id: null, t: 0 };
let lastConnTap = { id: null, t: 0 };   // for double-tap to name a connection
let lastWayTap = { id: null, t: 0 };    // for double-tap to straighten one
let deletedDocs = {};       // id -> time it was deleted, so sync does not resurrect it
let contentSigs = {};       // id -> fingerprint, so panning does not count as an edit
let nodeSigs = {};          // id -> { nodeId: fingerprint }, for the per-node stamps below
let workspaceSig = '';      // which documents exist, so deletes and imports are noticed too
let hoverId = null;         // node the pointer is over, for the + handles

/* ------------------------- model constructors ---------------------- */
function mkNode(parent, text) {
  return {
    id: uid(), parent, text: text || '', children: [], collapsed: false,
    shape: 'rounded', color: null, border: 2, lineStyle: 'solid',
    note: '', tags: [], done: false, emoji: '', markers: [], image: '', imageId: '', link: null,
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

/* ------------------- per-node change stamps -------------------------
   The server has to combine this device's copy of a document with
   whatever another device sent. If it could only choose between the two
   copies whole, a line typed here and a line typed on the phone within
   the same couple of minutes would end with one of them quietly thrown
   away. So every node carries its own last-changed time in n.m and the
   server merges node by node.

   The stamps are worked out here, by comparing each node with its
   fingerprint from the previous save, rather than at the fifty-odd places
   a node can be altered — one of those would eventually be forgotten, and
   a missing stamp means lost work. d.gone records when each node was
   deleted, so a node removed here is not posted back by a device that
   still has it. */
const GONE_KEEP = 500;                            // tombstones kept per document
const GONE_MAX_AGE = 60 * 24 * 60 * 60 * 1000;    // and only for sixty days

function nodeSig(n) {
  const copy = Object.assign({}, n);
  delete copy.m;                      // the stamp itself is not content
  return JSON.stringify(copy);
}
/* One pass gives both the per-node fingerprints and the document one. */
function docFingerprint(d) {
  const sigs = {};
  for (const [id, n] of Object.entries(d.nodes)) sigs[id] = nodeSig(n);
  const body = Object.keys(sigs).sort().map(id => id + ':' + sigs[id]).join('\n');
  const head = JSON.stringify({ m: d.name, c: d.connections, t: d.tags, l: d.layout, r: d.root });
  return { sigs, sig: head + '\n' + body };
}
function contentSig(d) { return docFingerprint(d).sig; }

/* Keep the tombstone list from growing without end. */
function pruneGone(d, now) {
  const gone = d.gone;
  if (!gone) return;
  const ids = Object.keys(gone);
  if (!ids.length) { delete d.gone; return; }
  const keep = ids
    .filter(id => now - (gone[id] || 0) < GONE_MAX_AGE)
    .sort((a, b) => (gone[b] || 0) - (gone[a] || 0))
    .slice(0, GONE_KEEP);
  if (keep.length === ids.length) return;
  if (!keep.length) { delete d.gone; return; }
  const next = {};
  for (const id of keep) next[id] = gone[id];
  d.gone = next;
}
/* Stamp what changed since the last save, and record what went away. */
function stampChanges(d, sigs) {
  const prev = nodeSigs[d.id];
  nodeSigs[d.id] = sigs;
  if (!prev) return false;            // first save of a document just loaded
  const now = Date.now();
  let touched = false;                // reported back for callers that want it
  for (const [id, s] of Object.entries(sigs)) {
    if (prev[id] === s) continue;
    d.nodes[id].m = now;
    touched = true;
  }
  const lost = Object.keys(prev).filter(id => !sigs[id]);
  if (lost.length) {
    const gone = d.gone || (d.gone = {});
    for (const id of lost) gone[id] = now;
    pruneGone(d, now);
    touched = true;
  }
  return touched;
}

/* ------------------- connection stamps and tombstones ----------------
   Connections get the same protection as nodes. Each carries c.m, the
   last time it was added or changed here, and d.conngone records when a
   connection was removed. The server keeps a connection only if it was
   touched after its removal, so a connection deleted on one device is not
   posted back by another device (or another open tab) that still has it,
   while one brought back with undo, which is stamped afresh, survives.
   Like the node stamps, these are worked out by comparing with the last
   save, so every way of removing a connection is covered. */
let connSigs = {};          // doc id -> { connection id: fingerprint }

const connAlive = (c, d) => !((((d && d.conngone) || {})[c.id] || 0) > (c.m || 0));

function connSigOf(c) {
  const copy = Object.assign({}, c);
  delete copy.m;
  return JSON.stringify(copy);
}
function connBaseline(d) {
  const sigs = {};
  for (const c of d.connections || []) sigs[c.id] = connSigOf(c);
  connSigs[d.id] = sigs;
}
function stampConns(d) {
  if (!d || !Array.isArray(d.connections)) return;
  const prev = connSigs[d.id];
  const now = Date.now();
  const sigs = {};
  for (const c of d.connections) sigs[c.id] = connSigOf(c);
  connSigs[d.id] = sigs;
  if (!prev) return;                  // first save of a document just loaded
  const gone = d.conngone || {};
  for (const c of d.connections) {
    if (prev[c.id] === sigs[c.id] && !gone[c.id]) continue;
    c.m = now;                        // new, changed, or brought back by undo
    delete gone[c.id];
  }
  for (const id of Object.keys(prev)) if (!sigs[id]) gone[id] = now;
  const ids = Object.keys(gone)
    .filter(id => now - (gone[id] || 0) < GONE_MAX_AGE)
    .sort((a, b) => gone[b] - gone[a])
    .slice(0, GONE_KEEP);
  if (!ids.length) { delete d.conngone; return; }
  const next = {};
  for (const id of ids) next[id] = gone[id];
  d.conngone = next;
}

function wsSig() {
  return S.order.join(',') + '|' + Object.keys(S.docs).sort().join(',') + '|' + Object.keys(deletedDocs).sort().join(',');
}
function primeSigs() {
  contentSigs = {};
  nodeSigs = {};
  connSigs = {};
  Object.values(S.docs).forEach(d => {
    const fp = docFingerprint(d);
    contentSigs[d.id] = fp.sig;
    nodeSigs[d.id] = fp.sigs;
    connBaseline(d);
  });
  workspaceSig = wsSig();
}
/* True from a change until it has been written out. Used so a tab that
   has changed nothing never writes its (possibly older) copy over what
   another tab has just saved. */
let persistPending = false;
function save() {
  const d = doc();
  let changed = false;
  persistPending = true;
  const ws = wsSig();
  if (ws !== workspaceSig) { workspaceSig = ws; changed = true; }
  if (d) {
    stampConns(d);
    const fp = docFingerprint(d);
    if (contentSigs[d.id] !== fp.sig) {
      contentSigs[d.id] = fp.sig;
      stampChanges(d, fp.sigs);
      d.updated = Date.now(); changed = true;
      delete d.demo;
    } else if (!nodeSigs[d.id]) {
      nodeSigs[d.id] = fp.sigs;
    }
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 250);
  if (changed && window.MNSync) window.MNSync.touch();
}
function persistNow() {
  clearTimeout(saveTimer);
  if (schemaBlocked) return;            // never write over data we do not understand
  persistPending = false;
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
      d.connections = (d.connections || []).filter(c => connAlive(c, d));
      d.tags = d.tags || [];
      Object.values(d.nodes).forEach(n => { n.tags = n.tags || []; });
      const fp = docFingerprint(d);
      contentSigs[d.id] = fp.sig;
      nodeSigs[d.id] = fp.sigs;
      connBaseline(d);
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
      n.emoji = ''; n.markers = []; n.image = ''; n.imageId = '';
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
  else if (connectFrom) $('#connectHint').textContent = 'Drag from one node to another, or tap one and then the other.';
  syncSelBar();
  $('#canvas').hidden = UI.view !== 'map';
  $('#zoombar').hidden = UI.view !== 'map';
  $('#outline').hidden = UI.view !== 'outline';
  syncScrim();

  renderDocList();
  if (UI.view === 'map') renderMap(); else renderOutline();
  /* after the map, so the bar can be placed against the drawn curve */
  if (!document.querySelector('#connBar .conn-input, #connBar .conn-note')) renderConnBar();
  renderInspector();
  renderSheet();
  if (notePopRefresh) notePopRefresh();
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
  S.active = id; UI.selected = null; connectFrom = null; selConn = null; clearMarked(); findAt = -1; refreshFindRing();
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
  lastVisible = visible;
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
  /* The small dot on the node's corner: drag it to another node to draw a
     connection, or click it and then click the other node. */
  const dot = document.createElement('button');
  dot.className = 'link-handle';
  dot.id = 'h-link';
  dot.dataset.linkfrom = '1';
  dot.dataset.label = 'Drag to connect';
  dot.title = 'Drag to another node to connect them';
  dot.setAttribute('aria-label', 'Connect this node to another');
  layer.appendChild(dot);
}
function positionHandles() {
  const kid = $('#h-child'), sib = $('#h-sibling'), dot = $('#h-link');
  if (!kid || !sib) return;
  const id = (hoverId && P[hoverId]) ? hoverId : ((UI.selected && P[UI.selected]) ? UI.selected : null);
  if (!id || editing || nodeDrag || connectFrom || linkDrag) {
    kid.classList.remove('show'); sib.classList.remove('show');
    if (dot) dot.classList.remove('show');
    return;
  }
  if (dot) {
    const q = P[id];
    dot.dataset.for = id;
    dot.style.setProperty('--hc', colorOf(id));
    dot.style.left = (q.x + q.w - 4) + 'px';
    dot.style.top = (q.y - 10) + 'px';
    dot.classList.add('show');
  }
  const d = doc(), p = P[id], vertical = d.layout === 'vertical', side = sideOf(id);
  kid.dataset.for = id; sib.dataset.for = id;

  /* child continues the branch outwards; sibling sits underneath, so the
     two can never be mistaken for one another */
  /* the child + stands a little way out from the node, tied to it by a
     short stub of the branch colour, as in MindNode */
  kid.style.setProperty('--hc', colorOf(id));
  if (vertical) {
    kid.dataset.dir = 'd';
    kid.style.left = (p.x + p.w / 2 - 11) + 'px';
    kid.style.top = (p.y + p.h + 12) + 'px';
    sib.style.left = (p.x + p.w - 8) + 'px';
    sib.style.top = (p.y + p.h / 2 - 11) + 'px';
  } else {
    kid.dataset.dir = side > 0 ? 'r' : 'l';
    kid.style.left = (side > 0 ? p.x + p.w + 12 : p.x - 34) + 'px';
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
  const marks = markersOf(n);
  if (UI.showImages && marks.length) {
    /* their own slot, so a flag reads as a flag and not as part of the
       sentence the node is making */
    const box = document.createElement('span');
    box.className = 'n-markers';
    marks.forEach(em => {
      const e = document.createElement('span');
      e.className = 'n-marker';
      e.textContent = em;
      box.appendChild(e);
    });
    head.appendChild(box);
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
  if (UI.showNotes && n.note.trim()) {
    /* a small page with lines on it: hovering shows the note, a click
       opens it beside the node */
    meta.push(`<span class="n-note-ic" data-note="${id}" role="button" aria-label="Open note">` +
      `<svg viewBox="0 0 18 18" aria-hidden="true"><rect class="pg" x="1.5" y="1.5" width="15" height="15" rx="3.5"/>` +
      `<path class="ln" d="M5.5 6h7M5.5 9h7M5.5 12h4.5"/></svg></span>`);
  }
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

  const tapered = !!d.taper;
  const depthMemo = {};
  const depthOf = id => {
    if (depthMemo[id] != null) return depthMemo[id];
    const n = d.nodes[id];
    return (depthMemo[id] = (!n || !n.parent || !d.nodes[n.parent]) ? 0 : depthOf(n.parent) + 1);
  };

  visible.forEach(id => {
    const n = N(id);
    if (!n.parent || !P[n.parent]) return;
    const a = box(n.parent), b = box(id);
    const dash = dashOf(n.lineStyle);
    const dim = isDimmed(id) || isDimmed(n.parent);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    /* A tapered branch is a filled shape rather than a stroked line, so it
       can be thick where it leaves the parent and thin where it arrives.
       A dashed or dotted line has no taper to give it, and an elbow has
       corners that a taper only makes untidy, so both keep their stroke. */
    const shape = tapered && !dash ? branchGeom(a, b) : null;
    if (shape) {
      path.setAttribute('d', taperPath(shape, branchWidth(depthOf(n.parent)), branchWidth(depthOf(id))));
      path.setAttribute('class', 'edge taper' + (dim ? ' dim' : ''));
      /* set as a style, not an attribute: the stylesheet's fill:none for
         ordinary branches would otherwise win and the shape would be
         drawn in nothing at all */
      path.style.fill = colorOf(id);
    } else {
      path.setAttribute('d', curve(a, b));
      path.setAttribute('class', 'edge' + (dim ? ' dim' : ''));
      path.setAttribute('stroke', colorOf(id));
      path.setAttribute('stroke-width', n.parent === d.root ? 3.6 : 2.6);
      if (dash) path.setAttribute('stroke-dasharray', dash);
    }
    eL.appendChild(path);
  });

  const SVG = 'http://www.w3.org/2000/svg';
  const mk = (tag, cls) => {
    const el = document.createElementNS(SVG, tag);
    el.setAttribute('class', cls);
    return el;
  };
  d.connections.forEach(c => {
    if (!connAlive(c, d)) return;
    if (!P[c.a] || !P[c.b]) return;
    const g = connGeom(c);
    const dAttr = connPath(g);
    const on = selConn === c.id;

    /* A two-pixel line is almost impossible to hit with a fingertip, so an
       invisible wide one is laid underneath to catch the tap. */
    const hit = mk('path', 'xlink-hit');
    hit.setAttribute('d', dAttr);
    hit.dataset.conn = c.id;
    if (c.note) {                         // hovering the line shows its note
      const tt = document.createElementNS(SVG, 'title');
      tt.textContent = c.note;
      hit.appendChild(tt);
    }
    lL.appendChild(hit);

    const p = mk('path', 'xlink' + (on ? ' is-on' : ''));
    p.setAttribute('d', dAttr);
    p.dataset.conn = c.id;
    lL.appendChild(p);

    const label = (c.title || '') + (c.note ? (c.title ? ' 📝' : '📝') : '');
    if (label) {
      const t = mk('text', 'xlink-title');
      t.setAttribute('x', g.at.x);
      t.setAttribute('y', g.at.y - (on ? 14 : 5));
      t.setAttribute('text-anchor', 'middle');
      t.textContent = label;
      t.dataset.conn = c.id;
      lL.appendChild(t);
    }

    if (on) {
      /* the waypoint: drag it to shape the curve, double-click to straighten */
      const grab = mk('circle', 'way-hit');
      grab.setAttribute('cx', g.at.x); grab.setAttribute('cy', g.at.y);
      grab.setAttribute('r', 17);
      grab.dataset.way = c.id;
      lL.appendChild(grab);

      const dot = mk('circle', 'way');
      dot.setAttribute('cx', g.at.x); dot.setAttribute('cy', g.at.y);
      dot.setAttribute('r', 6.5);
      dot.dataset.way = c.id;
      lL.appendChild(dot);
    }
  });
}
/* ======================= connections ===============================
   A connection is {id, a, b}, and once it has been shaped or named it
   also carries a title and a waypoint. The waypoint is stored as two
   fractions of the straight line between the two nodes — how far along
   it (slide) and how far out from it (bow) — rather than as a position
   on the canvas, so the curve keeps the shape you gave it as the nodes
   move around. A connection saved before any of this existed has
   neither, and simply draws with the gentle arc it always had.
   =================================================================== */
const CONN_BOW = 0.16;              // the arc a new connection is born with
const BOW_FLAT = 0.012;             // anything this straight counts as straight
const bowOf = c => (c.bow == null ? CONN_BOW : c.bow);
const slideOf = c => (c.slide == null ? 0 : c.slide);
const connIsStraight = c => Math.abs(bowOf(c)) < BOW_FLAT && Math.abs(slideOf(c)) < BOW_FLAT;

/* Everything needed to draw one connection, in world coordinates: the two
   ends, the control point, and the point on the curve the waypoint sits
   on — which for a quadratic is halfway between the chord's middle and
   the control point. */
function connGeom(c) {
  const a = box(c.a), b = box(c.b);
  const A = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const B = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;         // along the line
  const px = dy / len, py = -dx / len;        // across it
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const bow = bowOf(c), slide = slideOf(c);
  const ctrl = {
    x: mid.x + px * bow * len + ux * slide * len,
    y: mid.y + py * bow * len + uy * slide * len
  };
  const at = { x: (mid.x + ctrl.x) / 2, y: (mid.y + ctrl.y) / 2 };
  return { A, B, mid, ctrl, at, len, ux, uy, px, py };
}
const connPath = g => `M${g.A.x} ${g.A.y} Q${g.ctrl.x} ${g.ctrl.y} ${g.B.x} ${g.B.y}`;

/* Put the waypoint at a point on the canvas, and read back the two
   fractions that will reproduce it. */
function setConnWaypoint(c, world) {
  const g = connGeom(c);
  const cx = 2 * world.x - g.mid.x, cy = 2 * world.y - g.mid.y;
  const vx = cx - g.mid.x, vy = cy - g.mid.y;
  /* Neither direction is limited. A waypoint that stops following your
     finger feels broken, and an extreme shape is one you asked for and can
     undo with a double-click on the same handle. */
  c.bow = (vx * g.px + vy * g.py) / g.len;
  c.slide = (vx * g.ux + vy * g.uy) / g.len;
}
function straightenConn(c) { c.bow = 0; c.slide = 0; }

/* Begin shaping a connection. The offset between the pointer and the
   waypoint is kept for the whole drag, so grabbing the line anywhere along
   it moves the curve smoothly instead of snapping its middle under the
   pointer. */
function startWayDrag(c, e, fromLine) {
  const g = connGeom(c), w = toWorld(e.clientX, e.clientY);
  return { id: c.id, moved: false, fromLine, sx: e.clientX, sy: e.clientY,
           ox: g.at.x - w.x, oy: g.at.y - w.y };
}

/* ===================== tapered branches ============================
   A branch that thins as it goes, the way a twig does. The line is drawn
   as a filled shape instead of a stroke: the curve is walked from the
   parent to the child, and at each step a point is placed either side of
   it, further out at the start than at the end.
   =================================================================== */
const BRANCH_W0 = 7.4;        // the trunk, leaving the central idea
const BRANCH_W_MIN = 1.7;     // the thinnest a twig gets
function branchWidth(depth) {
  return Math.max(BRANCH_W_MIN, BRANCH_W0 * Math.pow(0.62, Math.max(0, depth)));
}

/* The same line curve() draws, as four points. Elbows have corners that
   this cannot follow, so they are left alone. */
function branchGeom(a, b) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  const kind = doc().branch || 'curved';
  if (kind === 'elbow') return null;
  let p0, p1, p2, p3;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const x1 = dx > 0 ? a.x + a.w : a.x, x2 = dx > 0 ? b.x : b.x + b.w;
    const m = (x1 + x2) / 2;
    p0 = { x: x1, y: ac.y }; p3 = { x: x2, y: bc.y };
    if (kind === 'straight') {
      p1 = { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
      p2 = { x: p0.x + (p3.x - p0.x) * 2 / 3, y: p0.y + (p3.y - p0.y) * 2 / 3 };
    } else {
      p1 = { x: m, y: ac.y }; p2 = { x: m, y: bc.y };
    }
  } else {
    const y1 = dy > 0 ? a.y + a.h : a.y, y2 = dy > 0 ? b.y : b.y + b.h;
    const m = (y1 + y2) / 2;
    p0 = { x: ac.x, y: y1 }; p3 = { x: bc.x, y: y2 };
    if (kind === 'straight') {
      p1 = { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 };
      p2 = { x: p0.x + (p3.x - p0.x) * 2 / 3, y: p0.y + (p3.y - p0.y) * 2 / 3 };
    } else {
      p1 = { x: ac.x, y: m }; p2 = { x: bc.x, y: m };
    }
  }
  return { p0, p1, p2, p3 };
}

const TAPER_STEPS = 16;
function taperPath(g, w0, w1) {
  const { p0, p1, p2, p3 } = g;
  const at = t => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
  };
  const slope = t => {
    const u = 1 - t;
    return {
      x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
      y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
    };
  };
  const near = [], far = [];
  for (let i = 0; i <= TAPER_STEPS; i++) {
    const t = i / TAPER_STEPS;
    const p = at(t), s = slope(t);
    const len = Math.hypot(s.x, s.y) || 1;
    /* across the line, half the width it should have at this point */
    const nx = -s.y / len, ny = s.x / len;
    const h = (w0 + (w1 - w0) * t) / 2;
    near.push((p.x + nx * h).toFixed(2) + ' ' + (p.y + ny * h).toFixed(2));
    far.push((p.x - nx * h).toFixed(2) + ' ' + (p.y - ny * h).toFixed(2));
  }
  far.reverse();
  return 'M' + near[0] + 'L' + near.slice(1).join('L') + 'L' + far.join('L') + 'Z';
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

/* Redraw just the lines. Shaping a connection moves nothing else, and a
   full redraw on every pointer move would make the drag feel heavy. */
let lastVisible = [];
function drawEdgesOnly() {
  if (UI.view !== 'map') return;
  drawEdges(lastVisible);
  const bar = document.getElementById('connBar');
  const live = selConn && theConn(selConn);
  if (bar && !bar.hidden && live) placeConnBar(bar, live);
}

/* The line that follows the pointer while a connection is being drawn. */
function drawLinkPreview(fromId, world) {
  const lL = $('#linkLayer');
  if (!lL || !P[fromId]) return;
  const a = box(fromId);
  const A = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  let p = lL.querySelector('.xlink-draft');
  if (!p) {
    p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('class', 'xlink-draft');
    lL.appendChild(p);
  }
  p.setAttribute('d', `M${A.x} ${A.y} L${world.x} ${world.y}`);
}
function clearLinkPreview() {
  const p = document.querySelector('#linkLayer .xlink-draft');
  if (p) p.remove();
  $$('#nodes .node.is-link-target').forEach(el => el.classList.remove('is-link-target'));
}

/* Where a point on the map sits on the screen. */
function toScreen(wx, wy) {
  const c = cam(), r = $('#canvas').getBoundingClientRect();
  return { x: r.left + c.x + wx * c.s, y: r.top + c.y + wy * c.s };
}

/* ------------------- the selected connection's bar -----------------
   A small bar that follows the selected connection, offering the few
   things worth doing to it. It lives on top of everything rather than
   inside the map, so it stays a comfortable size at any zoom. */
function connBarEl() {
  let el = document.getElementById('connBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'connBar';
    document.body.appendChild(el);
  }
  return el;
}
function hideConnBar() {
  const el = document.getElementById('connBar');
  if (el) { el.hidden = true; el.innerHTML = ''; el.classList.remove('is-note'); }
}
function theConn(id) { return doc().connections.find(c => c.id === id) || null; }

function renderConnBar() {
  const c = selConn && theConn(selConn);
  if (!c || UI.view !== 'map' || !P[c.a] || !P[c.b]) { hideConnBar(); return; }
  const el = connBarEl();
  el.hidden = false;
  el.innerHTML = '';
  el.classList.remove('is-note');

  const btn = (label, title, fn, cls) => {
    const b = document.createElement('button');
    b.className = 'conn-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', ev => { ev.stopPropagation(); fn(); });
    return b;
  };
  el.appendChild(btn(c.title ? 'Edit title' : 'Add title', 'Name this connection', () => editConnTitle(c.id)));
  el.appendChild(btn(c.note ? 'Edit note' : 'Add note',
    c.note ? 'Edit the note on this connection' : 'Add a note to this connection', () => editConnNote(c.id)));
  if (!connIsStraight(c)) el.appendChild(btn('Straighten', 'Make this connection straight', () => {
    pushUndo(); straightenConn(c); save(); render(); toast('Straightened');
  }));
  el.appendChild(btn('Remove', 'Remove this connection', () => removeConn(c.id), 'danger'));

  placeConnBar(el, c);
  armConnBar(el);
}
/* Keep the bar on the waypoint and on the screen — but clear of the
   finger that is selecting the connection. A touch lands with the
   fingertip below what it is pointing at, so the bar goes above. */
function placeConnBar(el, c) {
  const g = connGeom(c);
  const s = toScreen(g.at.x, g.at.y);
  const w = el.offsetWidth || 220, h = el.offsetHeight || 38;
  const pad = 8;
  const touch = matchMedia && matchMedia('(pointer:coarse)').matches;
  const gap = touch ? 46 : 22;
  const x = s.x - w / 2;
  let y = touch ? s.y - h - gap : s.y + gap;
  if (y < pad) y = s.y + gap;                               // no room above
  if (y + h + pad > window.innerHeight) y = s.y - h - gap;  // nor below
  el.style.left = clamp(x, pad, Math.max(pad, window.innerWidth - w - pad)) + 'px';
  el.style.top = clamp(y, pad, Math.max(pad, window.innerHeight - h - pad)) + 'px';
}

/* The bar appears under the very gesture that selected the connection, so
   for a moment the release of that tap would land on whichever button had
   just been put there — "Remove", as it happened. Nothing on it can be
   pressed until the hand that opened it has had time to lift. */
let connBarArm = null;
function armConnBar(el) {
  clearTimeout(connBarArm);
  el.style.pointerEvents = 'none';
  connBarArm = setTimeout(() => { el.style.pointerEvents = ''; }, 350);
}

/* Naming a connection. The field is placed on the connection itself so it
   is obvious what is being named. */
function editConnTitle(id) {
  const c = theConn(id);
  if (!c) return;
  selConn = id;
  const el = connBarEl();
  el.hidden = false;
  el.innerHTML = '';
  el.classList.remove('is-note');
  const input = document.createElement('input');
  input.className = 'conn-input';
  input.value = c.title || '';
  input.placeholder = 'Name this connection';
  input.setAttribute('aria-label', 'Connection title');
  el.appendChild(input);

  let done = false;
  const finish = keep => {
    if (done) return;
    done = true;
    const live = theConn(id);
    if (keep && live) {
      const text = input.value.trim();
      if ((live.title || '') !== text) {
        pushUndo();
        if (text) live.title = text; else delete live.title;
        save();
      }
    }
    hideConnBar();          // so the redraw puts the buttons back
    render();
  };
  input.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  placeConnBar(el, c);
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

/* A note on a connection: why these two are linked, a reference, a
   condition. Edited in the connection's own bar; Ctrl/Cmd+Enter or a
   click elsewhere keeps it, Esc leaves it as it was. */
function editConnNote(id) {
  const c = theConn(id);
  if (!c) return;
  selConn = id;
  const el = connBarEl();
  el.hidden = false;
  el.innerHTML = '';
  el.classList.add('is-note');
  el.style.pointerEvents = '';
  const ta = document.createElement('textarea');
  ta.className = 'conn-note';
  ta.value = c.note || '';
  ta.placeholder = 'A note on this connection…';
  ta.setAttribute('aria-label', 'Connection note');
  el.appendChild(ta);
  const tip = document.createElement('div');
  tip.className = 'conn-note-tip';
  tip.textContent = 'Click away or Ctrl+Enter to keep · Esc to cancel';
  el.appendChild(tip);

  let done = false;
  const finish = keep => {
    if (done) return;
    done = true;
    const live = theConn(id);
    if (keep && live) {
      const text = ta.value.trim();
      if ((live.note || '') !== text) {
        pushUndo();
        if (text) live.note = text; else delete live.note;
        save();
      }
    }
    hideConnBar();
    render();
  };
  ta.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); finish(true); }
  });
  ta.addEventListener('blur', () => finish(true));
  placeConnBar(el, c);
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
}

function removeConn(id) {
  pushUndo();
  const d = doc();
  d.connections = d.connections.filter(x => x.id !== id);
  if (selConn === id) selConn = null;
  save();                               // records the removal in d.conngone (stampConns)
  render(); toast('Connection removed');
}
function selectConn(id) {
  selConn = id;
  UI.selected = null;
  clearMarked();
  render();
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
/* While the map is being moved it is worth handing to the compositor, which
   is what `will-change` asks for. Left on permanently, though, the browser
   keeps scaling one cached picture of the map rather than redrawing the
   text at the zoom actually in use, and every label looks soft. So the hint
   goes on while the camera is moving and comes off once it settles, which
   makes the browser redraw the text sharply at the resting zoom. */
let camSettle = null;
function applyCam() {
  const c = cam();
  const world = $('#world');
  if (!world) return;
  /* Whole pixels: a fractional offset puts every glyph across a pixel
     boundary, which is the other half of why small text looked hazy. */
  const x = Math.round(c.x), y = Math.round(c.y);
  world.style.transform = `translate(${x}px, ${y}px) scale(${c.s})`;
  world.classList.add('is-moving');
  clearTimeout(camSettle);
  camSettle = setTimeout(() => world.classList.remove('is-moving'), 180);
  const z = $('#zoomFit');
  if (z) z.textContent = Math.round(c.s * 100) + '%';
  if (notePopPlace) notePopPlace();
  /* the connection bar is pinned to a point on the map, so it travels with it */
  if (selConn) {
    const bar = document.getElementById('connBar');
    const live = theConn(selConn);
    if (bar && !bar.hidden && live && P[live.a] && P[live.b]) placeConnBar(bar, live);
  }
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
  wayDrag = null;
  const cv = document.getElementById('canvas');
  if (cv) cv.classList.remove('is-shaping');
  if (linkDrag) { linkDrag = null; clearLinkPreview(); }
  if (nodeDrag) { nodeDrag = null; dragOffset = null; render(); }
}

function canvasSetup() {
  const canvas = $('#canvas');
  /* Capturing a pointer that has already been let go throws, which would
     abandon the rest of the gesture. Nothing depends on the capture
     succeeding, so a failure is simply ignored. */
  const grabPointer = id => { try { canvas.setPointerCapture(id); } catch (e) { } };

  canvas.addEventListener('pointerdown', e => {
    /* the corner dot: start drawing a connection from its node */
    const linkHandle = e.target.closest('[data-linkfrom]');
    if (linkHandle) {
      const from = linkHandle.dataset.for;
      if (editing || !from || !N(from) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (selConn) { selConn = null; hideConnBar(); }
      grabPointer(e.pointerId);
      linkDrag = { from, sx: e.clientX, sy: e.clientY, moved: false, target: null, viaHandle: true };
      positionHandles();
      e.preventDefault();
      return;
    }
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
    const overlay = e.target.closest('#zoombar, #ctx, .hint, #linkPop, #connBar');
    if (foldBtn || taskBtn || noteIc || linkIc || urlIc || addBtn || checkCtl || linkCtl || overlay) return;

    /* A phone browser nudges a touch towards whatever it decides you meant,
       and anywhere near a node that means the node — even when the finger
       landed exactly on a connection running past it. Where the actual
       point is on a connection, that is what was meant. */
    let aim = e.target;
    if (e.pointerType !== 'mouse' && typeof document.elementFromPoint === 'function') {
      const exact = document.elementFromPoint(e.clientX, e.clientY);
      if (exact && exact.closest && exact.closest('[data-conn], [data-way]')) aim = exact;
    }

    /* ---- the selected connection's waypoint ---- */
    const wayEl = aim.closest('[data-way]');
    if (wayEl && !editing) {
      const c = theConn(wayEl.dataset.way);
      if (c) {
        const now = Date.now();
        /* a second tap on the waypoint pulls the connection straight */
        if (lastWayTap.id === c.id && now - lastWayTap.t < 380) {
          lastWayTap = { id: null, t: 0 };
          pushUndo(); straightenConn(c); save(); render(); toast('Straightened');
          return;
        }
        lastWayTap = { id: c.id, t: now };
        grabPointer(e.pointerId);
        wayDrag = startWayDrag(c, e, false);
        e.preventDefault();
        return;
      }
    }

    /* ---- the connection itself ----
       Pressing on the line selects it, and if the pointer then moves, the
       same gesture bends the line — with a mouse or a finger, without first
       having to find the small waypoint. A press without movement is a
       plain click, and two in quick succession name the connection. */
    const connEl = aim.closest('[data-conn]');
    if (connEl && !editing && !connectFrom) {
      const id = connEl.dataset.conn;
      const now = Date.now();
      if (lastConnTap.id === id && now - lastConnTap.t < 380) {
        lastConnTap = { id: null, t: 0 };
        selConn = id; render(); editConnTitle(id);
        return;
      }
      lastConnTap = { id, t: now };
      const c = theConn(id);
      selectConn(id);
      if (c) {
        grabPointer(e.pointerId);
        wayDrag = startWayDrag(c, e, true);
      }
      e.preventDefault();
      return;
    }
    /* anywhere else puts the selected connection down */
    if (selConn && !aim.closest('[data-conn], [data-way]')) { selConn = null; hideConnBar(); }
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
      grabPointer(e.pointerId);
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
    grabPointer(e.pointerId);

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
    } else if (nodeEl && !editing && connectFrom) {
      /* With the link tool armed, a node is a place to draw from rather
         than something to move: drag across to the other node, or let go
         without moving and tap the second node instead. */
      linkDrag = { from: nodeEl.dataset.id, sx: e.clientX, sy: e.clientY, moved: false, target: null };
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
    /* shaping a connection: the waypoint follows the pointer */
    if (wayDrag) {
      const c = theConn(wayDrag.id);
      if (!c) { wayDrag = null; return; }
      if (!wayDrag.moved) {
        /* from the line itself, wait for a deliberate movement so a click
           with a slightly shaky hand does not bend it */
        if (wayDrag.fromLine && Math.hypot(e.clientX - wayDrag.sx, e.clientY - wayDrag.sy) < 4) return;
        wayDrag.moved = true;
        pushUndo();                       // one undo step for the whole drag
        hideConnBar();                    // out of the way while shaping
        $('#canvas').classList.add('is-shaping');
      }
      const w = toWorld(e.clientX, e.clientY);
      setConnWaypoint(c, { x: w.x + wayDrag.ox, y: w.y + wayDrag.oy });
      drawEdgesOnly();
      return;
    }
    /* drawing a connection from one node to another */
    if (linkDrag) {
      if (!linkDrag.moved && Math.hypot(e.clientX - linkDrag.sx, e.clientY - linkDrag.sy) < 5) return;
      linkDrag.moved = true;
      const over = hitNode(e.clientX, e.clientY, new Set([linkDrag.from]));
      linkDrag.target = over;
      $$('#nodes .node').forEach(el => el.classList.toggle('is-link-target', el.dataset.id === over));
      drawLinkPreview(linkDrag.from, toWorld(e.clientX, e.clientY));
      return;
    }
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

    if (wayDrag) {
      const moved = wayDrag.moved;
      wayDrag = null;
      $('#canvas').classList.remove('is-shaping');
      if (moved) { save(); render(); }
      return;
    }

    if (linkDrag) {
      const ld = linkDrag; linkDrag = null;
      clearLinkPreview();
      /* a click on the corner dot, without dragging: this node is one end,
         and the next node clicked is the other */
      if (!ld.moved && ld.viaHandle) {
        connectFrom = ld.from; selConn = null;
        clearMarked(); UI.selected = ld.from;
        render();
        toast('Now click the node to connect to — Esc to cancel');
        return;
      }
      /* let go without moving: this was a tap, so it means the same as it
         always did — pick this node as one end of the connection */
      if (!ld.moved) { handleNodeTap(ld.from, false); return; }
      if (ld.target && ld.target !== ld.from) {
        connectFrom = null;
        addConnection(ld.from, ld.target);
      } else {
        connectFrom = null;
        render();
        toast('Let go on another node to connect them');
      }
      return;
    }

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

  /* The handles sit just outside the node, so crossing the small gap to
     reach one must not count as leaving the node: a short grace period
     keeps them up, and arriving on a handle keeps them up for good. */
  let hoverOff = null;
  canvas.addEventListener('pointerover', e => {
    const ic = e.target.closest('[data-note]');
    if (ic && e.pointerType === 'mouse') showNoteTip(ic); else hideNoteTip();
    if (e.target.closest('[data-add], [data-linkfrom]')) { clearTimeout(hoverOff); return; }
    const el = e.target.closest('.node');
    const id = el ? el.dataset.id : null;
    clearTimeout(hoverOff);
    if (id) { if (id !== hoverId) { hoverId = id; positionHandles(); } return; }
    if (hoverId) hoverOff = setTimeout(() => { hoverId = null; positionHandles(); }, 320);
  });
  canvas.addEventListener('pointerleave', () => {
    clearTimeout(hoverOff); hideNoteTip();
    hoverId = null; positionHandles();
  });

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
    if (note) { hideNoteTip(); openNotePopover(note.dataset.note); return; }
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

/* Connect two nodes, and leave the new connection selected so it can be
   curved, named or given a note straight away. Two nodes already joined
   are not joined twice — the existing connection is picked instead. */
function addConnection(a, b) {
  const d = doc();
  if (!N(a) || !N(b) || a === b) { render(); return null; }
  const have = d.connections.find(c => (c.a === a && c.b === b) || (c.a === b && c.b === a));
  if (have) {
    selConn = have.id; UI.selected = null;
    render();
    toast('Those two are already connected');
    return have;
  }
  pushUndo();
  const c = { id: uid(), a, b };
  d.connections.push(c);
  selConn = c.id; UI.selected = null;
  save(); render();
  toast('Connected — drag the line to curve it');
  return c;
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
    const from = connectFrom;
    connectFrom = null;
    if (from !== id) addConnection(from, id);
    else { save(); render(); }
    return;
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
    item('Flag all for action 🚩', () => {
      pushUndo();
      selIds().forEach(x => { const nn = N(x); if (nn && !markersOf(nn).includes('🚩')) toggleMarker(nn, '🚩'); });
      UI.showImages = true; save(); render();
    });
    item('Clear markers', () => {
      pushUndo();
      selIds().forEach(x => { const nn = N(x); if (nn) setMarkers(nn, []); });
      save(); render();
    });
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
    item(n.note && n.note.trim() ? 'Edit note' : 'Add note', () => openNotePopover(id), { hint: 'Ctrl ⇧ K' });
    item('Notes panel', () => { if (!(UI.inspector && UI.inspTab === 'note')) toggleNotesPanel(); }, { hint: 'Ctrl 5', skip: window.innerWidth <= 900 });
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
    const hasMark = em => markersOf(n).includes(em);
    item(hasMark('🚩') ? 'Clear the action flag' : 'Flag for action 🚩',
         () => { pushUndo(); toggleMarker(n, '🚩'); UI.showImages = true; save(); render(); });
    item(hasMark('⭐') ? 'No longer important' : 'Mark important ⭐',
         () => { pushUndo(); toggleMarker(n, '⭐'); UI.showImages = true; save(); render(); });
    item('More markers…', () => {
      if (window.innerWidth > 900) { UI.inspector = true; UI.inspTab = 'media'; }
      else UI.sheetTab = 'media';
      save(); render();
    });
    sep();
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
    item(UI.inspector && UI.inspTab === 'note' ? 'Close notes panel' : 'Notes panel', () => toggleNotesPanel(),
      { hint: 'Ctrl 5', skip: window.innerWidth <= 900 });
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

/* =====================================================================
   Note popover — the note on a node, opened right beside it.
   Ctrl/Cmd+Shift+K, "Edit note" in the node's menu, or a click on the
   node's note marker. Typing saves as you go; Esc, the ✕ or a click
   anywhere else closes it. Clearing the text removes the note.
   ===================================================================== */
let notePopEl = null;
let notePopClose = null;
let notePopPlace = null;     // keeps the open note against its node while the map moves
let notePopRefresh = null;   // repaints its footer after anything redraws the map
function closeNotePopover() {
  if (notePopClose) { const f = notePopClose; notePopClose = null; f(); }
}
function noteAnchor(id) {
  return document.querySelector(`#nodes .node[data-id="${id}"]`) ||
         document.querySelector(`#outline [data-txt="${id}"]`);
}
function openNotePopover(id) {
  const n = N(id);
  if (!n || editing) return;
  closeNotePopover(); closeLinkPopover(); closeContextMenu();
  if (selConn) { selConn = null; hideConnBar(); }
  if (!marked.has(id)) clearMarked();
  UI.selected = id;
  render();

  /* Laid out the way MindNode does it: the node's name small and centred
     at the top, a roomy writing area, and a footer for what hangs off the
     node — its picture on the left, its web link on the right. A pointer
     on the edge ties the box to the node it belongs to. */
  const box = document.createElement('div');
  box.id = 'notePop';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Note');
  box.innerHTML = `
    <span class="np-caret" aria-hidden="true"></span>
    <div class="np-head"><span class="np-title"></span></div>
    <textarea class="np-text" placeholder="Write a note…" aria-label="Note"></textarea>
    <div class="np-foot">
      <span class="np-attach"></span>
      <button type="button" class="np-link"></button>
    </div>`;
  box.querySelector('.np-title').textContent = n.text || 'Untitled';
  box.style.setProperty('--npc', colorOf(id));        // the top edge takes the node's colour
  const ta = box.querySelector('.np-text');
  ta.value = n.note || '';
  document.body.appendChild(box);
  notePopEl = box;

  /* ---- footer: attachment (the node's picture) ---- */
  const attach = box.querySelector('.np-attach');
  const fileIn = document.createElement('input');
  fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.hidden = true;
  box.appendChild(fileIn);
  const paintAttach = () => {
    const live = N(id);
    attach.innerHTML = '';
    const src = live ? imageSrcFor(live) : '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'np-attach-btn';
    if (src) {
      const img = document.createElement('img');
      img.src = src; img.alt = '';
      btn.appendChild(img);
      btn.appendChild(document.createTextNode('Image attached'));
      btn.title = 'Replace the picture on this node';
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'np-attach-rm';
      rm.textContent = '✕'; rm.title = 'Remove the picture';
      rm.setAttribute('aria-label', 'Remove the picture');
      rm.addEventListener('click', () => {
        const l = N(id); if (!l) return;
        pushUndo(); clearNodeImage(l); save(); render(); paintAttach();
      });
      attach.appendChild(btn);
      attach.appendChild(rm);
    } else {
      btn.innerHTML = '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M2.5 1.5h7l4 4v13h-11z"/><path d="M9.5 1.5v4h4"/></svg>';
      btn.appendChild(document.createTextNode('No Attachment'));
      btn.title = 'Attach a picture to this node';
      attach.appendChild(btn);
    }
    btn.addEventListener('click', () => fileIn.click());
  };
  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0]; if (!f) return;
    shrinkImage(f, dataUrl => {
      const l = N(id); if (!l) return;
      pushUndo(); setNodeImage(l, dataUrl); save(); render(); paintAttach();
      placeNotePop();
    });
    fileIn.value = '';
  });
  paintAttach();

  /* ---- footer: link ---- */
  const linkBtn = box.querySelector('.np-link');
  const paintLink = () => {
    const live = N(id);
    const u = live && live.url && live.url.trim();
    linkBtn.textContent = u ? u.replace(/^https?:\/\//i, '').replace(/\/$/, '') : 'Link…';
    linkBtn.title = u ? 'Edit this node’s link' : 'Add a web link to this node';
    linkBtn.classList.toggle('has-url', !!u);
  };
  paintLink();
  linkBtn.addEventListener('click', () => {
    const r = linkBtn.getBoundingClientRect();
    openLinkPopover(id, r.right - 240, r.bottom + 8);
  });

  /* ---- placement, kept against the node as the map moves ---- */
  const placeNotePop = () => {
    const anchor = noteAnchor(id);
    const bw = box.offsetWidth, bh = box.offsetHeight, gap = 14, m = 8;
    const W = window.innerWidth, H = window.innerHeight;
    box.classList.remove('np-right', 'np-left', 'np-below');
    if (!anchor) { positionFloating(box, W / 2 - bw / 2, H / 2 - bh / 2); return; }
    const r = anchor.getBoundingClientRect();
    const cy = r.top + r.height / 2, cx = r.left + r.width / 2;
    let side;
    if (r.right + gap + bw <= W - m) side = 'right';
    else if (r.left - gap - bw >= m) side = 'left';
    else side = 'below';
    box.classList.add('np-' + side);
    if (side === 'below') {
      positionFloating(box, cx - bw / 2, r.bottom + gap);
      const left = parseFloat(box.style.left);
      box.style.setProperty('--caret', clamp(cx - left, 18, bw - 18) + 'px');
    } else {
      positionFloating(box, side === 'right' ? r.right + gap : r.left - gap - bw, cy - 46);
      const top = parseFloat(box.style.top);
      box.style.setProperty('--caret', clamp(cy - top, 18, bh - 18) + 'px');
    }
  };
  placeNotePop();
  notePopPlace = placeNotePop;

  let undoTaken = false;
  ta.addEventListener('input', () => {
    const live = N(id);
    if (!live) return;
    if (!undoTaken) { pushUndo(); undoTaken = true; }   // one undo step per visit
    live.note = ta.value.trim() ? ta.value : '';
    save();
  });
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); closeNotePopover(); }
  });

  /* the link editor opens on top of this box, so a click in it is not
     a click "elsewhere"; whatever it saves shows on the next redraw */
  const outside = e => {
    if (box.contains(e.target)) return;
    if (e.target.closest && e.target.closest('#linkPop')) return;
    closeNotePopover();
  };
  document.addEventListener('pointerdown', outside, true);
  notePopRefresh = () => { paintLink(); placeNotePop(); };
  notePopClose = () => {
    document.removeEventListener('pointerdown', outside, true);
    notePopPlace = null; notePopRefresh = null;
    box.remove();
    if (notePopEl === box) notePopEl = null;
    render();                            // the note marker appears or goes
  };
  setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
}

/* The preview that appears under a node's note icon on hover. */
let noteTipEl = null, noteTipTimer = null;
function showNoteTip(icon) {
  const n = N(icon.dataset.note);
  if (!n || !n.note.trim() || notePopEl) { hideNoteTip(); return; }
  clearTimeout(noteTipTimer);
  noteTipTimer = setTimeout(() => {
    if (!icon.isConnected) return;
    if (!noteTipEl) {
      noteTipEl = document.createElement('div');
      noteTipEl.id = 'noteTip';
      noteTipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(noteTipEl);
    }
    const t = n.note.trim();
    noteTipEl.textContent = t.length > 240 ? t.slice(0, 240) + '…' : t;
    noteTipEl.hidden = false;
    const r = icon.getBoundingClientRect();
    positionFloating(noteTipEl, r.left - 4, r.bottom + 6);
  }, 250);
}
function hideNoteTip() {
  clearTimeout(noteTipTimer);
  if (noteTipEl) noteTipEl.hidden = true;
}

/* The notes panel: the side panel opened on its Note tab, which follows
   whichever node is selected, so notes can be added one after another. */
function toggleNotesPanel() {
  if (window.innerWidth > 900) {
    const open = UI.inspector && UI.inspTab === 'note';
    UI.inspector = !open;
    UI.inspTab = 'note';
  } else {
    if (!UI.selected) { toast('Select a node to add notes'); return; }
    UI.sheetTab = UI.sheetTab === 'note' ? null : 'note';
  }
  save(); render();
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

/* Is the person typing into something right now? A node being edited on
   the map counts, and so does any field in a panel, sheet or dialog. */
function isTyping() {
  if (editing) return true;
  const a = document.activeElement;
  if (!a) return false;
  return a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || !!a.isContentEditable;
}

/* Keep a panel field clear of the on-screen keyboard. The touch sheet is
   anchored to the bottom of the window, so when the keyboard takes half
   the screen the field being typed into can end up behind it. The sheet is
   lifted by however much is covered, and the panel scrolled rather than
   the page, so the rest of the sheet stays where it was. */
function keepFieldVisible() {
  const vv = window.visualViewport;
  if (!vv) return;
  const covered = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
  const sheet = document.getElementById('sheet');
  if (sheet) sheet.style.bottom = covered > 40 ? covered + 'px' : '';
  const el = document.activeElement;
  if (!el || !el.getBoundingClientRect || el === document.body) return;
  const r = el.getBoundingClientRect();
  const over = r.bottom - (vv.offsetTop + vv.height - 16);
  if (over <= 0) return;
  const box = el.closest ? el.closest('.sheet-body, #inspBody, .modal-body') : null;
  if (box) box.scrollTop += over;
  else if (el.scrollIntoView) { try { el.scrollIntoView({ block: 'center' }); } catch (e) { } }
}
/* the lift is only ever wanted while the keyboard is up */
function dropSheetLift() {
  const sheet = document.getElementById('sheet');
  if (sheet && sheet.style.bottom) sheet.style.bottom = '';
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
    /* notes, as in MindNode: Shift+Cmd/Ctrl+K edits the selected node's
       note beside it; Cmd/Ctrl+5 opens the notes panel */
    if (mod && e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (UI.selected) openNotePopover(UI.selected); else toast('Select a node to add a note');
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && (e.key === '5' || e.code === 'Digit5')) { e.preventDefault(); toggleNotesPanel(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSide(); fitAfterResize(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setSide('wide'); $('#search').focus(); return; }
    if (e.key === '/') { e.preventDefault(); setSide('wide'); $('#search').focus(); return; }
    if (e.key === 'Escape') {
      if (notePopEl) { closeNotePopover(); return; }
      if ($('#ctx')) { closeContextMenu(); return; }
      if (selConn) { selConn = null; hideConnBar(); render(); return; }
      if (moveInto) { moveInto = false; render(); return; }
      if (marked.size) { clearMarked(); render(); return; }
      if ($('#linkPop')) { closeLinkPopover(); return; }
      if (connectFrom) { connectFrom = null; render(); }
      else if (UI.focusMode) { UI.focusMode = false; render(); }
      else if (UI.highlightTag) { UI.highlightTag = null; render(); }
      else { UI.selected = null; render(); }
      return;
    }
    /* with a connection picked, the keys act on it rather than on a node */
    if (selConn) {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeConn(selConn); return; }
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); editConnTitle(selConn); return; }
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
  const olMarks = markersOf(n);
  txt.textContent = (olMarks.length ? olMarks.join('') + ' ' : '') + (n.text || 'Untitled');
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
  ['media', 'Markers', '<svg viewBox="0 0 20 20" class="ic"><rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.4"/><path d="M4 14l4-4 3.5 3.5L14 11l2 2"/></svg>'],
  ['tags', 'Tags', '<svg viewBox="0 0 20 20" class="ic"><path d="M3 8.5V4h4.5l8.5 8.5-4.5 4.5L3 8.5z"/><circle cx="6.6" cy="6.6" r="1.1"/></svg>']
];

function renderInspector() {
  if (!UI.inspector) return;
  const body = $('#inspBody'), id = UI.selected;
  body.innerHTML = '';
  if (!id || !N(id)) {
    $('#inspTitle').textContent = UI.inspTab === 'note' ? 'Notes' : 'Document';
    if (UI.inspTab === 'note') {
      const hint = document.createElement('div');
      hint.className = 'help';
      hint.style.margin = '0 0 14px';
      hint.textContent = 'Select a node to add notes. The panel follows your selection, so you can click node after node and keep writing.';
      body.appendChild(hint);
    }
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
    chipBtn(n.note && n.note.trim() ? 'Edit note' : 'Add note', () => {
      if (window.innerWidth > 900) openNotePopover(id);
      else { UI.sheetTab = 'note'; save(); render(); }
    }),
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
  ta.addEventListener('input', () => { n.note = ta.value.trim() ? ta.value : ''; save(); });
  ta.addEventListener('blur', () => render());
  w.appendChild(group('Note', ta));
}

function panelMedia(id, w) {
  const n = N(id);
  /* Update what actually changed instead of rebuilding the panel. A full
     redraw cleared the search box and collapsed the list back to the top,
     so adding a second marker meant searching for it all over again — and
     on a phone it closed the keyboard too. */
  const syncButtons = () => {
    const on = markersOf(n);
    w.querySelectorAll('.marker-btn').forEach(b => {
      b.classList.toggle('is-on', on.includes(b.textContent));
    });
  };
  const refresh = () => {
    save();
    drawCurrent();
    syncButtons();
    renderMap();
  };
  /* Tapping a marker must not pull focus off the search box: on a phone
     that closes the keyboard, so adding a second marker would mean tapping
     back into the box and typing the search again. */
  const keepFocus = el => el.addEventListener('mousedown', e => e.preventDefault());

  /* ---- what this node already carries ---- */
  const current = document.createElement('div');
  current.className = 'marker-current';
  const drawCurrent = () => {
    current.innerHTML = '';
    const marks = markersOf(n);
    if (!marks.length) {
      const empty = document.createElement('span');
      empty.className = 'help';
      empty.style.margin = '0';
      empty.textContent = 'No markers yet. Pick one below, search for it, or paste one in.';
      current.appendChild(empty);
      return;
    }
    marks.forEach(em => {
      const b = document.createElement('button');
      b.className = 'marker-chip';
      /* a marker can arrive from another device, so it is never treated
         as markup */
      const face = document.createElement('span');
      face.textContent = em;
      const x = document.createElement('span');
      x.className = 'x';
      x.textContent = '✕';
      b.append(face, x);
      b.title = 'Remove this marker';
      b.setAttribute('aria-label', 'Remove marker ' + em);
      keepFocus(b);
      b.addEventListener('click', () => { pushUndo(); toggleMarker(n, em); refresh(); });
      current.appendChild(b);
    });
  };
  drawCurrent();
  w.appendChild(group('On this node', current));

  /* ---- the ones reached for most often ---- */
  const quick = document.createElement('div');
  quick.className = 'marker-quick';
  QUICK_MARKERS.forEach(em => {
    const entry = MARKER_INDEX.find(x => x.emoji === em);
    const b = document.createElement('button');
    b.className = 'marker-btn' + (markersOf(n).includes(em) ? ' is-on' : '');
    b.textContent = em;
    b.title = entry ? entry.words : em;
    b.setAttribute('aria-label', entry ? entry.words.split(' ')[0] : em);
    keepFocus(b);
    b.addEventListener('click', () => { pushUndo(); toggleMarker(n, em); refresh(); });
    quick.appendChild(b);
  });
  w.appendChild(group('Quick markers', quick));

  /* ---- search the whole set by what the marker means ---- */
  const findWrap = document.createElement('div');
  const find = document.createElement('input');
  find.className = 'f-input';
  find.type = 'search';
  find.placeholder = 'Search markers — try flag, deadline, rock, approval';
  findWrap.appendChild(find);

  const results = document.createElement('div');
  results.className = 'marker-results';
  findWrap.appendChild(results);

  const drawResults = () => {
    const q = find.value.trim().toLowerCase();
    results.innerHTML = '';
    const groups = {};
    MARKER_INDEX.forEach(item => {
      if (q && !item.words.includes(q) && !item.emoji.includes(q)) return;
      (groups[item.group] = groups[item.group] || []).push(item);
    });
    const names = Object.keys(groups);
    if (!names.length) {
      const none = document.createElement('div');
      none.className = 'help';
      none.textContent = 'Nothing matches that. You can still paste any emoji below.';
      results.appendChild(none);
      return;
    }
    names.forEach(name => {
      const h = document.createElement('div');
      h.className = 'marker-group';
      h.textContent = name;
      results.appendChild(h);
      const row = document.createElement('div');
      row.className = 'marker-quick';
      groups[name].forEach(item => {
        const b = document.createElement('button');
        b.className = 'marker-btn' + (markersOf(n).includes(item.emoji) ? ' is-on' : '');
        b.textContent = item.emoji;
        b.title = item.words;
        b.setAttribute('aria-label', item.words.split(' ')[0]);
        keepFocus(b);
        b.addEventListener('click', () => { pushUndo(); toggleMarker(n, item.emoji); refresh(); });
        row.appendChild(b);
      });
      results.appendChild(row);
    });
  };
  find.addEventListener('input', drawResults);
  drawResults();
  w.appendChild(group('All markers', findWrap));

  /* ---- anything at all, pasted from wherever you found it ---- */
  const pasteWrap = document.createElement('div');
  const paste = document.createElement('input');
  paste.className = 'f-input';
  paste.placeholder = 'Paste any emoji here, then press Enter';
  const addPasted = () => {
    const raw = paste.value.trim();
    if (!raw) return;
    /* take the glyphs, not a sentence someone pasted by accident */
    const glyphs = Array.from(raw).filter(ch => !/[\s\w.,;:'"()\[\]{}<>/\\-]/.test(ch));
    if (!glyphs.length) { toast('That did not contain an emoji'); return; }
    pushUndo();
    const seen = new Set(markersOf(n));
    const add = [];
    /* keep variation selectors and skin tones attached to their glyph */
    Array.from(raw.match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu) || [])
      .forEach(em => { if (!seen.has(em)) { seen.add(em); add.push(em); } });
    const final = add.length ? [...markersOf(n), ...add] : [...markersOf(n), glyphs[0]];
    setMarkers(n, final);
    paste.value = '';
    refresh();
  };
  paste.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPasted(); } });
  paste.addEventListener('paste', () => setTimeout(addPasted, 0));
  pasteWrap.appendChild(paste);
  const hint = document.createElement('div');
  hint.className = 'help';
  hint.textContent = 'Anything you can copy — from a web page, a message, your own keyboard. ' +
    'Markers are text, so they travel to every device and cost nothing to store.';
  pasteWrap.appendChild(hint);
  w.appendChild(group('Paste a marker', pasteWrap));

  /* ---- images stay where they were ---- */
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
  const taperRow = rowOf([chipBtn('Tapered branches', () => {
    pushUndo(); d.taper = !d.taper; save(); render();
  }, !!d.taper)]);
  const taperWhy = document.createElement('div');
  taperWhy.className = 'help';
  taperWhy.textContent = d.branch === 'elbow'
    ? 'Elbows keep their even line — a taper only blurs the corners.'
    : 'Branches leave the centre thick and thin out towards the edges.';
  taperRow.appendChild(taperWhy);
  w.appendChild(group('Branch width', taperRow));
  w.appendChild(group('Tags', tagManager()));
  w.appendChild(group('Connections', connectionList()));
  const stats = document.createElement('div');
  stats.className = 'help';
  stats.textContent = `${Object.keys(d.nodes).length} nodes · ${d.connections.length} connections · ` +
    `${Object.values(d.nodes).filter(n => n.note.trim()).length} notes`;
  w.appendChild(group('This document', stats));
  w.appendChild(group(' ', rowOf([chipBtn('Duplicate document', () => duplicateDoc(d.id))])));

  /* saving it out, in whichever shape it needs to leave in */
  const saveRow = rowOf(EXPORT_KINDS.map(([kind, label, why]) => {
    const b = chipBtn(label, () => exportDocAs(d, kind));
    b.title = why;
    return b;
  }).concat([(() => {
    const b = chipBtn('Print or PDF', () => printDoc());
    b.title = 'Your browser can save the printed page as a PDF';
    return b;
  })()]));
  w.appendChild(group('Save a copy as', saveRow));
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
    dropSheetLift();
    return;
  }
  host.hidden = false;
  if (!isTyping()) dropSheetLift();     // no keyboard up, so sit on the bottom
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
    line.innerHTML = `<span class="sw"></span>
      <span class="nm"></span><span class="ct">${count}</span>
      <span class="hl" title="Highlight this tag">${UI.highlightTag === t.id ? '☀' : '☼'}</span>`;
    /* the colour travels with the tag between devices, so it is set as a
       property rather than written into the markup */
    line.querySelector('.sw').style.background = t.color || '';
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
    p.textContent = 'Pick the link tool in the toolbar, then drag from one node to another — or tap one and then the other. ' +
      'A connection drawn this way ignores the hierarchy.';
    wrap.appendChild(p);
    return wrap;
  }
  d.connections.forEach(c => {
    const line = document.createElement('div');
    line.className = 'tag-line' + (selConn === c.id ? ' is-on' : '');
    const a = d.nodes[c.a], b = d.nodes[c.b];
    line.innerHTML = `<span class="nm"></span><span class="ct">✕</span>`;
    const pair = `${a ? a.text || 'Untitled' : '?'} → ${b ? b.text || 'Untitled' : '?'}`;
    line.querySelector('.nm').textContent = c.title ? `${c.title} — ${pair}` : pair;
    line.title = pair;
    /* the row selects; only the ✕ removes, so a stray tap cannot delete */
    line.addEventListener('click', ev => {
      if (ev.target.closest('.ct')) {
        ev.stopPropagation();
        removeConn(c.id);
        return;
      }
      if (UI.view !== 'map') { UI.view = 'map'; }
      selConn = c.id;
      save(); render();
      if (P[c.a]) centerOn(c.a);
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
  /* markers are part of the haystack, so pasting 🚩 into the search box
     lists every node flagged for action */
  const hay = (n.text || '') + ' ' + (n.note || '') + ' ' + markersOf(n).join(' ');
  return hay.toLowerCase().includes(q);
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
      const hay = (n.text + ' ' + n.note + ' ' + markersOf(n).join(' ')).toLowerCase();
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
const MIME_FOR = {
  json: 'application/json', md: 'text/markdown', txt: 'text/plain',
  opml: 'text/x-opml', svg: 'image/svg+xml'
};
function download(name, text) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const blob = new Blob([text], { type: (MIME_FOR[ext] || 'text/plain') + ';charset=utf-8' });
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

/* =====================================================================
   Writing a document out in somebody else's format.

   Each walks the map in reading order, so the result is the outline you
   would get by reading the branches top to bottom.
   ===================================================================== */
function walkDoc(d, fn) {
  const kids = n => (n.children || []).filter(c => d.nodes[c]);
  const go = (id, depth) => {
    const n = d.nodes[id];
    if (!n) return;
    fn(n, depth);
    kids(n).forEach(c => go(c, depth + 1));
  };
  go(d.root, 0);
  /* free-standing nodes come after the tree, each as its own top line */
  Object.values(d.nodes).forEach(n => {
    if (!n.parent && n.id !== d.root) go(n.id, 0);
  });
}
const safeName = s => (s || 'map').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'map';

function docToMarkdown(d) {
  const out = ['# ' + (d.name || 'Map'), ''];
  const tagName = id => (d.tags.find(t => t.id === id) || {}).name;
  walkDoc(d, (n, depth) => {
    if (depth === 0 && n.id === d.root) return;        // already the heading
    const text = (n.text || 'Untitled').replace(/\n+/g, ' ');
    const box = typeof n.done === 'boolean' && hasTaskLook(d, n) ? (n.done ? '[x] ' : '[ ] ') : '';
    const tags = (n.tags || []).map(tagName).filter(Boolean).map(t => ` #${t.replace(/\s+/g, '-')}`).join('');
    const marks = markersOf(n).join(' ');
    out.push('  '.repeat(Math.max(0, depth - 1)) + '- ' + box + text + (marks ? ' ' + marks : '') + tags);
    if (n.note && n.note.trim()) {
      n.note.trim().split('\n').forEach(line =>
        out.push('  '.repeat(Math.max(0, depth - 1)) + '  > ' + line));
    }
  });
  return out.join('\n') + '\n';
}
/* a node only gets a checkbox if it is being used as one */
function hasTaskLook(d, n) {
  if (n.done) return true;
  const sibs = n.parent && d.nodes[n.parent] ? d.nodes[n.parent].children : [];
  return sibs.some(id => d.nodes[id] && d.nodes[id].done);
}

function docToText(d) {
  const out = [];
  walkDoc(d, (n, depth) => {
    out.push('    '.repeat(depth) + (n.text || 'Untitled').replace(/\n+/g, ' '));
    if (n.note && n.note.trim()) {
      n.note.trim().split('\n').forEach(line => out.push('    '.repeat(depth + 1) + line));
    }
  });
  return out.join('\n') + '\n';
}

function docToOPML(d) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>' + esc(d.name) + '</title>',
    '    <dateModified>' + new Date(d.updated || Date.now()).toUTCString() + '</dateModified>',
    '  </head>',
    '  <body>'
  ];
  const open = [];
  const kids = n => (n.children || []).filter(c => d.nodes[c]);
  const emit = (id, depth) => {
    const n = d.nodes[id];
    if (!n) return;
    const pad = '    '.repeat(depth + 1);
    const text = esc((n.text || 'Untitled').replace(/\n+/g, ' '));
    const note = n.note && n.note.trim() ? ' _note="' + esc(n.note.trim()) + '"' : '';
    const list = kids(n);
    if (!list.length) { lines.push(pad + '<outline text="' + text + '"' + note + '/>'); return; }
    lines.push(pad + '<outline text="' + text + '"' + note + '>');
    list.forEach(c => emit(c, depth + 1));
    lines.push(pad + '</outline>');
  };
  emit(d.root, 0);
  Object.values(d.nodes).forEach(n => { if (!n.parent && n.id !== d.root) emit(n.id, 0); });
  lines.push('  </body>', '</opml>', '');
  void open;
  return lines.join('\n');
}

/* PDF is the browser's own job: its print dialogue can save one, and it
   lays the map out at the right size without this app carrying a PDF
   writer around. */
function printDoc() {
  if (UI.view !== 'map' && UI.view !== 'outline') return;
  toast('Choose "Save as PDF" as the destination');
  setTimeout(() => window.print(), 350);
}

const EXPORT_KINDS = [
  ['json', 'MindNote file', 'Everything, to open here again', d => ({ ext: 'json', body: envelope(embedImagesForExport({ [d.id]: d }), [d.id]) })],
  ['md', 'Markdown', 'An outline, with notes and tick boxes', d => ({ ext: 'md', body: docToMarkdown(d) })],
  ['opml', 'OPML', 'For other outliners and mind mappers', d => ({ ext: 'opml', body: docToOPML(d) })],
  ['txt', 'Plain text', 'Indented lines, nothing else', d => ({ ext: 'txt', body: docToText(d) })]
];

function exportDocAs(d, kind) {
  const found = EXPORT_KINDS.find(k => k[0] === kind);
  if (!found) return;
  const { ext, body } = found[3](d);
  download(safeName(d.name) + '-' + stamp() + '.' + ext, body);
  toast('Exported as ' + found[1]);
}
/* =====================================================================
   Bringing documents in from elsewhere.

   A MindNode document is a folder in a zip: the map itself is a binary
   property list, Apple's own format. Both are read here rather than with
   a library, because the whole point of this app is that it has no
   dependencies to rot. The browser supplies the hard part — inflating
   the compressed entries — through DecompressionStream.
   ===================================================================== */

function zipEntries(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  /* the directory is at the end, after any trailing comment */
  for (let i = u.length - 22; i >= 0 && i > u.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const nameLen = dv.getUint16(p + 28, true);
    out[dec.decode(u.subarray(p + 46, p + 46 + nameLen))] = {
      method: dv.getUint16(p + 10, true),
      csize: dv.getUint32(p + 20, true),
      local: dv.getUint32(p + 42, true)
    };
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return { u, dv, out };
}
async function zipRead(buf, match) {
  const { u, dv, out } = zipEntries(buf);
  const pick = Object.keys(out).find(match);
  if (!pick) return null;
  const e = out[pick];
  /* the local header repeats the name and extra lengths, and they can
     differ from the ones in the directory */
  const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
  const raw = u.subarray(start, start + e.csize);
  if (e.method === 0) return raw.slice();
  if (e.method !== 8) throw new Error('unsupported compression');
  if (typeof DecompressionStream !== 'function') throw new Error('no-inflate');
  /* fed straight into the stream rather than through a Blob or a Response,
     so this needs nothing of the browser beyond the decompressor itself */
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(raw);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); total += value.length;
  }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { joined.set(c, at); at += c.length; }
  return joined;
}

/* A binary property list: a table of objects addressed by offset, with
   containers holding indexes into that table. */
function bplist(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]) !== 'bplist')
    throw new Error('not a property list');
  const n = bytes.length;
  const offSize = bytes[n - 26], refSize = bytes[n - 25];
  const num = Number(dv.getBigUint64(n - 24));
  const top = Number(dv.getBigUint64(n - 16));
  const tableAt = Number(dv.getBigUint64(n - 8));
  const readBE = (at, size) => { let v = 0; for (let i = 0; i < size; i++) v = v * 256 + bytes[at + i]; return v; };
  const offsets = [];
  for (let i = 0; i < num; i++) offsets.push(readBE(tableAt + i * offSize, offSize));

  const seen = new Map();
  function obj(index) {
    if (seen.has(index)) return seen.get(index);
    let at = offsets[index];
    const marker = bytes[at];
    const kind = marker >> 4;
    let len = marker & 0x0f;
    at += 1;
    /* a nibble of 15 means the real count is the next object, an integer */
    const bigCount = () => {
      if (len !== 0x0f) return;
      const size = 1 << (bytes[at] & 0x0f);
      at += 1;
      len = readBE(at, size);
      at += size;
    };
    let value = null;
    switch (kind) {
      case 0x0: value = len === 8 ? false : len === 9 ? true : null; break;
      case 0x1: {
        const size = 1 << len;
        value = size === 8 ? Number(dv.getBigInt64(at)) : readBE(at, size);
        break;
      }
      case 0x2: value = (1 << len) === 4 ? dv.getFloat32(at) : dv.getFloat64(at); break;
      case 0x3: value = new Date((dv.getFloat64(at) + 978307200) * 1000); break;
      case 0x4: bigCount(); value = bytes.subarray(at, at + len); break;
      case 0x5: {
        bigCount();
        let s = ''; for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[at + i]);
        value = s; break;
      }
      case 0x6: {
        bigCount();
        let s = ''; for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint16(at + i * 2));
        value = s; break;
      }
      case 0x8: value = { uid: readBE(at, len + 1) }; break;
      case 0xa: case 0xc: {
        bigCount();
        const arr = []; seen.set(index, arr);
        for (let i = 0; i < len; i++) arr.push(obj(readBE(at + i * refSize, refSize)));
        return arr;
      }
      case 0xd: {
        bigCount();
        const d = {}; seen.set(index, d);
        for (let i = 0; i < len; i++) {
          const k = obj(readBE(at + i * refSize, refSize));
          d[k] = obj(readBE(at + len * refSize + i * refSize, refSize));
        }
        return d;
      }
    }
    seen.set(index, value);
    return value;
  }
  return obj(top);
}

/* ---- turning one into a MindNote document ---- */

/* MindNode keeps a node's words as a scrap of HTML. */
function htmlToText(html) {
  if (!html) return '';
  const el = document.createElement('div');
  el.innerHTML = String(html).replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  return (el.textContent || '')
    .replace(/[\u2028\u2029]/g, '\n')      // the separators Apple uses inside a line
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
/* "{0.92, 0.58, 0.18, 1.0}" is how a colour is written down */
function appleColour(str) {
  if (typeof str !== 'string') return null;
  const m = str.match(/-?\d*\.?\d+/g);
  if (!m || m.length < 3) return null;
  const hex = m.slice(0, 3).map(v => {
    const n = Math.round(Math.min(1, Math.max(0, parseFloat(v))) * 255);
    return n.toString(16).padStart(2, '0');
  }).join('');
  return '#' + hex;
}
const MN_SHAPES = { 0: 'line', 1: 'rect', 2: 'rounded', 3: 'pill', 4: 'circle', 5: 'rounded', 6: 'hexagon' };

function mindNodeToDocs(plist, fallbackName) {
  const maps = (plist && plist.canvas && plist.canvas.mindMaps) || [];
  if (!maps.length) throw new Error('no map in that file');

  /* the tags belong to the whole canvas, and nodes point at them by id */
  const canvasTags = (plist.canvas.tags || []).map(t => ({
    id: uid(), name: t.name || 'Tag',
    color: appleColour(t.color) || TAG_COLORS[0],
    mnId: t.tagID
  }));
  const tagBy = {};
  canvasTags.forEach(t => { tagBy[t.mnId] = t.id; });

  const docs = [];
  maps.forEach((map, mapIndex) => {
    const nodes = {};
    let rootId = null;
    let tasksSeen = 0;

    /* Walked with a stack rather than by calling itself, so an unusually
       deep map is read instead of exhausting the call stack. */
    const take = (mn, parentId, inheritedColour) => {
      const n = mkNode(parentId, htmlToText((mn.title || {}).text));
      const stroke = ((mn.pathStyle || {}).strokeStyle || {}).color;
      const mine = appleColour(stroke);
      /* Only record a colour where it changes, so it cascades down the
         branch the way it does in a map built here. The central idea is
         left alone: the colour on it describes the line arriving at it,
         which does not exist, and is usually white. */
      if (mine && parentId && mine !== inheritedColour) n.color = mine;
      const shapeType = (mn.shapeStyle || {}).shapeType;
      if (MN_SHAPES[shapeType]) n.shape = MN_SHAPES[shapeType];
      if (mn.hasFoldedSubnodes) n.collapsed = true;
      if (mn.task) { n.done = mn.task.state === 2; tasksSeen++; }
      if (mn.note) n.note = htmlToText(typeof mn.note === 'string' ? mn.note : mn.note.text);
      const tagIds = (mn.tags || []).map(t => tagBy[t]).filter(Boolean);
      if (tagIds.length) n.tags = tagIds;
      nodes[n.id] = n;
      if (!parentId) rootId = n.id;
      if (parentId) nodes[parentId].children.push(n.id);
      return { node: n, colour: mine || inheritedColour };
    };
    const pending = [{ mn: map.mainNode || {}, parentId: null, colour: null, depth: 0 }];
    while (pending.length) {
      const job = pending.pop();
      const { node, colour } = take(job.mn, job.parentId, job.colour);
      const subs = job.mn.subnodes || [];
      /* anything past the limit hangs where it is rather than deeper */
      let next = job.depth + 1;
      if (next > MAX_IMPORT_DEPTH) { next = MAX_IMPORT_DEPTH; deepeningTrimmed = true; }
      const under = next > job.depth ? node.id : (job.parentId || node.id);
      /* pushed in reverse so they come back off the stack in order */
      for (let i = subs.length - 1; i >= 0; i--) {
        pending.push({ mn: subs[i], parentId: under, colour, depth: next });
      }
    }

    const name = nodes[rootId].text || fallbackName || 'Imported map';
    const doc = {
      id: uid(), name, root: rootId, nodes,
      connections: [], tags: canvasTags.map(t => ({ id: t.id, name: t.name, color: t.color })),
      layout: map.layoutStyle === 2 ? 'vertical' : 'horizontal',
      cam: null, updated: Date.now()
    };
    /* a map whose children are ticked off is a checklist */
    if (tasksSeen) Object.values(nodes).forEach(n => {
      if (n.children.length && n.children.every(c => nodes[c].children.length === 0)) {
        if (n.children.some(c => typeof nodes[c].done === 'boolean')) n.checklist = false;
      }
    });
    doc.name = maps.length > 1 ? `${name} (${mapIndex + 1})` : name;
    docs.push(doc);
  });
  return docs;
}

async function importMindNode(buf, fileName) {
  let bytes;
  try {
    bytes = await zipRead(buf, n => /(^|\/)contents\.xml$/i.test(n) && !/mindnodestyle/i.test(n));
  } catch (e) {
    if (e.message === 'no-inflate') { toast('This browser cannot open zipped files — try Chrome or Safari'); return; }
    throw e;
  }
  if (!bytes) {
    /* the newer "MindNode Next" documents keep their map in Contents.data,
       an undocumented binary that this cannot read */
    const next = await zipRead(buf, n => /(^|\/)Contents\.data$/i.test(n)).catch(() => null);
    toast(next
      ? 'That is a MindNode Next document, which cannot be read yet — export it as MindNode Classic'
      : 'No map found inside that file');
    return;
  }
  const docs = mindNodeToDocs(bplist(bytes), fileName.replace(/\.(mindnode|zip)$/i, ''));
  docs.forEach(d => { S.docs[d.id] = d; S.order.push(d.id); });
  S.active = docs[0].id;
  UI.selected = null;
  primeSigs(); save(); render();
  const n = docs.reduce((a, d) => a + Object.keys(d.nodes).length, 0);
  toast(`Imported ${n} nodes from MindNode`);
}

/* ---- outlines: OPML, Markdown, and plain indented text ----
   All three are the same idea — a list of lines, each with a depth — so
   they are turned into that shape and then into a document by one piece
   of code. */
/* Laying out and drawing a map walks it by calling into itself, which runs
   out of room somewhere past two thousand levels. No real map is anywhere
   near that, so anything deeper is brought up to this level rather than
   refused: the document still opens, and nothing in it is thrown away. */
const MAX_IMPORT_DEPTH = 1000;
let deepeningTrimmed = false;

function docFromOutline(rows, name) {
  if (!rows.length) throw new Error('nothing in that file');
  const nodes = {};
  let root;
  /* a single top-level row becomes the central idea; several get one made
     for them, so nothing is lost by promotion */
  const tops = rows.filter(r => r.depth === 0);
  let start = 0;
  if (tops.length === 1 && rows[0].depth === 0) {
    root = mkNode(null, rows[0].text);
    if (rows[0].note) root.note = rows[0].note;
    start = 1;
  } else {
    root = mkNode(null, name || 'Imported outline');
  }
  nodes[root.id] = root;
  /* any tags mentioned are made real, once each */
  const tags = [];
  const tagId = label => {
    const key = label.trim().toLowerCase();
    let found = tags.find(t => t.name.toLowerCase() === key);
    if (!found) {
      found = { id: uid(), name: label.trim(), color: TAG_COLORS[tags.length % TAG_COLORS.length] };
      tags.push(found);
    }
    return found.id;
  };
  /* The deepest node seen at each level, so a row can find its parent.
     The root sits at level -1 whether it came from the file or was made
     here, and every other row counts up from zero — without that the
     second of three unindented lines ended up inside the first. */
  const atDepth = { '-1': root };
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    let d = Math.max(0, r.depth - start);
    if (d > MAX_IMPORT_DEPTH) { d = MAX_IMPORT_DEPTH; deepeningTrimmed = true; }
    /* a jump of more than one level is pulled back to the next one down */
    while (d > 0 && !atDepth[d - 1]) d--;
    const parent = atDepth[d - 1] || root;
    const n = mkNode(parent.id, r.text);
    if (r.note) n.note = r.note;
    if (typeof r.done === 'boolean') n.done = r.done;
    if (r.tags && r.tags.length) n.tags = r.tags.map(tagId);
    if (r.markers && r.markers.length) setMarkers(n, r.markers);
    nodes[n.id] = n;
    parent.children.push(n.id);
    atDepth[d] = n;
    for (const k of Object.keys(atDepth)) if (+k > d) delete atDepth[k];
  }
  return {
    id: uid(), name: root.text || name || 'Imported outline', root: root.id, nodes,
    connections: [], tags, layout: 'horizontal', cam: null, updated: Date.now()
  };
}

function rowsFromOPML(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('that OPML could not be read');
  const body = xml.querySelector('body') || xml.documentElement;
  const rows = [];
  /* Walked with a stack rather than by calling itself, so an outline
     nested a few thousand deep is read rather than exhausting the
     browser's call stack halfway through. */
  const kidsOfEl = el => [...el.children].filter(c => c.tagName.toLowerCase() === 'outline');
  const stack = kidsOfEl(body).reverse().map(el => ({ el, depth: 0 }));
  while (stack.length) {
    const { el, depth } = stack.pop();
    rows.push({
      depth,
      text: el.getAttribute('text') || el.getAttribute('title') || '',
      note: el.getAttribute('_note') || el.getAttribute('note') || ''
    });
    const kids = kidsOfEl(el);
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ el: kids[i], depth: depth + 1 });
  }
  const title = (xml.querySelector('head > title') || {}).textContent || '';
  return { rows, name: title.trim() };
}

/* Markdown headings and bullets, or just indented lines. Both end up as
   a depth per line. */
function rowsFromText(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const rows = [];
  let lastHeading = -1;
  /* The widths of the indents seen so far, one per level. Comparing a line
     against these rather than dividing by a guessed step is what makes
     tabs, two spaces and four spaces all work, and keeps two lines at the
     same indent as each other's siblings. */
  let indents = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const head = raw.match(/^(#{1,6})\s+(.*)$/);
    if (head) {
      lastHeading = head[1].length - 1;
      indents = [];
      rows.push({ depth: lastHeading, text: head[2].trim() });
      continue;
    }
    const width = (raw.match(/^[ \t]*/) || [''])[0].replace(/\t/g, '    ').length;
    let body = raw.trim();

    /* a quoted line is a note on the line above, which is how notes are
       written out by this app */
    const quote = body.match(/^>\s?(.*)$/);
    if (quote && rows.length) {
      const owner = rows[rows.length - 1];
      owner.note = owner.note ? owner.note + '\n' + quote[1] : quote[1];
      continue;
    }

    const bullet = body.match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) body = bullet[2];
    let done;
    const box = body.match(/^\[([ xX])\]\s*(.*)$/);
    if (box) { done = box[1].toLowerCase() === 'x'; body = box[2]; }
    if (!body) continue;

    /* trailing hashtags are tags, the way every outliner writes them */
    const tags = [];
    body = body.replace(/(?:\s+#([A-Za-z][\w-]*))+\s*$/, m => {
      (m.match(/#[A-Za-z][\w-]*/g) || []).forEach(t => tags.push(t.slice(1).replace(/-/g, ' ')));
      return '';
    }).trim();
    /* and trailing symbols are markers, which is where they are put */
    const marks = [];
    try {
      body = body.replace(/(\s*(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)+)+$/u,
        m => {
          (m.match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu) || [])
            .forEach(e => marks.push(e));
          return '';
        }).trim();
    } catch (e) { /* an older engine without these classes keeps the symbols in the text */ }
    if (!body && !marks.length) continue;

    while (indents.length && width < indents[indents.length - 1]) indents.pop();
    if (!indents.length || width > indents[indents.length - 1]) indents.push(width);
    const depth = (lastHeading + 1) + indents.length - 1;
    rows.push({ depth, text: body || marks.join(''), done, tags, markers: marks });
  }
  return rows;
}

function addImportedDocs(docs, what) {
  docs.forEach(d => { S.docs[d.id] = d; S.order.push(d.id); });
  if (docs.length) { S.active = docs[0].id; UI.selected = null; }
  primeSigs(); save(); render();
  const n = docs.reduce((a, d) => a + Object.keys(d.nodes).length, 0);
  toast(deepeningTrimmed
    ? `Imported ${n} nodes — some were nested too deeply to draw and have been brought up`
    : `Imported ${n} node${n === 1 ? '' : 's'}${what ? ' from ' + what : ''}`);
}

/* Reading a file means holding all of it, and then the map built from it,
   in memory at once. Past this the tab would sit frozen for long enough
   to look broken, so it is refused with a reason instead. */
const IMPORT_MAX_BYTES = 24 * 1024 * 1024;

/* What kind of file is this? The name is a hint; the contents decide. */
async function importAnyFile(file) {
  const name = file.name || 'file';
  if (typeof file.size === 'number' && file.size > IMPORT_MAX_BYTES) {
    toast(`That file is ${bytesText(file.size)} — too large to open. The limit is ${bytesText(IMPORT_MAX_BYTES)}.`);
    return;
  }
  deepeningTrimmed = false;
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) {          // "PK": a zip
      await importMindNode(await file.arrayBuffer(), name);
      return;
    }
    const text = await file.text();
    const trimmed = text.replace(/^﻿/, '').trimStart();
    if (trimmed.startsWith('{')) { importJSON(text); return; }
    if (/^<(\?xml|opml)/i.test(trimmed) || /<outline\b/i.test(trimmed.slice(0, 2000))) {
      const { rows, name: title } = rowsFromOPML(text);
      addImportedDocs([docFromOutline(rows, title || name.replace(/\.[^.]+$/, ''))], 'OPML');
      return;
    }
    addImportedDocs([docFromOutline(rowsFromText(text), name.replace(/\.[^.]+$/, ''))],
      /^#|\n#|^\s*[-*+]\s/m.test(text) ? 'Markdown' : 'text');
  } catch (e) {
    toast(e && e.message ? e.message : 'That file could not be read');
  }
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
    importAnyFile(f);
    e.target.value = '';
  });

  $('#acts').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) doAct(b.dataset.act);
  });

  /* Anything being typed into must never be torn down. On a phone the
     keyboard opening is itself a viewport resize, so redrawing in response
     to it would destroy the very field the keyboard was opened for: the
     field vanishes, focus is lost, and the keyboard closes again before a
     single letter can be typed. That made the marker search, the note and
     every other panel field impossible to use on a phone. Resizing is
     still handled — the relayout simply waits until typing is finished,
     and the keyboard going away is another resize, which runs it. */
  let rt = null;
  const onViewportChange = () => {
    hideSideTip();
    /* unfolding the Fold makes the rail viable again; the stored
       preference is untouched, only what fits is recomputed. These only
       set attributes, so they are safe while a field has focus. */
    applySidebar();
    syncScrim();
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (editing) { keepEditVisible(); return; }
      if (isTyping()) return;
      render();
    }, 140);
  };
  window.addEventListener('resize', () => { closeContextMenu(); onViewportChange(); });
  window.addEventListener('orientationchange', onViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (editing) { setTimeout(keepEditVisible, 60); return; }
      if (isTyping()) { keepFieldVisible(); return; }
      onViewportChange();
    });
  }

  /* A browser can discard a page without warning — a tab closed, a phone
     switching apps, the OS reclaiming memory. Commit whatever is being
     typed and write it out synchronously before that happens. These are
     the events that actually fire on mobile; beforeunload often does not. */
  /* Only write when this tab actually has something unsaved. Writing the
     whole in-memory workspace unconditionally meant a second tab or an
     installed copy left open in the background put its older copy back
     over the one just saved here — which is how a removed connection
     (or anything else) could reappear on the next reload. */
  const flushNow = () => {
    try { if (commitEditor) commitEditor(); } catch (e) { }
    if (persistPending) persistNow();
  };
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });

  /* Another tab saved. If this one is idle, take its copy so the two never
     drift apart; this tab's own view (open document, selection, camera)
     is kept. */
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue || !booted || schemaBlocked) return;
    if (editing || persistPending || isTyping()) return;
    const ui = Object.assign({}, UI);
    const active = S.active;
    const cams = {};
    for (const [id, d] of Object.entries(S.docs)) if (d.cam) cams[id] = d.cam;
    if (!hydrate(e.newValue)) return;
    Object.assign(UI, ui);
    for (const [id, cm] of Object.entries(cams)) if (S.docs[id]) S.docs[id].cam = cm;
    if (S.docs[active]) S.active = active;
    if (UI.selected && !doc().nodes[UI.selected]) UI.selected = null;
    if (selConn && !theConn(selConn)) selConn = null;
    persistPending = false;
    render();
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
      /* A connection removed on this device stays removed even if the copy
         that came back was merged by an older server without tombstones. */
      const mine = S.docs[id];
      if (mine && mine.conngone) {
        d.conngone = Object.assign({}, d.conngone || {});
        for (const [cid, ts] of Object.entries(mine.conngone)) {
          if (!d.conngone[cid] || ts > d.conngone[cid]) d.conngone[cid] = ts;
        }
      }
      d.connections = (d.connections || []).filter(c => connAlive(c, d));
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
