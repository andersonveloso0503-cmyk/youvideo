import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  try {
    const db = getDb();
    const snapshot = await db.collection('youvideo_series').orderBy('criadoEm', 'desc').limit(30).get();
    const series = snapshot.docs.map((doc) => ({
      id: doc.id,
      nome: doc.data().nome,
      descricaoPersonagem: doc.data().descricaoPersonagem,
      estilo: doc.data().estilo,
      imagemReferenciaUrl: doc.data().imagemReferenciaUrl,
      criadoEm: doc.data().criadoEm,
    }));
    return res.status(200).json({ series });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
