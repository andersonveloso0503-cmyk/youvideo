// Ilustrações que EXPLICAM O MECANISMO (não só o dado): o dinheiro indo de um para o outro, o valor sendo dividido,
// um sistema ligando vários órgãos e o plenário com as cadeiras se acendendo na votação.
// Desenho próprio, traço simples, no mesmo palco 1000×780 das outras ilustrações.

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const txt = (t, max = 80) => nb(txt0(t, max));
const nb = (h) => h.replace(/(R\$|US\$|€) /g, '$1&nbsp;');
const txt0 = (t, max = 80) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return esc(s);
  const c = s.slice(0, max + 1);
  const i = c.lastIndexOf(' ');
  return esc((i > max * 0.5 ? c.slice(0, i) : s.slice(0, max)).replace(/[,;:.\-–]+$/, ''));
};

// ───────── Personagens e lugares (viewBox 200×200) ─────────
const pele = '#f1c095';
const corpo = (cor, extra = '') => `<circle cx="100" cy="62" r="34" fill="${pele}"/><path d="M42 196 q0 -84 58 -84 q58 0 58 84z" fill="${cor}"/>${extra}`;
const PERSONAGENS = {
  pessoa: `<svg viewBox="0 0 200 200">${corpo('#3a6fd8', '<path d="M66 50 q34 -40 68 0 q-6 -30 -34 -30 q-28 0 -34 30z" fill="#3a2618"/><circle cx="88" cy="64" r="4" fill="#1b2236"/><circle cx="112" cy="64" r="4" fill="#1b2236"/><path d="M88 80 q12 8 24 0" stroke="#1b2236" stroke-width="4" fill="none" stroke-linecap="round"/>')}</svg>`,
  trabalhador: `<svg viewBox="0 0 200 200">${corpo('#e8783a', '<path d="M62 52 q38 -50 76 0z" fill="#ffcc33"/><rect x="58" y="48" width="84" height="10" rx="5" fill="#e8b020"/><circle cx="88" cy="68" r="4" fill="#1b2236"/><circle cx="112" cy="68" r="4" fill="#1b2236"/><path d="M88 84 q12 8 24 0" stroke="#1b2236" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="92" y="130" width="16" height="66" fill="#2a3354"/>')}</svg>`,
  aposentado: `<svg viewBox="0 0 200 200">${corpo('#8a6a9a', '<path d="M66 48 q34 -34 68 0 q-4 -24 -34 -24 q-30 0 -34 24z" fill="#e6e6ee"/><circle cx="88" cy="64" r="9" fill="none" stroke="#1b2236" stroke-width="3"/><circle cx="112" cy="64" r="9" fill="none" stroke="#1b2236" stroke-width="3"/><path d="M97 64 h6" stroke="#1b2236" stroke-width="3"/><path d="M88 82 q12 7 24 0" stroke="#1b2236" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M170 120 v76 M170 120 q0 -14 -14 -14" stroke="#8a5a2a" stroke-width="7" fill="none" stroke-linecap="round"/>')}</svg>`,
  familia: `<svg viewBox="0 0 200 200"><circle cx="70" cy="54" r="28" fill="${pele}"/><path d="M22 196 q0 -76 48 -76 q48 0 48 76z" fill="#3a6fd8"/><circle cx="146" cy="96" r="22" fill="${pele}"/><path d="M108 196 q0 -60 38 -60 q38 0 38 60z" fill="#e8b04a"/><path d="M46 44 q24 -30 48 0 q-4 -22 -24 -22 q-20 0 -24 22z" fill="#3a2618"/><path d="M128 88 q18 -24 36 0 q-2 -16 -18 -16 q-16 0 -18 16z" fill="#6a3a1a"/></svg>`,
  empresa: `<svg viewBox="0 0 200 200"><rect x="30" y="70" width="140" height="120" fill="#8fa3cf"/><rect x="120" y="30" width="22" height="50" fill="#5b6582"/><path d="M30 70 l35 -24 v24 l35 -24 v24 l35 -24 v24z" fill="#5b6582"/>${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect x="${44 + c * 32}" y="${88 + r * 30}" width="18" height="16" fill="#e8f0ff"/>`).join('')).join('')}<rect x="84" y="160" width="32" height="30" fill="#1b2236"/></svg>`,
  loja: `<svg viewBox="0 0 200 200"><rect x="30" y="80" width="140" height="110" fill="#e8f0ff"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${30 + i * 20} 60 h20 v30 q-10 10 -20 0z" fill="${i % 2 ? '#e5484d' : '#ffffff'}"/>`).join('')}<rect x="44" y="110" width="60" height="50" fill="#9fd3ff"/><rect x="118" y="110" width="38" height="80" fill="#2a3354"/><rect x="24" y="186" width="152" height="8" fill="#2a3354"/></svg>`,
  banco: `<svg viewBox="0 0 200 200"><path d="M20 70 l80 -46 80 46z" fill="#c9d2ea"/><rect x="26" y="70" width="148" height="12" fill="#e8b04a"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${38 + i * 28}" y="86" width="14" height="80" fill="#e8f0ff"/>`).join('')}<rect x="20" y="166" width="160" height="14" fill="#c9d2ea"/><text x="100" y="62" text-anchor="middle" font-size="30" font-weight="800" fill="#1b2236" font-family="Mont,Arial">$</text></svg>`,
  maquininha: `<svg viewBox="0 0 200 200"><rect x="52" y="20" width="96" height="164" rx="16" fill="#2a2f45"/><rect x="64" y="34" width="72" height="44" rx="6" fill="#3fbf7f"/><text x="100" y="64" text-anchor="middle" font-size="18" font-weight="800" fill="#0b2a1a" font-family="Mont,Arial">R$</text>${[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `<rect x="${66 + c * 24}" y="${92 + r * 20}" width="18" height="14" rx="3" fill="#c9d2ea"/>`).join('')).join('')}<rect x="40" y="6" width="120" height="18" rx="6" fill="#e8b04a"/></svg>`,
  bet: `<svg viewBox="0 0 200 200"><rect x="56" y="10" width="88" height="180" rx="18" fill="#1b2236" stroke="#5b6582" stroke-width="5"/><rect x="66" y="30" width="68" height="130" rx="6" fill="#2b8a3e"/><circle cx="100" cy="82" r="26" fill="#ffffff"/><path d="M100 64 l14 10 -5 16 h-18 l-5 -16z" fill="#1b2236"/><rect x="74" y="122" width="52" height="22" rx="6" fill="#e8b04a"/><text x="100" y="139" text-anchor="middle" font-size="15" font-weight="800" fill="#1b2236" font-family="Mont,Arial">APOSTA</text></svg>`,
  casa: `<svg viewBox="0 0 200 200"><path d="M20 96 l80 -66 80 66z" fill="#e5484d"/><rect x="40" y="94" width="120" height="96" fill="#e8f0ff"/><rect x="88" y="130" width="28" height="60" fill="#8a5a2a"/><rect x="52" y="112" width="26" height="26" fill="#9fd3ff"/><rect x="128" y="112" width="22" height="26" fill="#9fd3ff"/></svg>`,
  celular: `<svg viewBox="0 0 200 200"><rect x="56" y="10" width="88" height="180" rx="18" fill="#1b2236" stroke="#5b6582" stroke-width="5"/><rect x="66" y="30" width="68" height="130" rx="6" fill="#3a6fd8"/><rect x="76" y="44" width="48" height="10" rx="5" fill="#e8f0ff"/><rect x="76" y="64" width="34" height="10" rx="5" fill="#9fd3ff"/><rect x="76" y="84" width="44" height="10" rx="5" fill="#e8f0ff"/><circle cx="100" cy="176" r="6" fill="#5b6582"/></svg>`,
  computador: `<svg viewBox="0 0 200 200"><rect x="40" y="30" width="120" height="140" rx="12" fill="#2a3354" stroke="#5b6582" stroke-width="5"/>${[0, 1, 2].map((i) => `<rect x="56" y="${48 + i * 40}" width="88" height="28" rx="6" fill="#151c33"/><circle cx="72" cy="${62 + i * 40}" r="5" fill="#3fbf7f"/><circle cx="88" cy="${62 + i * 40}" r="5" fill="#3fbf7f"/><circle cx="104" cy="${62 + i * 40}" r="5" fill="#3fbf7f"/>`).join('')}<rect x="70" y="10" width="20" height="8" rx="3" fill="#e5484d"/><rect x="96" y="10" width="34" height="8" rx="3" fill="#8fa3cf"/></svg>`,
  prefeitura: `<svg viewBox="0 0 200 200"><rect x="40" y="80" width="120" height="100" fill="#c9d2ea"/><path d="M30 82 l70 -44 70 44z" fill="#8fa3cf"/><rect x="98" y="8" width="4" height="34" fill="#c9d2ea"/><path d="M102 10 h32 l-8 9 8 9 h-32z" fill="#3fbf7f"/>${[0, 1, 2].map((i) => `<rect x="${56 + i * 34}" y="100" width="18" height="30" fill="#1b2236"/>`).join('')}<rect x="88" y="142" width="24" height="38" fill="#1b2236"/><rect x="30" y="178" width="140" height="10" fill="#2a3354"/></svg>`,
  cofre: `<svg viewBox="0 0 200 200"><rect x="30" y="34" width="140" height="140" rx="14" fill="#5b6582"/><rect x="44" y="48" width="112" height="112" rx="10" fill="#8fa3cf"/><circle cx="100" cy="104" r="30" fill="#2a3354"/><circle cx="100" cy="104" r="8" fill="#e8b04a"/>${[0, 1, 2, 3].map((i) => `<rect x="97" y="76" width="6" height="14" fill="#e8b04a" transform="rotate(${i * 90} 100 104)"/>`).join('')}<rect x="44" y="174" width="24" height="14" fill="#2a3354"/><rect x="132" y="174" width="24" height="14" fill="#2a3354"/></svg>`,
};
const SINONIMOS = [
  [/governo|uni[aã]o|receita|planalto|federal|tesouro|fisco/i, 'governo'],
  [/prefeit|munic[ií]p|cidade/i, 'prefeitura'],
  [/estado\b|estadual|governador/i, 'prefeitura'],
  [/aposentad|idos|inss|pension/i, 'aposentado'],
  [/trabalhador|empregad|funcion[aá]ri|servidor/i, 'trabalhador'],
  [/fam[ií]lia|benefici|bolsa/i, 'familia'],
  [/empresa|empregador|ind[uú]stria|f[aá]brica|companhia/i, 'empresa'],
  [/loja|com[eé]rcio|vendedor|mercado|lojista/i, 'loja'],
  [/banco|financeira|caixa econ/i, 'banco'],
  [/maquin|cart[aã]o|pagamento|pix/i, 'maquininha'],
  [/\bbets?\b|aposta|cassino/i, 'bet'],
  [/casa|im[oó]vel|apartamento|terreno|aluguel/i, 'casa'],
  [/celular|aplicativo|\bapp\b|rede social|internet/i, 'celular'],
  [/sistema|cadastro|computador|dados|plataforma/i, 'computador'],
  [/cofre|fundo|caixa\b|reserva|poupan/i, 'cofre'],
  [/consumidor|cidad[aã]o|voc[eê]|contribuinte|eleitor|brasileir|pessoa/i, 'pessoa'],
];
// prédios que já existem nas outras ilustrações (Câmara, Senado, STF, Planalto, Polícia, escola, hospital, urna, povo)
function figuraDe(quem, extra = {}) {
  const q = String(quem || '').toLowerCase().trim();
  const todos = { ...extra, governo: extra.planalto, ...PERSONAGENS };
  if (todos[q]) return todos[q];
  for (const [re, nome] of SINONIMOS) if (re.test(q)) return todos[nome] || PERSONAGENS.pessoa;
  if (extra[q]) return extra[q];
  return PERSONAGENS.pessoa;
}
const QUEM = [...Object.keys(PERSONAGENS), 'governo', 'camara', 'senado', 'stf', 'policia', 'escola', 'hospital', 'urna', 'povo'];

const moeda = (i) => `<svg class="moe" data-i="${i}" viewBox="0 0 60 60" style="position:absolute;left:0;top:0;width:60px;height:60px;opacity:0"><circle cx="30" cy="30" r="26" fill="#e8b04a" stroke="#b07a1a" stroke-width="5"/><text x="30" y="40" text-anchor="middle" font-size="26" font-weight="800" fill="#7a4a0a" font-family="Mont,Arial">$</text></svg>`;
const etiquetaValor = (id, v, cor = 'var(--ouro)') => (v ? `<div id="${id}" style="display:inline-block;margin-top:10px;background:${cor};color:#1a1206;border-radius:16px;padding:6px 20px;font-size:40px;font-weight:800;opacity:0">${txt(v, 16)}</div>` : '');

function criar(extra) {
  return {
    // Dinheiro saindo de um e chegando no outro (ou dividido entre dois): imposto, salário, benefício, aposta, multa
    dinheiro(d) {
      const para = (Array.isArray(d.para) ? d.para : [d.para]).filter((p) => p && (p.quem || p.texto)).slice(0, 2);
      const dois = para.length === 2;
      const posDe = { x: 0, y: dois ? 130 : 20 };
      const posPara = dois ? [{ x: 660, y: 0 }, { x: 660, y: 330 }] : [{ x: 640, y: 20 }];
      const ctrl = (i) => (dois ? (i ? 600 : 0) : -60);
      const bloco = (p, pos, id, valor, cor) => `<div class="mpes" id="${id}" style="position:absolute;left:${pos.x}px;top:${pos.y}px;width:${dois && id !== 'mde' ? 340 : 360}px;text-align:center;opacity:0">
          <div style="width:${dois && id !== 'mde' ? 200 : 320}px;margin:0 auto">${figuraDe(p.quem, extra)}</div>
          <div style="font-size:${String(p.texto || '').length > 16 ? 34 : 42}px;font-weight:800;line-height:1.1;margin-top:6px">${txt(p.texto || p.quem, 26)}</div>
          ${etiquetaValor(id + 'v', valor, cor)}</div>`;
      const moedas = Array.from({ length: dois ? 10 : 7 }, (_, i) => moeda(i)).join('');
      return {
        html:
          bloco(d.de || {}, posDe, 'mde', d.valor) +
          para.map((p, i) => bloco(p, posPara[i], 'mpa' + i, p.valor, i === 1 && dois ? '#e5484d' : 'var(--ouro)')).join('') +
          `<svg style="position:absolute;left:0;top:0;width:1000px;height:780px;overflow:visible">${para
            .map((_, i) => `<path class="mseta" d="M${posDe.x + 330} ${posDe.y + 150} Q500 ${ctrl(i)} ${posPara[i].x + 30} ${posPara[i].y + 110}" stroke="#5b6582" stroke-width="6" stroke-dasharray="14 14" fill="none"/>`)
            .join('')}</svg>${moedas}` +
          (d.texto ? `<div id="mtx" style="position:absolute;left:0;right:0;top:${dois ? 650 : 620}px;text-align:center;opacity:0"><span style="background:var(--card);border:3px solid var(--borda);border-radius:24px;padding:12px 30px;font-size:38px;font-weight:700">${txt(d.texto, 48)}</span></div>` : ''),
        anim: `const pe=(id,s)=>{const e=$(id);if(!e)return;const p=back(ap(t,s*k,.45));e.style.opacity=Math.min(1,p);e.style.transform='scale('+(.7+.3*p)+')';};
          pe('mde',.05);${para.map((_, i) => `pe('mpa${i}',${0.35 + i * 0.2});`).join('')}
          $$('.mseta').forEach((e,i)=>{e.style.opacity=eo(ap(t,(.6+i*.2)*k,.4));e.style.strokeDashoffset=-t*40;});
          const P=[${para.map((_, i) => `[${posDe.x + 150},${posDe.y + 130},500,${ctrl(i)},${posPara[i].x + 140},${posPara[i].y + 90}]`).join(',')}];
          $$('.moe').forEach((e,i)=>{const c=P[i%P.length];const ini=(.9+Math.floor(i/P.length)*.35)*k;const per=1.6*k;if(t<ini){e.style.opacity=0;return;}
            const u=((t-ini)%per)/per;const a=(1-u)*(1-u),b=2*(1-u)*u,cc=u*u;const x=a*c[0]+b*c[2]+cc*c[4],y=a*c[1]+b*c[3]+cc*c[5];
            e.style.opacity=u<.08?u/.08:u>.9?(1-u)/.1:1;e.style.transform='translate('+x+'px,'+y+'px) rotate('+(u*540)+'deg)';});
          ['mdev',${para.map((_, i) => `'mpa${i}v'`).join(',')}].forEach((id,i)=>{const e=$(id);if(e){const p=back(ap(t,(i?1.6+i*.25:.5)*k,.4));e.style.opacity=Math.min(1,p);e.style.transform='scale('+p+')';}});
          if($('mtx')){const q=eo(ap(t,2.2*k,.4));$('mtx').style.opacity=q;$('mtx').style.transform='translateY('+((1-q)*20)+'px)';}`,
      };
    },

    // Um valor (nota de dinheiro) que se divide em partes: "de cada R$ 100, R$ 27 vão para o governo"
    divisao(d) {
      const partes = (d.partes || []).filter((p) => p && p.rotulo && Number(p.valor) > 0).slice(0, 4);
      const soma = partes.reduce((s, p) => s + Number(p.valor), 0) || 1;
      const cores = ['#e8b04a', '#3a6fd8', '#e5484d', '#3fbf7f'];
      let x = 0;
      const segs = partes.map((p, i) => {
        const w = (Number(p.valor) / soma) * 900;
        const s = { x, w, cor: p.cor === 'vermelho' ? '#e5484d' : p.cor === 'verde' ? '#3fbf7f' : cores[i], p };
        x += w;
        return s;
      });
      const fmt = (p) => `${esc(d.prefixo || '')}${esc(String(p.valor).replace('.', ','))}${esc(d.sufixo || '')}`;
      return {
        html: `<div id="dnota" style="position:absolute;left:250px;top:0;width:500px;height:230px;border-radius:22px;background:#3fbf7f;box-shadow:0 20px 50px rgba(0,0,0,.5);opacity:0">
            <div style="position:absolute;inset:16px;border:4px solid #e8fff2;border-radius:14px"></div>
            <div style="position:absolute;left:0;right:0;top:44px;text-align:center;font-size:${String(d.total || '').length > 9 ? 84 : 110}px;font-weight:800;color:#0b3a22">${txt(d.total, 14)}</div>
            ${d.totalTexto ? `<div style="position:absolute;left:0;right:0;top:172px;text-align:center;font-size:30px;font-weight:800;color:#0b3a22">${txt(d.totalTexto, 30)}</div>` : ''}</div>
          <div id="dseta" style="position:absolute;left:0;right:0;top:236px;text-align:center;font-size:70px;color:var(--ouro);opacity:0">⬇</div>
          <div style="position:absolute;left:50px;top:330px;width:900px;height:120px;border-radius:20px;overflow:hidden;background:#1d2647">${segs
            .map((s, i) => `<div class="dseg" data-w="${s.w}" style="position:absolute;left:${s.x}px;top:0;width:0;height:120px;background:${s.cor};border-right:${i < segs.length - 1 ? '4px solid #0b1020' : 'none'}"></div>`)
            .join('')}</div>
          ${segs
            .map(
              (s, i) => `<div class="drot" style="position:absolute;left:${Math.max(0, Math.min(1000 - 300, 50 + s.x + s.w / 2 - 150))}px;top:${470 + (segs.length > 2 && i % 2 ? 130 : 0)}px;width:300px;text-align:center;opacity:0">
            <div style="font-size:${segs.length > 2 ? 54 : 70}px;font-weight:800;color:${s.cor}">${fmt(s.p)}</div>
            <div style="font-size:${segs.length > 2 ? 30 : 38}px;font-weight:700;line-height:1.1">${txt(s.p.rotulo, 24)}</div></div>`
            )
            .join('')}`,
        anim: `const n=$('dnota');const p=back(ap(t,0,.5));n.style.opacity=Math.min(1,p);n.style.transform='scale('+(.6+.4*p)+') rotate('+((1-p)*-6)+'deg)';
          $('dseta').style.opacity=eo(ap(t,.6*k,.3));$('dseta').style.transform='translateY('+(Math.sin(t*5)*8)+'px)';
          $$('.dseg').forEach((e,i)=>{e.style.width=(eo(ap(t,(.9+i*.45)*k,.6*k))*Number(e.dataset.w))+'px';});
          $$('.drot').forEach((e,i)=>{const q=back(ap(t,(1.2+i*.45)*k,.4));e.style.opacity=Math.min(1,q);e.style.transform='translateY('+((1-q)*30)+'px)';});`,
      };
    },

    // Um sistema/órgão no centro ligado a vários outros (cadastro único, investigação, repasses)
    conexao(d) {
      const pontas = (d.pontas || []).filter((p) => p && (p.quem || p.texto)).slice(0, 4);
      const pos = pontas.length === 2 ? [[20, 300], [700, 300]] : pontas.length === 3 ? [[0, 330], [360, 380], [720, 330]] : [[0, 0], [720, 0], [0, 360], [720, 360]];
      const cx = 500, cy = pontas.length === 4 ? 270 : 150;
      const c = d.centro || {};
      return {
        html: `<svg style="position:absolute;left:0;top:0;width:1000px;height:780px;overflow:visible">${pontas
            .map((_, i) => `<line class="clin" x1="${cx}" y1="${cy}" x2="${pos[i][0] + 140}" y2="${pos[i][1] + 100}" stroke="#4a8cff" stroke-width="7" stroke-dasharray="4 18" stroke-linecap="round"/>`)
            .join('')}</svg>
          ${pontas.map((_, i) => `<div class="cpulso" data-i="${i}" style="position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:#9fd3ff;box-shadow:0 0 18px #4a8cff;opacity:0"></div>`).join('')}
          <div id="ccen" style="position:absolute;left:${cx - 150}px;top:${cy - 150}px;width:300px;text-align:center;opacity:0">
            <div style="width:260px;margin:0 auto;filter:drop-shadow(0 0 24px rgba(74,140,255,.6))">${figuraDe(c.quem || 'computador', extra)}</div>
            <div style="display:inline-block;background:var(--ouro);color:#1a1206;border-radius:16px;padding:6px 18px;font-size:34px;font-weight:800;margin-top:4px">${txt(c.texto || 'Sistema', 22)}</div></div>
          ${pontas
            .map(
              (p, i) => `<div class="cpon" style="position:absolute;left:${pos[i][0]}px;top:${pos[i][1]}px;width:280px;text-align:center;opacity:0">
            <div style="width:220px;margin:0 auto">${figuraDe(p.quem, extra)}</div>
            <div style="font-size:${String(p.texto || '').length > 14 ? 30 : 38}px;font-weight:800;line-height:1.1">${txt(p.texto || p.quem, 24)}</div></div>`
            )
            .join('')}
          ${d.texto ? `<div id="ctx" style="position:absolute;left:0;right:0;top:${pontas.length === 4 ? 650 : pontas.length === 3 ? 700 : 600}px;text-align:center;opacity:0"><span style="font-size:38px;font-weight:700;color:var(--ouro2)">${txt(d.texto, 50)}</span></div>` : ''}`,
        anim: `const c=back(ap(t,0,.5));$('ccen').style.opacity=Math.min(1,c);$('ccen').style.transform='scale('+(.6+.4*c)+')';
          $$('.cpon').forEach((e,i)=>{const p=back(ap(t,(.4+i*.3)*k,.4));e.style.opacity=Math.min(1,p);e.style.transform='scale('+(.7+.3*p)+')';});
          $$('.clin').forEach((e,i)=>{e.style.opacity=eo(ap(t,(.6+i*.3)*k,.4));e.style.strokeDashoffset=-t*30;});
          const L=[...document.querySelectorAll('.clin')];$$('.cpulso').forEach((e,i)=>{const l=L[i];if(!l)return;const ini=(1+i*.3)*k;if(t<ini){e.style.opacity=0;return;}
            const u=((t-ini)*.8)%1;const x1=l.x1.baseVal.value,y1=l.y1.baseVal.value,x2=l.x2.baseVal.value,y2=l.y2.baseVal.value;
            e.style.opacity=1;e.style.transform='translate('+(x1+(x2-x1)*u-13)+'px,'+(y1+(y2-y1)*u-13)+'px)';});
          if($('ctx'))$('ctx').style.opacity=eo(ap(t,1.8*k,.4));`,
      };
    },

    // Plenário em meia-lua: as cadeiras acendem (verde = sim, vermelho = não), com o mínimo para aprovar
    plenario(d) {
      const CASAS = { camara: 513, senado: 81, stf: 11 };
      const total = Math.max(3, Math.min(600, Math.round(Number(d.total) || CASAS[d.casa] || 513)));
      const sim = Math.max(0, Math.min(total, Math.round(Number(d.sim) || 0)));
      const nao = Math.max(0, Math.min(total - sim, Math.round(Number(d.nao) || 0)));
      const fileiras = total > 300 ? 9 : total > 100 ? 7 : total > 30 ? 5 : total > 11 ? 3 : 2;
      const r0 = 170, r1 = 440;
      const raios = Array.from({ length: fileiras }, (_, i) => r0 + ((r1 - r0) * i) / Math.max(1, fileiras - 1));
      const somaR = raios.reduce((a, b) => a + b, 0);
      const cad = [];
      let resto = total;
      raios.forEach((r, i) => {
        const n = i === fileiras - 1 ? resto : Math.round((total * r) / somaR);
        resto -= n;
        for (let j = 0; j < n; j++) {
          const ang = Math.PI - (Math.PI * (j + 0.5)) / n;
          cad.push({ x: 500 + r * Math.cos(ang), y: 470 - r * Math.sin(ang), ang });
        }
      });
      cad.sort((a, b) => b.ang - a.ang); // da esquerda para a direita: sim acende primeiro, depois não
      const tam = total > 300 ? 9 : total > 100 ? 13 : total > 30 ? 20 : 30;
      const minimo = Number(d.minimo) > 0 ? Math.round(Number(d.minimo)) : 0;
      return {
        html: `<svg style="position:absolute;left:0;top:0;width:1000px;height:520px">${cad
            .map((c, i) => `<circle class="cad" data-c="${i < sim ? 's' : i < sim + nao ? 'n' : 'o'}" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${tam}" fill="#2a3354"/>`)
            .join('')}</svg>
          <div style="position:absolute;left:0;right:0;top:330px;text-align:center"><div style="font-size:30px;font-weight:800;letter-spacing:3px;color:var(--mut)">${txt(d.rotulo || (d.casa === 'senado' ? 'SENADO' : d.casa === 'stf' ? 'STF' : 'CÂMARA'), 24).toUpperCase()}</div>
            <div style="font-size:30px;color:var(--mut);font-weight:700">${total} ${d.casa === 'stf' ? 'ministros' : d.casa === 'senado' ? 'senadores' : 'cadeiras'}</div></div>
          <div id="pres" style="position:absolute;left:0;right:0;top:490px;text-align:center;opacity:0;white-space:nowrap">
            <span style="font-size:96px;font-weight:800;color:var(--ok)" id="psim">0</span><span style="font-size:40px;font-weight:800;color:var(--ok)"> SIM</span>
            <span style="font-size:56px;color:var(--mut);margin:0 26px">×</span>
            <span style="font-size:96px;font-weight:800;color:var(--nao)" id="pnao">0</span><span style="font-size:40px;font-weight:800;color:var(--nao)"> NÃO</span></div>
          ${minimo ? `<div id="pmin" style="position:absolute;left:0;right:0;top:620px;text-align:center;opacity:0"><span style="background:${sim >= minimo ? 'var(--ok)' : 'var(--nao)'};color:#fff;border-radius:20px;padding:8px 26px;font-size:36px;font-weight:800">Precisava de ${minimo} · ${sim >= minimo ? 'PASSOU' : 'NÃO PASSOU'}</span></div>` : ''}`,
        anim: `const C=document.getElementsByClassName('cad');const n=C.length;const dur=1.6*k;
          for(let i=0;i<n;i++){const e=C[i];const tipo=e.dataset.c;const quando=.3*k+(i/n)*dur;const on=t>=quando;e.setAttribute('fill',!on||tipo==='o'?'#2a3354':tipo==='s'?'#3fbf7f':'#e5484d');}
          const q=eo(ap(t,.3*k,dur));$('pres').style.opacity=eo(ap(t,.2*k,.3));$('psim').textContent=Math.round(${sim}*Math.min(1,q*${total}/Math.max(1,${sim})));
          $('pnao').textContent=Math.round(${nao}*cl((q*${total}-${sim})/Math.max(1,${nao})));
          if($('pmin')){const m=back(ap(t,.4*k+dur,.4));$('pmin').style.opacity=Math.min(1,m);$('pmin').style.transform='scale('+m+')';}`,
      };
    },
  };
}

function validaMecanismo(d) {
  switch (d.tipo) {
    case 'dinheiro': return !!(d.de && (d.de.quem || d.de.texto)) && (Array.isArray(d.para) ? d.para : [d.para]).some((p) => p && (p.quem || p.texto));
    case 'divisao': return !!d.total && (d.partes || []).filter((p) => p && p.rotulo && Number(p.valor) > 0).length >= 2;
    case 'conexao': return (d.pontas || []).filter((p) => p && (p.quem || p.texto)).length >= 2;
    case 'plenario': return Number(d.sim) >= 0 && (Number(d.sim) > 0 || Number(d.nao) > 0);
    default: return false;
  }
}

module.exports = { criarMecanismo: criar, validaMecanismo, TIPOS_MECANISMO: ['dinheiro', 'divisao', 'conexao', 'plenario'], QUEM, PERSONAGENS };
