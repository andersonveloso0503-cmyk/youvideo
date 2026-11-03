// Situação da conexão do Instagram por login do Instagram (página /instagram).
import { exigirToken } from '../../../lib/central';
import { credenciaisIg, redirectIg, igConectado, desconectarIg, CONTAS_IG } from '../../../lib/instagramLogin';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  try {
    if (req.method === 'POST' && req.body?.acao === 'desconectar' && CONTAS_IG[req.body.conta]) {
      await desconectarIg(req.body.conta);
      return res.status(200).json({ ok: true });
    }
    const c = credenciaisIg();
    // Duas linhas apontando para a MESMA conta do Instagram: a mais nova está errada (foi conectada logado na conta do outro canal)
    const contas = await Promise.all(
      Object.entries(CONTAS_IG).map(async ([id, nome]) => {
        const g = await igConectado(id).catch(() => null);
        return { id, nome, conectado: !!g, usuario: g?.usuario || '', expiraEm: g?.expiraEm || null };
      })
    );
    const repetidas = contas.filter((x, i) => x.conectado && contas.some((y, k) => k !== i && y.conectado && y.usuario && y.usuario === x.usuario)).map((x) => x.id);
    return res.status(200).json({ chaves: { id: !!c.id, secret: !!c.secret }, redirect: redirectIg(req.headers.host), contas, repetidas });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
