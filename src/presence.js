// Stato live delle operatrici (in memoria) + log persistente dei tempi per stato
const db = require('./db');
const map = new Map(); // user_id -> { stato, contact, campaign_id, since, last_seen }

const closeOpen = db.prepare("UPDATE user_status_log SET ended_at = last_beat WHERE user_id = ? AND ended_at IS NULL");
const insertLog = db.prepare("INSERT INTO user_status_log (user_id, stato) VALUES (?, ?)");
const touchLog = db.prepare("UPDATE user_status_log SET last_beat = datetime('now') WHERE user_id = ? AND ended_at IS NULL");

function beat(userId, data) {
  const prev = map.get(userId) || {};
  const stato = data.stato || 'idle';
  const changed = prev.stato !== stato;
  if (changed) {
    try { closeOpen.run(userId); insertLog.run(userId, stato); } catch {}
  } else {
    try { touchLog.run(userId); } catch {}
  }
  map.set(userId, {
    stato,
    contact: data.contact || null,
    campaign_id: data.campaign_id || null,
    since: changed || !prev.since ? new Date().toISOString() : prev.since,
    last_seen: new Date().toISOString()
  });
}

function snapshot() {
  const out = [];
  const cutoff = Date.now() - 30000;
  for (const [userId, s] of map.entries()) {
    out.push({ user_id: userId, online: new Date(s.last_seen).getTime() > cutoff, ...s });
  }
  return out;
}

module.exports = { beat, snapshot };
