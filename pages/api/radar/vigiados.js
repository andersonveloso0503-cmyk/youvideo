// Canais vigiados — guarda canais de referência no Firestore e tira uma
// "foto" (inscritos/views/vídeos) a cada atualização pra mostrar o crescimento.
// GET: lista e atualiza (1 unidade de cota a cada 50 canais)
// POST { canalId }: começa a vigiar   |   DELETE { canalId }: para de vigiar
import { getDb } from '../../../lib/firebase-admin';
import { detalhesCanais, novoContador, enviarErro } from '../../../lib/radar';

const COL = 'radar_vigiados';

export default async function handler(req, res) {
  const db = getDb();
  const contador = novoContador();
  try {
    if (req.method === 'POST') {
      const { canalId, origem } = req.body || {};
      if (!canalId) return res.status(400).json({ error: 'canalId é obrigatório' });
      const mapa = await detalhesCanais([canalId], contador);
      const c = mapa[canalId];
      if (!c) return res.status(404).json({ error: 'Canal não encontrado' });
      const ref = db.collection(COL).doc(canalId);
      const atual = await ref.get();
      if (atual.exists) return res.status(200).json({ ok: true, jaExistia: true });
      await ref.set({
        canalId, nome: c.nome, handle: c.handle, thumb: c.thumb, criadoEm: c.criadoEm,
        origem: origem || '', vigiandoDesde: new Date().toISOString(),
        fotos: [{ em: new Date().toISOString(), inscritos: c.inscritos, views: c.viewsTotal, videos: c.totalVideos }],
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { canalId } = req.body || {};
      if (!canalId) return res.status(400).json({ error: 'canalId é obrigatório' });
      await db.collection(COL).doc(canalId).delete();
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const snap = await db.collection(COL).get();
    const docs = snap.docs.map((d) => d.data());
    if (!docs.length) return res.status(200).json({ canais: [] });

    const atuais = await detalhesCanais(docs.map((d) => d.canalId), contador);
    const agora = Date.now();
    const lista = [];
    for (const d of docs) {
      const c = atuais[d.canalId];
      let fotos = d.fotos || [];
      if (c) {
        const ultima = fotos[fotos.length - 1];
        // no máximo 1 foto a cada 12h, guardando as últimas 60
        if (!ultima || agora - new Date(ultima.em).getTime() > 12 * 3600 * 1000) {
          fotos = [...fotos, { em: new Date().toISOString(), inscritos: c.inscritos, views: c.viewsTotal, videos: c.totalVideos }].slice(-60);
          await db.collection(COL).doc(d.canalId).update({ fotos, nome: c.nome, thumb: c.thumb });
        }
      }
      const primeira = fotos[0];
      const agoraFoto = c
        ? { inscritos: c.inscritos, views: c.viewsTotal, videos: c.totalVideos }
        : fotos[fotos.length - 1];
      const dias = Math.max((agora - new Date(primeira.em).getTime()) / 86400000, 0);
      lista.push({
        canalId: d.canalId,
        nome: c?.nome || d.nome,
        handle: c?.handle || d.handle,
        thumb: c?.thumb || d.thumb,
        idadeDias: c?.idadeDias,
        vigiandoDesde: d.vigiandoDesde,
        diasVigiando: +dias.toFixed(1),
        ...agoraFoto,
        ganhoInscritos: agoraFoto.inscritos - primeira.inscritos,
        ganhoViews: agoraFoto.views - primeira.views,
        novosVideos: agoraFoto.videos - primeira.videos,
        inscritosPorDia: dias >= 1 ? Math.round((agoraFoto.inscritos - primeira.inscritos) / dias) : null,
        historico: fotos.map((f) => f.inscritos),
      });
    }
    lista.sort((a, b) => (b.inscritosPorDia ?? -1) - (a.inscritosPorDia ?? -1));
    return res.status(200).json({ canais: lista, cotaUsada: contador.unidades });
  } catch (err) {
    return enviarErro(res, err);
  }
}
