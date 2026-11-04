// Instagram dos canais: legenda e envio em lote dos vídeos prontos (Próxima Fase e Noites na História).
import { getDb } from './firebase-admin';
import { igConectado } from './instagramLogin';

export /** Legenda das redes (Instagram/TikTok) de um vídeo da fábrica: título, resumo, chamada e hashtags do canal. */
function legendaDasRedes(d, conta, corte = false) {
  const r = d.roteiro || {};
  const titulo = String(r.titulo || d.tema || '').slice(0, 150);
  const resumo = String(r.descricao || '').split(/\n\s*\n/).find((p) => p.trim() && p.trim() !== titulo && !/^https?:|inscrev|^imagens:|^fontes|^📷|^⚖️/i.test(p.trim())) || '';
  const hashtags = [...new Set((r.tags || []).slice(0, 5).map((t) => '#' + String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')).filter((t) => t.length > 2))];
  const fixas = conta === 'noites' ? ['#noitesnahistoria', '#historia', '#curiosidades'] : ['#proximafase', '#games', '#jogos'];
  const chamada = corte ? (conta === 'noites' ? '▶ A história completa está no YouTube: Noites na História' : '▶ Vídeo completo no YouTube: Próxima Fase') : conta === 'noites' ? '🌙 Siga para mais' : '🎮 Siga para mais novidades dos games';
  return { titulo, legenda: [titulo, resumo.trim().slice(0, 600), chamada, [...hashtags, ...fixas].slice(0, 8).join(' ')].filter(Boolean).join('\n\n').slice(0, 2200) };
}

/**
 * Próximo horário livre no Instagram da conta: daqui a 15 min, ou 40 min depois do último que está esperando
 * (postar vários de uma vez parece spam e o Instagram segura o alcance). Não espera a data do YouTube:
 * notícia velha no Instagram não serve.
 */
export async function proximoHorarioIg(db, conta, ignorar = new Set()) {
  const agora = Date.now();
  const snap = await db.collection('youvideo_agenda').where('conta', '==', conta).get();
  const ocupados = snap.docs
    .filter((d) => !ignorar.has(d.id))
    .map((d) => d.data())
    .filter((x) => ['pendente', 'processando'].includes(x.redes?.instagram?.status))
    .map((x) => new Date(x.quando).getTime())
    .filter((t) => t > agora - 60 * 60e3 && t < agora + 2 * 86400e3); // os muito longe (data antiga do YouTube) vão ser adiantados
  const ultimo = ocupados.length ? Math.max(...ocupados) : 0;
  return new Date(Math.max(agora + 15 * 60e3, ultimo + 40 * 60e3)).toISOString();
}

/**
 * Manda para o Instagram do canal os Shorts prontos (já aprovados) que ainda não chegaram lá, os mais novos primeiro, até 20,
 * um a cada 40 minutos a partir de agora. Entram: os que nunca foram, os que deram erro (ex.: conta errada)
 * e os que estão esperando uma data distante (adiantados, sem duplicar).
 */
export async function enviarProntosInstagram(conta) {
  const g = await igConectado(conta);
  if (!g) throw new Error('Conecte primeiro o Instagram desse canal (botão 📸 Conectar Instagram).');
  const db = getDb();
  const campo = conta === 'games' ? 'games' : 'politica';
  const snap = await db.collection('youvideo_fila').where(campo, '==', true).get();
  const desde = String(g.conectadoEm || '');
  const agenda = new Map((await db.collection('youvideo_agenda').where('conta', '==', conta).get()).docs.map((d) => [d.id, d.data()]));
  const longe = Date.now() + 3 * 3600e3;
  const prontos = snap.docs
    .map((d) => ({ ref: d.ref, d: d.data() }))
    .filter(({ d }) => d.status === 'concluido' && d.videoUrl && d.fabrica?.ativo !== false && d.formato === 'short')
    .filter(({ d }) => d.fabrica?.youtube?.status !== 'revisar') // só os que você já aprovou (ou que já foram ao YouTube)
    .map((x) => {
      const env = x.d.envios?.instagram;
      const ag = env?.agendaId ? agenda.get(env.agendaId) : null;
      const st = ag?.redes?.instagram?.status;
      let acao = null;
      if (!env) acao = 'novo';
      else if (env.status === 'erro' || st === 'erro') acao = 'novo'; // deu erro: manda de novo
      else if (ag && st === 'pendente' && new Date(ag.quando).getTime() > longe) acao = 'adiantar'; // esperando a data do YouTube
      else if (!ag && String(env.em || '') < desde && env.status !== 'ok') acao = 'novo'; // agendado antes de conectar a conta certa
      return { ...x, acao, agendaId: env?.agendaId };
    })
    .filter((x) => x.acao)
    .sort((a, b) => String(b.d.fabrica?.quandoYoutube || b.d.criadoEm || '').localeCompare(String(a.d.fabrica?.quandoYoutube || a.d.criadoEm || '')));
  // O mesmo título só uma vez (havia vídeos repetidos)
  const vistos = new Set();
  const lista = prontos.filter(({ d }) => {
    const t = String(d.roteiro?.titulo || d.tema || '').toLowerCase().trim();
    if (vistos.has(t)) return false;
    vistos.add(t);
    return true;
  }).slice(0, 20);
  const mexidos = new Set(lista.filter((x) => x.acao === 'adiantar').map((x) => x.agendaId));
  let quando = new Date(await proximoHorarioIg(db, conta, mexidos)).getTime();
  let adiantados = 0;
  for (const { ref, d, acao, agendaId } of lista) {
    if (acao === 'adiantar') {
      await db.collection('youvideo_agenda').doc(agendaId).update({ quando: new Date(quando).toISOString() });
      adiantados++;
    } else {
      const { titulo, legenda } = legendaDasRedes(d, conta);
      const ag = await db.collection('youvideo_agenda').add({
        titulo, legenda, videoUrl: d.videoUrl, thumbnailUrl: d.thumbnailUrl || null, conta, curto: true,
        quando: new Date(quando).toISOString(), redes: { instagram: { status: 'pendente' } }, pendente: true,
        origem: 'instagram-lote', filaId: ref.id, criadoEm: new Date().toISOString(),
      });
      await ref.update({ 'envios.instagram': { status: 'agendado', agendaId: ag.id, em: new Date().toISOString(), lote: true } });
    }
    quando += 40 * 60e3;
  }
  return { agendados: lista.length, adiantados, usuario: g.usuario, ultimo: lista.length ? new Date(quando - 40 * 60e3).toISOString() : null };
}
