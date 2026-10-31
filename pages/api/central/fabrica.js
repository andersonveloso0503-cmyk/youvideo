// Fábrica de Shorts (controlada pelo Youvideo Compilador).
// GET                                   -> { itens }  lotes da fábrica (andamento de cada vídeo)
// GET  ?youtube=1                        -> { itens }  prontos esperando o PC subir no YouTube
// POST { acao:'criar', dias, horarios, redes, canalYoutube, animacao }  -> cria o lote (a IA escolhe os temas)
// POST { acao:'criar', tipo:'cortes', estiloCorte:'filme'|'comico'|'alternar', dias, porDia, horarios, animacao, redes, canalYoutube }
//                                        -> lote de cortes (cenas em diálogo: de filme e/ou cômicos)
// POST { acao:'criar', tipo:'longos', semanas, diasSemana, horarios, canalYoutube, redes, temas }
//                                        -> vídeos longos (~12 min) no estilo mistério, só YouTube (+ Facebook opcional)
// POST { acao:'criar', tipo:'documentario', quantos, inicio, horarios, canalYoutube, vozId }
//                                        -> documentários para dormir já escritos (1 por dia), voz lenta e imagens reais, só YouTube
// POST { acao:'criar', tipo:'infantil', personagem:{nome,descricao}, semanas, diasSemana, horarios, canalYoutube, animacaoCompleta, temas, vozId }
//                                        -> episódios de historinha infantil animada (~4 min) com música chiclete, só YouTube (conteúdo para crianças)
// POST { acao:'youtube-pegar'|'youtube-feito'|'youtube-erro', id, ... }
// POST { acao:'cancelar', id }
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { horarioBrasilia, diaBrasilia, somarDias } from '../../../lib/fabrica';
import { empresa, faltaConfigurar, temasEmpresa } from '../../../lib/empresa';
import { PERIODOS, intencaoDoDia, tituloOracao } from '../../../lib/oracaoDia';
import { testarConta } from '../../../lib/publicarSocial';
import { temasCortesDaIa, TONS_FILME } from '../../../lib/cortes';
import { roteiroDoEpisodio } from '../../../lib/documentario';
import { EPISODIOS, TODOS_EPISODIOS } from '../../../lib/documentarioEpisodios';
import { GAMES } from '../../../lib/gamesEpisodios';
import { COLECAO_NOTICIAS } from '../../../lib/gamesNoticias';
import { normalizarPersonagem, temasInfantisDaIa, gerarRoteiroInfantil, EPISODIOS_PINGO, slug as slugInfantil, thumbInfantil, planejarTemporada, lerRoteiroDeFora, criarShortDaMusica } from '../../../lib/infantil';
import { enviarAnimacao, checarAnimacao } from '../../../lib/pipeline';

export const config = { maxDuration: 120 }; // a prévia do infantil escreve um roteiro inteiro (pode passar de 1 min)

const COL = 'youvideo_fila';

async function temasDaIa(qtd, evitar) {
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você escolhe temas para Shorts (1 minuto) de um canal cristão brasileiro chamado "Em Nome de Jesus". ' +
              'Responda só JSON: {"temas": ["...", "..."]}. Cada tema é UMA história ou passagem bíblica específica, contada de um jeito que prende nos primeiros segundos ' +
              '(ex.: "Davi enfrenta Golias com uma funda", "A mulher que tocou no manto de Jesus", "Pedro anda sobre as águas e afunda"). ' +
              'Varie entre Antigo e Novo Testamento, milagres, parábolas, personagens pouco conhecidos e lições para o dia a dia. Nada repetido nem parecido com a lista de já usados.',
          },
          { role: 'user', content: `Quero ${qtd} temas diferentes.\n\nJá usados (não repetir):\n${evitar.slice(0, 250).map((t) => `- ${t}`).join('\n') || '(nenhum)'}` },
        ],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
    return JSON.parse(d.choices?.[0]?.message?.content || '{}').temas || [];
  };
  let temas = [];
  try {
    temas = await pedir('openai/gpt-oss-120b');
  } catch {
    temas = await pedir('llama-3.3-70b-versatile');
  }
  const vistos = new Set(evitar.map((t) => t.toLowerCase()));
  return temas.map((t) => String(t).trim()).filter((t) => t && !vistos.has(t.toLowerCase())).slice(0, qtd);
}

// Vídeos longos (~12 min) no estilo "mistério": cada tema já vem como a PERGUNTA que o vídeo responde.
async function temasLongosDaIa(qtd, evitar) {
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você escolhe temas de VÍDEOS LONGOS (cerca de 12 minutos) para um canal cristão brasileiro chamado "Em Nome de Jesus". ' +
              'O canal usa o estilo MISTÉRIO: cada tema é uma PERGUNTA ou um SEGREDO sobre uma passagem bíblica específica, que dá muita vontade de clicar e que o vídeo responde até o final. ' +
              'Responda só JSON: {"temas": ["...", "..."]}. ' +
              'Exemplos: "O que aconteceu com Jesus nos 3 dias dentro do túmulo?", "O que os soldados viram no túmulo e esconderam", ' +
              '"Por que Judas traiu Jesus? O que a Bíblia revela", "O que Jesus escreveu no chão diante da mulher adúltera?", ' +
              '"Onde estava a Arca da Aliança? O mistério que atravessou séculos", "Quem eram os magos que visitaram Jesus?". ' +
              'Regras: tudo precisa ter base na Bíblia ou em contexto histórico conhecido (nada de teoria da conspiração ou fato inventado); ' +
              'varie entre vida de Jesus, Antigo Testamento, apóstolos, profecias e personagens; até 80 caracteres por tema; nada repetido nem parecido com a lista de já usados.',
          },
          { role: 'user', content: `Quero ${qtd} temas diferentes.\n\nJá usados (não repetir):\n${evitar.slice(0, 250).map((t) => `- ${t}`).join('\n') || '(nenhum)'}` },
        ],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
    return JSON.parse(d.choices?.[0]?.message?.content || '{}').temas || [];
  };
  let temas = [];
  try {
    temas = await pedir('openai/gpt-oss-120b');
  } catch {
    temas = await pedir('llama-3.3-70b-versatile');
  }
  const vistos = new Set(evitar.map((t) => String(t).toLowerCase()));
  return temas.map((t) => String(t).trim()).filter((t) => t && !vistos.has(t.toLowerCase())).slice(0, qtd);
}

// Séries: cada história dividida em partes, cada parte termina num gancho ("siga para ver a parte 2").
async function seriesDaIa(qtd, partes, evitar, pedidos = []) {
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você planeja SÉRIES de Shorts (1 minuto cada) de um canal cristão brasileiro chamado "Em Nome de Jesus". ' +
              `Cada série conta UMA história bíblica específica dividida em exatamente ${partes} partes em ordem cronológica. ` +
              'Cada parte (menos a última) precisa terminar num momento de suspense que faz a pessoa querer ver a próxima. ' +
              'Responda só JSON: {"series": [{"nome": "nome curto da história (ex.: Davi e Golias)", ' +
              '"personagem": "aparência fixa do personagem principal para as imagens: idade, cabelo, barba, roupa e cores (em português, 1 frase)", ' +
              `"partes": ["o que acontece na parte 1 e onde ela para", ...${partes} itens]}]}. ` +
              'Varie entre Antigo e Novo Testamento, milagres, heróis da fé e personagens pouco conhecidos. Nada repetido nem parecido com a lista de já usados.',
          },
          {
            role: 'user',
            content: pedidos.length
              ? `Quero ${pedidos.length} séries, uma sobre cada assunto abaixo, nesta ordem (o dono do canal escolheu):\n${pedidos.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
              : `Quero ${qtd} séries diferentes.\n\nJá usados (não repetir):\n${evitar.slice(0, 250).map((t) => `- ${t}`).join('\n') || '(nenhum)'}`,
          },
        ],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
    return JSON.parse(d.choices?.[0]?.message?.content || '{}').series || [];
  };
  let series = [];
  try {
    series = await pedir('openai/gpt-oss-120b');
  } catch {
    series = await pedir('llama-3.3-70b-versatile');
  }
  const vistos = new Set(evitar.map((t) => String(t).toLowerCase()));
  return series
    .map((s) => ({
      nome: String(s?.nome || '').trim(),
      personagem: String(s?.personagem || '').trim().slice(0, 300),
      partes: (Array.isArray(s?.partes) ? s.partes : []).map((p) => String(p).trim()).filter(Boolean),
    }))
    .filter((s) => s.nome && s.partes.length >= partes && !vistos.has(s.nome.toLowerCase()))
    .map((s) => ({ ...s, partes: s.partes.slice(0, partes) }))
    .slice(0, qtd);
}


/** Próximo horário igual ao de `iso` (mesma hora do dia) que esteja pelo menos 2 h no futuro. */
function proximoHorario(iso) {
  let t = new Date(iso || Date.now()).getTime();
  if (!Number.isFinite(t)) t = Date.now();
  while (t < Date.now() + 2 * 3600e3) t += 24 * 3600e3;
  return new Date(t).toISOString();
}

/**
 * Séries que perderam uma parte (apagada sem querer ou com erro antigo que sumiu da lista):
 * recria a parte que falta com o mesmo personagem, estilo e canal, ou põe a parte com erro para tentar de novo.
 * Roda no máximo 1 vez por hora (economiza leituras do banco) e não recria a mesma parte duas vezes.
 */
async function completarSeries(db, col) {
  const cfg = db.collection('youvideo_config').doc('fabrica_series');
  const c = (await cfg.get()).data() || {};
  if (c.em && Date.now() - c.em < 3600e3) return;
  const refeitas = new Set(c.refeitas || []);
  await cfg.set({ em: Date.now() }, { merge: true });
  const snap = await col.where('criadoEm', '>=', new Date(Date.now() - 21 * 24 * 3600e3).toISOString()).get();
  const grupos = {};
  snap.docs.forEach((d) => {
    const x = d.data();
    if (x.origem !== 'fabrica' || !x.serie?.id || !x.serie?.total) return;
    (grupos[x.serie.id] = grupos[x.serie.id] || []).push(d);
  });
  const novasRefeitas = [];
  for (const [serieId, docs] of Object.entries(grupos)) {
    const total = docs[0].data().serie.total;
    // Só mexe em série que já começou a sair (alguma parte pronta); série inteira apagada fica apagada
    if (!docs.some((d) => d.data().status === 'concluido')) continue;
    const porParte = {};
    docs.forEach((d) => (porParte[d.data().serie.parte] = d));
    for (let parte = 1; parte <= total; parte++) {
      const marca = `${serieId}#${parte}`;
      const d = porParte[parte];
      if (d) {
        const x = d.data();
        // Parte com erro que já sumiu da lista: tenta de novo (o cron só olha a janela de dias perto de hoje)
        if (x.status === 'erro' && x.fabrica?.ativo !== false && !refeitas.has(marca) && x.fabrica?.quando < new Date(Date.now() - 2 * 24 * 3600e3).toISOString()) {
          await d.ref.update({
            status: x.statusAntes || 'pendente',
            tentativas: 0,
            erro: null,
            ultimoErro: null,
            'fabrica.quando': new Date().toISOString(),
            ...(x.fabrica?.quandoYoutube ? { 'fabrica.quandoYoutube': proximoHorario(x.fabrica.quandoYoutube) } : {}),
          });
          novasRefeitas.push(marca);
        }
        continue;
      }
      if (refeitas.has(marca)) continue; // já recriamos uma vez e o dono apagou de novo: respeita
      // Só recria a continuação de uma parte que está pronta e ainda na fábrica (lote cancelado de propósito fica cancelado)
      const ant = porParte[parte - 1]?.data();
      if (!ant || ant.status !== 'concluido' || ant.fabrica?.ativo === false) continue;
      const base = ant;
      const f = base.fabrica || {};
      const resumo = base.serie.resumos?.[parte - 1] || '';
      const anteriorYt = ant.fabrica?.quandoYoutube;
      await col.doc().set({
        tema: `${base.serie.nome} (Parte ${parte} de ${total})${resumo ? `: ${resumo}` : ''}`,
        serie: { ...base.serie, parte },
        estilo: base.estilo,
        formato: base.formato || 'short',
        duracaoDesejada: base.duracaoDesejada || '60',
        animar: base.animar !== false,
        animacaoCompleta: base.animacaoCompleta === true,
        status: 'pendente',
        origem: 'fabrica',
        completaSerie: true,
        criadoEm: new Date().toISOString(),
        fabrica: {
          ativo: true,
          lote: f.lote || Date.now().toString(36),
          quando: new Date().toISOString(),
          quandoYoutube: f.redes?.youtube ? proximoHorario(anteriorYt ? new Date(new Date(anteriorYt).getTime() + 24 * 3600e3).toISOString() : f.quandoYoutube) : null,
          redes: f.redes || {},
          canalYoutube: f.canalYoutube || null,
        },
      });
      novasRefeitas.push(marca);
    }
  }
  if (novasRefeitas.length) await cfg.set({ refeitas: [...refeitas, ...novasRefeitas].slice(-300) }, { merge: true });
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const db = getDb();
  const col = db.collection(COL);

  try {
    // GET ?conexao=lcs -> confere se a Página/Instagram da empresa estão ligados (não publica nada)
    if (req.method === 'GET' && req.query.conexao) {
      return res.status(200).json(await testarConta(String(req.query.conexao)));
    }
    if (req.method === 'GET' && req.query.capas === '1') {
      // Capas refeitas de vídeos que já estão no YouTube: o PC troca a miniatura lá
      // 'erro' também volta (até 3 tentativas): falha no PC ou canal ainda sem verificação, que o dono pode resolver depois
      const snap = await col.where('fabrica.capaYoutube.status', 'in', ['pendente', 'erro']).get();
      const itens = snap.docs.filter((d) => {
        const c = d.data().fabrica.capaYoutube;
        return c.status === 'pendente' || ((c.tentativas || 0) < 3 && Date.now() - (c.em || 0) > 10 * 60e3);
      }).map((d) => {
        const x = d.data();
        return { id: d.id, url: x.fabrica.capaYoutube.url || x.thumbnailUrl, youtubeUrl: x.fabrica.youtube?.url || '', canalYoutube: x.fabrica.canalYoutube || null };
      });
      return res.status(200).json({ itens });
    }
    if (req.method === 'GET') {
      if (req.query.youtube !== '1') await completarSeries(db, col).catch(() => {});
      // Economia de leituras do banco (o plano grátis tem limite por dia):
      //  - ?youtube=1 (o PC pergunta a cada 2 min): lê só os vídeos que estão esperando para subir no YouTube
      //  - lista da Fábrica: lê só de 3 dias atrás em diante (o que já passou não aparece mais na tela)
      const snap = req.query.youtube === '1'
        ? await col.where('fabrica.youtube.status', 'in', ['pendente', 'enviando', 'erro']).get()
        : await col.where('fabrica.quando', '>=', new Date(Date.now() - 3 * 24 * 3600e3).toISOString()).get();
      // Vídeos com erro aparecem sempre, mesmo os antigos (antes sumiam da lista depois de 3 dias)
      const docsLista = [...snap.docs];
      if (req.query.youtube !== '1') {
        const comErro = await col.where('status', '==', 'erro').get().catch(() => ({ docs: [] }));
        const ja = new Set(docsLista.map((d) => d.id));
        comErro.docs.forEach((d) => !ja.has(d.id) && d.data().fabrica && docsLista.push(d));
      }
      let itens = docsLista.filter((d) => d.data().fabrica?.ativo === true).map((d) => {
        const x = d.data();
        return {
          id: d.id,
          tema: x.tema,
          titulo: x.roteiro?.titulo || null,
          descricao: x.roteiro?.descricao || '',
          tags: x.roteiro?.tags || [],
          estilo: x.estilo,
          animar: x.animar !== false,
          status: x.status,
          erro: x.erro || x.ultimoErro || null,
          aviso: x.aviso || null, // ex.: efeitos sonoros não saíram (chave sem permissão)
          // Andamento da animação (acompanhar pelo celular): quantas cenas já estão prontas
          cenas: Array.isArray(x.arquivos) && x.arquivos.length
            ? { total: x.arquivos.length, imagens: x.arquivos.filter((a) => a.imageUrl).length, animadas: x.arquivos.filter((a) => a.videoUrl).length, animando: x.arquivos.filter((a) => a.klingTaskId && !a.videoUrl && !a.falhouAnimacao).length }
            : null,
          criadoEm: x.criadoEm || null,
          videoUrl: x.videoUrl || null,
          thumbnailUrl: x.thumbnailUrl || null,
          quando: x.fabrica.quando,
          quandoYoutube: x.fabrica.quandoYoutube || null,
          redes: x.fabrica.redes,
          canalYoutube: x.fabrica.canalYoutube || null,
          youtube: x.fabrica.youtube || null,
          lote: x.fabrica.lote,
          serie: x.serie || null,
          marca: x.marca || '',
          oracao: x.oracao || null,
          formato: x.formato || 'short',
          longo: x.longo === true,
          documentario: x.documentario === true,
          games: x.games === true, // canal de games (Próxima Fase): aba própria no Compilador
          playlist: x.roteiro?.playlist?.titulo ? x.roteiro.playlist : null, // documentário: entra sozinho na playlist da série (ex.: "Catástrofes do Brasil")
          infantil: x.infantil ? { personagem: x.infantil.personagem?.nome || '', musica: x.roteiro?.musica?.titulo || '', teste: x.infantil.teste === true, shortMusica: x.shortMusica === true, temporada: x.infantil.temporada ? { nome: x.infantil.temporada.nome, numero: x.infantil.temporada.numero, ep: x.infantil.temporada.ep, total: x.infantil.temporada.total } : null } : null,
          comBotao: x.comBotao === true,
          renderId: x.renderId || null, // pedido de montagem no PC: liga o cartão da Fila do Compilador a este vídeo
          corte: x.corte ? { tipo: x.corte.tipo === 'comico' ? 'comico' : 'filme' } : null,
        };
      });
      if (req.query.youtube === '1') {
        const agora = Date.now();
        itens = itens.filter(
          (i) =>
            i.status === 'concluido' && i.videoUrl && i.redes?.youtube &&
            (i.youtube?.status === 'pendente' ||
              (i.youtube?.status === 'enviando' && agora - (i.youtube.em || 0) > 3 * 3600e3) ||
              // deu erro (limite do dia, internet...): tenta de novo sozinho depois de 6 h, até 3 vezes
              (i.youtube?.status === 'erro' && agora - (i.youtube.em || 0) > 6 * 3600e3 && (i.youtube.tentativas || 0) < 3))
        );
      }
      itens.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
      return res.status(200).json({ itens });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
    const b = req.body || {};

    if (b.acao === 'criar') {
      if (!process.env.GROQ_API_KEY) return res.status(500).json({ erro: 'GROQ_API_KEY não configurada na Vercel.' });
      const hora = (h, pad) => (/^\d{2}:\d{2}$/.test(String(h || '')) ? h : pad);

      // ── Vídeos de divulgação da empresa (LCS): 3 por semana (seg, qua, sex), só Facebook e Instagram da empresa ──
      if (b.marca) {
        const emp = empresa(b.marca);
        if (!emp) return res.status(400).json({ erro: 'Empresa desconhecida.' });
        const redesEmp = { youtube: false, facebook: !!b.redes?.facebook, instagram: !!b.redes?.instagram, tiktok: false, kwai: false };
        if (!redesEmp.facebook && !redesEmp.instagram) return res.status(400).json({ erro: 'Marque Facebook ou Instagram.' });
        const falta = faltaConfigurar(b.marca, redesEmp);
        if (falta.length) {
          return res.status(400).json({ erro: `Falta ligar a Página/Instagram da ${emp.nome} ao Youvideo. Na Vercel (projeto youvideo → Settings → Environment Variables) crie: ${falta.join(', ')} e faça um novo deploy.` });
        }
        const semanas = Math.max(1, Math.min(12, Number(b.semanas) || 4));
        const diasSemana = (Array.isArray(b.diasSemana) && b.diasSemana.length ? b.diasSemana : [1, 3, 5]).map(Number); // 1 = segunda
        const horario = hora(b.horarios?.[0], '11:30');
        const todos = await col.where('fabrica.ativo', '==', true).get();
        const daEmpresa = todos.docs.filter((d) => d.data().marca === b.marca);
        const ultimoEmp = daEmpresa.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
        const amanhaEmp = somarDias(diaBrasilia(), 1);
        let dia = ultimoEmp && diaBrasilia(new Date(ultimoEmp)) >= amanhaEmp ? somarDias(diaBrasilia(new Date(ultimoEmp)), 1) : amanhaEmp;
        const qtdEmp = semanas * diasSemana.length;
        const datas = [];
        for (let guarda = 0; datas.length < qtdEmp && guarda < 400; guarda++) {
          if (diasSemana.includes(new Date(`${dia}T12:00:00Z`).getUTCDay())) datas.push(dia);
          dia = somarDias(dia, 1);
        }
        const usadosEmp = daEmpresa.map((d) => d.data().tema).filter(Boolean);
        let temasEmp = await temasEmpresa(b.marca, qtdEmp, usadosEmp);
        if (temasEmp.length < qtdEmp) temasEmp = [...temasEmp, ...(await temasEmpresa(b.marca, qtdEmp - temasEmp.length, [...usadosEmp, ...temasEmp]))];
        if (!temasEmp.length) return res.status(500).json({ erro: 'A IA não devolveu temas. Tente de novo.' });
        const loteEmp = Date.now().toString(36);
        const batchEmp = db.batch();
        const criadosEmp = [];
        temasEmp.slice(0, datas.length).forEach((tema, i) => {
          const quando = horarioBrasilia(datas[i], horario);
          const ref = col.doc();
          batchEmp.set(ref, {
            tema,
            marca: b.marca,
            estilo: 'realista',
            formato: 'short',
            duracaoDesejada: '30',
            animar: false,
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: { ativo: true, lote: loteEmp, quando, quandoYoutube: null, redes: redesEmp, canalYoutube: null, conta: b.marca },
          });
          criadosEmp.push({ id: ref.id, tema, quando });
        });
        await batchEmp.commit();
        return res.status(200).json({ lote: loteEmp, criados: criadosEmp, primeiroDia: datas[0] });
      }

      // ── Oração do dia: 1 Short de oração por dia, com a data no título, no canal e nas redes escolhidas ──
      if (b.tipo === 'oracao') {
        const periodo = b.periodo === 'noite' ? 'noite' : 'manha';
        const diasOr = Math.max(1, Math.min(31, Number(b.dias) || 7));
        const horario = hora(b.horarios?.[0], PERIODOS[periodo].hora);
        const redesOr = {
          youtube: !!b.redes?.youtube && !!b.canalYoutube?.id,
          facebook: !!b.redes?.facebook, instagram: !!b.redes?.instagram, tiktok: !!b.redes?.tiktok, kwai: !!b.redes?.kwai,
        };
        if (!Object.values(redesOr).some(Boolean)) return res.status(400).json({ erro: 'Marque pelo menos uma rede.' });
        const todosOr = await col.where('fabrica.ativo', '==', true).get();
        const minhas = todosOr.docs.filter((d) => d.data().oracao?.periodo === periodo);
        const ultimaOr = minhas.map((d) => d.data().oracao?.dia).filter(Boolean).sort().pop();
        let primeiroOr = somarDias(diaBrasilia(), 1);
        // Precisa de tempo para roteiro, voz, imagens e montagem no PC: se faltar menos de 10 h, começa no dia seguinte
        if (new Date(horarioBrasilia(primeiroOr, horario)).getTime() - Date.now() < 10 * 3600e3) primeiroOr = somarDias(primeiroOr, 1);
        if (ultimaOr && ultimaOr >= primeiroOr) primeiroOr = somarDias(ultimaOr, 1); // continua depois da última já criada
        const loteOr = Date.now().toString(36);
        const batchOr = db.batch();
        const criadasOr = [];
        for (let i = 0; i < diasOr; i++) {
          const dia = somarDias(primeiroOr, i);
          const assunto = intencaoDoDia(dia, periodo);
          const quando = horarioBrasilia(dia, horario);
          const tema = `${tituloOracao({ dia, periodo })}: ${assunto}`;
          const ref = col.doc();
          batchOr.set(ref, {
            tema,
            oracao: { periodo, dia, assunto },
            estilo: 'realista',
            formato: 'short',
            duracaoDesejada: '70',
            animar: false,
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: {
              ativo: true,
              lote: loteOr,
              quando,
              quandoYoutube: redesOr.youtube ? quando : null,
              redes: redesOr,
              canalYoutube: redesOr.youtube ? { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') } : null,
            },
          });
          criadasOr.push({ id: ref.id, tema, quando });
        }
        await batchOr.commit();
        return res.status(200).json({ lote: loteOr, criados: criadasOr, primeiroDia: primeiroOr });
      }

      // ── Prévia grátis do infantil: só escreve o roteiro e a letra (Groq), sem imagem, voz, música nem banco ──
      // ── Comparar a qualidade da animação: a mesma cena animada em 720p, 580p e 480p (custa ~US$ 0,23) ──
      if (b.tipo === 'comparar-anim') {
        const snapCmp = await col.where('estilo', '==', 'infantil').get();
        const cenaCmp = snapCmp.docs
          .map((d) => d.data())
          .filter((x) => !x.shortMusica && Array.isArray(x.arquivos))
          .sort((a, b2) => String(b2.criadoEm).localeCompare(String(a.criadoEm)))
          .flatMap((x) => x.arquivos.filter((a) => a.imageUrl && a.bloco === 'antes'))[2];
        if (!cenaCmp) return res.status(400).json({ erro: 'Ainda não tem nenhuma cena de episódio infantil para comparar. Faça um episódio de teste primeiro.' });
        const jobs = [];
        for (const r of ['kling', '720p', '480p']) {
          const j = await enviarAnimacao(cenaCmp.imageUrl, cenaCmp.cena, 'longo', undefined, true, r);
          jobs.push({ res: r, statusUrl: j.statusUrl, responseUrl: j.responseUrl });
        }
        return res.status(200).json({ imagem: cenaCmp.imageUrl, jobs });
      }
      // ── Teste de boca sincronizada: uma fala do Pingo de um episódio pronto, em 2 serviços (menos de US$ 0,50) ──
      if (b.tipo === 'testar-boca') {
        const snapB = await col.where('estilo', '==', 'infantil').get();
        const eps = snapB.docs
          .map((d) => d.data())
          .filter((x) => !x.shortMusica && Array.isArray(x.arquivos) && x.vozInfantil && x.roteiro?.cenas)
          .sort((a, b2) => String(b2.criadoEm).localeCompare(String(a.criadoEm)));
        // Segunda chamada (a cena já foi animada pelo teste): usa o clipe e o áudio que a tela mandou
        let achado = b.videoUrl && b.audioUrl ? { texto: String(b.texto || ''), personagem: String(b.personagem || 'Pingo'), audioUrl: b.audioUrl, videoUrl: b.videoUrl } : null;
        for (const ep of achado ? [] : eps) {
          const principal = ep.infantil?.personagem?.nome || 'Pingo';
          const contagem = { antes: 0, depois: 0 };
          ep.roteiro.cenas.forEach((c, i) => {
            if (achado || !['antes', 'depois'].includes(c.bloco)) return;
            const k = contagem[c.bloco];
            contagem[c.bloco] += (c.falas || []).length || 0;
            const f = (c.falas || [])[0];
            const seg = ep.vozInfantil?.[c.bloco]?.audioSegments?.[k];
            const clip = ep.arquivos[i];
            if (f && f.personagem === principal && (c.falas || []).length === 1 && seg && seg.length >= 2.2 && seg.length <= 8 && (clip?.videoUrl || clip?.imageUrl)) {
              achado = { texto: f.texto, personagem: f.personagem, audioUrl: seg.url, videoUrl: clip.videoUrl || null, imagem: clip.imageUrl, cena: clip.cena };
            }
          });
          if (achado) break;
        }
        if (!achado) return res.status(400).json({ erro: 'Não achei uma cena do Pingo falando (2 a 8 s) nos episódios prontos. Faça um episódio de teste primeiro.' });
        // 2ª rodada: ferramentas que criam o personagem falando a partir da IMAGEM parada + a voz
        // (a sincronia em cima do vídeo pronto não funcionou na gotinha)
        if (b.metodo === 'imagem') {
          if (!achado.imagem) return res.status(400).json({ erro: 'A cena escolhida não tem imagem.' });
          const enviarImg = async (modelo, corpo) => {
            const r = await fetch(`https://queue.fal.run/${modelo}`, {
              method: 'POST',
              headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(corpo),
            });
            const d = await r.json();
            if (!r.ok) return { erro: d.detail ? JSON.stringify(d.detail).slice(0, 200) : d.message || `fal.ai ${r.status}` };
            return { statusUrl: d.status_url, responseUrl: d.response_url };
          };
          const jobsImg = [
            { res: 'fabric', nome: 'VEED Fabric 480p (US$ 0,08/s)', ...(await enviarImg('veed/fabric-1.0', { image_url: achado.imagem, audio_url: achado.audioUrl, resolution: '480p' })) },
            { res: 'omnihuman', nome: 'OmniHuman 1.5 (US$ 0,16/s)', ...(await enviarImg('fal-ai/bytedance/omnihuman/v1.5', { image_url: achado.imagem, audio_url: achado.audioUrl })) },
          ];
          return res.status(200).json({ ...achado, jobs: jobsImg });
        }
        if (!achado.videoUrl) {
          // A cena saiu sem animação (sem crédito na fal.ai): anima primeiro (US$ 0,10) e a tela chama de novo
          const anim = await enviarAnimacao(achado.imagem, `${achado.cena || ''} ${achado.personagem} talking happily`, 'longo', undefined, true, '720p');
          return res.status(200).json({ precisaAnimar: true, texto: achado.texto, personagem: achado.personagem, audioUrl: achado.audioUrl, jobs: [{ res: 'anim', nome: 'animação', statusUrl: anim.statusUrl, responseUrl: anim.responseUrl }] });
        }
        const enviar = async (modelo, corpo) => {
          const r = await fetch(`https://queue.fal.run/${modelo}`, {
            method: 'POST',
            headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo),
          });
          const d = await r.json();
          if (!r.ok) return { erro: d.detail ? JSON.stringify(d.detail).slice(0, 200) : d.message || `fal.ai ${r.status}` };
          const raiz = modelo.split('/').slice(0, 2).join('/');
          return {
            statusUrl: d.status_url || `https://queue.fal.run/${raiz}/requests/${d.request_id}/status`,
            responseUrl: d.response_url || `https://queue.fal.run/${raiz}/requests/${d.request_id}`,
          };
        };
        const jobs = [
          { res: 'sync', nome: 'Sync Lipsync 2 (US$ 3/min)', ...(await enviar('fal-ai/sync-lipsync/v2', { video_url: achado.videoUrl, audio_url: achado.audioUrl, model: 'lipsync-2', sync_mode: 'loop' })) },
          { res: 'kling', nome: 'Kling Lipsync', ...(await enviar('fal-ai/kling-video/lipsync/audio-to-video', { video_url: achado.videoUrl, audio_url: achado.audioUrl })) },
        ];
        return res.status(200).json({ ...achado, jobs });
      }
      if (b.tipo === 'comparar-status') {
        const jobs = Array.isArray(b.jobs) ? b.jobs.slice(0, 3) : [];
        const saida = [];
        for (const j of jobs) {
          if (j.erro || !j.statusUrl) {
            saida.push({ res: j.res, nome: j.nome, status: 'failed', videoUrl: null, erro: j.erro || 'não enviado' });
            continue;
          }
          const c = await checarAnimacao(j.statusUrl, j.responseUrl).catch((e) => ({ status: 'failed', error: e.message }));
          saida.push({ res: j.res, nome: j.nome, status: c.status, videoUrl: c.videoUrl || null, erro: c.error || null });
        }
        return res.status(200).json({ jobs: saida });
      }

      if (b.tipo === 'previa-infantil') {
        const personagemPv = normalizarPersonagem(b.personagem);
        let temaPv = String(b.tema || '').trim().slice(0, 200);
        if (!temaPv) {
          const todosPv = await col.where('fabrica.ativo', '==', true).get();
          const usadosPv = todosPv.docs.filter((d) => d.data().infantil).map((d) => String(d.data().tema || '').toLowerCase());
          const planejados = slugInfantil(personagemPv.nome) === 'pingo' ? EPISODIOS_PINGO : [];
          temaPv = planejados.find((t) => !usadosPv.some((u) => u.startsWith(t.split('—')[0].trim().toLowerCase()))) ||
            (await temasInfantisDaIa(1, personagemPv, usadosPv))[0] || `${personagemPv.nome} e um novo amigo — amizade`;
        }
        const roteiroPv = await gerarRoteiroInfantil({ tema: temaPv, personagem: personagemPv, duracaoSeg: Math.max(180, Math.min(600, Number(b.duracao) || 270)) });
        return res.status(200).json({ tema: temaPv, roteiro: roteiroPv });
      }

      // ── Infantil: o prompt do roteiro para o dono gerar em outra IA (ChatGPT, Claude, Gemini...) ──
      if (b.tipo === 'prompt-infantil') {
        const personagemPr = normalizarPersonagem(b.personagem);
        let temaPr = String(b.tema || '').trim().slice(0, 200);
        if (!temaPr) {
          const todosPr = await col.where('fabrica.ativo', '==', true).get();
          const usadosPr = todosPr.docs.filter((d) => d.data().infantil).map((d) => String(d.data().tema || '').toLowerCase());
          const planejadosPr = slugInfantil(personagemPr.nome) === 'pingo' ? EPISODIOS_PINGO : [];
          temaPr = planejadosPr.find((t) => !usadosPr.some((u) => u.startsWith(t.split('—')[0].trim().toLowerCase()))) ||
            (await temasInfantisDaIa(1, personagemPr, usadosPr))[0] || `${personagemPr.nome} e um novo amigo — amizade`;
        }
        const prompt = await gerarRoteiroInfantil({ tema: temaPr, personagem: personagemPr, duracaoSeg: Math.max(180, Math.min(600, Number(b.duracao) || 270)), soPrompt: true });
        return res.status(200).json({ tema: temaPr, prompt });
      }

      // ── Infantil: episódio com o roteiro trazido de fora (o JSON que a outra IA devolveu) ──
      if (b.tipo === 'infantil-pronto') {
        if (!b.canalYoutube?.id) return res.status(400).json({ erro: 'Escolha o canal do YouTube do desenho infantil.' });
        const personagemRp = normalizarPersonagem(b.personagem);
        const j = lerRoteiroDeFora(b.roteiroTexto);
        const temaRp = String(b.tema || j.titulo || '').split('|')[0].trim().slice(0, 200) || `${personagemRp.nome} — episódio`;
        let roteiroRp;
        try {
          roteiroRp = await gerarRoteiroInfantil({ tema: temaRp, personagem: personagemRp, duracaoSeg: Math.max(180, Math.min(600, Number(b.duracao) || 270)), jPronto: j });
        } catch (e) {
          return res.status(400).json({ erro: e.message });
        }
        const testeRp = b.teste === true;
        let quandoRp = new Date().toISOString();
        if (!testeRp) {
          // Próximo dia livre do personagem (nos dias da semana escolhidos), a partir de daqui a 2 dias
          const diasRp = (Array.isArray(b.diasSemana) && b.diasSemana.length ? b.diasSemana : [2, 5]).map(Number);
          const todosRp = await col.where('fabrica.ativo', '==', true).get();
          const ultimoRp = todosRp.docs
            .filter((d) => d.data().infantil && !d.data().shortMusica && slugInfantil(d.data().infantil.personagem?.nome) === slugInfantil(personagemRp.nome))
            .map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
          let dia = somarDias(diaBrasilia(), 2);
          if (ultimoRp && diaBrasilia(new Date(ultimoRp)) >= dia) dia = somarDias(diaBrasilia(new Date(ultimoRp)), 1);
          for (let g = 0; g < 14 && !diasRp.includes(new Date(`${dia}T12:00:00Z`).getUTCDay()); g++) dia = somarDias(dia, 1);
          quandoRp = horarioBrasilia(dia, hora(b.horarios?.[0], '10:00'));
        }
        const facebookRp = !!b.redes?.facebook && !testeRp;
        const refRp = col.doc();
        await refRp.set({
          tema: temaRp,
          infantil: { personagem: personagemRp, ...(testeRp ? { teste: true } : {}), shortsMusica: b.shortsMusica !== false, roteiroDeFora: true },
          estilo: 'infantil',
          formato: 'longo',
          duracaoDesejada: String(Math.max(180, Math.min(600, Number(b.duracao) || 270))),
          animar: b.animacao !== 'nada',
          animacaoCompleta: b.animacaoCompleta !== false,
          resolucaoAnim: ['720p', '580p', '480p', 'kling', 'omnihuman'].includes(b.resolucaoAnim) ? b.resolucaoAnim : '720p',
          ...(String(b.vozId || '').trim() ? { vozId: String(b.vozId).trim().slice(0, 60) } : {}),
          roteiro: roteiroRp,
          status: 'roteiro_ok', // o roteiro já veio pronto: começa direto nas vozes
          origem: 'fabrica',
          criadoEm: new Date().toISOString(),
          fabrica: {
            ativo: true,
            lote: Date.now().toString(36),
            quando: quandoRp,
            quandoYoutube: testeRp ? null : quandoRp,
            redes: { youtube: true, facebook: facebookRp, instagram: false, tiktok: false, kwai: false },
            ...(facebookRp ? { conta: 'infantil' } : {}),
            canalYoutube: { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') },
          },
        });
        const falas = [...roteiroRp.antes, ...roteiroRp.depois].reduce((t, c) => t + c.falas.length, 0);
        return res.status(200).json({ id: refRp.id, titulo: roteiroRp.titulo, quando: quandoRp, teste: testeRp, falas, musica: roteiroRp.musica.titulo });
      }

      // ── Infantil: episódios animados (~4 a 5 min) com um personagem fixo e uma música chiclete, só YouTube ──
      if (b.tipo === 'infantil') {
        if (!b.canalYoutube?.id) return res.status(400).json({ erro: 'Escolha o canal do YouTube do desenho infantil.' });
        const personagem = normalizarPersonagem(b.personagem);
        // Facebook: Página do Planeta Fofura (o teste nunca vai para o Facebook: sobe só privado no YouTube)
        const facebookIf = !!b.redes?.facebook && b.teste !== true;
        if (facebookIf && (!process.env.INFANTIL_FACEBOOK_PAGE_ACCESS_TOKEN || !process.env.INFANTIL_FACEBOOK_PAGE_ID)) {
          return res.status(400).json({ erro: 'Falta ligar a Página do Planeta Fofura ao Youvideo. Na Vercel (projeto youvideo → Settings → Environment Variables) crie INFANTIL_FACEBOOK_PAGE_ID e INFANTIL_FACEBOOK_PAGE_ACCESS_TOKEN e faça um novo deploy. Ou desmarque o Facebook.' });
        }
        if (!personagem.descricao) return res.status(400).json({ erro: 'Descreva a aparência do personagem.' });
        const semanasIf = Math.max(1, Math.min(12, Number(b.semanas) || 4));
        const diasSemanaIf = (Array.isArray(b.diasSemana) && b.diasSemana.length ? b.diasSemana : [2, 5]).map(Number); // 2 = terça
        const horarioIf = hora(b.horarios?.[0], '10:00');
        const todosIf = await col.where('fabrica.ativo', '==', true).get();
        const meusIf = todosIf.docs.filter((d) => d.data().infantil && slugInfantil(d.data().infantil.personagem?.nome) === slugInfantil(personagem.nome));
        const ultimoIf = meusIf.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
        // Episódio animado leva tempo (roteiro, voz, música, ~25 imagens, animação, montagem): começa daqui a 2 dias
        let diaIf = somarDias(diaBrasilia(), 2);
        if (ultimoIf && diaBrasilia(new Date(ultimoIf)) >= diaIf) diaIf = somarDias(diaBrasilia(new Date(ultimoIf)), 1);
        // Teste: 1 episódio só, que sobe PRIVADO (o dono assiste antes de publicar)
        const testeIf = b.teste === true;
        // Temporada: 6 a 10 episódios em ordem, com uma missão que atravessa todos (a criança acompanha a série)
        const tempQtd = !testeIf && Number(b.temporada) >= 3 ? Math.min(12, Math.round(Number(b.temporada))) : 0;
        const qtdIf = testeIf ? 1 : tempQtd || semanasIf * diasSemanaIf.length;
        const datasIf = [];
        for (let guarda = 0; datasIf.length < qtdIf && guarda < 400; guarda++) {
          if (diasSemanaIf.includes(new Date(`${diaIf}T12:00:00Z`).getUTCDay())) datasIf.push(diaIf);
          diaIf = somarDias(diaIf, 1);
        }
        // Temas: os escritos pelo dono primeiro; no Pingo, os episódios já planejados; a IA completa o resto
        const usadosIf = meusIf.map((d) => d.data().tema).filter(Boolean);
        const jaUsado = (t) => usadosIf.some((u) => u.toLowerCase().startsWith(t.split('—')[0].trim().toLowerCase()));
        let temasIf = (Array.isArray(b.temas) ? b.temas : []).map((t) => String(t).trim().slice(0, 200)).filter(Boolean).slice(0, 40);
        let temporadaIf = null;
        if (tempQtd) {
          temporadaIf = await planejarTemporada(tempQtd, personagem, usadosIf);
          const jaTemporadas = new Set(meusIf.map((d) => d.data().infantil?.temporada?.nome).filter(Boolean));
          temporadaIf.numero = jaTemporadas.size + 1;
          temasIf = temporadaIf.episodios.map((e) => e.tema);
        } else if (slugInfantil(personagem.nome) === 'pingo') temasIf = [...temasIf, ...EPISODIOS_PINGO.filter((t) => !jaUsado(t))];
        temasIf = temasIf.slice(0, qtdIf);
        for (let volta = 0; temasIf.length < qtdIf && volta < 2; volta++) {
          temasIf = [...temasIf, ...(await temasInfantisDaIa(qtdIf - temasIf.length, personagem, [...usadosIf, ...temasIf]))];
        }
        if (!temasIf.length) return res.status(500).json({ erro: 'A IA não devolveu temas. Tente de novo.' });
        const loteIf = Date.now().toString(36);
        const batchIf = db.batch();
        const criadosIf = [];
        temasIf.slice(0, datasIf.length).forEach((tema, i) => {
          // Teste: começa a ser produzido AGORA (não espera o dia da semana escolhido)
          const quando = testeIf ? new Date().toISOString() : horarioBrasilia(datasIf[i], horarioIf);
          const ref = col.doc();
          batchIf.set(ref, {
            tema,
            infantil: {
              personagem,
              ...(testeIf ? { teste: true } : {}),
              shortsMusica: b.shortsMusica !== false,
              ...(temporadaIf
                ? {
                    temporada: {
                      nome: temporadaIf.nome,
                      arco: temporadaIf.arco,
                      numero: temporadaIf.numero,
                      ep: i + 1,
                      total: temporadaIf.episodios.length,
                      resumo: temporadaIf.episodios[i]?.resumo || '',
                      anterior: temporadaIf.episodios[i - 1]?.resumo || '',
                      proximo: temporadaIf.episodios[i + 1]?.resumo || '',
                    },
                  }
                : {}),
            },
            estilo: 'infantil',
            formato: 'longo',
            duracaoDesejada: String(Math.max(180, Math.min(600, Number(b.duracao) || 270))), // 4–5 min ou ~8 min
            animar: b.animacao !== 'nada',
            animacaoCompleta: b.animacaoCompleta !== false, // desenho infantil: todas as cenas animadas (o dono pode escolher o econômico)
            resolucaoAnim: ['720p', '580p', '480p', 'kling', 'omnihuman'].includes(b.resolucaoAnim) ? b.resolucaoAnim : '720p',
            ...(String(b.vozId || '').trim() ? { vozId: String(b.vozId).trim().slice(0, 60) } : {}),
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: {
              ativo: true,
              lote: loteIf,
              quando,
              quandoYoutube: testeIf ? null : quando, // teste: sobe privado, sem data para publicar
              // YouTube (conteúdo para crianças) + Página do Planeta Fofura no Facebook, se marcada
              redes: { youtube: true, facebook: facebookIf, instagram: false, tiktok: false, kwai: false },
              ...(facebookIf ? { conta: 'infantil' } : {}),
              canalYoutube: { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') },
            },
          });
          criadosIf.push({ id: ref.id, tema, quando });
        });
        await batchIf.commit();
        return res.status(200).json({ lote: loteIf, criados: criadosIf, primeiroDia: testeIf ? diaBrasilia() : datasIf[0], temporada: temporadaIf ? { nome: temporadaIf.nome, arco: temporadaIf.arco, numero: temporadaIf.numero } : null });
      }

      // ── Documentários para dormir: episódios já escritos, 1 por dia, só YouTube ──
      if (b.tipo === 'documentario') {
        if (!b.canalYoutube?.id) return res.status(400).json({ erro: 'Escolha o canal do YouTube do documentário.' });
        const horarioDoc = hora(b.horarios?.[0], '19:30');
        // Os vídeos do canal de games usam o mesmo motor (documentario: true), mas têm agenda própria
        const todosDoc = { docs: (await col.where('documentario', '==', true).get()).docs.filter((d) => !d.data().games) };
        const jaUsados = new Set(todosDoc.docs.filter((d) => d.data().status !== 'erro' && d.data().fabrica?.ativo !== false).map((d) => d.data().episodioId));
        const livres = EPISODIOS.filter((e) => !jaUsados.has(e.id));
        if (!livres.length) return res.status(400).json({ erro: 'Todos os episódios já escritos estão na fábrica. Peça novos roteiros.' });
        const quantos = Math.max(1, Math.min(livres.length, Number(b.quantos) || livres.length));
        // Começa no dia pedido (ou daqui a 2 dias: o documentário precisa de tempo para voz, imagens e montagem)
        const minimo = somarDias(diaBrasilia(), 1);
        let diaDoc = /^\d{4}-\d{2}-\d{2}$/.test(String(b.inicio || '')) && b.inicio >= minimo ? b.inicio : somarDias(diaBrasilia(), 2);
        const ultimoDoc = todosDoc.docs.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
        if (ultimoDoc && diaBrasilia(new Date(ultimoDoc)) >= diaDoc) diaDoc = somarDias(diaBrasilia(new Date(ultimoDoc)), 1);
        const loteDoc = Date.now().toString(36);
        const batchDoc = db.batch();
        const criadosDoc = [];
        livres.slice(0, quantos).forEach((ep, i) => {
          const quando = horarioBrasilia(somarDias(diaDoc, i), horarioDoc);
          const ref = col.doc();
          batchDoc.set(ref, {
            tema: ep.titulo,
            documentario: true,
            episodioId: ep.id,
            serie: null,
            estilo: 'realista',
            formato: 'longo',
            animar: false,
            ...(String(b.vozId || '').trim() ? { vozId: String(b.vozId).trim().slice(0, 60) } : {}),
            roteiro: roteiroDoEpisodio(ep),
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: {
              ativo: true,
              lote: loteDoc,
              quando,
              quandoYoutube: quando,
              redes: { youtube: true, facebook: false, instagram: false, tiktok: false, kwai: false },
              canalYoutube: { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') },
            },
          });
          criadosDoc.push({ id: ref.id, tema: ep.titulo, quando });
        });
        await batchDoc.commit();
        return res.status(200).json({ lote: loteDoc, criados: criadosDoc, primeiroDia: diaDoc });
      }

      // ── Canal de games (Próxima Fase): episódios já escritos, imagens oficiais dos jogos, só YouTube ──
      // Usa o mesmo motor dos documentários (voz, cenas, montagem no PC), com ritmo de notícia.
      if (b.tipo === 'games') {
        if (!b.canalYoutube?.id) return res.status(400).json({ erro: 'Escolha o canal do YouTube do Próxima Fase.' });
        const horarioGm = hora(b.horarios?.[0], '18:00');
        const todosGm = (await col.where('games', '==', true).get()).docs;
        const usadosGm = new Set(todosGm.filter((d) => d.data().status !== 'erro' && d.data().fabrica?.ativo !== false).map((d) => d.data().episodioId));
        const livresGm = GAMES.filter((e) => !usadosGm.has(e.id));
        if (!livresGm.length) return res.status(400).json({ erro: 'Todos os episódios de games já escritos estão na fábrica. Peça novos roteiros.' });
        const quantosGm = Math.max(1, Math.min(livresGm.length, Number(b.quantos) || livresGm.length));
        // Dias entre um vídeo e outro (padrão 2: terça/quinta/sábado mais ou menos)
        const intervaloGm = Math.max(1, Math.min(7, Number(b.intervalo) || 2));
        const minimoGm = somarDias(diaBrasilia(), 1);
        let diaGm = /^\d{4}-\d{2}-\d{2}$/.test(String(b.inicio || '')) && b.inicio >= minimoGm ? b.inicio : somarDias(diaBrasilia(), 2);
        const ultimoGm = todosGm.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
        if (ultimoGm && diaBrasilia(new Date(ultimoGm)) >= diaGm) diaGm = somarDias(diaBrasilia(new Date(ultimoGm)), intervaloGm);
        const loteGm = Date.now().toString(36);
        const batchGm = db.batch();
        const criadosGm = [];
        livresGm.slice(0, quantosGm).forEach((ep, i) => {
          const quando = horarioBrasilia(somarDias(diaGm, i * intervaloGm), horarioGm);
          const ref = col.doc();
          batchGm.set(ref, {
            tema: ep.titulo,
            documentario: true, // mesmo motor dos documentários
            games: true,
            episodioId: ep.id,
            serie: null,
            estilo: 'realista',
            formato: 'longo',
            animar: false,
            ...(String(b.vozId || '').trim() ? { vozId: String(b.vozId).trim().slice(0, 60) } : {}),
            roteiro: roteiroDoEpisodio(ep),
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: {
              ativo: true,
              lote: loteGm,
              quando,
              quandoYoutube: quando,
              redes: { youtube: true, facebook: false, instagram: false, tiktok: false, kwai: false },
              canalYoutube: { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') },
            },
          });
          criadosGm.push({ id: ref.id, tema: ep.titulo, quando });
        });
        await batchGm.commit();
        return res.status(200).json({ lote: loteGm, criados: criadosGm, primeiroDia: diaGm });
      }

      // ── Vídeos longos (~12 min, estilo mistério): 2 ou 3 por semana, só no YouTube (+ Facebook opcional) ──
      if (b.tipo === 'longos') {
        if (!b.canalYoutube?.id) return res.status(400).json({ erro: 'Escolha o canal do YouTube: vídeo longo vai principalmente para o YouTube.' });
        const semanasLg = Math.max(1, Math.min(8, Number(b.semanas) || 4));
        const diasSemanaLg = (Array.isArray(b.diasSemana) && b.diasSemana.length ? b.diasSemana : [2, 4, 6]).map(Number); // 2 = terça
        const horarioLg = hora(b.horarios?.[0], '18:00');
        const redesLg = { youtube: true, facebook: !!b.redes?.facebook, instagram: false, tiktok: false, kwai: false };
        const todosLg = await col.where('fabrica.ativo', '==', true).get();
        const meusLg = todosLg.docs.filter((d) => d.data().longo === true);
        const ultimoLg = meusLg.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
        // Vídeo longo leva mais tempo (roteiro grande, ~30 imagens, voz de 12 min, montagem): começa daqui a 2 dias
        let diaLg = somarDias(diaBrasilia(), 2);
        if (ultimoLg && diaBrasilia(new Date(ultimoLg)) >= diaLg) diaLg = somarDias(diaBrasilia(new Date(ultimoLg)), 1);
        const qtdLg = semanasLg * diasSemanaLg.length;
        const datasLg = [];
        for (let guarda = 0; datasLg.length < qtdLg && guarda < 400; guarda++) {
          if (diasSemanaLg.includes(new Date(`${diaLg}T12:00:00Z`).getUTCDay())) datasLg.push(diaLg);
          diaLg = somarDias(diaLg, 1);
        }
        const usadosLg = meusLg.map((d) => d.data().tema).filter(Boolean);
        const projLg = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(200).get();
        projLg.docs.forEach((d) => usadosLg.push(d.data().tema || d.data().titulo));
        const temasDonoLg = (Array.isArray(b.temas) ? b.temas : []).map((t) => String(t).trim().slice(0, 160)).filter(Boolean).slice(0, 40);
        let temasLg = temasDonoLg.slice(0, qtdLg);
        if (temasLg.length < qtdLg) temasLg = [...temasLg, ...(await temasLongosDaIa(qtdLg - temasLg.length, [...usadosLg, ...temasLg].filter(Boolean)))];
        if (temasLg.length < qtdLg) temasLg = [...temasLg, ...(await temasLongosDaIa(qtdLg - temasLg.length, [...usadosLg, ...temasLg].filter(Boolean)))];
        if (!temasLg.length) return res.status(500).json({ erro: 'A IA não devolveu temas. Tente de novo.' });
        const estiloModoLg = ['desenho', 'realista'].includes(b.estiloModo) ? b.estiloModo : 'realista';
        const loteLg = Date.now().toString(36);
        const batchLg = db.batch();
        const criadosLg = [];
        temasLg.slice(0, datasLg.length).forEach((tema, i) => {
          const quando = horarioBrasilia(datasLg[i], horarioLg);
          const estilo = estiloModoLg;
          const ref = col.doc();
          batchLg.set(ref, {
            tema,
            longo: true,
            estilo,
            formato: 'longo',
            duracaoDesejada: String(Math.max(480, Math.min(1200, Number(b.duracao) || 720))),
            animar: false, // 12 min animado sairia caro demais: imagens com zoom
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: {
              ativo: true,
              lote: loteLg,
              quando,
              quandoYoutube: quando,
              redes: redesLg,
              canalYoutube: { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') },
            },
          });
          criadosLg.push({ id: ref.id, tema, quando });
        });
        await batchLg.commit();
        return res.status(200).json({ lote: loteLg, criados: criadosLg, primeiroDia: datasLg[0] });
      }

      // ── Cortes: cenas curtas em diálogo. De filme (imagem realista, dramático) e/ou cômicos (desenho animado) ──
      if (b.tipo === 'cortes') {
        const estiloCorte = ['filme', 'comico', 'alternar'].includes(b.estiloCorte) ? b.estiloCorte : 'alternar';
        const diasCt = Math.max(1, Math.min(31, Number(b.dias) || 7));
        const porDiaCt = Number(b.porDia) === 2 ? 2 : 1;
        const horariosCt = [hora(b.horarios?.[0], '10:00'), hora(b.horarios?.[1], '16:00')];
        const animarCt = b.animacao !== 'nada';
        const redesCt = {
          youtube: !!b.redes?.youtube && !!b.canalYoutube?.id,
          facebook: !!b.redes?.facebook, instagram: !!b.redes?.instagram, tiktok: !!b.redes?.tiktok, kwai: !!b.redes?.kwai,
        };
        if (!Object.values(redesCt).some(Boolean)) return res.status(400).json({ erro: 'Marque pelo menos uma rede.' });

        // Agenda própria dos cortes: continua depois do último corte já reservado
        const todosCt = await col.where('fabrica.ativo', '==', true).get();
        const meus = todosCt.docs.filter((d) => d.data().corte);
        const ultimoCt = meus.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
        let primeiroCt = somarDias(diaBrasilia(), 1);
        // Precisa de tempo para roteiro, vozes, imagens e montagem no PC: se faltar menos de 10 h, começa no dia seguinte
        if (new Date(horarioBrasilia(primeiroCt, horariosCt[0])).getTime() - Date.now() < 10 * 3600e3) primeiroCt = somarDias(primeiroCt, 1);
        if (ultimoCt && diaBrasilia(new Date(ultimoCt)) >= primeiroCt) primeiroCt = somarDias(diaBrasilia(new Date(ultimoCt)), 1);

        // Já usados (cortes da fábrica + projetos salvos) para não repetir cena
        const usadosCt = meus.map((d) => d.data().tema);
        const projCt = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(200).get();
        projCt.docs.forEach((d) => usadosCt.push(d.data().tema || d.data().titulo));

        const qtdCt = diasCt * porDiaCt;
        const tipoDe = (i) => (estiloCorte === 'alternar' ? (i % 2 === 0 ? 'filme' : 'comico') : estiloCorte);
        const precisa = { filme: 0, comico: 0 };
        for (let i = 0; i < qtdCt; i++) precisa[tipoDe(i)]++;
        const temas = {
          filme: await temasCortesDaIa(precisa.filme, 'filme', usadosCt),
          comico: await temasCortesDaIa(precisa.comico, 'comico', usadosCt),
        };
        const loteCt = Date.now().toString(36);
        const batchCt = db.batch();
        const criadosCt = [];
        const vez = { filme: 0, comico: 0 };
        for (let i = 0; i < qtdCt; i++) {
          const tipo = tipoDe(i);
          const t = temas[tipo][vez[tipo]];
          if (!t) continue; // a IA e a lista pronta acabaram para esse tipo: o lote sai menor
          const tom = tipo === 'filme' ? TONS_FILME[vez.filme % TONS_FILME.length] : null;
          vez[tipo]++;
          const n = criadosCt.length; // posição na agenda (sem buraco se algum tema faltou)
          const quando = horarioBrasilia(somarDias(primeiroCt, Math.floor(n / porDiaCt)), horariosCt[n % porDiaCt]);
          const vaiYoutube = redesCt.youtube && n % porDiaCt === 0; // YouTube recebe 1 por dia (o do 1º horário)
          const ref = col.doc();
          batchCt.set(ref, {
            tema: t.nome,
            corte: { tipo, cena: t.cena, ...(tom ? { tom } : {}) },
            estilo: tipo === 'comico' ? 'desenho' : 'realista',
            formato: 'short',
            duracaoDesejada: tipo === 'comico' ? '60' : '45',
            animar: animarCt,
            animacaoCompleta: b.animacaoCompleta === true,
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: {
              ativo: true,
              lote: loteCt,
              quando,
              quandoYoutube: vaiYoutube ? quando : null,
              redes: { ...redesCt, youtube: vaiYoutube },
              canalYoutube: redesCt.youtube ? { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') } : null,
            },
          });
          criadosCt.push({ id: ref.id, tema: t.nome, quando, tipo });
        }
        if (!criadosCt.length) return res.status(500).json({ erro: 'Não consegui escolher cenas novas para os cortes. Tente de novo.' });
        await batchCt.commit();
        return res.status(200).json({ lote: loteCt, criados: criadosCt, primeiroDia: primeiroCt });
      }

      const dias = Math.max(1, Math.min(31, Number(b.dias) || 7));
      const horarios = [hora(b.horarios?.[0], '12:00'), hora(b.horarios?.[1], '19:00')];
      const redes = {
        youtube: !!b.redes?.youtube && !!b.canalYoutube?.id,
        facebook: !!b.redes?.facebook,
        instagram: !!b.redes?.instagram,
        tiktok: !!b.redes?.tiktok,
        kwai: !!b.redes?.kwai,
      };
      if (!Object.values(redes).some(Boolean)) return res.status(400).json({ erro: 'Marque pelo menos uma rede.' });
      const porDia = b.porDia === 1 ? 1 : 2;
      const animacao = ['tudo', 'metade', 'nada'].includes(b.animacao) ? b.animacao : 'metade';

      // Continua depois do último horário já reservado pela fábrica (não encavala lotes)
      const todosAtivos = await col.where('fabrica.ativo', '==', true).get();
      const ativos = { docs: todosAtivos.docs.filter((d) => !d.data().marca && !d.data().oracao && !d.data().corte && !d.data().longo && !d.data().documentario) }; // empresa, oração do dia, cortes, longos e documentários têm agenda própria
      const ultimo = ativos.docs.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
      const amanha = somarDias(diaBrasilia(), 1);
      const primeiroDia = ultimo && diaBrasilia(new Date(ultimo)) >= amanha ? somarDias(diaBrasilia(new Date(ultimo)), 1) : amanha;

      // Temas já usados (fila + projetos) para a IA não repetir
      const usados = [];
      ativos.docs.forEach((d) => usados.push(d.data().serie?.nome || d.data().tema));
      const proj = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(200).get();
      proj.docs.forEach((d) => usados.push(d.data().tema || d.data().titulo));
      const qtd = dias * porDia;
      const partes = b.series === false ? 0 : [2, 3].includes(Number(b.partes)) ? Number(b.partes) : 3;
      // Estilo das imagens: alternar (padrão), só desenho animado ou só realista
      const estiloModo = ['desenho', 'realista'].includes(b.estiloModo) ? b.estiloModo : 'alternar';
      // Temas que o dono escolheu (um por linha na tela): entram primeiro; a IA completa o resto
      const temasDono = (Array.isArray(b.temas) ? b.temas : []).map((t) => String(t).trim().slice(0, 160)).filter(Boolean).slice(0, 40);

      const lote = Date.now().toString(36);
      // Lista de vídeos: { tema, serie?, grupo } (grupo = índice da série, para manter o mesmo estilo nas partes)
      let videos = [];
      if (partes) {
        const qtdSeries = Math.ceil(qtd / partes);
        const pedidos = temasDono.slice(0, qtdSeries);
        let series = pedidos.length ? await seriesDaIa(pedidos.length, partes, usados.filter(Boolean), pedidos) : [];
        if (series.length < qtdSeries) series = [...series, ...(await seriesDaIa(qtdSeries - series.length, partes, [...usados, ...series.map((s) => s.nome)].filter(Boolean)))];
        if (series.length < qtdSeries) series = [...series, ...(await seriesDaIa(qtdSeries - series.length, partes, [...usados, ...series.map((s) => s.nome)]))];
        series.slice(0, qtdSeries).forEach((s, g) => {
          s.partes.forEach((resumo, p) => {
            videos.push({
              tema: `${s.nome} (Parte ${p + 1} de ${partes}): ${resumo}`,
              grupo: g,
              serie: { id: `${lote}-${g}`, nome: s.nome, parte: p + 1, total: partes, personagem: s.personagem, resumos: s.partes },
            });
          });
        });
      } else {
        let temas = temasDono.slice(0, qtd);
        if (temas.length < qtd) temas = [...temas, ...(await temasDaIa(qtd - temas.length, [...usados, ...temas].filter(Boolean)))];
        if (temas.length < qtd) temas = [...temas, ...(await temasDaIa(qtd - temas.length, [...usados, ...temas].filter(Boolean)))];
        videos = temas.slice(0, qtd).map((tema, i) => ({ tema, grupo: i }));
      }
      if (!videos.length) return res.status(500).json({ erro: 'A IA não devolveu temas. Tente de novo.' });

      // Séries: TODAS as partes vão ao YouTube, 1 por dia, em ordem (a série fica completa no canal).
      // O YouTube anda mais devagar que as outras redes; continua depois do último dia já reservado.
      let diaYoutube = amanha;
      if (partes && redes.youtube) {
        const ultimoYt = ativos.docs.map((d) => d.data().fabrica?.quandoYoutube).filter(Boolean).sort().pop();
        if (ultimoYt && diaBrasilia(new Date(ultimoYt)) >= amanha) diaYoutube = somarDias(diaBrasilia(new Date(ultimoYt)), 1);
        if (diaYoutube < primeiroDia) diaYoutube = primeiroDia; // nunca antes do vídeo ficar pronto
      }

      const batch = db.batch();
      const criados = [];
      videos.forEach((v, i) => {
        const dia = somarDias(primeiroDia, Math.floor(i / porDia));
        const vez = i % porDia; // 0 = 1º horário do dia
        const estilo = estiloModo !== 'alternar' ? estiloModo : v.grupo % 2 === 0 ? 'desenho' : 'realista'; // alterna história animada e narrado realista
        const animar = animacao === 'tudo' ? true : animacao === 'nada' ? false : estilo === 'desenho';
        const quando = horarioBrasilia(dia, horarios[vez]);
        const vaiYoutube = redes.youtube && (partes ? true : vez === 0);
        const quandoYoutube = !vaiYoutube ? null : partes ? horarioBrasilia(somarDias(diaYoutube, i), horarios[0]) : horarioBrasilia(dia, horarios[0]);
        const ref = col.doc();
        batch.set(ref, {
          tema: v.tema,
          ...(v.serie ? { serie: v.serie } : {}),
          estilo,
          formato: 'short',
          duracaoDesejada: '60',
          animar,
          animacaoCompleta: b.animacaoCompleta === true, // false = econômica: só as 3 primeiras cenas animadas
          status: 'pendente',
          origem: 'fabrica',
          criadoEm: new Date().toISOString(),
          fabrica: {
            ativo: true,
            lote,
            quando,
            quandoYoutube,
            redes: { ...redes, youtube: vaiYoutube },
            canalYoutube: redes.youtube ? { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') } : null,
          },
        });
        criados.push({ id: ref.id, tema: v.tema, quando, estilo, animar });
      });
      await batch.commit();
      return res.status(200).json({ lote, criados, primeiroDia });
    }

    const ref = col.doc(String(b.id || ''));
    if (!b.id) return res.status(400).json({ erro: 'Falta o id.' });

    if (b.acao === 'youtube-pegar') {
      const ok = await db.runTransaction(async (t) => {
        const d = await t.get(ref);
        const y = d.data()?.fabrica?.youtube;
        if (!y) return false;
        const livre =
          y.status === 'pendente' ||
          (y.status === 'enviando' && Date.now() - (y.em || 0) > 3 * 3600e3) ||
          (y.status === 'erro' && Date.now() - (y.em || 0) > 6 * 3600e3 && (y.tentativas || 0) < 3);
        if (!livre) return false;
        t.update(ref, { 'fabrica.youtube': { status: 'enviando', em: Date.now(), pc: String(b.pc || '').slice(0, 60), tentativas: y.tentativas || 0 } });
        return true;
      });
      return res.status(200).json({ ok });
    }
    if (b.acao === 'youtube-feito') {
      const capaErro = b.capaErro ? String(b.capaErro).slice(0, 300) : null;
      await ref.update({
        'fabrica.youtube': { status: 'ok', em: Date.now(), url: String(b.url || '').slice(0, 200), ...(capaErro ? { capaErro } : {}) },
        // O vídeo subiu, mas o YouTube recusou a thumbnail: aparece na Fábrica (antes só ficava escondido na Fila do PC)
        ...(capaErro ? { aviso: `YouTube recusou a thumbnail: ${capaErro}` } : {}),
      });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'refazer-thumb') {
      // Desenho infantil: faz a thumbnail com título de novo. Se o vídeo já está no YouTube, o PC troca lá.
      const d = (await ref.get()).data() || {};
      if (!d.infantil || !d.roteiro) return res.status(400).json({ erro: 'Só dá para refazer a thumbnail dos desenhos infantis prontos.' });
      if (d.shortMusica) return res.status(400).json({ erro: 'O Short da música usa a cena do vídeo como capa.' });
      let url;
      try {
        url = await thumbInfantil({
          exigirTexto: true,
          personagem: d.infantil.personagem,
          referencia: d.infantil.refUrl,
          titulo: d.roteiro.titulo,
          thumbnailTitulo: d.roteiro.thumbnailTitulo,
          cena: (d.roteiro.cenas || []).find((c) => c.bloco === 'antes' && !/close-up/i.test(c.descricao))?.descricao || '',
        });
      } catch (e) {
        return res.status(500).json({ erro: e.message });
      }
      const noYoutube = d.fabrica?.youtube?.status === 'ok' && d.fabrica.youtube.url;
      await ref.update({
        thumbnailUrl: url,
        aviso: null,
        ...(noYoutube ? { 'fabrica.capaYoutube': { status: 'pendente', url, em: Date.now() } } : {}),
      });
      if (d.fabrica?.agendaId) await db.collection('youvideo_agenda').doc(d.fabrica.agendaId).update({ thumbnailUrl: url }).catch(() => {});
      return res.status(200).json({ ok: true, url, noYoutube: !!noYoutube });
    }
    if (b.acao === 'capa-feita') {
      const erro = b.erro ? String(b.erro).slice(0, 300) : null;
      const antes = (await ref.get()).data()?.fabrica?.capaYoutube || {};
      await ref.update({
        'fabrica.capaYoutube': erro ? { ...antes, status: 'erro', erro, em: Date.now(), tentativas: (antes.tentativas || 0) + 1 } : { status: 'ok', em: Date.now() },
        aviso: erro ? `YouTube recusou a thumbnail: ${erro}` : null,
      });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'youtube-erro') {
      const antes = (await ref.get()).data()?.fabrica?.youtube || {};
      await ref.update({ 'fabrica.youtube': { status: 'erro', em: Date.now(), erro: String(b.erro || '').slice(0, 400), tentativas: (antes.tentativas || 0) + 1 } });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'youtube-repetir') {
      await ref.update({ 'fabrica.youtube': { status: 'pendente', em: Date.now() } });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'cancelar') {
      const d = (await ref.get()).data();
      if (d?.status === 'concluido') {
        await ref.update({ 'fabrica.ativo': false });
        if (d.fabrica?.agendaId) await db.collection('youvideo_agenda').doc(d.fabrica.agendaId).delete().catch(() => {});
      } else {
        await ref.delete();
      }
      return res.status(200).json({ ok: true });
    }
    // Vídeo longo que saiu curto: cria de novo com o mesmo tema e o mesmo horário (roteiro novo, em blocos)
    // e tira o antigo da fábrica. O vídeo que já tiver subido no YouTube o dono apaga lá.
    if (b.acao === 'refazer-longo') {
      const d = (await ref.get()).data();
      if (!d || !d.longo) return res.status(400).json({ erro: 'Só dá para refazer vídeos longos.' });
      const f = d.fabrica || {};
      const novo = col.doc();
      await novo.set({
        tema: d.tema,
        longo: true,
        estilo: d.estilo || 'realista',
        formato: 'longo',
        duracaoDesejada: String(Math.max(480, Math.min(1200, Number(b.duracao) || Number(d.duracaoDesejada) || 720))),
        animar: false,
        status: 'pendente',
        origem: 'fabrica',
        refeitoDe: ref.id,
        criadoEm: new Date().toISOString(),
        fabrica: {
          ativo: true,
          lote: f.lote || Date.now().toString(36),
          quando: f.quando,
          quandoYoutube: f.quandoYoutube || f.quando,
          redes: f.redes || {},
          canalYoutube: f.canalYoutube || null,
        },
      });
      const jaNoYoutube = f.youtube?.status === 'ok' ? f.youtube.url || 'sim' : '';
      if (d.status === 'concluido') {
        await ref.update({ 'fabrica.ativo': false });
        if (f.agendaId) await db.collection('youvideo_agenda').doc(f.agendaId).delete().catch(() => {});
      } else {
        await ref.delete();
      }
      return res.status(200).json({ ok: true, id: novo.id, jaNoYoutube });
    }
    // Documentário pronto feito antes das melhorias: refaz imagens/vídeos, quadrinhos, música e montagem
    // com o roteiro novo do episódio, APROVEITANDO a narração já paga (o texto narrado é o mesmo).
    // Cria um vídeo novo na fábrica (mesmo horário) e tira o antigo; o que já subiu o dono apaga no YouTube Studio.
    if (b.acao === 'refazer-documentario') {
      const d = (await ref.get()).data();
      if (!d?.documentario) return res.status(400).json({ erro: 'Só dá para refazer documentários.' });
      // Notícia e dicas do canal de games: o roteiro está guardado na lista de notícias (não nos episódios escritos)
      let ep = TODOS_EPISODIOS.find((e) => e.id === d.episodioId);
      if (!ep && d.noticia) ep = (await db.collection(COLECAO_NOTICIAS).doc(String(d.noticia)).get()).data()?.ep || null;
      if (!ep) return res.status(400).json({ erro: 'Não achei o roteiro deste vídeo para refazer.' });
      const novoRoteiro = roteiroDoEpisodio(ep);
      const antigas = d.roteiro?.cenas || [];
      // Short de games: narra de novo (é curto e barato) para sair com legenda e com os cortes de 3 segundos
      const shortGames = d.games && d.formato === 'short';
      const temVoz = !shortGames && !!d.narracao?.audioSegments?.length && antigas.length === novoRoteiro.cenas.length && antigas.every((c) => c.start != null);
      const f = d.fabrica || {};
      const novo = col.doc();
      await novo.set({
        tema: d.tema,
        documentario: true,
        ...(d.games ? { games: true } : {}),
        ...(d.noticia ? { noticia: d.noticia } : {}),
        episodioId: d.episodioId,
        serie: null,
        estilo: d.estilo || 'realista',
        formato: d.formato || 'longo',
        animar: false,
        ...(d.vozId ? { vozId: d.vozId } : {}),
        origem: 'fabrica',
        refeitoDe: ref.id,
        criadoEm: new Date().toISOString(),
        ...(temVoz
          ? {
              // Mesma narração: só troca as cenas (busca, quadrinho) mantendo o tempo de cada uma
              roteiro: {
                ...novoRoteiro,
                descricao: d.roteiro.descricao || novoRoteiro.descricao, // já tem os capítulos com o tempo certo
                cenas: novoRoteiro.cenas.map((c, i) => ({ ...c, start: antigas[i].start, length: antigas[i].length })),
              },
              narracao: d.narracao,
              duracaoNarracao: d.duracaoNarracao || null,
              cauda: novoRoteiro.semCauda ? null : d.cauda || null,
              status: 'voz_ok',
            }
          : { roteiro: novoRoteiro, status: 'roteiro_ok' }),
        fabrica: {
          ativo: true,
          lote: f.lote || Date.now().toString(36),
          // Começa já (precisa de tempo para buscar as cenas e montar), o YouTube continua no horário marcado
          quando: new Date().toISOString(),
          quandoOriginal: f.quandoOriginal || f.quando || null,
          quandoYoutube: f.quandoYoutube || f.quando,
          redes: f.redes || { youtube: true },
          canalYoutube: f.canalYoutube || null,
        },
      });
      if (d.status === 'concluido') {
        await ref.update({ 'fabrica.ativo': false });
        if (f.agendaId) await db.collection('youvideo_agenda').doc(f.agendaId).delete().catch(() => {});
      } else {
        await ref.delete();
      }
      return res.status(200).json({ ok: true, id: novo.id, aproveitouVoz: temVoz, jaNoYoutube: f.youtube?.status === 'ok' ? f.youtube.url || 'sim' : '' });
    }
    if (b.acao === 'produzir-agora') {
      // Adianta um vídeo que está esperando a vez: a fábrica começa já na próxima volta (5 min).
      // O horário no YouTube continua o mesmo (o vídeo fica pronto antes e espera o dia de ir ao ar).
      const d = (await ref.get()).data() || {};
      if (d.status !== 'pendente') return res.status(400).json({ erro: 'Esse vídeo já está em produção.' });
      // Guarda o horário original: Facebook/Instagram/TikTok continuam postando no dia marcado
      await ref.update({ 'fabrica.quando': new Date().toISOString(), 'fabrica.quandoOriginal': d.fabrica?.quandoOriginal || d.fabrica?.quando || null });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'criar-short') {
      // Episódio infantil já pronto sem o Short da música (ex.: o erro antigo): cria agora (não duplica)
      const d = (await ref.get()).data() || {};
      if (d.status !== 'concluido') return res.status(400).json({ erro: 'O episódio ainda não ficou pronto.' });
      try {
        const r = await criarShortDaMusica(db, d, ref.id);
        return res.status(200).json({ ok: true, ...r });
      } catch (e) {
        return res.status(400).json({ erro: `Não deu para criar o Short: ${e.message}` });
      }
    }
    if (b.acao === 'destravar') {
      // Vídeo em produção que está repetindo um erro (ex.: esperando crédito): zera as tentativas e tenta já na próxima volta
      const d = (await ref.get()).data() || {};
      if (['concluido', 'erro'].includes(d.status)) return res.status(400).json({ erro: 'Esse vídeo não está em produção.' });
      await ref.update({ tentativas: 0, ultimoErro: null });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'repetir') {
      // Continua da etapa em que parou (não gera tudo de novo)
      const d = (await ref.get()).data() || {};
      const antigo = d.fabrica?.quando && d.fabrica.quando < new Date(Date.now() - 2 * 24 * 3600e3).toISOString();
      await ref.update({
        // Falha na montagem (erros antigos não guardavam a etapa): monta de novo com o que já existe, sem gastar de novo
        status: d.statusAntes || (/^Falha na montagem/.test(d.erro || '') && Array.isArray(d.arquivos) && d.arquivos.length ? 'imagens_ok' : 'pendente'),
        tentativas: 0,
        erro: null,
        ultimoErro: null,
        // Erro antigo: traz para hoje (o cron só olha os vídeos perto da data) e marca o YouTube para o próximo horário livre
        ...(antigo ? { 'fabrica.quando': new Date().toISOString() } : {}),
        ...(antigo && d.fabrica?.quandoYoutube ? { 'fabrica.quandoYoutube': proximoHorario(d.fabrica.quandoYoutube) } : {}),
      });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
