// Estúdio de Música — gera capa quadrada (Flux) para uma música e salva na biblioteca.
// A capa nasce da própria música: a IA de texto lê título, estilo e letra e descreve a cena; o Flux desenha.
// POST { id, titulo?, estilo?, descricao? } -> { capaUrl, cena }

import { put } from '@vercel/blob';
import { getDb } from '../../../lib/firebase-admin';
import { pistasVisuais, pedidoDaCena, cenaDeReserva, promptDaCapa } from '../../../lib/capa';

export const config = { maxDuration: 180 };

async function cenaDaIa(m, pistas) {
  if (!process.env.GROQ_API_KEY) return '';
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.8,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: pedidoDaCena(m, pistas) }],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
    return String(JSON.parse(d.choices?.[0]?.message?.content || '{}').cena || '').trim();
  };
  try {
    return (await pedir('openai/gpt-oss-120b')).slice(0, 700);
  } catch {
    try { return (await pedir('llama-3.3-70b-versatile')).slice(0, 700); } catch { return ''; }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  if (!process.env.FLUX_API_KEY) return res.status(500).json({ erro: 'FLUX_API_KEY não configurada.' });

  const { id, titulo, estilo, descricao } = req.body || {};
  if (!id) return res.status(400).json({ erro: 'id faltando.' });

  // Os dados vêm da biblioteca (a letra não chega pela tela); o que a tela mandou é só reserva
  let salvo = {};
  try {
    const doc = await getDb().collection('youvideo_estudio_musicas').doc(String(id)).get();
    if (doc.exists) salvo = doc.data();
  } catch { /* segue com o que a tela mandou */ }
  const m = {
    titulo: salvo.titulo || titulo || '',
    estilo: salvo.estilo || estilo || '',
    descricao: salvo.descricao || descricao || '',
    letra: salvo.letra || '',
    genero: salvo.genero || '',
    instrumental: !!salvo.instrumental,
  };
  const pistas = pistasVisuais(m);
  const cena = (await cenaDaIa(m, pistas)) || cenaDeReserva(m, pistas);
  const prompt = promptDaCapa(cena);

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

    await getDb().collection('youvideo_estudio_musicas').doc(id).update({ capaUrl: blob.url, capaCena: cena.slice(0, 700) });
    return res.status(200).json({ capaUrl: blob.url, cena });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
