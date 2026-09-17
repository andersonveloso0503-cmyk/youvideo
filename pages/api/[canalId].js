import { getDb } from '../../../lib/firebase-admin';
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
} from '../../../lib/pipeline';

// Mesma lógica de máquina de estados do fila-processar.js original, só que:
// 1. Filtrada por canalId (cada canal tem sua própria fila dentro da mesma
//    coleção youvideo_fila — os itens têm um campo canalId).
// 2. Usa a voz do ElevenLabs e o refresh_token do YouTube salvos no
//    documento do canal, em vez dos valores fixos de variável de ambiente.
export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  const { canalId } = req.query;
  if (!canalId) return res.status(400).json({ error: 'canalId é obrigatório' });

  const db = getDb();

  try {
    const canalSnap = await db.collection('canais').doc(canalId).get();
    if (!canalSnap.exists) return res.status(404).json({ error: 'Canal não encontrado' });
    const canal = canalSnap.data();

    if (canal.status !== 'ativo') {
      return res.status(200).json({ mensagem: 'Canal não está ativo, nada a processar.' });
    }

    const snapshot = await db
      .collection('youvideo_fila')
      .where('canalId', '==', canalId)
      .where('status', 'not-in', ['concluido', 'erro'])
      .orderBy('status')
      .orderBy('criadoEm')
      .limit(1)
      .get();

    if (snapshot.empty) return res.status(200).json({ mensagem: 'Fila vazia, nada a processar.' });

    const doc = snapshot.docs[0];
    const item = doc.data();
    const ref = doc.ref;

    const vozId = canal.identidade?.vozElevenLabsId || undefined;
    const refreshToken = canal.youtubeRefreshToken || undefined;
    const marcaDagua = canal.nome || undefined;

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
        const narracao = await gerarNarracao({ texto: item.roteiro.narracao, vozId });
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
          const renderId = await iniciarMontagem({
            audioUrl: item.narracao.audioUrl,
            cenas: item.arquivos,
            formato: item.formato,
            palavras: item.narracao.palavras,
            marca: marcaDagua,
          });
          await ref.update({ duracaoAlvo, renderId, status: 'montando' });
          break;
        }

        const LOTE = 5;
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
            arquivosAtualizados.push({ ...arquivo, falhouAnimacao: true, avisoVideo: err.message });
          }
        }
        if (todasProntas) {
          const renderId = await iniciarMontagem({
            audioUrl: item.narracao.audioUrl,
            cenas: arquivosAtualizados,
            formato: item.formato,
            palavras: item.narracao.palavras,
            marca: marcaDagua,
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
            thumbnailTitulo: item.roteiro.thumbnailTitulo,
            thumbnailSubtitulo: item.roteiro.thumbnailSubtitulo,
          });

          let youtubeVideoId = null;
          let avisoYoutube = null;
          if (refreshToken) {
            try {
              youtubeVideoId = await publicarYoutubePrivado({
                videoUrl: check.videoUrl,
                thumbnailUrl,
                titulo: item.roteiro.titulo,
                descricao: item.roteiro.descricao,
                tags: item.roteiro.tags,
                palavras: item.narracao.palavras,
                refreshToken,
              });
            } catch (err) {
              avisoYoutube = `Vídeo pronto, mas não subiu pro YouTube sozinho: ${err.message}`;
            }
          } else {
            avisoYoutube = 'Canal sem YouTube conectado — vídeo ficou pronto mas não foi publicado.';
          }

          await db.collection('youvideo_projects').add({
            canalId,
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
