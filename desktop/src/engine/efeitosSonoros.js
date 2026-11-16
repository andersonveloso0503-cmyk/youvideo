// EFEITOS SONOROS (pedido do dono, 16/11: "isso era sobre o som"): whoosh na entrada de cada ilustração,
// "pop" quando um selo ou um voto pula na tela, "tum" de carimbo quando o placar zera / o carimbo cai.
// Os sons são GERADOS aqui pelo ffmpeg (síntese), então não têm direito autoral de ninguém.
// Ficam baixinhos, por baixo da narração. Se qualquer coisa falhar, o vídeo sai sem efeito (nunca quebra a montagem).
const fs = require('fs');
const path = require('path');
const os = require('os');

const RECEITAS = {
  // ar passando: ruído rosa filtrado, sobe e desce
  whoosh: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.5:c=pink:a=0.9', '-af', 'highpass=f=250,lowpass=f=3500,afade=t=in:d=0.28:curve=qsin,afade=t=out:st=0.28:d=0.22,volume=0.9'],
  // bolha estourando: tom que cai rápido
  pop: ['-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*(420+2600*exp(-38*t))*t)*exp(-22*t)':d=0.16:s=48000"],
  // carimbo/batida: grave curto + estalo
  tum: ['-f', 'lavfi', '-i', "aevalsrc='0.95*sin(2*PI*(55+140*exp(-28*t))*t)*exp(-8*t)+0.25*(random(0)-0.5)*exp(-60*t)':d=0.4:s=48000"],
  // confirmação: "plim" de duas notas
  plim: ['-f', 'lavfi', '-i', "aevalsrc='0.45*sin(2*PI*1320*t)*exp(-7*t)+0.3*sin(2*PI*1980*(t-0.07))*exp(-7*(t-0.07))*gte(t,0.07)':d=0.55:s=48000"],
};

function pasta() {
  const p = path.join(process.env.APPDATA || os.homedir(), 'youvideo-compilador', 'sons');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

async function arquivo(nome, modo) {
  const arq = path.join(pasta(), `${nome}-v1.wav`);
  if (fs.existsSync(arq) && fs.statSync(arq).size > 2000) return arq;
  const { rodar } = require('./ffmpeg');
  await rodar(['-y', ...RECEITAS[nome], '-ac', '2', '-ar', '48000', arq], { modo }).promise;
  return arq;
}

// Quando cada som toca, em segundos a partir do começo da ilustração (os mesmos tempos das animações)
function sonsDa(il, dur) {
  const k = Math.max(0.45, Math.min(1, dur / 4));
  const s = [{ t: 0, som: 'whoosh', vol: 0.22 }];
  switch (il.tipo) {
    case 'alerta':
      s.push({ t: 0.55 * k, som: 'pop', vol: 0.4 });
      break;
    case 'votacao': {
      const n = Math.min(6, (il.fotos || []).length);
      for (let i = 0; i < n; i++) s.push({ t: 0.45 * k + i * 0.5 * k, som: 'pop', vol: 0.3 });
      if (il.zera) s.push({ t: 0.45 * k + n * 0.5 * k + 0.7 * k, som: 'tum', vol: 0.5 });
      break;
    }
    case 'carimbo':
    case 'impacto':
      s.push({ t: 0.6 * k, som: 'tum', vol: 0.45 });
      break;
    case 'checklist':
    case 'status':
      s.push({ t: 0.8 * k, som: 'plim', vol: 0.25 });
      break;
    case 'inscreva':
      s.push({ t: 1.75, som: 'pop', vol: 0.35 });
      break;
    default:
      break;
  }
  return s.filter((x) => x.t < dur - 0.1);
}

/** Coloca os efeitos na receita (rc.audio) para o prepararAudio misturar com a narração. Devolve quantos entraram. */
async function adicionarEfeitos(rc, locais, { modo } = {}) {
  if (!Array.isArray(rc.clipes) || !rc.clipes.some((c) => c.ilustracao?.tipo)) return 0;
  const pedidos = [];
  let ultimoWhoosh = -10;
  for (const c of rc.clipes) {
    const il = c.ilustracao;
    if (!il?.tipo || il.continua || il.sobreJogo) continue;
    const dur = Number(c.length) || 0;
    if (dur < 1) continue;
    for (const x of sonsDa(il, dur)) {
      const t = Number(c.start) + x.t;
      if (x.som === 'whoosh') {
        if (t - ultimoWhoosh < 2.5) continue; // whoosh seguido demais cansa
        ultimoWhoosh = t;
      }
      pedidos.push({ ...x, t });
    }
  }
  if (!pedidos.length) return 0;
  const usados = [...new Set(pedidos.map((p) => p.som))];
  for (const nome of usados) locais[`efeito-${nome}`] = await arquivo(nome, modo);
  rc.audio = [...(rc.audio || []), ...pedidos.map((p) => ({ url: `efeito-${p.som}`, start: Number(p.t.toFixed(3)), volume: p.vol }))];
  return pedidos.length;
}

module.exports = { adicionarEfeitos, sonsDa, arquivo };
