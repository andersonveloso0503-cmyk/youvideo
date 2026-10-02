// Estúdio de Música — biblioteca "Minhas Músicas" (Firestore)
// GET                                   -> { musicas: [...] } (mais novas primeiro)
// PATCH { id, titulo?, favorito?, stems?, capaUrl? } -> { ok }
// DELETE ?id=...                        -> { ok, apagados, mantidos }
// POST { acao:'excluir', ids:[...] }     -> { ok, apagados, mantidos }
// Excluir apaga também o arquivo de áudio/capa do armazenamento (libera espaço),
// menos quando o áudio ainda está sendo usado na fila de vídeos ou num medley em andamento.

import { del } from '@vercel/blob';
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
      const { id, titulo, favorito, stems, capaUrl, capaArteUrl, letra, estilo, instrumental } = req.body || {};
      if (!id) return res.status(400).json({ erro: 'id faltando.' });
      const upd = {};
      if (typeof titulo === 'string') upd.titulo = titulo.slice(0, 120);
      if (typeof favorito === 'boolean') upd.favorito = favorito;
      if (stems && typeof stems === 'object') upd.stems = stems;
      if (typeof capaUrl === 'string') upd.capaUrl = capaUrl;
      if (typeof capaArteUrl === 'string') upd.capaArteUrl = capaArteUrl; // arte sem o título (para refazer o título ao renomear)
      if (typeof letra === 'string') upd.letra = letra.slice(0, 6000);
      if (typeof estilo === 'string') upd.estilo = estilo.slice(0, 400);
      if (typeof instrumental === 'boolean') upd.instrumental = instrumental;
      await db.collection(COL).doc(id).update(upd);
      return res.status(200).json({ ok: true });
    }

    const excluirVarias = req.method === 'POST' && req.body?.acao === 'excluir';
    if (req.method === 'DELETE' || excluirVarias) {
      const ids = (excluirVarias ? req.body.ids : [req.query.id]).filter(Boolean).map(String).slice(0, 200);
      if (!ids.length) return res.status(400).json({ erro: 'id faltando.' });
      const token = process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

      // Áudios ainda em uso (vídeo da fila de música ainda não pronto, medley em andamento, medley do estúdio)
      const emUso = new Set();
      const fila = await db.collection('youvideo_musica_fila').where('status', 'not-in', ['renderizado', 'concluido', 'erro']).get().catch(() => ({ docs: [] }));
      fila.docs.forEach((d) => d.data().audioUrl && emUso.add(d.data().audioUrl));
      const medleys = await db.collection('youvideo_medley').where('status', '==', 'processando').get().catch(() => ({ docs: [] }));
      const textoMedleys = medleys.docs.map((d) => JSON.stringify(d.data())).join(' ');
      const estudioMedleys = await db.collection(COL).where('tipo', '==', 'medley').get().catch(() => ({ docs: [] }));
      const textoEstudio = estudioMedleys.docs.filter((d) => !ids.includes(d.id)).map((d) => JSON.stringify(d.data().faixas || [])).join(' ');
      const usado = (url) => emUso.has(url) || textoMedleys.includes(url) || textoEstudio.includes(url);

      let apagados = 0;
      const mantidos = [];
      for (const id of ids) {
        const ref = db.collection(COL).doc(id);
        const d = (await ref.get()).data();
        if (!d) continue;
        const urls = [d.audioUrl, d.capaUrl, d.capaArteUrl, ...Object.values(d.stems || {})].filter((u) => typeof u === 'string' && u.includes('blob.vercel-storage.com'));
        // A capa (e a arte sem título) pode ser a mesma de outra versão da música (ex.: a versão aumentada): só apaga se ninguém mais usa
        const deOutra = new Set();
        for (const campo of ['capaUrl', 'capaArteUrl']) {
          if (!d[campo]) continue;
          const mesma = await db.collection(COL).where(campo, '==', d[campo]).limit(ids.length + 1).get().catch(() => ({ docs: [] }));
          if (mesma.docs.some((x) => !ids.includes(x.id))) deOutra.add(d[campo]);
        }
        const livres = [...new Set(urls)].filter((u) => !usado(u) && !deOutra.has(u));
        if (livres.length < new Set(urls).size) mantidos.push(d.titulo || id);
        if (livres.length && token) await del(livres, { token }).catch(() => {});
        await ref.delete();
        apagados += 1;
      }
      return res.status(200).json({ ok: true, apagados, mantidos });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
