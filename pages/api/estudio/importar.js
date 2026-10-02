// Estúdio de Música — traz para a biblioteca uma música feita em outra plataforma (Suno, Nuivi...)
// O áudio já foi enviado pelo navegador (/api/musica-audio-upload); aqui só registra a música.
// POST { titulo, audioUrl, duracaoSeg, origem: 'suno'|'nuivi'|'outra', letra?, estilo?, instrumental? } -> { musica }
import { getDb } from '../../../lib/firebase-admin';

const ORIGENS = ['suno', 'nuivi', 'outra'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  const b = req.body || {};
  if (!/^https:\/\/[^ ]+\.blob\.vercel-storage\.com\//.test(String(b.audioUrl || ''))) return res.status(400).json({ erro: 'Áudio inválido.' });
  const origem = ORIGENS.includes(b.origem) ? b.origem : 'outra';
  try {
    const musica = {
      titulo: String(b.titulo || 'Música importada').slice(0, 120),
      motor: origem,
      importada: true,
      modelo: '',
      modo: 'personalizado',
      descricao: '',
      letra: String(b.letra || '').slice(0, 6000),
      estilo: String(b.estilo || '').slice(0, 400),
      voz: '',
      instrumental: !!b.instrumental,
      duracaoSeg: Math.max(0, Math.round(Number(b.duracaoSeg) || 0)),
      prompt: '',
      audioUrl: String(b.audioUrl),
      capaUrl: '',
      favorito: false,
      grupoId: '',
      versao: 0,
      criadoEm: new Date().toISOString(),
    };
    const ref = await getDb().collection('youvideo_estudio_musicas').add(musica);
    return res.status(200).json({ musica: { id: ref.id, ...musica } });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
