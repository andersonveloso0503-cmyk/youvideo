// Integração com o VisionStory (visionstory.ai) — serviço externo de
// "Music Video" que converte 1 foto + 1 música num vídeo cantando, com a
// pessoa se movendo na cena (é o serviço mais parecido com o MusicLab que
// achamos até agora).
//
// PRECISA da variável VISIONSTORY_API_KEY configurada na Vercel — crie a
// chave de graça em https://developers.visionstory.ai/api-keys (tem 10
// créditos grátis, dá pra uns 30s de vídeo de teste antes de precisar pagar).
//
// Aviso: como a documentação pública deles não deixa 100% claro o formato
// exato do corpo da requisição, os nomes de campo abaixo são a melhor
// aposta com base na documentação oficial (POST /videos, header
// X-API-Key). Se o primeiro teste der erro de validação, me manda a
// mensagem exata que eu ajusto na hora — mesmo processo que fizemos com
// os modelos do Replicate.
//
// POST { imagemUrl, audioUrl }  -> { id }
// GET  ?id=...                   -> { pronto, status, url }

export const config = { maxDuration: 60 };

const BASE_URL = 'https://openapi.visionstory.ai';

function acharUrl(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') return /^https?:\/\//.test(obj) ? obj : null;
  if (Array.isArray(obj)) { for (const v of obj) { const u = acharUrl(v); if (u) return u; } return null; }
  if (typeof obj === 'object') { for (const v of Object.values(obj)) { const u = acharUrl(v); if (u) return u; } }
  return null;
}

export default async function handler(req, res) {
  const apiKey = process.env.VISIONSTORY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      erro: 'VISIONSTORY_API_KEY não está configurada na Vercel. Crie uma conta grátis e gere a chave em developers.visionstory.ai/api-keys, depois adicione essa variável.',
    });
  }
  const headers = { 'X-API-Key': apiKey, 'Content-Type': 'application/json' };

  try {
    if (req.method === 'POST') {
      const { imagemUrl, audioUrl } = req.body || {};
      if (!imagemUrl) return res.status(400).json({ erro: 'Faltou a foto/imagem do personagem.' });
      if (!audioUrl) return res.status(400).json({ erro: 'Faltou o áudio da música.' });

      const r = await fetch(`${BASE_URL}/videos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'music_video',
          photo_url: imagemUrl,
          audio_url: audioUrl,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) return res.status(500).json({ erro: d?.message || d?.error || `VisionStory respondeu ${r.status}` });
      const id = d?.data?.video_id || d?.data?.id || d?.video_id || d?.id;
      if (!id) return res.status(500).json({ erro: 'VisionStory não devolveu um id de vídeo.', bruto: d });
      return res.status(200).json({ id });
    }

    if (req.method === 'GET') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ erro: 'id inválido.' });
      const r = await fetch(`${BASE_URL}/videos/${id}`, { headers });
      const d = await r.json().catch(() => null);
      if (!r.ok) return res.status(500).json({ erro: d?.message || d?.error || `VisionStory respondeu ${r.status}` });

      const dados = d?.data || d;
      const status = dados?.status;
      if (status === 'success' || status === 'completed' || status === 'created') {
        const url = acharUrl(dados?.video_url) || acharUrl(dados);
        if (!url) return res.status(500).json({ erro: 'O VisionStory terminou mas não devolveu vídeo.', bruto: d });
        return res.status(200).json({ pronto: true, status, url });
      }
      if (status === 'failed' || status === 'error') {
        return res.status(500).json({ erro: `Falhou no VisionStory: ${dados?.error || status}` });
      }
      return res.status(200).json({ pronto: false, status: status || 'processando' });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
