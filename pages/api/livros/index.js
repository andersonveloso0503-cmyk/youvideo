// Livros bíblicos — guarda os livros para abrir de novo depois.
// GET -> { livros } | POST { livro } -> { id } (cria ou atualiza) | DELETE ?id=
import { getDb } from '../../../lib/firebase-admin';

const COL = 'youvideo_livros';
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req, res) {
  try {
    const db = getDb();
    if (req.method === 'GET') {
      const snap = await db.collection(COL).orderBy('atualizadoEm', 'desc').limit(100).get();
      return res.status(200).json({ livros: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }
    if (req.method === 'POST') {
      const l = req.body?.livro;
      if (!l || !l.titulo) return res.status(400).json({ erro: 'Livro vazio.' });
      const { id, ...dados } = l;
      const doc = { ...dados, atualizadoEm: new Date().toISOString(), criadoEm: dados.criadoEm || new Date().toISOString() };
      if (id) {
        await db.collection(COL).doc(String(id)).set(doc);
        return res.status(200).json({ id });
      }
      const ref = await db.collection(COL).add(doc);
      return res.status(200).json({ id: ref.id });
    }
    if (req.method === 'DELETE') {
      if (!req.query.id) return res.status(400).json({ erro: 'id faltando.' });
      await db.collection(COL).doc(String(req.query.id)).delete();
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
