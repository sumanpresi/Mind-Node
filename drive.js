/* =====================================================================
   drive.js — attachments kept in the user's own Google Drive.

   The map only ever stores a small record per file (its Drive id, name,
   type, size, date). The file itself lives in Drive, where it is opened
   and edited in Google's own browser viewers and editors. Editing keeps
   the same Drive file, so the node always opens the latest version.

   Sign-in is Google's browser token flow: no client secret exists, and
   the access token is held in memory only — never written to storage —
   and expires within the hour. The scope is drive.file, which lets
   MindNote see only the files it created itself, nothing else in Drive.

   Uploads go straight from the browser to Google (resumable, in chunks,
   with progress), never through the sync server.
   ===================================================================== */
(function () {
  const CLIENT_ID = '34823578669-u8u1njpuac7ciupkf6tipjhqpp4jgmqu.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const FIELDS = 'id,name,mimeType,size,modifiedTime,webViewLink,trashed';
  const HINT_KEY = 'mindnote.drive.account';     // the account email only, to skip the chooser
  const FOLDER = 'application/vnd.google-apps.folder';

  let token = null, tokenExp = 0;
  let gisLoading = null, tokenClient = null, pending = null;
  let account = null;
  try { account = localStorage.getItem(HINT_KEY) || null; } catch (e) { }

  const hasToken = () => !!token && Date.now() < tokenExp - 60 * 1000;

  /* ---------------------------- sign-in ----------------------------- */
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoading = null; reject(new Error('Google sign-in could not load — check the connection')); };
      document.head.appendChild(s);
    });
    return gisLoading;
  }
  /* Load Google's sign-in script ahead of time, so that the click which
     needs it can open the sign-in window straight away (a window opened
     later than the click is blocked by the browser). */
  function preload() { if (navigator.onLine) loadGis().catch(() => { }); }

  function ensureClient() {
    if (tokenClient) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: resp => {
        const p = pending; pending = null;
        if (!p) return;
        if (resp && resp.access_token) {
          token = resp.access_token;
          tokenExp = Date.now() + (Number(resp.expires_in) || 3000) * 1000;
          p.resolve(token);
          fetchAccount();
        } else p.reject(new Error((resp && resp.error_description) || 'Google sign-in was not completed'));
      },
      error_callback: err => {
        const p = pending; pending = null;
        if (p) p.reject(new Error(err && err.type === 'popup_closed' ? 'Sign-in window was closed' :
          err && err.type === 'popup_failed_to_open' ? 'The browser blocked the Google sign-in window — allow pop-ups for this site' :
          'Google sign-in failed'));
      }
    });
  }
  /* Must be called from inside a click. Resolves with a token. */
  function signIn() {
    if (hasToken()) return Promise.resolve(token);
    if (!(window.google && google.accounts && google.accounts.oauth2)) {
      return loadGis().then(() => Promise.reject(new Error('Google sign-in is ready — press the button again')));
    }
    ensureClient();
    if (pending) pending.reject(new Error('superseded'));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      const opts = { prompt: '' };
      if (account) opts.login_hint = account;
      tokenClient.requestAccessToken(opts);
    });
  }
  function signOut() {
    const t = token;
    token = null; tokenExp = 0; account = null;
    for (const k of Object.keys(folderMemo)) delete folderMemo[k];
    try { localStorage.removeItem(HINT_KEY); } catch (e) { }
    if (t && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(t, () => { }); } catch (e) { }
    }
  }
  async function fetchAccount() {
    try {
      const j = await api('GET', '/about?fields=user(emailAddress)');
      if (j && j.user && j.user.emailAddress) {
        account = j.user.emailAddress;
        try { localStorage.setItem(HINT_KEY, account); } catch (e) { }
        document.dispatchEvent(new Event('mindnote:drive'));
      }
    } catch (e) { }
  }

  /* ------------------------------ calls ----------------------------- */
  async function api(method, path, body) {
    if (!hasToken()) throw Object.assign(new Error('Not connected to Google Drive'), { code: 'auth' });
    let r;
    try {
      r = await fetch(API + path, {
        method,
        headers: Object.assign({ Authorization: 'Bearer ' + token },
          body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw Object.assign(new Error('Google Drive is unavailable — your notes are safe'), { code: 'net' });
    }
    if (r.status === 401) { token = null; throw Object.assign(new Error('Google Drive sign-in has expired'), { code: 'auth' }); }
    if (r.status === 404) throw Object.assign(new Error('That file is no longer in Google Drive'), { code: 'missing' });
    if (r.status === 204) return null;
    let j = null;
    try { j = await r.json(); } catch (e) { }
    if (!r.ok) {
      const reason = j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
      if (reason === 'storageQuotaExceeded' || reason === 'quotaExceeded')
        throw Object.assign(new Error('Your Google Drive is full'), { code: 'quota' });
      throw Object.assign(new Error((j && j.error && j.error.message) || ('Google Drive error ' + r.status)), { code: 'http' });
    }
    return j;
  }
  const q = s => encodeURIComponent(s);

  /* A folder MindNote made, found again by a tag rather than by name, so
     every device lands in the same one and renaming it in Drive is fine. */
  async function findOrMakeFolder(tagKey, tagVal, name, parent) {
    const query = `mimeType='${FOLDER}' and trashed=false and appProperties has { key='${tagKey}' and value='${tagVal}' }`;
    const found = await api('GET', `/files?q=${q(query)}&fields=files(id)&pageSize=1&spaces=drive`);
    if (found && found.files && found.files[0]) return found.files[0].id;
    const made = await api('POST', '/files?fields=id', {
      name, mimeType: FOLDER, appProperties: { [tagKey]: tagVal }, parents: parent ? [parent] : undefined
    });
    return made.id;
  }
  /* Several files attached at once must not each create their own folder,
     so a lookup in progress is shared, and a found folder remembered. A
     failed lookup is forgotten, so the next attempt asks again. */
  const folderMemo = {};
  function memo(key, make) {
    if (!folderMemo[key]) folderMemo[key] = make().catch(e => { delete folderMemo[key]; throw e; });
    return folderMemo[key];
  }
  function folderFor(docId, docName) {
    return memo('root', () => findOrMakeFolder('mnRoot', '1', 'MindNote Attachments'))
      .then(root => memo('doc:' + docId, () =>
        findOrMakeFolder('mnDoc', docId, (docName || 'Untitled map').replace(/[\\/]/g, '-'), root)));
  }

  /* --------------------------- upload ------------------------------- */
  /* Returns a handle with .cancel() and a .done promise that resolves with
     the Drive file record. Progress is reported as a 0..1 fraction. */
  function upload(file, docId, docName, nodeId, onProgress) {
    let xhr = null, cancelled = false;
    const done = (async () => {
      if (!hasToken()) throw Object.assign(new Error('Not connected to Google Drive'), { code: 'auth' });
      const parent = await folderFor(docId, docName);
      const type = file.type || 'application/octet-stream';
      let start;
      try {
        start = await fetch(`${UPLOAD}?uploadType=resumable&fields=${q(FIELDS)}`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': type,
            'X-Upload-Content-Length': String(file.size)
          },
          body: JSON.stringify({ name: file.name, parents: [parent], appProperties: { mnNode: nodeId } })
        });
      } catch (e) { throw Object.assign(new Error('Google Drive is unavailable — your notes are safe'), { code: 'net' }); }
      if (start.status === 401) { token = null; throw Object.assign(new Error('Google Drive sign-in has expired'), { code: 'auth' }); }
      if (!start.ok) {
        let j = null; try { j = await start.json(); } catch (e) { }
        const reason = j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
        if (reason === 'storageQuotaExceeded') throw Object.assign(new Error('Your Google Drive is full'), { code: 'quota' });
        throw new Error('Google Drive refused the upload (' + start.status + ')');
      }
      const session = start.headers.get('Location');
      if (!session) throw new Error('Google Drive did not start the upload');

      /* send in chunks; a dropped chunk is asked about and resumed */
      const send = (from, to) => new Promise((resolve, reject) => {
        xhr = new XMLHttpRequest();
        xhr.open('PUT', session);
        if (file.size > 0) xhr.setRequestHeader('Content-Range', `bytes ${from}-${to - 1}/${file.size}`);
        xhr.upload.onprogress = e => { if (onProgress && file.size) onProgress((from + e.loaded) / file.size); };
        xhr.onload = () => resolve(xhr);
        xhr.onerror = () => reject(Object.assign(new Error('network'), { code: 'net' }));
        xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { code: 'cancel' }));
        xhr.send(file.size > 0 ? file.slice(from, to) : null);
      });
      const askWhere = () => new Promise(resolve => {
        const x = new XMLHttpRequest();
        x.open('PUT', session);
        x.setRequestHeader('Content-Range', `bytes */${file.size}`);
        x.onload = () => resolve(x);
        x.onerror = () => resolve(null);
        x.send(null);
      });
      const finished = x => { try { return JSON.parse(x.responseText); } catch (e) { return null; } };

      /* The rest of the file goes in one request (progress still shows as
         it travels). Only if the connection drops is Drive asked how much
         it already has, and the upload carries on from there — or, if the
         answer cannot be read, starts again from the beginning. */
      let offset = 0, retries = 0;
      for (;;) {
        if (cancelled) throw Object.assign(new Error('Upload cancelled'), { code: 'cancel' });
        let x;
        try { x = await send(offset, file.size); }
        catch (e) {
          if (e.code === 'cancel') throw e;
          x = null;
        }
        if (x && (x.status === 200 || x.status === 201)) return finished(x);
        if (x && x.status === 401) { token = null; throw Object.assign(new Error('Google Drive sign-in expired during the upload'), { code: 'auth' }); }
        if (x && x.status >= 400 && x.status < 500 && x.status !== 408 && x.status !== 429)
          throw new Error('Google Drive refused the upload (' + x.status + ')');
        if (++retries > 5) throw Object.assign(new Error('The upload kept failing — check the connection and try again'), { code: 'net' });
        await new Promise(r => setTimeout(r, 1500 * retries));
        if (cancelled) throw Object.assign(new Error('Upload cancelled'), { code: 'cancel' });
        const s2 = await askWhere();
        if (s2 && (s2.status === 200 || s2.status === 201)) return finished(s2);
        const range = s2 && s2.status === 308 ? s2.getResponseHeader('Range') : null;
        offset = range ? Number(range.split('-')[1]) + 1 : 0;
        if (!(offset >= 0 && offset <= file.size)) offset = 0;
      }
    })().then(f => {
      if (!f || !f.id) throw new Error('Google Drive did not confirm the upload');
      return f;
    });
    return { done, cancel: () => { cancelled = true; if (xhr) try { xhr.abort(); } catch (e) { } } };
  }

  /* ------------------------ file operations ------------------------- */
  const info = id => api('GET', `/files/${id}?fields=${q(FIELDS)}`);
  const rename = (id, name) => api('PATCH', `/files/${id}?fields=${q(FIELDS)}`, { name });
  /* "Delete from Drive" moves the file to Drive's bin, where it stays
     recoverable for thirty days, rather than erasing it outright. */
  const trash = id => api('PATCH', `/files/${id}?fields=id`, { trashed: true });

  /* ------------------------------ links ----------------------------- */
  const OFFICE = {
    doc: ['application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/rtf', 'application/vnd.oasis.opendocument.text'],
    sheet: ['application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet'],
    slide: ['application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation']
  };
  const who = () => account ? 'authuser=' + encodeURIComponent(account) : '';
  const join = (url, extra) => extra ? url + (url.includes('?') ? '&' : '?') + extra : url;
  /* Office files open in Google's editor in their own format (no
     conversion); Google's own files in their editor; anything else in
     Drive's viewer. The account is named, so a browser signed in to
     several Google accounts opens the right one. */
  function openUrl(f) {
    const id = encodeURIComponent(f.driveId), m = f.mime || '';
    if (m === 'application/vnd.google-apps.document') return join(`https://docs.google.com/document/d/${id}/edit`, who());
    if (m === 'application/vnd.google-apps.spreadsheet') return join(`https://docs.google.com/spreadsheets/d/${id}/edit`, who());
    if (m === 'application/vnd.google-apps.presentation') return join(`https://docs.google.com/presentation/d/${id}/edit`, who());
    if (OFFICE.doc.includes(m)) return join(`https://docs.google.com/document/d/${id}/edit?rtpof=true&sd=true`, who());
    if (OFFICE.sheet.includes(m)) return join(`https://docs.google.com/spreadsheets/d/${id}/edit?rtpof=true&sd=true`, who());
    if (OFFICE.slide.includes(m)) return join(`https://docs.google.com/presentation/d/${id}/edit?rtpof=true&sd=true`, who());
    return driveUrl(f);
  }
  const driveUrl = f => join(`https://drive.google.com/file/d/${encodeURIComponent(f.driveId)}/view`, who());
  const downloadUrl = f => join(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(f.driveId)}`, who());

  window.MNDrive = {
    preload, signIn, signOut, hasToken, upload, info, rename, trash,
    openUrl, driveUrl, downloadUrl,
    account: () => account
  };
})();
