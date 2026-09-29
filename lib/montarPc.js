// Fila de "montar no PC": o site deixa aqui a receita do vídeo, o Youvideo
// Compilador (no computador) pega, monta com ffmpeg, sobe o vídeo pronto e
// devolve o link. Substitui a Shotstack (plano limitado a 60 s) sem custo.
import { getDb } from './firebase-admin';
import { put } from '@vercel/blob';

const COLECAO = 'youvideo_montar_pc';
const LIMITE_DOC = 700 * 1024; // receitas grandes (medleys longos) vão para o Blob

export async function criarPedido(receita, origem = '') {
  const db = getDb();
  const ref = db.collection(COLECAO).doc();
  const json = JSON.stringify(receita);
  const dados = {
    status: 'pendente',
    titulo: receita.titulo || '',
    origem: String(origem || ''),
    duracao: receita.duracao || 0,
    criadoEm: Date.now(),
  };
  if (json.length > LIMITE_DOC) {
    const blob = await put(`montar-pc/${ref.id}.json`, json, {
      access: 'public',
      contentType: 'application/json',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
    });
    dados.receitaUrl = blob.url;
  } else {
    dados.receita = json;
  }
  await ref.set(dados);
  return `pc:${ref.id}`;
}

/** Status no mesmo formato da Shotstack: done | failed | (texto de espera). */
export async function statusPedido(renderId) {
  const id = String(renderId).replace(/^pc:/, '');
  const doc = await getDb().collection(COLECAO).doc(id).get();
  if (!doc.exists) return { status: 'failed', erro: 'Pedido de montagem no PC não encontrado.' };
  const d = doc.data();
  if (d.status === 'feito' && d.videoUrl) return { status: 'done', videoUrl: d.videoUrl };
  if (d.status === 'erro') return { status: 'failed', erro: `Erro ao montar no PC: ${d.erro || 'motivo não informado'}` };
  if (d.status === 'montando') {
    const p = Math.round((Number(d.progresso) || 0) * 100);
    return { status: `Montando no seu PC${p ? ` · ${p}%` : ''}...` };
  }
  return { status: 'Na fila do Youvideo Compilador — deixe o app aberto no PC' };
}

export { COLECAO };

/**
 * Filas automáticas: escolhe o próximo item para processar sem travar a fila
 * enquanto um vídeo espera o PC montar (esse fica esperando, os outros andam).
 */
export async function escolherProximo(docs) {
  for (const d of docs) {
    const it = d.data();
    if (it.status === 'montando' && String(it.renderId || '').startsWith('pc:')) {
      const st = await statusPedido(it.renderId).catch(() => ({ status: '' }));
      if (st.status === 'done' || st.status === 'failed') return d;
      continue;
    }
    return d;
  }
  return null;
}
