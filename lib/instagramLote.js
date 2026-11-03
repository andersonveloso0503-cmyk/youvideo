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
 * Agenda no Instagram do canal todos os Shorts prontos que ainda não foram para lá (os mais novos primeiro, até 20),
 * um a cada 40 minutos (postar 20 de uma vez parece spam e o Instagram segura o alcance).
 * Envio feito ANTES da conexão atual (ex.: quando estava ligado à conta errada) conta como não enviado.
 */
export async function enviarProntosInstagram(conta) {
  const g = await igConectado(conta);
  if (!g) throw new Error('Conecte primeiro o Instagram desse canal (botão 📸 Conectar Instagram).');
  const db = getDb();
  const campo = conta === 'games' ? 'games' : 'politica';
  const snap = await db.collection('youvideo_fila').where(campo, '==', true).get();
  const desde = String(g.conectadoEm || '');
  const prontos = snap.docs
    .map((d) => ({ ref: d.ref, d: d.data() }))
    .filter(({ d }) => d.status === 'concluido' && d.videoUrl && d.fabrica?.ativo !== false && d.formato === 'short')
    .filter(({ d }) => d.fabrica?.youtube?.status !== 'revisar') // só os que você já aprovou (ou que já foram ao YouTube)
    .filter(({ d }) => !(d.envios?.instagram && String(d.envios.instagram.em || '') >= desde && d.envios.instagram.status !== 'erro'))
    .sort((a, b) => String(b.d.fabrica?.quandoYoutube || b.d.criadoEm || '').localeCompare(String(a.d.fabrica?.quandoYoutube || a.d.criadoEm || '')));
  // O mesmo título só uma vez (havia vídeos repetidos)
  const vistos = new Set();
  const lista = prontos.filter(({ d }) => {
    const t = String(d.roteiro?.titulo || d.tema || '').toLowerCase().trim();
    if (vistos.has(t)) return false;
    vistos.add(t);
    return true;
  }).slice(0, 20);
  let quando = Date.now() + 10 * 60e3;
  for (const { ref, d } of lista) {
    const { titulo, legenda } = legendaDasRedes(d, conta);
    const ag = await db.collection('youvideo_agenda').add({
      titulo, legenda, videoUrl: d.videoUrl, thumbnailUrl: d.thumbnailUrl || null, conta, curto: true,
      quando: new Date(quando).toISOString(), redes: { instagram: { status: 'pendente' } }, pendente: true,
      origem: 'instagram-lote', filaId: ref.id, criadoEm: new Date().toISOString(),
    });
    await ref.update({ 'envios.instagram': { status: 'agendado', agendaId: ag.id, em: new Date().toISOString(), lote: true } });
    quando += 40 * 60e3;
  }
  return { agendados: lista.length, usuario: g.usuario, ultimo: lista.length ? new Date(quando - 40 * 60e3).toISOString() : null };
}
