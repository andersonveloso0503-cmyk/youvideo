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

  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`,
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

    const data = await ttsRes.json();
    const audioBuffer = Buffer.from(data.audio_base64, 'base64');
    const nomeArquivo = `narracao-${Date.now()}.mp3`;

    const blob = await put(nomeArquivo, audioBuffer, {
      access: 'public',
      contentType: 'audio/mpeg',
      token: process.env.MEDIA_READ_WRITE_TOKEN,
    });

    const palavras = agruparPalavras(data.alignment);

    return res.status(200).json({ audioUrl: blob.url, palavras });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Junta o alinhamento por caractere da ElevenLabs em palavras, com o tempo
// exato (em segundos) em que cada uma começa e termina sendo falada.
function agruparPalavras(alignment) {
  if (!alignment?.characters) return [];
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;

  const palavras = [];
  let atual = '';
  let inicio = null;

  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (c.trim() === '') {
      if (atual) {
        palavras.push({ texto: atual, start: inicio, end: character_end_times_seconds[i - 1] });
        atual = '';
        inicio = null;
      }
      continue;
    }
    if (inicio === null) inicio = character_start_times_seconds[i];
    atual += c;
  }
  if (atual) {
    palavras.push({
      texto: atual,
      start: inicio,
      end: character_end_times_seconds[characters.length - 1],
    });
  }
  return palavras;
}
