const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

export async function onRequestPost({ request, env }) {
  try {
    const { name, phone, service, ilce, adres, date, time } = await request.json();

    if (!name || !phone || !service || !ilce || !adres || !date || !time) {
      return Response.json({ error: 'Eksik bilgi' }, { status: 400, headers: CORS });
    }

    const { meta } = await env.DB.prepare(
      'INSERT INTO reservations (name, phone, service, ilce, adres, date, time) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(name, phone, service, ilce, adres, date, time).run();

    const id = meta.last_row_id;

    // Format date as D/M/Y for display
    const [dy, dm, dd] = date.split('-');
    const displayDate = `${parseInt(dd)}/${parseInt(dm)}/${dy}`;

    // Format customer phone for WhatsApp deep link (for company reference in Telegram)
    const digits = phone.replace(/\D/g, '');
    const waCustomer = digits.startsWith('0') ? '90' + digits.slice(1) : digits;

    const tgText = [
      `📋 *Yeni Rezervasyon #${id}*`,
      `👤 ${name}`,
      `📅 ${displayDate} · ${time}`,
      `🛋️ ${service}`,
      `📍 ${ilce} / ${adres}`,
      `📞 [${phone}](https://wa.me/${waCustomer})`,
      ``,
      `✅ Onaylamak için: \`kabul ${id} [kaç saat]\``,
      `❌ İptal için: \`iptal ${id}\``
    ].join('\n');

    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: tgText,
        parse_mode: 'Markdown'
      })
    });

    return Response.json({ success: true, id }, { headers: CORS });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
