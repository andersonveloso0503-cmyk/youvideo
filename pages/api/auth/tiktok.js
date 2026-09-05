export default function handler(req, res) {
  const state = Math.random().toString(36).slice(2);
  const redirectUri = `${process.env.TIKTOK_REDIRECT_URI}`;

  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: 'video.publish,video.upload',
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  });

  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`);
}
