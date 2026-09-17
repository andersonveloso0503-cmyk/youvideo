// pages/api/canais/ativar.js
import { getDb } from '../../../lib/firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { canalId } = req.body;
    if (!canalId) {
      return res.status(400).json({ error: 'canalId é obrigatório' });
    }

    const db = getDb();
    await db.collection('canais').doc(canalId).set(
      { status: 'ativo', ativadoEm: new Date().toISOString() },
      { merge: true }
    );

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://youvideors2.vercel.app';
    const urlFila = `${baseUrl}/api/fila/${canalId}`;

    return res.status(200).json({ ok: true, urlFila });
  } catch (err) {
    console.error('Erro ao ativar canal:', err);
    return res.status(500).json({ error: 'Erro interno ao ativar canal' });
  }
}
