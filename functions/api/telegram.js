import { createCalendarEvent } from './_gcal.js';

async function sendTelegram(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const update = await request.json();
    const msg    = update?.message;
    if (!msg) return new Response('ok');

    const chatId = String(msg.chat.id);
    const text   = (msg.text || '').trim();

    // /start — returns the chat ID so it can be saved as a secret
    if (text === '/start') {
      await sendTelegram(env.TELEGRAM_TOKEN, chatId,
        `Merhaba! HijyenPro Bot aktif 🎉\n\nSizin Chat ID'niz: \`${chatId}\`\n\nBu numarayı Cloudflare'de *TELEGRAM_CHAT_ID* olarak kaydedin.`
      );
      return new Response('ok');
    }

    // Ignore messages from anyone other than the company
    if (chatId !== String(env.TELEGRAM_CHAT_ID)) return new Response('ok');

    const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();

    // kabul [id] [saat]
    const kabul = lower.match(/^kabul\s+(\d+)\s+(\d+)/);
    if (kabul) {
      const id    = parseInt(kabul[1]);
      const hours = parseInt(kabul[2]);

      const row = await env.DB.prepare('SELECT * FROM reservations WHERE id = ?').bind(id).first();

      if (!row) {
        await sendTelegram(env.TELEGRAM_TOKEN, chatId, `❌ #${id} numaralı rezervasyon bulunamadı.`);
        return new Response('ok');
      }
      if (row.status === 'confirmed') {
        await sendTelegram(env.TELEGRAM_TOKEN, chatId, `ℹ️ #${id} zaten onaylanmış.`);
        return new Response('ok');
      }

      // Update DB
      await env.DB.prepare(
        `UPDATE reservations SET status = 'confirmed', duration_hours = ? WHERE id = ?`
      ).bind(hours, id).run();

      // Create Google Calendar event
      try {
        await createCalendarEvent(env, { ...row, id }, hours);
      } catch (gcalErr) {
        console.error('Google Calendar event creation failed:', gcalErr.message);
        // non-fatal — booking is still confirmed in DB
      }

      await sendTelegram(env.TELEGRAM_TOKEN, chatId,
        `✅ *Rezervasyon #${id} onaylandı!*\n👤 ${row.name}\n📅 ${row.date} · ${row.time} (${hours} saat)\n🛋️ ${row.service}\n📅 Google Takvim'e eklendi.`
      );
      return new Response('ok');
    }

    // iptal [id]
    const iptal = lower.match(/^iptal\s+(\d+)/);
    if (iptal) {
      const id  = parseInt(iptal[1]);
      const row = await env.DB.prepare('SELECT * FROM reservations WHERE id = ?').bind(id).first();

      if (!row) {
        await sendTelegram(env.TELEGRAM_TOKEN, chatId, `❌ #${id} numaralı rezervasyon bulunamadı.`);
        return new Response('ok');
      }

      await env.DB.prepare(`UPDATE reservations SET status = 'cancelled' WHERE id = ?`).bind(id).run();

      await sendTelegram(env.TELEGRAM_TOKEN, chatId,
        `🚫 *Rezervasyon #${id} iptal edildi.*\n👤 ${row.name}\n📅 ${row.date} · ${row.time}`
      );
      return new Response('ok');
    }

    // Unknown
    await sendTelegram(env.TELEGRAM_TOKEN, chatId,
      `❓ Anlamadım.\n\nKullanım:\n• \`kabul [no] [saat]\` — onaylamak için\n• \`iptal [no]\` — iptal için`
    );
    return new Response('ok');

  } catch (err) {
    console.error(err);
    return new Response('ok');
  }
}
