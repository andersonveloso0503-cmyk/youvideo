import { getDb } from '../../lib/firebase-admin';
import { publicarRedesSociais } from '../../lib/pipeline';

// Aumenta o limite de execução da função (padrão é bem curto e cortava
// respostas de IA mais demoradas no meio). Precisa do plano Pro do
// Vercel pra valer mais que ~60s.
export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  const db = getDb();
  const baseUrl = `https://${req.headers.host}`;
  const idAlvo = req.method === 'POST' ? req.body?.id : req.query?.id;

  try {
    let doc;
    if (idAlvo) {
      // Publicação manual de UM item específico (botão "Publicar agora").
      const docRef = db.collection('youvideo_musica_fila').doc(idAlvo);
      const snap = await docRef.get();
      if (!snap.exists) return res.status(404).json({ error: 'Item não encontrado' });
      if (snap.data().status !== 'renderizado') {
        return res.status(400).json({ error: `Esse item ainda não está pronto pra publicar (status atual: ${snap.data().status})` });
      }
      doc = snap;
    } else {
      // Fluxo automático diário: pega o mais antigo pronto na fila.
      const snapshot = await db
        .collection('youvideo_musica_fila')
        .where('status', '==', 'renderizado')
        .orderBy('criadoEm', 'asc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.status(200).json({ mensagem: 'Nenhuma música pronta pra publicar hoje.' });
      }
      doc = snapshot.docs[0];
    }

    const item = doc.data();

    const uploadRes = await fetch(`${baseUrl}/api/youtube-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl: item.videoUrl,
        thumbnailUrl: item.thumbnailUrl,
        titulo: item.titulo,
        descricao: `${item.titulo} 🙏 Uma música de fé e louvor.\n\n#gospel #louvor #fe #jesus #musicacrista`,
        tags: ['gospel', 'louvor', 'música gospel', 'adoração', 'sertanejo gospel', 'hinos evangélicos', 'louvores antigos', 'playlist gospel'],
        canal: 'musica',
        palavras: item.palavras,
      }),
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || 'Erro ao publicar no YouTube');

    // Publica automaticamente no Facebook e Instagram também.
    const redesSociais = await publicarRedesSociais({
      videoUrl: item.videoUrl,
      titulo: item.titulo,
      descricao: `${item.titulo} 🙏 Uma música de fé e louvor.`,
      formato: item.formato,
    });

    await db.collection('youvideo_projects').add({
      tema: item.titulo,
      estilo: item.estilo,
      formato: item.formato,
      titulo: item.titulo,
      descricao: item.letra,
      videoUrl: item.videoUrl,
      thumbnailUrl: item.thumbnailUrl || null,
      youtubeVideoId: uploadData.videoId || null,
      canal: 'musica',
      redesSociais,
      criadoEm: new Date().toISOString(),
    });

    await doc.ref.update({ status: 'concluido', youtubeVideoId: uploadData.videoId || null });

    return res.status(200).json({ publicado: item.titulo, videoId: uploadData.videoId, redesSociais });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
