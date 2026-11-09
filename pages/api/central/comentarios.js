// Comentários dos canais de games e política: o PC traz os comentários novos, a IA sugere a resposta,
// você aprova pelo celular (/comentarios) e o PC publica a resposta como o canal.
//
// GET  ?pc=<id>&tem=<canais>     -> (PC) { canais:[ids para olhar], responder:[respostas aprovadas, já reservadas para este PC] }
// GET  (sem pc)                 -> (celular) { itens: comentários esperando você }
// POST { pc, canalId, itens }   -> (PC) comentários novos; a IA escreve a sugestão
// POST { id, acao:'responder', texto } | { id, acao:'ignorar' }  -> (celular)
// PATCH { id, status:'respondido'|'erro'|'liberar', erro }        -> (PC) resultado da publicação
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { ia } from '../../../lib/gamesNoticias';
import { canalDosGamesId, canalDaPolitica } from '../../../lib/politicaMesmoDia';

const COL = 'youvideo_comentarios';
const limpo = (v, n) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, n);

async function canaisVigiados(db) {
  const games = await canalDosGamesId(db).catch(() => '');
  const pol = await canalDaPolitica(db, games).catch(() => null);
  const lista = [];
  if (games) lista.push({ id: String(games), tipo: 'games' });
  if (pol?.id && String(pol.id) !== String(games)) lista.push({ id: String(pol.id), tipo: 'politica', titulo: pol.titulo || '' });
  return lista;
}

const TOM = {
  games:
    'Você responde comentários do canal "Próxima Fase", de notícias de games, no YouTube. Tom: amigo gamer brasileiro, leve, animado, curto (1 a 2 frases, até 200 caracteres), ' +
    'no máximo 1 emoji. Concorde, brinque ou acrescente uma curiosidade verdadeira sobre o assunto do vídeo; quando fizer sentido, devolva uma pergunta pra continuar a conversa. ',
  politica:
    'Você responde comentários do canal "Noites na História", de notícias de política explicadas, no YouTube. O canal é IMPARCIAL: nunca tome partido, nunca ataque nem elogie político, ' +
    'nunca discuta. Tom: educado, curto (1 a 2 frases, até 200 caracteres), sem emoji ou no máximo 1. Agradeça a participação, acrescente um fato neutro do vídeo se ajudar, ' +
    'ou convide a pessoa a dizer o que acha. Se o comentário só xinga ou é discurso de ódio, marque "pular". ',
};

async function sugerir(tipo, itens) {
  if (!itens.length) return [];
  try {
    const j = await ia(
      (TOM[tipo] || TOM.games) +
        'Português do Brasil com ortografia perfeita. Nunca invente fato. Nunca peça inscrição em todas as respostas (no máximo de vez em quando). ' +
        'Marque "pular": true para spam, golpe, link, propaganda de outro canal, ofensa ou comentário sem sentido. ' +
        'Responda só JSON: {"respostas":[{"n":número,"resposta":"...","pular":false}]}',
      itens.map((c, i) => `${i + 1}. [vídeo: ${c.videoTitulo || '?'}] ${c.autor}: ${c.texto.slice(0, 400)}`).join('\n'),
      { temperatura: 0.7 }
    );
    const por = new Map((j?.respostas || []).map((r) => [Number(r.n), r]));
    return itens.map((_, i) => {
      const r = por.get(i + 1) || {};
      return { sugestao: String(r.resposta || '').slice(0, 500), pular: !!r.pular };
    });
  } catch {
    return itens.map(() => ({ sugestao: '', pular: false }));
  }
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const db = getDb();
  const col = db.collection(COL);
  try {
    if (req.method === 'GET' && req.query.pc) {
      const pc = limpo(req.query.pc, 60);
      const canais = await canaisVigiados(db);
      // respostas aprovadas: cada uma é reservada para UM PC (nunca sai duas vezes)
      const tem = new Set(String(req.query.tem || '').split(',').filter(Boolean)); // canais que este PC tem conectados
      const snap = await col.where('status', '==', 'aprovado').limit(40).get();
      const responder = [];
      for (const doc of snap.docs.filter((d) => tem.has(String(d.data().canalId))).slice(0, 20)) {
        const ok = await db.runTransaction(async (t) => {
          const atual = await t.get(doc.ref);
          const x = atual.data() || {};
          if (x.status !== 'aprovado') return false;
          t.update(doc.ref, { status: 'enviando', pc, reservadoEm: Date.now() });
          return true;
        });
        if (ok) responder.push({ id: doc.id, canalId: doc.data().canalId, parentId: doc.id, texto: doc.data().resposta });
      }
      // reserva esquecida (PC desligou no meio): volta para a fila depois de 30 min
      const presas = await col.where('status', '==', 'enviando').get();
      await Promise.all(presas.docs.filter((d) => Date.now() - (d.data().reservadoEm || 0) > 30 * 60e3).map((d) => d.ref.update({ status: 'aprovado', pc: null })));
      return res.status(200).json({ canais, responder });
    }

    if (req.method === 'GET') {
      const snap = await col.where('status', '==', 'novo').get();
      const itens = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.publicadoEm || '').localeCompare(String(a.publicadoEm || '')))
        .slice(0, 80);
      return res.status(200).json({ itens });
    }

    if (req.method === 'POST' && Array.isArray(req.body?.itens)) {
      const b = req.body;
      const canalId = String(b.canalId || '').slice(0, 60);
      const canais = await canaisVigiados(db);
      const canal = canais.find((c) => c.id === canalId);
      if (!canal) return res.status(200).json({ novos: 0, motivo: 'canal fora da lista' });
      const novos = [];
      for (const c of b.itens.slice(0, 60)) {
        const id = String(c.id || '').replace(/[^\w.-]/g, '').slice(0, 120);
        if (!id) continue;
        const ja = await col.doc(id).get();
        if (ja.exists) continue;
        novos.push({ ...c, id });
      }
      const sug = await sugerir(canal.tipo, novos);
      await Promise.all(
        novos.map((c, i) =>
          col.doc(c.id).set({
            canalId,
            tipo: canal.tipo,
            videoId: String(c.videoId || '').slice(0, 30),
            videoTitulo: String(c.videoTitulo || '').slice(0, 150),
            autor: String(c.autor || '').slice(0, 80),
            texto: String(c.texto || '').slice(0, 1500),
            curtidas: Number(c.curtidas) || 0,
            publicadoEm: String(c.publicadoEm || ''),
            sugestao: sug[i].sugestao,
            // spam/ofensa: nem aparece para você
            status: sug[i].pular ? 'ignorado' : 'novo',
            ...(sug[i].pular ? { motivo: 'IA: spam ou ofensa' } : {}),
            criadoEm: Date.now(),
          })
        )
      );
      return res.status(200).json({ novos: novos.length });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const ref = col.doc(String(b.id || '').replace(/[^\w.-]/g, '').slice(0, 120));
      const doc = await ref.get();
      if (!doc.exists) return res.status(404).json({ erro: 'Comentário não encontrado.' });
      if (b.acao === 'ignorar') {
        await ref.update({ status: 'ignorado', ignoradoEm: Date.now() });
        return res.status(200).json({ ok: true });
      }
      if (b.acao === 'responder') {
        const texto = String(b.texto || '').trim().slice(0, 1000);
        if (!texto) return res.status(400).json({ erro: 'Escreva a resposta.' });
        await ref.update({ status: 'aprovado', resposta: texto, aprovadoEm: Date.now() });
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ erro: 'Ação inválida.' });
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      const ref = col.doc(String(b.id || '').replace(/[^\w.-]/g, '').slice(0, 120));
      if (b.status === 'liberar') await ref.update({ status: 'aprovado', pc: null }); // este PC não tem o canal: outro publica
      else if (b.status === 'respondido') await ref.update({ status: 'respondido', respondidoEm: Date.now() });
      else await ref.update({ status: 'erro', erro: String(b.erro || '').slice(0, 300) });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
