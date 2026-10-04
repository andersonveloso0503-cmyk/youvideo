// Radar de Ofertas — coloca a página de vendas no ar (ou tira).
// POST { id, publicar: true|false } -> { oferta }
// Só publica depois de conferir tudo de novo no servidor: trava, regras de conteúdo e dados do produto.
import { getDb } from '../../../lib/firebase-admin';
import { COL_OFERTAS, slug as fazerSlug } from '../../../lib/ofertas';
import { carregarAnalise, conferirOferta } from '../../../lib/ofertasServidor';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  try {
    const db = getDb();
    const col = db.collection(COL_OFERTAS);
    const id = String(req.body?.id || '');
    if (!id) return res.status(400).json({ erro: 'id faltando.' });
    const ref = col.doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ erro: 'Oferta não encontrada.' });
    const antes = snap.data();
    const agora = new Date().toISOString();

    if (!req.body.publicar) {
      await ref.update({ status: 'rascunho', atualizadoEm: agora });
      return res.status(200).json({ oferta: { id, ...antes, status: 'rascunho', atualizadoEm: agora } });
    }

    const analise = await carregarAnalise(db, antes.analiseId);
    const conferida = conferirOferta(antes, analise);
    if (conferida.pendencias.length) {
      await ref.update({ trava: conferida.trava, alertas: conferida.alertas, pendencias: conferida.pendencias, status: 'rascunho', atualizadoEm: agora });
      return res.status(400).json({ erro: 'Ainda há pendências antes de publicar.', pendencias: conferida.pendencias });
    }

    let endereco = antes.slug;
    if (!endereco) {
      const base = fazerSlug(conferida.produto.titulo);
      endereco = base;
      for (let n = 2; n < 50; n++) {
        const igual = await col.where('slug', '==', endereco).limit(1).get();
        if (igual.empty || igual.docs[0].id === id) break;
        endereco = `${base}-${n}`;
      }
    }
    const oferta = { ...antes, ...conferida, status: 'publicada', slug: endereco, publicadaEm: antes.publicadaEm || agora, atualizadoEm: agora };
    await ref.set(oferta);
    return res.status(200).json({ oferta: { id, ...oferta } });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
