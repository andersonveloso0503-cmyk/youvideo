// Legenda da letra: transcreve com o Whisper da Groq (mesma chave do Youvideo)
// e quebra em linhas curtas sincronizadas. Também fica em cache no PC.
const fs = require('fs');
const path = require('path');
const { probe, rodar } = require('./ffmpeg');
const { chaveCache } = require('./separar');

const TRECHO_SEG = 600; // manda em pedaços de 10 min (limite de tamanho da Groq)

async function transcreverTrecho(arquivo, groqKey, idioma) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(arquivo)], { type: 'audio/mpeg' }), 'trecho.mp3');
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  if (idioma && idioma !== 'auto') form.append('language', idioma);
  form.append('temperature', '0');

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    });
    const d = await r.json().catch(() => null);
    if (r.ok) return d;
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 20000 * (tentativa + 1)));
      continue;
    }
    throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
  }
  throw new Error('Groq: limite de uso atingido, tente mais tarde.');
}

function quebrarEmLinhas(seg, maxPalavras = 7) {
  const palavras = String(seg.text || '').trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  const blocos = [];
  for (let i = 0; i < palavras.length; i += maxPalavras) blocos.push(palavras.slice(i, i + maxPalavras));
  const dur = Math.max(0.5, seg.end - seg.start);
  const total = palavras.length;
  let acumulado = 0;
  return blocos.map((b) => {
    const inicio = seg.start + (acumulado / total) * dur;
    acumulado += b.length;
    const fim = seg.start + (acumulado / total) * dur;
    return { inicio, fim, texto: b.join(' ') };
  });
}

/** Devolve [{inicio, fim, texto}] com tempos relativos ao início da música. */
async function transcrever(arquivo, { groqKey, idioma = 'pt', dirCache, onStatus, registrarCancelar }) {
  if (!groqKey) throw new Error('Para gerar legenda, cadastre a chave da Groq em Configurações.');
  const pasta = path.join(dirCache, 'legenda');
  fs.mkdirSync(pasta, { recursive: true });
  const cache = path.join(pasta, `${chaveCache(arquivo)}_${idioma}.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));

  const { duracao } = await probe(arquivo);
  const linhas = [];
  const partes = Math.max(1, Math.ceil(duracao / TRECHO_SEG));
  for (let i = 0; i < partes; i++) {
    onStatus && onStatus(`Transcrevendo letra${partes > 1 ? ` (${i + 1}/${partes})` : ''}`);
    const trecho = path.join(pasta, `trecho_${process.pid}_${i}.mp3`);
    const r = rodar(['-ss', String(i * TRECHO_SEG), '-t', String(TRECHO_SEG), '-i', arquivo, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', trecho]);
    registrarCancelar && registrarCancelar(r.cancelar);
    await r.promise;
    try {
      const d = await transcreverTrecho(trecho, groqKey, idioma);
      for (const s of d.segments || []) {
        // Ignora trechos em que o Whisper "inventa" texto em parte instrumental
        if ((s.no_speech_prob ?? 0) > 0.6 || (s.avg_logprob ?? 0) < -1.2) continue;
        if (s.compression_ratio && s.compression_ratio > 2.6) continue;
        const desloc = i * TRECHO_SEG;
        linhas.push(...quebrarEmLinhas({ start: s.start + desloc, end: s.end + desloc, text: s.text }));
      }
    } finally {
      fs.rmSync(trecho, { force: true });
    }
  }
  fs.writeFileSync(cache, JSON.stringify(linhas));
  return linhas;
}

module.exports = { transcrever };
