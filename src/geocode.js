// Geocoding offline dei comuni italiani (comune + provincia + CAP)
const comuni = require('./comuni.json');

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

const byName = new Map();
const byCap = new Map();
for (const c of comuni) {
  if (!byName.has(c.k)) byName.set(c.k, []);
  byName.get(c.k).push(c);
  for (const cap of c.c) {
    if (!byCap.has(cap)) byCap.set(cap, []);
    byCap.get(cap).push(c);
  }
}
const allKeys = [...byName.keys()];

// Ritorna { lat, lng, comune, provincia } oppure null
function geocode({ comune, provincia, cap }) {
  const key = norm(comune);
  const prov = String(provincia || '').trim().toUpperCase();
  const capS = String(cap || '').replace(/[^0-9]/g, '');

  let cands = key ? (byName.get(key) || []).slice() : [];
  // nome non trovato: match parziale (es. "Corigliano Rossano" vs "Corigliano-Rossano")
  if (!cands.length && key && key.length >= 5) {
    // solo differenze piccole (es. suffissi/prefissi di 1-3 caratteri), per evitare falsi positivi
    const near = allKeys.filter(k => (k.startsWith(key) || key.startsWith(k)) && Math.abs(k.length - key.length) <= 3);
    cands = near.flatMap(k => byName.get(k));
  }
  // disambiguazione con provincia e CAP
  if (cands.length > 1 && prov) { const f = cands.filter(x => x.p === prov); if (f.length) cands = f; }
  if (cands.length > 1 && capS) { const f = cands.filter(x => x.c.includes(capS)); if (f.length) cands = f; }
  // niente nome: prova dal solo CAP
  if (!cands.length && capS) {
    cands = (byCap.get(capS) || []).slice();
    if (cands.length > 1 && prov) { const f = cands.filter(x => x.p === prov); if (f.length) cands = f; }
  }
  // se il nome c'è ma la provincia non combacia, accetta comunque il nome esatto
  const hit = cands.find(x => x.lat != null);
  if (!hit) return null;
  return { lat: hit.lat, lng: hit.lng, comune: hit.n, provincia: hit.p };
}

module.exports = { geocode };
