// Estúdio de Música — plano para aumentar uma música (usado por pages/api/estudio/aumentar.js).
// Funções puras: dá para testar sem chamar a ElevenLabs.

// ───────── Montagem do plano ─────────

const ehRefrao = (t) => /\[(?:[^\]]*)(chorus|refr[aã]o|hook)/i.test(t || '');
const ehEstrofe = (t) => /\[(?:[^\]]*)(verse|estrofe|verso)/i.test(t || '');
const ehFinal = (t) => /\[(?:[^\]]*)(outro|ending|final|coda)/i.test(t || '');

/** Partes da letra salva no Estúdio: [{ tag, texto }] */
export function partesDaLetra(letra) {
  const partes = [];
  let atual = null;
  for (const linha of String(letra || '').split('\n')) {
    const l = linha.trim();
    if (/^\[.+\]$/.test(l)) { atual = { tag: l, linhas: [] }; partes.push(atual); } else if (l && atual) atual.linhas.push(l);
    else if (l) { atual = { tag: '[Verse]', linhas: [l] }; partes.push(atual); }
  }
  return partes.filter((p) => p.linhas.length).map((p) => ({ tag: p.tag, texto: `${p.tag}\n${p.linhas.join('\n')}` }));
}

/**
 * Plano de extensão: mantém o áudio original até o ponto de corte e gera o resto.
 * trechos = partes do plano extraído pela ElevenLabs, com início e fim em ms (pode vir vazio).
 */
export function montarPlano({ songId, totalMs, trechos, letra, estilo, instrumental, extraSeg }) {
  const extraMs = Math.max(20, Math.min(120, extraSeg)) * 1000;
  const ultimo = trechos[trechos.length - 1];
  // O encerramento original é refeito depois do trecho novo, senão a música "acaba e recomeça"
  let corte;
  let textoFinal = '[Outro]';
  let durFinal = 10000;
  if (ultimo && trechos.length > 1 && (ehFinal(ultimo.text) || ultimo.fim - ultimo.inicio <= 20000)) {
    corte = ultimo.inicio;
    textoFinal = ultimo.text && ehFinal(ultimo.text) ? ultimo.text : '[Outro]';
    durFinal = Math.max(6000, Math.min(20000, ultimo.fim - ultimo.inicio));
  } else {
    corte = Math.max(3000, totalMs - 5000);
  }
  const mantidos = trechos.filter((t) => t.fim <= corte + 50);
  const estilosBase = String(estilo || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
  const fatia = (ini, fim) => ({ song_id: songId, range: { start_ms: Math.max(0, Math.round(fim - Math.min(30000, fim - ini))), end_ms: Math.round(fim) } });
  const fimDoMantido = fatia(Math.max(0, corte - 30000), corte);

  const refraoOrig = [...mantidos].reverse().find((t) => ehRefrao(t.text));
  const estrofeOrig = mantidos.find((t) => ehEstrofe(t.text));
  const partes = partesDaLetra(letra);
  const refraoLetra = [...partes].reverse().find((p) => ehRefrao(p.tag));
  const estrofeLetra = partes.find((p) => ehEstrofe(p.tag));

  const novo = (texto, durMs, ref, estilos) => ({
    text: texto,
    duration_ms: Math.max(3000, Math.min(120000, Math.round(durMs))),
    positive_styles: (estilos && estilos.length ? estilos : estilosBase).slice(0, 20),
    negative_styles: [],
    context_adherence: 'high',
    conditioning_ref: ref,
    condition_strength: 'high',
  });
  const refDe = (t) => (t ? fatia(t.inicio, t.fim) : fimDoMantido);

  const gerados = [];
  const cantados = []; // texto que entra na letra da versão nova
  const semVoz = instrumental || (!refraoLetra && !estrofeLetra && !/\n\s*\S/.test(`${refraoOrig?.text || ''}${estrofeOrig?.text || ''}`));
  if (semVoz) {
    gerados.push(novo('[Instrumental]\n{the band develops the main theme, same groove and instruments}', extraMs, fimDoMantido));
  } else {
    // A letra salva no Estúdio é a de verdade; o texto que a ElevenLabs extrai do áudio só entra se trouxer letra
    const comLetra = (t) => (t && t.split('\n').filter((l) => l.trim()).length > 1 ? t : '');
    const refraoTxt = refraoLetra?.texto || comLetra(refraoOrig?.text) || '';
    const estrofeTxt = estrofeLetra?.texto || comLetra(estrofeOrig?.text) || '';
    let resto = extraMs;
    if (extraMs >= 85000) {
      gerados.push(novo('[Instrumental solo]\n{melodic instrumental solo over the chorus chords}', 18000, fimDoMantido));
      resto -= 18000;
    }
    if (extraMs >= 50000 && estrofeTxt && refraoTxt) {
      gerados.push(novo(estrofeTxt, resto / 2, refDe(estrofeOrig), estrofeOrig?.positive_styles));
      cantados.push(estrofeTxt);
      resto /= 2;
    }
    const principal = refraoTxt || estrofeTxt;
    gerados.push(novo(principal, resto, refDe(refraoOrig || estrofeOrig), (refraoOrig || estrofeOrig)?.positive_styles));
    cantados.push(principal);
  }
  gerados.push(novo(textoFinal, durFinal, fimDoMantido, ultimo?.positive_styles));

  return {
    plano: { chunks: [...mantidosEmPedacos(songId, Math.round(corte)), ...gerados] },
    corteMs: Math.round(corte),
    novoTotalMs: Math.round(corte + gerados.reduce((s, g) => s + g.duration_ms, 0)),
    letraExtra: cantados.join('\n\n'),
  };
}

// Cada parte do plano aceita no máximo 120 s: um trecho mantido maior que isso vai em pedaços seguidos
function mantidosEmPedacos(songId, corteMs) {
  if (corteMs <= 120000) return [{ song_id: songId, range: { start_ms: 0, end_ms: corteMs } }];
  const n = Math.ceil(corteMs / 110000);
  const passo = Math.ceil(corteMs / n);
  const pedacos = [];
  for (let ini = 0; ini < corteMs; ini += passo) pedacos.push({ song_id: songId, range: { start_ms: ini, end_ms: Math.min(corteMs, ini + passo) } });
  return pedacos;
}

/** Partes do plano extraído, com início e fim acumulados */
export function trechosDoPlano(plano) {
  const lista = Array.isArray(plano?.chunks) ? plano.chunks : [];
  let t = 0;
  return lista.filter((c) => c && c.duration_ms > 0).map((c) => {
    const inicio = t;
    t += c.duration_ms;
    return { ...c, inicio, fim: t };
  });
}
