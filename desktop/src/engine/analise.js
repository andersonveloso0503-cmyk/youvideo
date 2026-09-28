// "Escuta" a música e estima o andamento (BPM) e a energia: calma, média ou animada.
// Pega 60 s do meio da faixa, calcula a força das batidas e procura o ritmo que mais se repete.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { FFMPEG, probe } = require('./ffmpeg');
const { chaveCache } = require('./separar');

const TAXA = 11025;
const HOP = 256; // ~43 quadros por segundo

function lerPcm(arquivo, inicio, duracao) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-ss', String(inicio), '-t', String(duracao), '-i', arquivo, '-ac', '1', '-ar', String(TAXA), '-f', 'f32le', '-'], { windowsHide: true });
    const partes = [];
    p.stdout.on('data', (d) => partes.push(d));
    p.on('error', reject);
    p.on('close', () => {
      const buf = Buffer.concat(partes);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)));
    });
  });
}

function estimar(sinal) {
  const n = Math.floor(sinal.length / HOP);
  if (n < 200) return null;
  // Realça o que é "batida": diferença entre amostras (tira graves longos e notas sustentadas)
  const energia = new Float32Array(n);
  let somaRms = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    let t = 0;
    for (let j = i * HOP + 1; j < (i + 1) * HOP; j++) {
      const d = sinal[j] - 0.97 * sinal[j - 1];
      s += d * d;
      t += sinal[j] * sinal[j];
    }
    somaRms += Math.sqrt(t / HOP);
    energia[i] = Math.log10(1e-7 + s / HOP);
  }
  const ataque = new Float32Array(n);
  for (let i = 1; i < n; i++) ataque[i] = Math.max(0, energia[i] - energia[i - 1]);
  // Remove a média local (janela de ~1 s) para sobrar só os picos
  const JAN = 43;
  const limpo = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += ataque[i];
    if (i >= JAN) acc -= ataque[i - JAN];
    limpo[i] = Math.max(0, ataque[i] - acc / Math.min(i + 1, JAN));
  }
  let zero = 0;
  for (let i = 0; i < n; i++) zero += limpo[i] * limpo[i];
  if (zero <= 0) return { bpm: null, pulso: 0, densidade: 0, rms: somaRms / n };

  const fps = TAXA / HOP;
  const corr = (bpm) => {
    const lag = (60 * fps) / bpm;
    const l0 = Math.floor(lag);
    const fr = lag - l0;
    let s = 0;
    for (let i = 0; i + l0 + 1 < n; i++) s += limpo[i] * (limpo[i + l0] * (1 - fr) + limpo[i + l0 + 1] * fr);
    return s / zero;
  };
  let melhor = -1;
  let bpmMelhor = 0;
  for (let bpm = 60; bpm <= 200; bpm++) {
    const v = corr(bpm) * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 1.2, 2));
    if (v > melhor) {
      melhor = v;
      bpmMelhor = bpm;
    }
  }
  // Correção de "meio tempo": se o dobro também bate forte, a música é mais rápida
  if (bpmMelhor < 95 && bpmMelhor * 2 <= 200 && corr(bpmMelhor * 2) > 0.6 * corr(bpmMelhor)) bpmMelhor *= 2;
  const pulso = Math.max(0, corr(bpmMelhor)); // 0 = sem batida clara, ~1 = batida muito marcada
  // Densidade: quantos quadros têm ataque forte por segundo
  const lim = Math.sqrt(zero / n) * 2;
  let fortes = 0;
  for (let i = 0; i < n; i++) if (limpo[i] > lim) fortes++;
  // Força absoluta das batidas (em dB por quadro): música sem percussão fica perto de zero
  let forca = 0;
  for (let i = 0; i < n; i++) forca += ataque[i];
  return { bpm: bpmMelhor, pulso, densidade: fortes / (n / fps), forca: forca / n, rms: somaRms / n };
}

function classificar({ bpm, densidade, rms }) {
  // Sem batidas marcadas (piano, pads, louvor lento): calma
  if (!bpm || densidade < 0.5) return { nota: 0.15, energia: 'calma' };
  const nb = Math.min(1, Math.max(0, (bpm - 70) / 80)); // 70 bpm = 0, 150 bpm = 1
  const nd = Math.min(1, densidade / 4); // batidas fortes por segundo
  const nr = Math.min(1, Math.max(0, (rms - 0.03) / 0.2)); // volume
  const nota = 0.5 * nb + 0.35 * nd + 0.15 * nr;
  const energia = nota < 0.35 ? 'calma' : nota < 0.58 ? 'media' : 'animada';
  return { nota: Math.round(nota * 100) / 100, energia };
}

async function analisarMusica(arquivo, dirCache) {
  const pasta = path.join(dirCache, 'analise');
  fs.mkdirSync(pasta, { recursive: true });
  const cache = path.join(pasta, `${chaveCache(arquivo)}.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const { duracao } = await probe(arquivo);
  const dur = Math.min(60, duracao || 60);
  const inicio = Math.max(0, (duracao || 0) / 2 - dur / 2);
  const sinal = await lerPcm(arquivo, inicio, dur);
  const est = estimar(sinal);
  const r = est ? { bpm: est.densidade >= 0.5 ? est.bpm : null, ...classificar(est) } : { bpm: null, nota: null, energia: null };
  fs.writeFileSync(cache, JSON.stringify(r));
  return r;
}

/** Texto curto para a IA: "8 animadas, 2 médias (~128 BPM)". */
function resumoClima(musicas) {
  const comDado = (musicas || []).filter((m) => m && m.energia);
  if (!comDado.length) return '';
  const cont = { calma: 0, media: 0, animada: 0 };
  comDado.forEach((m) => cont[m.energia]++);
  const bpms = comDado.map((m) => m.bpm).filter(Boolean).sort((a, b) => a - b);
  const mediana = bpms.length ? bpms[Math.floor(bpms.length / 2)] : null;
  const partes = [];
  if (cont.animada) partes.push(`${cont.animada} animada(s)/agitada(s)`);
  if (cont.media) partes.push(`${cont.media} de ritmo médio`);
  if (cont.calma) partes.push(`${cont.calma} calma(s)/lenta(s)`);
  const dominante = Object.entries(cont).sort((a, b) => b[1] - a[1])[0][0];
  const maioria = cont[dominante] / comDado.length >= 0.6;
  const palavra = maioria ? { animada: 'ANIMADO/AGITADO', media: 'MODERADO', calma: 'CALMO/LENTO' }[dominante] : 'MISTURADO';
  return `${palavra} — ${partes.join(', ')}${mediana ? ` (andamento típico ~${mediana} BPM)` : ''}`;
}

module.exports = { analisarMusica, resumoClima, estimar, classificar };
