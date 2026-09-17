import { getDb } from '../../../lib/firebase-admin';

export default async function handler(req, res) {
  const { canalId } = req.query;
  if (!canalId) return res.status(400).json({ error: 'canalId é obrigatório' });

  try {
    const db = getDb();
    const snapshot = await db
      .collection('youvideo_fila')
      .where('canalId', '==', canalId)
      .orderBy('criadoEm', 'desc')
      .limit(30)
      .get();

    const itens = snapshot.docs.map((doc) => ({
      id: doc.id,
      tema: doc.data().tema,
      status: doc.data().status,
      erro: doc.data().erro || null,
      youtubeVideoId: doc.data().youtubeVideoId || null,
      criadoEm: doc.data().criadoEm,
    }));

    return res.status(200).json({ itens });
  } catch (err) {
    // Erro comum na primeira vez: falta o índice composto do Firestore.
    // A mensagem já vem com o link pra criar — repassa direto.
    return res.status(500).json({ error: err.message });
  }
}
