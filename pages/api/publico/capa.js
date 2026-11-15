// Link da CAPA de um vídeo pronto, para o dono trocar à mão no YouTube Studio pelo celular.
// Só leitura e só devolve título + link público da imagem (que já é público no Blob). GET ?q=palavra-do-titulo
import { getDb } from '../../../lib/firebase-admin';

export default async function handler(req, res) {
  const q = String(req.query.q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (q.length < 4) return res.status(400).json({ erro: 'Use ?q= com parte do título (4+ letras).' });
  const desde = new Date(Date.now() - 4 * 86400e3).toISOString();
  const snap = await getDb().collection('youvideo_fila').where('criadoEm', '>=', desde).get();
  const achados = [];
  for (const d of snap.docs) {
    const x = d.data();
    const titulo = String(x.roteiro?.titulo || x.tema || '');
    if (!titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)) continue;
    if (!/^https?:/.test(String(x.thumbnailUrl || ''))) continue;
    achados.push({ titulo, capa: x.thumbnailUrl, criadoEm: x.criadoEm, formato: x.formato || '' });
  }
  achados.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  res.status(200).json({ capas: achados.slice(0, 6) });
}
