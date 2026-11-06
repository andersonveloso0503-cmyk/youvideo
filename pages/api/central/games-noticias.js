// Notícias do canal de games (Próxima Fase): busca, aprovação e envio para a Fábrica.
//
// GET                         -> notícias esperando aprovação + as últimas aprovadas e o resultado da última busca
// GET  ?auto=1 (cron Vercel)  -> busca notícias novas (a cada 2 horas)
// POST { acao:'buscar' }                                   -> busca agora
// POST { acao:'aprovar', id, canalYoutube, quando? }       -> vira Short na Fábrica (sobe no horário pedido ou daqui a ~1h30)
// POST { acao:'descartar', id }
// POST { acao:'auto', ligado }                             -> liga/desliga a aprovação automática (padrão: ligada)
// POST { acao:'video', ids:[...] }                         -> escreve um vídeo de notícias com as marcadas (fica esperando aprovação)
// POST { acao:'desafio' }                                 -> escreve o desafio "adivinhe o jogo" (sai sozinho 1 por semana no cron)
// POST { acao:'dicas', jogos:[...] }                        -> escreve vídeos de dicas (jogos vazios = mais vendidos da Steam agora)
import { getDb } from '../../../lib/firebase-admin';
import { autorizado } from '../../../lib/central';
import { roteiroDoEpisodio } from '../../../lib/documentario';
import { buscarNoticias, roteiroVideo, COLECAO_NOTICIAS } from '../../../lib/gamesNoticias';
import { roteiroDicas, jogosEmAlta } from '../../../lib/gamesDicas';
import { roteiroLancamentos } from '../../../lib/gamesLancamentos';

export const config = { maxDuration: 300 };

const INTERVALO = 3 * 3600e3; // vídeos do canal de games saem com pelo menos 3 h de diferença

/**
 * Horário de ir ao ar sem bater com os outros vídeos do canal de games já marcados:
 * pelo menos 3 h de distância de cada um, e nunca de madrugada (entre 23h e 8h passa para as 8h).
 */
async function proximoHorario(db, desejado) {
  const snap = await db.collection('youvideo_fila').where('games', '==', true).get();
  const marcados = snap.docs
    .map((d) => d.data())
    .filter((x) => x.fabrica?.ativo !== false && x.status !== 'erro')
    .map((x) => new Date(x.fabrica?.quandoYoutube || x.fabrica?.quando || 0).getTime())
    .filter((t) => t > Date.now() - INTERVALO)
    .sort((a, b) => a - b);
  const horaBrasilia = (t) => new Date(t - 3 * 3600e3).getUTCHours();
  const paraManha = (t) => {
    const h = horaBrasilia(t);
    if (h >= 8 && h < 23) return t;
    const d = new Date(t - 3 * 3600e3);
    if (h >= 23) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(8, 0, 0, 0);
    return d.getTime() + 3 * 3600e3;
  };
  let t = paraManha(desejado);
  for (let volta = 0; volta < 50; volta++) {
    const perto = marcados.find((m) => Math.abs(m - t) < INTERVALO);
    if (!perto) break;
    t = paraManha(perto + INTERVALO);
  }
  return new Date(t).toISOString();
}

/** Manda a notícia aprovada para a Fábrica (Short em ~1h30, vídeo em ~3h, ou no horário pedido). */
async function aprovarNoticia(db, ref, d, canalYoutube, quandoPedido = null, { limite = null } = {}) {
  const longo = d.tipo === 'longo' || d.tipo === 'dicas';
  const pedido = quandoPedido ? new Date(quandoPedido) : null;
  // Horário pedido: respeita. Senão "mesmo dia": produz já e o horário do YouTube é escolhido quando ficar pronto
  const fixo = pedido && pedido.getTime() > Date.now() + 30 * 60e3;
  const quando = fixo ? await proximoHorario(db, pedido.getTime()) : new Date(Date.now() + (longo ? 3 : 1.5) * 3600e3).toISOString();
  const fab = db.collection('youvideo_fila').doc();
  await fab.set({
    tema: d.ep.titulo,
    documentario: true, // mesmo motor dos documentários
    games: true,
    noticia: ref.id,
    episodioId: d.ep.id,
    ...(d.ilustrado ? { ilustrado: true } : {}), // Short ilustrado (tema): as ilustrações explicam cada frase
    ...(d.desafio ? { desafio: true } : {}), // Desafio "adivinhe o jogo": imagens pixeladas de propósito
    serie: null,
    estilo: 'realista',
    formato: longo ? 'longo' : 'short',
    animar: false,
    roteiro: roteiroDoEpisodio(d.ep),
    status: 'pendente',
    origem: 'fabrica',
    criadoEm: new Date().toISOString(),
    fabrica: {
      ativo: true,
      lote: `noticias-${Date.now().toString(36)}`,
      quando: fixo ? quando : new Date().toISOString(), // produção começa já
      quandoYoutube: quando,
      ...(fixo ? {} : { mesmoDia: true }),
      redes: { youtube: true, facebook: false, instagram: false, tiktok: false, kwai: false },
      canalYoutube,
    },
  });
  await ref.update({ status: 'aprovada', aprovadaEm: new Date().toISOString(), filaId: fab.id, quando, ...(limite ? { automatica: true } : {}) });
  return { filaId: fab.id, quando, mesmoDia: !fixo };
}

/** Canal do YouTube do Próxima Fase: o guardado na última aprovação, ou o do último vídeo de games da Fábrica. */
async function canalDosGames(db, cfgDados) {
  if (cfgDados?.canalYoutube?.id) return cfgDados.canalYoutube;
  const snap = await db.collection('youvideo_fila').where('games', '==', true).get();
  const ultimo = snap.docs
    .map((x) => x.data())
    .filter((x) => x.fabrica?.canalYoutube?.id)
    .sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')))[0];
  return ultimo?.fabrica?.canalYoutube || null;
}

/**
 * Aprovação automática (pedido do dono: os vídeos de games estão indo bem, não precisa mais aprovar):
 * os Shorts de notícia que esperam aprovação vão sozinhos para a Fábrica, os mais novos primeiro,
 * até 8 por dia, produzidos já e publicados no mesmo dia (horário escolhido quando ficam prontos). Notícia com mais de 2 dias fica de fora (velha).
 */
async function aprovarSozinho(db, col, cfgDados) {
  if (cfgDados?.autoAprovar === false) return { automaticas: 0, motivo: 'desligada' };
  const canal = await canalDosGames(db, cfgDados);
  if (!canal) return { automaticas: 0, motivo: 'sem canal do YouTube (aprove uma notícia à mão uma vez)' };
  const snap = await col.where('status', '==', 'aguardando').get();
  const velha = Date.now() - 2 * 86400e3;
  const fila = snap.docs
    .map((d) => ({ ref: d.ref, d: d.data() }))
    .filter(({ d }) => (d.tipo || 'short') === 'short' && d.ep && new Date(d.criadoEm || 0).getTime() > velha)
    // Primeiro as que mais param o feed (curiosidade, fato estranho, franquia gigante); empate: a mais nova.
    // Notícia fraca (nota 3 ou menos) só entra se não houver nada melhor esperando.
    .sort((a, b) => (b.d.ep?.potencial || 5) - (a.d.ep?.potencial || 5) || String(b.d.data || b.d.criadoEm || '').localeCompare(String(a.d.data || a.d.criadoEm || '')));
  // Até 5 vídeos de games por dia (mais alcance por vídeo e não estoura o limite de capas); as mais novas primeiro
  const ultimas24 = (await db.collection('youvideo_fila').where('games', '==', true).get()).docs
    .filter((x) => Date.now() - new Date(x.data().criadoEm || 0).getTime() < 24 * 3600e3).length;
  const vagas = Math.max(0, 5 - ultimas24);
  let automaticas = 0;
  for (const { ref, d } of fila.slice(0, vagas)) {
    await aprovarNoticia(db, ref, d, canal, null, { limite: 1 });
    automaticas++;
  }
  return { automaticas, vagas };
}

/** Desafio "Adivinhe o jogo pela imagem": escreve e deixa na lista (a aprovação automática manda para a Fábrica). */
async function criarDesafio(db, col, cfg) {
  const { roteiroDesafio } = await import('../../../lib/gamesDesafio');
  const jaUsados = (await cfg.get()).data()?.desafioJogos || [];
  const { ep, jogos } = await roteiroDesafio(jaUsados);
  await col.doc(ep.id).set({
    status: 'aguardando',
    tipo: 'short',
    desafio: true,
    titulo: ep.titulo,
    fonte: 'Desafio da semana',
    oficial: true,
    links: [],
    imagens: [],
    ep,
    criadoEm: new Date().toISOString(),
  });
  await cfg.set({ ultimoDesafio: new Date().toISOString(), desafioJogos: [...jaUsados, ...jogos].slice(-120) }, { merge: true });
  console.log(`[desafio] criado: ${jogos.join(', ')}`);
  return { titulo: ep.titulo, jogos };
}

/** 1 desafio por semana (pedido do dono): o cron cria quando o último tem 7 dias ou mais. */
async function desafioDaSemana(db, col, cfg) {
  const ultimo = (await cfg.get()).data()?.ultimoDesafio;
  if (ultimo && Date.now() - new Date(ultimo).getTime() < 7 * 86400e3 - 3 * 3600e3) return null;
  return criarDesafio(db, col, cfg);
}

export default async function handler(req, res) {
  const ehCron =
    (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) || /vercel-cron/i.test(req.headers['user-agent'] || '');
  const a = autorizado(req);
  if (!a.ok && !(ehCron && req.method === 'GET' && req.query.auto)) return res.status(401).json({ erro: a.erro });

  const db = getDb();
  const col = db.collection(COLECAO_NOTICIAS);
  const cfg = db.collection('youvideo_config').doc('games_noticias');

  try {
    if (req.method === 'GET' && req.query.auto) {
      const r = await buscarNoticias(db, { quantas: 6 });
      await cfg.set({ ultimaBusca: new Date().toISOString(), fontes: r.fontes }, { merge: true });
      const desafio = await desafioDaSemana(db, col, cfg).catch((e) => console.log(`[desafio] falhou: ${String(e.message || e).slice(0, 200)}`));
      const auto = await aprovarSozinho(db, col, (await cfg.get()).data()).catch((e) => ({ automaticas: 0, erro: String(e.message || e).slice(0, 200) }));
      if (auto.automaticas) console.log(`[games] ${auto.automaticas} notícia(s) aprovada(s) sozinha(s)`);
      return res.status(200).json({ ...r, ...auto, ...(desafio ? { desafio } : {}) });
    }

    if (req.method === 'GET') {
      const [aguardando, aprovadas, c] = await Promise.all([
        col.where('status', '==', 'aguardando').get(),
        col.where('status', '==', 'aprovada').get(),
        cfg.get(),
      ]);
      const resumo = (d) => {
        const x = d.data();
        return {
          id: d.id,
          tipo: x.tipo || 'short',
          titulo: x.titulo,
          tituloVideo: x.ep?.titulo || '',
          fonte: x.fonte || '',
          oficial: !!x.oficial,
          link: x.link || '',
          links: x.links || null,
          data: x.data || null,
          imagem: x.imagens?.[0] || null,
          rumor: x.ep?.thumbSub === 'Rumor',
          roteiro: String(x.ep?.texto || '')
            .split('\n')
            .filter((l) => l && !l.startsWith('@ ') && !l.startsWith('# '))
            .join('\n'),
          criadoEm: x.criadoEm,
          aprovadaEm: x.aprovadaEm || null,
          automatica: !!x.automatica,
        };
      };
      const porData = (a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''));
      return res.status(200).json({
        aguardando: aguardando.docs.map(resumo).sort(porData),
        aprovadas: aprovadas.docs.map(resumo).sort((a, b) => String(b.aprovadaEm || '').localeCompare(String(a.aprovadaEm || ''))).slice(0, 15),
        ultimaBusca: c.data()?.ultimaBusca || null,
        autoAprovar: c.data()?.autoAprovar !== false,
        fontes: c.data()?.fontes || [],
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use GET ou POST.' });
    const b = req.body || {};

    if (b.acao === 'buscar') {
      const r = await buscarNoticias(db, { quantas: Math.max(1, Math.min(8, Number(b.quantas) || 6)) });
      await cfg.set({ ultimaBusca: new Date().toISOString(), fontes: r.fontes }, { merge: true });
      const auto = await aprovarSozinho(db, col, (await cfg.get()).data()).catch((e) => ({ automaticas: 0, erro: String(e.message || e).slice(0, 200) }));
      return res.status(200).json({ ...r, ...auto });
    }

    // 📸 Enviar prontos ao Instagram do canal (os que ainda não foram, um a cada 40 min)
    if (b.acao === 'instagram-todos') {
      const { enviarProntosInstagram } = await import('../../../lib/instagramLote');
      return res.status(200).json(await enviarProntosInstagram('games'));
    }
    if (b.acao === 'desafio') {
      const r = await criarDesafio(db, col, cfg);
      return res.status(200).json({ ok: true, ...r });
    }
    if (b.acao === 'descartar') {
      await col.doc(String(b.id)).update({ status: 'descartada', descartadaEm: new Date().toISOString() });
      return res.status(200).json({ ok: true });
    }

    if (b.acao === 'video') {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 7);
      if (ids.length < 2) return res.status(400).json({ erro: 'Marque pelo menos 2 notícias para o vídeo.' });
      const docs = await Promise.all(ids.map((id) => col.doc(id).get()));
      const noticias = docs
        .filter((d) => d.exists && d.data().texto)
        .map((d) => {
          const x = d.data();
          return { titulo: x.titulo, link: x.link, fonteNome: x.fonte, oficial: !!x.oficial, data: x.data, texto: x.texto, imagens: x.imagens || [] };
        });
      if (noticias.length < 2) return res.status(400).json({ erro: 'Não achei o texto dessas notícias.' });
      const ep = await roteiroVideo(noticias);
      const ref = col.doc(ep.id);
      await ref.set({
        status: 'aguardando',
        tipo: 'longo',
        titulo: ep.titulo,
        fonte: [...new Set(noticias.map((n) => n.fonteNome))].join(', '),
        links: noticias.map((n) => ({ titulo: n.titulo, link: n.link })),
        imagens: noticias.flatMap((n) => n.imagens).slice(0, 1),
        ep,
        criadoEm: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, id: ref.id });
    }

    // Lançamentos: jogos chegando e recém-lançados (dados reais da Steam), Short ou vídeo longo
    if (b.acao === 'lancamentos') {
      const formato = b.formato === 'longo' ? 'longo' : 'short';
      const { ep, jogos } = await roteiroLancamentos({ formato });
      await col.doc(ep.id).set({
        status: 'aguardando',
        tipo: formato === 'longo' ? 'longo' : 'short',
        titulo: ep.titulo,
        fonte: 'Lançamentos da semana',
        oficial: true,
        links: jogos.map((g) => ({ titulo: g.nome, link: g.appid ? `https://store.steampowered.com/app/${g.appid}` : `https://www.google.com/search?q=${encodeURIComponent(g.nome + ' lançamento')}` })),
        imagens: [],
        ep,
        criadoEm: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, jogos: jogos.map((g) => g.nome) });
    }

    if (b.acao === 'dicas') {
      let jogos = (Array.isArray(b.jogos) ? b.jogos : String(b.jogos || '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 2); // até 2 por vez (cada um pesquisa ~1 min; a função tem 5 min)
      if (!jogos.length) jogos = await jogosEmAlta(2);
      if (!jogos.length) return res.status(400).json({ erro: 'Escreva o nome de pelo menos um jogo.' });
      const criados = [];
      const erros = [];
      // Um de cada vez (cada roteiro pesquisa na web e leva ~1 min)
      for (const nome of jogos) {
        try {
          const { ep, fontes, jogo } = await roteiroDicas(nome);
          await col.doc(ep.id).set({
            status: 'aguardando',
            tipo: 'dicas',
            titulo: ep.titulo,
            fonte: `Dicas de ${jogo}`,
            links: fontes.slice(0, 6).map((f) => ({ titulo: f.titulo, link: f.url })),
            imagens: [],
            ep,
            criadoEm: new Date().toISOString(),
          });
          criados.push(jogo);
        } catch (e) {
          erros.push(`${nome}: ${String(e.message || e).slice(0, 140)}`);
        }
      }
      if (!criados.length) return res.status(400).json({ erro: erros.join(' · ') || 'Não consegui escrever as dicas.' });
      return res.status(200).json({ ok: true, criados, erros });
    }

    // Short ilustrado sobre um tema (ex.: GTA 6): o Claude pesquisa e escreve; as ilustrações explicam cada frase
    if (b.acao === 'tema') {
      const tema = String(b.tema || '').trim().slice(0, 200);
      if (!tema) return res.status(400).json({ erro: 'Escreva o tema do vídeo.' });
      const { roteiroTemaGames } = await import('../../../lib/gamesDicas');
      const { ep, fontes } = await roteiroTemaGames(tema);
      await col.doc(ep.id).set({
        status: 'aguardando',
        tipo: 'short',
        ilustrado: true,
        titulo: ep.titulo,
        texto: (ep.fatos || []).join('\n'),
        fonte: 'Pesquisa na web',
        links: fontes.slice(0, 6).map((f) => ({ titulo: f.titulo, link: f.url })),
        imagens: [],
        ep,
        criadoEm: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, titulo: ep.titulo });
    }

    if (b.acao === 'aprovar') {
      if (!b.canalYoutube?.id) return res.status(400).json({ erro: 'Escolha o canal do YouTube do Próxima Fase.' });
      const ref = col.doc(String(b.id));
      const d = (await ref.get()).data();
      if (!d?.ep) return res.status(404).json({ erro: 'Notícia não encontrada.' });
      if (d.status === 'aprovada') return res.status(400).json({ erro: 'Essa notícia já foi aprovada.' });
      const canal = { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') };
      // Guarda o canal: é o que a aprovação automática usa
      await cfg.set({ canalYoutube: canal }, { merge: true });
      const r = await aprovarNoticia(db, ref, d, canal, b.quando);
      return res.status(200).json({ ok: true, ...r });
    }

    // Liga/desliga a aprovação automática das notícias (padrão: ligada)
    if (b.acao === 'auto') {
      await cfg.set({ autoAprovar: b.ligado !== false }, { merge: true });
      return res.status(200).json({ ok: true, autoAprovar: b.ligado !== false });
    }

    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
