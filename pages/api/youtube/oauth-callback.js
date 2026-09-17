// pages/api/youtube/oauth-callback.js
//
// Recebe o "code" do Google, troca por access_token/refresh_token,
// e salva o refresh_token DENTRO do documento do canal no Firestore
// (em vez de numa variável de ambiente da Vercel).

import { db } from "../../../lib/firebase-admin";

export default async function handler(req, res) {
  const { code, state: canalId } = req.query;

  if (!code || !canalId) {
    return res.status(400).send("Parâmetros inválidos no retorno do Google");
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://youvideors2.vercel.app";
    const redirectUri = `${baseUrl}/api/youtube/oauth-callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.refresh_token) {
      console.error("Google não retornou refresh_token:", tokenData);
      return res
        .status(400)
        .send(
          "O Google não retornou um refresh_token. Revogue o acesso anterior em myaccount.google.com/permissions e tente conectar de novo."
        );
    }

    await db.collection("canais").doc(canalId).set(
      {
        youtubeRefreshToken: tokenData.refresh_token,
        youtubeConectadoEm: new Date().toISOString(),
      },
      { merge: true }
    );

    res.redirect(`/novo-canal?canalId=${canalId}&youtube=conectado`);
  } catch (err) {
    console.error("Erro no callback OAuth:", err);
    res.status(500).send("Erro ao processar a autorização do YouTube");
  }
}
