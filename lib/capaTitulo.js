// Estúdio de Música — escreve o nome da música por cima da arte da capa (roda no navegador).
// A IA de imagem erra as letras; aqui o título é desenhado com fonte de verdade, igual ao título
// cadastrado (a distribuidora recusa capa com texto diferente do título).

let fontePronta = null;
function carregarFonte() {
  if (!fontePronta) {
    const faces = [
      new FontFace('CapaTitulo', 'url(/fonts/bebas-neue.woff2)'),
      new FontFace('CapaTitulo', 'url(/fonts/bebas-neue-ext.woff2)', { unicodeRange: 'U+0100-024F, U+1E00-1EFF' }),
    ];
    fontePronta = Promise.all(faces.map((f) => f.load().then((x) => document.fonts.add(x)).catch(() => {})));
  }
  return fontePronta;
}

const FONTE = (px) => `${Math.round(px)}px CapaTitulo, Impact, "Arial Narrow", sans-serif`;

/** Todas as formas de quebrar as palavras em n linhas (sem mudar a ordem). */
function quebras(palavras, n) {
  if (n === 1) return [[palavras.join(' ')]];
  const saida = [];
  for (let i = 1; i <= palavras.length - (n - 1); i++) {
    for (const resto of quebras(palavras.slice(i), n - 1)) saida.push([palavras.slice(0, i).join(' '), ...resto]);
  }
  return saida;
}

/**
 * Escolhe em quantas linhas o título fica maior e mais legível.
 * medir(texto) = largura do texto com a fonte a 100 px. Devolve { linhas, px } para uma capa de lado T.
 */
export function ajustarTitulo(titulo, medir, T) {
  const texto = String(titulo || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
  const palavras = texto.split(' ').filter(Boolean);
  if (!palavras.length) return { linhas: [], px: 0 };
  const largura = 0.88 * T;
  const teto = { 1: 0.2 * T, 2: 0.165 * T, 3: 0.135 * T };
  let melhor = null;
  for (let n = 1; n <= Math.min(3, palavras.length); n++) {
    for (const linhas of quebras(palavras, n)) {
      const maior = Math.max(...linhas.map((l) => medir(l)));
      const px = Math.min(teto[n], (largura / maior) * 100);
      // menos linhas ganha quando o tamanho é parecido; com o mesmo nº de linhas, a quebra mais equilibrada
      const nota = px * (1 - 0.12 * (n - 1));
      if (!melhor || nota > melhor.nota + 0.001) melhor = { linhas, px, nota };
    }
  }
  return { linhas: melhor.linhas, px: melhor.px };
}

function abrirImagem(url) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('Não consegui abrir a arte da capa.'));
    img.src = url;
  });
}

/** Devolve um Blob JPG quadrado (tam × tam) com a arte e o título embaixo. */
export async function capaComTitulo(arteUrl, titulo, tam = 3000) {
  const [img] = await Promise.all([abrirImagem(arteUrl), carregarFonte()]);
  const T = tam;
  const c = document.createElement('canvas');
  c.width = T;
  c.height = T;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, T, T);

  g.font = FONTE(100);
  const { linhas, px } = ajustarTitulo(titulo, (t) => g.measureText(t).width, T);
  if (linhas.length) {
    const passo = px * 0.98; // distância entre as linhas (sobra espaço para os acentos)
    const base = T - 0.075 * T; // linha de base da última linha
    const topo = base - passo * (linhas.length - 1) - px * 0.9;

    // Escurece a parte de baixo para o título ler bem em qualquer arte
    const inicio = Math.max(0, topo - 0.16 * T);
    const sombra = g.createLinearGradient(0, inicio, 0, T);
    sombra.addColorStop(0, 'rgba(14, 10, 5, 0)');
    sombra.addColorStop(Math.min(0.9, (topo - inicio) / (T - inicio)), 'rgba(14, 10, 5, 0.62)');
    sombra.addColorStop(1, 'rgba(14, 10, 5, 0.86)');
    g.fillStyle = sombra;
    g.fillRect(0, inicio, T, T - inicio);

    g.font = FONTE(px);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    linhas.forEach((linha, i) => {
      const y = base - passo * (linhas.length - 1 - i);
      // contorno escuro com sombra
      g.save();
      g.shadowColor = 'rgba(0, 0, 0, 0.75)';
      g.shadowBlur = px * 0.12;
      g.shadowOffsetY = px * 0.04;
      g.strokeStyle = '#2b1a0a';
      g.lineWidth = px * 0.13;
      g.strokeText(linha, T / 2, y);
      g.restore();
      // letras em creme, mais claras em cima
      const cor = g.createLinearGradient(0, y - px * 0.72, 0, y);
      cor.addColorStop(0, '#fff6dc');
      cor.addColorStop(1, '#e9c68c');
      g.fillStyle = cor;
      g.fillText(linha, T / 2, y);
    });
  }
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Não consegui montar a capa com o título.');
  return blob;
}
