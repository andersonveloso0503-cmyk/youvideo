import { list } from '@vercel/blob';

export default async function handler(req, res) {
  try {
    let arquivos = [];
    let cursor = undefined;

    do {
      const resultado = await list({ token: process.env.MEDIA_READ_WRITE_TOKEN, cursor, limit: 1000 });
      arquivos = arquivos.concat(resultado.blobs);
      cursor = resultado.cursor;
    } while (cursor);

    const totalBytes = arquivos.reduce((soma, a) => soma + a.size, 0);

    const porTipo = {};
    for (const a of arquivos) {
      const prefixo = a.pathname.split('-')[0].split('.')[0];
      if (!porTipo[prefixo]) porTipo[prefixo] = { quantidade: 0, bytes: 0 };
      porTipo[prefixo].quantidade++;
      porTipo[prefixo].bytes += a.size;
    }

    const maisAntigos = [...arquivos].sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt)).slice(0, 20);

    return res.status(200).json({
      totalArquivos: arquivos.length,
      totalMB: (totalBytes / 1024 / 1024).toFixed(1),
      porTipo: Object.entries(porTipo)
        .map(([tipo, dados]) => ({ tipo, quantidade: dados.quantidade, MB: (dados.bytes / 1024 / 1024).toFixed(1) }))
        .sort((a, b) => b.MB - a.MB),
      maisAntigos: maisAntigos.map((a) => ({
        pathname: a.pathname,
        MB: (a.size / 1024 / 1024).toFixed(2),
        uploadedAt: a.uploadedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
