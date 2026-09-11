/* =====================================================================
   sync.js — keeps this browser in step with /api/sync.

   Offline first: the app works exactly as before with sync switched off,
   and edits made without a connection are pushed once it returns.
   It talks to the rest of the app only through window.MNApp.
   ===================================================================== */
(function () {
  const CFG_KEY = 'mindnote.sync';
  const PUSH_DELAY = 1600;      // quiet period after the last edit
  /* Checking for other devices costs one command each time, and the free
     Redis tiers meter commands. Check often while something is happening,
     then ease off when the workspace has been quiet. */
  const POLL_STEPS = [
    [2 * 60 * 1000, 15000],     // active in the last 2 min  -> every 15s
    [15 * 60 * 1000, 45000],    // in the last 15 min        -> every 45s
    [Infinity, 150000]          // otherwise                 -> every 2.5 min
  ];
  const CODE_RE = /^[a-z0-9][a-z0-9-]{5,63}$/;
  /* Matches the server's MAX_BYTES in api/sync.js. Images no longer count
     against this — they never leave the device (see imageId in app.js) —
     so this is now purely a budget for text and structure. */
  const MAX_BYTES = 5 * 1024 * 1024;

  let cfg = { code: null };
  let status = 'off';           // off | syncing | ok | offline | error
  let detail = '';
  let lastPushed = '';
  let dirty = false;            // local edits not yet accepted by the server
  let busy = false;
  let lastSyncAt = 0;
  let lastActivity = Date.now();
  let lastSize = 0;
  let pushTimer = null, pollTimer = null;

  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { } }

  function makeCode() {
    const a = 'abcdefghjkmnpqrstuvwxyz23456789';
    const part = n => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('');
    return `${part(4)}-${part(4)}-${part(4)}`;
  }

  /* ------------------------------ network --------------------------- */
  /* A missing route answers with an HTML 404, not JSON. Say which it was
     instead of blaming the connection. */
  async function callApi(url, opts) {
    const r = await fetch(url, opts);
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (j) return j;
    if (r.status === 404) return { ok: false, message: 'No sync service found — check the api folder' };
    return { ok: false, message: 'Sync service error ' + r.status };
  }

  async function push(dropSamples) {
    if (!cfg.code || busy || !window.MNApp) return;
    if (!window.MNApp.isReady()) return;
    const exclude = dropSamples ? window.MNApp.sampleIds() : [];
    const body = JSON.stringify({ code: cfg.code, state: window.MNApp.snapshot(exclude) });
    if (body === lastPushed && !dirty) { setStatus('ok'); return; }
    if (body.length > MAX_BYTES) { setStatus('error', 'This workspace is too large to sync — try splitting it across documents'); return; }

    busy = true; setStatus('syncing');
    try {
      const j = await callApi('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      if (!j.ok) { setStatus('error', j.message || 'Sync unavailable'); return; }
      lastPushed = body;
      lastSize = body.length;
      dirty = false;
      if (window.MNApp.merge(j.state)) lastActivity = Date.now();
      lastSyncAt = Date.now();
      setStatus('ok');
    } catch (e) {
      setStatus('offline', 'Offline — will retry');
    } finally { busy = false; }
  }

  async function pull() {
    if (!cfg.code || busy || !window.MNApp) return;
    if (dirty) return push();                       // never let a pull discard local edits
    busy = true; setStatus('syncing');
    try {
      const j = await callApi('/api/sync?code=' + encodeURIComponent(cfg.code), { cache: 'no-store' });
      if (!j.ok) { setStatus('error', j.message || 'Sync unavailable'); return; }
      if (window.MNApp.merge(j.state)) lastActivity = Date.now();
      lastSize = JSON.stringify(j.state || {}).length;
      lastSyncAt = Date.now();
      setStatus('ok');
    } catch (e) {
      setStatus('offline', 'Offline — will retry');
    } finally { busy = false; }
  }

  /* Ask what is already in the workspace, then send this device's copy.
     If the workspace already holds documents, the untouched starter maps
     stay behind instead of piling up beside them. */
  async function joinAndPush() {
    let workspaceHasDocs = false;
    try {
      const pj = await callApi('/api/sync?code=' + encodeURIComponent(cfg.code), { cache: 'no-store' });
      workspaceHasDocs = !!(pj.ok && pj.state && Object.keys(pj.state.docs || {}).length);
    } catch (e) { }
    await push(workspaceHasDocs);
  }

  function schedulePush() {
    if (!cfg.code) return;
    dirty = true;
    lastActivity = Date.now();
    setStatus('syncing');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DELAY);
  }
  function pollDelay() {
    const idle = Date.now() - lastActivity;
    for (const [within, delay] of POLL_STEPS) if (idle < within) return delay;
    return POLL_STEPS[POLL_STEPS.length - 1][1];
  }
  function startPolling() {
    clearTimeout(pollTimer);
    if (!cfg.code) return;
    const tick = () => {
      if (document.visibilityState !== 'hidden') { dirty ? push() : pull(); }
      pollTimer = setTimeout(tick, pollDelay());
    };
    pollTimer = setTimeout(tick, pollDelay());
  }

  /* ------------------------------ status ---------------------------- */
  function setStatus(s, msg) { status = s; detail = msg || ''; paint(); }
  function ago() {
    if (!lastSyncAt) return '';
    const secs = Math.round((Date.now() - lastSyncAt) / 1000);
    if (secs < 45) return 'just now';
    if (secs < 3600) return Math.round(secs / 60) + ' min ago';
    return Math.round(secs / 3600) + ' h ago';
  }
  function label() {
    if (!cfg.code) return 'Sync is off';
    if (status === 'syncing') return 'Syncing…';
    if (status === 'offline' || status === 'error') return detail || 'Sync paused';
    return 'Synced ' + ago();
  }
  function paint() {
    const strip = document.getElementById('syncBtn');
    if (!strip) return;
    strip.querySelector('.sync-text').textContent = label();
    strip.dataset.state = cfg.code ? status : 'off';
    const live = document.getElementById('syncState');
    if (live) live.textContent = label();
    const size = document.getElementById('syncSize');
    if (size) {
      const bytes = lastSize || (window.MNApp ? JSON.stringify(window.MNApp.snapshot()).length : 0);
      const kb = bytes / 1024;
      size.textContent = 'Workspace size: ' + (kb < 1024 ? kb.toFixed(1) + ' KB' : (kb / 1024).toFixed(2) + ' MB') +
        '. Only the current version is stored, not a copy per change.';
    }
  }

  /* ---------------------------- versions ---------------------------- */
  function whenText(ms) {
    if (!ms) return 'unknown time';
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return 'a moment ago';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
    const days = Math.round(hrs / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }

  async function showVersions(host) {
    host.innerHTML = '<p class="modal-note">Loading earlier versions…</p>';
    let j;
    try {
      j = await callApi('/api/sync?history=1&code=' + encodeURIComponent(cfg.code), { cache: 'no-store' });
    } catch (e) {
      host.innerHTML = '<p class="modal-note">Could not reach the server.</p>';
      return;
    }
    if (!j.ok) { host.innerHTML = '<p class="modal-note">' + (j.message || 'Not available.') + '</p>'; return; }
    const list = j.versions || [];
    if (!list.length) {
      host.innerHTML = '<p class="modal-note">No earlier versions stored yet. One is kept roughly every ten minutes that you edit.</p>';
      return;
    }
    host.innerHTML = '';
    list.forEach(v => {
      const row = document.createElement('div');
      row.className = 'ver-row';
      const kb = (v.bytes / 1024).toFixed(0);
      row.innerHTML = `<span class="ver-when"></span>
        <span class="ver-meta">${v.documents} docs · ${v.nodes} nodes · ${kb} KB</span>
        <button class="chip">Restore</button>`;
      row.querySelector('.ver-when').textContent = whenText(v.savedAt);
      row.querySelector('button').addEventListener('click', async () => {
        const names = v.names && v.names.length ? '\n\nDocuments: ' + v.names.join(', ') : '';
        if (!confirm('Put the version from ' + whenText(v.savedAt) + ' back on every device?' + names +
          '\n\nWhat is there now is archived first, so this can be undone.')) return;
        row.querySelector('button').textContent = 'Restoring…';
        try {
          const r = await callApi('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: cfg.code, restore: v.index })
          });
          if (!r.ok) { alert(r.message || 'Restore failed.'); return; }
          lastPushed = ''; dirty = false;
          window.MNApp.merge(r.state);
          lastSyncAt = Date.now();
          setStatus('ok');
          window.MNApp.toast('Version restored');
          showVersions(host);
        } catch (e) { alert('Restore failed — no connection.'); }
      });
      host.appendChild(row);
    });
  }

  /* ------------------------------- panel ---------------------------- */
  function openPanel() {
    const host = document.getElementById('modal');
    if (!host) return;
    host.hidden = false;
    host.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.innerHTML = `
      <div class="modal-head">
        <h3>Sync across devices</h3>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body">
        <p class="modal-p">Give every device the same workspace code and they share the same
        documents. Edits travel both ways a couple of seconds after you make them.
        Images stay on the device that added them and are not part of the sync payload,
        so a photo added on your phone won't appear on your laptop.</p>
        <label class="modal-label" for="syncCode">Workspace code</label>
        <div class="modal-row">
          <input class="f-input" id="syncCode" spellcheck="false" autocomplete="off"
                 placeholder="kite-4m2p-9xqr">
          <button class="chip" data-make>New code</button>
        </div>
        <div class="modal-actions">
          <button class="solid-btn" data-connect></button>
          <button class="chip danger" data-off hidden>Turn off here</button>
        </div>
        <p class="modal-note">Treat the code like a password: anyone who types it sees these
        documents. Turning sync off here keeps your documents on this device and leaves the
        server copy alone.</p>
        <p class="modal-note" id="syncState"></p>
        <p class="modal-note" id="syncSize"></p>
        <div class="ver-block" id="verBlock" hidden>
          <div class="modal-label" style="margin-top:14px">Earlier versions</div>
          <p class="modal-note" style="margin-top:0">The server keeps the last five, about one for every
          ten minutes of editing. Restoring puts that version on every device.</p>
          <button class="chip" id="verLoad">Show earlier versions</button>
          <div id="verList"></div>
        </div>
      </div>`;
    host.appendChild(card);

    const input = card.querySelector('#syncCode');
    input.value = cfg.code || '';
    card.querySelector('[data-connect]').textContent = cfg.code ? 'Update and sync now' : 'Turn on sync';
    if (cfg.code) card.querySelector('[data-off]').hidden = false;
    paint();

    const verBlock = card.querySelector('#verBlock');
    if (cfg.code) {
      verBlock.hidden = false;
      card.querySelector('#verLoad').addEventListener('click', e => {
        e.target.hidden = true;
        showVersions(card.querySelector('#verList'));
      });
    }

    const close = () => { host.hidden = true; host.innerHTML = ''; };
    host.addEventListener('click', e => { if (e.target === host) close(); });
    card.querySelector('[data-close]').addEventListener('click', close);
    card.querySelector('[data-make]').addEventListener('click', () => { input.value = makeCode(); });

    card.querySelector('[data-off]').addEventListener('click', () => {
      cfg.code = null; saveCfg();
      lastPushed = ''; dirty = false;
      clearTimeout(pollTimer); clearTimeout(pushTimer);
      setStatus('off'); close();
      if (window.MNApp) window.MNApp.toast('Sync switched off on this device');
    });

    card.querySelector('[data-connect]').addEventListener('click', async () => {
      const val = input.value.trim().toLowerCase();
      const state = card.querySelector('#syncState');
      if (!CODE_RE.test(val)) {
        state.textContent = 'Use six or more letters, numbers and dashes, starting with a letter or number.';
        return;
      }
      cfg.code = val; saveCfg();
      lastPushed = ''; dirty = true;
      state.textContent = 'Connecting…';
      await joinAndPush();
      startPolling();
      if (status === 'ok') { close(); if (window.MNApp) window.MNApp.toast('Sync is on'); }
    });
  }

  /* ------------------------------- wiring --------------------------- */
  function init() {
    /* The workspace now loads asynchronously. Pushing before it is ready
       would send an empty workspace to the server. */
    if (!window.MNApp || !window.MNApp.isReady || !window.MNApp.isReady()) {
      document.addEventListener('mindnote:ready', init, { once: true });
      return;
    }
    const strip = document.getElementById('syncBtn');
    if (strip) strip.addEventListener('click', openPanel);
    paint();

    window.addEventListener('online', () => { if (cfg.code) push(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden' && cfg.code) { dirty ? push() : pull(); }
    });
    setInterval(paint, 20000);

    if (cfg.code) { dirty = true; joinAndPush().then(startPolling); }
  }

  window.MNSync = {
    touch: schedulePush,
    now: () => push(),
    isOn: () => !!cfg.code
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
