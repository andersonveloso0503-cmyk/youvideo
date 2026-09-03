export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audioUrl, cenas, formato } = req.body;

  if (!process.env.SHOTSTACK_API_KEY) {
    return res.status(500).json({
      error:
        'SHOTSTACK_API_KEY não configurada ainda. Você já tem conta Shotstack do LCS Hub — só precisa confirmar créditos e adicionar a chave aqui também.',
    });
  }

  try {
    // TODO: montar o timeline real da Shotstack combinando:
    // - trilha de áudio (audioUrl, a narração)
    // - clipes de cada cena (cenas[].videoUrl, gerados na etapa anterior)
    // - formato vertical (1080x1920) se formato === 'short', horizontal (1920x1080) se longo
    // Documentação: https://shotstack.io/docs/api/

    return res.status(200).json({
      videoUrl: null,
      status: 'pendente: montar timeline real da Shotstack',
      formato,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
