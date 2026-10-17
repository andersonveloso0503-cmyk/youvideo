// Põe silêncio antes e depois de um MP3 sem precisar de ffmpeg (roda na Vercel).
// Usado no OmniHuman: o clipe com a boca sincronizada sai do tamanho exato da cena,
// com a fala começando no mesmo instante em que ela entra no vídeo.
//
// Como: um quadro MP3 (MPEG-1 Layer III) com o cabeçalho certo e todo o resto zerado
// é decodificado como silêncio. Cada quadro tem 1152 amostras (≈ 26 ms a 44,1 kHz).

const KBPS1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const KBPS2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const HZ = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

function lerQuadro(buf, i) {
  if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const versao = (buf[i + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const camada = (buf[i + 1] >> 1) & 3; // 1 = Layer III
  if (versao === 1 || camada !== 1) return null;
  const kbps = (versao === 3 ? KBPS1 : KBPS2)[(buf[i + 2] >> 4) & 15];
  const hz = HZ[versao]?.[(buf[i + 2] >> 2) & 3];
  if (!kbps || !hz) return null;
  const amostras = versao === 3 ? 1152 : 576;
  const preenchimento = (buf[i + 2] >> 1) & 1;
  const tamanho = Math.floor(((amostras / 8) * kbps * 1000) / hz) + preenchimento;
  return { tamanho, hz, amostras, versao };
}

/**
 * Devolve um Buffer MP3 com `antes` segundos de silêncio no começo e `depois` no fim.
 * Se não reconhecer o formato, devolve o original (quem chama segue sem o acolchoamento).
 */
export function mp3ComSilencio(buf, antes = 0, depois = 0) {
  let i = 0;
  if (buf.slice(0, 3).toString() === 'ID3') {
    i = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f));
  }
  while (i < Math.min(buf.length - 4, 200000) && !lerQuadro(buf, i)) i++;
  const q = lerQuadro(buf, i);
  if (!q) return { buffer: buf, ok: false };
  let inicioAudio = i;
  // O 1º quadro pode ser o "Xing"/"Info" (diz quantos quadros o arquivo tem): tira, senão o tamanho fica errado
  const primeiro = buf.slice(i, i + q.tamanho);
  if (primeiro.includes('Xing') || primeiro.includes('Info') || primeiro.includes('VBRI')) inicioAudio = i + q.tamanho;
  // Quadro de silêncio: mesmo cabeçalho (sem o bit de preenchimento e sem CRC), o resto zerado
  const tam = Math.floor(((q.amostras / 8) * KBPS_DO(buf, i, q) * 1000) / q.hz);
  const silencio = Buffer.alloc(tam);
  silencio[0] = 0xff;
  silencio[1] = buf[i + 1] | 0x01; // sem CRC
  silencio[2] = buf[i + 2] & ~0x02; // sem preenchimento
  silencio[3] = buf[i + 3];
  const porQuadro = q.amostras / q.hz;
  const nAntes = Math.max(0, Math.round(antes / porQuadro));
  const nDepois = Math.max(0, Math.round(depois / porQuadro));
  // Tira um ID3v1 no fim (TAG de 128 bytes), para o silêncio ficar logo depois do último quadro de som
  let fim = buf.length;
  if (fim > 128 && buf.slice(fim - 128, fim - 125).toString() === 'TAG') fim -= 128;
  const partes = [];
  for (let k = 0; k < nAntes; k++) partes.push(silencio);
  partes.push(buf.slice(inicioAudio, fim));
  for (let k = 0; k < nDepois; k++) partes.push(silencio);
  return { buffer: Buffer.concat(partes), ok: true, antes: nAntes * porQuadro, depois: nDepois * porQuadro };
}

function KBPS_DO(buf, i, q) {
  return (q.versao === 3 ? KBPS1 : KBPS2)[(buf[i + 2] >> 4) & 15];
}
