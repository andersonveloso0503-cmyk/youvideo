// fal.ai: separação de voz/instrumental (Demucs) e geração de trecho cantado (MiniMax Music)
// POST { tipo: 'separar', audioUrl }            -> { statusUrl, responseUrl }
// POST { tipo: 'gerarVoz', prompt, letra }       -> { statusUrl, responseUrl }
// GET  ?statusUrl=...&responseUrl=...            -> { pronto, status, resultado }

export const config = { maxDuration: 60 };

const MODELOS = {
  separar: 'fal-ai/demucs',
  gerarVoz: 'fal-ai/minimax-music/v2',
};

function mensagemFal(d, status) {
  if (!d) return `fal.ai respondeu ${status}`;
  if (typeof d.detail === 'string') return d.detail;
  if (Array.isArray(d.detail)) return d.detail.map((x) => x.msg || JSON.stringify(x)).join(' | ');
  return d.error || d.message || `fal.ai respondeu ${status}`;
}

export default async function handler(req, res) {
  const key = process.env.FAL_KEY;
  if (!key) return res.status(500).json({ erro: 'FAL_KEY não está configurada na Vercel.' });
  const headers = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };

  try {
    if (req.method === 'POST') {
      const { tipo, audioUrl, prompt, letra } = req.body || {};
      let modelo;
      let input;

      if (tipo === 'separar') {
        if (!audioUrl || !/^https:\/\//.test(audioUrl)) return res.status(400).json({ erro: 'audioUrl inválida.' });
        modelo = MODELOS.separar;
        input = { audio_url: audioUrl, output_format: 'mp3' };
      } else if (tipo === 'gerarVoz') {
        if (!prompt || !letra) return res.status(400).json({ erro: 'Faltou prompt ou letra.' });
        modelo = MODELOS.gerarVoz;
        input = { prompt: String(prompt).slice(0, 300), lyrics_prompt: String(letra).slice(0, 3000) };
      } else {
        return res.status(400).json({ erro: 'tipo inválido.' });
      }

      const r = await fetch(`https://queue.fal.run/${modelo}`, { method: 'POST', headers, body: JSON.stringify(input) });
      const d = await r.json().catch(() => null);
      if (!r.ok) return res.status(500).json({ erro: mensagemFal(d, r.status) });
      return res.status(200).json({ statusUrl: d.status_url, responseUrl: d.response_url });
    }

    if (req.method === 'GET') {
      const { statusUrl, responseUrl } = req.query;
      const ok = (u) => typeof u === 'string' && u.startsWith('https://queue.fal.run/');
      if (!ok(statusUrl) || !ok(responseUrl)) return res.status(400).json({ erro: 'URLs de acompanhamento inválidas.' });

      const s = await fetch(statusUrl, { headers });
      const sd = await s.json().catch(() => null);
      if (!s.ok) return res.status(500).json({ erro: mensagemFal(sd, s.status) });

      if (sd.status !== 'COMPLETED') {
        return res.status(200).json({ pronto: false, status: sd.status, fila: sd.queue_position ?? null });
      }

      const r = await fetch(responseUrl, { headers });
      const d = await r.json().catch(() => null);
      if (!r.ok) return res.status(500).json({ erro: mensagemFal(d, r.status) });
      return res.status(200).json({ pronto: true, resultado: d });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
