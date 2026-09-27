// Estúdio de Música — gera UMA música com o motor escolhido e salva na biblioteca.
// A tela chama esta rota 2x em paralelo para ter 2 versões (igual Suno/Nuivi).
//
// POST {
//   motor: 'elevenlabs' | 'lyria',
//   modo: 'simples' | 'personalizado',
//   descricao,            // modo simples: "uma música gospel sobre esperança..."
//   titulo, letra,        // modo personalizado
//   estilo,               // texto de estilo (ex: "Brazilian gospel worship, piano")
//   voz,                  // 'masculina' | 'feminina' | 'dueto' | 'coral' | ''
//   instrumental,         // true = sem voz
//   duracaoSeg,           // 30..300
//   grupoId, versao       // para juntar as versões da mesma criação
// }
// -> { musica }

import { put } from '@vercel/blob';
import { getDb } from '../../../lib/firebase-admin';

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '1mb' } } };

const VOZES = {
  masculina: 'male lead vocal',
  feminina: 'female lead vocal',
  dueto: 'male and female duet vocals',
  coral: 'lead vocal with gospel choir backing',
};

function montarPrompt({ modo, descricao, letra, estilo, voz, instrumental, duracaoSeg }) {
  const partes = [];
  if (estilo) partes.push(`Style: ${estilo}.`);
  if (modo === 'simples' && descricao) partes.push(`Song idea: ${descricao}.`);
  if (instrumental) {
    partes.push('Instrumental only, no vocals.');
  } else {
    partes.push(`${VOZES[voz] || 'lead vocal'}, sung in Brazilian Portuguese, clear pronunciation.`);
  }
  if (duracaoSeg) partes.push(`Length about ${Math.round(duracaoSeg)} seconds.`);
  if (!instrumental && modo === 'personalizado' && letra) {
    partes.push(`Use exactly these lyrics, in this order:\n${letra.trim()}`);
  }
  return partes.join('\n');
}

async function gerarElevenLabs(prompt, { instrumental, duracaoSeg }) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY não está configurada na Vercel.');
  const modelo = process.env.ELEVENLABS_MUSIC_MODEL || 'music_v2_5';
  const r = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt.slice(0, 4100),
      music_length_ms: Math.max(10, Math.min(300, duracaoSeg || 150)) * 1000,
      model_id: modelo,
      force_instrumental: !!instrumental,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    let msg = txt;
    try {
      const j = JSON.parse(txt);
      msg = j.detail?.message || j.detail?.status || (typeof j.detail === 'string' ? j.detail : '') || txt;
    } catch { /* texto puro */ }
    if (/music_generation/i.test(msg)) {
      throw new Error('ElevenLabs: sua chave de API não tem a permissão "Music Generation". No site da ElevenLabs vá em Developers → API Keys, edite a chave e ative Music Generation.');
    }
    throw new Error(`ElevenLabs: ${String(msg).slice(0, 300)}`);
  }
  const buffer = Buffer.from(await r.arrayBuffer());
  return { buffer, modelo, mime: 'audio/mpeg', letraGerada: '' };
}

async function gerarLyria(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não está configurada na Vercel (crie em aistudio.google.com).');
  const modelo = process.env.LYRIA_MODEL || 'lyria-3.5';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = d?.error?.message || String(r.status);
    if (/free_tier|limit: 0/i.test(msg)) {
      throw new Error('Google Lyria: o plano gratuito não inclui geração de música. Ative o faturamento (billing) no Google AI Studio para o projeto dessa chave.');
    }
    throw new Error(`Google Lyria: ${msg.slice(0, 300)}`);
  }

  const parts = d?.candidates?.[0]?.content?.parts || [];
  let audio = null;
  let texto = '';
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data && !audio) audio = inline;
    else if (p.text) texto += p.text;
  }
  if (!audio) {
    const motivo = d?.candidates?.[0]?.finishReason || d?.promptFeedback?.blockReason || 'sem áudio na resposta';
    throw new Error(`Google Lyria não devolveu áudio (${motivo}).`);
  }
  const mime = audio.mimeType || audio.mime_type || 'audio/mpeg';
  return { buffer: Buffer.from(audio.data, 'base64'), modelo, mime, letraGerada: texto.trim() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });

  const b = req.body || {};
  const motor = b.motor === 'lyria' ? 'lyria' : 'elevenlabs';
  const modo = b.modo === 'personalizado' ? 'personalizado' : 'simples';
  const instrumental = !!b.instrumental;
  const duracaoSeg = Math.max(30, Math.min(300, parseInt(b.duracaoSeg, 10) || 150));

  if (modo === 'simples' && !String(b.descricao || '').trim()) {
    return res.status(400).json({ erro: 'Descreva a música que você quer.' });
  }
  if (modo === 'personalizado' && !instrumental && !String(b.letra || '').trim()) {
    return res.status(400).json({ erro: 'Escreva (ou gere) a letra, ou marque Instrumental.' });
  }

  const dados = {
    modo,
    descricao: String(b.descricao || '').slice(0, 1000),
    letra: String(b.letra || '').slice(0, 3500),
    estilo: String(b.estilo || '').slice(0, 400),
    voz: String(b.voz || ''),
    instrumental,
    duracaoSeg,
  };
  const prompt = montarPrompt(dados);

  try {
    const r = motor === 'lyria' ? await gerarLyria(prompt) : await gerarElevenLabs(prompt, dados);

    const ext = r.mime.includes('wav') ? 'wav' : 'mp3';
    const blob = await put(`estudio-musica/${Date.now()}-${motor}.${ext}`, r.buffer, {
      access: 'public',
      contentType: r.mime,
      token: process.env.MEDIA_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: true,
    });

    const titulo = String(b.titulo || '').trim()
      || (dados.descricao ? dados.descricao.split(/[.,\n]/)[0].slice(0, 60) : 'Nova música');

    const musica = {
      titulo,
      motor,
      modelo: r.modelo,
      modo,
      descricao: dados.descricao,
      letra: dados.letra || r.letraGerada || '',
      estilo: dados.estilo,
      voz: dados.voz,
      instrumental,
      duracaoSeg,
      prompt,
      audioUrl: blob.url,
      capaUrl: '',
      favorito: false,
      grupoId: String(b.grupoId || ''),
      versao: parseInt(b.versao, 10) || 1,
      criadoEm: new Date().toISOString(),
    };

    const ref = await getDb().collection('youvideo_estudio_musicas').add(musica);
    return res.status(200).json({ musica: { id: ref.id, ...musica } });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
