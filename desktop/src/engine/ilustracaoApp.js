// Ilustrações "de aplicativo" (inspiradas nos explicadores de política que o dono gostou, com a cara do canal):
//  - recibo: os gastos linha por linha, com os valores rolando, e o TOTAL em destaque
//  - pix: tela de celular com uma transferência/arrecadação, o valor subindo e o "concluído"
//  - rota: viagem de um lugar para outro (avião voando no arco entre os dois pinos)
//  - impacto: a frase-chave da notícia GIGANTE, palavra por palavra, com um tranco no fim
// Mesmo palco 1000×780 e mesmas cores das outras ilustrações. Nada de marca/logo de terceiros.

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 15/11: o limite é uma folga de 40% (a letra diminui para caber); se ainda passar, corta em palavra inteira com "…"
const corta = (t, max) => {
  const x = String(t ?? '').replace(/\s+/g, ' ').trim();
  const lim = Math.round(max * 1.4);
  if (x.length <= lim) return x;
  const c = x.slice(0, lim);
  const e = c.lastIndexOf(' ');
  return (e > lim * 0.5 ? c.slice(0, e) : c).replace(/[\s,;:–—-]+$/, '').replace(/\s+(de|da|do|das|dos|e|a|o|as|os|em|no|na|com|para|por|que|um|uma)$/i, '') + '…';
};
const txt = (t, max = 80) => esc(corta(t, max)).replace(/(R\$|US\$|€) /g, '$1&nbsp;');

/** "R$ 2,9 milhões" -> { pre:'R$ ', n:2.9, dec:1, suf:' milhões' } (para o número rolar); sem número -> null */
function partesValor(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^(.*?)(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(.*)$/);
  if (!m) return null;
  const bruto = m[2];
  const dec = bruto.includes(',') ? bruto.split(',')[1].length : 0;
  const n = Number(bruto.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return { pre: m[1], n, dec: Math.min(2, dec), suf: m[3] };
}
/** Valor que rola de 0 até o final (classe .cnt, animado pelo CONTA abaixo). */
function valorHtml(v, max = 18, extra = '') {
  const p = partesValor(v);
  if (!p) return `<span ${extra}>${txt(v, max)}</span>`;
  return `<span class="cnt" ${extra} data-n="${p.n}" data-dec="${p.dec}" data-pre="${esc(p.pre)}" data-suf="${esc(p.suf)}" data-fim="${esc(corta(v, max))}">${esc(p.pre)}0${esc(p.suf)}</span>`;
}
// anima todos os .cnt: cada um rola entre o seu data-ini (s) e data-ini + .7 s
const CONTA = `$$('.cnt').forEach(e=>{const ini=parseFloat(e.dataset.ini||0)*k;const p=eo(ap(t,ini,.7*k));const n=parseFloat(e.dataset.n);const d=+e.dataset.dec;
  e.textContent=p>=1?e.dataset.fim:(e.dataset.pre+(n*p).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+e.dataset.suf);});`;

const APP = {
  recibo(d) {
    const itens = (d.itens || []).filter((i) => i && i.texto && i.valor).slice(0, 4);
    const alt = 96;
    const topo = 150;
    const totalTop = topo + itens.length * alt + 26;
    const altura = totalTop + (d.total ? 160 : 40);
    const zig = Array.from({ length: 21 }, (_, i) => `${i * 30},${i % 2 ? 0 : 22}`).join(' ');
    return {
      html: `<div id="rc" style="position:absolute;left:170px;top:0;width:660px;height:${altura}px">
        <div style="position:absolute;inset:0;background:#f6f1e4;border-radius:18px 18px 0 0;box-shadow:0 30px 70px rgba(0,0,0,.55)"></div>
        <svg viewBox="0 0 600 22" preserveAspectRatio="none" style="position:absolute;left:0;bottom:-21px;width:660px;height:22px"><polygon points="0,0 ${zig} 600,0" fill="#f6f1e4"/></svg>
        <div style="position:absolute;left:44px;right:44px;top:34px;text-align:center;color:#1b2236">
          <div style="font-size:26px;letter-spacing:8px;font-weight:800;color:#8a8370">RECIBO</div>
          <div style="font-size:40px;font-weight:800;margin-top:6px;white-space:nowrap;overflow:hidden">${txt(d.cabecalho || d.titulo || 'Gastos', 26)}</div>
        </div>
        <div style="position:absolute;left:44px;right:44px;top:${topo - 14}px;border-top:4px dashed #cfc6ae"></div>
        ${itens
          .map(
            (it, i) => `<div class="rl" style="position:absolute;left:44px;right:44px;top:${topo + i * alt}px;height:${alt}px;display:flex;align-items:center;gap:18px;color:#1b2236;border-bottom:2px solid #e4dcc6;opacity:0">
            <div style="flex:1;font-size:${String(it.texto).length > 20 ? 30 : 36}px;font-weight:700;line-height:1.1">${txt(it.texto, 28)}</div>
            <div class="num" style="font-size:40px;font-weight:800;white-space:nowrap;color:#b4372f">${valorHtml(it.valor, 16, `data-ini="${(0.75 + i * 0.5).toFixed(2)}"`)}</div></div>`
          )
          .join('')}
        ${d.total ? `<div id="rt" style="position:absolute;left:24px;right:24px;top:${totalTop}px;height:120px;border-radius:18px;background:#1b2236;display:flex;align-items:center;justify-content:space-between;padding:0 30px;opacity:0">
            <div style="font-size:28px;font-weight:800;letter-spacing:3px;color:var(--ouro);flex:none">${txt(d.totalTexto || 'TOTAL', 12).toUpperCase()}</div>
            <div class="num" id="rtv" style="font-size:${Math.max(34, Math.min(60, Math.floor(430 / (Math.max(6, String(d.total).length) * 0.62))))}px;font-weight:800;color:#fff;white-space:nowrap;text-align:right">${valorHtml(d.total, 18, `data-ini="${(0.85 + itens.length * 0.5).toFixed(2)}"`)}</div></div>` : ''}
      </div>`,
      anim: `const p=eo(ap(t,.05*k,.6*k));$('rc').style.transform='translateY('+((1-p)*-820)+'px)';
        $$('.rl').forEach((e,i)=>{const q=eo(ap(t,(.6+i*.5)*k,.35));e.style.opacity=q;e.style.transform='translateX('+((1-q)*-40)+'px)';});
        if($('rt')){const s=(.75+${itens.length}*.5)*k;const q=back(ap(t,s,.4));$('rt').style.opacity=Math.min(1,q*1.5);
          const tr=ap(t,s+.9*k,.35);const sh=tr>0&&tr<1?Math.sin(tr*40)*8*(1-tr):0;$('rt').style.transform='scale('+(.6+.4*q)+') translateX('+sh+'px)';}
        ${CONTA}`,
    };
  },

  pix(d) {
    const ok = d.status !== 'pendente';
    return {
      html: `<div id="cel" style="position:absolute;left:270px;top:0;width:460px;height:780px;border-radius:64px;background:#10131f;border:10px solid #2a3354;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden">
        <div style="position:absolute;left:150px;top:14px;width:140px;height:26px;border-radius:14px;background:#000"></div>
        <div style="position:absolute;left:0;right:0;top:0;height:220px;background:linear-gradient(160deg,#1fb5a8,#0f7f86)"></div>
        <div style="position:absolute;left:34px;top:66px;color:#e9fffb;font-size:30px;font-weight:800;letter-spacing:1px">◆ ${txt(d.app || 'Pix', 18)}</div>
        <div style="position:absolute;left:34px;top:116px;right:34px;color:#e9fffb;font-size:34px;font-weight:700;line-height:1.15">${txt(d.acao || 'Transferência', 30)}</div>
        <div id="pv" style="position:absolute;left:24px;right:24px;top:250px;text-align:center">
          <div style="font-size:26px;color:#8f97ad;font-weight:700;letter-spacing:2px;text-transform:uppercase">${txt(d.rotuloValor || 'Valor', 22)}</div>
          <div class="num" id="pvn" style="font-size:${Math.max(34, Math.min(64, Math.floor(390 / (Math.max(5, String(d.valor || '').length) * 0.62))))}px;font-weight:800;color:#fff;white-space:nowrap;margin-top:8px">${valorHtml(d.valor, 18, 'data-ini="0.7"')}</div>
        </div>
        ${[['De', d.de], ['Para', d.para]]
          .filter((x) => x[1])
          .map(
            (x, i) => `<div class="pl" style="position:absolute;left:34px;right:34px;top:${430 + i * 96}px;display:flex;align-items:center;gap:18px;opacity:0">
            <div style="width:60px;height:60px;border-radius:50%;background:#1f2a4a;display:flex;align-items:center;justify-content:center;font-size:30px;flex:none">${i ? '🏛️' : '👥'}</div>
            <div><div style="font-size:22px;color:#8f97ad;font-weight:700">${x[0]}</div><div style="font-size:30px;font-weight:800;color:#fff;line-height:1.1">${txt(x[1], 24)}</div></div></div>`
          )
          .join('')}
        <div id="pok" style="position:absolute;left:34px;right:34px;top:640px;height:96px;border-radius:24px;background:${ok ? '#1f9d55' : '#b8860b'};display:flex;align-items:center;justify-content:center;gap:14px;color:#fff;font-size:32px;font-weight:800;opacity:0">
          <span style="font-size:40px">${ok ? '✓' : '⏳'}</span>${txt(d.statusTexto || (ok ? 'Concluído' : 'Em andamento'), 20)}</div>
      </div>
      ${d.texto ? `<div id="ptx" class="cardx" style="left:0;top:560px;width:250px;padding:20px;font-size:28px;font-weight:700;line-height:1.2;text-align:center;opacity:0">${txt(d.texto, 50)}</div>` : ''}`,
      anim: `const p=back(ap(t,.05*k,.55*k));$('cel').style.transform='translateY('+((1-Math.min(1,p))*500)+'px) rotate('+((1-Math.min(1,p))*8)+'deg)';$('cel').style.opacity=Math.min(1,p*2);
        $$('.pl').forEach((e,i)=>{const q=eo(ap(t,(1.5+i*.35)*k,.35));e.style.opacity=q;e.style.transform='translateX('+((1-q)*40)+'px)';});
        const o=back(ap(t,2.3*k,.4));$('pok').style.opacity=Math.min(1,o*1.5);$('pok').style.transform='scale('+(.5+.5*o)+')';
        if($('ptx')){const q=eo(ap(t,2.6*k,.4));$('ptx').style.opacity=q;}
        $('pv').style.opacity=eo(ap(t,.55*k,.25));$('pvn').style.transform='scale('+(1+.06*Math.sin(Math.max(0,t-1.4*k)*5)*(t>1.4*k?1:0))+')';
        ${CONTA}`,
    };
  },

  rota(d) {
    // dois pinos e um arco; o avião (ou o ícone escolhido) percorre o arco
    const icone = { aviao: '✈️', carro: '🚗', navio: '🚢', onibus: '🚌' }[d.meio] || '✈️';
    const A = [150, 470];
    const B = [850, 470];
    const C = [500, 80];
    return {
      html: `<svg viewBox="0 0 1000 780" width="1000" height="780" style="position:absolute;left:0;top:0;overflow:visible">
          <defs><radialGradient id="rg"><stop offset="0" stop-color="#2b4a9a" stop-opacity=".55"/><stop offset="1" stop-color="#2b4a9a" stop-opacity="0"/></radialGradient></defs>
          <ellipse cx="500" cy="470" rx="520" ry="300" fill="url(#rg)"/>
          ${Array.from({ length: 9 }, (_, i) => `<line x1="${60 + i * 110}" y1="200" x2="${60 + i * 110}" y2="700" stroke="#2a3354" stroke-width="2" opacity=".6"/>`).join('')}
          <path id="arco" d="M${A} Q${C} ${B}" fill="none" stroke="var(--ouro)" stroke-width="8" stroke-linecap="round" stroke-dasharray="22 18"/>
        </svg>
        ${[
          [A, d.de, d.deTexto],
          [B, d.para, d.paraTexto],
        ]
          .map(
            ([p, nome, sub], i) => `<div class="pino" style="position:absolute;left:${p[0] - 150}px;top:${p[1] - 120}px;width:300px;text-align:center;opacity:0">
            <div style="font-size:84px;line-height:1;filter:drop-shadow(0 8px 10px rgba(0,0,0,.5))">📍</div>
            <div style="display:inline-block;margin-top:14px;background:${i ? 'var(--ouro)' : 'var(--card)'};color:${i ? '#1a1206' : 'var(--txt)'};border:3px solid var(--ouro);border-radius:22px;padding:10px 22px;font-size:${String(nome).length > 12 ? 32 : 40}px;font-weight:800;white-space:nowrap">${txt(nome, 20)}</div>
            ${sub ? `<div style="font-size:28px;font-weight:700;color:var(--mut);margin-top:8px">${txt(sub, 24)}</div>` : ''}</div>`
          )
          .join('')}
        <div id="av" style="position:absolute;left:0;top:0;font-size:96px;line-height:1;filter:drop-shadow(0 12px 14px rgba(0,0,0,.55));opacity:0">${icone}</div>
        ${d.texto ? `<div id="rtx" style="position:absolute;left:0;right:0;top:660px;text-align:center;opacity:0"><span style="background:var(--card);border:3px solid var(--borda);border-radius:20px;padding:12px 28px;font-size:36px;font-weight:800">${txt(d.texto, 34)}</span></div>` : ''}`,
      anim: `$$('.pino').forEach((e,i)=>{const q=back(ap(t,(.1+i*.35)*k,.4));e.style.opacity=Math.min(1,q);e.style.transform='translateY('+((1-q)*-80)+'px)';});
        const L=$('arco').getTotalLength();const pa=eo(ap(t,.5*k,1.4*k));$('arco').style.strokeDashoffset=String(-t*40);$('arco').style.opacity=.25+.75*pa;
        const pv=eo(ap(t,.7*k,1.6*k));const u=Math.min(.86,Math.max(.001,pv*.86));const pt=$('arco').getPointAtLength(L*u);const pt2=$('arco').getPointAtLength(Math.min(L,L*u+4));
        const ang=Math.atan2(pt2.y-pt.y,pt2.x-pt.x)*180/Math.PI;$('av').style.opacity=t>.7*k?1:0;
        $('av').style.transform='translate('+(pt.x-48)+'px,'+(pt.y-56)+'px) rotate('+(${icone === '✈️' ? 'ang+45' : '0'})+'deg)';
        if($('rtx')){const q=eo(ap(t,2.2*k,.4));$('rtx').style.opacity=q;$('rtx').style.transform='translateY('+((1-q)*30)+'px)';}`,
    };
  },

  impacto(d) {
    const palavras = corta(d.texto, 40).replace(/(R\$|US\$|€) (?=\d)/g, '$1\u00a0').split(' ').filter(Boolean);
    const n = palavras.join(' ').length;
    const tam = n <= 10 ? 170 : n <= 16 ? 140 : n <= 24 ? 116 : 96;
    const destaque = new Set(corta(d.destaque || '', 30).toLowerCase().split(' ').filter(Boolean));
    return {
      html: `<div id="imp" style="position:absolute;left:0;right:0;top:${d.sub ? 90 : 150}px;text-align:center;font-weight:800;font-size:${tam}px;line-height:1.02;letter-spacing:-2px;text-transform:uppercase">
          ${palavras.map((w) => `<span class="pw" style="display:inline-block;margin:0 14px;opacity:0;${destaque.has(w.toLowerCase()) || /\d/.test(w) ? 'color:var(--ouro2)' : ''}">${txt(w, 24)}</span>`).join(' ')}
        </div>
        <div id="imb" style="position:absolute;left:250px;width:500px;height:16px;border-radius:8px;background:${d.cor === 'vermelho' ? 'var(--nao)' : 'var(--ouro)'};top:${d.sub ? 560 : 610}px;transform-origin:50% 50%;transform:scaleX(0)"></div>
        ${d.sub ? `<div id="ims" style="position:absolute;left:40px;right:40px;top:610px;text-align:center;font-size:44px;font-weight:700;color:var(--mut);opacity:0">${txt(d.sub, 44)}</div>` : ''}`,
      anim: `const pw=$$('.pw');pw.forEach((e,i)=>{const q=back(ap(t,(.1+i*.22)*k,.32));e.style.opacity=Math.min(1,q*1.6);e.style.transform='scale('+(1.8-.8*q)+')';});
        const fim=(.1+pw.length*.22)*k;const tr=ap(t,fim,.4);const sh=tr>0&&tr<1?(1-tr):0;
        $('imp').style.transform='translate('+(Math.sin(t*70)*14*sh)+'px,'+(Math.cos(t*55)*10*sh)+'px)';
        $('imb').style.transform='scaleX('+eo(ap(t,fim,.4))+')';
        if($('ims'))$('ims').style.opacity=eo(ap(t,fim+.2,.4));`,
  };
  },
};

// ───── 15/11: desenhos novos no padrão dos explicadores que o dono gostou ─────
const COR_COL = { ouro: 'var(--ouro)', vermelho: 'var(--nao)', verde: 'var(--ok)', azul: '#4f8cff', cinza: '#8f97ad' };
Object.assign(APP, {
  // Colunas que CRESCEM do chão, com o número contando em cima (compara 2 a 4 valores: antes x depois, estado x estado)
  colunas(d) {
    const cols = (d.colunas || []).filter((c) => c && c.rotulo && partesValor(c.valor)).slice(0, 4);
    const nums = cols.map((c) => partesValor(c.valor).n);
    const maior = Math.max(...nums, 1);
    const larg = cols.length > 3 ? 170 : cols.length > 2 ? 210 : 250;
    const vao = (840 - cols.length * larg) / Math.max(1, cols.length - 1);
    const base = 600;
    const altMax = 400;
    return {
      html: `<div class="cx" style="position:absolute;left:0;top:0;width:1000px;height:740px;background:var(--card);border:2px solid var(--borda);border-radius:30px;box-shadow:0 24px 60px rgba(0,0,0,.35)">
          ${[0, 1, 2, 3].map((i) => `<div style="position:absolute;left:60px;right:60px;top:${base - (i * altMax) / 3}px;border-top:3px dashed var(--borda)"></div>`).join('')}
          ${cols
            .map((c, i) => {
              const h = Math.max(24, (nums[i] / maior) * altMax);
              const cor = COR_COL[c.cor] || (nums[i] === maior ? 'var(--ouro)' : '#4f8cff');
              const left = 80 + i * (larg + vao);
              return `<div class="colb" data-h="${h}" style="position:absolute;left:${left}px;width:${larg}px;top:${base}px;height:0;background:${cor};border-radius:16px 16px 0 0"></div>
            <div class="coln" style="position:absolute;left:${left - vao / 2 + 4}px;width:${larg + vao - 8}px;top:${base - h - 84}px;text-align:center;white-space:nowrap;font-size:${Math.min(64, Math.round((larg + vao - 20) / Math.max(4, String(c.valor).length * 0.6)))}px;font-weight:800;opacity:0">${valorHtml(c.valor, 16, `data-ini="${0.3 + i * 0.35}"`)}</div>
            <div class="colr" style="position:absolute;left:${left - 20}px;width:${larg + 40}px;top:${base + 18}px;text-align:center;font-size:34px;font-weight:800;line-height:1.1;text-transform:uppercase;letter-spacing:1px">${txt(c.rotulo, 22)}</div>`;
            })
            .join('')}
        </div>
        ${d.nota ? `<div id="cln" style="position:absolute;left:0;right:0;top:752px;text-align:center;font-size:34px;font-weight:700;color:var(--mut)">${txt(d.nota, 50)}</div>` : ''}`,
      anim: `$$('.colb').forEach((e,i)=>{const p=eo(ap(t,(.3+i*.35)*k,.7*k));const h=+e.dataset.h*p;e.style.height=h+'px';e.style.top=(${base}-h)+'px';});
        $$('.coln').forEach((e,i)=>{e.style.opacity=eo(ap(t,(.3+i*.35)*k,.3));});
        if($('cln'))$('cln').style.opacity=eo(ap(t,(.6+${cols.length}*.35)*k,.4));${CONTA}`,
    };
  },
  // Tabela de STATUS: cada linha recebe um CARIMBO que cai com um tranco (cumprido / não cumprido / adiado...)
  status(d) {
    const itens = (d.itens || []).filter((i) => i && i.texto && i.status).slice(0, 4);
    const alt = itens.length > 3 ? 138 : 160;
    const cor = (c, st) => (c === 'vermelho' || (!c && /n[aã]o|adiad|negad|vetad|barrad|fora|atras|proib|derrub|rejeit|cancel/i.test(st)) ? 'var(--nao)' : c === 'ouro' || (!c && /andamento|espera|an[aá]lis|votando|pendente|tramit|julgamento|prazo/i.test(st)) ? 'var(--ouro)' : 'var(--ok)');
    const maisLongo = Math.max(...itens.map((i) => String(i.status).length));
    const cab = Array.isArray(d.cabecalho) && d.cabecalho.length === 2 ? d.cabecalho : ['O QUE', 'SITUAÇÃO'];
    return {
      html: `<div class="cx" id="stt" style="position:absolute;left:0;top:0;width:1000px;height:${96 + itens.length * alt}px;background:var(--card);border:2px solid var(--borda);border-radius:26px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.35)">
          <div style="height:96px;background:#0d1226;display:flex;align-items:center;justify-content:space-between;padding:0 44px;color:#fff;font-size:30px;font-weight:800;letter-spacing:3px;text-transform:uppercase"><span>${txt(cab[0], 18)}</span><span>${txt(cab[1], 14)}</span></div>
          ${itens
            .map(
              (it, i) => `<div class="stl" style="position:absolute;left:0;right:0;top:${96 + i * alt}px;height:${alt}px;border-top:2px solid var(--borda);display:flex;align-items:center;padding:0 44px;opacity:0">
            <div style="width:${maisLongo > 12 ? 500 : 560}px;font-size:42px;font-weight:800;line-height:1.12">${txt(it.texto, 34)}</div>
            <div class="stc" style="position:absolute;right:30px;top:${alt / 2 - 40}px;border:6px solid ${cor(it.cor, it.status)};color:${cor(it.cor, it.status)};border-radius:14px;padding:6px 16px;font-size:${String(it.status).length > 12 ? 26 : String(it.status).length > 9 ? 30 : 36}px;font-weight:800;letter-spacing:2px;text-transform:uppercase;white-space:nowrap;opacity:0;background:rgba(0,0,0,.08)">${txt(it.status, 16)}</div></div>`
            )
            .join('')}
        </div>`,
      anim: `$$('.stl').forEach((e,i)=>{const p=eo(ap(t,(.15+i*.5)*k,.35));e.style.opacity=p;e.style.transform='translateX('+((1-p)*-80)+'px)';
          const c=e.querySelector('.stc');const q=ap(t,(.45+i*.5)*k,.22);c.style.opacity=q>0?1:0;c.style.transform='rotate(-9deg) scale('+(2.3-1.3*eo(q))+')';
          if(q>0&&q<1){$('stt').style.transform='translate('+(Math.sin(t*90)*5*(1-q))+'px,'+(Math.cos(t*70)*4*(1-q))+'px)';}});`,
    };
  },
});

function validaApp(d) {
  switch (d.tipo) {
    case 'recibo': return Array.isArray(d.itens) && d.itens.filter((i) => i && i.texto && i.valor).length >= 2;
    case 'pix': return !!d.valor && !!(d.de || d.para);
    case 'rota': return !!d.de && !!d.para;
    case 'impacto': return !!String(d.texto || '').trim();
    case 'colunas': return Array.isArray(d.colunas) && d.colunas.filter((c) => c && c.rotulo && partesValor(c.valor)).length >= 2;
    case 'status': return Array.isArray(d.itens) && d.itens.filter((i) => i && i.texto && i.status).length >= 2;
    default: return false;
  }
}

module.exports = { APP, validaApp, TIPOS_APP: Object.keys(APP), partesValor };
