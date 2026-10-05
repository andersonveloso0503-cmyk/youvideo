// Volta da autorização do TikTok: troca o código pela conexão e guarda (não precisa colar nada na Vercel).
import { getDb } from '../../../lib/firebase-admin';
import { redirectTiktok, salvarTokensTiktok, credenciaisTiktok } from '../../../lib/publicarTiktok';

const pagina = (res, status, titulo, texto) =>
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8').send(
    `<div style="font-family:sans-serif;padding:40px;background:#15130f;color:#f3ead9;max-width:560px;margin:0 auto"><h2>${titulo}</h2><p>${texto}</p><p><a style="color:#d9a441;font-weight:700" href="/tiktok">← Voltar para a página do TikTok</a></p></div>`
  );
const limpo = (t) => String(t || '').replace(/[<>&"]/g, '');

export default async function handler(req, res) {
  const { code, state, error, error_description: descricao } = req.query;
  if (error) return pagina(res, 400, 'O TikTok não autorizou', `Motivo informado pelo TikTok: <b>${limpo(descricao || error)}</b>`);
  if (!code) return pagina(res, 400, 'Autorização incompleta', 'O TikTok não devolveu o código. Tente conectar de novo.');
  try {
    const ref = getDb().collection('youvideo_central').doc('tiktok_state');
    const guardado = (await ref.get()).data();
    const novo = guardado && Date.now() - new Date(guardado.em).getTime() < 15 * 60e3;
    if (!guardado || guardado.state !== state || !novo) return pagina(res, 400, 'Autorização vencida', 'Essa autorização não saiu da página do TikTok do Youvideo ou passou de 15 minutos. Clique em Conectar de novo.');
    await ref.delete();

    const r = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: credenciaisTiktok().key,
        client_secret: credenciaisTiktok().secret,
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: redirectTiktok(req.headers.host),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error_description || d.error || `TikTok respondeu ${r.status}`);
    await salvarTokensTiktok(d, { conectadoEm: new Date().toISOString() });
    return pagina(res, 200, 'TikTok conectado ✅', 'A conexão ficou guardada. Volte para a página do TikTok e mande um vídeo de teste.');
  } catch (e) {
    return pagina(res, 500, 'Não deu para conectar', `Erro: <b>${limpo(e.message)}</b>`);
  }
}
