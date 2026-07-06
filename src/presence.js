// Stato live delle operatrici (in memoria)
const map = new Map(); // user_id -> { stato, contact, campaign_id, since, last_seen }

function beat(userId, data) {
  const prev = map.get(userId) || {};
  const changed = prev.stato !== data.stato || (prev.contact && data.contact && prev.contact.id !== data.contact.id);
  map.set(userId, {
    stato: data.stato || 'idle',           // idle | in_chiamata | in_esito
    contact: data.contact || null,          // {id, nome, telefono}
    campaign_id: data.campaign_id || null,
    since: changed || !prev.since ? new Date().toISOString() : prev.since,
    last_seen: new Date().toISOString()
  });
}

function snapshot() {
  const out = [];
  const cutoff = Date.now() - 30000; // offline dopo 30s senza heartbeat
  for (const [userId, s] of map.entries()) {
    out.push({ user_id: userId, online: new Date(s.last_seen).getTime() > cutoff, ...s });
  }
  return out;
}

module.exports = { beat, snapshot };
