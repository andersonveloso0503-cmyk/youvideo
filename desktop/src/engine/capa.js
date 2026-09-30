// Capa chamativa para o YouTube: frase de efeito GRANDE (escrita pela IA) sobre a imagem do vídeo.
// A imagem pode ser "turbinada" pela Nano Banana (fal.ai): mais dramática, cores vivas, close no personagem.
// O texto é desenhado aqui (e não pela IA de imagem) para nunca sair com erro de português.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fal } = require('@fal-ai/client');
const { rodar, probe } = require('./ffmpeg');
const Central = require('./central');

const LIMITE = 2 * 1024 * 1024 - 60 * 1024; // YouTube aceita capa de até 2 MB

/** A IA escreve uma frase curta de impacto + a palavra que vai em destaque (amarelo). */
async function fraseDeEfeito(groqKey, { titulo, descricao }) {
  const reserva = () => {
    const VAZIAS = ['DE', 'DA', 'DO', 'DAS', 'DOS', 'NO', 'NA', 'NOS', 'NAS', 'EM', 'E', 'O', 'A', 'OS', 'AS', 'PARA', 'COM', 'UM', 'UMA', 'QUE'];
    let palavras = String(titulo || '').replace(/[#|—–\-:()[\]]/g, ' ').split(/\s+/).filter((w) => w.length > 1).slice(0, 4);
    while (palavras.length > 1 && VAZIAS.includes(palavras[palavras.length - 1].toUpperCase())) palavras = palavras.slice(0, -1);
    return { frase: palavras.join(' ').toUpperCase() || 'VEJA ISSO', destaque: (palavras[palavras.length - 1] || '').toUpperCase() };
  };
  if (!groqKey) return reserva();
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.8,
        response_format: { type: 'json_object' },
        ...(modelo.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
        messages: [
          {
            role: 'system',
            content:
              'Você cria o TEXTO DA CAPA (thumbnail) de vídeos do YouTube em português do Brasil, para canais cristãos e de música. ' +
              'Responda só JSON: {"frase": "...", "destaque": "..."}. ' +
              'frase: de 2 a 5 palavras, em CAIXA ALTA, frase de efeito que dá vontade de clicar (curiosidade, emoção, promessa), sem repetir o título inteiro, sem emoji, sem aspas, sem hashtag. ' +
              'Exemplos: "ELE NÃO DESISTIU", "DEUS OUVIU O CHORO", "O MILAGRE QUE NINGUÉM VIU", "1 HORA DE PAZ", "LOUVE ANTES DA VITÓRIA". ' +
              'destaque: UMA palavra da frase para ficar em amarelo (a mais forte).',
          },
          { role: 'user', content: `Título do vídeo: ${titulo || ''}\n${descricao ? `Descrição: ${String(descricao).slice(0, 600)}` : ''}` },
        ],
      }),
      signal: AbortSignal.timeout(40000),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq ${r.status}`);
    return JSON.parse(d.choices?.[0]?.message?.content || '{}');
  };
  try {
    let j;
    try {
      j = await pedir('openai/gpt-oss-120b');
    } catch {
      j = await pedir('llama-3.3-70b-versatile');
    }
    const frase = String(j.frase || '').replace(/["“”#]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().split(' ').slice(0, 6).join(' ');
    if (!frase) return reserva();
    const destaque = String(j.destaque || '').trim().toUpperCase();
    return { frase, destaque: frase.split(' ').includes(destaque) ? destaque : frase.split(' ').pop() };
  } catch {
    return reserva();
  }
}

/** Nano Banana: deixa a imagem mais dramática e chamativa (sem texto). Devolve o caminho ou null. */
async function turbinarImagem(falKey, arquivo, curto, destino) {
  if (!falKey) return null;
  try {
    fal.config({ credentials: falKey });
    const url = await fal.storage.upload(new Blob([fs.readFileSync(arquivo)], { type: 'image/jpeg' }));
    const r = await fal.subscribe('fal-ai/nano-banana/edit', {
      input: {
        prompt:
          'Transform this into an eye-catching YouTube thumbnail background: dramatic cinematic lighting, vivid saturated colors, ' +
          'strong emotion on the main character, move the camera closer to the main character, keep the same characters, setting and art style. ' +
          (curto ? 'Keep empty space in the upper third for big text. ' : 'Keep empty space on the lower part for big text. ') +
          'Do not add any text, letters, numbers, logos or watermarks.',
        image_urls: [url],
        num_images: 1,
        aspect_ratio: curto ? '9:16' : '16:9',
        output_format: 'jpeg',
      },
      logs: false,
    });
    const img = r?.data?.images?.[0]?.url || r?.images?.[0]?.url;
    if (!img) return null;
    return await Central.baixar(img, destino);
  } catch {
    return null; // sem crédito / fora do ar: segue com a imagem original
  }
}

function montarAss({ W, H, frase, destaque, curto }) {
  const tam = Math.round(curto ? W * 0.17 : H * 0.16);
  const contorno = Math.max(6, Math.round(tam / 9));
  const sombra = Math.max(3, Math.round(tam / 18));
  const palavras = frase.split(' ');
  const texto = palavras.map((p) => (p === destaque ? `{\\c&H0AD6FF&}${p}{\\c&HFFFFFF&}` : p)).join(' ');
  // Short: texto no terço de cima, centralizado. Longo: embaixo à esquerda.
  const alinhamento = curto ? 8 : 1;
  const margemV = Math.round(curto ? H * 0.12 : H * 0.07);
  const margemL = Math.round(W * (curto ? 0.05 : 0.05));
  const margemR = Math.round(W * (curto ? 0.05 : 0.3));
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Capa,Montserrat ExtraBold,${tam},&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,${contorno},${sombra},${alinhamento},${margemL},${margemR},${margemV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Dialogue: 0,0:00:00.00,0:00:05.00,Capa,,0,0,0,,{\\q0}${texto}`,
  ].join('\n');
}

/**
 * Gera a capa. base = imagem ou vídeo (pega um quadro). Devolve o caminho do JPG (até 2 MB).
 * opcoes: { groqKey, falKey, usarIa, titulo, descricao, curto, fontsDir, destino }
 */
async function gerarCapaChamativa(base, opcoes) {
  const { groqKey, falKey, usarIa = true, titulo, descricao, curto = false, fontsDir, destino } = opcoes;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'youvideo-capa-'));
  try {
    const [W, H] = curto ? [1080, 1920] : [1280, 720];
    // 1) Imagem de partida (se for vídeo, um quadro a ~15%)
    let img = path.join(dir, 'base.jpg');
    const info = await probe(base).catch(() => ({ duracao: 0 }));
    const ehVideo = info.duracao > 1;
    const entrada = ehVideo ? ['-ss', Math.min(60, Math.max(1, info.duracao * 0.15)).toFixed(2), '-i', base] : ['-i', base];
    await rodar([...entrada, '-frames:v', '1', '-q:v', '2', img]).promise;

    // 2) Nano Banana (opcional) e a frase, ao mesmo tempo
    const [turbinada, { frase, destaque }] = await Promise.all([
      usarIa ? turbinarImagem(falKey, img, curto, path.join(dir, 'ia.jpg')) : Promise.resolve(null),
      fraseDeEfeito(groqKey, { titulo, descricao }),
    ]);
    if (turbinada) img = turbinada;

    // 3) Monta: enquadra, realça cores e escreve a frase
    fs.writeFileSync(path.join(dir, 'capa.ass'), montarAss({ W, H, frase, destaque, curto }));
    const fontes = path.join(dir, 'fonts');
    fs.mkdirSync(fontes);
    for (const f of fs.readdirSync(fontsDir)) fs.copyFileSync(path.join(fontsDir, f), path.join(fontes, f));
    const filtro = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,eq=contrast=1.08:saturation=1.25,vignette=PI/5,ass=capa.ass:fontsdir=fonts`;
    for (const q of [2, 4, 7, 11]) {
      await rodar(['-loop', '1', '-t', '1', '-i', path.basename(img) === 'base.jpg' ? 'base.jpg' : img, '-vf', filtro, '-frames:v', '1', '-q:v', String(q), '-y', 'capa.jpg'], { cwd: dir }).promise;
      if (fs.statSync(path.join(dir, 'capa.jpg')).size <= LIMITE) break;
    }
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(path.join(dir, 'capa.jpg'), destino);
    return { arquivo: destino, frase, turbinada: !!turbinada };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { gerarCapaChamativa, fraseDeEfeito };
