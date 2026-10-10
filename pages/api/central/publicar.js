// Publica os posts agendados que já chegaram na hora (Facebook e Instagram; TikTok e Kwai vão pelo celular).
// Chamado de 10 em 10 minutos pelo cron da Vercel (vercel.json) — o PC pode ficar desligado.
// Também aceita chamada manual: GET /api/central/publicar?token=CENTRAL_TOKEN
import { getDb } from '../../../lib/firebase-admin';
import { autorizado } from '../../../lib/central';
import { publicarVideoFacebook, criarContainerInstagram, statusContainerInstagram, publicarContainerInstagram } from '../../../lib/publicarSocial';
import { tiktokConectado, enviarRascunhoTiktok } from '../../../lib/publicarTiktok';

export const config = { maxDuration: 300 };

const COL = 'youvideo_agenda';
const ORCAMENTO_MS = 240e3; // para antes do limite de 300 s da Vercel

// Convite para o canal do YouTube nos posts da Página "Em Nome de Jesus" (só no Facebook: no Instagram o link não é clicável).
// Vale para os vídeos da Fábrica (histórias e orações); os da empresa (LCS) têm a chamada do WhatsApp.
// SEM link: o Facebook mostra bem menos os posts que mandam a pessoa para fora (principalmente para o YouTube).
const CONVITES = [
  '▶ Mais histórias da Bíblia: procure "Em Nome de Jesus" no YouTube 🙏',
  '▶ Tem uma história nova todo dia no YouTube — procure "Em Nome de Jesus" 🙏',
  '▶ Gostou? Siga a Página para ver a próxima história 🙏',
  '▶ Siga a Página e compartilhe com quem precisa ouvir isso hoje 🙏',
];
function comConviteYoutube(legenda, item) {
  if (item.conta || item.origem !== 'fabrica' || /youtube\.com|youtu\.be/i.test(legenda)) return legenda;
  const dia = Math.floor(new Date(item.quando || Date.now()).getTime() / 86400e3);
  const convite = CONVITES[dia % CONVITES.length];
  // As hashtags continuam por último
  const partes = String(legenda).trim().split(/\n\s*\n/);
  const ultima = partes[partes.length - 1] || '';
  const soHashtags = partes.length > 1 && /^(#[\p{L}\p{N}_]+\s*)+$/u.test(ultima.trim());
  const texto = soHashtags ? [...partes.slice(0, -1), convite, ultima].join('\n\n') : `${String(legenda).trim()}\n\n${convite}`;
  return texto.length <= 2200 ? texto : legenda;
}

async function publicarEm(rede, item) {
  const legenda = item.legenda || item.titulo;
  if (rede === 'facebook') return publicarVideoFacebook({ videoUrl: item.videoUrl, legenda: comConviteYoutube(legenda, item), conta: item.conta || '', curto: !!item.curto });
  throw new Error('Rede desconhecida');
}

async function atualizarPendente(ref) {
  const d = (await ref.get()).data();
  const pendente = Object.entries(d?.redes || {}).some(([r, v]) => r !== 'kwai' && ['pendente', 'publicando', 'processando'].includes(v.status));
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
      // TikTok e Kwai são postados pelo celular (/postar)
      for (const rede of ['facebook', 'instagram']) {
        const st = item.redes?.[rede];
        if (!st) continue;
        // Instagram: vídeo leva alguns minutos para processar. Cria o container numa rodada
        // e publica numa das próximas (a cada 10 min), em vez de esperar tudo de uma vez.
        if (rede === 'instagram' && (st.status === 'pendente' || st.status === 'processando')) {
          if (Date.now() - inicio > ORCAMENTO_MS) return res.status(200).json({ feitos, maisDepois: true });
          try {
            let creationId = st.creationId;
            if (st.status === 'pendente' || !creationId) {
              creationId = await criarContainerInstagram({ tipo: 'video', midiaUrl: item.videoUrl, legenda: item.legenda || item.titulo, conta: item.conta || '' });
              await doc.ref.update({ 'redes.instagram': { status: 'processando', creationId, desde: new Date().toISOString(), em: new Date().toISOString(), tentativas: (st.tentativas || 0) + 1 } });
            }
            // Espera até ~1 min nesta rodada; se ainda não ficou pronto, volta na próxima
            let codigo = 'IN_PROGRESS';
            let detalhe = '';
            for (let i = 0; i < 12; i++) {
              ({ codigo, detalhe } = await statusContainerInstagram(creationId, item.conta || ''));
              if (codigo !== 'IN_PROGRESS') break;
              await new Promise((r) => setTimeout(r, 5000));
            }
            if (codigo === 'FINISHED') {
              const r = await publicarContainerInstagram(creationId, item.conta || '');
              await doc.ref.update({ 'redes.instagram': { status: 'ok', em: new Date().toISOString(), id: r.id, url: null } });
              feitos.push({ id: doc.id, rede, ok: true });
            } else if (codigo === 'IN_PROGRESS') {
              const desde = new Date(st.desde || Date.now()).getTime();
              if (Date.now() - desde > 90 * 60e3) throw new Error('O Instagram ficou mais de 1h30 processando o vídeo. Clique para tentar de novo.');
              feitos.push({ id: doc.id, rede, ok: null, obs: 'processando' });
            } else {
              throw new Error(`O Instagram não aceitou o vídeo (${codigo}${detalhe ? ': ' + detalhe : ''}). Reels precisam ter entre 3 s e 15 min, em pé (9:16) de preferência.`);
            }
          } catch (e) {
            await doc.ref.update({ 'redes.instagram': { status: 'erro', em: new Date().toISOString(), erro: String(e.message).slice(0, 500), tentativas: (st.tentativas || 0) + 1 } });
            feitos.push({ id: doc.id, rede, ok: false, erro: e.message });
          }
          continue;
        }
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

    // TikTok: na hora do post, manda o vídeo como RASCUNHO para dentro do TikTok (só se a conta estiver conectada em /tiktok).
    // O dono toca no aviso dentro do TikTok, cola a legenda e publica. Só vídeos das últimas 6 h: nada de despejar os antigos.
    if (Date.now() - inicio < ORCAMENTO_MS - 90e3 && (await tiktokConectado())) {
      const desde = new Date(Date.now() - 6 * 3600e3).toISOString();
      const recentes = await db.collection(COL).where('quando', '>=', desde).where('quando', '<=', agora).get();
      const paraTiktok = recentes.docs
        .filter((d) => {
          const x = d.data();
          return !x.conta && x.videoUrl && x.redes?.tiktok?.status === 'manual' && !x.redes.tiktok.rascunho;
        })
        .slice(0, 2);
      for (const doc of paraTiktok) {
        if (Date.now() - inicio > ORCAMENTO_MS - 60e3) break;
        await doc.ref.update({ 'redes.tiktok.rascunho': { status: 'enviando', em: new Date().toISOString() } });
        try {
          const r = await enviarRascunhoTiktok({ videoUrl: doc.data().videoUrl });
          await doc.ref.update({ 'redes.tiktok.rascunho': { status: 'ok', id: r.id, em: new Date().toISOString() } });
          feitos.push({ id: doc.id, rede: 'tiktok', ok: true, obs: 'rascunho' });
        } catch (e) {
          await doc.ref.update({ 'redes.tiktok.rascunho': { status: 'erro', erro: String(e.message).slice(0, 300), em: new Date().toISOString() } });
          feitos.push({ id: doc.id, rede: 'tiktok', ok: false, erro: e.message });
        }
      }
    }
    return res.status(200).json({ feitos });
  } catch (e) {
    return res.status(500).json({ erro: e.message, feitos });
  }
}
