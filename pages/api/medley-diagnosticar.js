import { getDb } from '../../lib/firebase-admin';

export default async function handler(req, res) {
  const { medleyId } = req.query;
  if (!medleyId) return res.status(400).json({ error: 'Passe ?medleyId=... na URL' });

  try {
    const db = getDb();
    const ref = db.collection('youvideo_medley').doc(medleyId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Medley não encontrado' });

    const medley = doc.data();
    const musicas = medley.musicas || [];

    const diagnostico = musicas.map((m, i) => ({
      indice: i,
      ordem: m.ordem,
      status: m.status,
      temAudio: !!m.audioUrl,
      temImagem: !!m.arquivo?.imageUrl,
      erroImagem: m.arquivo?.erro || null,
      inicioLetra: (m.letra || '').slice(0, 40),
    }));

    const comProblema = diagnostico.filter((d) => !d.temImagem);

    if (req.query.corrigir === '1' && comProblema.length) {
      for (const problema of comProblema) {
        musicas[problema.indice].status = 'cenas_ok'; // força gerar a imagem de novo
        delete musicas[problema.indice].arquivo;
      }
      await ref.update({ musicas, status: 'processando', erro: null });
      return res.status(200).json({
        mensagem: `Resetei ${comProblema.length} música(s) sem imagem pra gerar de novo. O medley voltou pro status "processando".`,
        diagnostico,
      });
    }

    return res.status(200).json({
      totalMusicas: musicas.length,
      comProblema: comProblema.length,
      diagnostico,
      dica: comProblema.length
        ? `Tem ${comProblema.length} música(s) sem imagem. Chame essa mesma URL com &corrigir=1 no final pra resetar e tentar gerar de novo.`
        : 'Todas as músicas têm imagem — o problema deve ser outra coisa (áudio quebrado, por exemplo).',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
