// Canal "Brasil Inacreditável": roteiros pesquisados na web, aprovação e envio para a Fábrica.
//
// GET                          -> configuração, pautas, roteiros esperando e os últimos aprovados
// GET  ?auto=1 (cron Vercel)   -> um passo da automação: aprova os roteiros prontos e escreve o próximo se faltar vídeo na agenda
// POST { acao:'canal', canalYoutube:{id,titulo} }   -> canal do YouTube do Brasil Inacreditável (vale para a automação)
// POST { acao:'auto', ligado }                      -> liga/desliga a automação
// POST { acao:'gerar', pautaId?, formato? }         -> escreve agora (sem pautaId: a próxima pauta livre)
// POST { acao:'aprovar', id, canalYoutube? }        -> roteiro vira vídeo na Fábrica (o vídeo pronto ainda espera o ✅ Aprovar)
// POST { acao:'descartar', id }
//
// O vídeo SEMPRE espera você assistir e aprovar no Compilador (📚 Biblioteca → ✅ Aprovar) antes de ir ao YouTube.
import { getDb } from '../../../lib/firebase-admin';
import { autorizado } from '../../../lib/central';
import { roteiroDoEpisodio } from '../../../lib/documentario';
import { PAUTAS, pautaPorId, pesquisarBrasil, escreverBrasil, proximoHorarioBrasil, COLECAO_BRASIL, CONFIG_BRASIL, NOME_CANAL } from '../../../lib/brasilInacreditavel';

export const config = { maxDuration: 300 };

const ESTOQUE_LONGOS = 3; // longos já marcados à frente (uma semana: seg, qua, sex)
const ESTOQUE_SHORTS = 4;
const ATIVOS = (x) => x.fabrica?.ativo !== false && x.status !== 'erro';

async function lerConfig(db) {
  return (await db.collection('youvideo_config').doc(CONFIG_BRASIL).get()).data() || {};
}

/** Horários já marcados no YouTube para o canal (longos e Shorts), só os que ainda não passaram muito. */
async function marcados(db) {
  const snap = await db.collection('youvideo_fila').where('brasil', '==', true).get();
  const lista = snap.docs.map((d) => d.data()).filter(ATIVOS);
  const tempo = (x) => new Date(x.fabrica?.quandoYoutube || x.fabrica?.quando || 0).getTime();
  return {
    longos: lista.filter((x) => x.formato !== 'short').map(tempo),
    shorts: lista.filter((x) => x.formato === 'short').map(tempo),
  };
}

/** Roteiro aprovado vira vídeo na Fábrica: produz já e fica marcado para o próximo horário livre do canal. */
async function aprovar(db, ref, d, canal, { automatica = false } = {}) {
  const longo = d.tipo !== 'short';
  const m = await marcados(db);
  const quando = proximoHorarioBrasil(longo ? m.longos : m.shorts, longo ? 'longo' : 'short');
  const fab = db.collection('youvideo_fila').doc();
  await fab.set({
    tema: d.ep.titulo,
    documentario: true, // mesmo motor dos documentários (fotos reais, capítulos, capa com texto)
    brasil: true,
    noticia: ref.id, // para o 🎬 Refazer achar o roteiro
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
      lote: `brasil-${Date.now().toString(36)}`,
      quando: new Date().toISOString(), // produção começa já
      quandoYoutube: quando,
      redes: { youtube: true, facebook: false, instagram: false, tiktok: false, kwai: false },
      canalYoutube: { id: String(canal.id), titulo: String(canal.titulo || '') },
    },
  });
  await ref.update({ status: 'aprovada', aprovadaEm: new Date().toISOString(), filaId: fab.id, quando, ...(automatica ? { automatica: true } : {}) });
  return { filaId: fab.id, quando };
}

/** Qual roteiro escrever agora: o próximo longo (se faltar na agenda) ou o Short de uma história que já tem o longo. */
async function proximoTrabalho(db, col) {
  const docs = (await col.get()).docs.map((x) => ({ id: x.id, ...x.data() }));
  const valendo = docs.filter((x) => !['descartada', 'falhou'].includes(x.status));
  const m = await marcados(db);
  const agora = Date.now();
  const longosFuturos = m.longos.filter((t) => t > agora).length + valendo.filter((x) => x.tipo !== 'short' && ['escrevendo', 'aguardando'].includes(x.status)).length;
  const shortsFuturos = m.shorts.filter((t) => t > agora).length + valendo.filter((x) => x.tipo === 'short' && ['escrevendo', 'aguardando'].includes(x.status)).length;
  const comLongo = new Set(valendo.filter((x) => x.tipo !== 'short').map((x) => x.pautaId));
  const comShort = new Set(valendo.filter((x) => x.tipo === 'short').map((x) => x.pautaId));
  // Pauta que falhou 3 vezes nas últimas 24 h fica de lado e a automação segue para a próxima
  const falhas = (id, tipo) => docs.filter((x) => x.pautaId === id && (x.tipo || 'longo') === tipo && x.status === 'falhou' && agora - new Date(x.falhouEm || x.criadoEm || 0).getTime() < 86400e3).length;
  if (longosFuturos < ESTOQUE_LONGOS) {
    const pauta = PAUTAS.find((p) => !comLongo.has(p.id) && falhas(p.id, 'longo') < 3);
    if (pauta) return { pauta, formato: 'longo' };
  }
  if (shortsFuturos < ESTOQUE_SHORTS) {
    // Short das histórias que já têm o longo (a lista dos 10 mistérios não vira Short)
    const pauta = PAUTAS.find((p) => !p.lista && comLongo.has(p.id) && !comShort.has(p.id) && falhas(p.id, 'short') < 3);
    if (pauta) return { pauta, formato: 'short' };
  }
  return null;
}

/**
 * Escreve em DUAS etapas, cada uma numa chamada própria da Vercel (cada chamada tem no máximo 5 minutos):
 *   1) pesquisa na web (guarda os fatos no marcador) e chama a etapa 2;
 *   2) escreve o roteiro com os fatos e, na automação, já manda para a Fábrica.
 * Se a chamada da etapa 2 não sair, o cron de hora em hora continua de onde parou.
 */
async function etapaPesquisa(db, col, pauta, formato, { autoAprovarCanal = null, base = '' } = {}) {
  const marcador = col.doc();
  await marcador.set({ status: 'escrevendo', fase: 'pesquisando', tipo: formato, pautaId: pauta.id, titulo: pauta.titulo, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(), ...(autoAprovarCanal ? { autoCanal: autoAprovarCanal } : {}) });
  try {
    const { pesquisa, fontes } = await pesquisarBrasil(pauta);
    await marcador.update({ fase: 'pesquisado', pesquisa, fontes: fontes.slice(0, 12), atualizadoEm: new Date().toISOString() });
  } catch (e) {
    await marcador.update({ status: 'falhou', erro: String(e.message || e).slice(0, 300), falhouEm: new Date().toISOString() }).catch(() => {});
    throw e;
  }
  await chamarEtapa2(base, marcador.id);
  return { id: marcador.id };
}

async function chamarEtapa2(base, id) {
  if (!base || !process.env.CENTRAL_TOKEN) return; // o cron continua
  try {
    await fetch(`${base}/api/central/brasil-inacreditavel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-central-token': process.env.CENTRAL_TOKEN },
      body: JSON.stringify({ acao: 'continuar', id }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    /* o cron continua */
  }
}

async function etapaEscrita(db, col, marcadorRef) {
  const m = (await marcadorRef.get()).data();
  if (!m || m.status !== 'escrevendo' || m.fase !== 'pesquisado') return null;
  const pauta = pautaPorId(m.pautaId);
  if (!pauta) {
    await marcadorRef.update({ status: 'falhou', erro: 'Pauta não encontrada.' });
    return null;
  }
  await marcadorRef.update({ fase: 'escrevendo', atualizadoEm: new Date().toISOString() });
  try {
    const { ep, fontes } = await escreverBrasil(pauta, m.tipo, m.pesquisa, m.fontes || []);
    const ref = col.doc(ep.id);
    const d = {
      status: 'aguardando',
      tipo: m.tipo,
      pautaId: pauta.id,
      titulo: ep.titulo,
      fatos: ep.fatos || [],
      links: fontes.slice(0, 10).map((f) => ({ titulo: f.titulo, link: f.url })),
      ep,
      criadoEm: new Date().toISOString(),
    };
    await ref.set(d);
    await marcadorRef.delete();
    if (m.autoCanal?.id) await aprovar(db, ref, d, m.autoCanal, { automatica: true });
    return { id: ep.id, titulo: ep.titulo };
  } catch (e) {
    await marcadorRef.update({ status: 'falhou', erro: String(e.message || e).slice(0, 300), falhouEm: new Date().toISOString() }).catch(() => {});
    throw e;
  }
}

// Domínio de produção primeiro (o endereço próprio de cada deploy pode estar protegido por senha da Vercel)
const baseDe = (req) => (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : req.headers.host ? `https://${req.headers.host}` : '');

/** Roda em segundo plano na Vercel (a pesquisa leva 1 a 3 minutos). */
async function emSegundoPlano(res, trabalho, resposta) {
  const ctxV = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
  if (ctxV?.waitUntil) {
    ctxV.waitUntil(trabalho.catch((e) => console.error('[brasil]', e.message)));
    return res.status(200).json({ ...resposta, emSegundoPlano: true });
  }
  await trabalho;
  return res.status(200).json(resposta);
}

export default async function handler(req, res) {
  const ehCron =
    (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) || /vercel-cron/i.test(req.headers['user-agent'] || '');
  const a = autorizado(req);
  if (!a.ok && !(ehCron && req.method === 'GET' && req.query.auto)) return res.status(401).json({ erro: a.erro });

  const db = getDb();
  const col = db.collection(COLECAO_BRASIL);
  const cfgRef = db.collection('youvideo_config').doc(CONFIG_BRASIL);

  try {
    // ── Automação (cron de hora em hora): só faz algo quando falta vídeo na agenda ──
    if (req.method === 'GET' && req.query.auto) {
      const cfg = await lerConfig(db);
      if (cfg.autoAprovar === false) return res.status(200).json({ pulou: 'automação desligada' });
      if (!cfg.canalYoutube?.id) return res.status(200).json({ pulou: 'escolha o canal do Brasil Inacreditável no Compilador' });
      // Marcador "escrevendo" esquecido (a Vercel parou no meio): vira falha para não travar
      const escrevendo = (await col.where('status', '==', 'escrevendo').get()).docs;
      let ocupado = false;
      for (const x of escrevendo) {
        const xd = x.data();
        const parado = Date.now() - new Date(xd.atualizadoEm || xd.criadoEm || 0).getTime();
        // Pesquisa pronta e a escrita não começou (a chamada da etapa 2 não saiu): continua daqui
        if (xd.fase === 'pesquisado' && parado > 5 * 60e3) return emSegundoPlano(res, etapaEscrita(db, col, x.ref), { continuando: xd.titulo });
        if (parado > 12 * 60e3) await x.ref.update({ status: 'falhou', erro: 'A pesquisa ou a escrita demorou demais e parou. Vai tentar de novo sozinho.', falhouEm: new Date().toISOString() }).catch(() => {});
        else ocupado = true;
      }
      if (ocupado) return res.status(200).json({ pulou: 'já está escrevendo um roteiro' });
      // Roteiros prontos esperando (escritos à mão ou antes de ligar a automação) vão para a Fábrica
      let aprovados = 0;
      for (const doc of (await col.where('status', '==', 'aguardando').get()).docs) {
        const d = doc.data();
        if (!d.ep) continue;
        await aprovar(db, doc.ref, d, cfg.canalYoutube, { automatica: true });
        aprovados++;
      }
      // Pauta que falhou 3 vezes sai da automação (aparece no Compilador para tentar à mão)
      const trabalho = await proximoTrabalho(db, col);
      if (!trabalho) return res.status(200).json({ aprovados, pulou: 'agenda cheia ou pautas acabaram' });
      await cfgRef.set({ ultimaGeracao: new Date().toISOString() }, { merge: true });
      return emSegundoPlano(res, etapaPesquisa(db, col, trabalho.pauta, trabalho.formato, { autoAprovarCanal: cfg.canalYoutube, base: baseDe(req) }), { aprovados, escrevendo: trabalho.pauta.titulo, formato: trabalho.formato });
    }

    if (req.method === 'GET') {
      const cfg = await lerConfig(db);
      const docs = (await col.get()).docs.map((x) => ({ id: x.id, ...x.data() }));
      const valendo = docs.filter((x) => !['descartada', 'falhou'].includes(x.status));
      const resumo = (x) => ({
        id: x.id,
        tipo: x.tipo || 'longo',
        estado: x.status,
        titulo: x.titulo,
        pautaId: x.pautaId,
        links: x.links || [],
        erro: x.erro || '',
        quando: x.quando || null,
        aprovadaEm: x.aprovadaEm || null,
        automatica: !!x.automatica,
        roteiro: x.ep ? String(x.ep.texto || '').replace(/^@ .*$/gm, '').replace(/\n{2,}/g, '\n').trim().slice(0, 20000) : '',
        fatos: x.fatos || [],
        criadoEm: x.criadoEm || null,
      });
      const pautas = PAUTAS.map((p) => {
        const meus = valendo.filter((x) => x.pautaId === p.id);
        return { id: p.id, titulo: p.titulo, longo: meus.find((x) => x.tipo !== 'short')?.status || '', short: p.lista ? 'nao-tem' : meus.find((x) => x.tipo === 'short')?.status || '' };
      });
      return res.status(200).json({
        canal: NOME_CANAL,
        canalYoutube: cfg.canalYoutube || null,
        autoAprovar: cfg.autoAprovar !== false,
        ultimaGeracao: cfg.ultimaGeracao || null,
        pautas,
        aguardando: docs.filter((x) => ['escrevendo', 'aguardando', 'falhou'].includes(x.status)).sort((x, y) => String(y.criadoEm || '').localeCompare(String(x.criadoEm || ''))).slice(0, 20).map(resumo),
        aprovadas: docs.filter((x) => x.status === 'aprovada').sort((x, y) => String(y.aprovadaEm || '').localeCompare(String(x.aprovadaEm || ''))).slice(0, 15).map(resumo),
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não suportado' });
    const b = req.body || {};

    if (b.acao === 'canal') {
      if (!b.canalYoutube?.id) return res.status(400).json({ erro: 'Escolha o canal do YouTube.' });
      await cfgRef.set({ canalYoutube: { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') } }, { merge: true });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'auto') {
      await cfgRef.set({ autoAprovar: !!b.ligado }, { merge: true });
      return res.status(200).json({ ok: true, autoAprovar: !!b.ligado });
    }
    if (b.acao === 'gerar') {
      const formato = b.formato === 'short' ? 'short' : 'longo';
      let pauta = b.pautaId ? pautaPorId(String(b.pautaId)) : null;
      if (b.pautaId && !pauta) return res.status(400).json({ erro: 'Pauta não encontrada.' });
      if (!pauta) {
        const valendo = (await col.get()).docs.map((x) => x.data()).filter((x) => !['descartada', 'falhou'].includes(x.status));
        const feitas = new Set(valendo.filter((x) => (x.tipo || 'longo') === formato).map((x) => x.pautaId));
        pauta = PAUTAS.find((p) => !feitas.has(p.id) && !(formato === 'short' && p.lista));
        if (!pauta) return res.status(400).json({ erro: 'Todas as pautas já têm roteiro. Peça novas pautas.' });
      }
      if (formato === 'short' && pauta.lista) return res.status(400).json({ erro: 'A lista dos 10 mistérios não vira Short.' });
      // Escrito à mão: na automação ligada, também vai sozinho para a Fábrica
      const cfgG = await lerConfig(db);
      const autoCanal = cfgG.autoAprovar !== false && cfgG.canalYoutube?.id ? cfgG.canalYoutube : null;
      return emSegundoPlano(res, etapaPesquisa(db, col, pauta, formato, { autoAprovarCanal: autoCanal, base: baseDe(req) }), { ok: true, escrevendo: pauta.titulo, formato });
    }
    if (b.acao === 'continuar') {
      // Etapa 2 (escrita), chamada pela própria etapa 1 depois da pesquisa
      const ref = col.doc(String(b.id || ''));
      return emSegundoPlano(res, etapaEscrita(db, col, ref), { ok: true });
    }
    if (b.acao === 'aprovar' || b.acao === 'descartar') {
      const ref = col.doc(String(b.id || ''));
      const d = (await ref.get()).data();
      if (!d) return res.status(404).json({ erro: 'Roteiro não encontrado.' });
      if (b.acao === 'descartar') {
        await ref.update({ status: 'descartada', descartadaEm: new Date().toISOString() });
        return res.status(200).json({ ok: true });
      }
      if (d.status !== 'aguardando' || !d.ep) return res.status(400).json({ erro: 'Esse roteiro não está esperando aprovação.' });
      const canal = b.canalYoutube?.id ? { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') } : (await lerConfig(db)).canalYoutube;
      if (!canal?.id) return res.status(400).json({ erro: 'Escolha o canal do Brasil Inacreditável antes de aprovar.' });
      await cfgRef.set({ canalYoutube: canal }, { merge: true });
      const r = await aprovar(db, ref, d, canal);
      return res.status(200).json({ ok: true, ...r });
    }
    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    console.error('[brasil-inacreditavel]', e);
    return res.status(500).json({ erro: String(e.message || e) });
  }
}
