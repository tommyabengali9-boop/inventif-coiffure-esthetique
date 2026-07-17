const { getStore } = require('@netlify/blobs');

const SLOT_MINUTES = 30;

// Horaires réels du salon — index 0 = Dimanche ... 6 = Samedi (Date.getDay())
const HOURS = [
  null,          // Dimanche : fermé
  [[14, 18]],    // Lundi 14h-18h
  [[9, 18]],     // Mardi 9h-18h
  [[9, 13]],     // Mercredi 9h-13h
  [[9, 18]],     // Jeudi 9h-18h
  [[9, 18]],     // Vendredi 9h-18h
  [[9, 17.5]],   // Samedi 9h-17h30
];

function pad(n) { return String(n).padStart(2, '0'); }

function generateSlots(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const ranges = HOURS[day];
  if (!ranges) return [];
  const slots = [];
  for (const [start, end] of ranges) {
    let cur = Math.round(start * 60);
    const endMin = Math.round(end * 60);
    while (cur + SLOT_MINUTES <= endMin) {
      const h = Math.floor(cur / 60), m = cur % 60;
      slots.push(`${pad(h)}:${pad(m)}`);
      cur += SLOT_MINUTES;
    }
  }
  return slots;
}

function getStoreInstance() {
  return getStore({
    name: 'inventif-bookings',
    siteID: process.env.BLOBS_SITE_ID,
    token: process.env.BLOBS_TOKEN,
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const store = getStoreInstance();

    if (event.httpMethod === 'GET') {
      const date = (event.queryStringParameters || {}).date;
      if (!date) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'date manquante' }) };
      }
      const all = generateSlots(date);
      const existingRaw = await store.get(date, { type: 'json' });
      const taken = existingRaw ? Object.keys(existingRaw) : [];
      const available = all.filter(s => !taken.includes(s));
      return { statusCode: 200, headers, body: JSON.stringify({ date, slots: available }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { date, time, name, phone, service } = body;
      if (!date || !time || !name || !phone) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Champs manquants' }) };
      }
      const validSlots = generateSlots(date);
      if (!validSlots.includes(time)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Créneau invalide' }) };
      }
      const existing = (await store.get(date, { type: 'json' })) || {};
      if (existing[time]) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: "Ce créneau vient d'être réservé, merci d'en choisir un autre." }) };
      }
      existing[time] = { name, phone, service: service || 'Non précisé', bookedAt: new Date().toISOString() };
      await store.setJSON(date, existing);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
