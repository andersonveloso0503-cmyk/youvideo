// Estúdio de Música — biblioteca "Minhas Músicas" (Firestore)
// GET                                   -> { musicas: [...] } (mais novas primeiro)
// PATCH { id, titulo?, favorito?, stems?, capaUrl? } -> { ok }
// DELETE ?id=...                        -> { ok }

import { getDb } from '../../../lib/firebase-admin';

const COL = 'youvideo_estudio_musicas';

export default async function handler(req, res) {
  try {
    const db = getDb();

    if (req.method === 'GET') {
      const snap = await db.collection(COL).orderBy('criadoEm', 'desc').limit(200).get();
      return res.status(200).json({ musicas: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }

    if (req.method === 'PATCH') {
      const { id, titulo, favorito, stems, capaUrl } = req.body || {};
      if (!id) return res.status(400).json({ erro: 'id faltando.' });
      const upd = {};
      if (typeof titulo === 'string') upd.titulo = titulo.slice(0, 120);
      if (typeof favorito === 'boolean') upd.favorito = favorito;
      if (stems && typeof stems === 'object') upd.stems = stems;
      if (typeof capaUrl === 'string') upd.capaUrl = capaUrl;
      await db.collection(COL).doc(id).update(upd);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ erro: 'id faltando.' });
      await db.collection(COL).doc(id).delete();
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
