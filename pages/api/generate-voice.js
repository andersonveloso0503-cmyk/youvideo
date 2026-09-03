export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { texto } = req.body;
  if (!texto) return res.status(400).json({ error: 'Texto da narração é obrigatório' });

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({
      error: 'ELEVENLABS_API_KEY não configurada ainda. Crie conta em elevenlabs.io, pegue a API key e adicione no Vercel.',
    });
  }

  // Voz padrão multilíngue da ElevenLabs (pt-BR funciona bem com o modelo multilingual).
  // Depois trocamos por uma voice_id escolhida por você no site da ElevenLabs.
  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: texto,
          model_id: 'eleven_multilingual_v2',
        }),
      }
    );

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      throw new Error(err);
    }

    // ElevenLabs devolve o áudio binário direto; em produção isso deve ser
    // salvo em um storage (ex: Vercel Blob, igual você já faz com os PDFs no LCS Hub)
    // e retornar a URL pública. Deixando o placeholder pronto pra essa etapa.
    return res.status(200).json({
      audioUrl: 'PENDENTE: salvar o áudio no Vercel Blob e retornar a URL aqui',
      aviso: 'Áudio gerado com sucesso na ElevenLabs — falta conectar o Blob storage.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
