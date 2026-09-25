// Replicate: treino de voz (RVC) e geração do cover (realistic-voice-cloning)
// POST { acao: 'treinar', datasetUrl }                              -> { id }
// POST { acao: 'cover', musicaUrl, modeloUrl, tom, volumeVoz }      -> { id }
// GET  ?id=...                                                      -> { pronto, status, url }

export const config = { maxDuration: 60 };

const MODELOS = {
  treinar: 'replicate/train-rvc-model',
  cover: 'zsxkib/realistic-voice-cloning',
};

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

function tomParaRvc(tom) {
  const t = parseInt(tom || 0, 10) || 0;
  if (t < 0) return 'female-to-male';
  if (t > 0) return 'male-to-female';
  return 'no-change';
}

export default async function handler(req, res) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(500).json({ erro: 'REPLICATE_API_TOKEN não está configurado na Vercel.' });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    if (req.method === 'POST') {
      const { acao } = req.body || {};
      let modelo;
      let input;

      if (acao === 'treinar') {
        const { datasetUrl } = req.body;
        if (!datasetUrl || !/^https:\/\//.test(datasetUrl)) return res.status(400).json({ erro: 'Faltou o pacote de treino da voz.' });
        modelo = MODELOS.treinar;
        input = { dataset_zip: datasetUrl, sample_rate: '48k', version: 'v2', f0method: 'rmvpe_gpu', epoch: 60, batch_size: '7' };
      } else if (acao === 'cover') {
        const { musicaUrl, modeloUrl, tom, volumeVoz } = req.body;
        if (!musicaUrl || !modeloUrl) return res.status(400).json({ erro: 'Faltou a música ou a voz.' });
        const vol = Math.max(0.3, Math.min(2, Number(volumeVoz) || 1));
        modelo = MODELOS.cover;
        input = {
          song_input: musicaUrl,
          rvc_model: 'CUSTOM',
          custom_rvc_model_download_url: modeloUrl,
          pitch_change: tomParaRvc(tom),
          index_rate: 0.5,
          protect: 0.33,
          main_vocals_volume_change: Math.round(20 * Math.log10(vol)),
          output_format: 'mp3',
        };
      } else {
        return res.status(400).json({ erro: 'acao inválida.' });
      }

      const version = await versaoAtual(modelo, headers);
      const r = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST', headers, body: JSON.stringify({ version, input }),
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
        if (!url) return res.status(500).json({ erro: 'O Replicate terminou mas não devolveu arquivo.' });
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
