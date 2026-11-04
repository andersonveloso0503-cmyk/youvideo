// Situação da conexão do Instagram por login do Instagram (página /instagram).
import { exigirToken } from '../../../lib/central';
import { getDb } from '../../../lib/firebase-admin';
import { credenciaisIg, redirectIg, igConectado, desconectarIg, CONTAS_IG } from '../../../lib/instagramLogin';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  try {
    if (req.method === 'POST' && req.body?.acao === 'desconectar' && CONTAS_IG[req.body.conta]) {
      await desconectarIg(req.body.conta);
      return res.status(200).json({ ok: true });
    }
    // Diagnóstico: ?diag=games (ou noites) -> conta ligada, últimos envios ao Instagram e Shorts prontos que ainda não foram
    if (req.query.diag && CONTAS_IG[req.query.diag]) {
      const conta = req.query.diag;
      const g = await igConectado(conta).catch(() => null);
      const db = getDb();
      const ag = (await db.collection('youvideo_agenda').where('conta', '==', conta).get()).docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.redes?.instagram)
        .sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || '')))
        .slice(0, 15)
        .map((x) => ({ quando: x.quando, titulo: String(x.titulo || '').slice(0, 70), status: x.redes.instagram.status, erro: x.redes.instagram.erro || '', origem: x.origem || '' }));
      const campo = conta === 'games' ? 'games' : 'politica';
      const fila = (await db.collection('youvideo_fila').where(campo, '==', true).get()).docs.map((d) => d.data());
      const shorts = fila.filter((d) => d.formato === 'short' && d.status === 'concluido' && d.fabrica?.ativo !== false);
      return res.status(200).json({
        conta,
        conectado: !!g,
        usuario: g?.usuario || '',
        conectadoEm: g?.conectadoEm || null,
        agora: new Date().toISOString(),
        shortsProntos: shorts.length,
        esperandoVoceAprovar: shorts.filter((d) => d.fabrica?.youtube?.status === 'revisar').length,
        jaAgendadosOuEnviados: shorts.filter((d) => d.envios?.instagram).length,
        aprovadosSemInstagram: shorts.filter((d) => d.fabrica?.youtube?.status !== 'revisar' && !d.envios?.instagram).length,
        ultimosEnvios: ag,
      });
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
