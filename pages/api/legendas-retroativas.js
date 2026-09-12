import { getDb } from '../../lib/firebase-admin';
import { google } from 'googleapis';

// Mesmo gerador de SRT usado no pipeline principal — duplicado aqui de
// propósito pra esse endpoint funcionar sozinho, sem depender de outro
// arquivo mudar no futuro.
function gerarSRT(palavras) {
  if (!palavras || !palavras.length) return null;
  const paraTempo = (s) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(Math.floor(s % 60)).padStart(2, '0');
    const ms = String(Math.round((s % 1) * 1000)).padStart(3, '0');
    return `${h}:${m}:${sec},${ms}`;
  };
  const TAMANHO_BLOCO = 8;
  const validas = palavras.filter((p) => p.start != null && p.end != null && p.end > p.start);
  const blocos = [];
  for (let i = 0; i < validas.length; i += TAMANHO_BLOCO) blocos.push(validas.slice(i, i + TAMANHO_BLOCO));
  return blocos
    .map((bloco, idx) => {
      const inicio = bloco[0].start;
      const fim = bloco[bloco.length - 1].end;
      const texto = bloco.map((p) => p.texto).join(' ');
      return `${idx + 1}\n${paraTempo(inicio)} --> ${paraTempo(fim)}\n${texto}\n`;
    })
    .join('\n');
}

function getYoutube(refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: 'v3', auth: oauth2Client });
}

async function jaTemLegendaPt(youtube, videoId) {
  try {
    const listaRes = await youtube.captions.list({ part: ['snippet'], videoId });
    // Ignora legendas do tipo ASR (geradas automaticamente pelo próprio
    // YouTube) — essas não contam como "já resolvido", são exatamente a
    // legenda ruim que queremos substituir por uma oficial.
    return (listaRes.data.items || []).some(
      (c) => c.snippet.language === 'pt' && c.snippet.trackKind !== 'ASR'
    );
  } catch {
    return false;
  }
}

async function processarColecao({ db, colecao, refreshToken, extrairPalavras }) {
  const resultados = [];
  if (!refreshToken) {
    return [{ status: 'pulado', motivo: 'refresh token desse canal não configurado' }];
  }
  const youtube = getYoutube(refreshToken);
  const snapshot = await db.collection(colecao).where('status', '==', 'concluido').get();

  for (const doc of snapshot.docs) {
    const item = doc.data();
    const videoId = item.youtubeVideoId;
    const palavras = extrairPalavras(item);

    if (!videoId) {
      resultados.push({ id: doc.id, status: 'pulado', motivo: 'sem youtubeVideoId salvo' });
      continue;
    }
    if (!palavras || !palavras.length) {
      resultados.push({ id: doc.id, videoId, status: 'pulado', motivo: 'sem timing de palavras salvo' });
      continue;
    }

    try {
      if (await jaTemLegendaPt(youtube, videoId)) {
        resultados.push({ id: doc.id, videoId, status: 'já tinha legenda em pt' });
        continue;
      }
      const srt = gerarSRT(palavras);
      await youtube.captions.insert({
        part: ['snippet'],
        requestBody: { snippet: { videoId, language: 'pt', name: 'Português', isDraft: false } },
        media: { mimeType: 'application/octet-stream', body: srt },
      });
      resultados.push({ id: doc.id, videoId, status: 'legenda enviada' });
    } catch (err) {
      resultados.push({ id: doc.id, videoId, status: 'erro', erro: err.message });
    }
  }

  return resultados;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getDb();

  try {
    const apostolos = await processarColecao({
      db,
      colecao: 'youvideo_fila',
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN,
      extrairPalavras: (item) => item.narracao?.palavras,
    });

    const musica = await processarColecao({
      db,
      colecao: 'youvideo_musica_fila',
      refreshToken: process.env.YOUTUBE_REFRESH_TOKEN_MUSICA,
      extrairPalavras: (item) => item.palavras,
    });

    return res.status(200).json({ apostolos, musica });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
