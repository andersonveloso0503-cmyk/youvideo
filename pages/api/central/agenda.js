// Agenda de posts nas redes (Facebook, Instagram, TikTok, Kwai).
// GET    /api/central/agenda                 -> { itens }
// POST   /api/central/agenda  { itens: [...] } -> cria (1 documento por vídeo/horário)
// PATCH  /api/central/agenda  { id, rede, acao: 'repetir' | 'feito' } -> tenta de novo / marca Kwai como postado
// DELETE /api/central/agenda?id=...          -> apaga
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';

const REDES = ['facebook', 'instagram', 'tiktok', 'kwai'];
const MANUAIS = ['kwai', 'tiktok']; // sem publicação automática: vão para a página do celular
const COL = 'youvideo_agenda';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const db = getDb();
  try {
    if (req.method === 'GET') {
      const desde = new Date(Date.now() - 14 * 86400e3).toISOString();
      const snap = await db.collection(COL).where('quando', '>=', desde).orderBy('quando', 'asc').limit(500).get();
      return res.status(200).json({ itens: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }

    if (req.method === 'POST') {
      const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
      if (!itens.length) return res.status(400).json({ erro: 'Nada para agendar.' });
      const lote = db.batch();
      const ids = [];
      for (const it of itens.slice(0, 200)) {
        if (!/^https:\/\//.test(it.videoUrl || '')) return res.status(400).json({ erro: `Vídeo sem link público: ${it.titulo}` });
        const quando = new Date(it.quando);
        if (isNaN(quando)) return res.status(400).json({ erro: `Data inválida: ${it.titulo}` });
        const redes = {};
        for (const r of REDES) if (it.redes?.includes(r)) redes[r] = { status: MANUAIS.includes(r) ? 'manual' : 'pendente' };
        if (!Object.keys(redes).length) continue;
        const ref = db.collection(COL).doc();
        lote.set(ref, {
          titulo: String(it.titulo || '').slice(0, 150),
          legenda: String(it.legenda || '').slice(0, 2200),
          videoUrl: it.videoUrl,
          thumbnailUrl: it.thumbnailUrl || null,
          curto: !!it.curto,
          chaveBiblioteca: it.chaveBiblioteca || null,
          quando: quando.toISOString(),
          redes,
          pendente: Object.keys(redes).some((r) => !MANUAIS.includes(r)),
          criadoEm: new Date().toISOString(),
        });
        ids.push(ref.id);
      }
      await lote.commit();
      return res.status(200).json({ ids });
    }

    if (req.method === 'PATCH') {
      const { id, rede, acao } = req.body || {};
      if (!id || !REDES.includes(rede)) return res.status(400).json({ erro: 'Pedido inválido.' });
      // Kwai e TikTok são postados pelo celular (página /postar)
      const status = acao === 'feito' ? 'ok' : MANUAIS.includes(rede) ? 'manual' : 'pendente';
      const upd = { [`redes.${rede}`]: { status, em: new Date().toISOString() } };
      if (status === 'pendente') upd.pendente = true;
      await db.collection(COL).doc(String(id)).update(upd);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ erro: 'Faltou o id.' });
      await db.collection(COL).doc(String(id)).delete();
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
