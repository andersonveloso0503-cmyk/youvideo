// Separação GRÁTIS via GitHub Actions (workflow .github/workflows/separar.yml)
// POST { audioUrl, titulo } -> { jobId }
// GET  ?id=jobId            -> { status: 'na-fila' | 'rodando' | 'pronto' | 'erro', projeto? }

import { list } from '@vercel/blob';

export const config = { maxDuration: 30 };

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
const REPO = process.env.GITHUB_REPO || 'andersonveloso0503-cmyk/youvideo';

async function acharExecucao(jobId) {
  try {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'youvideo' };
    if (process.env.GITHUB_DISPATCH_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`;
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?event=repository_dispatch&per_page=30`, { headers });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.workflow_runs || []).find((w) => (w.display_title || w.name || '').includes(jobId)) || null;
  } catch { return null; }
}

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
      const { blobs } = await list({ prefix: `cover/jobs/${id}/`, limit: 1000, token: BLOB_TOKEN });
      const achou = (nome) => blobs.find((b) => b.pathname.endsWith(`/${nome}.json`));
      const pronto = achou('pronto');
      if (pronto) {
        const d = await (await fetch(pronto.url, { cache: 'no-store' })).json().catch(() => ({}));
        return res.status(200).json({ status: 'pronto', projeto: d.projeto || null });
      }
      if (achou('erro')) return res.status(200).json({ status: 'erro', erro: 'O GitHub não conseguiu separar esta música.' });

      // pergunta ao próprio GitHub como está a execução (acha pelo nome "separar <jobId>")
      const run = await acharExecucao(id);
      if (run && run.status === 'completed' && run.conclusion !== 'success') {
        return res.status(200).json({ status: 'erro', erro: `O GitHub parou com erro (${run.conclusion}). Abra: ${run.html_url}`, link: run.html_url });
      }
      // progresso: arquivos "parte-N-de-T.json"
      let parte = 0; let partes = 0;
      for (const b of blobs) {
        const m = b.pathname.match(/parte-(\d+)-de-(\d+)\.json$/);
        if (m && Number(m[1]) > parte) { parte = Number(m[1]); partes = Number(m[2]); }
      }
      if (parte || achou('rodando') || (run && run.status === 'in_progress')) {
        return res.status(200).json({ status: 'rodando', parte, partes, link: run?.html_url || null });
      }
      if (!run && Number(id.slice(0, 13)) < Date.now() - 5 * 60 * 1000) {
        return res.status(200).json({ status: 'erro', erro: 'O GitHub não iniciou a separação. Confira o arquivo .github/workflows/separar.yml e o GITHUB_DISPATCH_TOKEN.' });
      }
      return res.status(200).json({ status: 'na-fila', link: run?.html_url || null });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
