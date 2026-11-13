// TRECHO OFICIAL: a própria pessoa falando (pedido do dono, 13/11).
// Quando a ilustração "fala" traz a frase EXATA da pessoa (literal), o PC procura essa fala num vídeo de canal
// OFICIAL (TV Câmara, TV Senado, STF/TV Justiça, Canal Gov/Planalto, Agência Brasil), acha o segundo exato pela
// legenda do próprio YouTube e corta 3 a 12 s com a voz real. O vídeo pausa a narração, mostra o trecho dentro do
// quadro de quadrinho e segue. Discurso em sessão pública pode ser reproduzido citando a fonte (Lei 9.610, art. 46).
// Nunca usa trecho de TV comercial ou de outros canais (risco de direitos autorais). Sem trecho, fica a foto.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { FFMPEG, probe, rodar } = require('./ffmpeg');

// Só estes canais (nome exato do canal no YouTube)
const OFICIAIS = /^(c[aâ]mara dos deputados|tv c[aâ]mara|ag[eê]ncia c[aâ]mara|senado federal|tv senado|ag[eê]ncia senado|stf|supremo tribunal federal|tv justi[cç]a|canal gov|planalto|pal[aá]cio do planalto|governo do brasil|ag[eê]ncia brasil|tv brasil gov)$/i;
const NOME_FONTE = (canal) =>
  /senado/i.test(canal) ? 'TV Senado' : /c[aâ]mara/i.test(canal) ? 'TV Câmara' : /stf|supremo|justi/i.test(canal) ? 'STF / TV Justiça' : /ag[eê]ncia brasil/i.test(canal) ? 'Agência Brasil' : 'Canal Gov';

const semAc = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const palavras = (t) => semAc(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

// ───── yt-dlp (baixado do GitHub oficial e renovado a cada 10 dias: o YouTube muda e versão velha para de funcionar)
function pastaBin() {
  const p = path.join(process.env.APPDATA || os.homedir(), 'youvideo-compilador', 'bin');
  fs.mkdirSync(p, { recursive: true });
  return p;
}
let _ytdlp = null;
async function ytdlp() {
  if (_ytdlp) return _ytdlp;
  const win = process.platform === 'win32';
  const arq = path.join(pastaBin(), win ? 'yt-dlp.exe' : 'yt-dlp');
  const velho = !fs.existsSync(arq) || Date.now() - fs.statSync(arq).mtimeMs > 10 * 86400e3 || fs.statSync(arq).size < 1e6;
  if (velho) {
    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${win ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux'}`;
    const r = await fetch(url);
    if (!r.ok) {
      if (fs.existsSync(arq)) return (_ytdlp = arq); // sem internet para renovar: usa o que tem
      throw new Error(`não consegui baixar o yt-dlp (${r.status})`);
    }
    const tmp = arq + '.novo';
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    if (!win) fs.chmodSync(tmp, 0o755);
    fs.renameSync(tmp, arq);
  }
  return (_ytdlp = arq);
}

function rodarYt(args, { prazo = 90e3 } = {}) {
  return new Promise(async (ok, falha) => {
    let exe;
    try {
      exe = await ytdlp();
    } catch (e) {
      return falha(e);
    }
    const p = spawn(exe, ['--no-warnings', '--ffmpeg-location', FFMPEG, ...args], { windowsHide: true });
    let out = '';
    let err = '';
    const t = setTimeout(() => {
      try { p.kill(); } catch {}
      falha(new Error('yt-dlp demorou demais'));
    }, prazo);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(t); falha(e); });
    p.on('close', (code) => {
      clearTimeout(t);
      code === 0 ? ok(out) : falha(new Error(String(err || out).trim().split('\n').slice(-2).join(' ').slice(0, 200) || `yt-dlp saiu com ${code}`));
    });
  });
}

/** Vídeos de canais oficiais que podem ter a fala (busca no YouTube; só passa canal oficial). */
async function candidatos(nome, citacao) {
  const ws = String(citacao).split(/\s+/);
  const buscas = [`${nome} ${ws.slice(0, 8).join(' ')}`, `"${ws.slice(0, 7).join(' ')}"`, `${nome} discurso ${ws.slice(0, 4).join(' ')}`];
  const vistos = new Map();
  for (const q of buscas) {
    try {
      const j = JSON.parse(await rodarYt(['--flat-playlist', '-J', `ytsearch10:${q}`], { prazo: 45e3 }));
      for (const e of j.entries || []) {
        const canal = String(e.channel || e.uploader || '').trim();
        if (!e.id || vistos.has(e.id) || !OFICIAIS.test(canal)) continue;
        if (e.duration && e.duration < 8) continue;
        vistos.set(e.id, { id: e.id, titulo: e.title || '', canal, url: `https://www.youtube.com/watch?v=${e.id}` });
      }
    } catch {}
    if (vistos.size >= 4) break;
  }
  // primeiro os que têm o sobrenome da pessoa no título
  const sobrenome = palavras(nome).slice(-1)[0] || '';
  return [...vistos.values()].sort((a, b) => (palavras(b.titulo).includes(sobrenome) ? 1 : 0) - (palavras(a.titulo).includes(sobrenome) ? 1 : 0)).slice(0, 4);
}

/** Legenda (.vtt) do YouTube -> palavras com o segundo de cada uma. */
function lerVtt(txt) {
  const tempo = (s) => {
    const m = String(s).match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);
    return m ? (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000) : null;
  };
  const blocos = String(txt).replace(/\r/g, '').split(/\n\n+/);
  const comTags = /<\d+:\d+[:.]\d+/.test(txt); // legenda automática: cada palavra tem o seu tempo
  const saida = [];
  for (const b of blocos) {
    const ls = b.split('\n');
    const k = ls.findIndex((l) => l.includes('-->'));
    if (k < 0) continue;
    const [a, z] = ls[k].split('-->').map((x) => tempo(x));
    if (a == null) continue;
    for (const l of ls.slice(k + 1)) {
      if (!l.trim()) continue;
      if (comTags) {
        if (!/<\d/.test(l)) continue; // linha repetida da anterior (a automática repete)
        let t = a;
        for (const pedaco of l.split(/(<\d+:\d+[:.]\d+(?:\.\d+)?>)/)) {
          const tt = pedaco.match(/^<([\d:.]+)>$/);
          if (tt) { t = tempo(tt[1]) ?? t; continue; }
          for (const w of palavras(pedaco.replace(/<[^>]+>/g, ' '))) saida.push({ w, t });
        }
      } else {
        const ws = palavras(l.replace(/<[^>]+>/g, ' '));
        ws.forEach((w, i) => saida.push({ w, t: a + ((z - a) * i) / Math.max(1, ws.length) }));
      }
    }
  }
  return saida;
}

/** Acha a frase na legenda: as palavras em ordem, aceitando algumas diferenças da legenda automática. */
function acharFrase(transcricao, citacao) {
  const q = palavras(citacao);
  if (q.length < 4) return null;
  let melhor = null;
  for (let i = 0; i < transcricao.length; i++) {
    if (transcricao[i].w !== q[0] && transcricao[i].w !== q[1]) continue;
    let j = i;
    let acertos = 0;
    let primeiro = null;
    let ultimo = null;
    const limite = Math.min(transcricao.length, i + Math.ceil(q.length * 1.6) + 3);
    for (const w of q) {
      for (let x = j; x < limite; x++) {
        if (transcricao[x].w === w) {
          acertos++;
          primeiro = primeiro ?? x;
          ultimo = x;
          j = x + 1;
          break;
        }
      }
    }
    const nota = acertos / q.length;
    if (nota >= 0.75 && (!melhor || nota > melhor.nota)) melhor = { nota, ini: transcricao[primeiro].t, fim: transcricao[Math.min(transcricao.length - 1, ultimo + 1)].t };
  }
  return melhor;
}

/** Procura e corta o trecho. Devolve { arquivo, duracao, canal, fonte, url } ou null. */
async function acharTrecho(nome, citacao, dir, log = () => {}) {
  const lista = await candidatos(nome, citacao);
  if (!lista.length) {
    log(`[trecho-oficial] "${nome}": nenhum vídeo de canal oficial na busca`);
    return null;
  }
  const dl = path.join(dir, 'trechos');
  fs.mkdirSync(dl, { recursive: true });
  for (const v of lista) {
    try {
      await rodarYt(['--skip-download', '--write-auto-subs', '--write-subs', '--sub-langs', 'pt.*,pt', '--sub-format', 'vtt', '-o', path.join(dl, `${v.id}.%(ext)s`), v.url], { prazo: 60e3 });
      const vtt = fs.readdirSync(dl).filter((f) => f.startsWith(v.id) && f.endsWith('.vtt')).map((f) => path.join(dl, f))[0];
      if (!vtt) continue;
      const achou = acharFrase(lerVtt(fs.readFileSync(vtt, 'utf8')), citacao);
      if (!achou) continue;
      const ini = Math.max(0, achou.ini - 0.5);
      const fim = Math.min(ini + 12, Math.max(ini + 2.5, achou.fim + 0.6));
      const bruto = path.join(dl, `${v.id}_bruto.mp4`);
      await rodarYt(['-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b', '--download-sections', `*${ini.toFixed(2)}-${fim.toFixed(2)}`, '--force-keyframes-at-cuts', '--merge-output-format', 'mp4', '--no-playlist', '--no-part', '-o', bruto, v.url], { prazo: 120e3 });
      if (!fs.existsSync(bruto)) continue;
      // volume igual ao da narração e vídeo leve
      const arquivo = path.join(dl, `${v.id}_trecho.mp4`);
      await rodar(['-y', '-i', bruto, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', arquivo]).promise;
      const info = await probe(arquivo).catch(() => null);
      if (!info?.temAudio || !(info.duracao > 1.5)) continue;
      log(`[trecho-oficial] "${nome}": achei em "${v.titulo.slice(0, 60)}" (${v.canal}) aos ${Math.round(ini)} s, ${info.duracao.toFixed(1)} s, ${Math.round(achou.nota * 100)}% das palavras`);
      return { arquivo, duracao: Math.min(12, info.duracao), canal: v.canal, fonte: NOME_FONTE(v.canal), url: v.url };
    } catch (e) {
      log(`[trecho-oficial] "${nome}": ${String(e.message || e).slice(0, 140)}`);
    }
  }
  log(`[trecho-oficial] "${nome}": a frase não apareceu nos ${lista.length} vídeos oficiais`);
  return null;
}

/**
 * Coloca os trechos na receita: no fim da cena "fala", a narração pausa, o trecho toca com a voz real e o vídeo segue.
 * Mexe em rc (tempos) e em locais (arquivo do trecho). No máximo 2 por vídeo.
 */
async function inserirTrechosOficiais(rc, locais, dir, { log = () => {}, checar } = {}) {
  if (!Array.isArray(rc.clipes)) return 0;
  const alvos = [];
  for (const c of rc.clipes) {
    const il = c.ilustracao;
    if (il?.tipo !== 'fala' || !il.literal || !il.nome || !il.texto || il.continua || il.trechoOficial) continue;
    if (alvos.some((a) => a.ilustracao.texto === il.texto)) continue;
    alvos.push(c);
  }
  let feitos = 0;
  for (const c of alvos) {
    if (feitos >= 2) break;
    checar && checar();
    // fim da cena (com os pedaços "continua" da mesma ilustração)
    let T = c.start + c.length;
    for (const o of rc.clipes) if (o.ilustracao?.texto === c.ilustracao.texto && o.start >= c.start && Math.abs(o.start - T) < 0.05) T = o.start + o.length;
    if (rc.clipes.some((o) => o.start < T - 0.05 && o.start + o.length > T + 0.05)) continue; // não é fronteira de cena
    let t = null;
    try {
      t = await module.exports.acharTrecho(c.ilustracao.nome, c.ilustracao.texto, dir, log);
    } catch (e) {
      log(`[trecho-oficial] falhou: ${String(e.message || e).slice(0, 140)}`);
    }
    if (!t) continue;
    const D = Number(t.duracao.toFixed(2));
    const chave = `trecho-oficial-${feitos}.mp4`;
    locais[chave] = t.arquivo;
    // Narração: o pedaço que atravessa T é dividido em dois (antes e depois da pausa)
    const novosAudios = [];
    for (const a of rc.audio || []) {
      const ini = Number(a.start) || 0;
      let len = Number(a.length) || 0;
      if (!len) len = (await probe(locais[a.url]).catch(() => null))?.duracao || 0;
      if (ini >= T - 0.01) novosAudios.push({ ...a, start: ini + D });
      else if (len && ini + len > T + 0.01) {
        const off = Number(a.inicio) || 0;
        novosAudios.push({ ...a, length: T - ini });
        novosAudios.push({ ...a, start: T + D, inicio: off + (T - ini), length: ini + len - T });
      } else novosAudios.push(a);
    }
    novosAudios.push({ url: chave, start: T, length: D });
    rc.audio = novosAudios;
    const empurra = (x) => (x && Number(x.start) >= T - 0.01 ? { ...x, start: Number(x.start) + D, ...(x.end != null ? { end: Number(x.end) + D } : {}) } : x);
    rc.palavras = (rc.palavras || []).map(empurra);
    rc.textos = (rc.textos || []).map((x) => (x && Number(x.start) < T && Number(x.start) + Number(x.length || 0) > T ? { ...x, length: Number(x.length) + D } : empurra(x)));
    rc.clipes = rc.clipes.map(empurra);
    rc.clipes.push({
      ...c,
      start: T,
      length: D,
      inicio: 0,
      ilustracao: { ...c.ilustracao, mascote: undefined, videoUrl: chave, videoInicio: 0, fonte: t.fonte, trechoOficial: true, etiqueta: 'OUÇA', continua: false },
    });
    rc.clipes.sort((a, b) => a.start - b.start);
    rc.duracao = Number(rc.duracao) + D;
    feitos++;
  }
  return feitos;
}

module.exports = { inserirTrechosOficiais, acharTrecho, lerVtt, acharFrase };
