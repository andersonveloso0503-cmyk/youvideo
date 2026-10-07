// Short do cantor.
// O vídeo do cantor é feito num site de fora (ilovesong.ai), à mão. O Compilador cuida do antes e do depois:
//  1) corta o melhor trecho da música (a parte mais forte, que costuma ser o refrão) para mandar ao site;
//  2) quando o vídeo volta, reconhece PELO SOM de qual música ele é (o nome do arquivo baixado não ajuda);
//  3) deixa o vídeo em pé (formato de Short), se ele veio deitado.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { FFMPEG, probe, rodar } = require('./ffmpeg');

const TAXA = 8000;
const QPS = 20; // quadros de volume por segundo
const HOP = TAXA / QPS;
const MAX_ANALISE = 15 * 60; // músicas muito longas: olha só os primeiros 15 min
const ARQ = 'cantor-trechos.json';

function lerPcm(arquivo, inicio, duracao) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-nostdin', '-ss', String(inicio), '-t', String(duracao), '-i', arquivo, '-vn', '-ac', '1', '-ar', String(TAXA), '-f', 'f32le', '-'];
    const p = spawn(FFMPEG, args, { windowsHide: true });
    const partes = [];
    p.stdout.on('data', (d) => partes.push(d));
    p.stderr.on('data', () => {});
    p.on('error', reject);
    p.on('close', () => {
      const buf = Buffer.concat(partes);
      resolve(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + Math.floor(buf.length / 4) * 4)));
    });
  });
}

/** Volume (RMS) a cada 1/20 de segundo. */
function envelope(sinal) {
  const n = Math.floor(sinal.length / HOP);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * HOP; j < (i + 1) * HOP; j++) s += sinal[j] * sinal[j];
    env[i] = Math.sqrt(s / HOP);
  }
  return env;
}

/**
 * Onde começa o trecho mais forte da música, em segundos.
 * Procura a janela com mais volume médio; entre as quase empatadas fica com a PRIMEIRA
 * (o primeiro refrão, e não o último, que costuma acabar no fim da música).
 * Depois encosta o começo no ponto mais baixo ali perto, para não cortar no meio de uma palavra.
 */
function melhorInicio(env, durSeg) {
  const n = env.length;
  const L = Math.round(durSeg * QPS);
  if (n <= L + QPS) return 0;
  const soma = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) soma[i + 1] = soma[i] + env[i];
  const media = (a) => (soma[a + L] - soma[a]) / L;
  let max = 0;
  for (let a = 0; a + L <= n; a++) max = Math.max(max, media(a));
  if (max <= 0) return 0;
  let melhor = 0;
  for (let a = 0; a + L <= n; a++) {
    if (media(a) >= max * 0.985) {
      melhor = a;
      break;
    }
  }
  // Ponto mais baixo (média de meio segundo) entre 2 s antes e 1 s depois
  const meio = (i) => (soma[Math.min(n, i + QPS / 2)] - soma[i]) / (QPS / 2);
  let inicio = melhor;
  let menor = Infinity;
  for (let i = Math.max(0, melhor - 2 * QPS); i <= Math.min(n - L, melhor + QPS); i++) {
    const v = meio(i);
    if (v < menor) {
      menor = v;
      inicio = i;
    }
  }
  return Math.max(0, Math.min(inicio, n - L)) / QPS;
}

/** Em que segundo da música começa a parte mais forte (o refrão, quase sempre), para um trecho de durSeg. */
async function inicioDoRefrao(arquivo, durSeg) {
  const info = await probe(arquivo);
  if (!info.duracao || info.duracao <= durSeg + 3) return 0;
  return melhorInicio(envelope(await lerPcm(arquivo, 0, Math.min(info.duracao, MAX_ANALISE))), durSeg);
}

// A "assinatura" do som: o volume ao longo do tempo, guardado em poucos bytes
function assinar(env) {
  let max = 0;
  for (const v of env) if (v > max) max = v;
  const b = Buffer.alloc(env.length);
  for (let i = 0; i < env.length; i++) b[i] = max ? Math.round((env[i] / max) * 255) : 0;
  return b.toString('base64');
}
const lerAssinatura = (txt) => Float32Array.from(Buffer.from(String(txt || ''), 'base64'));

/** Quanto dois sons se parecem (0 a 1), testando um pequeno atraso entre eles (o site pode pôr um silêncio no começo). */
function parecenca(a, b, folgaSeg = 3) {
  const folga = Math.round(folgaSeg * QPS);
  let melhor = 0;
  for (let lag = -folga; lag <= folga; lag++) {
    const ia = Math.max(0, lag);
    const ib = Math.max(0, -lag);
    const n = Math.min(a.length - ia, b.length - ib);
    if (n < 5 * QPS) continue;
    let ma = 0;
    let mb = 0;
    for (let i = 0; i < n; i++) {
      ma += a[ia + i];
      mb += b[ib + i];
    }
    ma /= n;
    mb /= n;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < n; i++) {
      const x = a[ia + i] - ma;
      const y = b[ib + i] - mb;
      sab += x * y;
      saa += x * x;
      sbb += y * y;
    }
    if (saa > 0 && sbb > 0) melhor = Math.max(melhor, sab / Math.sqrt(saa * sbb));
  }
  return melhor;
}

function nomeSeguro(n) {
  return String(n || 'musica').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'musica';
}

// ---------- Registro dos trechos cortados (fica no PC; é por ele que o vídeo baixado é reconhecido) ----------
function lerRegistro(dirDados) {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(dirDados, ARQ), 'utf8'));
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}
function gravarRegistro(dirDados, lista) {
  fs.mkdirSync(dirDados, { recursive: true });
  fs.writeFileSync(path.join(dirDados, ARQ), JSON.stringify(lista.slice(-300)));
}
const semAssinatura = ({ env, ...resto }) => resto;

/**
 * Corta o trecho de uma música. inicio = null deixa o Compilador escolher a parte mais forte.
 * Devolve { id, titulo, original, trecho, inicio, duracao, total }.
 */
async function cortarTrecho({ arquivo, titulo, inicio = null, duracao = 60, pasta, dirDados }) {
  const info = await probe(arquivo);
  if (!info.temAudio || !info.duracao) throw new Error('Não consegui ler o som deste arquivo.');
  const total = info.duracao;
  const dur = Math.max(5, Math.min(Number(duracao) || 60, total));
  let ini = inicio == null || inicio === '' ? null : Math.max(0, Math.min(Number(inicio) || 0, Math.max(0, total - dur)));
  if (ini == null) ini = melhorInicio(envelope(await lerPcm(arquivo, 0, Math.min(total, MAX_ANALISE))), dur);
  fs.mkdirSync(pasta, { recursive: true });
  const trecho = path.join(pasta, `${nomeSeguro(titulo)} - trecho.mp3`);
  const some = Math.min(1.2, dur / 4);
  await rodar([
    '-ss', ini.toFixed(2), '-t', dur.toFixed(2), '-i', arquivo, '-vn',
    '-af', `afade=t=in:d=0.15,afade=t=out:st=${(dur - some).toFixed(2)}:d=${some.toFixed(2)}`,
    '-c:a', 'libmp3lame', '-b:a', '192k', trecho,
  ]).promise;
  const env = envelope(await lerPcm(trecho, 0, dur + 1));
  const reg = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, titulo, original: arquivo, trecho, inicio: Math.round(ini * 10) / 10, duracao: Math.round(dur * 10) / 10, total, criadoEm: new Date().toISOString(), env: assinar(env) };
  // Um registro por música: cortar de novo troca o anterior
  const lista = lerRegistro(dirDados).filter((r) => path.resolve(r.original) !== path.resolve(arquivo));
  gravarRegistro(dirDados, [...lista, reg]);
  return semAssinatura(reg);
}

/**
 * Diz de qual música (dos trechos cortados aqui) é cada vídeo, comparando o som.
 * Devolve, por vídeo: { arquivo, trecho: registro|null, certeza: 0..1 }.
 */
async function reconhecer(arquivos, dirDados) {
  const registros = lerRegistro(dirDados).filter((r) => r.env);
  const assinaturas = registros.map((r) => lerAssinatura(r.env));
  const saida = [];
  for (const arquivo of arquivos) {
    let melhor = -1;
    let nota = 0;
    let segundo = 0;
    try {
      const env = envelope(await lerPcm(arquivo, 0, 75));
      registros.forEach((r, i) => {
        const p = parecenca(env, assinaturas[i]);
        if (p > nota) {
          segundo = nota;
          nota = p;
          melhor = i;
        } else if (p > segundo) segundo = p;
      });
    } catch {}
    // Só afirma quando o som bate bem e está claramente à frente do segundo colocado
    const achou = melhor >= 0 && nota >= 0.6 && nota - segundo >= 0.08;
    saida.push({ arquivo, trecho: achou ? semAssinatura(registros[melhor]) : null, certeza: Math.round(nota * 100) / 100 });
  }
  return saida;
}

/**
 * Vídeo deitado não é Short: põe em pé (1080x1920) com o próprio vídeo desfocado no fundo.
 * Vídeo em pé ou quadrado volta como está. Devolve o caminho a usar.
 */
async function deixarEmPe(arquivo, { onProgresso } = {}) {
  const i = await probe(arquivo);
  if (!i.temVideo || i.largura <= i.altura * 1.05) return arquivo;
  const destino = path.join(path.dirname(arquivo), `${path.basename(arquivo, path.extname(arquivo))} - Short.mp4`);
  const filtro =
    '[0:v]split=2[a][b];' +
    '[a]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=8:2,scale=1080:1920,eq=brightness=-0.12[bg];' +
    '[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]';
  await rodar(
    ['-i', arquivo, '-filter_complex', filtro, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', destino],
    { duracaoTotal: i.duracao, onProgresso }
  ).promise;
  return destino;
}

/**
 * O vídeo longo (já no YouTube) que tem esta música, olhando a fila do Compilador.
 * Devolve { url, titulo, canal } ou null.
 */
function videoCompleto(jobs, reg) {
  if (!reg) return null;
  const mesmo = (a, b) => a && b && path.resolve(a) === path.resolve(b);
  const titulo = String(reg.titulo || '').trim().toLowerCase();
  const envios = jobs.filter((j) => j.tipo === 'envio' && j.youtube?.id);
  const candidatos = [];
  for (const j of jobs) {
    if (j.tipo === 'envio' || j.projeto?.formato?.tipo === 'curto') continue;
    const musicas = j.projeto?.musicas || [];
    const tem = musicas.some((m) => mesmo(m.arquivo, reg.original)) || (j.timeline || []).some((t) => String(t.titulo || '').trim().toLowerCase() === titulo);
    if (!tem) continue;
    const yt = j.youtube?.id ? j.youtube : envios.find((e) => mesmo(e.arquivoFinal, j.arquivoFinal))?.youtube;
    if (!yt?.id) continue;
    candidatos.push({ url: yt.url || `https://youtu.be/${yt.id}`, titulo: yt.titulo || j.nome || '', canal: yt.canal || '', quando: j.concluidoEm || j.criadoEm || '' });
  }
  candidatos.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  return candidatos[0] ? { url: candidatos[0].url, titulo: candidatos[0].titulo, canal: candidatos[0].canal } : null;
}

module.exports = { inicioDoRefrao, cortarTrecho, reconhecer, deixarEmPe, videoCompleto, lerRegistro, semAssinatura, melhorInicio, envelope, parecenca, QPS };
