// pages/api/fila/[canalId].js
//
// Endpoint genérico de fila: processa 1 vídeo do canal indicado na URL,
// usando os dados salvos no Firestore (voz, personagem, orçamento,
// refresh_token do YouTube) em vez de valores fixos.
//
// IMPORTANTE: troque os 5 imports abaixo pelas suas funções reais
// de roteiro/voz/imagens/montagem/thumbnail já existentes no projeto.

import { db } from "../../../lib/firebase-admin";
import { google } from "googleapis";

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

    const animarHoje = await decidirSeAnimaHoje(canalRef, canal.config);

    const roteiro = await gerarRoteiro({
      nicho: canal.nicho,
      formato: canal.formato,
    });

    const audioUrl = await gerarVoz({
      texto: roteiro.textoNarração,
      vozId: canal.identidade?.vozElevenLabsId,
    });

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

    const videoFinalUrl = await montarVideoFinal({
      audioUrl,
      midias,
      legendaKaraoke: true,
      ambiente: canal.config?.shotstackAmbiente || "sandbox",
    });

    const thumbnailUrl = await gerarThumbnail({
      titulo: roteiro.titulo,
      estiloVisual: canal.identidade?.estiloVisual,
    });

    const videoId = await publicarNoYoutube({
      refreshToken: canal.youtubeRefreshToken,
      videoUrl: videoFinalUrl,
      thumbnailUrl,
      titulo:
