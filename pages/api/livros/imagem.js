// Livros bíblicos — gera UMA ilustração (página ou capa) com o Flux e guarda no armazenamento.
// POST { cena, estilo, tipo, personagem, capa: bool } -> { url }
import { put } from '@vercel/blob';
import { pedidoImagem } from '../../../lib/livros';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  if (!process.env.FLUX_API_KEY) return res.status(500).json({ erro: 'FLUX_API_KEY não configurada.' });
  const b = req.body || {};
  if (!String(b.cena || '').trim()) return res.status(400).json({ erro: 'Falta a descrição da cena.' });
  const capa = !!b.capa;
  try {
    const sub = await fetch('https://api.bfl.ai/v1/flux-2-pro', {
      method: 'POST',
      headers: { accept: 'application/json', 'x-key': process.env.FLUX_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: pedidoImagem({ cena: String(b.cena).slice(0, 600), estilo: b.estilo, tipo: b.tipo, personagem: String(b.personagem || '').slice(0, 300), capa }),
        width: capa ? 896 : 1152,
        height: capa ? 1280 : 864,
      }),
    });
    const sd = await sub.json();
    if (!sub.ok) throw new Error(sd.detail || 'Erro ao pedir a ilustração ao Flux');
    let urlTemp = null;
    for (let i = 0; i < 90 && !urlTemp; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const p = await fetch(sd.polling_url, { headers: { 'x-key': process.env.FLUX_API_KEY } }).then((r) => r.json());
      if (p.status === 'Ready') urlTemp = p.result?.sample;
      else if (['Error', 'Failed', 'Request Moderated', 'Content Moderated'].includes(p.status)) {
        throw new Error(p.status.includes('Moderated') ? 'O gerador recusou essa cena. Mude a descrição e tente de novo.' : `Ilustração não gerada: ${p.status}`);
      }
    }
    if (!urlTemp) throw new Error('Tempo esgotado esperando a ilustração.');
    const buf = Buffer.from(await (await fetch(urlTemp)).arrayBuffer());
    const blob = await put(`livros/${Date.now()}.jpg`, buf, {
      access: 'public',
      contentType: 'image/jpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });
    return res.status(200).json({ url: blob.url });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
