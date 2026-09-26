// Teste com kwaivgi/kling-lip-sync no Replicate.
//
// IMPORTANTE — esse modelo é diferente dos outros dois: ele NÃO anima uma
// foto parada. Ele pega um VÍDEO já existente de uma pessoa (2 a 10 segundos,
// 720p-1080p, .mp4/.mov, até 100MB) e troca a sincronia da boca pra bater com
// um áudio novo. Ou seja, você precisa de um videozinho curto de alguém
// (pode ser um clipe seu, de câmera, ou gerado por outra IA de vídeo) — não
// dá pra usar só uma foto aqui.
//
// POST { videoUrl, audioUrl }  -> { id }
// GET  ?id=...                  -> { pronto, status, url }

export const config = { maxDuration: 60 };

const MODELO = 'kwaivgi/kling-lip-sync';

const cacheVersao = {};

async function versaoAtual(modelo, headers) {
  if (cacheVersao[modelo]) return cacheVersao[modelo];
  const r = await fetch(`https://api.replicate.com/v1/models/${modelo}`, { headers });
  const d = await r.json().catch(() => null);
  const v = d && d.latest_version && d.latest_version.id;
  if (!r.ok || !v) throw new Error(`Não achei o modelo ${modelo} no Replicate (${d?.detail || r.status}).`);
  cacheVersao[modelo] = v;
  return v;
}

function acharUrl(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') return /^https?:\/\//.test(obj) ? obj : null;
  if (Array.isArray(obj)) { for (const v of obj) { const u = acharUrl(v); if (u) return u; } return null; }
  if (typeof obj === 'object') { for (const v of Object.values(obj)) { const u = acharUrl(v); if (u) return u; } }
  return null;
}

export default async function handler(req, res) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ erro: 'REPLICATE_API_TOKEN não está configurado na Vercel.' });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    if (req.method === 'POST') {
      const { videoUrl, audioUrl } = req.body || {};
      if (!videoUrl) return res.status(400).json({ erro: 'Faltou o vídeo base (2-10s de uma pessoa).' });
      if (!audioUrl) return res.status(400).json({ erro: 'Faltou o áudio da música.' });

      const input = { video_url: videoUrl, audio_file: audioUrl };

      const version = await versaoAtual(MODELO, headers);
      const r = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version, input }),
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
        if (!url) return res.status(500).json({ erro: 'O Replicate terminou mas não devolveu vídeo.' });
        return res.status(200).json({ pronto: true, status: d.status, url });
      }
      if (d.status === 'failed' || d.status === 'canceled') {
        return res.status(500).json({ erro: `Falhou no Replicate: ${d.error || d.status}` });
      }
      return res.status(200).json({ pronto: false, status: d.status });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
