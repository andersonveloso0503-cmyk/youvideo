import { list, del } from '@vercel/blob';

export default async function handler(req, res) {
  const fonte = req.method === 'GET' ? req.query : req.body;
  const { maisAntigoQueDias, manterUltimos, confirmar } = fonte;
  const diasCorte = maisAntigoQueDias ? parseInt(maisAntigoQueDias, 10) : 7;
  const manter = manterUltimos ? parseInt(manterUltimos, 10) : 30;
  const confirmarBool = confirmar === true || confirmar === 'true' || confirmar === '1';

  try {
    let arquivos = [];
    let cursor = undefined;
    do {
      const resultado = await list({ token: process.env.MEDIA_READ_WRITE_TOKEN, cursor, limit: 1000 });
      arquivos = arquivos.concat(resultado.blobs);
      cursor = resultado.cursor;
    } while (cursor);

    // Ordena do mais novo pro mais antigo, sempre preservando os N mais
    // recentes independente da data (proteção extra contra apagar algo
    // que você acabou de usar).
    arquivos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const candidatos = arquivos.slice(manter);

    const dataCorte = new Date();
    dataCorte.setDate(dataCorte.getDate() - diasCorte);
    const paraApagar = candidatos.filter((a) => new Date(a.uploadedAt) < dataCorte);

    const totalMB = (paraApagar.reduce((s, a) => s + a.size, 0) / 1024 / 1024).toFixed(1);

    if (!confirmarBool) {
      return res.status(200).json({
        modo: 'simulação (nada foi apagado ainda)',
        totalParaApagar: paraApagar.length,
        totalMB,
        amostra: paraApagar.slice(0, 15).map((a) => a.pathname),
        dica: `Isso apagaria ${paraApagar.length} arquivos (${totalMB} MB), mantendo os ${manter} mais recentes e tudo dos últimos ${diasCorte} dias. Pra apagar de verdade, chame de novo com "confirmar": true no corpo da requisição.`,
      });
    }

    let apagados = 0;
    for (const arquivo of paraApagar) {
      try {
        await del(arquivo.url, { token: process.env.MEDIA_READ_WRITE_TOKEN });
        apagados++;
      } catch (err) {
        return res.status(500).json({
          error: `Parou no arquivo ${arquivo.pathname}: ${err.message}`,
          apagadosAntesDoErro: apagados,
        });
      }
    }

    return res.status(200).json({ apagados, totalMB });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
