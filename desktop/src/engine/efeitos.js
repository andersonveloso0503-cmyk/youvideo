// Movimento de verdade para cenas paradas (sem depender da IA nem de crédito):
// chuva caindo, relâmpagos, névoa andando, luz de fogo e brilho na água, por cima da imagem.
// Tudo é gerado pelo ffmpeg e é periódico em 20 s: o clipe emenda nele mesmo sem pulo.
//
// Quais efeitos entram vem do texto de movimento do tema ("rain falling", "lightning flashes"...).

const SEGUNDOS = 20;

/** Lê o texto de movimento e diz quais efeitos combinam com a cena. */
function efeitosDoMovimento(texto) {
  const t = String(texto || '').toLowerCase();
  const ef = {
    chuva: /rain|chuva|drizzle|raindrop|drip|goteja/.test(t),
    relampago: /lightning|thunder|relâmpago|relampago|trov/.test(t),
    nevoa: /mist|fog|cloud|névoa|nevoa|neblina|nuvem|nuvens/.test(t),
    fogo: /flame|fire|lareira|fogo|chama|lamp|candle|vela/.test(t),
    brilho: /wave|ondas|shimmer|ocean|moonlight|waterfall|cachoeira|sparkl|brilh/.test(t),
    queda: /waterfall|cachoeira/.test(t),
  };
  ef.algum = Object.keys(ef).some((k) => ef[k]);
  return ef;
}

// Textura aleatória de 1 quadro, repetida: base de todos os efeitos
const ruido = (w, h, fps, semente) =>
  `color=c=black:s=${w}x${h}:r=${fps},format=yuv420p,geq=lum='random(${semente})*255':cb=128:cr=128,` +
  'trim=end_frame=1,loop=loop=-1:size=1:start=0';

/**
 * Monta o pedaço de filtro que recebe [base] (a cena já com zoom, yuv420p, W x H)
 * e devolve [saida] com os efeitos por cima. Devolve null se não houver efeito.
 */
function filtroEfeitos({ W, H, fps, movimento }) {
  const ef = efeitosDoMovimento(movimento);
  if (!ef.algum) return null;
  const N = fps * SEGUNDOS;
  const partes = [];
  let atual = 'base';
  let n = 0;
  const somar = (camada, opacidade, modo = 'screen') => {
    const prox = `e${++n}`;
    // Só o brilho (c0) recebe o efeito; as cores (c1, c2) ficam da cena, senão tudo sai tingido
    partes.push(`[${atual}][${camada}]blend=c0_mode=${modo}:c0_opacity=${opacidade}:c1_mode=addition:c1_opacity=0:c2_mode=addition:c2_opacity=0:shortest=1[${prox}]`);
    atual = prox;
  };

  // Chuva: duas camadas de riscos caindo, uma rápida e fina (longe) e uma mais lenta e grossa (perto)
  const camadaChuva = (nome, { voltas, sv, sigma, dens = 1.5, semente }) => {
    // O borrão reduz a variação do ruído; o limiar é calculado em desvios-padrão para sempre sobrar uma fração de riscos
    const amostras = Math.max(1, 3.54 * sv) * Math.max(1, 3.54 * sigma);
    const dp = 73.6 / Math.sqrt(amostras);
    const limite = (127.5 + dens * dp).toFixed(1);
    const ganho = (255 / (1.8 * dp)).toFixed(1);
    partes.push(
      `${ruido(W, H, fps, semente)},split=3[${nome}1][${nome}2][${nome}3];[${nome}1][${nome}2][${nome}3]vstack=inputs=3,` +
        `gblur=sigma=${sigma}:sigmaV=${sv},crop=${W}:${H}:0:${H},` +
        `lutyuv=y='if(gt(val,${limite}),min(255,(val-${limite})*${ganho}),0)',split[${nome}a][${nome}b];` +
        `[${nome}a][${nome}b]vstack,crop=${W}:${H}:0:'${H}-mod(n*${((voltas * H) / N).toFixed(5)},${H})',format=yuv420p[${nome}]`
    );
  };
  if (ef.chuva) {
    camadaChuva('chL', { voltas: 34, sv: H * 0.035, sigma: 0.5, dens: 1.9, semente: 1 });
    camadaChuva('chP', { voltas: 20, sv: H * 0.06, sigma: 0.9, dens: 2.1, semente: 2 });
    somar('chL', 0.4);
    somar('chP', 0.5);
  }

  // Água caindo (cachoeira): riscos claros descendo, mais fracos
  if (ef.queda) {
    camadaChuva('qd', { voltas: 26, sv: H * 0.09, sigma: 1.1, dens: 1.4, semente: 5 });
    somar('qd', 0.35);
  }

  // Névoa: manchas claras e macias andando devagar de lado (vai e volta pelo espelho, sem costura)
  if (ef.nevoa) {
    partes.push(
      `${ruido(18, 10, fps, 3)},scale=${W}:${H}:flags=bicubic,gblur=sigma=${Math.round(H * 0.05)},` +
        `lutyuv=y='clip((val-96)*3,0,255)',split=3[nfa][nfb][nfc];` +
        `[nfb]hflip[nfbf];[nfa][nfbf][nfc]hstack=inputs=3,` +
        `crop=${W}:${H}:'mod(n*${((2 * W) / N).toFixed(5)},${2 * W})':0,format=yuv420p[nev]`
    );
    somar('nev', 0.12);
  }

  // Brilho na água / luz da lua: pontinhos que cintilam e deslizam devagar
  if (ef.brilho) {
    partes.push(
      `${ruido(W, H, fps, 4)},gblur=sigma=1.2,lutyuv=y='if(gt(val,150),min(255,(val-150)*7),0)',split=2[bra][brb];` +
        `[bra][brb]hstack,crop=${W}:${H}:'mod(n*${(W / N).toFixed(5)},${W})':0,format=yuv420p[bri]`
    );
    somar('bri', 0.5);
  }

  // Luz de fogo / lamparina: o brilho treme de leve
  if (ef.fogo) {
    const m = 20;
    const tremor = `0.03*(sin(2*PI*t*37/${m})+sin(2*PI*t*61/${m}+1)+sin(2*PI*t*23/${m}+2))`;
    partes.push(`[${atual}]eq=brightness='${tremor}':eval=frame[e${++n}]`);
    atual = `e${n}`;
  }

  // Relâmpago: clarões curtos e suaves (um duplo e dois simples) a cada 20 s
  if (ef.relampago) {
    const g = (ti, amp, larg) => `${amp}*exp(-pow((mod(t,${SEGUNDOS})-${ti})/${larg},2))`;
    const clarao = [g(3.4, 0.2, 0.09), g(9.2, 0.15, 0.07), g(9.6, 0.24, 0.1), g(15.8, 0.18, 0.08)].join('+');
    partes.push(`[${atual}]eq=brightness='${clarao}':eval=frame[e${++n}]`);
    atual = `e${n}`;
  }

  partes.push(`[${atual}]null[saida]`);
  return partes.join(';');
}

module.exports = { efeitosDoMovimento, filtroEfeitos, SEGUNDOS };
