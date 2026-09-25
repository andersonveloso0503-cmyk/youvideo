// Salva o cover pronto no Vercel Blob (o link do Replicate expira em 1 hora) e guarda o histórico
// POST { coverTempUrl, titulo, vozNome, estilo } -> { projeto }
// GET  -> { projetos: [...] }

import { put, list } from '@vercel/blob';

const BLOB_TOKEN = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
export const config = { maxDuration: 120 };

const PREFIXO = 'cover/projetos/';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: PREFIXO, limit: 1000, token: BLOB_TOKEN });
      const recentes = blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 50);
      const projetos = await Promise.all(recentes.map(async (b) => {
        try { return await (await fetch(b.url, { cache: 'no-store' })).json(); } catch { return null; }
      }));
      return res.status(200).json({ projetos: projetos.filter(Boolean) });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

    const { coverTempUrl, titulo, vozNome, estilo } = req.body || {};
    if (!coverTempUrl || !/^https:\/\//.test(coverTempUrl)) return res.status(400).json({ erro: 'Faltou o áudio do cover.' });

    const r = await fetch(coverTempUrl);
    if (!r.ok) throw new Error(`Não consegui baixar o cover (${r.status}).`);
    const id = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const cover = await put(`cover/resultados/${id}/cover.mp3`, Buffer.from(await r.arrayBuffer()), {
      access: 'public', contentType: 'audio/mpeg', addRandomSuffix: true, token: BLOB_TOKEN,
    });

    const projeto = {
      id,
      titulo: titulo ? String(titulo).slice(0, 100) : 'Cover sem título',
      vozNome: vozNome || '',
      estilo: estilo || '',
      coverUrl: cover.url,
      criadoEm: Date.now(),
    };
    await put(`${PREFIXO}${id}.json`, JSON.stringify(projeto), {
      access: 'public', contentType: 'application/json', addRandomSuffix: false, token: BLOB_TOKEN,
    });
    return res.status(200).json({ projeto });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
