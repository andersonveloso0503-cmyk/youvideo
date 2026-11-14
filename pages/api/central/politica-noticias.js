// Notícias do canal de POLÍTICA: busca, aprovação e envio para a Fábrica (mesmo esquema do canal de games).
//
// GET                         -> roteiros esperando aprovação + os últimos aprovados e o resultado da última busca
// GET  ?auto=1 (cron Vercel)  -> busca notícias novas
// POST { acao:'buscar' }                                   -> busca agora
// POST { acao:'aprovar', id, canalYoutube, quando?, vozId? } -> vira vídeo na Fábrica (sobe no horário pedido ou daqui a ~1h30)
// POST { acao:'descartar', id }
// POST { acao:'video', ids:[...] }                         -> resumo com as notícias marcadas (fica esperando aprovação)
// POST { acao:'explicador', tema, formato:'longo'|'short' } -> o Claude pesquisa e escreve um explicador (ex.: "Como Lula virou no 2º turno")
import { getDb } from '../../../lib/firebase-admin';
import { autorizado } from '../../../lib/central';
import { roteiroDoEpisodio } from '../../../lib/documentario';
import { buscarNoticiasPolitica, roteiroVideoPolitica, roteiroExplicador, COLECAO_POLITICA, replanejarMidiasPolitica, inscricaoNoFim } from '../../../lib/politicaNoticias';

export const config = { maxDuration: 300 };

const INTERVALO = 3 * 3600e3; // vídeos do canal de política saem com pelo menos 3 h de diferença

async function proximoHorario(db, desejado) {
  const snap = await db.collection('youvideo_fila').where('politica', '==', true).get();
  const marcados = snap.docs
    .map((d) => d.data())
    .filter((x) => x.fabrica?.ativo !== false && x.status !== 'erro')
    .map((x) => new Date(x.fabrica?.quandoYoutube || x.fabrica?.quando || 0).getTime())
    .filter((t) => t > Date.now() - INTERVALO)
    .sort((a, b) => a - b);
  const horaBrasilia = (t) => new Date(t - 3 * 3600e3).getUTCHours();
  const paraManha = (t) => {
    const h = horaBrasilia(t);
    if (h >= 7 && h < 23) return t;
    const d = new Date(t - 3 * 3600e3);
    if (h >= 23) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(7, 0, 0, 0);
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

/** Notícia aprovada vira vídeo na Fábrica (mesmo dia: produz já, horário do YouTube escolhido quando fica pronto). */
async function aprovarPolitica(db, ref, d, canal, opcoes = {}) {
    // Roteiro escrito antes da regra nova (só "vídeo atual" genérico): escolhe a imagem de cada cena pela frase
    if (!/^@ foto (de|real):/m.test(String(d.ep.texto || ''))) {
      const novoEp = await replanejarMidiasPolitica(d.ep).catch(() => d.ep);
      if (novoEp !== d.ep) {
        d.ep = novoEp;
        await ref.update({ ep: novoEp }).catch(() => {});
      }
    }
    const longo = d.tipo === 'longo' || d.tipo === 'explicador';
    const pedido = opcoes.quando ? new Date(opcoes.quando) : null;
    // Horário pedido: respeita. Senão "mesmo dia": produz agora e o horário do YouTube é escolhido quando
    // o vídeo ficar pronto (próximo horário livre, 2 h entre vídeos) — notícia não espera dias na agenda.
    const fixo = pedido && pedido.getTime() > Date.now() + 30 * 60e3;
    const quando = fixo ? await proximoHorario(db, pedido.getTime()) : new Date(Date.now() + (longo ? 3 : 1.5) * 3600e3).toISOString();
    const fab = db.collection('youvideo_fila').doc();
    await fab.set({
      tema: d.ep.titulo,
      documentario: true, // mesmo motor dos documentários (imagens reais, capítulos, capa com texto)
      politica: true,
      noticia: ref.id,
      episodioId: d.ep.id,
      serie: null,
      estilo: 'realista',
      ...(d.quadrinho ? { quadrinho: true } : {}), // teste: cenas de objeto/lugar em ilustração de quadrinho
      formato: longo ? 'longo' : 'short',
      animar: false,
      ...(opcoes.vozId ? { vozId: String(opcoes.vozId).trim() } : {}),
      roteiro: roteiroDoEpisodio({ ...d.ep, texto: inscricaoNoFim(d.ep.texto) }), // notícias escritas antes da regra também saem com o "se inscreve" por último
      status: 'pendente',
      origem: 'fabrica',
      criadoEm: new Date().toISOString(),
      fabrica: {
        ativo: true,
        lote: `politica-${Date.now().toString(36)}`,
        quando: fixo ? quando : new Date().toISOString(), // produção começa já
        quandoYoutube: quando,
        ...(fixo ? {} : { mesmoDia: true }),
        ...(opcoes.urgente ? { urgente: true } : {}), // notícia quente: sobe assim que ficar pronta
        redes: { youtube: true, facebook: false, instagram: false, tiktok: false, kwai: false },
        canalYoutube: { id: String(canal.id), titulo: String(canal.titulo || '') },
      },
    });
    await ref.update({ status: 'aprovada', aprovadaEm: new Date().toISOString(), filaId: fab.id, quando, ...(opcoes.automatica ? { automatica: true } : {}) });
    return { filaId: fab.id, quando, mesmoDia: !fixo };
}

/**
 * Aprovação automática (pedido do dono, igual aos games): as notícias esperando vão sozinhas para a Fábrica,
 * as mais novas primeiro, até 5 por dia. Notícia com mais de 2 dias é velha: sai da lista sem virar vídeo.
 * Explicador Short que você pediu entra também; os LONGOS (explicador longo, "📺 Resumo") esperam você aprovar (são caros).
 */
async function aprovarSozinhoPolitica(db, col, cfgDados, opc = {}) {
  // opc.plano (Map): só SIMULA — diz o que vai acontecer com cada notícia, sem aprovar nada (tela da Fábrica)
  const plano = opc.plano;
  if (cfgDados?.autoAprovar === false) return { automaticas: 0, motivo: 'desligada' };
  const snap = opc.snap || (await col.where('status', '==', 'aguardando').get());
  const agora = Date.now();
  const idade = (x) => agora - new Date(x.data || x.criadoEm || 0).getTime();
  let velhas = 0;
  for (const doc of plano ? [] : snap.docs) {
    const x = doc.data();
    if (!String(x.tipo || 'short').startsWith('explicador') && x.tipo !== 'longo' && idade(x) > 2 * 86400e3) {
      await doc.ref.update({ status: 'descartada', descartadaEm: new Date().toISOString(), motivo: 'Notícia velha (mais de 2 dias): saiu sozinha.' }).catch(() => {});
      velhas++;
    }
  }
  const { canalDosGamesId, canalDaPolitica } = await import('../../../lib/politicaMesmoDia');
  const canal = plano ? true : await canalDaPolitica(db, await canalDosGamesId(db));
  if (!canal) return { automaticas: 0, velhas, motivo: 'sem canal do YouTube (aprove uma notícia à mão uma vez)' };
  const fila = snap.docs
    .map((doc) => ({ ref: doc.ref, d: doc.data() }))
    .filter(({ d }) => d.ep && d.tipo !== 'longo' && d.tipo !== 'explicador' && (d.tipo === 'explicador-short' || idade(d) <= 2 * 86400e3))
    // explicadores que você pediu primeiro; depois as de mais potencial (em alta, bolso, polêmica, Trump); empate: a mais nova
    .sort((a, b) => (String(b.d.tipo || '').startsWith('explicador') ? 1 : 0) - (String(a.d.tipo || '').startsWith('explicador') ? 1 : 0) || ((Number(b.d.potencial) || 5) - idade(b.d) / (12 * 3600e3)) - ((Number(a.d.potencial) || 5) - idade(a.d) / (12 * 3600e3))); // nota cai 1 ponto a cada 12 h: a mais atual na frente
  const ultimas24 = (await db.collection('youvideo_fila').where('politica', '==', true).get()).docs
    .filter((x) => agora - new Date(x.data().criadoEm || 0).getTime() < 24 * 3600e3 && !x.data().refeitoDe).length;
  const vagas = Math.max(0, 5 - ultimas24);
  // Só sobe sozinho o que tem NOTA BOA (7+). Nota 5-6 só completa o dia se até as 15h saíram menos de 3; abaixo de 5, só à mão.
  const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
  const nota = (d) => (d.potencial == null ? 6 : Number(d.potencial));
  const boas = fila.filter(({ d }) => String(d.tipo || '').startsWith('explicador') || nota(d) >= 7);
  const medias = ultimas24 + boas.length < 3 && hora >= 15 ? fila.filter(({ d }) => !boas.some((b) => b.d === d) && nota(d) >= 5) : [];
  // Notícia QUENTE (saiu há menos de 3 h e tem nota 8+): sobe na hora, mesmo passando das 5 do dia (até 7)
  const quente = (d) => !String(d.tipo || '').startsWith('explicador') && nota(d) >= 8 && idade(d) < 3 * 3600e3;
  const quentes = fila.filter(({ d }) => quente(d));
  const extras = Math.max(0, Math.min(quentes.length, 7 - ultimas24) - vagas);
  const ordem = [...quentes, ...[...boas, ...medias].filter((x) => !quentes.includes(x))];
  let automaticas = 0;
  for (const { ref, d } of ordem.slice(0, vagas + extras)) {
    if (plano) plano.set(ref.id, { acao: 'vai', texto: quente(d) ? 'Notícia quente: vai sozinha para a Fábrica na próxima rodada' : 'Vai sozinha para a Fábrica na próxima rodada' });
    else await aprovarPolitica(db, ref, d, canal, { automatica: true, urgente: quente(d) });
    automaticas++;
  }
  if (plano) {
    for (const { ref } of ordem.slice(vagas + extras))
      plano.set(ref.id, { acao: 'fila', texto: `Na fila: entra quando abrir vaga (até 5 por dia; já saíram ${ultimas24} nas últimas 24 h)` });
    for (const { ref, d } of fila)
      if (!plano.has(ref.id))
        plano.set(ref.id, nota(d) < 5 ? { acao: 'nao', texto: 'Nota baixa: só sai se você mandar (Fazer agora)' } : { acao: 'espera', texto: 'Nota média: só entra se até as 15h tiverem saído menos de 3 vídeos' });
  }
  return { automaticas, vagas, velhas, quentes: quentes.length };
}

export default async function handler(req, res) {
  const ehCron =
    (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) || /vercel-cron/i.test(req.headers['user-agent'] || '');
  const a = autorizado(req);
  if (!a.ok && !(ehCron && req.method === 'GET' && req.query.auto)) return res.status(401).json({ erro: a.erro });

  const db = getDb();
  const col = db.collection(COLECAO_POLITICA);
  const cfg = db.collection('youvideo_config').doc('politica_noticias');

  try {
    // Vídeo LONGO da semana (2 por semana, quarta e sábado): junta as notícias de maior nota dos últimos dias
    // 1 documentário longo de ARQUEOLOGIA/HISTÓRIA por semana no Noites na História (tema modelado em vídeos que deram certo).
    // Não é política: vai pelo motor dos documentários (fotos de museu/sítio, ilustrações da época) e espera o ✅ Aprovar.
    if (req.method === 'GET' && req.query.auto === 'historia') {
      const cfgH = db.collection('youvideo_config').doc('historia_longo');
      const ch = (await cfgH.get()).data() || {};
      if (ch.ultimo && Date.now() - new Date(ch.ultimo).getTime() < 5 * 86400e3) return res.status(200).json({ pulou: 'já fez o documentário da semana' });
      await cfgH.set({ ultimo: new Date().toISOString() }, { merge: true });
      const { canalDosGamesId, canalDaPolitica } = await import('../../../lib/politicaMesmoDia');
      const canal = await canalDaPolitica(db, await canalDosGamesId(db));
      if (!canal?.id) return res.status(200).json({ pulou: 'sem canal do Noites na História' });
      const { escolherTemaModelado } = await import('../../../lib/longoModelado');
      const { roteiroHistoriaLongo } = await import('../../../lib/historiaLonga');
      const m = await escolherTemaModelado('historia');
      const { ep } = await roteiroHistoriaLongo(m.tema, m.titulo);
      const fab = db.collection('youvideo_fila').doc();
      const quando = new Date(Date.now() + 6 * 3600e3).toISOString();
      await fab.set({
        tema: ep.titulo,
        documentario: true,
        historiaGerada: true,
        episodioId: ep.id,
        episodio: ep, // o episódio escrito fica guardado aqui (não está na lista de episódios fixos)
        serie: null,
        estilo: 'realista',
        formato: 'longo',
        animar: false,
        roteiro: roteiroDoEpisodio(ep),
        status: 'pendente',
        origem: 'fabrica',
        criadoEm: new Date().toISOString(),
        fabrica: {
          ativo: true,
          lote: `historia-${Date.now().toString(36)}`,
          quando: new Date().toISOString(),
          quandoYoutube: quando,
          redes: { youtube: true, facebook: false, instagram: false, tiktok: false, kwai: false },
          canalYoutube: { id: String(canal.id), titulo: String(canal.titulo || '') },
        },
      });
      console.log(`[historia-longo] "${ep.titulo}" (nota ${m.nota}) na Fábrica, canal ${canal.titulo}`);
      return res.status(200).json({ ok: true, id: fab.id, titulo: ep.titulo, nota: m.nota });
    }

    if (req.method === 'GET' && req.query.auto === 'longo') {
      const cd = (await cfg.get()).data() || {};
      if (cd.ultimoLongo && Date.now() - new Date(cd.ultimoLongo).getTime() < 40 * 3600e3) return res.status(200).json({ pulou: 'já fez um longo há pouco' });
      const desde = Date.now() - 4 * 86400e3;
      const snap = await col.where('status', 'in', ['aguardando', 'aprovada']).get();
      const candidatas = snap.docs
        .map((doc) => ({ doc, x: doc.data() }))
        .filter(({ x }) => x.texto && (x.tipo || 'short') === 'short' && !x.usadaEmLongo && new Date(x.data || x.criadoEm || 0).getTime() > desde)
        .sort((a, b) => (Number(b.x.potencial) || 5) - (Number(a.x.potencial) || 5) || String(b.x.data || '').localeCompare(String(a.x.data || '')))
        .slice(0, 5);
      if (!candidatas.length) return res.status(200).json({ pulou: 'nenhuma notícia boa nos últimos dias' });
      // UM assunto explicado a fundo (o mais quente da semana): é o que o pessoal procura no YouTube e no Google por meses
      let top = candidatas[0];
      let tema = `${top.x.titulo} — explicado do começo ao fim: o que aconteceu, por que importa, quem ganha e quem perde e o que muda para o brasileiro`;
      // Sábado: tema MODELADO em vídeos longos de política que estouraram no YouTube (quarta: a notícia mais quente explicada)
      if (new Date().getUTCDay() === 6 || req.query.modelado) {
        try {
          const { escolherTemaModelado } = await import('../../../lib/longoModelado');
          const m = await escolherTemaModelado('politica');
          tema = `${m.tema}${m.titulo ? ` (título sugerido: ${m.titulo})` : ''} — explicado do começo ao fim, com o que cada lado diz`;
          top = { x: { titulo: m.titulo || m.tema, texto: '', imagens: [] } };
        } catch (e) {
          console.log(`[longo-modelado] política: ficou com a notícia da semana (${String(e.message || e).slice(0, 120)})`);
        }
      }
      const marcador = col.doc();
      await marcador.set({ status: 'escrevendo', tipo: 'explicador', titulo: top.x.titulo, fonte: 'Pesquisa na web', imagens: [], semanal: true, criadoEm: new Date().toISOString() });
      await cfg.set({ ultimoLongo: new Date().toISOString() }, { merge: true });
      const trabalho = (async () => {
        try {
          const { ep, fontes } = await roteiroExplicador(tema, 'longo');
          const ref = col.doc(ep.id);
          const d = {
            status: 'aguardando',
            tipo: 'explicador',
            titulo: ep.titulo,
            texto: [(ep.fatos || []).join('\n'), top.x.texto || ''].join('\n\n').slice(0, 9000),
            fonte: 'Pesquisa na web',
            pedidoEm: new Date().toISOString(),
            links: fontes.slice(0, 8).map((f) => ({ titulo: f.titulo, link: f.url })),
            imagens: top.x.imagens || [],
            ep,
            semanal: true,
            criadoEm: new Date().toISOString(),
          };
          await ref.set(d);
          await marcador.delete();
          await top.doc.ref.update({ usadaEmLongo: ep.id }).catch(() => {});
          const { canalDosGamesId, canalDaPolitica } = await import('../../../lib/politicaMesmoDia');
          const canal = await canalDaPolitica(db, await canalDosGamesId(db));
          if (canal) await aprovarPolitica(db, ref, d, canal, { automatica: true });
        } catch (e) {
          await marcador.update({ status: 'falhou', erro: String(e.message || e).slice(0, 300), falhouEm: new Date().toISOString() }).catch(() => {});
        }
      })();
      const ctxV = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
      if (ctxV?.waitUntil) {
        ctxV.waitUntil(trabalho);
        return res.status(200).json({ ok: true, tema: top.x.titulo, emSegundoPlano: true });
      }
      await trabalho;
      return res.status(200).json({ ok: true, tema: top.x.titulo });
    }

    if (req.method === 'GET' && req.query.auto) {
      const r = await buscarNoticiasPolitica(db, { quantas: 5 });
      await cfg.set({ ultimaBusca: new Date().toISOString(), fontes: r.fontes }, { merge: true });
      const auto = await aprovarSozinhoPolitica(db, col, (await cfg.get()).data()).catch((e) => ({ automaticas: 0, erro: String(e.message || e).slice(0, 200) }));
      return res.status(200).json({ ...r, ...auto });
    }

    if (req.method === 'GET') {
      // Abriu a aba: aprova sozinho o que estiver esperando (no máximo uma vez a cada 10 min)
      {
        const cd = (await cfg.get()).data() || {};
        if (!cd.autoEm || Date.now() - cd.autoEm > 10 * 60e3) {
          await cfg.set({ autoEm: Date.now() }, { merge: true });
          await aprovarSozinhoPolitica(db, col, cd).catch(() => {});
        }
      }
      const [aguardando, aprovadas, c, escrevendo, falhou] = await Promise.all([
        col.where('status', '==', 'aguardando').get(),
        col.where('status', '==', 'aprovada').get(),
        cfg.get(),
        col.where('status', '==', 'escrevendo').get(),
        col.where('status', '==', 'falhou').get(),
      ]);
      // "Escrevendo" parado há mais de 6 min = a função morreu no meio: vira "Falhou" com aviso (antes ficava girando para sempre)
      for (const d of escrevendo.docs) {
        if (Date.now() - Date.parse(d.data().criadoEm || 0) > 6 * 60e3) {
          const erro = 'A pesquisa passou do tempo limite e parou no meio. Clique em ❌ Descartar e tente de novo.';
          await d.ref.update({ status: 'falhou', erro, falhouEm: new Date().toISOString() }).catch(() => {});
          console.log(`[explicador] travou e virou falha: "${String(d.data().titulo || '').slice(0, 60)}"`);
        }
      }
      // O que a aprovação automática vai fazer com cada notícia (nota + destino), sem aprovar nada
      const plano = new Map();
      const cdP = c.data() || {};
      if (cdP.autoAprovar !== false) await aprovarSozinhoPolitica(db, col, cdP, { plano, snap: aguardando }).catch(() => {});
      const proxRodada = (() => {
        const t = new Date();
        t.setUTCSeconds(0, 0);
        const m = t.getUTCMinutes();
        if (m < 15) t.setUTCMinutes(15);
        else if (m < 45) t.setUTCMinutes(45);
        else {
          t.setUTCHours(t.getUTCHours() + 1);
          t.setUTCMinutes(15);
        }
        return t.toISOString();
      })();
      const destino = (x, id) => {
        if (x.status !== 'aguardando') return null;
        if (cdP.autoAprovar === false) return { acao: 'mao', texto: 'Aprovação automática desligada: só sai se você mandar' };
        if (x.tipo === 'longo' || x.tipo === 'explicador') return { acao: 'mao', texto: 'Vídeo longo: espera você mandar (Fazer agora)' };
        if (!x.ep) return { acao: 'nao', texto: 'Sem roteiro: não vai sair' };
        const p = plano.get(id);
        if (p) return { ...p, ...(p.acao === 'vai' ? { quando: proxRodada } : {}) };
        return Date.now() - new Date(x.data || x.criadoEm || 0).getTime() > 2 * 86400e3
          ? { acao: 'nao', texto: 'Notícia velha (mais de 2 dias): sai sozinha da lista' }
          : { acao: 'espera', texto: 'Esperando a próxima rodada' };
      };
      const resumo = (d) => {
        const x = d.data();
        return {
          id: d.id,
          nota: x.potencial != null ? Number(x.potencial) : null,
          destino: destino(x, d.id),
          tipo: x.tipo || 'short',
          titulo: x.titulo,
          tituloVideo: x.ep?.titulo || '',
          fonte: x.fonte || '',
          oficial: !!x.oficial,
          link: x.link || '',
          links: x.links || null,
          data: x.data || (String(x.tipo || '').startsWith('explicador') ? x.criadoEm || null : null), // pedido por você: mostra quando foi feito
          imagem: x.imagens?.[0] || null,
          roteiro:
            x.status === 'escrevendo'
              ? 'O Claude está pesquisando e escrevendo. Clique em ↻ daqui a 1 ou 2 minutos.'
              : x.status === 'falhou'
                ? `Não deu certo: ${x.erro || 'erro desconhecido'}. Clique em ❌ Descartar e tente de novo.`
                : String(x.ep?.texto || '').split('\n').filter((l) => l && !l.startsWith('@ ') && !l.startsWith('# ')).join('\n'),
          ...(x.status === 'escrevendo' ? { tituloVideo: `⏳ Escrevendo: ${x.titulo}` } : x.status === 'falhou' ? { tituloVideo: `⚠️ Falhou: ${x.titulo}` } : {}),
          criadoEm: x.criadoEm,
          aprovadaEm: x.aprovadaEm || null,
          automatica: !!x.automatica,
          estado: x.status, // 'escrevendo' / 'falhou': o Compilador não mostra o ✅ Aprovar
        };
      };
      const porData = (a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''));
      return res.status(200).json({
        // Explicadores ainda sendo escritos (até 10 min) e os que falharam (últimas 24 h) aparecem no alto da lista
        aguardando: [
          ...escrevendo.docs.filter((d) => Date.now() - new Date(d.data().criadoEm || 0).getTime() < 10 * 60e3),
          ...falhou.docs.filter((d) => Date.now() - new Date(d.data().falhouEm || 0).getTime() < 24 * 3600e3),
        ].map(resumo).sort(porData).concat(aguardando.docs.map(resumo).sort((a, b) => (String(b.tipo).startsWith('explicador') ? 1 : 0) - (String(a.tipo).startsWith('explicador') ? 1 : 0) || (b.nota ?? 0) - (a.nota ?? 0) || porData(a, b))), // os que VOCÊ pediu (🎯) ficam no topo
        aprovadas: aprovadas.docs.map(resumo).sort((a, b) => String(b.aprovadaEm || '').localeCompare(String(a.aprovadaEm || ''))).slice(0, 15),
        ultimaBusca: c.data()?.ultimaBusca || null,
        fontes: c.data()?.fontes || [],
        autoAprovar: c.data()?.autoAprovar !== false,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use GET ou POST.' });
    const b = req.body || {};

    if (b.acao === 'vozes') {
      const { vozesParaEscolher } = await import('../../../lib/documentario');
      return res.status(200).json(await vozesParaEscolher());
    }
    if (b.acao === 'usarVoz') {
      const { usarVozDaPolitica } = await import('../../../lib/documentario');
      return res.status(200).json(await usarVozDaPolitica(b));
    }
    if (b.acao === 'buscar') {
      const r = await buscarNoticiasPolitica(db, { quantas: Math.max(1, Math.min(8, Number(b.quantas) || 5)) });
      await cfg.set({ ultimaBusca: new Date().toISOString(), fontes: r.fontes }, { merge: true });
      return res.status(200).json(r);
    }

    // 📸 Enviar prontos ao Instagram do canal (os que ainda não foram, um a cada 40 min)
    if (b.acao === 'instagram-todos') {
      const { enviarProntosInstagram } = await import('../../../lib/instagramLote');
      return res.status(200).json(await enviarProntosInstagram('noites'));
    }
    if (b.acao === 'auto') {
      await cfg.set({ autoAprovar: b.ligado !== false }, { merge: true });
      return res.status(200).json({ ok: true, autoAprovar: b.ligado !== false });
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
          return { titulo: x.titulo, link: x.link, fonteNome: x.fonte, data: x.data, texto: x.texto, imagens: x.imagens || [] };
        });
      if (noticias.length < 2) return res.status(400).json({ erro: 'Não achei o texto dessas notícias.' });
      const ep = await roteiroVideoPolitica(noticias);
      await col.doc(ep.id).set({
        status: 'aguardando',
        tipo: 'longo',
        titulo: ep.titulo,
        fonte: [...new Set(noticias.map((n) => n.fonteNome))].join(', '),
        links: noticias.map((n) => ({ titulo: n.titulo, link: n.link })),
        imagens: noticias.flatMap((n) => n.imagens).slice(0, 1),
        ep,
        criadoEm: new Date().toISOString(),
      });
      return res.status(200).json({ ok: true, id: ep.id });
    }

    if (b.acao === 'explicador') {
      const tema = String(b.tema || '').trim().slice(0, 15000); // aceita o PROMPT do caso escrito pelo dono
      if (!tema) return res.status(400).json({ erro: 'Escreva o tema do explicador.' });
      const temaCurto = tema.split('\n')[0].slice(0, 120);
      const formato = b.formato === 'short' || b.formato === 'noticias' ? b.formato : 'longo';
      const quadrinho = !!b.quadrinho;
      // A pesquisa + o roteiro levam de 1 a 4 min: o cartão "⏳ Escrevendo" aparece na lista na hora
      // e vira o roteiro (ou mostra o erro) quando termina. Assim nada some sem aviso.
      const tipo = formato === 'longo' ? 'explicador' : 'explicador-short';
      const marcador = col.doc();
      await marcador.set({ status: 'escrevendo', tipo, titulo: formato === 'noticias' ? `Notícias de: ${temaCurto}` : temaCurto, fonte: 'Pesquisa na web', imagens: [], criadoEm: new Date().toISOString() });
      console.log(`[explicador] começou "${String(tema).slice(0, 60)}" (${formato})`);
      const trabalho = (async () => {
        try {
          const { ep, fontes } = await roteiroExplicador(tema, formato);
          await col.doc(ep.id).set({
            status: 'aguardando',
            tipo,
            titulo: ep.titulo,
            texto: (ep.fatos || []).join('\n'), // fatos da pesquisa: a conferência das ilustrações compara os números com eles
            fonte: 'Pesquisa na web',
            links: fontes.slice(0, 8).map((f) => ({ titulo: f.titulo, link: f.url })),
            imagens: [],
            ep,
            ...(quadrinho ? { quadrinho: true } : {}),
            ...(formato === 'noticias' ? { temaPedido: tema } : {}),
            criadoEm: new Date().toISOString(),
          });
          await marcador.delete();
        } catch (e) {
          if (/abort|timeout/i.test(String(e.name || '') + String(e.message || ''))) e = new Error('A pesquisa demorou demais (o Claude estava lento). Tente de novo em alguns minutos.');
          console.log(`[explicador] falhou "${String(tema).slice(0, 60)}": ${String(e.message || e).slice(0, 200)}`);
          await marcador.update({ status: 'falhou', erro: String(e.message || e).slice(0, 300), falhouEm: new Date().toISOString() }).catch(() => {});
        }
      })();
      const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
      if (ctx?.waitUntil) {
        ctx.waitUntil(trabalho);
        return res.status(200).json({ ok: true, id: marcador.id, titulo: tema, emSegundoPlano: true });
      }
      await trabalho;
      const fim = (await marcador.get()).data();
      if (fim?.status === 'falhou') return res.status(500).json({ erro: fim.erro });
      return res.status(200).json({ ok: true, titulo: tema });
    }

    if (b.acao === 'aprovar') {
      if (!b.canalYoutube?.id) return res.status(400).json({ erro: 'Escolha o canal do YouTube de política.' });
      {
        // Nunca no canal dos games; o canal certo fica guardado (corrige depois quem foi marcado errado)
        const { canalDosGamesId, ehCanalDeGames } = await import('../../../lib/politicaMesmoDia');
        const canalGames = await canalDosGamesId(db);
        if (ehCanalDeGames(b.canalYoutube, canalGames)) {
          return res.status(400).json({ erro: `"${b.canalYoutube.titulo || 'Esse canal'}" é o canal dos games. Escolha o canal de política em "Canal do YouTube" e aprove de novo.` });
        }
        await db.collection('youvideo_config').doc('politica_canal').set({ canalYoutube: { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') }, em: new Date().toISOString() }, { merge: true }).catch(() => {});
      }
      const ref = col.doc(String(b.id));
      const d = (await ref.get()).data();
      if (d?.status === 'escrevendo') return res.status(400).json({ erro: 'Esse roteiro ainda está sendo escrito. Espere 1 ou 2 minutos e clique em ↻.' });
      if (!d?.ep) return res.status(400).json({ erro: 'Esse roteiro não ficou pronto (a pesquisa falhou). Descarte e peça de novo.' });
      if (d.status === 'aprovada') return res.status(400).json({ erro: 'Esse roteiro já foi aprovado.' });
      return res.status(200).json({ ok: true, ...(await aprovarPolitica(db, ref, d, b.canalYoutube, { quando: b.quando, vozId: b.vozId })) });
    }

    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
