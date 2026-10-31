// "Narrar gameplay" (Compilador → aba Games). Dois passos, para caber no tempo da Vercel e o dono revisar o texto:
// POST { acao:'roteiro', videoUrl, duracao, estilo, jogo?, cortarBaixo? } -> o Gemini assiste, o Claude escreve -> { id, analise, roteiro }
// POST { acao:'montar', id, falas?, titulo?, vozId? }                    -> voz, música e pedido de montagem no PC -> { renderId }
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { criarPedido } from '../../../lib/montarPc';
import { analisarGameplay, escreverNarracao, vozDasFalas, musicaDaNarracao, audioDosEfeitos, COLECAO_NARRACOES, ESTILOS, EFEITOS } from '../../../lib/narrarGameplay';

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  const db = getDb();
  const col = db.collection(COLECAO_NARRACOES);
  const b = req.body || {};
  try {
    if (b.acao === 'roteiro') {
      const videoUrl = String(b.videoUrl || '');
      if (!/^https:\/\//.test(videoUrl)) return res.status(400).json({ erro: 'Falta o vídeo.' });
      const duracao = Math.max(5, Math.min(180, Number(b.duracao) || 60));
      const estilo = ESTILOS[b.estilo] ? b.estilo : 'narrador';
      const analise = await analisarGameplay(videoUrl, { jogo: String(b.jogo || '').slice(0, 80), duracao });
      if (!analise.momentos.length) throw new Error('O Gemini assistiu, mas não descreveu nenhum momento da partida. Tente de novo.');
      const roteiro = await escreverNarracao(analise, { estilo, duracao }).catch((e) => {
        throw new Error(`A IA não conseguiu escrever a narração: ${e.message}`);
      });
      const ref = col.doc();
      await ref.set({
        videoUrl,
        duracao,
        estilo,
        cortarBaixo: Math.max(0, Math.min(0.35, Number(b.cortarBaixo) || 0)),
        somDoJogo: b.somDoJogo === true, // mantém o som da gravação baixinho (só quando não tem música por cima)
        analise,
        roteiro,
        status: 'roteiro',
        criadoEm: new Date().toISOString(),
      });
      return res.status(200).json({ id: ref.id, analise, roteiro });
    }

    if (b.acao === 'montar') {
      const ref = col.doc(String(b.id || ''));
      const d = (await ref.get()).data();
      if (!d) return res.status(404).json({ erro: 'Narração não encontrada. Comece de novo.' });
      // O dono pode ter mexido no texto das falas na tela
      const falas = (Array.isArray(b.falas) && b.falas.length ? b.falas : d.roteiro.falas)
        .map((f) => ({ t: Math.max(0, Number(f.t) || 0), texto: String(f.texto || '').trim() }))
        .filter((f) => f.texto)
        .sort((a, c) => a.t - c.t);
      if (!falas.length) return res.status(400).json({ erro: 'Sem falas para narrar.' });
      const titulo = String(b.titulo || d.roteiro.titulo || 'Gameplay narrada').slice(0, 100);
      // Efeitos sonoros: os que o dono deixou na tela (ou os que a IA escolheu)
      const efeitos = (Array.isArray(b.efeitos) ? b.efeitos : d.roteiro.efeitos || [])
        .map((x) => ({ t: Math.max(0, Number(x.t) || 0), tipo: String(x.tipo || '').toLowerCase().trim() }))
        .filter((x) => EFEITOS[x.tipo]);
      const [voz, musicaUrl, sons] = await Promise.all([
        vozDasFalas(falas, { estilo: d.estilo, vozId: String(b.vozId || '').trim(), duracao: d.duracao }),
        musicaDaNarracao().catch(() => null),
        audioDosEfeitos(efeitos, d.duracao).catch(() => []),
      ]);
      if (!voz.audio.length) throw new Error('Nenhuma fala coube no vídeo.');
      const receita = {
        tipo: 'youvideo-montagem',
        versao: 1,
        titulo,
        formato: 'short',
        duracao: d.duracao,
        encaixar: true, // partida inteira no meio, com ela mesma desfocada no fundo
        audio: [
          ...voz.audio,
          ...sons,
          // Som do jogo baixinho por baixo (o próprio vídeo da gravação)
          ...(d.somDoJogo ? [{ url: d.videoUrl, start: 0, length: d.duracao, volume: 0.3 }] : []),
        ],
        ...(musicaUrl ? { musica: { url: musicaUrl, volume: 0.12 } } : {}),
        clipes: [{ tipo: 'video', url: d.videoUrl, start: 0, length: d.duracao, ...(d.cortarBaixo ? { recorte: { baixo: d.cortarBaixo } } : {}) }],
        palavras: voz.palavras,
      };
      const renderId = await criarPedido(receita, 'narrar-gameplay');
      await ref.update({ status: 'montando', renderId, falas, titulo, montadoEm: new Date().toISOString() });
      return res.status(200).json({ ok: true, renderId, falas: voz.audio.length });
    }

    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
