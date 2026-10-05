// Conexão do TikTok (página /tiktok).
// GET                                  -> situação: chaves, endereço de retorno, conta conectada
// POST { acao: 'teste' }               -> manda o vídeo mais recente da agenda como rascunho para o TikTok
// POST { acao: 'status', publishId }   -> como está aquele envio
// POST { acao: 'desconectar' }         -> esquece a conexão
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { chavesTiktok, validarChavesTiktok, redirectTiktok, tiktokConectado, contaTiktok, enviarRascunhoTiktok, statusEnvioTiktok, desconectarTiktok } from '../../../lib/publicarTiktok';

export const config = { maxDuration: 120 };

// Só o tamanho de cada chave (nunca o valor): ajuda a ver se a chave e o segredo foram colados trocados
function tamanhosChaves() {
  const t = (n) => String(process.env[n] || '').trim().length;
  return { sandboxKey: t('TIKTOK_SANDBOX_CLIENT_KEY'), sandboxSecret: t('TIKTOK_SANDBOX_CLIENT_SECRET'), key: t('TIKTOK_CLIENT_KEY'), secret: t('TIKTOK_CLIENT_SECRET') };
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  try {
    if (req.method === 'GET') {
      const chaves = chavesTiktok();
      const saida = { chaves, redirect: redirectTiktok(req.headers.host), conectado: false, conta: null, erro: null, escopos: '' };
      if (!chaves.key || !chaves.secret) return res.status(200).json(saida);
      // O TikTok reconhece essas chaves? (é o que decide se o botão Conectar vai funcionar)
      saida.validacao = await validarChavesTiktok();
      saida.tamanhos = tamanhosChaves();
      saida.conectado = await tiktokConectado();
      if (saida.conectado) {
        const guardado = (await getDb().collection('youvideo_central').doc('tiktok').get()).data() || {};
        saida.escopos = guardado.escopos || '';
        saida.conectadoEm = guardado.conectadoEm || null;
        try {
          saida.conta = await contaTiktok();
        } catch (e) {
          // Sem a permissão de postagem o TikTok não mostra o nome da conta; o rascunho funciona mesmo assim
          if (e.codigo === 'scope_not_authorized') saida.semNome = true;
          else saida.erro = e.message;
        }
      }
      return res.status(200).json(saida);
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
    const b = req.body || {};

    if (b.acao === 'teste') {
      const snap = await getDb().collection('youvideo_agenda').orderBy('quando', 'desc').limit(40).get();
      const item = snap.docs.map((d) => d.data()).find((x) => x.videoUrl && !x.conta && x.curto !== false);
      if (!item) return res.status(400).json({ erro: 'Não achei nenhum vídeo na agenda para usar no teste. Crie um vídeo na Fábrica primeiro.' });
      const r = await enviarRascunhoTiktok({ videoUrl: item.videoUrl });
      return res.status(200).json({ publishId: r.id, titulo: item.titulo || '' });
    }
    if (b.acao === 'status') {
      if (!b.publishId) return res.status(400).json({ erro: 'Falta o envio.' });
      return res.status(200).json(await statusEnvioTiktok(String(b.publishId)));
    }
    if (b.acao === 'desconectar') {
      await desconectarTiktok();
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ erro: 'Pedido desconhecido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
