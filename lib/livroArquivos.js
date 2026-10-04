// Livros bíblicos — monta o PDF e o Word (editável, para PLR) no navegador.
// As ilustrações vêm do armazenamento; a capa é composta aqui (imagem + título) e usada nos dois arquivos.

const A4 = { w: 595.28, h: 841.89 };
const M = 40; // margem
const semEmoji = (t) => String(t || '').replace(/\p{Extended_Pictographic}|️/gu, '').replace(/[ \t]+/g, ' ').trim();

async function bytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('não consegui baixar um arquivo do livro');
  return new Uint8Array(await r.arrayBuffer());
}

function carregar(url) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('não consegui abrir uma ilustração'));
    img.src = url;
  });
}

const jpeg = (canvas, q = 0.88) => new Promise((ok) => canvas.toBlob(async (b) => ok(new Uint8Array(await b.arrayBuffer())), 'image/jpeg', q));

/** Recorta a ilustração no formato pedido (largura/altura) e devolve JPEG. */
async function recortar(url, proporcao, largura = 1400) {
  const img = await carregar(url);
  const c = document.createElement('canvas');
  c.width = largura;
  c.height = Math.round(largura / proporcao);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const pi = img.naturalWidth / img.naturalHeight;
  let sw = img.naturalWidth, sh = img.naturalHeight;
  if (pi > proporcao) sw = sh * proporcao; else sh = sw / proporcao;
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return jpeg(c);
}

function quebrarCanvas(g, texto, maxW) {
  const linhas = [];
  let atual = '';
  for (const p of String(texto).split(/\s+/)) {
    const teste = atual ? `${atual} ${p}` : p;
    if (g.measureText(teste).width > maxW && atual) { linhas.push(atual); atual = p; } else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Capa pronta: ilustração em página inteira + faixa escura com título, subtítulo e autor. */
export async function comporCapa(livro, autor) {
  try {
    await Promise.all([
      new FontFace('LivroTitulo', 'url(/fonts/Fraunces_600SemiBold.ttf)').load().then((f) => document.fonts.add(f)),
      new FontFace('LivroTexto', 'url(/fonts/Inter_700Bold.ttf)').load().then((f) => document.fonts.add(f)),
    ]);
  } catch { /* usa a fonte padrão */ }
  const W = 1654, H = 2339; // A4 a 200 dpi
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2118';
  g.fillRect(0, 0, W, H);
  if (livro.capa?.url) {
    const img = await carregar(livro.capa.url);
    const p = W / H, pi = img.naturalWidth / img.naturalHeight;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    if (pi > p) sw = sh * p; else sh = sw / p;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, W, H);
  }
  // faixa escura em degradê embaixo
  const grad = g.createLinearGradient(0, H * 0.52, 0, H);
  grad.addColorStop(0, 'rgba(20,14,8,0)');
  grad.addColorStop(0.35, 'rgba(20,14,8,0.78)');
  grad.addColorStop(1, 'rgba(20,14,8,0.94)');
  g.fillStyle = grad;
  g.fillRect(0, H * 0.52, W, H * 0.48);
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  let tam = 150;
  let linhas = [];
  for (; tam >= 80; tam -= 10) {
    g.font = `${tam}px LivroTitulo, Georgia, serif`;
    linhas = quebrarCanvas(g, semEmoji(livro.titulo), W - 240);
    if (linhas.length <= 3) break;
  }
  const altL = tam * 1.12;
  let y = H - 330 - (linhas.length - 1) * altL;
  linhas.forEach((l) => { g.fillText(l, W / 2, y); y += altL; });
  if (livro.subtitulo) {
    g.font = '52px LivroTexto, Arial, sans-serif';
    g.fillStyle = '#f1dfb6';
    quebrarCanvas(g, semEmoji(livro.subtitulo), W - 300).slice(0, 2).forEach((l, i) => g.fillText(l, W / 2, H - 230 + i * 64));
  }
  if (autor) {
    g.font = '44px LivroTexto, Arial, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(semEmoji(autor).toUpperCase(), W / 2, H - 80);
  }
  return jpeg(c, 0.9);
}

/** Lista das páginas do livro numa forma comum para o PDF e para o Word. */
function estrutura(livro) {
  if (livro.tipo === 'adulto') {
    return {
      ilustradas: (livro.capitulos || []).map((c, i) => ({ rotulo: `Capítulo ${i + 1}`, titulo: c.titulo, texto: c.texto, url: c.url, aplicacao: c.aplicacao, oracao: c.oracao })),
    };
  }
  return { ilustradas: (livro.paginasTexto || []).map((p) => ({ texto: p.texto, url: p.url })) };
}

// ───────────────────────── PDF ─────────────────────────
export async function gerarPdf(livro, { autor = '', onEtapa = () => {} } = {}) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  onEtapa('Preparando as fontes…');
  const [fTit, fTxt, fNeg] = await Promise.all([
    // Inter inteira (sem "subset"): cortar essa fonte fazia sumir letras do texto
    bytes('/fonts/Fraunces_600SemiBold.ttf').then((b) => doc.embedFont(b, { subset: true })), // esta fica certa só com subset
    bytes('/fonts/Inter_400Regular.ttf').then((b) => doc.embedFont(b)),
    bytes('/fonts/Inter_700Bold.ttf').then((b) => doc.embedFont(b)),
  ]);
  doc.setTitle(semEmoji(livro.titulo));
  if (autor) doc.setAuthor(semEmoji(autor));
  const escuro = rgb(0.13, 0.11, 0.09), suave = rgb(0.42, 0.38, 0.33), ouro = rgb(0.62, 0.45, 0.14);
  const infantil = livro.tipo !== 'adulto';

  let pag = null, y = 0, num = 0;
  const nova = (numerada = true) => {
    pag = doc.addPage([A4.w, A4.h]);
    y = A4.h - M - 10;
    if (numerada) {
      num += 1;
      const t = String(num);
      pag.drawText(t, { x: (A4.w - fTxt.widthOfTextAtSize(t, 9)) / 2, y: 24, size: 9, font: fTxt, color: suave });
    }
  };
  const quebrar = (texto, font, size, maxW) => {
    const linhas = [];
    for (const par of semEmoji(texto).split(/\n+/)) {
      let atual = '';
      for (const p of par.split(/\s+/).filter(Boolean)) {
        const teste = atual ? `${atual} ${p}` : p;
        if (font.widthOfTextAtSize(teste, size) > maxW && atual) { linhas.push(atual); atual = p; } else atual = teste;
      }
      linhas.push(atual);
      linhas.push(null); // fim de parágrafo
    }
    while (linhas.length && linhas[linhas.length - 1] === null) linhas.pop();
    return linhas;
  };
  const escrever = (texto, { font = fTxt, size = 11.5, lh = size * 1.52, cor = escuro, centro = false, depois = 10, maxW = A4.w - 2 * M } = {}) => {
    if (!semEmoji(texto)) return;
    for (const l of quebrar(texto, font, size, maxW)) {
      if (l === null) { y -= lh * 0.55; continue; }
      if (y - lh < 46) nova();
      y -= lh;
      const x = centro ? (A4.w - font.widthOfTextAtSize(l, size)) / 2 : M;
      pag.drawText(l, { x, y, size, font, color: cor });
    }
    y -= depois;
  };
  const imagem = async (url, proporcao, altura) => {
    if (!url) return;
    const img = await doc.embedJpg(await recortar(url, proporcao));
    const w = A4.w - 2 * M;
    pag.drawImage(img, { x: M, y: y - altura, width: w, height: altura });
    y -= altura + 18;
  };

  // Capa
  onEtapa('Montando a capa…');
  const capa = await doc.embedJpg(await comporCapa(livro, autor));
  doc.addPage([A4.w, A4.h]).drawImage(capa, { x: 0, y: 0, width: A4.w, height: A4.h });

  // Página de rosto
  nova(false);
  y = A4.h * 0.68;
  escrever(livro.titulo, { font: fTit, size: 32, lh: 38, centro: true, depois: 14, maxW: A4.w - 140 });
  escrever(livro.subtitulo, { size: 14, lh: 20, cor: suave, centro: true, depois: 26, maxW: A4.w - 160 });
  if (livro.referencia) escrever(`Baseado em ${livro.referencia}`, { size: 11, cor: ouro, centro: true, font: fNeg });
  y = 120;
  if (autor) escrever(autor, { size: 12, centro: true, font: fNeg, depois: 4 });
  escrever('História contada com palavras próprias, fiel ao relato bíblico.', { size: 9, cor: suave, centro: true });

  const { ilustradas } = estrutura(livro);
  if (!infantil && livro.introducao) {
    nova();
    escrever('Introdução', { font: fTit, size: 24, lh: 30, depois: 14 });
    escrever(livro.introducao, { size: 12, lh: 19 });
  }
  for (let i = 0; i < ilustradas.length; i++) {
    const p = ilustradas[i];
    onEtapa(`Página ${i + 1} de ${ilustradas.length}…`);
    nova();
    if (infantil) {
      await imagem(p.url, 4 / 3, (A4.w - 2 * M) * 0.75);
      y -= 8;
      escrever(p.texto, { size: 17, lh: 27, centro: true, maxW: A4.w - 2 * M - 30 });
    } else {
      await imagem(p.url, 2.3, (A4.w - 2 * M) / 2.3);
      escrever(p.rotulo.toUpperCase(), { font: fNeg, size: 9, cor: ouro, depois: 2 });
      escrever(p.titulo, { font: fTit, size: 21, lh: 26, depois: 10 });
      escrever(p.texto, { size: 11.5, lh: 17.5, depois: 12 });
      if (p.aplicacao) { escrever('Para a sua vida', { font: fNeg, size: 10.5, cor: ouro, depois: 1 }); escrever(p.aplicacao, { size: 11.5, lh: 17.5, depois: 10 }); }
      if (p.oracao) { escrever('Oração', { font: fNeg, size: 10.5, cor: ouro, depois: 1 }); escrever(p.oracao, { size: 11.5, lh: 17.5 }); }
    }
  }
  if (infantil) {
    nova();
    y -= 30;
    escrever('O que aprendemos', { font: fTit, size: 26, lh: 32, centro: true, depois: 16 });
    escrever(livro.licao, { size: 16, lh: 26, centro: true, depois: 34, maxW: A4.w - 2 * M - 40 });
    escrever('Vamos orar?', { font: fTit, size: 22, lh: 28, centro: true, depois: 12 });
    escrever(livro.oracao, { size: 16, lh: 26, centro: true, maxW: A4.w - 2 * M - 40 });
    if ((livro.perguntas || []).length) {
      nova();
      y -= 30;
      escrever('Para conversar', { font: fTit, size: 26, lh: 32, centro: true, depois: 20 });
      livro.perguntas.forEach((q, i) => escrever(`${i + 1}. ${q}`, { size: 15, lh: 24, depois: 18 }));
    }
  } else {
    if (livro.conclusao) { nova(); escrever('Conclusão', { font: fTit, size: 24, lh: 30, depois: 14 }); escrever(livro.conclusao, { size: 12, lh: 19 }); }
    if (livro.oracaoFinal) { nova(); y -= 40; escrever('Oração final', { font: fTit, size: 24, lh: 30, centro: true, depois: 18 }); escrever(livro.oracaoFinal, { size: 13, lh: 22, centro: true, maxW: A4.w - 2 * M - 60 }); }
  }
  onEtapa('Finalizando o PDF…');
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

// ───────────────────────── Word (editável) ─────────────────────────
export async function gerarDocx(livro, { autor = '', onEtapa = () => {} } = {}) {
  const D = await import('docx');
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, PageBreak } = D;
  const infantil = livro.tipo !== 'adulto';
  const par = (texto, o = {}) =>
    new Paragraph({
      alignment: o.centro ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: o.depois ?? 160, line: o.linha ?? 320 },
      children: [new TextRun({ text: semEmoji(texto), bold: !!o.negrito, size: (o.tam || 12) * 2, font: o.fonte || 'Calibri', color: o.cor || '221C17' })],
    });
  const paragrafos = (texto, o) => semEmoji(texto).split(/\n+/).filter(Boolean).map((t) => par(t, o));
  const quebra = () => new Paragraph({ children: [new PageBreak()] });
  const figura = async (url, proporcao, largura) => {
    if (!url) return [];
    const data = await recortar(url, proporcao, 1200);
    return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new ImageRun({ type: 'jpg', data, transformation: { width: largura, height: Math.round(largura / proporcao) } })] })];
  };

  onEtapa('Montando a capa…');
  const capa = await comporCapa(livro, autor);
  const corpo = [];
  // Página de rosto
  corpo.push(par('', { depois: 2400 }), par(livro.titulo, { tam: 30, negrito: true, centro: true, fonte: 'Georgia', depois: 200 }));
  if (livro.subtitulo) corpo.push(par(livro.subtitulo, { tam: 14, centro: true, cor: '6B6055', depois: 300 }));
  if (livro.referencia) corpo.push(par(`Baseado em ${livro.referencia}`, { tam: 11, centro: true, negrito: true, cor: '9E7324', depois: 1600 }));
  if (autor) corpo.push(par(autor, { tam: 12, centro: true, negrito: true }));
  corpo.push(par('História contada com palavras próprias, fiel ao relato bíblico.', { tam: 9, centro: true, cor: '6B6055' }), quebra());

  const { ilustradas } = estrutura(livro);
  if (!infantil && livro.introducao) corpo.push(par('Introdução', { tam: 22, negrito: true, fonte: 'Georgia' }), ...paragrafos(livro.introducao, { tam: 12 }), quebra());
  for (let i = 0; i < ilustradas.length; i++) {
    const p = ilustradas[i];
    onEtapa(`Página ${i + 1} de ${ilustradas.length}…`);
    if (infantil) {
      corpo.push(...(await figura(p.url, 4 / 3, 600)), par(p.texto, { tam: 17, centro: true, linha: 440 }));
    } else {
      corpo.push(...(await figura(p.url, 2.3, 600)), par(p.rotulo.toUpperCase(), { tam: 9, negrito: true, cor: '9E7324', depois: 40 }), par(p.titulo, { tam: 20, negrito: true, fonte: 'Georgia' }), ...paragrafos(p.texto, { tam: 11.5 }));
      if (p.aplicacao) corpo.push(par('Para a sua vida', { tam: 10.5, negrito: true, cor: '9E7324', depois: 40 }), par(p.aplicacao, { tam: 11.5 }));
      if (p.oracao) corpo.push(par('Oração', { tam: 10.5, negrito: true, cor: '9E7324', depois: 40 }), par(p.oracao, { tam: 11.5 }));
    }
    corpo.push(quebra());
  }
  if (infantil) {
    corpo.push(par('O que aprendemos', { tam: 24, negrito: true, centro: true, fonte: 'Georgia' }), par(livro.licao, { tam: 16, centro: true, linha: 420, depois: 500 }));
    corpo.push(par('Vamos orar?', { tam: 20, negrito: true, centro: true, fonte: 'Georgia' }), par(livro.oracao, { tam: 16, centro: true, linha: 420 }));
    if ((livro.perguntas || []).length) {
      corpo.push(quebra(), par('Para conversar', { tam: 24, negrito: true, centro: true, fonte: 'Georgia', depois: 300 }));
      livro.perguntas.forEach((q, i) => corpo.push(par(`${i + 1}. ${q}`, { tam: 15, depois: 300 })));
    }
  } else {
    if (livro.conclusao) corpo.push(par('Conclusão', { tam: 22, negrito: true, fonte: 'Georgia' }), ...paragrafos(livro.conclusao, { tam: 12 }), quebra());
    if (livro.oracaoFinal) corpo.push(par('Oração final', { tam: 22, negrito: true, centro: true, fonte: 'Georgia' }), par(livro.oracaoFinal, { tam: 13, centro: true, linha: 400 }));
  }

  onEtapa('Finalizando o Word…');
  const A4twip = { width: 11906, height: 16838 };
  const doc = new Document({
    creator: semEmoji(autor) || 'Youvideo',
    title: semEmoji(livro.titulo),
    sections: [
      // capa em página inteira (sem margens)
      { properties: { page: { size: A4twip, margin: { top: 0, right: 0, bottom: 0, left: 0 } } }, children: [new Paragraph({ children: [new ImageRun({ type: 'jpg', data: capa, transformation: { width: 794, height: 1122 } })] })] },
      { properties: { page: { size: A4twip, margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } }, children: corpo },
    ],
  });
  return Packer.toBlob(doc);
}

export function baixarBlob(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 120000);
}

export function nomeArquivo(titulo, ext) {
  const base = String(titulo || 'livro').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'livro';
  return `${base}.${ext}`;
}
