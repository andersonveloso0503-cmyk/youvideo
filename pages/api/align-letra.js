export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audioUrl, letra } = req.body;
  if (!audioUrl) return res.status(400).json({ error: 'audioUrl é obrigatório (envie o áudio na etapa 1 primeiro)' });
  if (!letra || !letra.trim()) return res.status(400).json({ error: 'Letra da música é obrigatória' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY não configurada no Vercel' });
  }

  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error('Não foi possível baixar o áudio enviado pra transcrever');
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    const form = new FormData();
    form.append('file', new Blob([audioBuffer]), 'musica.mp3');
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('language', 'pt');

    const transRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: form,
    });
    const transData = await transRes.json();
    if (!transRes.ok) throw new Error(transData.error?.message || 'Erro ao transcrever o áudio no Groq');

    const transcritas = (transData.words || []).map((w) => ({
      texto: w.word,
      start: w.start,
      end: w.end,
    }));

    if (!transcritas.length) {
      throw new Error('O Whisper não conseguiu transcrever nenhuma palavra dessa música — verifique se o áudio subiu corretamente.');
    }

    const { palavrasComBloco, blocosBrutos } = separarBlocos(letra);
    const matches = alinharSequencias(palavrasComBloco, transcritas);
    const palavrasComTempo = preencherTimestamps(palavrasComBloco, transcritas, matches);
    const blocos = agruparBlocos(blocosBrutos, palavrasComTempo);

    return res.status(200).json({
      palavras: palavrasComTempo.map((p) => ({ texto: p.texto, start: p.start, end: p.end })),
      blocos,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Divide a letra em blocos usando as tags [Verse], [Chorus] etc. Palavras sem
// tag antes da primeira marcação caem num bloco "Trecho" inicial.
function separarBlocos(letraTexto) {
  const linhas = letraTexto.split('\n');
  const blocosBrutos = [];
  let blocoAtual = { tipo: 'Trecho', textoLinhas: [] };
  const palavrasComBloco = [];

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.trim();
    const tagMatch = linha.match(/^\[(.+)\]$/);
    if (tagMatch) {
      if (blocoAtual.textoLinhas.length) blocosBrutos.push(blocoAtual);
      blocoAtual = { tipo: tagMatch[1], textoLinhas: [] };
      continue;
    }
    if (!linha) continue;
    blocoAtual.textoLinhas.push(linha);
    for (const palavra of linha.split(/\s+/)) {
      if (palavra) palavrasComBloco.push({ texto: palavra, blocoIndex: blocosBrutos.length });
    }
  }
  if (blocoAtual.textoLinhas.length) blocosBrutos.push(blocoAtual);

  return { palavrasComBloco, blocosBrutos };
}

function normalizar(txt) {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Alinhamento por maior subsequência comum (LCS) entre as palavras da letra
// digitada e as palavras transcritas pelo Whisper — encontra a melhor
// correspondência mesmo quando o Whisper erra ou pula alguma palavra cantada.
function alinharSequencias(letraPalavras, transcritas) {
  const a = letraPalavras.map((p) => normalizar(p.texto));
  const b = transcritas.map((p) => normalizar(p.texto));
  const n = a.length;
  const m = b.length;

  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] && a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const matches = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] && a[i - 1] === b[j - 1]) {
      matches.unshift({ i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return matches;
}

// Preenche o timestamp de cada palavra da letra: usa o timestamp real da
// transcrição onde deu match, e interpola linearmente o tempo das palavras
// que ficaram sem correspondência, com base nas âncoras vizinhas.
function preencherTimestamps(letraPalavras, transcritas, matches) {
  const resultado = letraPalavras.map((p) => ({ texto: p.texto, start: null, end: null }));
  for (const { i, j } of matches) {
    resultado[i].start = transcritas[j].start;
    resultado[i].end = transcritas[j].end;
  }

  if (!matches.length) {
    // Nenhuma palavra bateu — cai pra uma divisão igual ao longo da duração
    // total transcrita, melhor do que travar o fluxo.
    const duracaoTotal = transcritas[transcritas.length - 1]?.end || resultado.length * 0.4;
    const passo = duracaoTotal / resultado.length;
    resultado.forEach((p, idx) => {
      p.start = passo * idx;
      p.end = passo * (idx + 1);
    });
    return resultado;
  }

  let idxAnterior = -1;
  for (let k = 0; k < resultado.length; k++) {
    if (resultado[k].start == null) continue;
    if (idxAnterior === -1 && k > 0) {
      const passo = resultado[k].start / (k + 1);
      for (let x = 0; x < k; x++) {
        resultado[x].start = passo * x;
        resultado[x].end = passo * (x + 1);
      }
    } else if (idxAnterior >= 0 && k - idxAnterior > 1) {
      const inicio = resultado[idxAnterior].end;
      const fim = resultado[k].start;
      const passo = (fim - inicio) / (k - idxAnterior);
      for (let x = idxAnterior + 1; x < k; x++) {
        resultado[x].start = inicio + passo * (x - idxAnterior - 1);
        resultado[x].end = inicio + passo * (x - idxAnterior);
      }
    }
    idxAnterior = k;
  }

  if (idxAnterior >= 0 && idxAnterior < resultado.length - 1) {
    const duracaoMedia = idxAnterior > 0 ? resultado[idxAnterior].end - resultado[idxAnterior].start : 0.3;
    let cursor = resultado[idxAnterior].end;
    for (let x = idxAnterior + 1; x < resultado.length; x++) {
      resultado[x].start = cursor;
      resultado[x].end = cursor + duracaoMedia;
      cursor = resultado[x].end;
    }
  }

  return resultado;
}

function agruparBlocos(blocosBrutos, palavrasComTempo) {
  let cursor = 0;
  return blocosBrutos.map((b) => {
    const qtd = b.textoLinhas.join(' ').split(/\s+/).filter(Boolean).length;
    const palavrasDoBloco = palavrasComTempo.slice(cursor, cursor + qtd);
    cursor += qtd;
    const inicio = palavrasDoBloco[0]?.start ?? 0;
    const fim = palavrasDoBloco[palavrasDoBloco.length - 1]?.end ?? inicio + 3;
    return { tipo: b.tipo, texto: b.textoLinhas.join('\n'), start: inicio, end: fim };
  });
}
