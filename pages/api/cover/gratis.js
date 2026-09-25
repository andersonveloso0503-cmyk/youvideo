// Separação GRÁTIS via GitHub Actions (workflow .github/workflows/separar.yml)
// POST { audioUrl, titulo } -> { jobId }
// GET  ?id=jobId            -> { status: 'na-fila' | 'rodando' | 'pronto' | 'erro', projeto? }

import { list } from '@vercel/blob';

export const config = { maxDuration: 30 };

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
const REPO = process.env.GITHUB_REPO || 'andersonveloso0503-cmyk/youvideo';

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const gh = process.env.GITHUB_DISPATCH_TOKEN;
      if (!gh) return res.status(500).json({ erro: 'GITHUB_DISPATCH_TOKEN não está configurado na Vercel.' });
      const { audioUrl, titulo } = req.body || {};
      if (!audioUrl || !/^https:\/\//.test(audioUrl)) return res.status(400).json({ erro: 'audioUrl inválida.' });

      const jobId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gh}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'youvideo',
        },
        body: JSON.stringify({ event_type: 'separar', client_payload: { audioUrl, titulo: String(titulo || '').slice(0, 100), jobId } }),
      });
      if (r.status !== 204) {
        const t = await r.text().catch(() => '');
        return res.status(500).json({ erro: `GitHub recusou (${r.status}). Confira o token e o repositório. ${t.slice(0, 200)}` });
      }
      return res.status(200).json({ jobId });
    }

    if (req.method === 'GET') {
      const { id } = req.query;
      if (!id || !/^[a-z0-9]+$/i.test(id)) return res.status(400).json({ erro: 'id inválido.' });
      const { blobs } = await list({ prefix: `cover/jobs/${id}/`, token: BLOB_TOKEN });
      const achou = (nome) => blobs.find((b) => b.pathname.endsWith(`/${nome}.json`));
      const pronto = achou('pronto');
      if (pronto) {
        const d = await (await fetch(pronto.url, { cache: 'no-store' })).json().catch(() => ({}));
        return res.status(200).json({ status: 'pronto', projeto: d.projeto || null });
      }
      if (achou('erro')) return res.status(200).json({ status: 'erro' });
      if (achou('rodando')) return res.status(200).json({ status: 'rodando' });
      return res.status(200).json({ status: 'na-fila' });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
