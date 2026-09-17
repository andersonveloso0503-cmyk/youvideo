// pages/api/canais/atualizar.js
import { getDb } from '../../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { canalId, campo, valor } = req.body;

    if (!canalId || !campo) {
      return res.status(400).json({ error: 'canalId e campo são obrigatórios' });
    }

    const db = getDb();
    await db
      .collection('canais')
      .doc(canalId)
      .set({ [campo]: valor }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro ao atualizar canal:', err);
    return res.status(500).json({ error: 'Erro interno ao atualizar canal' });
  }
}
