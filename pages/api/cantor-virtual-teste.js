// Teste barato de "cantor virtual": pega uma imagem (o personagem já gerado
// no Youvideo, por exemplo) + o áudio da música e gera um vídeo curto dele
// cantando/mexendo a boca, usando o Replicate (mesma chave já usada no Cover).
//
// Objetivo: dar pra Anderson ver a qualidade ANTES de gastar com serviços
// pagos (Musicful, ilovesong.ai, HeyGen, etc.) ou com modelos mais caros
// (bytedance/omni-human, sync/lipsync-2, kwaivgi/kling-lip-sync).
//
// Modelo usado aqui: cjwbw/sadtalker — foto parada + áudio -> vídeo com boca
// e cabeça se mexendo. É um dos modelos mais baratos do Replicate pra isso
// (poucos centavos por vídeo de teste), por isso foi o escolhido pro POC.
//
// POST { imagemUrl, audioUrl, qualidade }  -> { id }
// GET  ?id=...                              -> { pronto, status, url }

export const config = { maxDuration: 60 };

const MODELO = 'cjwbw/sadtalker';

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
      const { imagemUrl, audioUrl, qualidade } = req.body || {};
      if (!imagemUrl) return res.status(400).json({ erro: 'Faltou a foto/imagem do personagem.' });
      if (!audioUrl) return res.status(400).json({ erro: 'Faltou o áudio da música.' });

      const input = {
        source_image: imagemUrl,
        driven_audio: audioUrl,
        // still=true mantém o corpo parado e só mexe a cabeça/boca — fica
        // mais natural pra um personagem "cantando" parado num cenário.
        still: true,
        preprocess: 'full',
        // Deixa o realce de rosto (GFPGAN) desligado por padrão: deixa o
        // teste mais rápido e mais barato. Pode ligar depois se a qualidade
        // da imagem original for baixa.
        use_enhancer: qualidade === 'alta',
      };

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
