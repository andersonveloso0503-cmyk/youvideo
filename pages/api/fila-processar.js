import { getDb } from '../../lib/firebase-admin';
import {
  gerarRoteiro,
  gerarNarracao,
  gerarImagens,
  enviarAnimacao,
  checarAnimacao,
  iniciarMontagem,
  checarMontagem,
  gerarThumbnail,
  publicarYoutubePrivado,
} from '../../lib/pipeline';

export default async function handler(req, res) {
  const db = getDb();

  try {
    const snapshot = await db
      .collection('youvideo_fila')
      .where('status', 'not-in', ['concluido', 'erro'])
      .orderBy('status')
      .orderBy('criadoEm')
      .limit(1)
      .get();

    if (snapshot.empty) return res.status(200).json({ mensagem: 'Fila vazia, nada a processar.' });

    const doc = snapshot.docs[0];
    const item = doc.data();
    const ref = doc.ref;

    switch (item.status) {
      case 'pendente': {
        const roteiro = await gerarRoteiro({
          tema: item.tema,
          estilo: item.estilo,
          formato: item.formato,
          duracaoDesejada: item.duracaoDesejada,
        });
        await ref.update({ roteiro, status: 'roteiro_ok' });
        break;
      }

      case 'roteiro_ok': {
        const narracao = await gerarNarracao({ texto: item.roteiro.narracao });
        await ref.update({ narracao, status: 'voz_ok' });
        break;
      }

      case 'voz_ok': {
        const arquivos = await gerarImagens({
          cenas: item.roteiro.cenas,
          estilo: item.estilo,
          formato: item.formato,
        });
        await ref.update({ arquivos, status: 'imagens_ok' });
        break;
      }

      case 'imagens_ok': {
        const numCenas = item.roteiro.cenas.length || 1;
        const ultimaPalavra = (item.narracao.palavras || []).filter((p) => p.end != null).pop();
        const duracaoAlvo = ultimaPalavra ? (ultimaPalavra.end + 0.4) / numCenas : undefined;

        if (item.animar === false) {
          // Vídeo estático (mais barato): pula a animação e já manda montar
          // direto com as imagens paradas.
          const renderId = await iniciarMontagem({
            audioUrl: item.narracao.audioUrl,
            cenas: item.arquivos,
            formato: item.formato,
            palavras: item.narracao.palavras,
          });
          await ref.update({ duracaoAlvo, renderId, status: 'montando' });
          break;
        }

        // Manda animar só um LOTE pequeno de cenas por execução (evita estourar
        // o tempo limite quando há muitas cenas). O que já foi enviado fica
        // marcado; a próxima execução do cron continua de onde parou.
        const LOTE = 1;
        const arquivosAnimados = [...item.arquivos];
        let enviadosNesseLote = 0;

        for (let i = 0; i < arquivosAnimados.length && enviadosNesseLote < LOTE; i++) {
          const arquivo = arquivosAnimados[i];
          if (!arquivo.imageUrl || arquivo.klingTaskId || arquivo.avisoVideo) continue;
          try {
            const { requestId, statusUrl, responseUrl } = await enviarAnimacao(arquivo.imageUrl, arquivo.cena, item.formato, duracaoAlvo);
            arquivosAnimados[i] = { ...arquivo, klingTaskId: requestId, statusUrl, responseUrl };
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
          const check = await checarAnimacao(arquivo.statusUrl, arquivo.responseUrl);
          if (check.status === 'done') {
            arquivosAtualizados.push({ ...arquivo, videoUrl: check.videoUrl });
          } else if (check.status === 'failed') {
            arquivosAtualizados.push({ ...arquivo, falhouAnimacao: true, avisoVideo: check.error });
          } else {
            arquivosAtualizados.push(arquivo);
            todasProntas = false;
          }
        }
        if (todasProntas) {
          const renderId = await iniciarMontagem({
            audioUrl: item.narracao.audioUrl,
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
        const check = await checarMontagem(item.renderId);
        if (check.status === 'done') {
          const thumbnailUrl = await gerarThumbnail({
            tema: item.tema,
            titulo: item.roteiro.titulo,
            estilo: item.estilo,
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
          await ref.update({ status: 'erro', erro: `Falha na montagem da Shotstack: ${check.erro || 'motivo não informado'}` });
        }
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ processado: doc.id, statusAnterior: item.status });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
