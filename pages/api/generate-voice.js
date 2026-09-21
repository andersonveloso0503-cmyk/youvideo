import { put } from '@vercel/blob';

// Aumenta o limite de execução da função (padrão é bem curto e cortava
// respostas de IA mais demoradas no meio). Precisa do plano Pro do
// Vercel pra valer mais que ~60s.
export const maxDuration = 300;

// Fica com boa margem abaixo do limite real da ElevenLabs (10.000
// caracteres no eleven_multilingual_v2), pra nunca chegar perto do teto
// mesmo em textos com muita pontuação/acentuação.
const TAMANHO_MAX_PEDACO = 4500;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { texto, vozId, modelo } = req.body;
  if (!texto) return res.status(400).json({ error: 'Texto da narração é obrigatório' });

  // 'flash' custa metade do crédito da ElevenLabs (0,5 por caractere, em
  // vez de 1) e ainda suporta português — um pouco menos expressivo, mas
  // rende o dobro do mesmo saldo de créditos.
  const MODEL_ID = modelo === 'flash' ? 'eleven_flash_v2_5' : 'eleven_multilingual_v2';

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({
      error: 'ELEVENLABS_API_KEY não configurada ainda. Crie conta em elevenlabs.io, pegue a API key e adicione no Vercel.',
    });
  }

  const VOICE_ID = vozId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

  try {
    const pedacos = dividirEmPedacos(texto, TAMANHO_MAX_PEDACO);

    const audioSegments = [];
    const palavrasCombinadas = [];
    let cursor = 0;

    for (let i = 0; i < pedacos.length; i++) {
      const ttsRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text: pedacos[i],
            model_id: MODEL_ID,
          }),
        }
      );

      if (!ttsRes.ok) {
        const err = await ttsRes.text();
        throw new Error(`Pedaço ${i + 1}/${pedacos.length} da narração falhou: ${err}`);
      }

      const data = await ttsRes.json();
      const audioBuffer = Buffer.from(data.audio_base64, 'base64');
      const nomeArquivo = `narracao-${Date.now()}-${i}.mp3`;

      const blob = await put(nomeArquivo, audioBuffer, {
        access: 'public',
        contentType: 'audio/mpeg',
        token: process.env.MEDIA_READ_WRITE_TOKEN,
      });

      const palavrasPedaco = agruparPalavras(data.alignment);
      const duracaoPedaco = palavrasPedaco.length
        ? palavrasPedaco[palavrasPedaco.length - 1].end
        : 0;

      audioSegments.push({ url: blob.url, start: cursor, length: duracaoPedaco });
      for (const p of palavrasPedaco) {
        palavrasCombinadas.push({ texto: p.texto, start: p.start + cursor, end: p.end + cursor });
      }
      cursor += duracaoPedaco;
    }

    return res.status(200).json({
      // Mantém audioUrl com o primeiro pedaço por compatibilidade com
      // qualquer lugar antigo que espere um único link — o certo pra
      // montar o vídeo é usar audioSegments quando tiver mais de um.
      audioUrl: audioSegments[0]?.url,
      audioSegments,
      palavras: palavrasCombinadas,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Divide o texto em pedaços que cabem no limite da ElevenLabs, cortando
// sempre em fim de parágrafo ou de frase (nunca no meio de uma palavra),
// pra cada pedaço soar natural quando narrado separadamente.
function dividirEmPedacos(texto, tamanhoMax) {
  if (texto.length <= tamanhoMax) return [texto];

  const paragrafos = texto.split(/\n+/).filter(Boolean);
  const pedacos = [];
  let atual = '';

  for (const paragrafo of paragrafos) {
    const candidato = atual ? `${atual}\n${paragrafo}` : paragrafo;
    if (candidato.length > tamanhoMax && atual) {
      pedacos.push(atual.trim());
      atual = paragrafo;
    } else {
      atual = candidato;
    }
  }
  if (atual) pedacos.push(atual.trim());

  // Se algum "parágrafo" sozinho ainda for grande demais, quebra por frase.
  const pedacosFinais = [];
  for (const pedaco of pedacos) {
    if (pedaco.length <= tamanhoMax) {
      pedacosFinais.push(pedaco);
      continue;
    }
    const frases = pedaco.match(/[^.!?]+[.!?]+(\s|$)/g) || [pedaco];
    let sub = '';
    for (const frase of frases) {
      if ((sub + frase).length > tamanhoMax && sub) {
        pedacosFinais.push(sub.trim());
        sub = frase;
      } else {
        sub += frase;
      }
    }
    if (sub) pedacosFinais.push(sub.trim());
  }

  return pedacosFinais;
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
