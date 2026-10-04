// Radar de Ofertas — ofertas geradas.
// GET -> { ofertas } (resumo) | GET ?id= -> { oferta } | POST { oferta } -> { oferta } (salva e confere de novo) | DELETE ?id=
import { getDb } from '../../../lib/firebase-admin';
import { COL_OFERTAS } from '../../../lib/ofertas';
import { carregarAnalise, conferirOferta } from '../../../lib/ofertasServidor';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  try {
    const db = getDb();
    const col = db.collection(COL_OFERTAS);
    if (req.method === 'GET') {
      if (req.query.id) {
        const snap = await col.doc(String(req.query.id)).get();
        if (!snap.exists) return res.status(404).json({ erro: 'Oferta não encontrada.' });
        return res.status(200).json({ oferta: { id: snap.id, ...snap.data() } });
      }
      const snap = await col.orderBy('atualizadoEm', 'desc').limit(60).get();
      return res.status(200).json({
        ofertas: snap.docs.map((d) => {
          const o = d.data();
          return { id: d.id, titulo: o.produto?.titulo || '', status: o.status, slug: o.slug || '', atualizadoEm: o.atualizadoEm, pendencias: (o.pendencias || []).length };
        }),
      });
    }
    if (req.method === 'POST') {
      const entrada = req.body?.oferta;
      if (!entrada?.id) return res.status(400).json({ erro: 'Oferta sem id.' });
      const ref = col.doc(String(entrada.id));
      const atual = await ref.get();
      if (!atual.exists) return res.status(404).json({ erro: 'Oferta não encontrada.' });
      const antes = atual.data();
      const analise = await carregarAnalise(db, antes.analiseId);
      const conferida = conferirOferta({ ...entrada, analiseId: antes.analiseId }, analise);
      // editar uma oferta publicada e criar pendência tira a página do ar até resolver
      const status = antes.status === 'publicada' && !conferida.pendencias.length ? 'publicada' : 'rascunho';
      const oferta = { ...conferida, estruturaSugerida: !!antes.estruturaSugerida && !conferida.produto.itensConfirmados, status, slug: antes.slug || '', criadoEm: antes.criadoEm, publicadaEm: antes.publicadaEm || '', atualizadoEm: new Date().toISOString() };
      await ref.set(oferta);
      return res.status(200).json({ oferta: { id: ref.id, ...oferta } });
    }
    if (req.method === 'DELETE') {
      if (!req.query.id) return res.status(400).json({ erro: 'id faltando.' });
      await col.doc(String(req.query.id)).delete();
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
