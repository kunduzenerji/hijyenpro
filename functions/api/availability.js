import { getCalendarBookedSlots } from './_gcal.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

export async function onRequestGet({ request, env }) {
  try {
    const month = new URL(request.url).searchParams.get('month'); // "2026-06"

    // ── 1. Cloudflare D1 confirmed reservations ──────────────────────────────
    const { results } = await env.DB.prepare(
      `SELECT date, time, duration_hours
       FROM reservations
       WHERE status = 'confirmed' AND date LIKE ?
       ORDER BY date, time`
    ).bind(month ? `${month}%` : '%').all();

    const dbBooked = [];
    for (const r of results) {
      const [h, min] = r.time.split(':').map(Number);
      const hours = r.duration_hours || 1;
      for (let i = 0; i < hours; i++) {
        dbBooked.push({
          date: r.date,
          time: `${String(h + i).padStart(2, '0')}:${String(min).padStart(2, '0')}`
        });
      }
    }

    // ── 2. Google Calendar events ────────────────────────────────────────────
    let gcalBooked = [];
    if (month && env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GOOGLE_CALENDAR_ID) {
      try {
        gcalBooked = await getCalendarBookedSlots(env, month);
      } catch (gcalErr) {
        console.error('Google Calendar fetch failed:', gcalErr.message);
        // non-fatal — fall back to DB only
      }
    }

    // ── 3. Merge & deduplicate ───────────────────────────────────────────────
    const seen  = new Set();
    const booked = [];
    for (const slot of [...dbBooked, ...gcalBooked]) {
      const key = `${slot.date}|${slot.time}`;
      if (!seen.has(key)) {
        seen.add(key);
        booked.push(slot);
      }
    }

    return Response.json({ booked }, { headers: CORS });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
