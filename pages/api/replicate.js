// Replicate: troca de voz cantada com Seed-VC (zero-shot, só precisa de uma amostra da voz nova)
// POST { vozUrl, amostraUrl, tom }  -> { id }
// GET  ?id=...                       -> { pronto, status, url }

export const config = { maxDuration: 60 };

const VERSAO = process.env.REPLICATE_SEEDVC_VERSION
  || 'e5c68d66f3d156b1b99c71f6ded9634d5989dae4e42c366dd7631579175ccaf0'; // azer/seed-vc

function acharUrl(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') return /^https?:\/\//.test(obj) ? obj : null;
  if (Array.isArray(obj)) { for (const v of obj) { const u = acharUrl(v); if (u) return u; } return null; }
  if (typeof obj === 'object') {
    if (obj.vocals) return acharUrl(obj.vocals);
    for (const v of Object.values(obj)) { const u = acharUrl(v); if (u) return u; }
  }
  return null;
}

export default async function handler(req, res) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ erro: 'REPLICATE_API_TOKEN não está configurado na Vercel.' });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    if (req.method === 'POST') {
      const { vozUrl, amostraUrl, tom } = req.body || {};
      if (!vozUrl || !amostraUrl) return res.status(400).json({ erro: 'Faltou a voz original ou a amostra.' });
      const pitch = Math.max(-12, Math.min(12, parseInt(tom || 0, 10) || 0));

      const r = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: VERSAO, input: { audio: vozUrl, voice_sample: amostraUrl, pitch_shift: pitch } }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) return res.status(500).json({ erro: d?.detail || d?.title || `Replicate respondeu ${r.status}` });
      return res.status(200).json({ id: d.id });
    }

    if (req.method === 'GET') {
      const { id } = req.query;
      if (!id || !/^[a-z0-9]+$/i.test(id)) return res.status(400).json({ erro: 'id inválido.' });

      const r = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers });
      const d = await r.json().catch(() => null);
      if (!r.ok) return res.status(500).json({ erro: d?.detail || `Replicate respondeu ${r.status}` });

      if (d.status === 'succeeded') {
        const url = acharUrl(d.output);
        if (!url) return res.status(500).json({ erro: 'A troca de voz terminou mas não devolveu áudio.' });
        return res.status(200).json({ pronto: true, status: d.status, url });
      }
      if (d.status === 'failed' || d.status === 'canceled') {
        return res.status(500).json({ erro: `Troca de voz falhou: ${d.error || d.status}` });
      }
      return res.status(200).json({ pronto: false, status: d.status });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
