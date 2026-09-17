// pages/api/youtube/oauth-authorize.js
//
// Redireciona para a tela de login do Google, pedindo autorização de
// upload no YouTube. O canalId vai no parâmetro "state" pra sabermos,
// no callback, a qual canal aquele refresh token pertence.
//
// SUPOSIÇÃO: você reaproveita o MESMO Client ID/Secret que já usa pros
// outros canais (projeto "youvideo-507511" no Google Cloud) — não precisa
// criar um client novo por canal, só um refresh token novo por canal.

export default function handler(req, res) {
  const { canalId } = req.query;
  if (!canalId) {
    return res.status(400).send("canalId é obrigatório");
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://youvideors2.vercel.app";
  const redirectUri = `${baseUrl}/api/youtube/oauth-callback`;

  const scopes = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent", // força gerar um novo refresh_token toda vez
    state: canalId,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
