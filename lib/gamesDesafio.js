// "Desafio da semana" do Próxima Fase: Short "Adivinhe o jogo pela imagem".
// 5 rodadas: a imagem OFICIAL do jogo aparece pixelada, contagem, e a resposta com a imagem nítida.
// A pessoa fica até o fim para ver se acertou e comenta o placar ("acertei 4 de 5!").
// As imagens são as mesmas oficiais de sempre (IGDB/Steam, lib/games.js); a versão pixelada é feita aqui e guardada no Blob.
import crypto from 'crypto';
import jpeg from 'jpeg-js';
import { ia } from './gamesNoticias';
import { midiasDoJogo } from './games';

const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';
const RODADAS = 5;
// Fica mais difícil a cada rodada: blocos maiores (largura / N)
const DIFICULDADE = [46, 38, 31, 25, 20];
const NUMEROS = ['um', 'dois', 'três', 'quatro', 'cinco'];

/** Baixa a imagem (JPEG) e devolve uma versão pixelada (blocos de largura/divisor). */
async function pixelar(url, divisor) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`imagem ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const { width: w, height: h, data } = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024 });
  const bloco = Math.max(8, Math.round(w / divisor));
  for (let y0 = 0; y0 < h; y0 += bloco) {
    for (let x0 = 0; x0 < w; x0 += bloco) {
      const y1 = Math.min(h, y0 + bloco);
      const x1 = Math.min(w, x0 + bloco);
      let rs = 0, gs = 0, bs = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          rs += data[i];
          gs += data[i + 1];
          bs += data[i + 2];
          n++;
        }
      }
      const [rm, gm, bm] = [rs / n, gs / n, bs / n];
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          data[i] = rm;
          data[i + 1] = gm;
          data[i + 2] = bm;
        }
      }
    }
  }
  return Buffer.from(jpeg.encode({ data, width: w, height: h }, 88).data);
}

async function guardar(jpg, nome) {
  const { put } = await import('@vercel/blob');
  const blob = await put(`desafio-${nome}-${Date.now()}.jpg`, jpg, { access: 'public', contentType: 'image/jpeg', token: process.env.MEDIA_READ_WRITE_TOKEN });
  return blob.url;
}

/**
 * Escreve o desafio da semana. jaUsados = nomes de jogos dos desafios anteriores (não repete).
 * Devolve { ep, jogos } no formato das outras notícias de games (vai para a Fábrica com desafio: true).
 */
export async function roteiroDesafio(jaUsados = []) {
  const j = await ia(
    'Você monta o "Desafio da semana" do canal brasileiro de games "Próxima Fase": um Short "Adivinhe o jogo pela imagem". ' +
      'Escolha 9 jogos MUITO conhecidos pelo público brasileiro, misturando épocas (anos 90, 2000, 2010 e atuais) e plataformas, ' +
      'com bastante NOSTALGIA (PS1, PS2, Nintendo 64, Super Nintendo, Xbox 360) e alguns atuais famosos. Nada de jogo de nicho. ' +
      'Ordem: do mais fácil para o mais difícil. Use o nome OFICIAL em inglês, como aparece no IGDB ou na Steam (ex.: "The Legend of Zelda: Ocarina of Time", "God of War II", "Grand Theft Auto: San Andreas"). ' +
      'Para cada jogo, "dica": uma dica curta em português que ajuda sem entregar o nome (até 8 palavras, ex.: "um clássico do PlayStation 2"); só escreva o que você tem certeza. ' +
      '"tema": um tema curto que une os jogos, para o título (ex.: "clássicos da infância", "jogos que marcaram época"). ' +
      'Responda só JSON: {"tema":"...","jogos":[{"nome":"...","nomeFalado":"como se fala o nome em português na narração, curto (ex.: Zelda Ocarina of Time)","dica":"..."}]}',
    `Não use estes jogos (já saíram em desafios anteriores): ${jaUsados.slice(-80).join('; ') || 'nenhum'}.`,
    { temperatura: 0.9 }
  );
  const usados = new Set(jaUsados.map((x) => String(x).toLowerCase()));
  const candidatos = (j.jogos || []).filter((g) => g?.nome && !usados.has(String(g.nome).toLowerCase()));

  // Só entra jogo com imagem oficial (screenshot) que dá para pixelar
  const rodadas = [];
  for (const g of candidatos) {
    if (rodadas.length >= RODADAS) break;
    try {
      const { fotos } = await midiasDoJogo(String(g.nome));
      const foto = fotos.find((f) => /\.jpe?g(\?|$)/i.test(f.imageUrl || ''));
      if (!foto) continue;
      const k = rodadas.length;
      const pix = await pixelar(foto.imageUrl, DIFICULDADE[k]);
      const nome = crypto.createHash('sha1').update(foto.imageUrl).digest('hex').slice(0, 10);
      rodadas.push({ nome: foto.jogo || g.nome, falado: String(g.nomeFalado || g.nome).slice(0, 60), dica: String(g.dica || '').slice(0, 80), nitida: foto.imageUrl, pixelada: await guardar(pix, nome) });
    } catch (e) {
      console.log(`[desafio] ${g.nome}: ${String(e.message || e).slice(0, 100)}`);
    }
  }
  if (rodadas.length < 4) throw new Error(`Só achei imagem oficial de ${rodadas.length} jogo(s) para o desafio. Tente de novo.`);

  const n = rodadas.length;
  const linhas = [
    `@ imagem: ${rodadas[0].pixelada}`,
    `Duvido você acertar os ${NUMEROS[n - 1]} jogos só pela imagem. Conta quantos você acertou!`,
  ];
  rodadas.forEach((r, k) => {
    const ultima = k === n - 1;
    linhas.push(
      `@ imagem: ${r.pixelada}`,
      `${ultima ? 'O último é o mais difícil.' : `Jogo número ${NUMEROS[k]}.`} ${r.dica ? `Dica: ${r.dica.replace(/[.!]+$/, '')}.` : 'Que jogo é esse?'}`,
      `@ imagem: ${r.pixelada}`,
      'Três... dois... um...',
      `@ imagem: ${r.nitida}`,
      `É ${r.falado}!`
    );
  });
  linhas.push(`@ imagem: ${rodadas[n - 1].nitida}`, `E aí, quantos você acertou de ${NUMEROS[n - 1]}? Comenta o seu placar! Toda semana tem desafio novo aqui no Próxima Fase.`);

  const tema = String(j.tema || 'jogos que marcaram época').slice(0, 50);
  const titulo = `Adivinhe o jogo pela imagem: ${tema} 🎮`.slice(0, 95);
  const tags = ['adivinhe o jogo', 'quiz de games', 'desafio gamer', 'jogos antigos', 'nostalgia gamer', ...rodadas.map((r) => r.nome)].slice(0, 14);
  const ep = {
    id: `desafio-${crypto.createHash('sha1').update(rodadas.map((r) => r.nome).join('|')).digest('hex').slice(0, 16)}`,
    titulo,
    thumb: 'ADIVINHE O JOGO',
    thumbSub: `${n} jogos`,
    capa: `imagem: ${rodadas[0].pixelada}`,
    ritmo: 'games',
    cauda: false,
    musica: 'Upbeat quiz game show music, playful and energetic, ticking tension, gaming vibe, no vocals',
    descricao: [
      titulo,
      `🎮 Desafio da semana do Próxima Fase: ${n} jogos, só pela imagem. Quantos você acertou? Comenta o seu placar!`,
      `Respostas: ${rodadas.map((r, k) => `${k + 1}) ${r.nome}`).join(' · ')}`,
      '🔔 Inscreva-se: toda semana tem desafio novo.',
      '#adivinheojogo #quizgamer #games #shorts',
    ].join('\n\n'),
    tags: [...tags, 'próxima fase'],
    texto: linhas.join('\n'),
  };
  return { ep, jogos: rodadas.map((r) => r.nome) };
}
