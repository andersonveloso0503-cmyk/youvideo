import { getDb } from '../../lib/firebase-admin';

// Lista os projetos e diz em quais redes cada vídeo JÁ foi postado:
// - automático: pela Agenda (Facebook/Instagram publicados, TikTok/Kwai marcados como postados no celular)
//   e pela Fábrica (YouTube enviado pelo Compilador) — casando pelo link do vídeo
// - manual: o que você marcou/desmarcou na tela (campo `postado` do projeto), que vale por cima do automático
const REDES = ['youtube', 'tiktok', 'kwai', 'facebook', 'instagram'];

export default async function handler(req, res) {
  try {
    const db = getDb();
    const snapshot = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(50).get();
    const projetos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const auto = {}; // videoUrl -> { rede: data }
    const agendado = {}; // videoUrl -> { rede: quando } (ainda vai sair)
    const marcar = (url, rede, em) => {
      if (!url) return;
      auto[url] = auto[url] || {};
      if (!auto[url][rede]) auto[url][rede] = em || true;
    };
    const [agenda, fila] = await Promise.all([
      db.collection('youvideo_agenda').orderBy('quando', 'desc').limit(400).get().catch(() => ({ docs: [] })),
      db.collection('youvideo_fila').where('fabrica.ativo', '==', true).get().catch(() => ({ docs: [] })),
    ]);
    agenda.docs.forEach((d) => {
      const a = d.data();
      for (const [rede, st] of Object.entries(a.redes || {})) {
        if (st?.status === 'ok') marcar(a.videoUrl, rede, st.em);
        else if (a.videoUrl && ['pendente', 'manual', 'processando', 'publicando'].includes(st?.status)) {
          agendado[a.videoUrl] = agendado[a.videoUrl] || {};
          agendado[a.videoUrl][rede] = a.quando;
        }
      }
    });
    fila.docs.forEach((d) => {
      const f = d.data();
      if (f.fabrica?.youtube?.status === 'ok') marcar(f.videoUrl, 'youtube', f.fabrica.youtube.em ? new Date(f.fabrica.youtube.em).toISOString() : true);
    });

    for (const p of projetos) {
      const a = auto[p.videoUrl] || {};
      p.agendadoEm = { ...(agendado[p.videoUrl] || {}) };
      const fy = fila.docs.find((d) => d.data().videoUrl && d.data().videoUrl === p.videoUrl)?.data();
      if (fy?.fabrica?.youtube && fy.fabrica.youtube.status !== 'ok' && fy.fabrica.quandoYoutube) p.agendadoEm.youtube = fy.fabrica.quandoYoutube;
      if (p.youtubeVideoId && !a.youtube) a.youtube = true;
      const manual = p.postado || {};
      p.postadoEm = {};
      for (const r of REDES) {
        const v = r in manual ? manual[r] : a[r]; // manual: data (marcado) ou false (desmarcado)
        if (v) p.postadoEm[r] = v === true ? 'sim' : v;
      }
    }
    return res.status(200).json({ projetos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
