/* =====================================================================
   sync.js — keeps this browser in step with /api/sync.

   Offline first: the app works exactly as before with sync switched off,
   and edits made without a connection are pushed once it returns.
   It talks to the rest of the app only through window.MNApp.
   ===================================================================== */
(function () {
  const CFG_KEY = 'mindnote.sync';
  const PUSH_DELAY = 1600;      // quiet period after the last edit
  const POLL_EVERY = 15000;     // how often to look for other devices
  const CODE_RE = /^[a-z0-9][a-z0-9-]{5,63}$/;
  const MAX_BYTES = 3 * 1024 * 1024;

  let cfg = { code: null };
  let status = 'off';           // off | syncing | ok | offline | error
  let detail = '';
  let lastPushed = '';
  let dirty = false;            // local edits not yet accepted by the server
  let busy = false;
  let lastSyncAt = 0;
  let pushTimer = null, pollTimer = null;

  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { }
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { } }

  function makeCode() {
    const a = 'abcdefghjkmnpqrstuvwxyz23456789';
    const part = n => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('');
    return `${part(4)}-${part(4)}-${part(4)}`;
  }

  /* ------------------------------ network --------------------------- */
  async function push(dropSamples) {
    if (!cfg.code || busy || !window.MNApp) return;
    const exclude = dropSamples ? window.MNApp.sampleIds() : [];
    const body = JSON.stringify({ code: cfg.code, state: window.MNApp.snapshot(exclude) });
    if (body === lastPushed && !dirty) { setStatus('ok'); return; }
    if (body.length > MAX_BYTES) { setStatus('error', 'Too large to sync — remove some images'); return; }

    busy = true; setStatus('syncing');
    try {
      const r = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      const j = await r.json();
      if (!j.ok) { setStatus('error', j.message || 'Sync unavailable'); return; }
      lastPushed = body;
      dirty = false;
      window.MNApp.merge(j.state);
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
      const r = await fetch('/api/sync?code=' + encodeURIComponent(cfg.code), { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) { setStatus('error', j.message || 'Sync unavailable'); return; }
      window.MNApp.merge(j.state);
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
      const peek = await fetch('/api/sync?code=' + encodeURIComponent(cfg.code), { cache: 'no-store' });
      const pj = await peek.json();
      workspaceHasDocs = !!(pj.ok && pj.state && Object.keys(pj.state.docs || {}).length);
    } catch (e) { }
    await push(workspaceHasDocs);
  }

  function schedulePush() {
    if (!cfg.code) return;
    dirty = true;
    setStatus('syncing');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DELAY);
  }
  function startPolling() {
    clearInterval(pollTimer);
    if (!cfg.code) return;
    pollTimer = setInterval(() => {
      if (document.visibilityState !== 'hidden') { dirty ? push() : pull(); }
    }, POLL_EVERY);
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
        documents. Edits travel both ways a couple of seconds after you make them.</p>
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
      </div>`;
    host.appendChild(card);

    const input = card.querySelector('#syncCode');
    input.value = cfg.code || '';
    card.querySelector('[data-connect]').textContent = cfg.code ? 'Update and sync now' : 'Turn on sync';
    if (cfg.code) card.querySelector('[data-off]').hidden = false;
    paint();

    const close = () => { host.hidden = true; host.innerHTML = ''; };
    host.addEventListener('click', e => { if (e.target === host) close(); });
    card.querySelector('[data-close]').addEventListener('click', close);
    card.querySelector('[data-make]').addEventListener('click', () => { input.value = makeCode(); });

    card.querySelector('[data-off]').addEventListener('click', () => {
      cfg.code = null; saveCfg();
      lastPushed = ''; dirty = false;
      clearInterval(pollTimer); clearTimeout(pushTimer);
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
