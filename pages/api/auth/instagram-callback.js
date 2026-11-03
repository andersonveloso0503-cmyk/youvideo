// Volta da autorização do Instagram: guarda a conexão (não precisa colar nada na Vercel).
import { getDb } from '../../../lib/firebase-admin';
import { conectarIg } from '../../../lib/instagramLogin';

const limpo = (t) => String(t || '').replace(/[<>&"]/g, '');
const pagina = (res, status, titulo, texto) =>
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8').send(`<div style="font-family:sans-serif;padding:40px;background:#15130f;color:#f3ead9;max-width:560px;margin:0 auto"><h2>${titulo}</h2><p>${texto}</p><p><a style="color:#d9a441;font-weight:700" href="/instagram">← Voltar</a></p></div>`);

export default async function handler(req, res) {
  const { code, state, error_description: descricao, error, error_reason: motivo } = req.query;
  console.log(`[instagram-callback] chaves recebidas: ${Object.keys(req.query || {}).join(',') || '(nenhuma)'} ${error ? `erro=${error} ${motivo || ''} ${descricao || ''}` : ''}`);
  if (error) return pagina(res, 400, 'O Instagram não autorizou', `Motivo: <b>${limpo(descricao || motivo || error)}</b>`);
  if (!code) {
    // Alguns navegadores devolvem o código depois do "#": a própria página pega e manda de novo
    return res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<script>var h=location.hash.replace(/^#/,'');if(h&&/code=/.test(h)){location.replace(location.pathname+'?'+h);}else{document.write('<div style="font-family:sans-serif;padding:40px;background:#15130f;color:#f3ead9"><h2>Autorização incompleta</h2><p>O Instagram não devolveu o código. Volte para a página /instagram e clique em Conectar (não abra este endereço direto).</p><p><a style=color:#d9a441 href=/instagram>← Voltar</a></p></div>');}</script>`
      );
  }
  try {
    const ref = getDb().collection('youvideo_central').doc('instagram_state');
    const g = (await ref.get()).data();
    if (!g || g.state !== state || Date.now() - new Date(g.em).getTime() > 15 * 60e3) return pagina(res, 400, 'Autorização vencida', 'Passou de 15 minutos ou não saiu da página /instagram. Clique em Conectar de novo.');
    await ref.delete();
    const d = await conectarIg(g.conta, code, req.headers.host);
    return pagina(res, 200, 'Instagram conectado ✅', `Conta <b>@${limpo(d.usuario)}</b> ligada. O botão 📸 dos vídeos prontos já publica nela.`);
  } catch (e) {
    return pagina(res, 500, 'Não deu para conectar', `Erro: <b>${limpo(e.message)}</b>`);
  }
}
