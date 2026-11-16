// Ilustrações no estilo "palco" (pedido do dono, 16/11, inspirado num Reel de explicador):
//   votacao -> painel com o placar contando a cada voto + bonecos com a FOTO REAL de cada um num círculo
//              (nada de rosto inventado: o boneco é genérico, quem identifica é a foto e o nome);
//              se o julgamento foi suspenso/pedido de destaque, o placar ZERA piscando e todos ficam cinza.
//   alerta  -> o prédio da notícia sobe com efeito de mola, um SELO pula na tela ("REVIRAVOLTA!") e o
//              trabalhador (quem assiste) reage.
// Quadro de 1000×780, animação por t (segundos) e k (velocidade), como os outros desenhos.
const fs = require('fs');
const { pathToFileURL } = require('url');

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const curto = (t, n) => {
  const x = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (x.length <= n) return x;
  const c = x.slice(0, n);
  const e = c.lastIndexOf(' ');
  return (e > n * 0.5 ? c.slice(0, e) : c) + '…';
};
const CORES = { vermelho: ['#ff5a4f', '#d32f2f', '#fff'], verde: ['#4cd77a', '#24a552', '#fff'], ouro: ['#ffd54a', '#e8a800', '#2a1d00'], azul: ['#5aa0ff', '#2f6fe0', '#fff'] };
const CABELOS = ['#5b5b5b', '#2a1d14', '#bdbdbd', '#3a2618', '#7a5230', '#1b1b1b'];

// nome curto para a etiqueta: "Flávio Dino" -> "DINO", "Cármen Lúcia" -> "CÁRMEN LÚCIA" (se couber)
function nomeCurto(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter((x) => !/^(de|da|do|dos|das|e)$/i.test(x));
  if (!p.length) return '';
  const tudo = p.join(' ');
  if (tudo.length <= 12) return tudo.toUpperCase();
  return p[p.length - 1].toUpperCase();
}

const bonecoMinistro = (i, toga = true) => `<svg width="110" height="170" viewBox="0 0 110 170"><defs><radialGradient id="pl${i}" cx=".35" cy=".3"><stop offset="0" stop-color="#ffe0c2"/><stop offset="1" stop-color="#e2ad80"/></radialGradient><linearGradient id="tg${i}" x1="0" x2="1"><stop offset="0" stop-color="#2a3044"/><stop offset="1" stop-color="#111522"/></linearGradient></defs>
<ellipse cx="55" cy="164" rx="40" ry="7" fill="#000" opacity=".4"/><rect x="18" y="66" width="74" height="96" rx="32" fill="url(#tg${i})"/>${toga ? '<rect x="48" y="70" width="14" height="40" fill="#fff"/>' : '<path d="M47 70 l8 26 l8 -26z" fill="#c33"/>'}
<circle cx="55" cy="40" r="32" fill="url(#pl${i})"/><path d="M24 34 q31 -44 62 0 q-6 -26 -31 -26 q-25 0 -31 26z" fill="${CABELOS[i % CABELOS.length]}"/><circle cx="44" cy="44" r="4" fill="#1b2236"/><circle cx="66" cy="44" r="4" fill="#1b2236"/></svg>`;

const trabalhador = (reacao, gamer) => `<svg width="190" height="290" viewBox="0 0 190 290" style="overflow:visible"><defs><radialGradient id="tpele" cx=".35" cy=".3"><stop offset="0" stop-color="#ffe0c2"/><stop offset="1" stop-color="#d9a074"/></radialGradient>
<linearGradient id="tcam" x1="0" x2="1"><stop offset="0" stop-color="${gamer ? '#7b4dff' : '#3f86ff'}"/><stop offset="1" stop-color="${gamer ? '#4a22b8' : '#1d4fb8'}"/></linearGradient></defs>
<ellipse cx="95" cy="282" rx="70" ry="10" fill="#000" opacity=".45"/>
<rect x="60" y="210" width="28" height="70" rx="12" fill="#22305a"/><rect x="102" y="210" width="28" height="70" rx="12" fill="#22305a"/>
<rect x="45" y="110" width="100" height="120" rx="40" fill="url(#tcam)"/>
<rect x="20" y="120" width="30" height="80" rx="15" fill="url(#tcam)"/>
<g id="tbraco" style="transform-origin:150px 128px"><rect x="138" y="${reacao === 'feliz' ? 20 : 40}" width="30" height="96" rx="15" fill="url(#tcam)" transform="rotate(${reacao === 'feliz' ? 20 : -18} 150 128)"/></g>
<circle cx="95" cy="68" r="50" fill="url(#tpele)"/>${gamer ? '<path d="M44 52 q51 -60 102 0 z" fill="#2fe08a"/><rect x="40" y="46" width="70" height="12" rx="6" fill="#22b36d" transform="rotate(-8 75 52)"/>' : '<path d="M48 58 q47 -62 96 0 q-8 -38 -48 -38 q-40 0 -48 38z" fill="#3a2618"/>'}
<circle cx="78" cy="74" r="6" fill="#1b2236"/><circle cx="112" cy="74" r="6" fill="#1b2236"/>
${reacao === 'feliz' ? '<path d="M78 92 q17 16 34 0" stroke="#1b2236" stroke-width="5" fill="none" stroke-linecap="round"/>' : reacao === 'preocupado' ? '<path d="M80 100 q15 -12 30 0" stroke="#1b2236" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M68 58 l18 6 M122 58 l-18 6" stroke="#1b2236" stroke-width="4" stroke-linecap="round"/>' : '<path d="M82 96 q13 -8 26 0" stroke="#1b2236" stroke-width="4" fill="none" stroke-linecap="round"/>'}</svg>`;

const selo = (id, texto, cor, tam = 56) => {
  const [a, b, c] = CORES[cor] || CORES.vermelho;
  return `<div id="${id}" style="position:absolute;left:0;right:0;text-align:center;opacity:0"><span style="display:inline-block;padding:14px 34px;border-radius:20px;font-weight:900;font-size:${tam}px;color:${c};background:linear-gradient(${a},${b});box-shadow:0 12px 0 rgba(0,0,0,.35),0 22px 36px rgba(0,0,0,.45);white-space:nowrap;letter-spacing:1px">${esc(texto)}</span></div>`;
};

function criarPalco(PREDIOS) {
  return {
    votacao(d) {
      const fotos = (d.fotos || []).filter((f) => f && f.nome).slice(0, 6);
      const n = fotos.length;
      const col = 1000 / n;
      const circ = n <= 4 ? 120 : 100;
      const escB = n <= 4 ? 1 : 0.85;
      const sim = fotos.filter((f) => f.voto !== 'nao').length;
      const simF = Number(d.sim) > 0 ? Math.round(Number(d.sim)) : null;
      const naoF = Number(d.nao) >= 0 && d.nao !== undefined && d.nao !== null && d.nao !== '' ? Math.round(Number(d.nao)) : null;
      const zera = !!d.zera;
      return {
        html: `<div id="vtv" style="position:absolute;left:110px;top:0;width:780px;height:300px;border-radius:34px;background:linear-gradient(#2a3866,#141c38);box-shadow:0 14px 0 #0b1024,0 30px 50px rgba(0,0,0,.6);border:4px solid #3b4c86;opacity:0">
          <div style="position:absolute;inset:18px;border-radius:22px;background:radial-gradient(#173a6b,#0a1a36);display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div style="color:#8fb4ff;font-size:28px;font-weight:900;letter-spacing:6px">${esc(curto(d.rotulo || 'PLACAR', 24).toUpperCase())}</div>
            <div id="vpl" class="num" style="font-size:150px;font-weight:900;color:#4cd77a;text-shadow:0 8px 0 #0c5a2a;line-height:1.05;white-space:nowrap">0 x 0</div></div></div>
          ${zera && d.selo ? selo('vselo', curto(d.selo, 24).toUpperCase(), 'vermelho', 50).replace('left:0;right:0;', 'left:0;right:0;top:-40px;transform-origin:50% 50%;') : ''}
          ${fotos
            .map((f, i) => {
              const nao = f.voto === 'nao';
              const temFoto = f.arquivo && fs.existsSync(f.arquivo);
              return `<div class="vp" style="position:absolute;left:${i * col}px;width:${col}px;top:330px;display:flex;flex-direction:column;align-items:center;opacity:0">
              <div style="position:relative;width:${circ}px;height:${circ}px">
                <div style="width:${circ}px;height:${circ}px;border-radius:50%;overflow:hidden;border:5px solid #fff;box-shadow:0 0 0 5px ${nao ? '#e5484d' : '#3fbf7f'},0 8px 18px rgba(0,0,0,.6);background:#56627f">
                  ${temFoto ? `<img src="${esc(pathToFileURL(f.arquivo).href)}" style="width:100%;height:100%;object-fit:cover;object-position:50% 22%">` : `<div style="font-size:${circ * 0.62}px;line-height:${circ}px;text-align:center">👤</div>`}</div>
                <div style="position:absolute;right:-10px;bottom:-6px;width:46px;height:46px;border-radius:50%;background:linear-gradient(${nao ? '#ff6a5f,#d32f2f' : '#4cd77a,#24a552'});color:#fff;font-weight:900;font-size:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 0 rgba(0,0,0,.35)">${nao ? '✕' : '✓'}</div></div>
              <div style="transform:scale(${escB});transform-origin:50% 0;margin-top:6px;height:${170 * escB}px">${bonecoMinistro(i, d.casa !== 'camara' && d.casa !== 'senado')}</div>
              <div style="background:#0e1428;border:2px solid #2c3a66;color:#fff;font-size:${n <= 4 ? 26 : 22}px;font-weight:900;padding:6px 14px;border-radius:12px;margin-top:4px;letter-spacing:1px;white-space:nowrap;max-width:${col - 8}px;overflow:hidden">${esc(f.apelido ? String(f.apelido).toUpperCase() : nomeCurto(f.nome))}</div></div>`;
            })
            .join('')}`,
        anim: `const tv=back(ap(t,.05*k,.45));$('vtv').style.opacity=Math.min(1,tv);$('vtv').style.transform='scale('+(.6+.4*tv)+')';
          const P=$$('.vp');const passo=.5*k,ini=.45*k;let s=0,nn=0;const V=${JSON.stringify(fotos.map((f) => (f.voto === 'nao' ? 'n' : 's')))};
          P.forEach((e,i)=>{const q=back(ap(t,ini+i*passo,.4));e.style.opacity=Math.min(1,q);e.style.transform='translateY('+((1-Math.min(1,q))*80)+'px) scale('+(.5+.5*q)+')';if(t>=ini+i*passo){if(V[i]==='s')s++;else nn++;}});
          const fim=ini+P.length*passo;
          ${simF != null ? `if(t>=fim+.2*k){s=${simF};nn=${naoF ?? 'nn'};}` : ''}
          const pl=$('vpl');pl.textContent=s+' x '+nn;
          ${zera ? `const z=fim+.7*k;if($('vselo')){const q=back(ap(t,z-.25*k,.4));$('vselo').style.opacity=Math.min(1,q);$('vselo').style.transform='rotate(-4deg) scale('+q+')';}
          if(t>=z){pl.textContent='0 x 0';pl.style.color='#ff5a4f';pl.style.textShadow='0 8px 0 #7a1010';const pis=Math.sin((t-z)*14)>0&&t<z+1.2;pl.style.filter=pis?'brightness(1.8)':'none';
            P.forEach(e=>{e.style.filter='grayscale(1)';e.style.opacity=.45;});}else{pl.style.color='#4cd77a';pl.style.textShadow='0 8px 0 #0c5a2a';pl.style.filter='none';}` : ''}`,
      };
    },
    alerta(d) {
      const lugar = PREDIOS[d.lugar] ? d.lugar : 'stf';
      const reacao = ['feliz', 'preocupado', 'duvida'].includes(d.reacao) ? d.reacao : 'duvida';
      return {
        html: `<div id="aprd" style="position:absolute;left:300px;top:250px;width:640px;height:480px;opacity:0;filter:drop-shadow(0 26px 30px rgba(0,0,0,.55))">${PREDIOS[lugar].replace('<svg ', '<svg style="width:640px;height:480px" ')}</div>
          ${selo('aselo', curto(d.selo || 'ATENÇÃO!', 22).toUpperCase(), d.cor, 72).replace('left:0;right:0;', 'left:0;right:0;top:120px;')}
          ${d.texto ? `<div id="atx" style="position:absolute;left:0;right:0;top:20px;text-align:center;opacity:0"><span style="display:inline-block;background:#0e1428;border:3px solid #2c3a66;border-radius:18px;padding:12px 28px;font-size:40px;font-weight:800;color:#f3efe6">${esc(curto(d.texto, 44))}</span></div>` : ''}
          <div id="atrab" style="position:absolute;left:50px;top:420px;width:190px;height:290px;transform-origin:50% 100%">${trabalhador(reacao, !!d.gamer)}</div>
          ${reacao === 'duvida' ? '<div id="aint" style="position:absolute;left:190px;top:390px;font-size:110px;font-weight:900;color:#ffd54a;text-shadow:0 8px 0 #a87a00;opacity:0">?</div>' : ''}`,
        anim: `const p=back(ap(t,.05*k,.55));$('aprd').style.opacity=Math.min(1,eo(ap(t,.05*k,.3)));$('aprd').style.transform='translateY('+((1-p)*260)+'px) scale('+(.75+.25*p)+')';
          const s=back(ap(t,.55*k,.4));$('aselo').style.opacity=Math.min(1,s);$('aselo').style.transform='rotate(-4deg) scale('+s+')';
          if($('atx'))$('atx').style.opacity=eo(ap(t,.9*k,.4));
          const w=eo(ap(t,.3*k,.5));$('atrab').style.transform='translateX('+((1-w)*-320)+'px) scale(1.35)';
          const b=document.getElementById('tbraco');if(b)b.style.transform='rotate('+(Math.sin(t*${reacao === 'feliz' ? 9 : 5})*${reacao === 'feliz' ? 12 : 5})+'deg)';
          if($('aint')){const q=back(ap(t,.8*k,.4));$('aint').style.opacity=Math.min(1,q);$('aint').style.transform='translateY('+(Math.sin(t*3)*12)+'px) scale('+q+')';}`,
      };
    },
  };
}

function validaPalco(d) {
  if (d.tipo === 'votacao') return Array.isArray(d.fotos) && d.fotos.filter((f) => f && f.nome).length >= 2;
  if (d.tipo === 'alerta') return !!d.selo;
  return false;
}

module.exports = { criarPalco, validaPalco };
