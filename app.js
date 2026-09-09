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

/* ------------------------------- state ----------------------------- */
let S = { docs: {}, order: [], active: null };
let UI = {
  view: 'map', theme: 'light', sidebar: true, inspector: false,
  showTasks: false, showNotes: true, showImages: true, showTags: true,
  focusMode: false, highlightTag: null, selected: null
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
    note: '', tags: [], done: false, emoji: '', image: '', link: null,
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
const N = id => doc().nodes[id];
const kidsOf = n => n.children.filter(id => doc().nodes[id]);
const visKids = n => (n.collapsed ? [] : kidsOf(n));

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
  if (!n.parent) return addChild(id, text);
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
  saveTimer = setTimeout(() => {
    try {
      store.setItem(KEY, JSON.stringify({
        docs: S.docs, order: S.order, active: S.active, ui: UI, deleted: deletedDocs
      }));
    } catch (e) { toast('Storage is full — export your work to a file.'); }
  }, 250);
  if (changed && window.MNSync) window.MNSync.touch();
}
function persistNow() {
  clearTimeout(saveTimer);
  try {
    store.setItem(KEY, JSON.stringify({
      docs: S.docs, order: S.order, active: S.active, ui: UI, deleted: deletedDocs
    }));
  } catch (e) { toast('Storage is full — export your work to a file.'); }
}
function load() {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
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
  clipboard = { root: id, nodes };
  if (!quiet) toast(ids.length > 1 ? `Copied ${ids.length} nodes` : 'Copied');
}
function pasteBranch(intoId) {
  if (!clipboard) return toast('Nothing copied yet');
  if (!N(intoId)) return;
  pushUndo();
  const d = doc();
  const clone = (oldId, parent) => {
    const src = clipboard.nodes[oldId];
    if (!src) return null;
    const n = JSON.parse(JSON.stringify(src));
    n.id = uid(); n.parent = parent; n.children = []; n.x = null; n.y = null;
    d.nodes[n.id] = n;
    (src.children || []).forEach(c => { const k = clone(c, n.id); if (k) n.children.push(k.id); });
    return n;
  };
  const top = clone(clipboard.root, intoId);
  if (!top) return;
  N(intoId).children.push(top.id);
  N(intoId).collapsed = false;
  UI.selected = top.id;
  save(); render();
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
  if (editing) {
    // still genuinely editing? if the field vanished, recover instead of freezing
    const live = document.querySelector('[data-editing="1"]');
    if (live) return;
    editing = null;
  }
  const d = doc();
  $('#app').dataset.theme = themeMode();
  $('#app').classList.toggle('side-hidden', !UI.sidebar);
  $('#app').classList.toggle('insp-open', UI.inspector);
  $('#themeBtn').textContent = UI.theme === 'light' ? 'Light' : UI.theme === 'dark' ? 'Dark' : 'System';
  const railSync = $('#railSync'), strip = $('#syncBtn');
  if (railSync && strip) railSync.dataset.state = strip.dataset.state || 'off';
  if ($('#docTitle').textContent !== d.name) $('#docTitle').textContent = d.name;
  $('#layoutSel').value = d.layout;
  $$('.seg-btn').forEach(b => b.classList.toggle('is-on', b.dataset.view === UI.view));
  $$('.tool[data-toggle]').forEach(b => b.classList.toggle('is-on', !!UI[b.dataset.toggle]));
  $$('.act').forEach(b => { b.disabled = !UI.selected; });
  $('#connectBtn').classList.toggle('is-on', !!connectFrom);
  $('#connectHint').hidden = !connectFrom;
  $('#canvas').hidden = UI.view !== 'map';
  $('#zoombar').hidden = UI.view !== 'map';
  $('#outline').hidden = UI.view !== 'outline';
  $('#mobilebar').hidden = !UI.selected;
  $('#scrim').hidden = !(window.innerWidth <= 900 && (UI.sidebar || UI.inspector));

  renderDocList();
  if (UI.view === 'map') renderMap(); else renderOutline();
  renderInspector();
}

/* --------------------------- documents list ------------------------ */
function renderDocList() {
  const ul = $('#docList'); ul.innerHTML = '';
  S.order.forEach(id => {
    const d = S.docs[id]; if (!d) return;
    const li = document.createElement('li');
    li.className = 'doc-item' + (id === S.active ? ' is-active' : '');
    li.innerHTML = `<span class="doc-dot" style="background:${PALETTE[S.order.indexOf(id) % PALETTE.length]}"></span>
      <span class="doc-name"></span>
      <span class="doc-count">${Object.keys(d.nodes).length}</span>
      <button class="doc-kill" title="Delete document">✕</button>`;
    li.querySelector('.doc-name').textContent = d.name;
    li.addEventListener('click', e => {
      if (e.target.closest('.doc-kill')) return;
      openDoc(id);
    });
    li.querySelector('.doc-kill').addEventListener('click', e => {
      e.stopPropagation();
      if (S.order.length === 1) return toast('Keep at least one document');
      if (!confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
      deletedDocs[id] = Date.now();
      delete S.docs[id];
      S.order = S.order.filter(x => x !== id);
      if (S.active === id) S.active = S.order[0];
      save(); render();
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
  S.active = id; UI.selected = null; connectFrom = null;
  if (window.innerWidth <= 900) UI.sidebar = false;
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
  (function walk(id) {
    visible.push(id);
    visKids(N(id)).forEach(walk);
  })(d.root);

  // 1. build elements, holding on to them: re-querying per node is quadratic
  const els = {};
  visible.forEach(id => { const el = buildNodeEl(id); els[id] = el; layer.appendChild(el); });

  // 2. measure
  visible.forEach(id => {
    const el = els[id];
    P[id] = { w: el.offsetWidth, h: el.offsetHeight, x: 0, y: 0 };
  });

  // 3. lay out
  ({ horizontal: layoutHorizontal, vertical: layoutVertical, compact: layoutCompact,
     radial: layoutRadial, manual: layoutManual })[d.layout]();

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
function childSide(id) {
  const kids = visKids(N(id));
  if (!kids.length) return 1;
  return (P[kids[0]].x >= P[id].x) ? 1 : -1;
}

function buildNodeEl(id) {
  const d = doc(), n = N(id), c = colorOf(id);
  const el = document.createElement('div');
  el.className = `node sh-${n.shape}` + (id === d.root ? ' is-root' : '') +
    (id === UI.selected ? ' is-sel' : '');
  el.dataset.id = id;
  el.style.setProperty('--nc', c);
  if (n.shape !== 'line' && n.shape !== 'embedded') el.style.borderWidth = n.border + 'px';

  if (UI.showTasks && id !== d.root) {
    const st = taskState(id);
    const t = document.createElement('span');
    t.className = 'n-task ' + (st === 'done' ? 'done' : st === 'part' ? 'part' : '');
    t.dataset.task = id;
    t.textContent = st === 'done' ? '✓' : '';
    el.appendChild(t);
  }
  if (UI.showImages && n.emoji) {
    const e = document.createElement('span');
    e.className = 'n-emoji'; e.textContent = n.emoji; el.appendChild(e);
  }
  const txt = document.createElement('span');
  txt.className = 'txt';
  txt.textContent = n.text;
  el.appendChild(txt);

  const meta = [];
  if (UI.showNotes && n.note.trim()) meta.push(`<span class="n-note-ic" data-note="${id}">📝</span>`);
  if (n.link && S.docs[n.link]) meta.push(`<span class="n-link-ic" data-link="${id}" title="Open linked document">🔗</span>`);
  if (meta.length) {
    const m = document.createElement('span');
    m.className = 'n-meta'; m.innerHTML = meta.join('');
    el.appendChild(m);
  }
  if (UI.showImages && n.image) {
    const img = document.createElement('img');
    img.className = 'n-img'; img.src = n.image; img.alt = '';
    el.appendChild(img);
  }
  if (UI.showTags && n.tags.length) {
    const tw = document.createElement('span');
    tw.className = 'n-tags';
    n.tags.forEach(tid => {
      const tag = d.tags.find(t => t.id === tid); if (!tag) return;
      const s = document.createElement('span');
      s.className = 'n-tag'; s.style.background = tag.color; tw.appendChild(s);
    });
    el.appendChild(tw);
  }
  return el;
}

/* -------------------------- layout engines ------------------------- */
const GAP_X = 54, GAP_Y = 16, GAP_VX = 26, GAP_VY = 64, RSTEP = 210;
let memoH = {}, memoW = {}, memoL = {};

function subH(id) {
  if (memoH[id] != null) return memoH[id];
  const kids = visKids(N(id));
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
  const kids = visKids(N(id));
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
  const kids = visKids(N(id));
  return (memoL[id] = kids.length ? kids.reduce((a, k) => a + leaves(k), 0) : 1);
}
function resetMemo() { memoH = {}; memoW = {}; memoL = {}; }

function layoutHorizontal() {
  resetMemo();
  const d = doc(), root = d.nodes[d.root], rp = P[d.root];
  rp.x = -rp.w / 2; rp.y = -rp.h / 2;
  const kids = visKids(root);
  const half = Math.ceil(kids.length / 2);
  const right = kids.slice(0, half), left = kids.slice(half);
  stackH(right, rp.x + rp.w + GAP_X, 1);
  stackH(left, rp.x - GAP_X, -1);
}
function stackH(list, x, dir) {
  if (!list.length) return;
  const total = list.reduce((a, k, i) => a + subH(k) + (i ? GAP_Y : 0), 0);
  let cy = -total / 2;
  list.forEach(k => { const h = subH(k); placeH(k, x, cy + h / 2, dir); cy += h + GAP_Y; });
}
function placeH(id, x, cy, dir) {
  const p = P[id];
  p.x = dir > 0 ? x : x - p.w;
  p.y = cy - p.h / 2;
  const kids = visKids(N(id));
  if (!kids.length) return;
  const nx = dir > 0 ? p.x + p.w + GAP_X : p.x - GAP_X;
  const total = kids.reduce((a, k, i) => a + subH(k) + (i ? GAP_Y : 0), 0);
  let y = cy - total / 2;
  kids.forEach(k => { const h = subH(k); placeH(k, nx, y + h / 2, dir); y += h + GAP_Y; });
}

function layoutVertical() {
  resetMemo();
  const d = doc(), rp = P[d.root];
  rp.x = -rp.w / 2; rp.y = -rp.h / 2;
  placeV(d.root, 0, rp.y);
}
function placeV(id, cx, top) {
  const p = P[id];
  p.x = cx - p.w / 2; p.y = top;
  const kids = visKids(N(id));
  if (!kids.length) return;
  const total = kids.reduce((a, k, i) => a + subW(k) + (i ? GAP_VX : 0), 0);
  let x = cx - total / 2;
  kids.forEach(k => {
    const w = subW(k);
    placeV(k, x + w / 2, top + p.h + GAP_VY);
    x += w + GAP_VX;
  });
}

function layoutCompact() {
  resetMemo();
  const d = doc(), rp = P[d.root];
  rp.x = -rp.w / 2; rp.y = -rp.h / 2;
  placeC(d.root, rp.x, rp.y);
}
function placeC(id, x, top) {
  const p = P[id];
  p.x = x; p.y = top;
  const kids = visKids(N(id));
  if (!kids.length) return;
  const nx = x + p.w + 34;
  let y = top;
  kids.forEach(k => { placeC(k, nx, y); y += subH(k) + 10; });
}

function layoutRadial() {
  resetMemo();
  const d = doc(), root = d.nodes[d.root], rp = P[d.root];
  rp.x = -rp.w / 2; rp.y = -rp.h / 2;
  const kids = visKids(root);
  const tot = kids.reduce((a, k) => a + leaves(k), 0) || 1;
  let a0 = -Math.PI / 2;
  kids.forEach(k => {
    const span = (leaves(k) / tot) * Math.PI * 2;
    placeR(k, 1, a0, a0 + span);
    a0 += span;
  });
}
function placeR(id, depth, a0, a1) {
  const mid = (a0 + a1) / 2, r = depth * RSTEP, p = P[id];
  p.x = Math.cos(mid) * r - p.w / 2;
  p.y = Math.sin(mid) * r - p.h / 2;
  const kids = visKids(N(id));
  if (!kids.length) return;
  const tot = kids.reduce((a, k) => a + leaves(k), 0) || 1;
  let s = a0;
  kids.forEach(k => {
    const span = (a1 - a0) * leaves(k) / tot;
    placeR(k, depth + 1, s, s + span);
    s += span;
  });
}

function layoutManual() {
  const d = doc();
  (function walk(id) {
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
    visKids(n).forEach(walk);
  })(d.root);
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
  if (Math.abs(dx) >= Math.abs(dy)) {
    const x1 = dx > 0 ? a.x + a.w : a.x, x2 = dx > 0 ? b.x : b.x + b.w;
    const m = (x1 + x2) / 2;
    return `M${x1} ${ac.y} C${m} ${ac.y} ${m} ${bc.y} ${x2} ${bc.y}`;
  }
  const y1 = dy > 0 ? a.y + a.h : a.y, y2 = dy > 0 ? b.y : b.y + b.h;
  const m = (y1 + y2) / 2;
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

function canvasSetup() {
  const canvas = $('#canvas');

  canvas.addEventListener('pointerdown', e => {
    const foldBtn = e.target.closest('[data-fold]');
    const taskBtn = e.target.closest('[data-task]');
    const noteIc = e.target.closest('[data-note]');
    const linkIc = e.target.closest('[data-link]');
    const addBtn = e.target.closest('[data-add]');
    if (foldBtn || taskBtn || noteIc || linkIc || addBtn) return;
    /* While a node is being typed into, the canvas stays put. The browser
       still blurs the field, which commits the text. */
    if (editing) return;

    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      pan = null; nodeDrag = null;
      return;
    }
    const nodeEl = e.target.closest('.node');
    canvas.setPointerCapture(e.pointerId);
    if (nodeEl && !editing) {
      const id = nodeEl.dataset.id;
      nodeDrag = { id, sx: e.clientX, sy: e.clientY, moved: false, ids: new Set([id, ...descendants(id)]) };
    } else {
      pan = { sx: e.clientX, sy: e.clientY, cx: cam().x, cy: cam().y, moved: false };
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

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
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;

    if (nodeDrag) {
      const nd = nodeDrag; nodeDrag = null; dragOffset = null;
      if (!nd.moved) {
        handleNodeTap(nd.id);
      } else if (nd.target) {
        pushUndo(); reparent(nd.id, nd.target); save(); render();
      } else {
        pushUndo();
        const d = doc();
        if (d.layout !== 'manual') { pinAll(); d.layout = 'manual'; }
        const s = cam().s;
        const dx = (e.clientX - nd.sx) / s, dy = (e.clientY - nd.sy) / s;
        nd.ids.forEach(id => { d.nodes[id].x += dx; d.nodes[id].y += dy; });
        save(); render();
      }
      return;
    }
    if (pan) {
      const moved = pan.moved; pan = null;
      save();
      if (!moved && !editing) {
        if (connectFrom) { connectFrom = null; render(); return; }
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

  canvas.addEventListener('pointerover', e => {
    const el = e.target.closest('.node');
    const id = el ? el.dataset.id : null;
    if (id !== hoverId) { hoverId = id; positionHandles(); }
  });
  canvas.addEventListener('pointerleave', () => { hoverId = null; positionHandles(); });

  canvas.addEventListener('dblclick', e => {
    const el = e.target.closest('.node');
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
    const add = e.target.closest('[data-add]');
    if (add) {
      const id = add.dataset.for;
      if (!id || !N(id)) return;
      UI.selected = id;
      if (add.dataset.add === 'child') newChild(id); else newSibling(id);
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
  if (id === doc().root) return;
  if (newParent === id || descendants(id).includes(newParent)) return;
  const n = N(id), old = N(n.parent);
  old.children = old.children.filter(c => c !== id);
  n.parent = newParent;
  N(newParent).children.push(id);
  N(newParent).collapsed = false;
}

function handleNodeTap(id) {
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
  UI.selected = id;
  render();
}

/* ---------------------------- text editing ------------------------- */
function readText(el) {
  const t = (el.innerText != null) ? el.innerText : el.textContent;
  return (t || '');
}
function editNode(id) {
  if (editing === id) return;
  const el = $(`#nodes .node[data-id="${id}"] .txt`) || $(`#outline [data-txt="${id}"]`);
  if (!el) return;
  editing = id;
  const wrap = el.closest('.node');
  if (wrap) wrap.classList.add('editing');
  el.contentEditable = 'true';
  el.dataset.editing = '1';
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);

  const done = commit => {
    el.removeEventListener('blur', onBlur);
    el.removeEventListener('keydown', onKey);
    const text = readText(el).replace(/\s+$/, '');
    editing = null;
    const node = N(id);
    const finalText = commit ? text : (node ? node.text : '');
    if (node && node.parent && !node.children.length && !finalText.trim()) {
      const parent = node.parent;        // a node left blank was never really wanted
      removeNode(id);
      UI.selected = parent;
      save(); render();
      return;
    }
    if (commit && node) {
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
    if (mod && e.key.toLowerCase() === 'c' && UI.selected) { e.preventDefault(); copyBranch(UI.selected); return; }
    if (mod && e.key.toLowerCase() === 'v' && UI.selected) { e.preventDefault(); pasteBranch(UI.selected); return; }
    if (mod && e.key.toLowerCase() === 'd' && UI.selected) { e.preventDefault(); duplicateNode(UI.selected); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); UI.sidebar = true; render(); return; }
    if (e.key === '/') { e.preventDefault(); UI.sidebar = true; render(); $('#search').focus(); return; }
    if (e.key === 'Escape') {
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
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (e.key === 'F2') { e.preventDefault(); editNode(id); }
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
  if (next) { UI.selected = next; render(); }
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
  host.appendChild(wrap);
}
function olNode(id, lvl) {
  const d = doc(), n = N(id), box = document.createElement('div');
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
  txt.className = 'ol-txt';
  txt.dataset.txt = id;
  txt.textContent = (n.emoji ? n.emoji + ' ' : '') + (n.text || 'Untitled');
  txt.addEventListener('click', () => { UI.selected = id; render(); });
  txt.addEventListener('dblclick', () => editOutline(id, txt));
  row.appendChild(txt);

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
function renderInspector() {
  if (!UI.inspector) return;
  const body = $('#inspBody'), d = doc();
  body.innerHTML = '';
  const id = UI.selected;
  $('#inspTitle').textContent = id ? 'Node' : 'Document';

  if (!id) {
    body.appendChild(group('Layout', selectRow(
      [['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['compact', 'Compact'], ['radial', 'Radial'], ['manual', 'Manual']],
      d.layout, v => {
        pushUndo();
        if (v === 'manual') pinAll();
        else Object.values(d.nodes).forEach(n => { n.x = null; n.y = null; });
        d.layout = v; save(); render();
      })));
    body.appendChild(group('Tags', tagManager()));
    body.appendChild(group('Connections', connectionList()));
    const stats = document.createElement('div');
    stats.className = 'help';
    stats.textContent = `${Object.keys(d.nodes).length} nodes · ${d.connections.length} connections · ` +
      `${Object.values(d.nodes).filter(n => n.note.trim()).length} notes`;
    body.appendChild(group('This document', stats));
    body.appendChild(group(' ', rowOf([
      chipBtn('Duplicate document', () => duplicateDoc(d.id)),
      chipBtn('Export this document', () => exportDoc(d))
    ])));
    return;
  }

  const n = N(id);

  /* shape */
  body.appendChild(group('Shape', rowOf(SHAPES.map(([v, label]) =>
    chipBtn(label, () => { pushUndo(); n.shape = v; save(); render(); }, n.shape === v)))));

  /* border + line */
  body.appendChild(group('Border', rowOf([1, 2, 4, 6].map(v =>
    chipBtn(v + ' pt', () => { pushUndo(); n.border = v; save(); render(); }, n.border === v)))));
  body.appendChild(group('Branch line', rowOf([['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']].map(([v, l]) =>
    chipBtn(l, () => { pushUndo(); n.lineStyle = v; save(); render(); }, n.lineStyle === v)))));

  /* colour */
  const colors = document.createElement('div');
  colors.className = 'row';
  [null, ...PALETTE, ROOT_COLOR].forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch' + (n.color === c ? ' is-on' : '');
    b.style.background = c || 'transparent';
    b.style.boxShadow = c ? 'none' : 'inset 0 0 0 2px var(--line)';
    b.title = c ? c : 'Inherit from branch';
    b.addEventListener('click', () => { pushUndo(); n.color = c; save(); render(); });
    colors.appendChild(b);
  });
  body.appendChild(group('Colour', colors));

  /* task */
  if (id !== d.root) {
    const st = taskState(id);
    body.appendChild(group('Task', rowOf([
      chipBtn(st === 'done' ? 'Done' : 'Mark done', () => { pushUndo(); setDone(id, st !== 'done'); save(); render(); }, st === 'done'),
      chipBtn(UI.showTasks ? 'Hide checkboxes' : 'Show checkboxes', () => { UI.showTasks = !UI.showTasks; save(); render(); })
    ])));
  }

  /* note */
  const ta = document.createElement('textarea');
  ta.className = 'f-area';
  ta.placeholder = 'Details that stay out of the way until you need them.';
  ta.value = n.note;
  ta.addEventListener('input', () => { n.note = ta.value; save(); });
  ta.addEventListener('blur', () => render());
  body.appendChild(group('Note', ta));

  /* tags */
  body.appendChild(group('Tags', tagManager(id)));

  /* media */
  const media = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'emoji-grid';
  EMOJI.forEach(em => {
    const b = document.createElement('button');
    b.textContent = em;
    b.addEventListener('click', () => { pushUndo(); n.emoji = n.emoji === em ? '' : em; save(); render(); });
    grid.appendChild(b);
  });
  media.appendChild(grid);
  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'image/*'; file.className = 'f-input';
  file.style.marginTop = '8px';
  file.addEventListener('change', () => {
    const f = file.files[0]; if (!f) return;
    shrinkImage(f, dataUrl => { pushUndo(); n.image = dataUrl; save(); render(); });
  });
  media.appendChild(file);
  if (n.image) media.appendChild(chipBtn('Remove image', () => { pushUndo(); n.image = ''; save(); render(); }));
  body.appendChild(group('Image, stickers and emoji', media));

  /* link to another document */
  const sel = document.createElement('select');
  sel.className = 'f-sel';
  sel.innerHTML = '<option value="">No link</option>' +
    S.order.filter(x => x !== d.id).map(x => `<option value="${x}">${escapeHtml(S.docs[x].name)}</option>`).join('');
  sel.value = n.link || '';
  sel.addEventListener('change', () => { pushUndo(); n.link = sel.value || null; save(); render(); });
  const linkWrap = document.createElement('div');
  linkWrap.appendChild(sel);
  const h = document.createElement('div');
  h.className = 'help';
  h.textContent = 'Linked nodes show a 🔗 you can tap to jump across documents.';
  linkWrap.appendChild(h);
  body.appendChild(group('Link to document', linkWrap));

  /* actions */
  body.appendChild(group('Actions', rowOf([
    chipBtn('Add child', () => newChild(id)),
    chipBtn('Add sibling', () => newSibling(id)),
    chipBtn(N(id).collapsed ? 'Unfold' : 'Fold', () => { N(id).collapsed = !N(id).collapsed; save(); render(); }),
    chipBtn('Duplicate', () => duplicateNode(id)),
    chipBtn('Connect to…', () => doAct('connect')),
    chipBtn('Delete', () => deleteSelected(), false, true)
  ])));
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
  children.forEach(c => r.appendChild(c));
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
function runSearch(q) {
  const box = $('#searchResults');
  q = q.trim().toLowerCase();
  if (!q) { box.hidden = true; box.innerHTML = ''; return; }
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
      if (window.innerWidth <= 900) UI.sidebar = false;
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
function exportAll() {
  download('mindnote-backup.json', JSON.stringify({ kind: 'mindnote', docs: S.docs, order: S.order }, null, 2));
  toast('Exported every document');
}
function exportDoc(d) {
  download(d.name.replace(/[^\w\- ]/g, '') + '.json', JSON.stringify({ kind: 'mindnote', docs: { [d.id]: d }, order: [d.id] }, null, 2));
  toast('Exported this document');
}
function importJSON(text) {
  try {
    const data = JSON.parse(text);
    if (!data.docs || !data.order) throw new Error('bad file');
    data.order.forEach(id => {
      const d = data.docs[id]; if (!d) return;
      const fresh = JSON.parse(JSON.stringify(d));
      fresh.id = uid();
      S.docs[fresh.id] = fresh;
      S.order.push(fresh.id);
    });
    save(); render();
    toast('Import finished');
  } catch (e) {
    toast('That file is not a MindNote export');
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
  $('#openSidebar').addEventListener('click', () => { UI.sidebar = !UI.sidebar; save(); render(); });
  $('#closeSidebar').addEventListener('click', () => { UI.sidebar = false; save(); render(); });
  $('#scrim').addEventListener('click', () => { UI.sidebar = false; UI.inspector = false; save(); render(); });
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

  /* the icon rail shown when the sidebar is collapsed on a wide screen */
  $('#railOpen').addEventListener('click', () => { UI.sidebar = true; save(); render(); });
  $('#railNew').addEventListener('click', newDocument);
  $('#railSearch').addEventListener('click', () => {
    UI.sidebar = true; save(); render(); $('#search').focus();
  });
  $('#railTheme').addEventListener('click', () => cycleTheme());
  $('#railSync').addEventListener('click', () => { const b = $('#syncBtn'); if (b) b.click(); });

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
  $('#exportAll').addEventListener('click', exportAll);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
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

  $('#mobilebar').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b) doAct(b.dataset.act);
  });

  let rt = null;
  const onViewportChange = () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (editing) keepEditVisible();
      else render();
    }, 140);
  };
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (editing) setTimeout(keepEditVisible, 60); else onViewportChange();
    });
  }

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
    if (editing) return false;
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

    if (!S.docs[S.active]) { S.active = S.order[0]; UI.selected = null; }
    if (UI.selected && S.docs[S.active] && !S.docs[S.active].nodes[UI.selected]) UI.selected = null;
    primeSigs();
    persistNow();
    render();
    return true;
  },

  isBusy: () => !!editing,
  toast: msg => toast(msg)
};

/* ------------------------------- start ----------------------------- */
if (!load()) { seed(); save(); }
if (window.innerWidth <= 900) UI.sidebar = false;
UI.selected = null;
pendingFit = !doc().cam;
wire();
render();
if (pendingFit) { pendingFit = false; fitView(); }
