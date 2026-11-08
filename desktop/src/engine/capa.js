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
async function fraseDeEfeito(groqKey, { titulo, descricao, estilo = '' }) {
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
            content: estilo === 'politica'
              ? 'Você cria o TEXTO DA CAPA (thumbnail) de Shorts de um canal brasileiro IMPARCIAL de notícias de política. ' +
                'Responda só JSON: {"frase": "...", "destaque": "..."}. ' +
                'frase: de 2 a 4 palavras em CAIXA ALTA no formato QUEM + O FATO FORTE: primeiro o nome curto de quem (pessoa, órgão ou assunto), por último a palavra mais forte (o verbo ou o fato). ' +
                'Bons: "PEÑA RENUNCIA", "STF BARRA BETS", "LULA PERDE NO SENADO", "BOLSONARO CONDENADO?", "FIM DA ESCALA 6X1?". Ruins (genéricos, sem assunto): "O QUE MUDA?", "VEJA ISSO". ' +
                'Gramática perfeita em português (acentos certos); nomes estrangeiros com a grafia original (Peña, Milei). ' +
                'Nunca acuse, nunca chame ninguém de nada, nunca afirme algo que não está no título; sem emoji, sem aspas, sem nome de partido. ' +
                'destaque: a ÚLTIMA palavra da frase (com a pontuação, se houver), que vai sozinha na 2ª linha, grande e em amarelo.'
              : estilo === 'games'
              ? 'Você cria o TEXTO DA CAPA (thumbnail) de Shorts de um canal brasileiro de notícias de GAMES. ' +
                'Responda só JSON: {"frase": "...", "destaque": "..."}. ' +
                'frase: de 2 a 4 palavras em CAIXA ALTA que cria CURIOSIDADE e diz o assunto (jogo ou fato): a pessoa precisa assistir para saber. ' +
                'Bons: "GTA 6 NO PS4?", "ZELDA MUDOU TUDO", "GRÁTIS NO XBOX!", "SUPER SAIYAJIN DEUS", "O FIM DO FORTNITE?". Ruins (genéricos): "VALE A PENA?", "VEJA ISSO". ' +
                'Use o nome curto do jogo só se couber (máx. 4 palavras no total); sem emoji, sem aspas. ' +
                'destaque: a ÚLTIMA palavra da frase (com a pontuação), que vai sozinha embaixo, grande e em amarelo.'
              :
              'Você cria o TEXTO DA CAPA (thumbnail) de vídeos do YouTube em português do Brasil, para canais cristãos e de música. ' +
              'Responda só JSON: {"frase": "...", "destaque": "..."}. ' +
              'frase: de 2 a 5 palavras, em CAIXA ALTA, frase de efeito que dá vontade de clicar (curiosidade, emoção, promessa), sem repetir o título inteiro, sem emoji, sem aspas, sem hashtag. ' +
              'Em vídeos de HISTÓRIA BÍBLICA (não música/oração), prefira uma PERGUNTA curta ou um segredo que só o vídeo responde, ligado ao título: "ONDE ELE ESTAVA?", "O QUE ELES VIRAM?", "3 DIAS DE SILÊNCIO", "ELE NEGOU 3 VEZES". ' +
              'Exemplos para música/oração: "DEUS OUVIU O CHORO", "1 HORA DE PAZ", "LOUVE ANTES DA VITÓRIA". ' +
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
    const frase = String(j.frase || '').replace(/["“”#]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().split(' ').slice(0, estilo ? 5 : 6).join(' ');
    if (!frase) return reserva();
    const destaque = String(j.destaque || '').trim().toUpperCase();
    return { frase, destaque: frase.split(' ').includes(destaque) ? destaque : frase.split(' ').pop() };
  } catch {
    return reserva();
  }
}

/** Nano Banana: deixa a imagem mais dramática e chamativa (sem texto). Devolve o caminho ou null. */
async function turbinarImagem(falKey, arquivo, curto, destino, estilo = '', contexto = '') {
  if (!falKey) return null;
  try {
    fal.config({ credentials: falKey });
    const url = await fal.storage.upload(new Blob([fs.readFileSync(arquivo)], { type: 'image/jpeg' }));
    const r = await fal.subscribe('fal-ai/nano-banana/edit', {
      input: {
        prompt: (estilo === 'games'
          ? 'This is OFFICIAL key art of a video game. Make it an eye-catching YouTube thumbnail: zoom in so the main character is BIG, ' +
            'close and filling most of the frame (face and upper body clearly visible), vivid saturated colors, strong contrast, slightly darker blurred background. ' +
            'Keep the characters, their faces, outfits and the art style EXACTLY as in the image; do not invent new characters. '
          : estilo === 'politica'
          ? 'Turn this photo into a vertical news-channel thumbnail. The main subject is what the photo shows: ' +
            'IF it is a person, this is a REAL person: keep the face, identity, age, hair, expression and clothes EXACTLY as in the photo, and frame them centered, from the chest up, BIG (head and shoulders filling the middle of the frame). ' +
            'IF it is an object, building or place, keep it real and recognizable and make it BIG and centered, filling the middle of the frame. Sharp and detailed. ' +
            `Background: a dark navy official backdrop, softly out of focus, with the national flag of the country of this news (news title: "${String(contexto || '').slice(0, 120)}") draped at the side. ` +
            'Cinematic lighting, rich contrast, serious tone. Do not invent an event: no crowds, no other people, no podium signs. '
          : 'Transform this into an eye-catching YouTube thumbnail background: dramatic cinematic lighting, vivid saturated colors, ' +
            'strong emotion on the main character, move the camera closer to the main character, keep the same characters, setting and art style. ') +
          (estilo === 'games' ? 'Put the character face in the upper and middle part; keep the lower quarter simpler for big text. '
            : estilo === 'politica' ? 'Keep the top 28% of the image as plain dark backdrop (no face there) for big text. '
            : curto ? 'Keep empty space in the upper third for big text. ' : 'Keep empty space on the lower part for big text. ') +
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

/** Política/games (Short): pergunta em 2 linhas no alto — linha de cima branca, a palavra forte embaixo, maior e amarela. */
// Games: como as capas que mais bombam (Goku "SUPER SAIYAJIN DEUS", Zelda "25 MUDANÇAS"): personagem enorme em cima
// e o texto EMBAIXO, todo amarelo, contorno preto grosso e um pouquinho inclinado.
function montarAssDuasLinhas({ W, H, frase, destaque, embaixo = false }) {
  const palavras = frase.split(' ');
  let i = palavras.lastIndexOf(destaque);
  if (i < 0) i = palavras.length - 1;
  // palavra forte muito curta ("2!", "GTA?") leva a anterior junto: "SWITCH 2!"
  const ini = i > 0 && palavras[i].replace(/[^\p{L}\p{N}]/gu, '').length <= 3 ? i - 1 : i;
  let cima = palavras.slice(0, ini).concat(palavras.slice(i + 1)).join(' ');
  let baixo = palavras.slice(ini, i + 1).join(' ');
  if (palavras.length > 2) {
    // Games: duas linhas do mesmo tamanho (as duas grandes), quebrando no meio da frase
    let melhor = 1;
    for (let k = 1; k < palavras.length; k++) {
      const dif = (k2) => Math.abs(palavras.slice(0, k2).join(' ').length - palavras.slice(k2).join(' ').length);
      if (dif(k) < dif(melhor)) melhor = k;
    }
    cima = palavras.slice(0, melhor).join(' ');
    baixo = palavras.slice(melhor).join(' ');
  }
  // tamanho pela largura: Montserrat ExtraBold em caixa alta ocupa ~0,5 do tamanho por letra
  const caber = (t, max) => Math.round(Math.min(max, (W * 0.9) / Math.max(2, t.length * 0.52)));
  const tamCima = caber(cima, W * 0.26);
  const tamBaixo = caber(baixo, W * 0.3);
  const alturaTexto = (cima ? Math.round(tamCima * 1.05) : 0) + tamBaixo;
  const topo = embaixo ? Math.round(H * 0.86) - alturaTexto : Math.round(H * 0.1);
  const linhaBaixo = topo + Math.round(tamCima * 1.05);
  const sombraAlta = Math.round(H * 0.42);
  const corCima = '&H00FFFFFF'; // duas cores: 1ª linha BRANCA, 2ª AMARELA
  const borda = (t) => Math.max(embaixo ? 8 : 5, Math.round(t / (embaixo ? 7 : 10)));
  const giro = embaixo ? '\\frz3' : '';
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Cima,Montserrat ExtraBold,${tamCima},${corCima},&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,${borda(tamCima)},${Math.max(3, Math.round(tamCima / 16))},8,0,0,0,1`,
    `Style: Baixo,Montserrat ExtraBold,${tamBaixo},&H0012C8FF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,${borda(tamBaixo)},${Math.max(3, Math.round(tamBaixo / 16))},8,0,0,0,1`,
    `Style: Sombra,Arial,10,&H00000000,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    // sombra escura e suave no alto (o texto lê em qualquer foto)
    embaixo
      ? `Dialogue: 0,0:00:00.00,0:00:05.00,Sombra,,0,0,0,,{\\pos(0,${H - sombraAlta + Math.round(H * 0.08)})\\1a&H50&\\blur${Math.round(H * 0.06)}\\p1}m 0 0 l ${W} 0 ${W} ${sombraAlta} 0 ${sombraAlta}{\\p0}`
      : `Dialogue: 0,0:00:00.00,0:00:05.00,Sombra,,0,0,0,,{\\pos(0,${-Math.round(H * 0.08)})\\1a&H50&\\blur${Math.round(H * 0.06)}\\p1}m 0 0 l ${W} 0 ${W} ${sombraAlta} 0 ${sombraAlta}{\\p0}`,
    ...(cima ? [`Dialogue: 1,0:00:00.00,0:00:05.00,Cima,,0,0,0,,{\\an8\\pos(${W / 2},${topo})${giro}\\q2}${cima}`] : []),
    `Dialogue: 1,0:00:00.00,0:00:05.00,Baixo,,0,0,0,,{\\an8\\pos(${W / 2},${cima ? linhaBaixo : topo})${giro}\\q2}${baixo}`,
  ].join('\n');
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
 * opcoes: { groqKey, falKey, usarIa, titulo, descricao, curto, fontsDir, destino, frase?, destaque?, suave? }
 * frase/destaque já prontos pulam a IA do texto; suave = cores naturais, sem vinheta (vídeos de dormir/relaxar).
 */
async function gerarCapaChamativa(base, opcoes) {
  const { groqKey, falKey, usarIa = true, titulo, descricao, curto = false, fontsDir, destino, suave = false, estilo = '' } = opcoes;
  const fraseFixa = String(opcoes.frase || '').trim().toUpperCase();
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
      usarIa ? turbinarImagem(falKey, img, curto, path.join(dir, 'ia.jpg'), estilo, titulo) : Promise.resolve(null),
      fraseFixa
        ? Promise.resolve({ frase: fraseFixa, destaque: String(opcoes.destaque || '').trim().toUpperCase() || fraseFixa.split(' ').pop() })
        : fraseDeEfeito(groqKey, { titulo, descricao, estilo }),
    ]);
    if (turbinada) img = turbinada;

    // 3) Monta: enquadra, realça cores e escreve a frase
    const duasLinhas = curto && (estilo === 'politica' || estilo === 'games');
    fs.writeFileSync(path.join(dir, 'capa.ass'), duasLinhas ? montarAssDuasLinhas({ W, H, frase, destaque, embaixo: estilo === 'games' }) : montarAss({ W, H, frase, destaque, curto }));
    const fontes = path.join(dir, 'fonts');
    fs.mkdirSync(fontes);
    for (const f of fs.readdirSync(fontsDir)) fs.copyFileSync(path.join(fontsDir, f), path.join(fontes, f));
    const filtro = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,${suave ? 'eq=contrast=1.04:saturation=1.12' : duasLinhas ? 'eq=contrast=1.1:saturation=1.12,vignette=PI/4.5' : 'eq=contrast=1.08:saturation=1.25,vignette=PI/5'},ass=capa.ass:fontsdir=fonts`;
    // Games com imagem DEITADA (cena do jogo, sem a arte do personagem): a imagem aparece GRANDE e INTEIRA num quadro
    // na parte de cima, com ela mesma desfocada atrás — em vez de cortar as laterais e sobrar só o meio
    const dimImg = await probe(img).catch(() => null);
    const deitada = curto && estilo === 'games' && dimImg?.largura && dimImg?.altura && dimImg.largura > dimImg.altura * 1.15;
    const altQ = Math.round(H * 0.4);
    const filtroB = `[0]split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:2,eq=brightness=-0.22:saturation=1.2[bg];` +
      `[b]scale=-2:${altQ},crop='min(iw,${W - 40})':${altQ},eq=contrast=1.08:saturation=1.25,pad=iw+12:ih+12:6:6:color=white[fg];` +
      `[bg][fg]overlay=(W-w)/2:${Math.round(H * 0.13)},setsar=1,ass=capa.ass:fontsdir=fonts[o]`;
    for (const q of [2, 4, 7, 11]) {
      const ent = path.basename(img) === 'base.jpg' ? 'base.jpg' : img;
      await rodar(['-loop', '1', '-t', '1', '-i', ent, ...(deitada ? ['-filter_complex', filtroB, '-map', '[o]'] : ['-vf', filtro]), '-frames:v', '1', '-q:v', String(q), '-y', 'capa.jpg'], { cwd: dir }).promise;
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
