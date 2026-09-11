import { getDb } from '../../lib/firebase-admin';

async function checarUrl(url) {
  if (!url) return { ok: false, motivo: 'vazio' };
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return {
      ok: r.ok,
      status: r.status,
      contentType: r.headers.get('content-type'),
      contentLength: r.headers.get('content-length'),
    };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

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

    const diagnostico = [];
    for (let i = 0; i < musicas.length; i++) {
      const m = musicas[i];
      const audio = await checarUrl(m.audioUrl);
      const imagem = await checarUrl(m.arquivo?.imageUrl);
      diagnostico.push({
        indice: i,
        status: m.status,
        duracao: m.duracao,
        audio,
        imagem,
        inicioLetra: (m.letra || '').slice(0, 40),
      });
    }

    const comProblema = diagnostico.filter((d) => !d.audio.ok || !d.imagem.ok);

    if (req.query.forcarMontagem === '1') {
      await ref.update({ status: 'processando', erro: null, renderId: null });
      return res.status(200).json({
        mensagem: 'Reiniciei o medley do zero pra montagem — chame /api/medley-processar agora pra gerar um render novo.',
      });
    }

    if (req.query.corrigir === '1' && comProblema.length) {
      for (const problema of comProblema) {
        if (!problema.audio.ok) {
          musicas[problema.indice].status = 'pendente';
          delete musicas[problema.indice].palavras;
          delete musicas[problema.indice].cena;
          delete musicas[problema.indice].arquivo;
        } else if (!problema.imagem.ok) {
          musicas[problema.indice].status = 'cenas_ok';
          delete musicas[problema.indice].arquivo;
        }
      }
      await ref.update({ musicas, status: 'processando', erro: null });
      return res.status(200).json({
        mensagem: `Resetei ${comProblema.length} música(s) com link quebrado pra gerar de novo.`,
        diagnostico,
      });
    }

    return res.status(200).json({
      totalMusicas: musicas.length,
      comProblema: comProblema.length,
      diagnostico,
      dica: comProblema.length
        ? `Tem ${comProblema.length} música(s) com link de áudio ou imagem que não respondeu certo. Chame essa mesma URL com &corrigir=1 no final pra resetar essas e tentar de novo.`
        : 'Todos os links de áudio e imagem estão respondendo normalmente — o problema deve ser outra coisa na montagem em si.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

