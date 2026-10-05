// Começa a autorização do TikTok. Aberto pela página /tiktok (precisa da senha da Central).
//   /api/auth/tiktok?token=SENHA            -> pede as duas permissões (rascunho e postagem)
//   /api/auth/tiktok?token=SENHA&escopo=upload -> pede só a de rascunho (se o aplicativo não tiver a outra)
import { randomBytes } from 'crypto';
import { getDb } from '../../../lib/firebase-admin';
import { autorizado } from '../../../lib/central';
import { redirectTiktok, credenciaisTiktok } from '../../../lib/publicarTiktok';

export default async function handler(req, res) {
  const pagina = (texto) => res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
    `<div style="font-family:sans-serif;padding:40px;background:#15130f;color:#f3ead9"><h2>Não deu para começar</h2><p>${texto}</p><p><a style="color:#d9a441" href="/tiktok">← Voltar para a página do TikTok</a></p></div>`
  );
  if (!autorizado(req).ok) return pagina('Abra esta conexão pela página <b>/tiktok</b>, com a senha da Central.');
  const { key } = credenciaisTiktok();
  if (!key) return pagina('Falta a chave do aplicativo do TikTok na Vercel.');

  // "state" guardado para a volta: só vale a autorização que saiu daqui, nos próximos 15 minutos
  const state = randomBytes(16).toString('hex');
  await getDb().collection('youvideo_central').doc('tiktok_state').set({ state, em: new Date().toISOString() });

  const params = new URLSearchParams({
    client_key: key,
    scope: req.query.escopo === 'upload' ? 'video.upload' : 'video.publish,video.upload',
    response_type: 'code',
    redirect_uri: redirectTiktok(req.headers.host),
    state,
  });
  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`);
}
