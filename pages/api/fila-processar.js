import { getDb } from '../../lib/firebase-admin';
import { escolherProximo } from '../../lib/montarPc';
import { agendarItemPronto } from '../../lib/fabrica';
import { empresa, gerarRoteiroEmpresa } from '../../lib/empresa';
import { buscarSaldoFal } from '../../lib/orcamento';
import {
  gerarRoteiro,
  gerarNarracao,
  gerarImagens,
  enviarAnimacao,
  checarAnimacao,
  gerarThumbnail,
  publicarYoutubePrivado,
} from '../../lib/pipeline';

// Aumenta o limite de execução da função (padrão é bem curto e cortava a
// resposta da ElevenLabs no meio pra roteiros mais longos). Precisa do
// plano Pro do Vercel pra valer mais que ~60s.
export const maxDuration = 300;

export default async function handler(req, res) {
  const db = getDb();
  const baseUrl = `https://${req.headers.host}`;

  // Usa o MESMO endpoint de montagem que música/medley usam (em vez de uma
  // cópia separada no lib/pipeline.js), pra qualquer correção futura valer
  // pros dois de uma vez. Também repassa audioSegments quando a narração
  // foi dividida em mais de um pedaço (textos longos passam do limite de
  // caracteres da ElevenLabs numa chamada só).
  const iniciarMontagemViaApi = async ({ audioUrl, audioSegments, cenas, formato, palavras, titulo, marca, cta }) => {
    const temVariosPedacos = (audioSegments || []).length > 1;
    const r = await fetch(`${baseUrl}/api/assemble-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        { ...(temVariosPedacos ? { audioSegments } : { audioUrl }), cenas, formato, palavras, titulo, origem: 'fila', ...(marca ? { marca } : {}), ...(cta ? { cta } : {}) }
      ),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao iniciar a montagem');
    return data.renderId;
  };

  const checarMontagemViaApi = async (renderId) => {
    const r = await fetch(`${baseUrl}/api/assemble-video?id=${renderId}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro checando a montagem');
    return data;
  };

  // Um passo de um item (cada chamada do cron faz alguns passos de itens diferentes)
  async function passo(doc) {
    const item = doc.data();
    const ref = doc.ref;
    switch (item.status) {
      case 'pendente': {
        if (item.marca) {
          // Vídeo de divulgação da empresa: roteiro publicitário
          const roteiroEmp = await gerarRoteiroEmpresa(item.marca, { tema: item.tema, duracaoDesejada: item.duracaoDesejada });
          await ref.update({ roteiro: roteiroEmp, status: 'roteiro_ok' });
          break;
        }
        const roteiro = await gerarRoteiro({
          tema: item.tema,
          estilo: item.estilo,
          formato: item.formato,
          duracaoDesejada: item.duracaoDesejada,
          serie: item.serie || null,
        });
        await ref.update({ roteiro, status: 'roteiro_ok' });
        break;
      }

      case 'roteiro_ok': {
        const narracao = await gerarNarracao({
          texto: item.roteiro.narracao,
          modelo: item.modelo || process.env.ELEVENLABS_MODELO_PADRAO,
          // empresa: voz própria, se configurada (LCS_VOICE_ID); senão, a voz padrão
          ...(item.marca && process.env[`${item.marca.toUpperCase()}_VOICE_ID`] ? { vozId: process.env[`${item.marca.toUpperCase()}_VOICE_ID`] } : {}),
        });
        await ref.update({ narracao, status: 'voz_ok' });
        break;
      }

      case 'voz_ok': {
        const arquivos = await gerarImagens({
          cenas: item.roteiro.cenas,
          estilo: item.estilo,
          formato: item.formato,
          visual: item.marca ? 'empresa' : 'biblico', // empresa: nada de personagens bíblicos nas imagens
        });
        await ref.update({ arquivos, status: 'imagens_ok', ...(item.marca ? { visual: 'empresa' } : {}) });
        break;
      }

      case 'imagens_ok': {
        const emLoop = !!item.fabrica; // fábrica: animação em loop, sem imagem parada
        const numCenas = item.roteiro.cenas.length || 1;
        const ultimaPalavra = (item.narracao.palavras || []).filter((p) => p.end != null).pop();
        const duracaoAlvo = ultimaPalavra ? (ultimaPalavra.end + 0.4) / numCenas : undefined;

        // Fábrica sem crédito na fal.ai: sai com imagens em zoom em vez de travar
        let semCreditoFal = false;
        if (item.fabrica && item.animar !== false) {
          const saldo = await buscarSaldoFal();
          semCreditoFal = saldo.ok && saldo.saldo != null && saldo.saldo < 1;
        }
        if (item.animar === false || semCreditoFal) {
          // Vídeo estático (mais barato): pula a animação e já manda montar
          // direto com as imagens paradas.
          const renderId = await iniciarMontagemViaApi({
            audioUrl: item.narracao.audioUrl,
            audioSegments: item.narracao.audioSegments,
            titulo: item.roteiro?.titulo || item.tema,
            cenas: item.arquivos,
            formato: item.formato,
            palavras: item.narracao.palavras,
            marca: item.marca ? empresa(item.marca)?.marca : '',
            cta: item.marca ? empresa(item.marca)?.cta : '',
          });
          await ref.update({ duracaoAlvo, renderId, status: 'montando' });
          break;
        }

        // Manda animar só um LOTE pequeno de cenas por execução (evita estourar
        // o tempo limite quando há muitas cenas). O que já foi enviado fica
        // marcado; a próxima execução do cron continua de onde parou.
        const LOTE = 5;
        const arquivosAnimados = [...item.arquivos];
        let enviadosNesseLote = 0;

        for (let i = 0; i < arquivosAnimados.length && enviadosNesseLote < LOTE; i++) {
          const arquivo = arquivosAnimados[i];
          if (!arquivo.imageUrl || arquivo.klingTaskId || arquivo.avisoVideo) continue;
          try {
            const { requestId, statusUrl, responseUrl } = await enviarAnimacao(arquivo.imageUrl, arquivo.cena, item.formato, duracaoAlvo, emLoop);
            arquivosAnimados[i] = { ...arquivo, klingTaskId: requestId, statusUrl, responseUrl, ...(emLoop ? { videoLoop: true } : {}) };
          } catch (err) {
            arquivosAnimados[i] = { ...arquivo, avisoVideo: err.message };
          }
          enviadosNesseLote++;
        }

        const faltamEnviar = arquivosAnimados.some((a) => a.imageUrl && !a.klingTaskId && !a.avisoVideo);
        await ref.update({
          arquivos: arquivosAnimados,
          duracaoAlvo,
          status: faltamEnviar ? 'imagens_ok' : 'animando',
        });
        break;
      }

      case 'animando': {
        const arquivosAtualizados = [];
        let todasProntas = true;
        for (const arquivo of item.arquivos) {
          if (!arquivo.klingTaskId || arquivo.videoUrl || arquivo.falhouAnimacao) {
            arquivosAtualizados.push(arquivo);
            continue;
          }
          try {
            const check = await checarAnimacao(arquivo.statusUrl, arquivo.responseUrl);
            if (check.status === 'done') {
              arquivosAtualizados.push({ ...arquivo, videoUrl: check.videoUrl });
            } else if (check.status === 'failed') {
              arquivosAtualizados.push({ ...arquivo, falhouAnimacao: true, avisoVideo: check.error });
            } else {
              arquivosAtualizados.push(arquivo);
              todasProntas = false;
            }
          } catch (err) {
            // Não deixa uma cena com erro derrubar a execução inteira —
            // marca essa cena como falha e segue com as outras.
            arquivosAtualizados.push({ ...arquivo, falhouAnimacao: true, avisoVideo: err.message });
          }
        }
        if (todasProntas) {
          const renderId = await iniciarMontagemViaApi({
            audioUrl: item.narracao.audioUrl,
            audioSegments: item.narracao.audioSegments,
            titulo: item.roteiro?.titulo || item.tema,
            cenas: arquivosAtualizados,
            formato: item.formato,
            palavras: item.narracao.palavras,
          });
          await ref.update({ arquivos: arquivosAtualizados, renderId, status: 'montando' });
        } else {
          await ref.update({ arquivos: arquivosAtualizados });
        }
        break;
      }

      case 'montando': {
        const check = await checarMontagemViaApi(item.renderId);
        if (check.status === 'done' && item.fabrica) {
          // Fábrica: sem capa da Shotstack (Short usa a 1ª imagem) e sem subir no YouTube daqui —
          // o Compilador sobe agendado no canal escolhido; as outras redes vão para a Agenda.
          const thumbnailUrl = (item.arquivos || []).find((x) => x.imageUrl)?.imageUrl || null;
          const agendaId = await agendarItemPronto(item, check.videoUrl, thumbnailUrl);
          await db.collection('youvideo_projects').add({
            origem: 'fabrica',
            categoria: item.marca ? 'empresa' : item.estilo === 'desenho' ? 'historias' : 'series',
            ...(item.marca ? { canal: item.marca } : {}),
            tema: item.tema,
            estilo: item.estilo,
            formato: item.formato,
            titulo: item.roteiro.titulo,
            descricao: item.roteiro.descricao,
            narracaoTexto: item.roteiro.narracao,
            videoUrl: check.videoUrl,
            thumbnailUrl,
            criadoEm: new Date().toISOString(),
          });
          await ref.update({
            status: 'concluido',
            videoUrl: check.videoUrl,
            thumbnailUrl,
            'fabrica.agendaId': agendaId,
            'fabrica.youtube': item.fabrica.redes?.youtube ? { status: 'pendente' } : null,
          });
        } else if (check.status === 'done') {
          const thumbnailUrl = await gerarThumbnail({
            tema: item.tema,
            titulo: item.roteiro.titulo,
            estilo: item.estilo,
            thumbnailTitulo: item.roteiro.thumbnailTitulo,
            thumbnailSubtitulo: item.roteiro.thumbnailSubtitulo,
          });

          let youtubeVideoId = null;
          let avisoYoutube = null;
          if (process.env.YOUTUBE_REFRESH_TOKEN) {
            try {
              youtubeVideoId = await publicarYoutubePrivado({
                videoUrl: check.videoUrl,
                thumbnailUrl,
                titulo: item.roteiro.titulo,
                descricao: item.roteiro.descricao,
                tags: item.roteiro.tags,
                palavras: item.narracao.palavras,
              });
            } catch (err) {
              avisoYoutube = `Vídeo pronto, mas não subiu pro YouTube sozinho: ${err.message}`;
            }
          }

          await db.collection('youvideo_projects').add({
            tema: item.tema,
            estilo: item.estilo,
            formato: item.formato,
            titulo: item.roteiro.titulo,
            descricao: item.roteiro.descricao,
            narracaoTexto: item.roteiro.narracao,
            videoUrl: check.videoUrl,
            thumbnailUrl: thumbnailUrl || null,
            youtubeVideoId: youtubeVideoId || null,
            avisoYoutube,
            criadoEm: new Date().toISOString(),
          });
          await ref.update({
            status: 'concluido',
            videoUrl: check.videoUrl,
            thumbnailUrl: thumbnailUrl || null,
            youtubeVideoId: youtubeVideoId || null,
          });
        } else if (check.status === 'failed') {
          await ref.update({ status: 'erro', erro: `Falha na montagem: ${check.erro || 'motivo não informado'}` });
        }
        break;
      }

      default:
        break;
    }

  }

  // Só a fábrica? (o agendamento automático processa só os vídeos da Fábrica; itens antigos
  // da fila só andam quando alguém chama manualmente, como sempre foi)
  const soFabrica = req.query.fabrica === '1';
  const inicio = Date.now();

  // Conserto (out/2026): os primeiros vídeos da empresa tiveram as imagens geradas com o visual bíblico.
  // Os que ainda não foram publicados voltam para a etapa das imagens e são refeitos com o visual certo.
  try {
    const daEmpresa = await db.collection('youvideo_fila').where('marca', '==', 'lcs').get();
    for (const d of daEmpresa.docs) {
      const x = d.data();
      if (x.visual === 'empresa' || !Array.isArray(x.arquivos) || !x.arquivos.length || !x.roteiro || !x.narracao) continue;
      const agendaId = x.fabrica?.agendaId;
      if (agendaId) {
        const ag = await db.collection('youvideo_agenda').doc(agendaId).get();
        const publicado = Object.values(ag.data()?.redes || {}).some((r) => r?.status === 'ok');
        if (publicado) { await d.ref.update({ visual: 'empresa-antigo' }); continue; } // já foi ao ar: não mexe
        await ag.ref.delete().catch(() => {});
      }
      if (x.videoUrl) {
        const proj = await db.collection('youvideo_projects').where('videoUrl', '==', x.videoUrl).get();
        await Promise.all(proj.docs.map((p) => p.ref.delete().catch(() => {})));
      }
      await d.ref.update({
        status: 'voz_ok', arquivos: [], renderId: null, videoUrl: null, thumbnailUrl: null, erro: null, ultimoErro: null, tentativas: 0,
        'fabrica.agendaId': null, 'fabrica.ativo': true, visual: 'empresa',
      });
    }
  } catch { /* se falhar, tenta de novo na próxima volta */ }

  const feitos = [];
  const vistos = new Set();
  try {
    const snapshot = await db
      .collection('youvideo_fila')
      .where('status', 'not-in', ['concluido', 'erro'])
      .limit(200)
      .get();
    // Na ordem em que vão ser publicados (fábrica) ou de criação: termina um vídeo antes de começar o próximo
    const prioridade = (d) => d.data().fabrica?.quando || d.data().criadoEm || '';
    // Fábrica: só produz o que vai ao ar nos próximos 3 dias (o crédito é gasto aos poucos,
    // dá para cancelar o resto, e o PC não recebe 60 montagens de uma vez)
    const limite = new Date(Date.now() + 3 * 24 * 3600e3).toISOString();
    let docs = snapshot.docs
      .filter((d) => (!soFabrica || d.data().fabrica) && (!d.data().fabrica || d.data().status !== 'pendente' || prioridade(d) <= limite))
      .sort((x, y) => prioridade(x).localeCompare(prioridade(y)));
    if (!docs.length) return res.status(200).json({ mensagem: 'Fila vazia, nada a processar.' });

    // Até ~3 min por chamada, um passo de cada item
    let roteiros = 0;
    while (Date.now() - inicio < 170e3 && feitos.length < 6) {
      // No máximo 1 roteiro por rodada: a Groq grátis tem limite por minuto
      const doc = await escolherProximo(docs.filter((d) => !vistos.has(d.id) && !(roteiros >= 1 && d.data().status === 'pendente')));
      if (!doc) break;
      vistos.add(doc.id);
      const statusAnterior = doc.data().status;
      if (statusAnterior === 'pendente') roteiros++;
      try {
        await passo(doc);
        feitos.push({ id: doc.id, statusAnterior });
        if (doc.data().tentativas) await doc.ref.update({ tentativas: 0 });
      } catch (err) {
        // Não deixa um item com erro travar a fila (nem gastar crédito repetindo para sempre)
        const tentativas = (doc.data().tentativas || 0) + 1;
        await doc.ref.update(tentativas >= 3 ? { status: 'erro', erro: err.message, tentativas, statusAntes: statusAnterior } : { tentativas, ultimoErro: err.message });
        feitos.push({ id: doc.id, statusAnterior, erro: err.message });
      }
      if (!soFabrica) break; // chamada manual: um passo só, como antes
    }
    if (!feitos.length) return res.status(200).json({ mensagem: 'Só tem vídeo esperando o Youvideo Compilador montar no PC.' });
    return res.status(200).json({ feitos, processado: feitos[0].id, statusAnterior: feitos[0].statusAnterior });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
