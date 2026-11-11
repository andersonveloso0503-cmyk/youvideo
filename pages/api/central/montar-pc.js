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

// Trailers da Steam vêm em streaming (.m3u8). Só o Compilador 2.5.24 em diante baixa isso direito;
// para os mais antigos, a cena do trailer vira a imagem do próprio trailer (com zoom), em vez de dar erro.
const ehStreaming = (u) => /\.m3u8(\?|$)/i.test(String(u || ''));
function aceitaStreaming(v) {
  const [a, b, c] = String(v || '0').split('.').map(Number);
  return a > 2 || (a === 2 && (b > 5 || (b === 5 && (c || 0) >= 24)));
}
function tamanhoPadraoWikimedia(receita) {
  const arruma = (u) => (typeof u === 'string' && /upload\.wikimedia\.org\/.+\/thumb\//.test(u) ? u.replace(/\/(\d{2,4})px-([^/]+)$/, (m, w, nome) => (['1600', '1500', '1400', '1200', '1000', '800'].includes(w) ? `/1280px-${nome}` : m)) : u);
  return {
    ...receita,
    clipes: (receita.clipes || []).map((c) => ({ ...c, url: arruma(c.url), ...(c.imagem ? { imagem: arruma(c.imagem) } : {}) })),
  };
}

function semStreaming(receita) {
  if (!(receita.clipes || []).some((c) => ehStreaming(c.url))) return receita;
  const clipes = [];
  for (const c of receita.clipes) {
    if (!ehStreaming(c.url)) clipes.push(c);
    else if (c.imagem) clipes.push({ tipo: 'imagem', url: c.imagem, start: c.start, length: c.length, efeito: 'zoomIn' });
    // sem imagem de reserva: a cena anterior se estende por cima
  }
  return { ...receita, clipes: clipes.length ? clipes : receita.clipes.filter((c) => !ehStreaming(c.url)) };
}

// Ilustrações animadas (política) só são desenhadas pelo Compilador 2.5.51 em diante: o pedido com ilustração
// espera um PC atualizado por até 2 h; depois disso, qualquer PC monta (com as fotos no lugar das ilustrações).
function desenhaIlustracao(v, minimo = 51) {
  const [a, b, c] = String(v || '0').split('.').map(Number);
  return a > 2 || (a === 2 && (b > 5 || (b === 5 && (c || 0) >= minimo)));
}
// Mascote, mapa, documento, caminho, quadro de fotos e cartão sobre a gameplay: Compilador 2.5.82 em diante
const NOVOS = ['mapa', 'documento', 'caminho', 'quadroFotos'];
const precisaNovo = (receita) => (receita?.clipes || []).some((c) => c.ilustracao && (c.ilustracao.mascote || c.ilustracao.sobreJogo || NOVOS.includes(c.ilustracao.tipo)));
const MECANISMO = ['dinheiro', 'divisao', 'conexao', 'plenario'];
const precisaMecanismo = (receita) => (receita?.clipes || []).some((c) => MECANISMO.includes(c.ilustracao?.tipo));
// Desenhos "de aplicativo" (recibo, transferência, rota de viagem, frase de impacto): Compilador 2.5.107 em diante
const APP = ['recibo', 'pix', 'rota', 'impacto'];
const precisaApp = (receita) => (receita?.clipes || []).some((c) => APP.includes(c.ilustracao?.tipo));
const ESPERA_PC_NOVO = 2 * 3600e3;

const TEMPO_MAX_MONTANDO = 60 * 60e3; // PC sumiu no meio (desligou): 1 h sem nenhum progresso e o pedido volta para a fila (outro PC pega)

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const db = getDb();
  const col = db.collection(COLECAO);

  try {
    if (req.method === 'GET') {
      const snap = await col.where('status', 'in', ['pendente', 'montando']).limit(30).get();
      const agora = Date.now();
      // Marca quando um PC atualizado (desenha ilustração) passou por aqui; com ele ligado, o PC antigo nunca pega vídeo ilustrado
      const marca = db.collection('youvideo_config').doc('pc-ilustracao');
      const pcNovo = desenhaIlustracao(req.query.v);
      let pcNovoAtivo = pcNovo;
      if (pcNovo) await marca.set({ visto: agora }, { merge: true }).catch(() => {});
      else pcNovoAtivo = agora - ((await marca.get().catch(() => null))?.data()?.visto || 0) < 15 * 60e3;
      const pedidos = [];
      for (const doc of snap.docs) {
        const d = doc.data();
        if (d.status === 'montando' && agora - (d.atualizadoEm || d.pegoEm || 0) < TEMPO_MAX_MONTANDO) continue;
        let receita = null;
        try {
          receita = d.receita ? JSON.parse(d.receita) : d.receitaUrl ? await (await fetch(d.receitaUrl)).json() : null;
        } catch {}
        if (receita && !pcNovo && (receita.clipes || []).some((c) => c.ilustracao) && (pcNovoAtivo || agora - (d.criadoEm || agora) < ESPERA_PC_NOVO)) continue;
        // ilustração nova num PC que ainda não atualizou: espera (ele se atualiza sozinho em minutos), até 2 h
        if (receita && precisaNovo(receita) && !desenhaIlustracao(req.query.v, 82) && agora - (d.criadoEm || agora) < ESPERA_PC_NOVO) continue;
        // desenhos do mecanismo (dinheiro, divisão, conexão, plenário): Compilador 2.5.97 em diante
        if (receita && precisaMecanismo(receita) && !desenhaIlustracao(req.query.v, 97) && agora - (d.criadoEm || agora) < ESPERA_PC_NOVO) continue;
        if (receita && precisaApp(receita) && !desenhaIlustracao(req.query.v, 107) && agora - (d.criadoEm || agora) < ESPERA_PC_NOVO) continue;
        if (receita && !aceitaStreaming(req.query.v)) receita = semStreaming(receita);
        // Wikimedia só serve miniaturas em tamanhos padrão (1280, 1920...): 1600px dava "Não consegui baixar (400)" no PC
        if (receita) receita = tamanhoPadraoWikimedia(receita);
        if (receita) pedidos.push({ id: doc.id, titulo: d.titulo || receita.titulo || '', criadoEm: d.criadoEm, origem: d.origem || '', receita });
      }
      pedidos.sort((a, b) => (b.receita?.urgente ? 1 : 0) - (a.receita?.urgente ? 1 : 0) || (a.criadoEm || 0) - (b.criadoEm || 0)); // notícia quente primeiro
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
        t.update(ref, { status: 'montando', pegoEm: agora, atualizadoEm: agora, progresso: 0, pc: String(req.body.pc || '').slice(0, 60), ...(req.body.v ? { versaoPc: String(req.body.v).slice(0, 12) } : {}) });
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
      await ref.update({ status: 'feito', videoUrl: req.body.videoUrl, comBotao: req.body.comBotao === true, progresso: 1, feitoEm: Date.now(), atualizadoEm: Date.now() });
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
