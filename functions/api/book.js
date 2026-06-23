const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

export async function onRequestPost({ request, env }) {
  try {
    const { name, phone, service, date, time } = await request.json();

    if (!name || !phone || !service || !date || !time) {
      return Response.json({ error: 'Eksik bilgi' }, { status: 400, headers: CORS });
    }

    const { meta } = await env.DB.prepare(
      'INSERT INTO reservations (name, phone, service, date, time) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, phone, service, date, time).run();

    const id = meta.last_row_id;

    // Format customer phone for WhatsApp deep link
    const digits = phone.replace(/\D/g, '');
    const waCustomer = digits.startsWith('0') ? '90' + digits.slice(1) : digits;

    // Telegram message to company (Turkish)
    const tgText = [
      `📋 *Yeni Rezervasyon #${id}*`,
      `👤 ${name}`,
      `📅 ${date} · ${time}`,
      `🛋️ ${service}`,
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

    // WhatsApp URL — customer sends this to company
    const waText =
      `Merhaba! ${date} tarihinde saat ${time} için *${service}* hizmeti hakkında randevu talebinde bulunmak istiyorum.\n` +
      `Ad: ${name}\nTelefon: ${phone}\nRezarvasyon No: #${id}`;
    const waUrl = `https://wa.me/${env.COMPANY_PHONE}?text=${encodeURIComponent(waText)}`;

    return Response.json({ success: true, id, waUrl }, { headers: CORS });

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
