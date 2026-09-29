// Fila de montagem no PC (Youvideo Compilador).
// GET  -> { pedidos: [{ id, titulo, receita }] }   pedidos esperando um PC
// POST { id, acao: 'pegar' }                      o PC assume o pedido (só um PC pega cada um)
// POST { id, acao: 'progresso', progresso }       andamento (0..1), aparece no site
// POST { id, acao: 'feito', videoUrl }            vídeo pronto na nuvem -> o site continua o fluxo
// POST { id, acao: 'erro', erro }                 deu erro no PC
// POST { id, acao: 'devolver' }                   o PC desistiu (ex.: app fechado) -> volta para a fila
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { COLECAO } from '../../../lib/montarPc';

const TEMPO_MAX_MONTANDO = 3 * 3600e3; // PC sumiu no meio: depois de 3 h o pedido volta para a fila

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const db = getDb();
  const col = db.collection(COLECAO);

  try {
    if (req.method === 'GET') {
      const snap = await col.where('status', 'in', ['pendente', 'montando']).limit(30).get();
      const agora = Date.now();
      const pedidos = [];
      for (const doc of snap.docs) {
        const d = doc.data();
        if (d.status === 'montando' && agora - (d.atualizadoEm || d.pegoEm || 0) < TEMPO_MAX_MONTANDO) continue;
        let receita = null;
        try {
          receita = d.receita ? JSON.parse(d.receita) : d.receitaUrl ? await (await fetch(d.receitaUrl)).json() : null;
        } catch {}
        if (receita) pedidos.push({ id: doc.id, titulo: d.titulo || receita.titulo || '', criadoEm: d.criadoEm, receita });
      }
      pedidos.sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
      return res.status(200).json({ pedidos });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
    const { id, acao } = req.body || {};
    if (!id) return res.status(400).json({ erro: 'Falta o id do pedido.' });
    const ref = col.doc(String(id));

    if (acao === 'pegar') {
      const ok = await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return false;
        const d = doc.data();
        const agora = Date.now();
        const livre = d.status === 'pendente' || (d.status === 'montando' && agora - (d.atualizadoEm || d.pegoEm || 0) >= TEMPO_MAX_MONTANDO);
        if (!livre) return false;
        t.update(ref, { status: 'montando', pegoEm: agora, atualizadoEm: agora, progresso: 0, pc: String(req.body.pc || '').slice(0, 60) });
        return true;
      });
      return res.status(200).json({ ok });
    }
    if (acao === 'progresso') {
      await ref.update({ progresso: Math.max(0, Math.min(1, Number(req.body.progresso) || 0)), atualizadoEm: Date.now() });
      return res.status(200).json({ ok: true });
    }
    if (acao === 'feito') {
      if (!/^https:\/\//.test(String(req.body.videoUrl || ''))) return res.status(400).json({ erro: 'videoUrl inválido.' });
      await ref.update({ status: 'feito', videoUrl: req.body.videoUrl, progresso: 1, feitoEm: Date.now(), atualizadoEm: Date.now() });
      return res.status(200).json({ ok: true });
    }
    if (acao === 'erro') {
      await ref.update({ status: 'erro', erro: String(req.body.erro || 'Erro no PC').slice(0, 500), atualizadoEm: Date.now() });
      return res.status(200).json({ ok: true });
    }
    if (acao === 'devolver') {
      await ref.update({ status: 'pendente', atualizadoEm: Date.now(), progresso: 0 });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
