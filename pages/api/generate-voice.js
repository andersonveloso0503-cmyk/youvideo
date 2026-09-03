import { put } from '@vercel/blob';

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

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    const nomeArquivo = `narracao-${Date.now()}.mp3`;

    const blob = await put(nomeArquivo, audioBuffer, {
      access: 'public',
      contentType: 'audio/mpeg',
    });

    return res.status(200).json({ audioUrl: blob.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
