// pages/api/fila/[canalId].js
//
// Endpoint genérico de fila: processa 1 vídeo do canal indicado na URL,
// usando os dados salvos no Firestore (voz, personagem, orçamento,
// refresh_token do YouTube) em vez de valores fixos.
//
// Isso substitui ter um /api/xxx-fila-processar hardcoded por canal —
// o cron-job.org chama SEMPRE a mesma rota, só trocando o [canalId].
//
// IMPORTANTE: as funções gerarRoteiro / gerarVoz / gerarImagens /
// montarVideo / gerarThumbnail já existem no seu projeto (é a lógica
// que roda hoje em /musica-fila-processar e no pipeline dos apóstolos).
// Aqui eu só ORQUESTRO essas chamadas de forma genérica — troque os
// imports abaixo pelos caminhos reais das suas funções.

import { db } from "../../../lib/firebase-admin";
import { google } from "googleapis";

// >>> AJUSTE ESTES IMPORTS para apontar pras suas funções já existentes <<<
import { gerarRoteiro } from "../../../lib/pipeline/roteiro";
import { gerarVoz } from "../../../lib/pipeline/voz";
import { gerarImagensOuVideo } from "../../../lib/pipeline/visual";
import { montarVideoFinal } from "../../../lib/pipeline/montagem";
import { gerarThumbnail } from "../../../lib/pipeline/thumbnail";

export default async function handler(req, res) {
  const { canalId } = req.query;

  if (!canalId) {
    return res.status(400).json({ error: "canalId é obrigatório" });
  }

  try {
    const canalRef = db.collection("canais").doc(canalId);
    const canalSnap = await canalRef.get();

    if (!canalSnap.exists) {
      return res.status(404).json({ error: "Canal não encontrado" });
    }

    const canal = canalSnap.data();

    if (canal.status !== "ativo") {
      return res.status(200).json({ ok: false, motivo: "Canal não está ativo" });
    }

    if (!canal.youtubeRefreshToken) {
      return res
        .status(400)
        .json({ error: "Canal ainda não tem YouTube conectado" });
    }

    // 1. Decide se este vídeo de hoje deve ser ANIMADO ou ESTÁTICO,
    //    respeitando o orçamento (videosAnimadosPorSemana em config)
    const animarHoje = await decidirSeAnimaHoje(canalRef, canal.config);

    // 2. Gera o roteiro com base no nicho do canal
    const roteiro = await gerarRoteiro({
      nicho: canal.nicho,
      formato: canal.formato,
    });

    // 3. Gera a narração usando a voz fixa daquele canal
    const audioUrl = await gerarVoz({
      texto: roteiro.textoNarração,
      vozId: canal.identidade?.vozElevenLabsId,
    });

    // 4. Gera imagens/vídeo, usando o personagem de referência do canal
    //    (se tiver) pra manter consistência visual
    const midias = await gerarImagensOuVideo({
      cenas: roteiro.cenas,
      personagem: canal.identidade?.temPersonagem
        ? {
            nome: canal.identidade.personagemNome,
            descricao: canal.identidade.personagemDescricao,
          }
        : null,
      estiloVisual: canal.identidade?.estiloVisual,
      animar: animarHoje,
    });

    // 5. Monta o vídeo final (Shotstack), respeitando o ambiente escolhido
    const videoFinalUrl = await montarVideoFinal({
      audioUrl,
      midias,
      legendaKaraoke: true,
      ambiente: canal.config?.shotstackAmbiente || "sandbox",
    });

    // 6. Gera thumbnail
    const thumbnailUrl = await gerarThumbnail({
      titulo: roteiro.titulo,
      estiloVisual: canal.identidade?.estiloVisual,
    });

    // 7. Publica no YouTube usando o refresh_token DESSE canal específico
    const videoId = await publicarNoYoutube({
      refreshToken: canal.youtubeRefreshToken,
      videoUrl: videoFinalUrl,
      thumbnailUrl,
      titulo: roteiro.titulo,
      descricao: roteiro.descricao,
      tags: roteiro.tags,
    });

    // 8. Salva o histórico no Firestore
    await canalRef.collection("videos").add({
      titulo: roteiro.titulo,
      youtubeVideoId: videoId,
      animado: animarHoje,
      publicadoEm: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, videoId, animado: animarHoje });
  } catch (err) {
    console.error(`Erro ao processar fila do canal ${canalId}:`, err);
    return res.status(500).json({ error: "Erro ao processar vídeo da fila" });
  }
}

// Controla o orçamento: só anima N vezes por semana, o resto sai estático.
// Guarda um contador simples no próprio documento do canal.
async function decidirSeAnimaHoje(canalRef, config) {
  const limite = config?.videosAnimadosPorSemana ?? 1;
  const hoje = new Date();
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - hoje.getDay());
  const chaveSemanaAtual = inicioSemana.toISOString().slice(0, 10);

  const snap = await canalRef.get();
  const controle = snap.data()?.controleOrcamento || {};

  const jaAnimouEssaSemana =
    controle.semana === chaveSemanaAtual ? controle.animadosUsados || 0 : 0;

  const podeAnimar = jaAnimouEssaSemana < limite;

  await canalRef.set(
    {
      controleOrcamento: {
        semana: chaveSemanaAtual,
        animadosUsados: jaAnimouEssaSemana + (podeAnimar ? 1 : 0),
      },
    },
    { merge: true }
  );

  return podeAnimar;
}

// Publica o vídeo no YouTube usando o refresh_token salvo no Firestore
// (em vez de uma variável de ambiente fixa por canal).
async function publicarNoYoutube({
  refreshToken,
  videoUrl,
  thumbnailUrl,
  titulo,
  descricao,
  tags,
}) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  // Baixa o vídeo final pra um stream (necessário pra API do YouTube)
  const videoRes = await fetch(videoUrl);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  const uploadRes = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title: titulo, description: descricao, tags },
      status: { privacyStatus: "public" },
    },
    media: {
      body: bufferToStream(videoBuffer),
    },
  });

  const videoId = uploadRes.data.id;

  // Define a thumbnail customizada
  if (thumbnailUrl) {
    const thumbRes = await fetch(thumbnailUrl);
    const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
    await youtube.thumbnails.set({
      videoId,
      media: { body: bufferToStream(thumbBuffer) },
    });
  }

  return videoId;
}

function bufferToStream(buffer) {
  const { Readable } = require("stream");
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

// Next.js precisa disso pra rotas de API que lidam com uploads maiores
export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};
