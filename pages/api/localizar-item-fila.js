import { getDb } from '../../lib/firebase-admin';

// A tela "Meus Projetos" guarda uma cópia resumida em youvideo_projects,
// sem o ID do item original da fila (youvideo_fila) — que é onde ficam
// o áudio, as imagens e o timing das palavras, necessários pra reformatar
// o vídeo. Esse endpoint acha esse item original pelo tema, já que os dois
// guardam o mesmo texto de tema.
export default async function handler(req, res) {
  const { tema } = req.query;
  if (!tema) return res.status(400).json({ error: 'tema é obrigatório' });

  try {
    const db = getDb();
    const snapshot = await db
      .collection('youvideo_fila')
      .where('tema', '==', tema)
      .where('status', '==', 'concluido')
      .orderBy('criadoEm', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Não achei o item original dessa fila pra esse tema' });
    }

    return res.status(200).json({ itemId: snapshot.docs[0].id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
