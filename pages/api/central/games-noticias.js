// Notícias do canal de games (Próxima Fase): busca, aprovação e envio para a Fábrica.
//
// GET                         -> notícias esperando aprovação + as últimas aprovadas e o resultado da última busca
// GET  ?auto=1 (cron Vercel)  -> busca notícias novas (a cada 2 horas)
// POST { acao:'buscar' }                                   -> busca agora
// POST { acao:'aprovar', id, canalYoutube, quando? }       -> vira Short na Fábrica (sobe no horário pedido ou daqui a ~1h30)
// POST { acao:'descartar', id }
// POST { acao:'video', ids:[...] }                         -> escreve um vídeo de notícias com as marcadas (fica esperando aprovação)
// POST { acao:'dicas', jogos:[...] }                        -> escreve vídeos de dicas (jogos vazios = mais vendidos da Steam agora)
import { getDb } from '../../../lib/firebase-admin';
import { autorizado } from '../../../lib/central';
import { roteiroDoEpisodio } from '../../../lib/documentario';
import { buscarNoticias, roteiroVideo, COLECAO_NOTICIAS } from '../../../lib/gamesNoticias';
import { roteiroDicas, jogosEmAlta } from '../../../lib/gamesDicas';

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
      const r = await buscarNoticias(db, { quantas: 4 });
      await cfg.set({ ultimaBusca: new Date().toISOString(), fontes: r.fontes }, { merge: true });
      return res.status(200).json(r);
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
        };
      };
      const porData = (a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''));
      return res.status(200).json({
        aguardando: aguardando.docs.map(resumo).sort(porData),
        aprovadas: aprovadas.docs.map(resumo).sort((a, b) => String(b.aprovadaEm || '').localeCompare(String(a.aprovadaEm || ''))).slice(0, 15),
        ultimaBusca: c.data()?.ultimaBusca || null,
        fontes: c.data()?.fontes || [],
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use GET ou POST.' });
    const b = req.body || {};

    if (b.acao === 'buscar') {
      const r = await buscarNoticias(db, { quantas: Math.max(1, Math.min(8, Number(b.quantas) || 4)) });
      await cfg.set({ ultimaBusca: new Date().toISOString(), fontes: r.fontes }, { merge: true });
      return res.status(200).json(r);
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

    if (b.acao === 'aprovar') {
      if (!b.canalYoutube?.id) return res.status(400).json({ erro: 'Escolha o canal do YouTube do Próxima Fase.' });
      const ref = col.doc(String(b.id));
      const d = (await ref.get()).data();
      if (!d?.ep) return res.status(404).json({ erro: 'Notícia não encontrada.' });
      if (d.status === 'aprovada') return res.status(400).json({ erro: 'Essa notícia já foi aprovada.' });
      const longo = d.tipo === 'longo' || d.tipo === 'dicas';
      // Notícia é para já: Short sobe em ~1h30 (tempo de voz, imagens e montagem), vídeo em ~3h, ou no horário escolhido
      const pedido = b.quando ? new Date(b.quando) : null;
      const quando = await proximoHorario(db, pedido && pedido.getTime() > Date.now() + 30 * 60e3 ? pedido.getTime() : Date.now() + (longo ? 3 : 1.5) * 3600e3);
      const fab = db.collection('youvideo_fila').doc();
      await fab.set({
        tema: d.ep.titulo,
        documentario: true, // mesmo motor dos documentários
        games: true,
        noticia: ref.id,
        episodioId: d.ep.id,
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
          quando,
          quandoYoutube: quando,
          redes: { youtube: true, facebook: false, instagram: false, tiktok: false, kwai: false },
          canalYoutube: { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') },
        },
      });
      await ref.update({ status: 'aprovada', aprovadaEm: new Date().toISOString(), filaId: fab.id, quando });
      return res.status(200).json({ ok: true, filaId: fab.id, quando });
    }

    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
