/* =====================================================================
   /api/sync — stores one workspace per code and merges what arrives.
   Runs on Vercel as a serverless function. No npm packages needed.

   It reads whichever pair of environment variables your Redis
   integration created:
     KV_REST_API_URL        + KV_REST_API_TOKEN          (Upstash via Vercel)
     UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (Upstash direct)
   ===================================================================== */

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.REDIS_REST_API_URL || '';

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.REDIS_REST_API_TOKEN || '';

/* The workspace itself never expires. Losing a year of notes because the
   app went unopened would be the worst thing this service could do.

   Budget for a ~30 MB Redis plan, with a large safety margin (images are
   never part of this payload — see imageId in app.js — so this is a
   budget for text and structure only):
     current workspace   5 MB max  (MAX_BYTES, matches the client)
     recovery history     5 MB max (5 versions x 1 MB, see HISTORY_*)
     -----------------------------
     total                10 MB of the ~30 MB available, comfortably clear
   of Redis key/metadata overhead and any future growth. */
const MAX_BYTES = 5 * 1024 * 1024;
const HISTORY_KEEP = 5;                      // versions kept for recovery
const HISTORY_EVERY = 10 * 60 * 1000;        // at most one version per 10 minutes
const HISTORY_MAX_BYTES = 1 * 1024 * 1024;   // do not archive very large workspaces
const HISTORY_TTL = 60 * 60 * 24 * 730;      // the trail itself is dropped after two years
const SCHEMA = 1;

async function redis(command) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  const text = await r.text();
  let json = {};
  try { json = JSON.parse(text); } catch (e) { throw new Error('Storage replied with something unreadable'); }
  if (!r.ok || json.error) throw new Error(json.error || ('Storage error ' + r.status));
  return json.result;
}

function cleanCode(code) {
  const c = String(code || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{5,63}$/.test(c) ? c : null;
}
const keyFor = code => 'mindnote:' + code;
const histKeyFor = code => 'mindnote:' + code + ':history';

const empty = () => ({ docs: {}, order: [], deleted: {}, rev: 0, schemaVersion: SCHEMA });

/* newest whole document wins; a deletion wins if it happened later */
function merge(base, incoming) {
  const deleted = Object.assign({}, base.deleted || {}, {});
  for (const [id, ts] of Object.entries(incoming.deleted || {})) {
    if (!deleted[id] || ts > deleted[id]) deleted[id] = ts;
  }
  const docs = {};
  const ids = new Set([...Object.keys(base.docs || {}), ...Object.keys(incoming.docs || {})]);
  for (const id of ids) {
    const a = (base.docs || {})[id], b = (incoming.docs || {})[id];
    const pick = !a ? b : !b ? a : ((b.updated || 0) >= (a.updated || 0) ? b : a);
    if (!pick) continue;
    if ((deleted[id] || 0) > (pick.updated || 0)) continue;
    docs[id] = pick;
  }
  const order = [];
  for (const id of [...(incoming.order || []), ...(base.order || [])]) {
    if (docs[id] && !order.includes(id)) order.push(id);
  }
  for (const id of Object.keys(docs)) if (!order.includes(id)) order.push(id);
  return {
    docs, order, deleted,
    rev: (base.rev || 0) + 1,
    schemaVersion: incoming.schemaVersion || base.schemaVersion || SCHEMA
  };
}

/* Keep a short trail of earlier versions so a mistaken edit or deletion
   can be undone from any device, even days later. */
async function archive(code, state) {
  const body = JSON.stringify(state);
  if (body.length > HISTORY_MAX_BYTES) return;
  await redis(['LPUSH', histKeyFor(code), body]);
  await redis(['LTRIM', histKeyFor(code), '0', String(HISTORY_KEEP - 1)]);
  await redis(['EXPIRE', histKeyFor(code), String(HISTORY_TTL)]);
}
function describe(raw, index) {
  try {
    const st = JSON.parse(raw);
    const docs = Object.values(st.docs || {});
    return {
      index,
      savedAt: docs.reduce((a, d) => Math.max(a, d.updated || 0), 0),
      documents: docs.length,
      nodes: docs.reduce((a, d) => a + Object.keys(d.nodes || {}).length, 0),
      bytes: raw.length,
      names: docs.map(d => d.name).slice(0, 4)
    };
  } catch (e) {
    return { index, savedAt: 0, documents: 0, nodes: 0, bytes: raw ? raw.length : 0, names: [] };
  }
}

async function readState(code) {
  const raw = await redis(['GET', keyFor(code)]);
  if (!raw) return empty();
  try { return JSON.parse(raw); } catch (e) { return empty(); }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!REDIS_URL || !REDIS_TOKEN) {
    res.status(200).json({
      ok: false,
      reason: 'no-store',
      message: 'Sync storage is not connected to this project yet. See the README, step "Turn on sync".'
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      const code = cleanCode(req.query && req.query.code);
      if (!code) { res.status(400).json({ ok: false, message: 'That workspace code is not valid.' }); return; }

      if (req.query && req.query.history) {
        const rows = await redis(['LRANGE', histKeyFor(code), '0', String(HISTORY_KEEP - 1)]) || [];
        res.status(200).json({ ok: true, versions: rows.map(describe) });
        return;
      }
      const state = await readState(code);
      res.status(200).json({ ok: true, state });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const code = cleanCode(body.code);
      if (!code) { res.status(400).json({ ok: false, message: 'That workspace code is not valid.' }); return; }
      /* Put an earlier version back. The version being replaced is archived
         first, so a restore can itself be undone. */
      if (body.restore != null) {
        const index = parseInt(body.restore, 10);
        if (!(index >= 0 && index < HISTORY_KEEP)) {
          res.status(400).json({ ok: false, message: 'That is not one of the stored versions.' });
          return;
        }
        const raw = await redis(['LINDEX', histKeyFor(code), String(index)]);
        if (!raw) { res.status(404).json({ ok: false, message: 'That version is no longer stored.' }); return; }
        let wanted;
        try { wanted = JSON.parse(raw); } catch (e) { res.status(500).json({ ok: false, message: 'That version could not be read.' }); return; }

        const now = await readState(code);
        await archive(code, now);
        const restored = Object.assign({}, wanted, { rev: (now.rev || 0) + 1, historyAt: Date.now() });
        await redis(['SET', keyFor(code), JSON.stringify(restored)]);
        res.status(200).json({ ok: true, state: restored, restored: true });
        return;
      }

      const incoming = body.state || empty();

      const current = await readState(code);
      const merged = merge(current, incoming);
      const payload = JSON.stringify(merged);

      if (payload.length > MAX_BYTES) {
        res.status(413).json({
          ok: false,
          message: 'This workspace is too large to sync. Try splitting it across documents.'
        });
        return;
      }

      /* Archive the version being replaced, but at most once every ten
         minutes, so a burst of edits does not fill the trail. */
      const lastArchive = current.historyAt || 0;
      if (Object.keys(current.docs || {}).length && Date.now() - lastArchive > HISTORY_EVERY) {
        await archive(code, current);
        merged.historyAt = Date.now();
      } else {
        merged.historyAt = lastArchive;
      }

      /* No expiry: the stored workspace outlives any gap in use. */
      const finalBody = JSON.stringify(merged);
      await redis(['SET', keyFor(code), finalBody]);
      res.status(200).json({ ok: true, state: merged, bytes: finalBody.length, limit: MAX_BYTES });
      return;
    }

    res.status(405).json({ ok: false, message: 'Use GET or POST.' });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || 'Sync failed.' });
  }
};
