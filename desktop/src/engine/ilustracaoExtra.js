// Ilustrações "ricas" (pedido do dono: quanto mais detalhada e ilustrada a notícia, mais prende):
// mapa (Brasil por estado ou país no mundo, com zoom), quadro de fotos ligadas por fio (estilo investigação),
// documento com trechos marcados e lupa, caminho entre prédios (Câmara → Senado → Planalto...),
// e o MASCOTE apresentador do canal, que fica no canto, mexe a boca junto com a voz e aponta para a ilustração.
// Tudo é desenho original do canal. Mapas: SVG Maps (svg-maps.com), CC BY 4.0 (crédito na descrição do vídeo).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const txt = (t, max = 80) => {
  const x = String(t ?? '').replace(/\s+/g, ' ').trim();
  if (x.length <= max) return esc(x);
  const c = x.slice(0, max);
  const e = c.lastIndexOf(' ');
  return esc(e > max * 0.5 ? c.slice(0, e) : c); // corta em palavra inteira
};

let mapasCache = null;
function mapas() {
  if (mapasCache) return mapasCache;
  const dir = path.join(__dirname, '..', '..', 'assets', 'mapas');
  const ler = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch {
      return null;
    }
  };
  mapasCache = { brasil: ler('brasil.json'), mundo: ler('mundo.json') };
  return mapasCache;
}

const SEM_ACENTO = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const UFS = {
  ac: 'acre', al: 'alagoas', ap: 'amapa', am: 'amazonas', ba: 'bahia', ce: 'ceara', df: 'distrito federal', es: 'espirito santo',
  go: 'goias', ma: 'maranhao', mt: 'mato grosso', ms: 'mato grosso do sul', mg: 'minas gerais', pa: 'para', pb: 'paraiba', pr: 'parana',
  pe: 'pernambuco', pi: 'piaui', rj: 'rio de janeiro', rn: 'rio grande do norte', rs: 'rio grande do sul', ro: 'rondonia', rr: 'roraima',
  sc: 'santa catarina', sp: 'sao paulo', se: 'sergipe', to: 'tocantins',
};
const PAISES = {
  'estados unidos': 'us', eua: 'us', argentina: 'ar', paraguai: 'py', uruguai: 'uy', bolivia: 'bo', chile: 'cl', peru: 'pe', colombia: 'co',
  venezuela: 've', equador: 'ec', mexico: 'mx', canada: 'ca', cuba: 'cu', china: 'cn', russia: 'ru', ucrania: 'ua', israel: 'il',
  ira: 'ir', 'reino unido': 'gb', inglaterra: 'gb', franca: 'fr', alemanha: 'de', italia: 'it', espanha: 'es', portugal: 'pt',
  japao: 'jp', india: 'in', 'coreia do norte': 'kp', 'coreia do sul': 'kr', brasil: 'br', 'africa do sul': 'za', turquia: 'tr', egito: 'eg',
};
/** "Paraná" / "PR" -> 'pr'; "Paraguai" -> 'py' (no mundo). */
function acharLugar(d) {
  const m = mapas();
  const alvo = SEM_ACENTO(d.uf || d.estado || d.pais || d.lugar);
  if (!alvo) return null;
  if (m.brasil && !d.pais) {
    const uf = UFS[alvo] ? alvo : Object.keys(UFS).find((k) => UFS[k] === alvo);
    if (uf) return { mapa: 'brasil', id: uf };
  }
  if (m.mundo) {
    const id = PAISES[alvo] || (alvo.length === 2 ? alvo : null) || m.mundo.locais.find((l) => SEM_ACENTO(l.nome) === alvo)?.id;
    if (id && m.mundo.locais.some((l) => l.id === id)) return { mapa: 'mundo', id };
  }
  return null;
}

// ───────── Prédios e figuras (desenho próprio, traço simples) ─────────
const PREDIOS = {
  camara: `<svg viewBox="0 0 200 150"><rect x="20" y="118" width="160" height="12" rx="3" fill="#2a3354"/><rect x="85" y="20" width="12" height="98" fill="#c9d2ea"/><rect x="103" y="20" width="12" height="98" fill="#c9d2ea"/>
    <path d="M20 112 q30 -38 60 0z" fill="#e8b04a"/><path d="M120 92 q30 34 60 0z" fill="#c9d2ea"/><rect x="118" y="90" width="64" height="5" fill="#c9d2ea"/><rect x="18" y="110" width="64" height="5" fill="#e8b04a"/></svg>`,
  senado: `<svg viewBox="0 0 200 150"><rect x="20" y="118" width="160" height="12" rx="3" fill="#2a3354"/><rect x="85" y="20" width="12" height="98" fill="#c9d2ea"/><rect x="103" y="20" width="12" height="98" fill="#c9d2ea"/>
    <path d="M20 112 q30 -38 60 0z" fill="#c9d2ea"/><path d="M120 92 q30 34 60 0z" fill="#e8b04a"/><rect x="118" y="90" width="64" height="5" fill="#e8b04a"/><rect x="18" y="110" width="64" height="5" fill="#c9d2ea"/></svg>`,
  planalto: `<svg viewBox="0 0 200 150"><rect x="10" y="118" width="180" height="12" rx="3" fill="#2a3354"/><rect x="20" y="62" width="160" height="10" fill="#c9d2ea"/><rect x="26" y="72" width="148" height="40" fill="#8fa3cf"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${30 + i * 28} 112 q8 -22 0 -50" stroke="#e8f0ff" stroke-width="5" fill="none"/>`).join('')}<rect x="20" y="108" width="160" height="6" fill="#c9d2ea"/><path d="M60 40 h80" stroke="#e8b04a" stroke-width="6"/><rect x="96" y="40" width="8" height="22" fill="#e8b04a"/></svg>`,
  stf: `<svg viewBox="0 0 200 150"><rect x="20" y="118" width="160" height="12" rx="3" fill="#2a3354"/><path d="M30 52 h140 l-10 -14 h-120z" fill="#c9d2ea"/><rect x="30" y="52" width="140" height="8" fill="#e8b04a"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${40 + i * 23}" y="62" width="10" height="50" fill="#e8f0ff"/>`).join('')}<rect x="28" y="110" width="144" height="8" fill="#c9d2ea"/>
    <g transform="translate(100 24)"><path d="M-22 0 h44" stroke="#e8b04a" stroke-width="4"/><path d="M0 -14 v14" stroke="#e8b04a" stroke-width="4"/><path d="M-22 0 l-8 12 h16z M22 0 l-8 12 h16z" fill="#e8b04a"/></g></svg>`,
  urna: `<svg viewBox="0 0 200 150"><rect x="40" y="40" width="120" height="80" rx="10" fill="#c9d2ea"/><rect x="52" y="52" width="56" height="40" rx="4" fill="#1b2a4a"/><rect x="58" y="60" width="44" height="6" fill="#3fbf7f"/>
    ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${118 + c * 12}" y="${54 + r * 14}" width="9" height="10" rx="2" fill="#1b2a4a"/>`).join('')).join('')}<rect x="118" y="98" width="33" height="10" rx="2" fill="#3fbf7f"/><rect x="30" y="120" width="140" height="10" rx="3" fill="#2a3354"/></svg>`,
  policia: `<svg viewBox="0 0 200 150"><path d="M100 14 l52 18 v34 q0 44 -52 70 q-52 -26 -52 -70 v-34z" fill="#1d3f8f" stroke="#c9d2ea" stroke-width="6"/>
    <path d="M100 44 l9 18 20 3 -14 14 3 20 -18 -9 -18 9 3 -20 -14 -14 20 -3z" fill="#e8b04a"/></svg>`,
  dinheiro: `<svg viewBox="0 0 200 150"><g transform="rotate(-8 100 75)"><rect x="30" y="40" width="140" height="74" rx="8" fill="#3fbf7f"/><rect x="40" y="50" width="120" height="54" rx="6" fill="none" stroke="#e8fff2" stroke-width="3"/>
    <circle cx="100" cy="77" r="20" fill="#e8fff2"/><text x="100" y="86" text-anchor="middle" font-size="26" font-weight="800" fill="#2a8a5a" font-family="Mont,Arial">R$</text></g></svg>`,
  povo: `<svg viewBox="0 0 200 150">${[[50, '#8fa3cf'], [100, '#e8b04a'], [150, '#c9d2ea']].map(([x, c]) => `<circle cx="${x}" cy="52" r="20" fill="${c}"/><path d="M${x - 30} 128 q0 -50 30 -50 q30 0 30 50z" fill="${c}"/>`).join('')}</svg>`,
  escola: `<svg viewBox="0 0 200 150"><rect x="30" y="64" width="140" height="56" fill="#c9d2ea"/><path d="M22 66 l78 -40 78 40z" fill="#e5484d"/><rect x="88" y="88" width="24" height="32" fill="#1b2a4a"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${42 + (i > 1 ? 80 : 0) + (i % 2) * 22}" y="76" width="16" height="16" fill="#1b2a4a"/>`).join('')}<rect x="20" y="120" width="160" height="10" rx="3" fill="#2a3354"/></svg>`,
  hospital: `<svg viewBox="0 0 200 150"><rect x="40" y="36" width="120" height="84" fill="#e8f0ff"/><rect x="88" y="48" width="24" height="56" fill="#e5484d"/><rect x="72" y="64" width="56" height="24" fill="#e5484d"/><rect x="30" y="120" width="140" height="10" rx="3" fill="#2a3354"/></svg>`,
};
const ehPredio = (x) => Object.prototype.hasOwnProperty.call(PREDIOS, x);

// ───────── Mascote: apresentador do canal (desenho original) ─────────
const COR_MASCOTE = { terno: '#24335f', gravata: '#e8b04a', pele: '#f1c095', cabelo: '#3a2618' };
// Mascote dos games: gamer nerd — óculos grossos, boné virado para trás, moletom e controle na mão
function mascoteGamerSvg(roupa = {}) {
  const c = { moletom: '#5b2bd1', bone: '#3cff9a', pele: '#f1c095', cabelo: '#2b1b12', ...roupa };
  return `<svg viewBox="0 0 240 360" width="240" height="360" style="overflow:visible">
  <ellipse cx="120" cy="350" rx="70" ry="9" fill="#000" opacity=".35"/>
  <rect x="86" y="268" width="28" height="76" rx="10" fill="#2b3550"/><rect x="126" y="268" width="28" height="76" rx="10" fill="#2b3550"/>
  <rect x="78" y="334" width="40" height="16" rx="8" fill="#fff"/><rect x="122" y="334" width="40" height="16" rx="8" fill="#fff"/><rect x="78" y="344" width="40" height="5" fill="#e5484d"/><rect x="122" y="344" width="40" height="5" fill="#e5484d"/>
  <g id="mbracoE"><rect x="50" y="176" width="28" height="92" rx="14" fill="${c.moletom}"/><circle cx="64" cy="270" r="13" fill="${c.pele}"/></g>
  <path d="M64 184 q56 -40 112 0 v96 h-112z" fill="${c.moletom}"/>
  <path d="M92 236 h56 v26 h-56z" fill="rgba(0,0,0,.18)" rx="8"/>
  <path d="M100 160 q20 22 40 0" stroke="rgba(0,0,0,.25)" stroke-width="10" fill="none"/>
  <path d="M108 172 v26 M132 172 v26" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <text x="120" y="226" text-anchor="middle" font-size="22" font-weight="800" font-family="Mont,Arial" fill="${c.bone}">PF»</text>
  <g id="mbracoD"><rect x="162" y="176" width="28" height="92" rx="14" fill="${c.moletom}"/><circle cx="176" cy="270" r="13" fill="${c.pele}"/>
    <g transform="translate(176 282)"><rect x="-30" y="-12" width="60" height="30" rx="14" fill="#2a2f45"/><circle cx="-14" cy="2" r="5" fill="#9aa4bd"/><circle cx="14" cy="-2" r="4" fill="#3cff9a"/><circle cx="20" cy="6" r="4" fill="#e5484d"/></g></g>
  <path d="M84 168 q36 22 72 0" stroke="#1b1b1b" stroke-width="8" fill="none"/><circle cx="84" cy="170" r="10" fill="#1b1b1b"/><circle cx="156" cy="170" r="10" fill="#1b1b1b"/>
  <rect x="108" y="140" width="24" height="26" fill="${c.pele}"/>
  <g id="mcab">
    <circle cx="56" cy="100" r="13" fill="${c.pele}"/><circle cx="184" cy="100" r="13" fill="${c.pele}"/>
    <ellipse cx="120" cy="98" rx="64" ry="64" fill="${c.pele}"/>
    <path d="M58 88 q4 -18 14 -24 l96 0 q10 8 12 24 q-8 -8 -16 -8 h-90 q-10 0 -16 8z" fill="${c.cabelo}"/>
    <path d="M74 30 q46 -34 96 -6 l10 -10 q-56 -26 -112 6z" fill="#2fd184"/>
    <path d="M60 66 q0 -44 60 -44 q60 0 60 44 q-60 -10 -120 0z" fill="${c.bone}"/>
    <path d="M104 62 q16 -18 32 0z" fill="${c.cabelo}"/><path d="M100 64 h40" stroke="#2fd184" stroke-width="5" stroke-linecap="round"/>
    <g id="msob"><path d="M78 72 q14 -6 28 0" stroke="${c.cabelo}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M134 72 q14 -6 28 0" stroke="${c.cabelo}" stroke-width="7" fill="none" stroke-linecap="round"/></g>
    <g id="molhos"><ellipse cx="92" cy="98" rx="8" ry="9" fill="#1d1d1d"/><ellipse cx="148" cy="98" rx="8" ry="9" fill="#1d1d1d"/><circle cx="95" cy="94" r="2.6" fill="#fff"/><circle cx="151" cy="94" r="2.6" fill="#fff"/></g>
    <rect x="68" y="80" width="46" height="36" rx="6" fill="rgba(160,220,255,.12)" stroke="#111" stroke-width="7"/><rect x="126" y="80" width="46" height="36" rx="6" fill="rgba(160,220,255,.12)" stroke="#111" stroke-width="7"/><path d="M114 96 h12" stroke="#111" stroke-width="6"/>
    <ellipse cx="78" cy="126" rx="9" ry="5" fill="#e9967a" opacity=".45"/><ellipse cx="162" cy="126" rx="9" ry="5" fill="#e9967a" opacity=".45"/>
    <g id="mboca" transform="translate(120 136)"><ellipse id="mbocaA" cx="0" cy="0" rx="15" ry="3" fill="#5a1f1f"/><ellipse id="mling" cx="0" cy="5" rx="8" ry="0" fill="#d9646b"/>
      <path id="msorr" d="M-16 -2 q16 14 32 0" stroke="#5a1f1f" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="-6" y="-2" width="12" height="6" fill="#fff" opacity=".0"/></g>
  </g></svg>`;
}

function mascoteSvg(roupa = {}) {
  if (roupa.estilo === 'gamer') return mascoteGamerSvg(roupa);
  const c = { ...COR_MASCOTE, ...roupa };
  return `<svg viewBox="0 0 240 360" width="240" height="360" style="overflow:visible">
  <ellipse cx="120" cy="350" rx="70" ry="9" fill="#000" opacity=".35"/>
  <rect x="86" y="268" width="28" height="76" rx="10" fill="#1a213b"/><rect x="126" y="268" width="28" height="76" rx="10" fill="#1a213b"/>
  <rect x="80" y="336" width="38" height="14" rx="7" fill="#111"/><rect x="122" y="336" width="38" height="14" rx="7" fill="#111"/>
  <g id="mbracoE"><rect x="50" y="176" width="26" height="92" rx="13" fill="${c.terno}"/><circle cx="63" cy="270" r="13" fill="${c.pele}"/></g>
  <path d="M66 180 q54 -34 108 0 v100 h-108z" fill="${c.terno}"/>
  <path d="M104 160 l16 30 16 -30z" fill="#fff"/><path d="M116 168 h8 l5 60 -9 12 -9 -12z" fill="${c.gravata}"/>
  <path d="M96 160 l20 40 -30 -18z M144 160 l-20 40 30 -18z" fill="#1a2650"/>
  <g id="mbracoD"><rect x="164" y="176" width="26" height="92" rx="13" fill="${c.terno}"/><circle cx="177" cy="270" r="13" fill="${c.pele}"/>
    <rect x="174" y="258" width="6" height="70" rx="3" fill="#e8b04a" transform="rotate(180 177 270)"/></g>
  <rect x="108" y="140" width="24" height="26" fill="${c.pele}"/>
  <g id="mcab">
    <circle cx="56" cy="100" r="13" fill="${c.pele}"/><circle cx="184" cy="100" r="13" fill="${c.pele}"/>
    <ellipse cx="120" cy="96" rx="64" ry="66" fill="${c.pele}"/>
    <path d="M56 86 q2 -62 66 -62 q58 0 62 56 q-20 -30 -58 -30 q-8 -18 -34 -14 q8 8 4 16 q-24 6 -40 34z" fill="${c.cabelo}"/>
    <g id="msob"><path d="M78 72 q14 -8 28 0" stroke="${c.cabelo}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M134 72 q14 -8 28 0" stroke="${c.cabelo}" stroke-width="6" fill="none" stroke-linecap="round"/></g>
    <g id="molhos"><ellipse cx="92" cy="96" rx="8" ry="9" fill="#1d1d1d"/><ellipse cx="148" cy="96" rx="8" ry="9" fill="#1d1d1d"/><circle cx="95" cy="92" r="2.6" fill="#fff"/><circle cx="151" cy="92" r="2.6" fill="#fff"/></g>
    <rect x="72" y="80" width="40" height="32" rx="12" fill="rgba(255,255,255,.08)" stroke="#1d1d1d" stroke-width="4"/><rect x="128" y="80" width="40" height="32" rx="12" fill="rgba(255,255,255,.08)" stroke="#1d1d1d" stroke-width="4"/><path d="M112 94 h16" stroke="#1d1d1d" stroke-width="4"/>
    <ellipse cx="78" cy="122" rx="9" ry="5" fill="#e9967a" opacity=".45"/><ellipse cx="162" cy="122" rx="9" ry="5" fill="#e9967a" opacity=".45"/>
    <g id="mboca" transform="translate(120 132)"><ellipse id="mbocaA" cx="0" cy="0" rx="15" ry="3" fill="#5a1f1f"/><ellipse id="mling" cx="0" cy="5" rx="8" ry="0" fill="#d9646b"/>
      <path id="msorr" d="M-16 -2 q16 12 32 0" stroke="#5a1f1f" stroke-width="5" fill="none" stroke-linecap="round"/></g>
  </g></svg>`;
}

/** Animação do mascote (texto que vai dentro da página). BOCA = volume da voz (0..1), 12 por segundo. */
const MASCOTE_ANIM = `
 if($('masc')){
  const ent=window.MASC_CONT?1:eo(ap(t,0,.45));$('masc').style.opacity=ent;$('masc').style.transform='translateX('+((1-ent)*-140)+'px) translateY('+(Math.sin(t*2.2)*4)+'px)';
  const B=window.BOCA||[];const i=Math.floor(t*12);const v=B.length?Math.max(0,Math.min(1,(B[i]||0)*.65+(B[i+1]||0)*.35)):(Math.max(0,Math.sin(t*11))*.7*(Math.sin(t*1.3)>-.3?1:0));
  const fala=v>.08;$('mbocaA').setAttribute('ry',fala?(3+v*15):2.5);$('mbocaA').setAttribute('rx',fala?(12+v*4):12);$('mling').setAttribute('ry',fala?Math.max(0,v*6-1):0);
  $('msorr').style.opacity=fala?0:1;$('mbocaA').style.opacity=fala?1:0;
  const pisc=(t%3.3)<.12;$('molhos').style.transform='translateY('+(pisc?6:0)+'px) scaleY('+(pisc?.12:1)+')';$('molhos').style.transformOrigin='120px 96px';
  const humor=window.MASC_HUMOR||'normal';$('msob').style.transform='translateY('+(humor==='surpreso'?-8:humor==='serio'?3:Math.sin(t*1.7)*1.5)+'px)';
  $('mcab').style.transformOrigin='120px 150px';$('mcab').style.transform='rotate('+(Math.sin(t*1.6)*3+(fala?v*2:0))+'deg)';
  const ap2=eo(ap(t,.5,.5));$('mbracoD').style.transformOrigin='177px 182px';$('mbracoD').style.transform='rotate('+(-(118*ap2)+Math.sin(t*2.4)*8)+'deg)';
  $('mbracoE').style.transformOrigin='63px 182px';$('mbracoE').style.transform='rotate('+(Math.sin(t*1.9+1)*6)+'deg)';
 }`;

// ───────── Os novos tipos (quadro de 1000×780, como os outros) ─────────
const EXTRA = {
  // Mapa: o Brasil (ou o mundo) aparece e dá zoom no estado/país da notícia, que acende em dourado com um alfinete
  mapa(d) {
    const lugar = acharLugar(d);
    const m = mapas()[lugar?.mapa || 'brasil'];
    const caminhos = (m?.locais || []).map((l) => `<path class="mp${l.id === lugar?.id ? ' alvo' : ''}" ${l.id === lugar?.id ? 'id="alvo"' : ''} d="${l.d}"/>`).join('');
    return {
      html: `<div style="position:absolute;left:0;top:0;width:1000px;height:640px;overflow:hidden;border-radius:30px;background:radial-gradient(#16203f,#0d1430);border:2px solid var(--borda)"><svg id="msvg" viewBox="${m?.viewBox || '0 0 613 639'}" style="position:absolute;left:0;top:0;width:1000px;height:640px">
          <style>.mp{fill:#1e2a4d;stroke:#3a4a7a;stroke-width:${lugar?.mapa === 'mundo' ? 0.4 : 1};stroke-linejoin:round}.alvo{fill:#e8b04a;stroke:#fff3d6}</style>${caminhos}</svg></div>
        <div id="pino" style="position:absolute;left:0;top:0;font-size:90px;line-height:1;filter:drop-shadow(0 10px 10px rgba(0,0,0,.5))">📍</div>
        <div id="mrot" style="position:absolute;left:0;right:0;top:648px;text-align:center"><span style="display:inline-block;background:var(--card);border:3px solid var(--ouro);border-radius:30px;padding:14px 34px;font-size:46px;font-weight:800">${txt(d.rotulo || d.uf || d.pais || d.lugar, 30)}${d.texto ? `<span style="color:var(--mut);font-weight:700"> · ${txt(d.texto, 30)}</span>` : ''}</span></div>`,
      anim: `const s=$('msvg');if(!window.__vb){const v=s.getAttribute('viewBox').split(' ').map(Number);const a=$('alvo');const b=a?a.getBBox():{x:v[0],y:v[1],width:v[2],height:v[3]};
          const lado=Math.max(b.width,b.height)*${lugar?.mapa === 'mundo' ? 4.2 : 2.6};const cx=b.x+b.width/2,cy=b.y+b.height/2;window.__vb={v,f:[cx-lado*.78,cy-lado*.5,lado*1.56,lado],c:[cx,cy]};}
        const z=eo(ap(t,.5*k,1.3*k));const V=window.__vb.v.map((x,i)=>x+(window.__vb.f[i]-x)*z);s.setAttribute('viewBox',V.join(' '));
        s.style.opacity=eo(ap(t,0,.4));const a=$('alvo');if(a){const p=ap(t,1.2*k,.5);a.style.fill=p>0?'#e8b04a':'#1e2a4d';a.style.filter=p>0?'drop-shadow(0 0 '+(6+Math.sin(t*5)*4)+'px #e8b04a)':'none';}
        const px=(window.__vb.c[0]-V[0])/V[2]*1000,py=(window.__vb.c[1]-V[1])/V[3]*640;const pp=back(ap(t,1.4*k,.45));
        $('pino').style.opacity=Math.min(1,pp*1.5);$('pino').style.transform='translate('+(px-45)+'px,'+(py-88-(1-pp)*120)+'px)';
        const r=eo(ap(t,1.7*k,.4));$('mrot').style.opacity=r;$('mrot').style.transform='translateY('+((1-r)*30)+'px)';`,
    };
  },
  // Quadro de investigação: fotos (polaroides) presas e ligadas por fio vermelho, com o nome de cada um
  quadroFotos(d) {
    const fotos = (d.fotos || []).filter((f) => f && (f.arquivo ? fs.existsSync(f.arquivo) : f.nome)).slice(0, 4);
    const pos = fotos.length <= 2 ? [[120, 120], [560, 160]] : fotos.length === 3 ? [[60, 60], [600, 40], [330, 380]] : [[60, 30], [600, 20], [80, 400], [600, 400]];
    const giro = [-6, 5, 4, -5];
    return {
      html: `<div class="cardx" style="left:0;top:0;width:1000px;height:780px;background:#3a2a1a;border:10px solid #6b4a2a;border-radius:18px;background-image:radial-gradient(rgba(255,255,255,.06) 2px,transparent 2px);background-size:22px 22px"></div>
        <svg style="position:absolute;left:0;top:0;width:1000px;height:780px;overflow:visible">${fotos
          .map((_, i) => (i ? `<line class="fio" x1="${pos[i - 1][0] + 160}" y1="${pos[i - 1][1] + 30}" x2="${pos[i][0] + 160}" y2="${pos[i][1] + 30}" stroke="#d93a3a" stroke-width="6" stroke-linecap="round"/>` : ''))
          .join('')}</svg>
        ${fotos
          .map(
            (f, i) => `<div class="pol" style="position:absolute;left:${pos[i][0]}px;top:${pos[i][1]}px;width:320px;background:#f4f1ea;padding:16px 16px 0;box-shadow:0 18px 40px rgba(0,0,0,.55);transform:rotate(${giro[i]}deg)">
          <div style="width:288px;height:260px;background:#9aa4bd;overflow:hidden">${f.arquivo ? `<img src="${esc(pathToFileURL(f.arquivo).href)}" style="width:100%;height:100%;object-fit:cover;object-position:50% 20%">` : `<div style="font-size:150px;text-align:center;line-height:260px">👤</div>`}</div>
          <div style="height:62px;display:flex;align-items:center;justify-content:center;color:#1b2236;font-size:32px;font-weight:800;text-align:center;line-height:1">${txt(f.nome, 22)}</div>
          <div style="position:absolute;left:146px;top:-14px;width:30px;height:30px;border-radius:50%;background:#d93a3a;box-shadow:0 4px 6px rgba(0,0,0,.5)"></div></div>`
          )
          .join('')}
        ${d.texto ? `<div id="qtx" style="position:absolute;left:0;right:0;top:${fotos.length > 2 ? 715 : 560}px;text-align:center"><span style="background:#f6d38a;color:#1b2236;padding:10px 26px;font-size:40px;font-weight:800;box-shadow:0 8px 20px rgba(0,0,0,.4)">${txt(d.texto, 40)}</span></div>` : ''}`,
      anim: `$$('.pol').forEach((e,i)=>{const p=back(ap(t,(.1+i*.55)*k,.4));e.style.opacity=Math.min(1,p);e.style.scale=String(.6+.4*p);});
        $$('.fio').forEach((e,i)=>{const L=Math.hypot(e.x2.baseVal.value-e.x1.baseVal.value,e.y2.baseVal.value-e.y1.baseVal.value);e.style.strokeDasharray=L;e.style.strokeDashoffset=L*(1-eo(ap(t,(.45+(i+1)*.55)*k,.45)));});
        if($('qtx')){const q=eo(ap(t,${fotos.length * 0.55 + 0.3}*k,.4));$('qtx').style.opacity=q;$('qtx').style.transform='rotate(-2deg) scale('+(.8+.2*q)+')';}`,
    };
  },
  // Documento oficial: cabeçalho, linhas, o trecho importante marcado com marca-texto e a lupa passando por cima
  documento(d) {
    const trechos = (d.trechos || [d.texto]).filter(Boolean).slice(0, 2);
    const linhas = (n, y0) => Array.from({ length: n }, (_, i) => `<div style="position:absolute;left:60px;right:${60 + ((i * 37) % 120)}px;top:${y0 + i * 34}px;height:14px;border-radius:7px;background:#d8d2c2"></div>`).join('');
    return {
      html: `<div class="cardx" id="dpap" style="left:170px;top:0;width:660px;height:780px;background:#f6f1e3;border:none;color:#1b2236;box-shadow:0 30px 80px rgba(0,0,0,.55)">
          <div style="position:absolute;left:0;right:0;top:40px;text-align:center;font-size:24px;letter-spacing:4px;font-weight:800;color:#5b6582">${txt(d.orgao || 'DOCUMENTO OFICIAL', 40)}</div>
          <div style="position:absolute;left:0;right:0;top:80px;text-align:center;font-size:${String(d.documento || '').length > 18 ? 40 : 52}px;font-weight:800">${txt(d.documento || '', 30)}</div>
          <div style="position:absolute;left:250px;right:250px;top:${String(d.documento || '').length > 18 ? 136 : 150}px;height:6px;background:#e8b04a"></div>
          ${linhas(3, 190)}
          ${trechos
            .map(
              (tr, i) => `<div style="position:absolute;left:54px;right:54px;top:${310 + i * 170}px">
            <div class="mtx" style="position:absolute;left:-8px;top:-4px;bottom:-4px;width:0;background:rgba(255,214,0,.75);border-radius:6px"></div>
            <div style="position:relative;font-size:36px;font-weight:700;line-height:1.25">“${txt(tr, 90)}”</div></div>`
            )
            .join('')}
          ${linhas(2, 310 + trechos.length * 170)}
          ${d.carimbo ? `<div id="dcar" class="carimbo" style="right:40px;bottom:46px;border-color:${d.cor === 'vermelho' ? 'var(--nao)' : 'var(--ok)'};color:${d.cor === 'vermelho' ? 'var(--nao)' : 'var(--ok)'};font-size:56px;transform:rotate(-12deg)">${txt(d.carimbo, 14)}</div>` : ''}
        </div>
        <div id="lupa" style="position:absolute;left:0;top:0;width:190px;height:190px;border-radius:50%;border:14px solid #2a3354;background:rgba(255,255,255,.12);box-shadow:0 14px 30px rgba(0,0,0,.5)">
          <div style="position:absolute;left:150px;top:150px;width:110px;height:26px;border-radius:13px;background:#2a3354;transform:rotate(45deg);transform-origin:0 50%"></div></div>`,
      anim: `const p=eo(ap(t,0,.5));$('dpap').style.opacity=p;$('dpap').style.transform='translateY('+((1-p)*80)+'px) rotate('+((1-p)*-4)+'deg)';
        $$('.mtx').forEach((e,i)=>{e.style.width=(eo(ap(t,(.7+i*1.1)*k,.8*k))*560)+'px';});
        const n=${trechos.length};const fase=Math.min(n-1,Math.floor(Math.max(0,t-.7*k)/(1.1*k)));const lx=eo(ap(t,(.7+fase*1.1)*k,.8*k));
        $('lupa').style.opacity=eo(ap(t,.5*k,.3))*(t>(1.7+n*1.1)*k?Math.max(0,1-(t-(1.7+n*1.1)*k)*2):1);$('lupa').style.transform='translate('+(220+lx*430)+'px,'+(230+fase*170+Math.sin(t*3)*6)+'px)';
        if($('dcar')){const c=back(ap(t,(.9+n*1.1)*k,.3));$('dcar').style.opacity=Math.min(1,c);$('dcar').style.scale=String(1.8-.8*c);}`,
    };
  },
  // Caminho entre lugares: prédios em sequência, setas e um papel "viajando" de um para o outro
  caminho(d) {
    const et = (d.etapas || []).filter((e) => e && (ehPredio(e.lugar) || e.texto)).slice(0, 4);
    const larg = 1000 / Math.max(1, et.length);
    const atual = Math.max(0, Math.min(et.length - 1, Number(d.atual ?? et.length - 1)));
    return {
      html: et
        .map(
          (e, i) => `<div class="cam" style="position:absolute;left:${i * larg}px;top:120px;width:${larg}px;text-align:center">
          <div style="width:${Math.min(320, larg - 24)}px;margin:0 auto;${i === atual ? 'filter:drop-shadow(0 0 18px rgba(232,176,74,.7))' : ''}">${PREDIOS[e.lugar] || `<div style="font-size:120px">${txt(e.icone || '🏛️', 4)}</div>`}</div>
          <div style="font-size:${String(e.texto || '').length > 16 ? (et.length > 3 ? 28 : 34) : et.length > 3 ? 36 : 46}px;font-weight:800;margin-top:14px;line-height:1.1;padding:0 10px;${i === atual ? 'color:var(--ouro)' : ''}">${txt(e.texto, 34)}</div>
          ${e.status ? `<div style="display:inline-block;margin-top:12px;padding:8px 22px;border-radius:24px;font-size:32px;font-weight:800;background:${/n[aã]o|rejeit|barr/i.test(e.status) ? 'var(--nao)' : /aprov|ok|feito|sim/i.test(e.status) ? 'var(--ok)' : '#5b6582'};color:#fff">${txt(e.status, 16)}</div>` : ''}</div>
          ${i < et.length - 1 ? `<div class="cseta" style="position:absolute;left:${(i + 1) * larg - 34}px;top:${120 + Math.min(320, larg - 24) * 0.33}px;font-size:64px;color:var(--ouro);font-weight:800">➜</div>` : ''}`
        )
        .join('') + `<div id="papel" style="position:absolute;left:0;top:30px;font-size:70px;filter:drop-shadow(0 8px 10px rgba(0,0,0,.5))">📄</div>`,
      anim: `$$('.cam').forEach((e,i)=>{const p=back(ap(t,(.1+i*.5)*k,.4));e.style.opacity=Math.min(1,p);e.style.transform='translateY('+((1-p)*60)+'px)';});
        $$('.cseta').forEach((e,i)=>{const p=eo(ap(t,(.4+i*.5)*k,.3));e.style.opacity=p;e.style.transform='translateX('+(Math.sin(t*4)*6)+'px)';});
        const n=${et.length},L=${larg},alvo=${atual};const ini=(.3+n*.5)*k;const pos=Math.min(alvo,Math.max(0,(t-ini)/(.8*k)));
        $('papel').style.opacity=t<ini?0:1;$('papel').style.transform='translate('+(pos*L+L/2-35)+'px,'+(-Math.abs(Math.sin(pos*Math.PI))*40)+'px) rotate('+(Math.sin(t*6)*8)+'deg)';`,
    };
  },
};

function validaExtra(d) {
  switch (d.tipo) {
    case 'mapa': return !!acharLugar(d);
    case 'quadroFotos': return Array.isArray(d.fotos) && d.fotos.filter((f) => f && (f.arquivo ? fs.existsSync(f.arquivo) : f.nome)).length >= 2;
    case 'documento': return !!(d.documento || d.orgao) && ((Array.isArray(d.trechos) && d.trechos.length) || !!d.texto);
    case 'caminho': return Array.isArray(d.etapas) && d.etapas.filter((e) => e && (ehPredio(e.lugar) || e.texto)).length >= 2;
    default: return false;
  }
}

module.exports = { EXTRA, TIPOS_EXTRA: Object.keys(EXTRA), validaExtra, mascoteSvg, MASCOTE_ANIM, PREDIOS, acharLugar };
