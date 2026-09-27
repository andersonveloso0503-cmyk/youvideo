// Publica os posts agendados que já chegaram na hora (Facebook, Instagram, TikTok).
// Chamado de 10 em 10 minutos pelo cron da Vercel (vercel.json) — o PC pode ficar desligado.
// Também aceita chamada manual: GET /api/central/publicar?token=CENTRAL_TOKEN
import { getDb } from '../../../lib/firebase-admin';
import { autorizado } from '../../../lib/central';
import { publicarVideoFacebook, publicarNoInstagram } from '../../../lib/publicarSocial';
import { publicarNoTiktok } from '../../../lib/publicarTiktok';

export const config = { maxDuration: 300 };

const COL = 'youvideo_agenda';
const ORCAMENTO_MS = 240e3; // para antes do limite de 300 s da Vercel

async function publicarEm(rede, item) {
  const legenda = item.legenda || item.titulo;
  if (rede === 'facebook') return publicarVideoFacebook({ videoUrl: item.videoUrl, legenda });
  if (rede === 'instagram') return publicarNoInstagram({ tipo: 'video', midiaUrl: item.videoUrl, legenda });
  if (rede === 'tiktok') return publicarNoTiktok({ videoUrl: item.videoUrl, legenda });
  throw new Error('Rede desconhecida');
}

async function atualizarPendente(ref) {
  const d = (await ref.get()).data();
  const pendente = Object.entries(d?.redes || {}).some(([r, v]) => r !== 'kwai' && ['pendente', 'publicando'].includes(v.status));
  if (d && d.pendente !== pendente) await ref.update({ pendente });
}

export default async function handler(req, res) {
  const cronVercel =
    (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) ||
    /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (!cronVercel && !autorizado(req).ok) return res.status(401).json({ erro: 'Não autorizado.' });

  const inicio = Date.now();
  const db = getDb();
  const agora = new Date().toISOString();
  const feitos = [];
  try {
    // Só os que ainda têm rede pendente (consulta simples, sem índice composto)
    const snap = await db.collection(COL).where('pendente', '==', true).limit(200).get();
    const vencidos = snap.docs.filter((d) => (d.data().quando || '') <= agora).sort((a, b) => a.data().quando.localeCompare(b.data().quando));
    for (const doc of vencidos) {
      const item = doc.data();
      for (const rede of ['facebook', 'instagram', 'tiktok']) {
        const st = item.redes?.[rede];
        if (!st) continue;
        // Se ficou "publicando" por mais de 20 min, algo travou: tenta de novo
        const travado = st.status === 'publicando' && Date.now() - new Date(st.em || 0).getTime() > 20 * 60e3;
        if (st.status !== 'pendente' && !travado) continue;
        if (Date.now() - inicio > ORCAMENTO_MS) return res.status(200).json({ feitos, maisDepois: true });

        await doc.ref.update({ [`redes.${rede}`]: { status: 'publicando', em: new Date().toISOString(), tentativas: (st.tentativas || 0) + 1 } });
        try {
          const r = await publicarEm(rede, item);
          await doc.ref.update({ [`redes.${rede}`]: { status: 'ok', em: new Date().toISOString(), id: r?.id || null, url: r?.url || null, obs: r?.obs || null } });
          feitos.push({ id: doc.id, rede, ok: true });
        } catch (e) {
          await doc.ref.update({ [`redes.${rede}`]: { status: 'erro', em: new Date().toISOString(), erro: String(e.message).slice(0, 500), tentativas: (st.tentativas || 0) + 1 } });
          feitos.push({ id: doc.id, rede, ok: false, erro: e.message });
        }
      }
      await atualizarPendente(doc.ref);
    }
    return res.status(200).json({ feitos });
  } catch (e) {
    return res.status(500).json({ erro: e.message, feitos });
  }
}
