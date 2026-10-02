// Estúdio de Música → plataformas de streaming (Spotify, Deezer, Apple Music... via distribuidora).
// Tudo aqui roda no navegador: avalia se a música está pronta e monta o pacote para subir.

const GENERICOS = /^(nova m[uú]sica|m[uú]sica|sem t[ií]tulo|untitled|medley)\b/i;

const normal = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Chave que junta as versões da mesma música (mesma criação ou mesmo título). */
export function chaveMusica(m) {
  return normal(m.titulo).replace(/\b(v|versao)\s*\d+\b/g, '').trim() || m.grupoId || m.id;
}

/** Entre as versões da mesma música, qual é a escolhida: a favorita ★ ou, se nenhuma, a mais nova. */
export function escolhidas(musicas) {
  const grupos = {};
  for (const m of musicas) {
    if (m.tipo === 'medley') continue;
    const k = chaveMusica(m);
    (grupos[k] = grupos[k] || []).push(m);
  }
  const ids = new Set();
  const qtd = {};
  for (const [k, lista] of Object.entries(grupos)) {
    const fav = lista.filter((x) => x.favorito);
    const base = fav.length ? fav : lista;
    const melhor = [...base].sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))[0];
    ids.add(melhor.id);
    qtd[k] = lista.length;
  }
  return { ids, qtd };
}

/**
 * Avalia uma música para as plataformas. Devolve { nota, pronta, itens: [{ ok, texto }] }.
 * escolha = resultado de escolhidas(todas)
 */
export function avaliarStreaming(m, escolha) {
  const itens = [];
  let nota = 100;
  const add = (ok, texto, perde = 0) => {
    itens.push({ ok, texto });
    if (!ok) nota -= perde;
  };

  if (m.tipo === 'medley') add(false, 'Medley: as plataformas preferem músicas soltas (lance as faixas separadas)', 45);
  if (m.motor === 'elevenlabs') add(true, 'Feita na ElevenLabs (uso comercial liberado no plano pago)');
  else if (m.motor === 'suno') add(true, 'Feita no Suno: só distribua se ela foi criada com o plano PAGO ativo (as do plano grátis não podem ser vendidas)');
  else if (m.motor === 'nuivi') add(true, 'Feita no Nuivi: confira se o seu plano de lá libera uso comercial');
  else if (m.motor === 'outra') add(true, 'Importada: confirme que você tem os direitos para distribuir');
  else if (m.motor === 'lyria') add(true, 'Feita no Google Lyria (uso comercial permitido pela API paga do Google; a faixa leva uma marca invisível de IA — declare que é IA)');

  const d = Number(m.duracaoSeg) || 0;
  if (d >= 120 && d <= 330) add(true, `Duração boa (${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')})`);
  else if (d < 90) add(false, 'Muito curta (menos de 1:30) — as plataformas e o público preferem 2 a 4 minutos', 40);
  else if (d < 120) add(false, 'Um pouco curta (ideal 2 a 4 minutos)', 10);
  else add(false, 'Longa (mais de 5:30) — ok, mas músicas de 2 a 4 minutos rendem mais', 10);

  if (!m.instrumental) {
    const linhas = String(m.letra || '').split('\n').filter((l) => l.trim() && !/^\s*\[.*\]\s*$/.test(l));
    if (linhas.length >= 8) add(true, 'Tem letra completa (vai na ficha)');
    else add(false, 'Sem letra salva — as plataformas pedem a letra', 15);
  } else add(true, 'Instrumental');

  if (!m.titulo || GENERICOS.test(m.titulo.trim())) add(false, 'Título genérico — dê um nome de verdade (✎ Renomear)', 15);
  else add(true, `Título: "${m.titulo}"`);

  if (m.tipo !== 'medley' && escolha) {
    const k = chaveMusica(m);
    const n = escolha.qtd[k] || 1;
    if (n > 1) {
      if (escolha.ids.has(m.id)) add(true, `Escolhida entre ${n} versões${m.favorito ? ' (★ favorita)' : ' (a mais nova — marque ★ na sua preferida)'}`);
      else add(false, `Existe outra versão desta música escolhida — distribua só uma (versões repetidas contam como spam)`, 35);
    }
  }
  if (m.capaUrl) add(true, 'Tem capa (vai em 1400×1400 para a Somvibe e em 3000×3000) — o texto da capa precisa ser igual ao título');
  else add(false, 'Sem capa — ao preparar, a capa é criada', 5);

  nota = Math.max(0, nota);
  return { nota, pronta: nota >= 80, itens };
}

/** Letra sem as marcações [Verse], [Chorus]... (formato que as plataformas pedem). */
export function letraLimpa(letra) {
  return String(letra || '')
    .split('\n')
    .filter((l) => !/^\s*\[.*\]\s*$/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Converte o áudio (mp3) em WAV 44,1 kHz 16 bits estéreo, o formato preferido das distribuidoras. */
export async function paraWav(arrayBuffer) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const dec = await ctx.decodeAudioData(arrayBuffer.slice(0));
  ctx.close?.();
  const taxa = 44100;
  const off = new OfflineAudioContext(2, Math.ceil(dec.duration * taxa), taxa);
  const src = off.createBufferSource();
  src.buffer = dec;
  src.connect(off.destination);
  src.start();
  const buf = await off.startRendering();
  const n = buf.length;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const txt = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  txt(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, taxa, true); out.setUint32(28, taxa * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
  txt(36, 'data'); out.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const c of [L[i], R[i]]) {
      const v = Math.max(-1, Math.min(1, c));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out.buffer);
}

/** Capa quadrada 3000×3000 (JPG) a partir da capa da música. */
export function capa3000(url) {
  return capaQuadrada(url, 3000);
}

/** Capa quadrada (JPG) no tamanho pedido: a Somvibe só aceita 1400×1400; outras distribuidoras pedem 3000×3000. */
export function capaQuadrada(url, tamanho) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = tamanho;
        c.height = tamanho;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        const lado = Math.min(img.naturalWidth, img.naturalHeight);
        g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, tamanho, tamanho);
        c.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('capa'))), 'image/jpeg', 0.92);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Não consegui abrir a capa'));
    img.src = url;
  });
}

/** Ficha com tudo que a distribuidora pede no cadastro (no formato que a análise da Somvibe aprovou em 02/10/2026). */
export function ficha(m, { artista, compositor, genero }) {
  const pessoa = compositor || artista;
  const ano = new Date().getFullYear();
  return [
    'FICHA PARA A DISTRIBUIDORA (do jeito que a análise da Somvibe aprovou — serve para as outras também)',
    '',
    `Título da faixa: ${m.titulo}`,
    `Intérprete (Artista Principal): ${artista}`,
    `Compositor (Composer): ${pessoa}`,
    `Produtor (Producer): ${pessoa}`,
    `Gênero: ${genero || '(escolha na lista da distribuidora)'}`,
    `Idioma: ${m.idioma === 'en' ? 'Inglês' : 'Português (Brasil)'}`,
    'Conteúdo explícito: Não',
    `Instrumental: ${m.instrumental ? 'Sim' : 'Não'}`,
    `Duração: ${Math.floor((m.duracaoSeg || 0) / 60)}:${String(Math.round((m.duracaoSeg || 0) % 60)).padStart(2, '0')}`,
    'UPC e ISRC: "Não tenho, quero que gere para mim"',
    `Ano e titular (Copyright ©): ${ano} · ${pessoa}`,
    `Selo: ${pessoa}`,
    'Feita com IA: SIM (' + ({ lyria: 'Google Lyria', suno: 'Suno', nuivi: 'Nuivi', outra: 'outra ferramenta' }[m.motor] || 'ElevenLabs Music') + ') — composição original, não é cover.',
    '  Se o cadastro tiver um campo próprio para declarar IA, marque lá.',
    '',
    'Arquivos deste pacote:',
    '- audio.wav  → suba este (WAV 44,1 kHz 16 bits)',
    '- audio.mp3  → reserva, se pedirem MP3',
    '- capa-1400.jpg → capa para a Somvibe (ela só aceita 1400×1400)',
    '- capa-3000.jpg → capa 3000×3000, para distribuidoras que pedem esse tamanho',
    '- letra.txt  → cole no campo de letra',
    '',
    'O que a análise da Somvibe recusa (já aconteceu):',
    '- "Inteligência Artificial" escrito no campo Compositor: deixe só o seu nome.',
    '- Nome repetido ou escrito errado em Compositor/Produtor.',
    '- Texto da capa diferente do título da música (tem que ser igual, letra por letra).',
    '- Selo com termo de propaganda (ex.: "Aqui Tem") ou igual ao nome do intérprete.',
    'Se reprovar, o motivo aparece nos avisos da Somvibe ("Falha no envio | Revise seu single").',
    '',
    'Dicas: use sempre o mesmo nome de intérprete por ritmo; lance 1 música por semana por intérprete',
    '(ou um EP de 3 a 5); mínimo de 60 s, ideal de 2 a 3:30; não suba versões quase iguais;',
    'nada de voz parecida com artista real. No preview do TikTok, pause no refrão e clique em Salvar Preview.',
  ].join('\n');
}
