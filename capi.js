// Meta Conversions API (CAPI) — envia o evento "Lead" pelo servidor.
// Dedup com o pixel via event_id. PII (email/telefone) é enviada com hash SHA-256.
// Variáveis de ambiente no Vercel: FB_CAPI_TOKEN (obrigatória), FB_PIXEL_ID (opcional), FB_TEST_EVENT_CODE (opcional, p/ testar).
import crypto from 'crypto';

const sha256 = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

function normPhone(p) {
  let d = String(p).replace(/\D/g, '');
  if (!d) return '';
  if (d.length <= 11) d = '55' + d; // assume Brasil se vier sem DDI
  return d;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, reason: 'method' }); return; }

  const TOKEN = process.env.FB_CAPI_TOKEN;
  const PIXEL = process.env.FB_PIXEL_ID || '968885909519546';
  const TEST_CODE = process.env.FB_TEST_EVENT_CODE || '';
  if (!TOKEN) { res.status(200).json({ ok: false, reason: 'missing FB_CAPI_TOKEN' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const user_data = {};
  if (body.email) user_data.em = [sha256(body.email)];
  const ph = normPhone(body.phone || '');
  if (ph) user_data.ph = [sha256(ph)];
  if (body.fbp) user_data.fbp = body.fbp;
  if (body.fbc) user_data.fbc = body.fbc;
  user_data.client_ip_address = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  user_data.client_user_agent = req.headers['user-agent'] || '';

  const event = {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: body.event_source_url || 'https://cafe-e-direcao.vercel.app/',
    user_data
  };
  if (body.event_id) event.event_id = body.event_id;

  const payload = { data: [event] };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL}/events?access_token=${encodeURIComponent(TOKEN)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    res.status(200).json({ ok: r.ok, fb: j });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
}
