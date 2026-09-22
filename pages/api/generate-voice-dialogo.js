import { put } from '@vercel/blob';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegPath.path);

// Aumenta o limite de execução da função (padrão é bem curto e cortava
// respostas de IA mais demoradas no meio). Precisa do plano Pro do
// Vercel pra valer mais que ~60s.
export const maxDuration = 300;

// Pausa curta entre uma fala e outra, pra soar como diálogo e não como
// um robô lendo tudo colado.
const PAUSA_ENTRE_FALAS = 0.25;

// Fatores de pitch: >1 sobe (agudo/cômico), <1 desce (grave/imponente).
// A compensação de "atempo" (1/fator) devolve a duração original — só a
// altura da voz muda, não a velocidade.
const PITCH_FATORES = {
  normal: 1,
  grave: 0.82,
  aguda: 1.28,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { falas, modelo } = req.body;
  if (!falas || !falas.length) return res.status(400).json({ error: 'Nenhuma fala recebida' });

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({
      error: 'ELEVENLABS_API_KEY não configurada ainda. Crie conta em elevenlabs.io, pegue a API key e adicione no Vercel.',
    });
  }

  const MODEL_ID = modelo === 'flash' ? 'eleven_flash_v2_5' : 'eleven_multilingual_v2';

  try {
    const vozes = await buscarVozesDisponiveis();
    const vozPorPersonagem = montarMapaDeVozes(falas, vozes);

    const audioSegments = [];
    const palavrasCombinadas = [];
    const cenasComTempo = [];
    let cursor = 0;

    for (let i = 0; i < falas.length; i++) {
      const fala = falas[i];
      const texto = (fala.texto || '').trim();
      if (!texto) {
        cenasComTempo.push({ start: cursor, length: 0 });
        continue;
      }

      const vozId = vozPorPersonagem[normalizarNome(fala.personagem)] || vozes[0]?.id || process.env.ELEVENLABS_VOICE_ID;

      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vozId}/with-timestamps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({ text: texto, model_id: MODEL_ID }),
      });

      if (!ttsRes.ok) {
        const err = await ttsRes.text();
        throw new Error(`Fala ${i + 1}/${falas.length} (${fala.personagem}) falhou: ${err}`);
      }

      const data = await ttsRes.json();
      let audioBuffer = Buffer.from(data.audio_base64, 'base64');
      let palavrasFala = agruparPalavras(data.alignment);
      let duracaoFala = palavrasFala.length ? palavrasFala[palavrasFala.length - 1].end : 0;

      const fator = PITCH_FATORES[fala.vozTipo] || 1;
      if (fator !== 1 && duracaoFala > 0) {
        try {
          audioBuffer = await aplicarPitch(audioBuffer, fator);
          // O pitch preserva a duração (atempo compensa), então o timing das
          // palavras continua válido — não precisa recalcular.
        } catch (err) {
          // Se o ffmpeg falhar por qualquer motivo, segue com o áudio original
          // sem pitch em vez de derrubar o vídeo inteiro.
          console.error('Falha ao aplicar pitch, usando áudio original:', err.message);
        }
      }

      const nomeArquivo = `fala-${Date.now()}-${i}.mp3`;
      const blob = await put(nomeArquivo, audioBuffer, {
        access: 'public',
        contentType: 'audio/mpeg',
        token: process.env.MEDIA_READ_WRITE_TOKEN,
      });

      audioSegments.push({ url: blob.url, start: cursor, length: duracaoFala, personagem: fala.personagem });
      cenasComTempo.push({ start: cursor, length: duracaoFala });
      for (const p of palavrasFala) {
        palavrasCombinadas.push({ texto: p.texto, start: p.start + cursor, end: p.end + cursor });
      }

      cursor += duracaoFala + PAUSA_ENTRE_FALAS;
    }

    return res.status(200).json({
      audioUrl: audioSegments[0]?.url,
      audioSegments,
      palavras: palavrasCombinadas,
      cenasComTempo,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function buscarVozesDisponiveis() {
  const vozesRes = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
  });
  const data = await vozesRes.json();
  if (!vozesRes.ok) throw new Error(data.detail?.message || 'Erro ao listar vozes da ElevenLabs');
  return (data.voices || []).map((v) => ({ id: v.voice_id, nome: v.name }));
}

// Monta um mapa fixo "nome do personagem" -> voz da ElevenLabs, na ordem em
// que cada personagem aparece pela primeira vez no roteiro. O Narrador
// sempre fica com a voz padrão do canal (a mesma usada nos outros vídeos);
// os demais personagens vão pegando, em sequência, as outras vozes
// disponíveis na conta (repetindo o ciclo se houver mais personagens do
// que vozes cadastradas).
function montarMapaDeVozes(falas, vozes) {
  const vozNarrador = process.env.ELEVENLABS_VOICE_ID || vozes[0]?.id;
  const outrasVozes = vozes.map((v) => v.id).filter((id) => id !== vozNarrador);
  const poolVozes = outrasVozes.length ? outrasVozes : vozes.map((v) => v.id);

  const mapa = {};
  let proximoIndice = 0;

  for (const fala of falas) {
    const chave = normalizarNome(fala.personagem);
    if (mapa[chave]) continue;

    if (chave === 'narrador') {
      mapa[chave] = vozNarrador;
      continue;
    }

    mapa[chave] = poolVozes[proximoIndice % poolVozes.length] || vozNarrador;
    proximoIndice++;
  }

  return mapa;
}

function normalizarNome(nome) {
  return (nome || 'narrador').trim().toLowerCase();
}

// Muda a altura da voz (mais grave ou mais aguda) sem alterar a duração do
// áudio: reamostra numa taxa diferente (o que muda pitch E velocidade
// juntos) e depois corrige a velocidade de volta ao normal com "atempo".
function aplicarPitch(bufferMp3, fator) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const nomeBase = `pitch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const entrada = path.join(tmpDir, `${nomeBase}-in.mp3`);
    const saida = path.join(tmpDir, `${nomeBase}-out.mp3`);

    fs.writeFileSync(entrada, bufferMp3);

    const taxaNova = Math.round(44100 * fator);
    const compensacao = Math.min(2, Math.max(0.5, 1 / fator)).toFixed(4);

    ffmpeg(entrada)
      .audioFilters([`asetrate=${taxaNova}`, 'aresample=44100', `atempo=${compensacao}`])
      .output(saida)
      .on('end', () => {
        try {
          const resultado = fs.readFileSync(saida);
          fs.unlinkSync(entrada);
          fs.unlinkSync(saida);
          resolve(resultado);
        } catch (err) {
          reject(err);
        }
      })
      .on('error', (err) => {
        try { fs.unlinkSync(entrada); } catch {}
        reject(err);
      })
      .run();
  });
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
