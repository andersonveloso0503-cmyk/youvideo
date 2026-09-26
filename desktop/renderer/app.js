/* Youvideo Compilador — tela principal */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const ESTILOS = [
  { id: 'onda', nome: 'Onda' },
  { id: 'linha', nome: 'Linha' },
  { id: 'pontos', nome: 'Pontos' },
  { id: 'onda_dupla', nome: 'Onda dupla' },
  { id: 'barras', nome: 'Barras' },
  { id: 'barras_espelho', nome: 'Espelho' },
  { id: 'nuvem', nome: 'Nuvem' },
  { id: 'nenhum', nome: 'Nenhum' },
];
const CORES = ['#ffffff', '#d9a441', '#ffd23f', '#22d3ee', '#ec4899', '#4ade80', '#a78bfa', '#3b82f6', '#ef4444', '#b1432f'];
const CORES_LEGENDA = ['#ffffff', '#ffd23f', '#d9a441', '#22d3ee', '#4ade80', '#f472b6'];
const EXT_IMG = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];
const EXT_VID = ['mp4', 'mov', 'webm', 'mkv', 'avi'];
const EXT_AUD = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma'];

const PADRAO = {
  nome: '',
  musicas: [], // {arquivo, titulo, duracao, selecionada}
  fundos: [],
  fundoAtivo: 0,
  enquadramento: 'preencher',
  efeito: { estilo: 'onda', cor: '#d9a441', largura: 66, intensidade: 75, posX: 50, posY: 88, opacidade: 95 },
  textura: { granulado: 0, vinheta: true, escurecer: 15 },
  audio: { somenteInstrumental: false, crossfade: 2, normalizar: false },
  legenda: { ativo: false, idioma: 'pt', posicao: 'baixo', tamanho: 100, cor: '#ffffff', mostrarNome: true },
  formato: { tipo: 'longo', resolucao: '1080', duracaoMaxMin: '', limiteMusicaSeg: '' },
  saida: { pasta: '', nome: '' },
  publicar: {
    ativo: false, canalId: '', titulo: '', descricao: '', tags: '', privacidade: 'private', incluirTracklist: true,
    agendar: { ativo: false, inicio: '', intervaloHoras: 24 },
  },
};

let P = structuredClone(PADRAO);
let config = {};
let canais = [];
let jobs = [];
let filtro = '';
let tocando = null; // índice da música tocando na prévia

// ---------- utilidades ----------
function mesclar(base, extra) {
  const r = structuredClone(base);
  for (const k of Object.keys(extra || {})) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') r[k] = mesclar(base[k], extra[k]);
    else if (extra[k] !== undefined) r[k] = extra[k];
  }
  return r;
}
function tempo(seg) {
  seg = Math.max(0, Math.round(seg || 0));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}:${String(s).padStart(2, '0')}`;
}
function tempoCurto(seg) {
  seg = Math.max(0, Math.round(seg || 0));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}
function urlArquivo(p) {
  const partes = p.replace(/\\/g, '/').split('/');
  return 'file:///' + partes.map((x, i) => (i === 0 && /^[A-Za-z]:$/.test(x) ? x : encodeURIComponent(x))).join('/').replace(/^\/+/, '');
}
function ext(p) { return p.split('.').pop().toLowerCase(); }
function ehImagem(p) { return EXT_IMG.includes(ext(p)); }
function avisar(txt, erro = false) {
  const a = $('#aviso');
  a.textContent = txt;
  a.classList.toggle('erro', erro);
  a.classList.add('visivel');
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => a.classList.remove('visivel'), erro ? 6500 : 3200);
}
function msgErro(e) { return String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
let tSalvar;
function salvarDepois() {
  clearTimeout(tSalvar);
  tSalvar = setTimeout(() => window.api.config.salvarProjeto(P), 600);
  atualizarResumo();
}
function selecionadas() { return P.musicas.filter((m) => m.selecionada); }

// Mesma regra do motor: divide em vários vídeos pela duração máxima
function dividir(musicas) {
  const curto = P.formato.tipo === 'curto';
  const maxMin = Number(P.formato.duracaoMaxMin) || (curto ? 1 : 0);
  const max = maxMin ? maxMin * 60 : Infinity;
  const lim = Number(P.formato.limiteMusicaSeg) || 0;
  const cf = Number(P.audio.crossfade) || 0;
  const grupos = [];
  let atual = [], total = 0;
  for (const m of musicas) {
    const d = lim ? Math.min(m.duracao, lim) : m.duracao;
    const extra = atual.length ? d - cf : d;
    if (atual.length && total + extra > max) { grupos.push(atual); atual = []; total = 0; }
    atual.push(m);
    total += atual.length === 1 ? d : d - cf;
  }
  if (atual.length) grupos.push(atual);
  const duracoes = grupos.map((g) => {
    const t = g.reduce((a, m, i) => a + (lim ? Math.min(m.duracao, lim) : m.duracao) - (i ? cf : 0), 0);
    return Math.min(t, max);
  });
  return { grupos, duracoes };
}

// ---------- Músicas ----------
function adicionarMusicas(lista) {
  const existentes = new Set(P.musicas.map((m) => m.arquivo));
  let n = 0;
  for (const m of lista) {
    if (existentes.has(m.arquivo)) continue;
    P.musicas.push({ arquivo: m.arquivo, titulo: m.titulo, duracao: m.duracao, selecionada: true });
    n++;
  }
  if (!P.nome && P.musicas.length) P.nome = '';
  renderMusicas();
  salvarDepois();
  if (n) avisar(`${n} música${n > 1 ? 's' : ''} adicionada${n > 1 ? 's' : ''}`);
  else if (lista.length) avisar('Essas músicas já estavam na lista');
}

function renderMusicas() {
  const ol = $('#listaMusicas');
  ol.innerHTML = '';
  const termo = filtro.trim().toLowerCase();
  P.musicas.forEach((m, i) => {
    if (termo && !m.titulo.toLowerCase().includes(termo)) return;
    const li = document.createElement('li');
    li.className = 'musica' + (m.selecionada ? ' sel' : '') + (tocando === i ? ' tocando' : '');
    li.innerHTML = `
      <input type="checkbox" ${m.selecionada ? 'checked' : ''} title="Incluir no vídeo" />
      <button class="play" title="Ouvir com o efeito">${tocando === i && !$('#audioPrevia').paused ? '❚❚' : '▶'}</button>
      <span class="num">${i + 1}</span>
      <span class="nome" title="Duplo clique para renomear"></span>
      <span class="dur">${tempo(m.duracao)}</span>
      <span class="mover"><button data-d="-1" title="Subir">▲</button><button data-d="1" title="Descer">▼</button></span>
      <button class="lixo" title="Tirar da lista"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg></button>`;
    const nome = li.querySelector('.nome');
    nome.textContent = m.titulo;
    li.querySelector('input').onchange = (e) => { m.selecionada = e.target.checked; li.classList.toggle('sel', m.selecionada); salvarDepois(); };
    li.querySelector('.play').onclick = () => tocarMusica(i);
    li.querySelector('.lixo').onclick = () => { if (tocando === i) pararMusica(); P.musicas.splice(i, 1); renderMusicas(); salvarDepois(); };
    li.querySelectorAll('.mover button').forEach((b) => (b.onclick = () => {
      const j = i + Number(b.dataset.d);
      if (j < 0 || j >= P.musicas.length) return;
      [P.musicas[i], P.musicas[j]] = [P.musicas[j], P.musicas[i]];
      if (tocando === i) tocando = j; else if (tocando === j) tocando = i;
      renderMusicas(); salvarDepois();
    }));
    nome.ondblclick = () => {
      nome.contentEditable = 'true';
      nome.focus();
      document.getSelection().selectAllChildren(nome);
    };
    nome.onblur = () => {
      if (nome.contentEditable !== 'true') return;
      nome.contentEditable = 'false';
      m.titulo = nome.textContent.trim() || m.titulo;
      nome.textContent = m.titulo;
      salvarDepois();
    };
    nome.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); nome.blur(); } if (e.key === 'Escape') { nome.textContent = m.titulo; nome.blur(); } };
    ol.appendChild(li);
  });
  $('#vazioMusicas').style.display = P.musicas.length ? 'none' : 'block';
  atualizarResumo();
}

function atualizarResumo() {
  const sel = selecionadas();
  const total = sel.reduce((a, m) => a + m.duracao, 0);
  $('#resumoMusicas').textContent = P.musicas.length
    ? `${sel.length} de ${P.musicas.length} músicas selecionadas · ${tempo(total)}`
    : 'Nenhuma música ainda';
  const { grupos, duracoes } = dividir(sel);
  const somaVideo = duracoes.reduce((a, b) => a + b, 0);
  $('#resumoVideos').textContent = `${grupos.length} vídeo${grupos.length === 1 ? '' : 's'}`;
  $('#resumoDuracao').textContent = grupos.length ? `≈ ${tempoCurto(somaVideo)} de vídeo` : '0 min';
  const btn = $('#btnGerar');
  btn.disabled = !sel.length;
  let dica = '';
  if (!sel.length) dica = 'Selecione músicas para começar';
  else if (grupos.length > 1) dica = P.formato.tipo === 'curto' ? `Um Short por música (até ${Number(P.formato.duracaoMaxMin) || 1} min cada)` : `Dividido pela duração máxima de ${P.formato.duracaoMaxMin} min`;
  else if (P.publicar.ativo) dica = 'Vai publicar no YouTube quando terminar';
  else dica = 'O vídeo é gerado aqui no seu PC';
  if (P.audio.somenteInstrumental && !config.temFal) dica = '⚠ Falta a chave da fal.ai (Configurações)';
  if (P.legenda.ativo && !config.temGroq) dica = '⚠ Falta a chave da Groq (Configurações)';
  if (P.publicar.ativo && !P.publicar.canalId) dica = '⚠ Escolha o canal na aba Publicar';
  $('#dicaGerar').textContent = dica;
  btn.innerHTML = btn.innerHTML.replace(/GERAR (VÍDEOS?|\d+ VÍDEOS)/, grupos.length > 1 ? `GERAR ${grupos.length} VÍDEOS` : 'GERAR VÍDEO');
}

// ---------- Prévia de áudio ----------
const audio = $('#audioPrevia');
let ctxAudio, analisador, fonte;
function garantirAnalisador() {
  if (ctxAudio) return;
  ctxAudio = new AudioContext();
  analisador = ctxAudio.createAnalyser();
  analisador.fftSize = 2048;
  analisador.smoothingTimeConstant = 0.72;
  fonte = ctxAudio.createMediaElementSource(audio);
  const divisor = ctxAudio.createChannelSplitter(2);
  fonte.connect(analisador);
  fonte.connect(ctxAudio.destination);
  fonte.connect(divisor);
  analisadorL = ctxAudio.createAnalyser(); analisadorR = ctxAudio.createAnalyser();
  analisadorL.fftSize = analisadorR.fftSize = 1024;
  divisor.connect(analisadorL, 0); divisor.connect(analisadorR, 1);
}
let analisadorL, analisadorR;
function tocarMusica(i) {
  garantirAnalisador();
  if (tocando === i && !audio.paused) { audio.pause(); renderMusicas(); atualizarBotaoPlay(); return; }
  if (tocando !== i) {
    tocando = i;
    audio.src = urlArquivo(P.musicas[i].arquivo);
    audio.currentTime = Math.min(30, (P.musicas[i].duracao || 0) * 0.25);
  }
  ctxAudio.resume();
  audio.play().catch((e) => avisar('Não consegui tocar: ' + e.message, true));
  renderMusicas();
  atualizarBotaoPlay();
}
function pararMusica() { audio.pause(); tocando = null; atualizarBotaoPlay(); }
function atualizarBotaoPlay() { $('#btnPlayPrevia').textContent = !audio.paused ? '❚❚' : '▶'; }
audio.onended = () => { renderMusicas(); atualizarBotaoPlay(); };
audio.onpause = audio.onplay = () => { atualizarBotaoPlay(); };

// ---------- Fundos ----------
const cacheMidia = new Map();
function midiaDoFundo(p) {
  if (cacheMidia.has(p)) return cacheMidia.get(p);
  let el;
  if (ehImagem(p)) { el = new Image(); el.src = urlArquivo(p); }
  else { el = document.createElement('video'); el.src = urlArquivo(p); el.muted = true; el.loop = true; el.playsInline = true; el.play().catch(() => {}); }
  cacheMidia.set(p, el);
  return el;
}
function adicionarFundos(lista) {
  const novos = lista.filter((p) => !P.fundos.includes(p) && [...EXT_IMG, ...EXT_VID].includes(ext(p)));
  P.fundos.push(...novos);
  if (novos.length) P.fundoAtivo = P.fundos.length - novos.length;
  renderFundos();
  salvarDepois();
}
function renderFundos() {
  const box = $('#miniaturas');
  box.innerHTML = '';
  P.fundos.forEach((f, i) => {
    const d = document.createElement('div');
    d.className = 'mini' + (i === P.fundoAtivo ? ' ativa' : '');
    d.title = f;
    const img = ehImagem(f);
    d.innerHTML = img ? `<img src="${urlArquivo(f)}" />` : `<video src="${urlArquivo(f)}#t=1" muted preload="metadata"></video><span class="tipo">VÍDEO</span>`;
    const x = document.createElement('button');
    x.className = 'x'; x.textContent = '×'; x.title = 'Remover';
    x.onclick = (e) => { e.stopPropagation(); P.fundos.splice(i, 1); P.fundoAtivo = Math.max(0, Math.min(P.fundoAtivo, P.fundos.length - 1)); renderFundos(); salvarDepois(); };
    d.appendChild(x);
    d.onclick = () => { P.fundoAtivo = i; renderFundos(); salvarDepois(); };
    box.appendChild(d);
  });
  const imgs = P.fundos.filter(ehImagem).length;
  const vids = P.fundos.length - imgs;
  $('#dicaFundos').textContent = P.fundos.length ? [imgs && `${imgs} imagem${imgs > 1 ? 's' : ''}`, vids && `${vids} vídeo${vids > 1 ? 's' : ''}`].filter(Boolean).join(' · ') : 'nenhum fundo';
}

// ---------- Canvas da prévia ----------
const canvas = $('#previa');
const ctx = canvas.getContext('2d');
let gradeRuido = null;

function dimensionarPrevia() {
  const palco = $('#palco');
  const curto = P.formato.tipo === 'curto';
  const ar = curto ? 9 / 16 : 16 / 9;
  const maxW = palco.clientWidth - 8, maxH = palco.clientHeight - 8;
  let w = maxW, h = w / ar;
  if (h > maxH) { h = maxH; w = h * ar; }
  const m = $('#moldura');
  m.style.width = `${Math.floor(w)}px`;
  m.style.height = `${Math.floor(h)}px`;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  $('#etiquetaPrevia').textContent = `PRÉVIA · ${curto ? '9:16 SHORTS' : '16:9'}`;
}
new ResizeObserver(dimensionarPrevia).observe($('#palco'));

function desenharCobrindo(el, W, H, modo) {
  const iw = el.videoWidth || el.naturalWidth, ih = el.videoHeight || el.naturalHeight;
  if (!iw || !ih) return false;
  const cobrir = Math.max(W / iw, H / ih), caber = Math.min(W / iw, H / ih);
  if (modo === 'desfoque') {
    ctx.save();
    ctx.filter = `blur(${Math.round(W / 60)}px) brightness(0.85)`;
    ctx.drawImage(el, (W - iw * cobrir) / 2 - 20, (H - ih * cobrir) / 2 - 20, iw * cobrir + 40, ih * cobrir + 40);
    ctx.restore();
    ctx.drawImage(el, (W - iw * caber) / 2, (H - ih * caber) / 2, iw * caber, ih * caber);
  } else {
    ctx.drawImage(el, (W - iw * cobrir) / 2, (H - ih * cobrir) / 2, iw * cobrir, ih * cobrir);
  }
  return true;
}

const bufTempo = new Float32Array(2048);
const bufL = new Float32Array(1024), bufR = new Float32Array(1024);
const bufFreq = new Uint8Array(1024);
function amostras(t) {
  if (analisador && !audio.paused) {
    analisador.getFloatTimeDomainData(bufTempo);
    analisador.getByteFrequencyData(bufFreq);
    analisadorL.getFloatTimeDomainData(bufL);
    analisadorR.getFloatTimeDomainData(bufR);
    return true;
  }
  // Sinal de mentirinha pra prévia quando nada está tocando
  for (let i = 0; i < bufTempo.length; i++) {
    const x = i / bufTempo.length;
    bufTempo[i] = 0.45 * Math.sin(x * 38 + t * 5) * Math.sin(x * 3.1 + t) + 0.22 * Math.sin(x * 140 + t * 9) * (0.6 + 0.4 * Math.sin(t * 2.3));
  }
  for (let i = 0; i < bufFreq.length; i++) {
    const x = i / bufFreq.length;
    bufFreq[i] = Math.max(0, 230 * Math.exp(-x * 3.2) * (0.65 + 0.35 * Math.sin(t * 4 + i * 0.07)) + 20 * Math.sin(i * 0.9 + t * 7));
  }
  for (let i = 0; i < bufL.length; i++) { bufL[i] = bufTempo[i]; bufR[i] = bufTempo[(i + 37) % bufTempo.length] * 0.9; }
  return false;
}

function desenharVisual(W, H, t) {
  const e = P.efeito;
  if (e.estilo === 'nenhum') return;
  amostras(t);
  const menor = Math.min(W, H);
  const ganho = 0.4 + (e.intensidade / 100) * 3.6;
  const larg = (W * e.largura) / 100;
  let alt = menor * 0.22;
  if (e.estilo === 'barras_espelho') alt = menor * 0.3;
  if (e.estilo === 'onda_dupla') alt = menor * 0.28;
  if (e.estilo === 'linha' || e.estilo === 'pontos') alt = menor * 0.2;
  if (e.estilo === 'nuvem') alt = menor * 0.42;
  const lf = e.estilo === 'nuvem' ? alt : larg;
  const x0 = Math.max(0, Math.min(W - lf, (W * e.posX) / 100 - lf / 2));
  const y0 = Math.max(0, Math.min(H - alt, (H * e.posY) / 100 - alt / 2));
  ctx.save();
  ctx.globalAlpha = e.opacidade / 100;
  ctx.fillStyle = ctx.strokeStyle = e.cor;
  const escala = (v) => Math.sign(v) * Math.sqrt(Math.min(1, Math.abs(v * ganho)));
  const N = 360;
  const passo = bufTempo.length / N;

  if (e.estilo === 'onda' || e.estilo === 'onda_dupla') {
    const faixas = e.estilo === 'onda_dupla' ? [[bufL, y0, alt / 2], [bufR, y0 + alt / 2, alt / 2]] : [[bufTempo, y0, alt]];
    for (const [buf, yy, hh] of faixas) {
      const meio = yy + hh / 2;
      const p = buf.length / N;
      for (let i = 0; i < N; i++) {
        const v = Math.abs(escala(buf[Math.floor(i * p)])) * (hh / 2);
        ctx.fillRect(x0 + (i / N) * larg, meio - v, Math.max(1, larg / N + 0.6), Math.max(1, v * 2));
      }
    }
  } else if (e.estilo === 'linha' || e.estilo === 'pontos') {
    const meio = y0 + alt / 2;
    ctx.lineWidth = Math.max(1.5, menor / 400);
    if (e.estilo === 'linha') ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = x0 + (i / N) * larg;
      const y = meio - escala(bufTempo[Math.floor(i * passo)]) * (alt / 2);
      if (e.estilo === 'linha') (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      else ctx.fillRect(x, y, Math.max(1.5, menor / 380), Math.max(1.5, menor / 380));
    }
    if (e.estilo === 'linha') ctx.stroke();
  } else if (e.estilo === 'barras' || e.estilo === 'barras_espelho') {
    const nb = 72;
    const bw = larg / nb;
    const espelho = e.estilo === 'barras_espelho';
    const hMax = espelho ? alt / 2 : alt;
    const base = espelho ? y0 + alt / 2 : y0 + alt;
    for (let i = 0; i < nb; i++) {
      const idx = Math.floor(Math.pow(i / nb, 1.8) * 500) + 1; // escala logarítmica
      const v = Math.sqrt(bufFreq[idx] / 255) * Math.min(1.6, 0.5 + e.intensidade / 100);
      const h = Math.min(1, v) * hMax;
      ctx.fillRect(x0 + i * bw + bw * 0.12, base - h, bw * 0.76, h);
      if (espelho) ctx.fillRect(x0 + i * bw + bw * 0.12, base, bw * 0.76, h);
    }
  } else if (e.estilo === 'nuvem') {
    const cx = x0 + alt / 2, cy = y0 + alt / 2;
    ctx.lineWidth = 1;
    ctx.globalAlpha *= 0.8;
    ctx.beginPath();
    for (let i = 0; i < bufL.length; i += 2) {
      const l = escala(bufL[i]) * 0.5, r = escala(bufR[i]) * 0.5;
      const x = cx + ((r - l) / Math.SQRT2) * (alt / 2) * 1.2;
      const y = cy - ((l + r) / Math.SQRT2) * (alt / 2) * 1.2;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function desenharTextos(W, H, t) {
  const menor = Math.min(W, H);
  if (P.legenda.mostrarNome) {
    const m = tocando !== null ? P.musicas[tocando] : selecionadas()[0];
    if (m) {
      ctx.save();
      ctx.font = `700 ${Math.round(menor * 0.035)}px Inter`;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 6;
      ctx.textBaseline = 'top';
      ctx.fillText('♪ ' + m.titulo, W * 0.035, H * 0.05, W * 0.9);
      ctx.restore();
    }
  }
  if (P.legenda.ativo) {
    const tam = Math.round(menor * (P.legenda.tamanho / 100) * 0.055);
    ctx.save();
    ctx.font = `800 ${tam}px Inter`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, tam / 7);
    ctx.strokeStyle = '#000';
    ctx.fillStyle = P.legenda.cor;
    const y = { cima: H * 0.1 + tam, meio: H / 2, baixo: H - H * 0.18 }[P.legenda.posicao];
    const frase = 'Aqui aparece a letra da música';
    ctx.strokeText(frase, W / 2, y, W * 0.84);
    ctx.fillText(frase, W / 2, y, W * 0.84);
    ctx.restore();
  }
}

function desenhar(tMs) {
  requestAnimationFrame(desenhar);
  const t = tMs / 1000;
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return;
  ctx.fillStyle = '#0d0b08';
  ctx.fillRect(0, 0, W, H);
  const f = P.fundos[P.fundoAtivo];
  let temFundo = false;
  if (f) temFundo = desenharCobrindo(midiaDoFundo(f), W, H, P.enquadramento);
  if (!temFundo) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0b0b12'); g.addColorStop(1, '#2a0a12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (P.textura.escurecer > 0) { ctx.fillStyle = `rgba(0,0,0,${(P.textura.escurecer / 100) * 0.3})`; ctx.fillRect(0, 0, W, H); }
  if (P.textura.vinheta) {
    const r = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  }
  if (P.textura.granulado > 0) {
    if (!gradeRuido) {
      gradeRuido = document.createElement('canvas');
      gradeRuido.width = gradeRuido.height = 256;
      const g = gradeRuido.getContext('2d');
      const d = g.createImageData(256, 256);
      for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
    }
    ctx.save();
    ctx.globalAlpha = 0.04 + (P.textura.granulado / 100) * 0.14;
    ctx.globalCompositeOperation = 'overlay';
    const ox = Math.random() * 256, oy = Math.random() * 256;
    ctx.fillStyle = ctx.createPattern(gradeRuido, 'repeat');
    ctx.translate(-ox, -oy);
    ctx.fillRect(ox, oy, W, H);
    ctx.restore();
  }
  desenharVisual(W, H, t);
  desenharTextos(W, H, t);
}

// Miniaturas dos estilos
function renderEstilos() {
  const box = $('#gradeEstilos');
  box.innerHTML = '';
  ESTILOS.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'estilo' + (P.efeito.estilo === s.id ? ' ativo' : '');
    const c = document.createElement('canvas');
    c.width = 108; c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = g.strokeStyle = P.efeito.estilo === s.id ? P.efeito.cor : '#9c8f79';
    g.lineWidth = 3;
    const f = (x) => Math.sin(x * 0.35) * Math.sin(x * 0.07 + 1) * 18;
    if (s.id === 'onda' || s.id === 'onda_dupla') {
      const faixas = s.id === 'onda' ? [[24, 20]] : [[13, 10], [35, 10]];
      for (const [m, a] of faixas) for (let x = 4; x < 104; x += 3) { const v = Math.abs(f(x)) / 18 * a; g.fillRect(x, m - v, 2, v * 2 + 1); }
    } else if (s.id === 'linha' || s.id === 'pontos') {
      g.beginPath();
      for (let x = 4; x < 104; x += s.id === 'linha' ? 2 : 4) { const y = 24 - f(x); if (s.id === 'linha') (x === 4 ? g.moveTo(x, y) : g.lineTo(x, y)); else g.fillRect(x, y, 3, 3); }
      if (s.id === 'linha') g.stroke();
    } else if (s.id === 'barras' || s.id === 'barras_espelho') {
      for (let i = 0; i < 14; i++) { const h = (0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + 0.6))) * (s.id === 'barras' ? 40 : 20); if (s.id === 'barras') g.fillRect(6 + i * 7, 44 - h, 5, h); else { g.fillRect(6 + i * 7, 24 - h, 5, h); g.fillRect(6 + i * 7, 24, 5, h); } }
    } else if (s.id === 'nuvem') {
      g.lineWidth = 1; g.beginPath();
      for (let i = 0; i < 160; i++) { const a = i * 2.4, r = 6 + 12 * Math.abs(Math.sin(i * 0.37)); const x = 54 + Math.cos(a) * r * 1.1, y = 24 + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    } else {
      g.lineWidth = 2; g.beginPath(); g.moveTo(40, 12); g.lineTo(68, 36); g.moveTo(68, 12); g.lineTo(40, 36); g.stroke();
    }
    b.appendChild(c);
    b.appendChild(document.createTextNode(s.nome));
    b.onclick = () => { P.efeito.estilo = s.id; renderEstilos(); salvarDepois(); };
    box.appendChild(b);
  });
}

function renderCores(boxSel, lista, obj, chave, depois) {
  const box = $(boxSel);
  box.innerHTML = '';
  lista.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'cor' + (obj[chave].toLowerCase() === c ? ' ativa' : '');
    b.style.background = c;
    b.title = c;
    b.onclick = () => { obj[chave] = c; renderCores(boxSel, lista, obj, chave, depois); depois && depois(); salvarDepois(); };
    box.appendChild(b);
  });
}

function corDaImagem() {
  const f = P.fundos[P.fundoAtivo];
  if (!f) return avisar('Adicione uma imagem de fundo primeiro');
  const el = midiaDoFundo(f);
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d');
  try { g.drawImage(el, 0, 0, 48, 48); } catch { return; }
  const d = g.getImageData(0, 0, 48, 48).data;
  // Pega a cor mais "viva" (saturada e clara) da imagem
  let melhor = null, nota = -1;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx ? (mx - mn) / mx : 0;
    const n = sat * 0.7 + (mx / 255) * 0.3;
    if (n > nota && mx > 90) { nota = n; melhor = [r, gg, b]; }
  }
  if (!melhor) return;
  P.efeito.cor = '#' + melhor.map((v) => v.toString(16).padStart(2, '0')).join('');
  $('#corLivre').value = P.efeito.cor;
  renderCores('#cores', CORES, P.efeito, 'cor', renderEstilos);
  renderEstilos();
  salvarDepois();
}

// ---------- Controles ligados ao projeto ----------
function ligarSlider(id, obj, chave, rotulo, fmt = (v) => `${v}%`) {
  const el = $(id);
  const pintar = () => {
    $(rotulo).textContent = fmt(obj()[chave]);
    const min = Number(el.min), max = Number(el.max);
    el.style.setProperty('--p', `${((obj()[chave] - min) / (max - min)) * 100}%`);
  };
  el.value = obj()[chave];
  pintar();
  el.oninput = () => { obj()[chave] = Number(el.value); pintar(); salvarDepois(); };
  return () => { el.value = obj()[chave]; pintar(); };
}
function ligarCheck(id, obj, chave, depois) {
  const el = $(id);
  el.checked = !!obj()[chave];
  el.onchange = () => { obj()[chave] = el.checked; depois && depois(); salvarDepois(); };
  return () => { el.checked = !!obj()[chave]; depois && depois(); };
}
function ligarSegmentado(id, obj, chave, depois) {
  const box = $(id);
  const pintar = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === String(obj()[chave])));
  box.querySelectorAll('button').forEach((b) => (b.onclick = () => { obj()[chave] = b.dataset.v; pintar(); depois && depois(); salvarDepois(); }));
  pintar();
  return pintar;
}
function ligarCampo(id, obj, chave, evento = 'input') {
  const el = $(id);
  el.value = obj()[chave] ?? '';
  el.addEventListener(evento, () => { obj()[chave] = el.value; salvarDepois(); });
  return () => { el.value = obj()[chave] ?? ''; };
}

const atualizadores = [];
function ligarTudo() {
  const ef = () => P.efeito, tx = () => P.textura, au = () => P.audio, lg = () => P.legenda, fm = () => P.formato, pb = () => P.publicar, sd = () => P.saida, ag = () => P.publicar.agendar;
  atualizadores.push(
    ligarSlider('#sLargura', ef, 'largura', '#vLargura'),
    ligarSlider('#sIntensidade', ef, 'intensidade', '#vIntensidade'),
    ligarSlider('#sPosX', ef, 'posX', '#vPosX'),
    ligarSlider('#sPosY', ef, 'posY', '#vPosY'),
    ligarSlider('#sOpacidade', ef, 'opacidade', '#vOpacidade'),
    ligarSlider('#sEscurecer', tx, 'escurecer', '#vEscurecer'),
    ligarSlider('#sGranulado', tx, 'granulado', '#vGranulado', (v) => (v ? `${v}%` : 'desligado')),
    ligarCheck('#cVinheta', tx, 'vinheta'),
    ligarSegmentado('#segEnquadramento', () => P, 'enquadramento'),
    ligarCheck('#cMostrarNome', lg, 'mostrarNome'),
    ligarCheck('#cLegenda', lg, 'ativo', () => $('#camposLegenda').classList.toggle('desligado', !P.legenda.ativo)),
    ligarCampo('#selIdioma', lg, 'idioma', 'change'),
    ligarSegmentado('#segPosLegenda', lg, 'posicao'),
    ligarSlider('#sTamLegenda', lg, 'tamanho', '#vTamLegenda'),
    ligarCheck('#cInstrumental', au, 'somenteInstrumental', atualizarResumo),
    ligarSlider('#sCrossfade', au, 'crossfade', '#vCrossfade', (v) => (v ? `${v} s` : 'sem')),
    ligarCheck('#cNormalizar', au, 'normalizar'),
    ligarCheck('#cPublicar', pb, 'ativo', () => { $('#camposPublicar').classList.toggle('desligado', !P.publicar.ativo); atualizarResumo(); }),
    ligarCampo('#inTitulo', pb, 'titulo'),
    ligarCampo('#inDescricao', pb, 'descricao'),
    ligarCheck('#cTracklist', pb, 'incluirTracklist'),
    ligarCampo('#inTags', pb, 'tags'),
    ligarSegmentado('#segPrivacidade', pb, 'privacidade'),
    ligarCheck('#cAgendar', ag, 'ativo', () => $('#camposAgendar').classList.toggle('desligado', !P.publicar.agendar.ativo)),
    ligarCampo('#inAgendarInicio', ag, 'inicio'),
    ligarCampo('#inIntervalo', ag, 'intervaloHoras'),
    ligarCampo('#inNome', sd, 'nome'),
    ligarSegmentado('#segTipo', fm, 'tipo', () => {
      const max = Number(P.formato.duracaoMaxMin) || 0;
      if (P.formato.tipo === 'curto' && (!max || max > 3)) P.formato.duracaoMaxMin = 1;
      if (P.formato.tipo === 'longo' && max && max <= 3) P.formato.duracaoMaxMin = '';
      $('#inDuracaoMax').value = P.formato.duracaoMaxMin;
      dimensionarPrevia(); atualizarResumo();
    }),
    ligarCampo('#selResolucao', fm, 'resolucao', 'change'),
    ligarCampo('#inDuracaoMax', fm, 'duracaoMaxMin'),
    ligarCampo('#inLimiteMusica', fm, 'limiteMusicaSeg'),
  );
  $('#selCanal').onchange = (e) => { P.publicar.canalId = e.target.value; salvarDepois(); };
  $('#corLivre').oninput = (e) => { P.efeito.cor = e.target.value; renderCores('#cores', CORES, P.efeito, 'cor'); renderEstilos(); salvarDepois(); };
  $('#sGranulado').addEventListener('input', () => { $('#notaGranulado').classList.toggle('alerta', P.textura.granulado > 0); });
  $('#notaGranulado').classList.toggle('alerta', P.textura.granulado > 0);
  $('#inPasta').value = P.saida.pasta || '';
}
function atualizarTudo() {
  atualizadores.forEach((f) => f());
  $('#inPasta').value = P.saida.pasta || '';
  renderCores('#cores', CORES, P.efeito, 'cor', renderEstilos);
  renderCores('#coresLegenda', CORES_LEGENDA, P.legenda, 'cor');
  renderEstilos();
  renderMusicas();
  renderFundos();
  dimensionarPrevia();
}

// ---------- Canais ----------
function renderCanais() {
  $('#qtdCanais').textContent = canais.length;
  const sel = $('#selCanal');
  sel.innerHTML = canais.length ? '' : '<option value="">Nenhum canal conectado</option>';
  canais.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.titulo; sel.appendChild(o); });
  if (!canais.find((c) => c.id === P.publicar.canalId)) P.publicar.canalId = canais[0]?.id || '';
  sel.value = P.publicar.canalId;
  const ul = $('#listaCanais');
  ul.innerHTML = canais.length ? '' : '<li class="vazio-canais">Nenhum canal conectado ainda</li>';
  canais.forEach((c) => {
    const li = document.createElement('li');
    li.className = 'canal';
    li.innerHTML = `${c.thumb ? `<img src="${c.thumb}" />` : '<span class="sem-foto"></span>'}<span class="info"><b></b><small>conectado em ${new Date(c.conectadoEm).toLocaleDateString('pt-BR')}</small></span><button class="btn-mini perigo">Desconectar</button>`;
    li.querySelector('b').textContent = c.titulo;
    li.querySelector('button').onclick = async () => {
      if (!confirm(`Desconectar o canal "${c.titulo}" deste app?`)) return;
      canais = await window.api.canais.remover(c.id);
      renderCanais();
    };
    ul.appendChild(li);
  });
  atualizarResumo();
}

// ---------- Fila ----------
const ROTULO_STATUS = {
  aguardando: 'Aguardando', separando: 'Separando voz', legenda: 'Legenda', audio: 'Áudio', fundos: 'Fundos',
  renderizando: 'Gerando', publicando: 'Publicando', concluido: 'Pronto', erro: 'Erro', cancelado: 'Cancelado', interrompido: 'Interrompido',
};
const RODANDO = ['separando', 'legenda', 'audio', 'fundos', 'renderizando', 'publicando'];
function renderFila() {
  const box = $('#filaCartoes');
  $('#qtdFila').textContent = jobs.length;
  if (!jobs.length) { box.innerHTML = '<p class="fila-vazia">Os vídeos que você mandar gerar aparecem aqui.</p>'; return; }
  box.innerHTML = '';
  [...jobs].reverse().forEach((j) => {
    const rodando = RODANDO.includes(j.status);
    const d = document.createElement('div');
    d.className = `job ${rodando ? 'rodando' : j.status}`;
    const qtd = j.projeto.musicas.length;
    const detalhe = j.status === 'erro' ? j.erro
      : rodando ? `${j.etapa}${j.restanteSeg ? ` · falta ~${tempoCurto(j.restanteSeg)}` : ''}`
      : j.status === 'concluido' ? `${qtd} música${qtd > 1 ? 's' : ''} · ${tempo(j.duracao)}`
      : j.status === 'interrompido' ? 'Processamento interrompido'
      : `${qtd} música${qtd > 1 ? 's' : ''} · ${j.projeto.fundos.length} fundo${j.projeto.fundos.length === 1 ? '' : 's'}`;
    d.innerHTML = `
      <span class="estado">${ROTULO_STATUS[j.status] || j.status}${j.partes > 1 ? ` · ${j.parte}/${j.partes}` : ''}</span>
      <span class="nome-job"></span>
      <span class="detalhe"></span>
      <span class="barra"><i style="width:${Math.round((j.progresso || 0) * 100)}%"></i></span>
      <span class="links"></span>
      <span class="acoes-job"></span>`;
    d.querySelector('.nome-job').textContent = j.nome;
    d.querySelector('.nome-job').title = j.nome;
    d.querySelector('.detalhe').textContent = detalhe || '';
    d.querySelector('.detalhe').title = detalhe || '';
    const links = d.querySelector('.links');
    if (j.arquivoFinal) { const a = document.createElement('a'); a.textContent = 'Abrir pasta'; a.onclick = () => window.api.abrir.pasta(j.arquivoFinal); links.appendChild(a); }
    if (j.youtube?.url) { const a = document.createElement('a'); a.textContent = j.youtube.agendadoPara ? `Agendado ${new Date(j.youtube.agendadoPara).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Ver no YouTube'; a.onclick = () => window.api.abrir.link(j.youtube.url); links.appendChild(a); }
    const acoes = d.querySelector('.acoes-job');
    const botao = (txt, titulo, fn) => { const b = document.createElement('button'); b.textContent = txt; b.title = titulo; b.onclick = fn; acoes.appendChild(b); };
    if (rodando || j.status === 'aguardando') botao('■', 'Cancelar', () => window.api.fila.cancelar(j.id));
    if (['erro', 'cancelado', 'interrompido'].includes(j.status)) botao('↻', 'Tentar de novo', () => window.api.fila.retentar(j.id));
    if (!rodando) botao('×', 'Tirar da fila', () => window.api.fila.remover(j.id));
    box.appendChild(d);
  });
}

// ---------- Gerar ----------
async function gerar() {
  const sel = selecionadas();
  if (!sel.length) return;
  if (P.audio.somenteInstrumental && !config.temFal) return abrirConfig('Cadastre a chave da fal.ai para separar a voz.');
  if (P.legenda.ativo && !config.temGroq) return abrirConfig('Cadastre a chave da Groq para gerar a legenda.');
  if (P.publicar.ativo && !P.publicar.canalId) { trocarAba('publicar'); return avisar('Escolha o canal do YouTube', true); }
  const nomeBase = (P.saida.nome || P.publicar.titulo || sel[0].titulo || 'compilacao').trim();
  const projeto = {
    nome: nomeBase,
    musicas: sel.map(({ arquivo, titulo, duracao }) => ({ arquivo, titulo, duracao })),
    fundos: [...P.fundos],
    enquadramento: P.enquadramento,
    efeito: { ...P.efeito },
    textura: { ...P.textura },
    audio: { ...P.audio },
    legenda: { ...P.legenda },
    formato: { ...P.formato },
    saida: { pasta: P.saida.pasta, nome: nomeBase },
    publicar: {
      ...P.publicar,
      agendar: { ...P.publicar.agendar },
      tags: String(P.publicar.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    },
  };
  try {
    const n = await window.api.fila.adicionar(projeto);
    avisar(n > 1 ? `${n} vídeos entraram na fila` : 'Vídeo entrou na fila');
  } catch (e) {
    avisar(msgErro(e), true);
  }
}

// ---------- Modais ----------
function trocarAba(id) {
  $$('.aba').forEach((a) => a.classList.toggle('ativa', a.dataset.aba === id));
  $$('.painel-aba').forEach((p) => p.classList.toggle('ativa', p.id === `aba-${id}`));
}
async function abrirConfig(msg) {
  config = await window.api.config.ler();
  $('#cfgFal').value = config.falKey || '';
  $('#cfgGroq').value = config.groqKey || '';
  $('#cfgClientId').value = config.google.clientId || '';
  $('#cfgClientSecret').value = config.google.clientSecret || '';
  $('#cfgRedirect').value = config.google.redirectOriginal || '';
  $('#cfgSimultaneos').value = String(config.simultaneos || 1);
  $('#cfgEncoder').value = config.encoder || 'auto';
  $$('input[name=modo]').forEach((r) => (r.checked = r.value === (config.modo || 'normal')));
  $('#campoSimultaneos').style.display = config.modo === 'maximo' ? '' : 'none';
  $('#modalConfig').showModal();
  if (msg) avisar(msg, true);
}

async function iniciar() {
  config = await window.api.config.ler();
  if (config.ultimoProjeto) P = mesclar(PADRAO, config.ultimoProjeto);
  ligarTudo();
  atualizarTudo();
  canais = await window.api.canais.listar();
  renderCanais();
  jobs = await window.api.fila.listar();
  renderFila();
  requestAnimationFrame(desenhar);

  window.api.sistema.info().then((i) => {
    $('#versao').textContent = `v${i.versao}`;
    const nomes = { libx264: 'Processador', h264_qsv: 'Intel Quick Sync', h264_nvenc: 'NVIDIA', h264_amf: 'AMD' };
    $('#chipEncoder').textContent = `⚡ ${nomes[i.encoder] || i.encoder}`;
    $('#encoderDetectado').textContent = `Detectado neste PC: ${nomes[i.encoder] || i.encoder} · ${i.nucleos} núcleos`;
    $('#redirectLocal').textContent = i.redirect;
  });

  window.api.ao('fila:mudou', (j) => { jobs = j; renderFila(); });
  window.api.ao('sistema:cpu', (v) => {
    $('#cpuTexto').textContent = `CPU ${v}%`;
    const b = $('#cpuBarra');
    b.style.width = `${v}%`;
    b.style.background = v > 85 ? 'var(--terracota-forte)' : v > 60 ? 'var(--ouro)' : 'var(--teal)';
  });

  // Botões
  $('#btnAddMusicas').onclick = async () => adicionarMusicas(await window.api.dialogo.musicas());
  $('#btnPastaMusicas').onclick = async () => { avisar('Lendo a pasta...'); adicionarMusicas(await window.api.dialogo.pastaMusicas()); };
  $('#buscaMusica').oninput = (e) => { filtro = e.target.value; renderMusicas(); };
  $('#btnTudo').onclick = () => { P.musicas.forEach((m) => (m.selecionada = true)); renderMusicas(); salvarDepois(); };
  $('#btnNenhum').onclick = () => { P.musicas.forEach((m) => (m.selecionada = false)); renderMusicas(); salvarDepois(); };
  $('#btnRemoverSel').onclick = () => {
    const n = selecionadas().length;
    if (!n || !confirm(`Tirar ${n} música${n > 1 ? 's' : ''} selecionada${n > 1 ? 's' : ''} da lista?`)) return;
    pararMusica();
    P.musicas = P.musicas.filter((m) => !m.selecionada);
    renderMusicas(); salvarDepois();
  };
  $('#btnEmbaralhar').onclick = () => {
    for (let i = P.musicas.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [P.musicas[i], P.musicas[j]] = [P.musicas[j], P.musicas[i]]; }
    pararMusica(); renderMusicas(); salvarDepois();
  };
  $('#btnAddFundo').onclick = async () => adicionarFundos(await window.api.dialogo.fundos());
  $('#btnPlayPrevia').onclick = () => {
    if (tocando !== null) return tocarMusica(tocando);
    const i = P.musicas.findIndex((m) => m.selecionada);
    if (i < 0) return avisar('Adicione uma música para ouvir a prévia');
    tocarMusica(i);
  };
  $('#btnCorImagem').onclick = corDaImagem;
  $('#btnPasta').onclick = async () => { const p = await window.api.dialogo.pastaSaida(); if (p) { P.saida.pasta = p; $('#inPasta').value = p; salvarDepois(); } };
  $('#btnGerar').onclick = gerar;
  $('#btnLimparFila').onclick = () => window.api.fila.limpar();
  $('#btnPainel').onclick = () => window.api.abrir.link('https://youvideors2.vercel.app');
  $$('.aba').forEach((a) => (a.onclick = () => trocarAba(a.dataset.aba)));

  // Modais
  $$('[data-fechar]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
  $('#btnCanais').onclick = () => { $('#erroCanais').textContent = ''; $('#modalCanais').showModal(); };
  $('#btnConectarCanal').onclick = () => { $('#erroCanais').textContent = ''; $('#modalCanais').showModal(); };
  $('#btnAutorizarCanal').onclick = async () => {
    if (!config.temGoogle) { $('#modalCanais').close(); return abrirConfig('Cadastre o Client ID e o Client Secret do Google primeiro.'); }
    const b = $('#btnAutorizarCanal');
    b.disabled = true; b.textContent = 'Esperando você autorizar no navegador...';
    $('#erroCanais').textContent = '';
    try { canais = await window.api.canais.autorizar(); renderCanais(); avisar('Canal conectado!'); }
    catch (e) { $('#erroCanais').textContent = msgErro(e); }
    finally { b.disabled = false; b.textContent = 'Conectar canal pelo navegador'; }
  };
  $('#btnSalvarToken').onclick = async () => {
    $('#erroCanais').textContent = '';
    try { canais = await window.api.canais.porToken({ refreshToken: $('#inToken').value }); $('#inToken').value = ''; renderCanais(); avisar('Canal conectado!'); }
    catch (e) { $('#erroCanais').textContent = msgErro(e); }
  };
  $('#btnConfig').onclick = () => abrirConfig();
  $$('input[name=modo]').forEach((r) => (r.onchange = () => ($('#campoSimultaneos').style.display = r.value === 'maximo' && r.checked ? '' : 'none')));
  $('#btnSalvarConfig').onclick = async () => {
    config = await window.api.config.salvar({
      falKey: $('#cfgFal').value.trim(),
      groqKey: $('#cfgGroq').value.trim(),
      google: { clientId: $('#cfgClientId').value.trim(), clientSecret: $('#cfgClientSecret').value.trim(), redirectOriginal: $('#cfgRedirect').value.trim() },
      modo: ($$('input[name=modo]').find((r) => r.checked) || {}).value || 'normal',
      simultaneos: Number($('#cfgSimultaneos').value) || 1,
      encoder: $('#cfgEncoder').value,
    });
    $('#modalConfig').close();
    avisar('Configurações salvas');
    atualizarResumo();
  };

  // Arrastar e soltar arquivos
  const soltar = (alvo, fn) => {
    alvo.addEventListener('dragover', (e) => { e.preventDefault(); alvo.classList.add('soltando'); });
    alvo.addEventListener('dragleave', () => alvo.classList.remove('soltando'));
    alvo.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      alvo.classList.remove('soltando');
      fn([...e.dataTransfer.files].map((f) => window.api.caminhoDoArquivo(f)).filter(Boolean));
    });
  };
  soltar($('#colMusicas'), async (caminhos) => adicionarMusicas(await window.api.midia.musicas(caminhos.filter((c) => EXT_AUD.includes(ext(c)) || EXT_VID.includes(ext(c))))));
  soltar($('.col-previa'), (caminhos) => {
    const aud = caminhos.filter((c) => EXT_AUD.includes(ext(c)));
    if (aud.length) window.api.midia.musicas(aud).then(adicionarMusicas);
    adicionarFundos(caminhos.filter((c) => !EXT_AUD.includes(ext(c))));
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      e.preventDefault();
      $('#btnPlayPrevia').click();
    }
  });
}

iniciar();
