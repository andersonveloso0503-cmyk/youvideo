// Estúdio de Música — gera capa quadrada (Flux) para uma música e salva na biblioteca
// POST { id, titulo, estilo, descricao } -> { capaUrl }

import { put } from '@vercel/blob';
import { getDb } from '../../../lib/firebase-admin';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  if (!process.env.FLUX_API_KEY) return res.status(500).json({ erro: 'FLUX_API_KEY não configurada.' });

  const { id, titulo, estilo, descricao } = req.body || {};
  if (!id) return res.status(400).json({ erro: 'id faltando.' });

  const prompt = `Album cover art, square, professional music release artwork for a song titled "${titulo || 'Untitled'}". Musical style: ${estilo || 'modern'}. ${descricao ? `Theme: ${descricao}.` : ''} Cinematic, emotional, rich colors, strong central composition, high detail, no text, no letters, no logos, no watermark.`;

  try {
    const sub = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
      method: 'POST',
      headers: { accept: 'application/json', 'x-key': process.env.FLUX_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: 1024, height: 1024 }),
    });
    const sd = await sub.json();
    if (!sub.ok) throw new Error(sd.detail || 'Erro ao pedir a capa ao Flux');

    let urlTemp = null;
    for (let i = 0; i < 90 && !urlTemp; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const p = await fetch(sd.polling_url, { headers: { 'x-key': process.env.FLUX_API_KEY } }).then((r) => r.json());
      if (p.status === 'Ready') urlTemp = p.result?.sample;
      else if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(p.status)) {
        throw new Error(`Capa não gerada: ${p.status}`);
      }
    }
    if (!urlTemp) throw new Error('Tempo esgotado esperando a capa.');

    const buf = Buffer.from(await (await fetch(urlTemp)).arrayBuffer());
    const blob = await put(`estudio-musica/capas/${Date.now()}.jpg`, buf, {
      access: 'public',
      contentType: 'image/jpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });

    await getDb().collection('youvideo_estudio_musicas').doc(id).update({ capaUrl: blob.url });
    return res.status(200).json({ capaUrl: blob.url });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
