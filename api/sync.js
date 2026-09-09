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

const MAX_BYTES = 3 * 1024 * 1024;          // refuse anything bigger
const TTL_SECONDS = 60 * 60 * 24 * 365;      // a year after the last write

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

const empty = () => ({ docs: {}, order: [], deleted: {}, rev: 0 });

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
  return { docs, order, deleted, rev: (base.rev || 0) + 1 };
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
      const state = await readState(code);
      res.status(200).json({ ok: true, state });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const code = cleanCode(body.code);
      if (!code) { res.status(400).json({ ok: false, message: 'That workspace code is not valid.' }); return; }
      const incoming = body.state || empty();

      const current = await readState(code);
      const merged = merge(current, incoming);
      const payload = JSON.stringify(merged);

      if (payload.length > MAX_BYTES) {
        res.status(413).json({ ok: false, message: 'This workspace is too large to sync. Remove some images and try again.' });
        return;
      }
      await redis(['SET', keyFor(code), payload, 'EX', String(TTL_SECONDS)]);
      res.status(200).json({ ok: true, state: merged });
      return;
    }

    res.status(405).json({ ok: false, message: 'Use GET or POST.' });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || 'Sync failed.' });
  }
};
