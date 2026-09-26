// Teste rápido do motor sem abrir o app: cria músicas/imagens de exemplo e gera vídeos.
// Uso: node teste/teste-motor.js [estilo]
const fs = require('fs');
const path = require('path');
const os = require('os');
const { rodar, probe, detectarEncoder } = require('../src/engine/ffmpeg');
const R = require('../src/engine/render');

async function gerarAmostras(dir) {
  const musicas = [];
  const notas = [220, 330, 262];
  for (let i = 0; i < 3; i++) {
    const f = path.join(dir, `musica_${i}.mp3`);
    if (!fs.existsSync(f)) {
      await rodar([
        '-f', 'lavfi', '-i', `sine=f=${notas[i]}:d=12`,
        '-f', 'lavfi', '-i', `anoisesrc=d=12:c=pink:a=0.15`,
        '-filter_complex', `[0:a][1:a]amix=inputs=2,volume='0.4+0.5*sin(2*PI*t*1.5)':eval=frame,aformat=channel_layouts=stereo`,
        '-c:a', 'libmp3lame', '-b:a', '128k', f,
      ]).promise;
    }
    musicas.push({ arquivo: f, titulo: `Música de teste ${i + 1}`, duracao: (await probe(f)).duracao });
  }
  const imgs = [];
  const cores = [['0x1e3a8a', '0x9333ea'], ['0x7f1d1d', '0xf59e0b']];
  for (let i = 0; i < 2; i++) {
    const f = path.join(dir, `img_${i}.png`);
    if (!fs.existsSync(f)) await rodar(['-f', 'lavfi', '-i', `gradients=s=1600x900:c0=${cores[i][0]}:c1=${cores[i][1]}:d=1`, '-frames:v', '1', f]).promise;
    imgs.push(f);
  }
  const vid = path.join(dir, 'video_fundo.mp4');
  if (!fs.existsSync(vid)) await rodar(['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:d=6:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', vid]).promise;
  return { musicas, imgs, vid };
}

async function main() {
  const base = path.join(os.tmpdir(), 'compilador-teste');
  fs.mkdirSync(base, { recursive: true });
  const { musicas, imgs, vid } = await gerarAmostras(base);
  const encoder = await detectarEncoder();
  console.log('Encoder:', encoder);

  const estilos = process.argv[2] ? [process.argv[2]] : ['onda', 'barras_espelho', 'nuvem'];
  const fontsDir = path.join(__dirname, '..', 'assets', 'fonts');

  for (const estilo of estilos) {
    for (const cfg of [
      { nome: `${estilo}_longo`, formato: { tipo: 'longo', resolucao: '720' }, fundos: imgs, enquadramento: 'preencher' },
      { nome: `${estilo}_curto_video`, formato: { tipo: 'curto', resolucao: '720', duracaoMaxMin: 0.5 }, fundos: [vid, imgs[0]], enquadramento: 'desfoque' },
    ]) {
      const dir = path.join(base, cfg.nome);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const [W, H] = R.dimensoes(cfg.formato);
      const t0 = Date.now();
      const audio = await R.prepararAudio({ musicas, audio: { crossfade: 2, normalizar: true }, formato: cfg.formato, dir, modo: 'normal' });
      const textura = { granulado: 40, vinheta: true, escurecer: 20 };
      const fundo = await R.prepararFundos({ fundos: cfg.fundos, W, H, enquadramento: cfg.enquadramento, textura, timeline: audio.timeline, total: audio.total, dir, modo: 'normal' });
      const ass = path.join(dir, 'textos.ass');
      fs.writeFileSync(ass, R.gerarAss({
        W, H, timeline: audio.timeline, total: audio.total, mostrarNome: true,
        legenda: { posicao: 'meio', tamanho: 100 },
        legendas: [{ inicio: 1, fim: 5, texto: 'Legenda de teste com acentuação ção' }],
      }));
      const saida = path.join(base, `${cfg.nome}.mp4`);
      let ultimo = -1;
      await R.renderizarFinal({
        fundo, audioArquivo: audio.arquivo, total: audio.total, W, H,
        efeito: { estilo, cor: '#ff3355', largura: 66, intensidade: 90, posX: 50, posY: 85, opacidade: 95 },
        textura, assArquivo: ass, fontsDir, saida, encoder, modo: 'normal', dir,
        onProgresso: (p) => { const q = Math.floor(p * 10); if (q !== ultimo) { ultimo = q; process.stdout.write(` ${q * 10}%`); } },
      });
      const info = await probe(saida);
      console.log(`\n✔ ${cfg.nome}: ${info.largura}x${info.altura} ${info.duracao.toFixed(1)}s em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      await rodar(['-ss', '3', '-i', saida, '-frames:v', '1', path.join(base, `${cfg.nome}.jpg`)]).promise;
    }
  }
  console.log('Arquivos em', base);
}

main().catch((e) => { console.error(e); process.exit(1); });
