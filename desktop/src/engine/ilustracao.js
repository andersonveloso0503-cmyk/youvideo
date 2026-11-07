// Ilustrações animadas das notícias de política (estilo "explicador": carimbo, placar, checklist, calendário...).
// O site manda em cada cena um objeto `ilustracao` com os FATOS da notícia; aqui ele vira uma página HTML
// animada, que o Electron desenha quadro a quadro (janela invisível) e o ffmpeg transforma no clipe da cena.
// Tudo é desenho do próprio canal (nada de foto ou rosto inventado). Se der qualquer erro, a montagem usa a foto.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const TIPOS = ['carimbo', 'placar', 'versus', 'checklist', 'comparacao', 'calendario', 'numero', 'lista', 'linhaTempo', 'pergunta', 'foto', 'inscreva', 'fluxo', 'icone', 'fala'];
const { EXTRA, TIPOS_EXTRA, validaExtra, mascoteSvg, MASCOTE_ANIM, figuraPara } = require('./ilustracaoExtra');
TIPOS.push(...TIPOS_EXTRA);

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Corta sem quebrar palavra no meio ("bets i" virava título): volta até o último espaço
const corta = (t, max) => {
  const x = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (x.length <= max) return x;
  const c = x.slice(0, max);
  const e = c.lastIndexOf(' ');
  return (e > max * 0.5 ? c.slice(0, e) : c).replace(/[\s,;:–—-]+$/, '');
};
const txt = (t, max = 80) => esc(corta(t, max));
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); // 1.518,50 -> 1518.50
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // 1.518 -> 1518
  const n = Number(t);
  return t && Number.isFinite(n) ? n : null;
};

/** Título com a palavra de destaque em dourado. */
function tituloHtml(titulo, destaque) {
  const t = txt(titulo, 90);
  const d = txt(destaque, 40);
  if (!d || !t.includes(d)) return t;
  return t.replace(d, `<em>${d}</em>`);
}

function fontes() {
  const dir = path.join(__dirname, '..', '..', 'assets', 'fonts');
  const url = (f) => pathToFileURL(path.join(dir, f)).href;
  const existe = (f) => fs.existsSync(path.join(dir, f));
  return [
    existe('Montserrat_700Bold.ttf') ? `@font-face{font-family:Mont;font-weight:700;src:url("${url('Montserrat_700Bold.ttf')}")}` : '',
    existe('Montserrat_800ExtraBold.ttf') ? `@font-face{font-family:Mont;font-weight:800 900;src:url("${url('Montserrat_800ExtraBold.ttf')}")}` : '',
  ].join('\n');
}

const boneco = (cor) => `<svg viewBox="0 0 200 300" width="200" height="300">
 <ellipse cx="100" cy="290" rx="60" ry="10" fill="#000" opacity=".35"/>
 <rect x="70" y="200" width="24" height="80" rx="10" fill="#1d2440"/><rect x="106" y="200" width="24" height="80" rx="10" fill="#1d2440"/>
 <rect x="52" y="110" width="96" height="110" rx="40" fill="${cor}"/>
 <g class="braco"><rect x="132" y="118" width="22" height="80" rx="11" fill="${cor}"/></g>
 <rect x="46" y="118" width="22" height="80" rx="11" fill="${cor}"/>
 <circle cx="100" cy="70" r="46" fill="#f2c79b"/>
 <path d="M56 62 q44 -50 88 0 q-10 -40 -44 -40 q-34 0 -44 40z" fill="#3b2a1e"/>
 <circle cx="84" cy="74" r="5" fill="#222"/><circle cx="116" cy="74" r="5" fill="#222"/>
 <path d="M86 94 q14 12 28 0" stroke="#7a3b2a" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;

// ─────────── Cada tipo: o HTML (num quadro de 1000×780) e a animação (t em segundos, k = velocidade) ───────────
// As funções de animação viram texto dentro da página: só podem usar cl/eo/back/ap/$ /$$ (definidos lá).
const DESENHOS = {
  carimbo(d) {
    const cor = d.cor === 'vermelho' ? 'var(--nao)' : 'var(--ok)';
    return {
      html: `<div class="cardx" id="doc" style="left:250px;top:20px;width:500px;height:650px;background:#f4efe2;border:none;color:#1b2236;padding:54px 46px">
        <div style="font-size:28px;letter-spacing:4px;font-weight:700;color:#5b6582;text-transform:uppercase">${txt(d.subtitulo || 'Documento', 60)}</div>
        <div style="height:8px;width:120px;background:var(--ouro);margin:28px 0"></div>
        <div style="font-size:${Math.min(86, Math.round(400 / (Math.max(4, String(d.documento || '').length) * 0.66)))}px;font-weight:800;line-height:1.05;white-space:nowrap">${txt(d.documento, 24)}</div>
        <div style="margin-top:40px;display:flex;flex-direction:column;gap:18px">${[100, 88, 94, 60].map((w) => `<div style="height:16px;border-radius:8px;background:#d9d2c0;width:${w}%"></div>`).join('')}</div></div>
        <div class="carimbo" id="car" style="left:230px;top:420px;border-color:${cor};color:${cor}">${txt(d.carimbo || 'APROVADO', 16)}</div>`,
      anim: `const p=eo(ap(t,.15*k,.6*k));$('doc').style.transform='translateY('+((1-p)*120)+'px) rotate('+(-3+3*p)+'deg)';$('doc').style.opacity=p;
        const c=ap(t,1.3*k,.35);$('car').style.opacity=c>0?1:0;$('car').style.transform='scale('+(2.2-1.2*eo(c))+') rotate(-12deg)';`,
    };
  },
  placar(d) {
    const linhas = (d.linhas || []).slice(0, 3);
    const total = num(d.total) || Math.max(...linhas.map((l) => num(l.valor) || 0)) * 1.15 || 100;
    const min = num(d.minimo);
    const alt = 640 / Math.max(2, linhas.length);
    return {
      html: `<div style="position:absolute;left:60px;right:60px;top:20px;height:700px">${linhas
        .map(
          (l, i) => `<div style="position:absolute;left:0;right:0;top:${i * alt}px">
        <div style="font-size:32px;font-weight:700;letter-spacing:3px;color:var(--mut);text-transform:uppercase">${txt(l.rotulo, 30)}</div>
        <div style="position:absolute;top:56px;left:0;right:0;height:120px;border-radius:20px;background:var(--card);border:2px solid var(--borda);overflow:hidden">
          <div class="bar" data-v="${num(l.valor) || 0}" style="height:100%;width:0;background:linear-gradient(90deg,#2f8f62,var(--ok))"></div></div>
        <div class="num nv" data-v="${num(l.valor) || 0}" style="position:absolute;top:76px;right:30px;font-size:76px;line-height:80px">0</div>
        ${min ? `<div style="position:absolute;top:40px;left:${(min / total) * 100}%;width:6px;height:152px;background:var(--ouro);border-radius:3px"></div>
        <div style="position:absolute;top:192px;left:calc(${(min / total) * 100}% - 70px);font-size:28px;font-weight:800;color:var(--ouro)">mín. ${min}</div>` : ''}
      </div>`
        )
        .join('')}
      ${d.nota ? `<div style="position:absolute;top:${linhas.length * alt + 10}px;left:0;right:0;text-align:center;font-size:32px;color:var(--mut)">${txt(d.nota, 50)}</div>` : ''}</div>`,
      anim: `$$('.bar').forEach((b,i)=>{const p=eo(ap(t,(.4+i*1.4)*k,1.1*k));const v=+b.dataset.v;b.style.width=(p*v/${total}*100)+'%';$$('.nv')[i].textContent=fmtN(p*v,b.dataset.v,'${d.sufixo === '%' ? '%' : ''}');});`,
    };
  },
  versus(d) {
    const a = d.a || {};
    const b = d.b || {};
    const suf = d.sufixo === '%' ? '%' : '';
    const maior = Math.max(String(a.valor ?? '').length, String(b.valor ?? '').length) + suf.length;
    const tam = Math.round(Math.min(200, 360 / Math.max(2, maior * 0.62)));
    return {
      html: `<div style="position:absolute;left:0;right:0;top:120px;text-align:center">
        <div style="display:flex;justify-content:center;align-items:flex-end;gap:40px">
          <div><div class="num" id="va" data-v="${num(a.valor) || 0}" style="font-size:${tam}px;line-height:1">0</div><div class="lado" style="font-size:34px;font-weight:800;color:var(--ouro);letter-spacing:2px;text-transform:uppercase">${txt(a.rotulo, 18)}</div></div>
          <div style="font-size:90px;color:var(--mut);padding-bottom:70px">×</div>
          <div><div class="num" id="vb" data-v="${num(b.valor) || 0}" style="font-size:${tam}px;line-height:1">0</div><div class="lado" style="font-size:34px;font-weight:800;color:#7fb2ff;letter-spacing:2px;text-transform:uppercase">${txt(b.rotulo, 18)}</div></div>
        </div>
        ${d.nota ? `<div id="vn" style="margin-top:70px;font-size:36px;color:var(--mut);letter-spacing:2px;text-transform:uppercase">${txt(d.nota, 50)}</div>` : ''}</div>`,
      anim: `const p=eo(ap(t,.2*k,1.2*k));['va','vb'].forEach(id=>{const e=$(id);e.textContent=fmtN(p*e.dataset.v,e.dataset.v,'${suf}');});
        $$('.lado').forEach(e=>e.style.opacity=eo(ap(t,1.2*k,.4)));if($('vn'))$('vn').style.opacity=eo(ap(t,1.6*k,.4));`,
    };
  },
  checklist(d) {
    const itens = (d.itens || []).slice(0, 4);
    return {
      html: `${d.boneco === false ? '' : `<div id="bon" style="position:absolute;left:400px;top:0">${boneco('#7a2f3a')}</div>`}
        ${itens
          .map(
            (it, i) => `<div class="cardx chk" data-i="${i}" style="top:${(d.boneco === false ? 60 : 320) + i * (d.boneco === false ? 170 : 115)}px">
          <div class="bol" data-ok="${it.ok === false ? 0 : 1}" style="background:#2a3354;color:#0b1020">${it.ok === false ? '✕' : '✓'}</div><div>${txt(it.texto, 40)}</div></div>`
          )
          .join('')}`,
      anim: `if($('bon')){$('bon').style.opacity=eo(ap(t,0,.4));$('bon').style.transform='translateY('+(Math.sin(t*3)*6)+'px)';}
        $$('.chk').forEach((e,i)=>{const p=eo(ap(t,(.4+i*.7)*k,.4));e.style.opacity=p;e.style.transform='translateY('+((1-p)*40)+'px)';
        const o=ap(t,(.75+i*.7)*k,.3);const b=e.querySelector('.bol');b.style.background=o>0?(b.dataset.ok==='1'?'var(--ok)':'var(--nao)'):'#2a3354';b.style.transform='scale('+(o>0?back(o):1)+')';});`,
    };
  },
  comparacao(d) {
    const lados = (d.lados || []).slice(0, 2);
    const cores = ['var(--ouro)', '#7fb2ff'];
    return {
      html: `${lados
        .map(
          (l, i) => `<div class="cardx lado" style="${i ? 'right' : 'left'}:20px;width:470px;top:60px;height:560px;padding:40px">
        ${figuraPara(l.nome, l.texto) ? `<div style="width:150px;margin-bottom:6px">${figuraPara(l.nome, l.texto)}</div>` : ''}
        <div style="font-size:30px;font-weight:800;letter-spacing:2px;color:${cores[i]};text-transform:uppercase;line-height:1.2">${txt(l.nome, 34)}</div>
        <div style="font-size:${String(l.grande || '').length > 6 ? 80 : 130}px;font-weight:800;margin-top:24px;line-height:1.05">${txt(l.grande, 14)}</div>
        <div style="font-size:36px;color:var(--mut);margin-top:18px;line-height:1.25">${txt(l.texto, 70)}</div></div>`
        )
        .join('')}
        ${d.nota ? `<div id="cn" style="position:absolute;left:0;right:0;top:660px;text-align:center"><span style="border:4px dashed var(--ouro);color:var(--ouro);border-radius:16px;padding:10px 26px;font-size:34px;font-weight:800;letter-spacing:2px;text-transform:uppercase">${txt(d.nota, 34)}</span></div>` : ''}`,
      anim: `$$('.lado').forEach((e,i)=>{const q=eo(ap(t,(.2+i*.5)*k,.5));e.style.opacity=q;e.style.transform='translateY('+((1-q)*60)+'px)';});
        if($('cn')){const q=ap(t,1.4*k,.4);$('cn').style.opacity=q;$('cn').style.transform='scale('+(q>0?back(q):.5)+')';}`,
    };
  },
  calendario(d) {
    const temProx = !!d.proximo;
    return {
      html: `<div class="cardx" id="cal" style="left:${temProx ? 90 : 320}px;top:${temProx ? 60 : 80}px;width:360px;height:400px;background:#f4efe2;border:none;overflow:hidden;text-align:center;color:#1b2236">
        <div style="background:var(--nao);color:#fff;font-weight:800;font-size:40px;letter-spacing:4px;padding:20px 0;text-transform:uppercase">${txt(d.mes, 12)}</div>
        <div style="font-size:170px;font-weight:800;line-height:230px">${txt(d.dia, 2)}</div><div style="font-size:34px;font-weight:700;color:#5b6582">${txt([d.ano, d.rotulo].filter(Boolean).join(' · '), 24)}</div></div>
        ${temProx ? `<div id="seta" style="position:absolute;left:480px;top:200px;font-size:90px;color:var(--ouro);font-weight:800">→</div>
        <div class="cardx" id="prox" style="left:590px;top:110px;width:380px;height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-color:var(--ouro);padding:20px">
          <div style="font-size:24px;letter-spacing:3px;color:var(--mut);font-weight:700">PRÓXIMO PASSO</div>
          <div style="font-size:42px;font-weight:800;margin-top:14px;line-height:1.15">${txt(d.proximo, 30)}</div>
          ${d.proximoTexto ? `<div style="font-size:28px;color:var(--mut);margin-top:10px">${txt(d.proximoTexto, 50)}</div>` : ''}</div>` : ''}
        ${d.texto ? `<div id="ct" style="position:absolute;left:60px;right:60px;top:560px;text-align:center;font-size:44px;font-weight:800">${txt(d.texto, 60)}</div>` : ''}`,
      anim: `const p=back(ap(t,.1*k,.5));$('cal').style.transform='scale('+p+')';$('cal').style.opacity=Math.min(1,p);
        if($('seta')){$('seta').style.opacity=eo(ap(t,.8*k,.3));$('seta').style.transform='translateX('+(Math.sin(t*5)*10)+'px)';
        const q=back(ap(t,1.1*k,.5));$('prox').style.transform='scale('+q+')';$('prox').style.opacity=Math.min(1,q);}
        if($('ct'))$('ct').style.opacity=eo(ap(t,1.4*k,.4));`,
    };
  },
  numero(d) {
    const alvo = num(d.valor);
    return {
      html: `${!d.antes && figuraPara(d.texto, d.sufixo, d.prefixo, d.titulo) ? `<div id="nfig" style="position:absolute;left:350px;top:0;width:300px">${figuraPara(d.texto, d.sufixo, d.prefixo, d.titulo)}</div>` : ''}
        <div style="position:absolute;left:0;right:0;top:${d.antes ? 40 : figuraPara(d.texto, d.sufixo, d.prefixo, d.titulo) ? 250 : 140}px;text-align:center">
        ${d.antes ? `<div id="na" style="font-size:120px;font-weight:800;color:var(--mut);position:relative;display:inline-block">${txt(d.antes, 14)}<div id="risco" style="position:absolute;left:-10px;top:50%;height:12px;width:0;background:var(--nao);border-radius:6px;transform:rotate(-8deg)"></div></div>
        <div style="font-size:70px;color:var(--ouro);line-height:1.2">↓</div>` : ''}
        <div class="num" id="nn" style="font-size:${String(d.prefixo || '').length + String(d.valor || '').length + String(d.sufixo || '').length > 9 ? 130 : 190}px;line-height:1.05;color:var(--ouro2)">${esc(String(d.prefixo || '').slice(0, 6)).replace(/ /g, '&nbsp;')}<span id="nv" data-final="${alvo != null ? esc(alvo.toLocaleString('pt-BR')) : ''}">${alvo != null ? 0 : txt(d.valor, 14)}</span>${/^[A-Za-zÀ-ÿ]/.test(String(d.sufixo || '')) ? '&nbsp;' : ''}${esc(String(d.sufixo || '').slice(0, 12)).replace(/ /g, '&nbsp;')}</div>
        <div id="nt" style="margin:30px 60px 0;font-size:44px;font-weight:700;line-height:1.25">${txt(d.texto, 70)}</div></div>`,
      anim: `const r=$('risco');if(r)r.style.width=(eo(ap(t,.5*k,.4))*110)+'%';
        const n=$('nn');const p=back(ap(t,(${d.antes ? 0.9 : 0.1})*k,.5));n.style.transform='scale('+p+')';n.style.opacity=Math.min(1,p);
        ${alvo != null ? `const c=eo(ap(t,(${d.antes ? 0.9 : 0.1})*k,1.2*k));const v=${alvo}*c;$('nv').textContent=(${Number.isInteger(alvo)}?Math.round(v):Number(v.toFixed(1))).toLocaleString('pt-BR');` : ''}
        $('nt').style.opacity=eo(ap(t,1.3*k,.4));
        if($('nfig')){const f=back(ap(t,0,.45));$('nfig').style.opacity=Math.min(1,f);$('nfig').style.transform='scale('+(.4+.6*f)+') translateY('+(Math.sin(t*2.5)*6)+'px)';}`,
    };
  },
  lista(d) {
    const itens = (d.itens || []).slice(0, 4);
    const alt = itens.length > 3 ? 165 : 210;
    return {
      html: itens
        .map(
          (it, i) => `<div class="cardx it" style="left:40px;right:40px;top:${30 + i * (alt + 20)}px;height:${alt}px;display:flex;align-items:center;gap:36px;padding:0 44px">
        <div style="font-size:${alt * 0.5}px;width:${alt * 0.9}px;text-align:center;flex:none">${figuraPara(it.texto, it.selo) ? `<div style="width:${alt * 0.9}px">${figuraPara(it.texto, it.selo)}</div>` : txt(it.icone, 4)}</div><div style="flex:1;font-size:46px;font-weight:800;line-height:1.15">${txt(it.texto, 34)}</div>
        ${it.selo ? `<div style="font-size:28px;font-weight:800;letter-spacing:2px;padding:10px 20px;border-radius:30px;background:var(--ouro);color:#1a1206;text-transform:uppercase;white-space:nowrap">${txt(it.selo, 12)}</div>` : ''}</div>`
        )
        .join(''),
      anim: `$$('.it').forEach((e,i)=>{const p=eo(ap(t,(.2+i*.6)*k,.5));e.style.opacity=p;e.style.transform='translateX('+((1-p)*-200)+'px)';});`,
    };
  },
  linhaTempo(d) {
    const ev = (d.eventos || []).slice(0, 4);
    const passo = 680 / Math.max(1, ev.length);
    return {
      html: `<div id="trilho" style="position:absolute;left:150px;top:40px;width:8px;height:0;background:var(--ouro);border-radius:4px"></div>
        ${ev
          .map(
            (e, i) => `<div class="ev" style="position:absolute;left:120px;right:30px;top:${30 + i * passo}px;display:flex;gap:44px;align-items:flex-start">
          <div style="width:68px;height:68px;border-radius:50%;background:var(--ouro);border:8px solid var(--bg);flex:none"></div>
          <div><div style="font-size:34px;font-weight:800;color:var(--ouro);letter-spacing:2px;text-transform:uppercase">${txt(e.data, 24)}</div>
          <div style="font-size:42px;font-weight:700;margin-top:6px;line-height:1.2">${txt(e.texto, 50)}</div></div></div>`
          )
          .join('')}`,
      anim: `$('trilho').style.height=(eo(ap(t,.1*k,${ev.length * 0.6}*k))*${Math.round(passo * (ev.length - 1) + 40)})+'px';
        $$('.ev').forEach((e,i)=>{const p=eo(ap(t,(.2+i*.6)*k,.4));e.style.opacity=p;e.style.transform='translateX('+((1-p)*60)+'px)';});`,
    };
  },
  // Foto real da cena num cartão (com o nome embaixo): o vídeo inteiro fica no estilo explicador
  foto(d) {
    const src = pathToFileURL(d.fotoArquivo).href;
    return {
      html: `<div class="cardx" id="fc" style="left:60px;top:0;width:880px;height:${d.legenda ? 700 : 760}px;overflow:hidden;border:4px solid var(--ouro);border-radius:34px;box-shadow:0 30px 80px rgba(0,0,0,.55)">
        <img id="fi" src="${esc(src)}" style="width:100%;height:100%;object-fit:cover;object-position:50% 22%;transform-origin:50% 30%"></div>
        ${d.legenda ? `<div id="fl" style="position:absolute;left:0;right:0;top:725px;text-align:center"><span style="background:var(--card);border:2px solid var(--borda);border-radius:40px;padding:12px 34px;font-size:40px;font-weight:800">${txt(d.legenda, 40)}</span></div>` : ''}`,
      anim: `const p=eo(ap(t,.05,.55));$('fc').style.opacity=p;$('fc').style.transform='translateY('+((1-p)*80)+'px) scale('+(.94+.06*p)+')';
        $('fi').style.transform='scale('+(1.04+t*.025)+')';if($('fl'))$('fl').style.opacity=eo(ap(t,.4,.4));`,
    };
  },
  // Processo / causa e consequência: caixas em sequência com setas
  fluxo(d) {
    const passos = (d.passos || []).slice(0, 4);
    const alt = passos.length > 3 ? 130 : 160;
    const gap = passos.length > 3 ? 60 : 80;
    const topo = Math.max(0, (780 - (passos.length * alt + (passos.length - 1) * gap)) / 2);
    return {
      html: passos
        .map(
          (p, i) => `<div class="cardx ps" style="left:110px;right:110px;top:${topo + i * (alt + gap)}px;height:${alt}px;display:flex;align-items:center;gap:30px;padding:0 40px;${i === passos.length - 1 ? 'border-color:var(--ouro)' : ''}">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--ouro);color:#1a1206;font-weight:800;font-size:36px;display:flex;align-items:center;justify-content:center;flex:none">${i + 1}</div>
        <div style="font-size:${alt * 0.5}px;width:${alt * 0.6}px;text-align:center">${txt(p.icone, 4)}</div>
        <div style="flex:1;font-size:44px;font-weight:800;line-height:1.15">${txt(p.texto, 30)}</div></div>
        ${i < passos.length - 1 ? `<div class="sf" style="position:absolute;left:0;right:0;top:${topo + i * (alt + gap) + alt - 4}px;text-align:center;font-size:${gap}px;line-height:${gap + 8}px;color:var(--ouro);font-weight:800">↓</div>` : ''}`
        )
        .join(''),
      anim: `const ps=$$('.ps'),sf=$$('.sf');ps.forEach((e,i)=>{const p=back(ap(t,(.2+i*.75)*k,.45));e.style.opacity=Math.min(1,p);e.style.transform='scale('+(.85+.15*p)+')';});
        sf.forEach((e,i)=>{const p=eo(ap(t,(.55+i*.75)*k,.3));e.style.opacity=p;e.style.transform='translateY('+((1-p)*-20+Math.sin(t*4)*4)+'px)';});`,
    };
  },
  // Um conceito explicado: desenho grande + frase curta
  icone(d) {
    return {
      html: `<div id="ic" style="position:absolute;left:0;right:0;top:40px;text-align:center;font-size:300px;line-height:1">${txt(d.icone || '💡', 4)}</div>
        <div id="icb" style="position:absolute;left:300px;right:300px;top:380px;height:10px;border-radius:5px;background:var(--ouro)"></div>
        <div id="ict" style="position:absolute;left:40px;right:40px;top:430px;text-align:center;font-size:56px;font-weight:800;line-height:1.2">${txt(d.texto, 60)}</div>`,
      anim: `const p=back(ap(t,.1,.55));$('ic').style.transform='scale('+(p*(1+Math.sin(t*2.5)*.03))+')';$('ic').style.opacity=Math.min(1,p);
        $('icb').style.transform='scaleX('+eo(ap(t,.5*k,.4))+')';$('ict').style.opacity=eo(ap(t,.7*k,.4));$('ict').style.transform='translateY('+((1-eo(ap(t,.7*k,.4)))*30)+'px)';`,
    };
  },
  // O que a pessoa disse, EM RESUMO: foto real (ou o bonequinho, se não houver foto) + balão
  fala(d) {
    const temFoto = d.fotoArquivo && fs.existsSync(d.fotoArquivo);
    return {
      html: `<div id="fp" style="position:absolute;left:330px;top:0;width:340px;height:340px;border-radius:50%;overflow:hidden;border:6px solid var(--ouro);background:var(--card);box-shadow:0 20px 60px rgba(0,0,0,.5)">
          ${temFoto ? `<img src="${esc(pathToFileURL(d.fotoArquivo).href)}" style="width:100%;height:100%;object-fit:cover;object-position:50% 20%">` : `<div style="transform:translate(70px,20px) scale(1.1)">${boneco('#3a6fd8')}</div>`}</div>
        ${d.nome ? `<div id="fn" style="position:absolute;left:0;right:0;top:355px;text-align:center"><span style="background:var(--ouro);color:#1a1206;border-radius:30px;padding:8px 26px;font-size:34px;font-weight:800">${txt(d.nome, 40)}</span></div>` : ''}
        <div id="fb" style="position:absolute;left:60px;right:60px;top:440px;background:#fff;color:#111;border-radius:36px;padding:28px 40px 30px">
          <div style="font-size:24px;font-weight:800;letter-spacing:3px;color:#8a6a1e">EM RESUMO</div>
          <div style="font-size:46px;font-weight:800;line-height:1.2;margin-top:6px">${txt(d.texto, 90)}</div>
          <div style="position:absolute;left:470px;top:-30px;width:0;height:0;border-left:30px solid transparent;border-right:30px solid transparent;border-bottom:32px solid #fff"></div></div>`,
      anim: `const p=back(ap(t,.05,.5));$('fp').style.transform='scale('+p+')';$('fp').style.opacity=Math.min(1,p);if($('fn'))$('fn').style.opacity=eo(ap(t,.4,.3));
        const b=back(ap(t,.6*k,.45));$('fb').style.transform='scale('+b+')';$('fb').style.transformOrigin='50% 0';$('fb').style.opacity=Math.min(1,b);`,
    };
  },
  // Fecho do vídeo: o bonequinho pergunta e "aperta" o botão de se inscrever (botão genérico, sem marca)
  inscreva(d) {
    const sino = `<svg viewBox="0 0 24 24" width="54" height="54"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/></svg>`;
    return {
      html: `${d.mascote ? `<div id="masc" style="position:absolute;left:20px;top:190px;width:240px;height:360px"><div style="transform:scale(1.6);transform-origin:0 0">${mascoteSvg(d.mascote.roupa)}</div></div>` : `<div id="bon3" style="position:absolute;left:70px;top:330px;transform-origin:100px 300px;transform:scale(1.9)">${boneco('#3a6fd8')}</div>`}
        <div id="balao" style="position:absolute;left:380px;top:20px;width:580px;background:#fff;color:#111;font-size:${String(d.texto || '').length > 40 ? 40 : 48}px;font-weight:800;padding:26px 34px;border-radius:36px 36px 36px 8px;line-height:1.15;text-align:center">${txt(d.texto || 'E você, o que acha?', 70)}</div>
        <div id="bt" style="position:absolute;left:420px;top:330px;width:520px;height:130px;border-radius:70px;background:#e5302f;color:#fff;display:flex;align-items:center;justify-content:center;gap:22px;font-size:50px;font-weight:800;letter-spacing:2px;box-shadow:0 18px 50px rgba(229,48,47,.45)">
          <span id="btxt">INSCREVER-SE</span></div>
        <div id="sino" style="position:absolute;left:640px;top:500px;width:100px;height:100px;border-radius:50%;background:var(--card);border:3px solid var(--ouro);color:var(--ouro);display:flex;align-items:center;justify-content:center">${sino}</div>
        <div id="mao" style="position:absolute;left:0;top:0;font-size:96px;filter:drop-shadow(0 8px 12px rgba(0,0,0,.5))">👆</div>`,
      anim: `if($('bon3')){$('bon3').style.opacity=eo(ap(t,0,.4));const br=document.querySelector('#bon3 .braco');br.style.transformOrigin='143px 122px';br.style.transform='rotate('+(-150+Math.sin(t*8)*22)+'deg)';}
        const b=back(ap(t,.25,.45));$('balao').style.transform='scale('+b+')';$('balao').style.opacity=Math.min(1,b);
        const q=back(ap(t,.6,.45));const clique=ap(t,1.75,.12);const feito=t>1.85;
        $('bt').style.transform='scale('+(q*(clique>0&&clique<1?.92:1))+')';$('bt').style.opacity=Math.min(1,q);
        $('bt').style.background=feito?'#3a3f52':'#e5302f';$('bt').style.boxShadow=feito?'none':'0 18px 50px rgba(229,48,47,.45)';$('btxt').textContent=feito?'INSCRITO ✓':'INSCREVER-SE';
        const m=eo(ap(t,1.0,.75));$('mao').style.opacity=t<1?0:(t>3.4?Math.max(0,1-(t-3.4)*2):1);$('mao').style.transform='translate('+(980-(980-700)*m)+'px,'+(760-(760-400)*m)+'px) scale('+(clique>0&&clique<1?.85:1)+')';
        $('sino').style.opacity=eo(ap(t,1.9,.3));$('sino').style.transform='rotate('+(t>1.9?Math.sin((t-1.9)*18)*22*Math.max(0,1-(t-1.9)/1.5):0)+'deg)';`,
    };
  },
  pergunta(d) {
    return {
      html: `${d.mascote ? `<div id="masc" style="position:absolute;left:150px;top:230px;width:240px;height:360px"><div style="transform:scale(1.5);transform-origin:0 0">${mascoteSvg(d.mascote.roupa)}</div></div>` : `<div id="bon2" style="position:absolute;left:300px;top:260px;transform-origin:bottom center">${boneco('#3a6fd8')}</div>`}
        <div id="perg" style="position:absolute;left:520px;top:180px;max-width:460px;background:#fff;color:#111;font-size:${String(d.texto || '').length > 40 ? 42 : 50}px;font-weight:800;padding:24px 34px;border-radius:34px 34px 34px 6px;line-height:1.15">${txt(d.texto || 'E você?', 70)}</div>`,
      anim: `if($('bon2')){$('bon2').style.opacity=eo(ap(t,0,.4));const b=document.querySelector('#bon2 .braco');b.style.transformOrigin='143px 122px';b.style.transform='rotate('+(-150+Math.sin(t*8)*20)+'deg)';}
        const r=back(ap(t,.6*k,.4));$('perg').style.transform='scale('+r+')';$('perg').style.opacity=Math.min(1,r);`,
    };
  },
};

Object.assign(DESENHOS, EXTRA);

/** A ilustração tem o mínimo para ser desenhada? (o site já confere; aqui é a última trava) */
function valida(d) {
  if (!d || typeof d !== 'object' || !TIPOS.includes(d.tipo)) return false;
  const temLista = (x, n = 1) => Array.isArray(x) && x.length >= n;
  switch (d.tipo) {
    case 'carimbo': return !!d.documento;
    case 'placar': return temLista(d.linhas) && d.linhas.every((l) => num(l.valor) != null);
    case 'versus': return num(d.a?.valor) != null && num(d.b?.valor) != null;
    case 'checklist': return temLista(d.itens, 2);
    case 'comparacao': return temLista(d.lados, 2);
    case 'calendario': return !!d.dia && !!d.mes;
    case 'numero': return !!d.valor;
    case 'lista': return temLista(d.itens, 2);
    case 'linhaTempo': return temLista(d.eventos, 2);
    case 'pergunta': return true;
    case 'inscreva': return true;
    case 'fluxo': return temLista(d.passos, 2);
    case 'icone': return !!d.texto;
    case 'fala': return !!d.texto;
    case 'foto': return !!d.fotoArquivo && fs.existsSync(d.fotoArquivo);
    default: return validaExtra(d);
  }
}

/** Página completa (W×H), com setT(t) para desenhar o instante t (segundos). */
function paginaHtml(d, { W, H, duracao }) {
  const des = DESENHOS[d.tipo](d);
  const vertical = H > W;
  // Short: título no alto, desenho no meio, espaço livre embaixo para a legenda (24% de baixo)
  // Vídeo deitado: título no alto e desenho menor no meio (legenda nos 10% de baixo)
  // Mascote apresentador no canto de baixo à esquerda: a ilustração fica um pouco menor e à direita
  const masc = !!d.mascote && !['inscreva', 'pergunta'].includes(d.tipo);
  const escala = (vertical ? W / 1080 : (H * 0.62) / 780) * (masc && vertical ? (d.semTitulo ? 0.98 : 0.93) : 1);
  const caixaW = 1000 * escala;
  const iluLeft = masc ? (vertical ? W - caixaW - W * 0.03 : (W - caixaW) / 2 + W * 0.06) : (W - caixaW) / 2;
  const mascH = vertical ? H * 0.16 : H * 0.45;
  const mascEsc = mascH / 360;
  const iluTop = vertical ? H * (d.semTitulo ? 0.255 : 0.29) : H * 0.29; // sem título (manchete no alto): sobe e cresce
  const titTop = vertical ? H * 0.155 : H * 0.11;
  const titTam = (vertical ? 92 : 64) * (vertical ? W / 1080 : H / 1080);
  const k = Math.max(0.45, Math.min(1, duracao / 4)); // cena curta: anima mais rápido
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontes()}
:root{--bg:#0b1020;--ouro:#e8b04a;--ouro2:#f6d38a;--txt:#f3efe6;--mut:#8f97ad;--ok:#3fbf7f;--nao:#e5484d;--card:#151c33;--borda:#2a3354}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${d.sobreJogo ? 'transparent' : 'var(--bg)'};font-family:Mont,"Segoe UI",Arial,sans-serif;color:var(--txt)}
.luz{position:absolute;border-radius:50%;filter:blur(${Math.round(60 * escala)}px);opacity:.35}
.tagp{position:absolute;top:${titTop - 80 * escala}px;left:50%;background:linear-gradient(90deg,#c98a2b,var(--ouro));color:#1a1206;font-weight:800;font-size:${28 * escala}px;letter-spacing:${4 * escala}px;padding:${10 * escala}px ${28 * escala}px;border-radius:40px;white-space:nowrap;text-transform:uppercase}
.tit{position:absolute;top:${titTop}px;left:${W * 0.05}px;right:${W * 0.05}px;text-align:center;font-weight:800;font-size:${titTam}px;line-height:1.05;letter-spacing:-1px}
.tit em{font-style:normal;color:var(--ouro)}
.ilu{position:absolute;top:${iluTop}px;left:${iluLeft}px;width:1000px;height:780px;transform-origin:0 0;transform:scale(${escala})}
.cardx{position:absolute;background:var(--card);border:2px solid var(--borda);border-radius:28px}
.carimbo{position:absolute;border:8px solid;font-weight:800;font-size:78px;letter-spacing:5px;padding:10px 34px;border-radius:16px;background:rgba(11,16,32,.85);white-space:nowrap}
.num{font-weight:800;font-variant-numeric:tabular-nums}
.chk{position:absolute;left:60px;right:60px;height:100px;display:flex;align-items:center;gap:30px;padding:0 34px;font-size:40px;font-weight:700}
.bol{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:800;flex:none}
#raiz{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;background:${d.sobreJogo ? 'transparent' : 'var(--bg)'}}
${d.sobreJogo ? '.luz{display:none}.tit{text-shadow:0 6px 24px rgba(0,0,0,.85),0 2px 4px rgba(0,0,0,.9)}' : ''}
</style></head><body><div id="raiz">
${Array.isArray(d.fundoQuadros) && d.fundoQuadros.length ? `<div id="fundoJogo" style="position:absolute;left:-4%;top:-4%;width:108%;height:108%;filter:blur(${Math.round(W / 60)}px) brightness(.55) saturate(1.2)">${d.fundoQuadros
  .map((f, i) => `<img class="fj" src="${esc(pathToFileURL(f).href)}" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;${i ? 'visibility:hidden' : ''}">`)
  .join('')}</div>` : ''}
<div id="fundoAnim" style="position:absolute;left:-60px;top:-60px;width:${W + 120}px;height:${H + 120}px;opacity:.10;background-image:radial-gradient(circle,#c9d2ea 2px,transparent 2.5px);background-size:46px 46px"></div>
<div class="luz" id="l1" style="width:${W * 0.5}px;height:${W * 0.5}px;left:${-W * 0.1}px;top:${H * 0.15}px;background:#2b4a9a"></div>
<div class="luz" id="l2" style="width:${W * 0.4}px;height:${W * 0.4}px;right:${-W * 0.1}px;top:${H * 0.58}px;background:#8a5a14"></div>
<div class="luz" id="l3" style="width:${W * 0.28}px;height:${W * 0.28}px;left:${W * 0.38}px;top:${-H * 0.04}px;background:#1f6b8f"></div>
${d.etiqueta && !d.semTitulo ? `<div class="tagp" id="tag">${txt(d.etiqueta, 24)}</div>` : ''}
${d.titulo && !d.semTitulo ? `<div class="tit" id="tit">${tituloHtml(d.titulo, d.destaque)}</div>` : ''}
<div class="ilu">${des.html}</div>
${masc ? `<div id="masc" style="position:absolute;left:${vertical ? W * 0.01 : W * 0.03}px;top:${(vertical ? H * 0.765 : H * 0.9) - mascH}px;width:240px;height:360px;transform-origin:0 0"><div style="transform:scale(${mascEsc});transform-origin:0 0">${mascoteSvg(d.mascote.roupa)}</div></div>` : ''}</div>
<div id="marca" style="position:fixed;left:0;top:0;width:2px;height:2px;background:rgb(0,0,77);z-index:99"></div>
<script>
const cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));const eo=x=>1-Math.pow(1-cl(x),3);
const back=x=>{x=cl(x);const c=1.9;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const ap=(t,s,d=.5)=>cl((t-s)/Math.max(.01,d));const $=id=>document.getElementById(id);const $$=s=>[...document.querySelectorAll(s)];
const k=${k};
const fmtN=(x,alvo,suf)=>{const c=Number.isInteger(+alvo)?0:Math.min(2,(String(alvo).split('.')[1]||'').length);return x.toLocaleString('pt-BR',{minimumFractionDigits:c,maximumFractionDigits:c})+(suf||'')};
window.BOCA=${d.mascote ? JSON.stringify((d.mascote.boca || []).map((x) => Math.round(x * 100) / 100)) : '[]'};window.MASC_HUMOR=${JSON.stringify(d.mascote ? d.mascote.humor || 'normal' : '')};window.MASC_CONT=${d.continua ? 'true' : 'false'};
function anim(t){${des.anim}}
window.setT=function(t){
 t+=${d.continua ? 1.2 : 0}; // pedaço seguinte da mesma cena: o cartão já está na tela
 $('l1').style.transform='translate('+Math.sin(t*.4)*60+'px,'+Math.cos(t*.3)*80+'px)';
 $('l2').style.transform='translate('+Math.cos(t*.35)*70+'px,'+Math.sin(t*.45)*60+'px)';
 $('l3').style.transform='translate('+Math.sin(t*.5)*90+'px,0)';
 if($('tag')){$('tag').style.transform='translateX(-50%) translateY('+((1-eo(ap(t,0,.4)))*-30)+'px)';$('tag').style.opacity=eo(ap(t,0,.3));}
 if($('tit')){$('tit').style.transform='translateY('+((1-eo(ap(t,.05,.5)))*40)+'px)';$('tit').style.opacity=eo(ap(t,.05,.4));}
 try{const fa=$('fundoAnim');if(fa)fa.style.transform='translate('+((t*14)%46)+'px,'+((t*9)%46)+'px)';}catch(e){}
 if(!window.__fitOk){window.__fitOk=1;try{
   const tt=$('tit');if(tt){let s=parseFloat(getComputedStyle(tt).fontSize);const max=${Math.round(iluTop - titTop - 14)};while(tt.scrollHeight>max&&s>34){s-=3;tt.style.fontSize=s+'px';}}
   // Encaixe: o desenho cresce e fica centralizado no espaço livre (entre a manchete e o mascote/legenda) — sem sobrar vazio
   ${['inscreva', 'pergunta'].includes(d.tipo) ? '' : `const il=document.querySelector('.ilu');if(il){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;il.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(r.width<2||r.height<2||r.width>${W * 1.2})return;x0=Math.min(x0,r.left);y0=Math.min(y0,r.top);x1=Math.max(x1,r.right);y1=Math.max(y1,r.bottom);});
     if(x1>x0&&y1>y0){const s=${escala},L0=${iluLeft},T0=${iluTop};const lx=(x0-L0)/s,ly=(y0-T0)/s,lw=(x1-x0)/s,lh=(y1-y0)/s;
       const ax=${vertical ? W * 0.03 : masc ? W * 0.2 : W * 0.06},aw=${vertical ? W * 0.94 : masc ? W * 0.74 : W * 0.88},ay=T0,ah=${vertical ? H * (masc ? 0.595 : 0.68) : H * 0.9}-T0;
       const s2=Math.min(aw/lw,ah/lh,s*1.5);if(s2>s*1.04||s2<s){il.style.left=(ax+(aw-lw*s2)/2-lx*s2)+'px';il.style.top=(ay+(ah-lh*s2)/2-ly*s2)+'px';il.style.transform='scale('+s2+')';}}}`}
   const nn=$('nn'),nv=$('nv');if(nn&&nv){const o=nv.textContent;if(nv.dataset.final)nv.textContent=nv.dataset.final;nn.style.whiteSpace='nowrap';nn.style.display='inline-block';let s=parseFloat(getComputedStyle(nn).fontSize);while(nn.scrollWidth>930&&s>50){s-=6;nn.style.fontSize=s+'px';}nv.textContent=o;}
 }catch(e){}}
 try{const fj=document.getElementsByClassName('fj');if(fj.length){const q=Math.min(fj.length-1,Math.floor((t-${d.continua ? 1.2 : 0})*12));for(let i=0;i<fj.length;i++)fj[i].style.visibility=i===q?'visible':'hidden';}}catch(e){}
 try{anim(t)}catch(e){window.__erro=String(e)}
 try{${MASCOTE_ANIM}}catch(e){window.__erro=String(e)}
};
setT(0);
</script></body></html>`;
}

/**
 * Desenha a ilustração num .mp4 de `duracao` segundos.
 * `capturar(pagina, W, H)` devolve o desenhista { formato: 'bgra'|'jpeg', quadro(t) -> Buffer, fechar() }:
 * no app é a janela invisível do Electron (quadro cru BGRA do tamanho W×H); no teste, o Playwright (JPEG).
 * Os quadros vão direto para o ffmpeg (sem arquivos no disco).
 */
async function renderizarIlustracao(d, { W, H, duracao, fps, saida, capturar, ffmpeg, checar }) {
  if (!valida(d)) throw new Error(`ilustração inválida (${d?.tipo || 'sem tipo'})`);
  const dir = path.join(path.dirname(saida), 'ilustracao_' + path.basename(saida, '.mp4'));
  fs.mkdirSync(dir, { recursive: true });
  const pagina = path.join(dir, 'pagina.html');
  fs.writeFileSync(pagina, paginaHtml(d, { W, H, duracao }));
  const desenhista = await capturar(pagina, W, H);
  // Desenha 12 quadros por segundo e o ffmpeg completa até o FPS do vídeo: fica liso e leva metade do tempo
  const passo = 2;
  const total = Math.max(1, Math.round(duracao * fps));
  const entrada = desenhista.formato === 'bgra'
    ? ['-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-framerate', String(fps / passo), '-i', 'pipe:0']
    : ['-f', 'image2pipe', '-framerate', String(fps / passo), '-i', 'pipe:0'];
  const { spawn } = require('child_process');
  const proc = spawn(ffmpeg, ['-hide_banner', '-y', '-loglevel', 'error', ...entrada,
    '-vf', `fps=${fps},scale=${W}:${H},setsar=1,format=yuv420p`, '-frames:v', String(total), '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(fps), saida], { windowsHide: true });
  let erro = '';
  proc.stderr.on('data', (x) => (erro = (erro + x).slice(-2000)));
  const fim = new Promise((ok, falha) => {
    proc.on('error', falha);
    proc.on('close', (c) => (c === 0 ? ok() : falha(new Error('ffmpeg da ilustração: ' + erro.trim().slice(-300)))));
  });
  proc.stdin.on('error', () => {});
  const escrever = (buf) => new Promise((ok) => (proc.stdin.write(buf) ? ok() : proc.stdin.once('drain', ok)));
  try {
    for (let q = 0; q < total; q += passo) {
      if (checar) {
        try {
          checar();
        } catch (e) {
          proc.kill('SIGKILL');
          throw e;
        }
      }
      await escrever(await desenhista.quadro(q / fps));
    }
    proc.stdin.end();
    await fim;
  } catch (e) {
    try { proc.kill('SIGKILL'); } catch {}
    throw e;
  } finally {
    await desenhista.fechar().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return saida;
}

/**
 * Desenhista do app: uma janela invisível do Electron.
 * A janela nunca passa do tamanho da tela (num notebook 1366×768 o Short tem 1920 de altura), então cada quadro
 * é desenhado em pedaços do tamanho que couber e montado inteiro aqui (BGRA cru, W×H).
 */
function desenhistaElectron() {
  return async (pagina, W, H) => {
    const { BrowserWindow, screen } = require('electron');
    let tela = { width: 1280, height: 720 };
    try {
      tela = screen.getPrimaryDisplay().size;
    } catch {}
    const win = new BrowserWindow({
      width: Math.min(W, tela.width),
      height: Math.min(H, tela.height),
      show: false,
      frame: false,
      useContentSize: true,
      enableLargerThanScreen: true,
      webPreferences: { offscreen: true, javascript: true, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    win.webContents.setFrameRate(60);
    await win.loadURL(pathToFileURL(pagina).href);
    await win.webContents.executeJavaScript('document.fonts.ready.then(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>1))))').catch(() => true);
    const [tw, th] = (await win.webContents.executeJavaScript('[innerWidth, innerHeight]')).map((x) => Math.max(16, Math.floor(x)));
    const pedacos = [];
    for (let y = 0; y < H; y += th) for (let x = 0; x < W; x += tw) pedacos.push({ x, y, w: Math.min(tw, W - x), h: Math.min(th, H - y) });
    const quadro = Buffer.alloc(W * H * 4);
    // Cada pedaço leva um "carimbo" de 2 px no canto (número do pedaço em cor). Só vale a imagem com o carimbo certo:
    // assim nunca entra um desenho atrasado. Depois o carimbo é coberto com o pixel vizinho.
    let contador = 0;
    const capturarCom = async (n) => {
      for (let tentativa = 0; tentativa < 60; tentativa++) {
        const img = await win.webContents.capturePage({ x: 0, y: 0, width: tw, height: th });
        const sz = img.getSize();
        const b = img.toBitmap();
        // BGRA: o canto (0,0)
        if (b[0] === 77 && b[1] === ((n >> 8) & 255) && b[2] === (n & 255)) return { img, sz };
        await new Promise((r) => setTimeout(r, tentativa < 5 ? 4 : 20));
      }
      throw new Error('a janela da ilustração não atualizou o desenho');
    };
    return {
      formato: 'bgra',
      async quadro(t) {
        for (const p of pedacos) {
          const n = (contador = (contador + 1) % 65536);
          await win.webContents.executeJavaScript(
            `setT(${t.toFixed(4)});document.getElementById('raiz').style.transform='translate(${-p.x}px,${-p.y}px)';` +
              `document.getElementById('marca').style.background='rgb(${n & 255},${(n >> 8) & 255},77)';true`
          );
          win.webContents.invalidate();
          let { img, sz } = await capturarCom(n);
          if (sz.width !== tw || sz.height !== th) img = img.resize({ width: tw, height: th }); // Windows com escala 125%, 150%...
          if (p.w !== tw || p.h !== th) img = img.crop({ x: 0, y: 0, width: p.w, height: p.h });
          const bmp = img.toBitmap();
          // cobre o carimbo (2×2 px) com a cor do pixel ao lado
          for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) bmp.copy(bmp, (yy * p.w + xx) * 4, (yy * p.w + 3) * 4, (yy * p.w + 4) * 4);
          for (let linha = 0; linha < p.h; linha++) bmp.copy(quadro, ((p.y + linha) * W + p.x) * 4, linha * p.w * 4, (linha + 1) * p.w * 4);
        }
        return quadro;
      },
      async fechar() {
        if (!win.isDestroyed()) win.destroy();
      },
    };
  };
}

module.exports = { TIPOS, valida, paginaHtml, renderizarIlustracao, desenhistaElectron };
