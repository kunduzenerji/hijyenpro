// Shared Google Calendar helpers for Cloudflare Workers (Web Crypto API)

export async function getGoogleAccessToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const encode = obj =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const header  = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600
  });

  const signingInput = `${header}.${payload}`;

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const keyData = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signingInput}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });

  const { access_token } = await tokenRes.json();
  return access_token;
}

// Create a calendar event for a confirmed reservation
export async function createCalendarEvent(env, reservation, durationHours) {
  const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const [year, month, day] = reservation.date.split('-').map(Number);
  const [hour, minute]     = reservation.time.split(':').map(Number);

  const start = new Date(year, month - 1, day, hour, minute);
  const end   = new Date(year, month - 1, day, hour + durationHours, minute);

  const toISO = d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;

  const event = {
    summary:     `${reservation.service} — ${reservation.name}`,
    description: `📞 ${reservation.phone}\nRezarvasyon #${reservation.id}`,
    start: { dateTime: toISO(start), timeZone: 'Europe/Istanbul' },
    end:   { dateTime: toISO(end),   timeZone: 'Europe/Istanbul' }
  };

  const calId = encodeURIComponent(env.GOOGLE_CALENDAR_ID);
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(event)
  });
}

// Return booked slots from Google Calendar for a given month ("2026-06")
export async function getCalendarBookedSlots(env, month) {
  const token = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const [y, m] = month.split('-').map(Number);
  const timeMin = `${month}-01T00:00:00+03:00`;
  const lastDay = new Date(y, m, 0).getDate();
  const timeMax = `${month}-${String(lastDay).padStart(2,'0')}T23:59:59+03:00`;

  const calId = encodeURIComponent(env.GOOGLE_CALENDAR_ID);
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events` +
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&orderBy=startTime`;

  const res    = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data   = await res.json();
  const events = data.items || [];

  const booked = [];
  for (const ev of events) {
    const startStr = ev.start?.dateTime;
    if (!startStr) continue;

    const startDt  = new Date(startStr);
    const endDt    = new Date(ev.end?.dateTime || startStr);
    const hours    = Math.ceil((endDt - startDt) / 3_600_000) || 1;

    const dateStr  = startStr.slice(0, 10); // "2026-06-15"
    const h        = startDt.getUTCHours() + 3; // UTC+3 Istanbul
    const timeStr  = `${String(h).padStart(2,'0')}:${String(startDt.getUTCMinutes()).padStart(2,'0')}`;

    for (let i = 0; i < hours; i++) {
      booked.push({ date: dateStr, time: `${String(h + i).padStart(2,'0')}:${String(startDt.getUTCMinutes()).padStart(2,'0')}` });
    }
  }

  return booked;
}
