// NOTÍCIA DA CIDADE (pedido do dono, 16/11): 1 Short por dia com o fato LOCAL mais forte do dia numa capital
// (rodízio; Porto Alegre entra sempre na disputa). Assunto de interesse público que chama atenção e NÃO derruba
// anúncio: ônibus/tarifa, obra que fecha rua, temporal/alagamento, lei nova da Câmara de Vereadores, preço, decisão
// da prefeitura. NUNCA crime, morte, ataque, acidente com vítima ou pessoa comum exposta (anúncio limitado,
// direito de imagem e risco de processo). Sem vídeo de terceiros: o Short é feito no nosso estilo (ilustrações +
// fotos de uso livre), com o Claude pesquisando o fato na web em várias fontes.
import crypto from 'crypto';
import { ia } from './gamesNoticias';
import { roteiroExplicador, COLECAO_POLITICA } from './politicaNoticias';

export const CIDADES = [
  'Porto Alegre', 'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Florianópolis',
  'Salvador', 'Recife', 'Fortaleza', 'Brasília', 'Goiânia', 'Manaus', 'Belém',
];

// Fora: tudo que é violência, crime e tragédia com vítima (o YouTube limita o anúncio e expõe gente comum)
const PROIBIDO = /\b(mort[oaes]*|morre|morreu|morte|mata|matou|assassin|homic[ií]d|feminic|tiro|baleado|disparo|esfaque|facad|estupr|abus|chacina|ataque|atacad|sequestr|roub|assalt|furt|tr[aá]fico|fac[cç][aã]o|pres[oa]s?\b|pris[aã]o|polic|PM\b|brigada militar|delegad|suspeit|v[ií]tima|corpo|cad[aá]ver|ferid|atropel|briga|agress|viol[eê]nci|crime|criminos|investiga|suic[ií]d|desaparec)/i;

const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';
const tag = (x, t) => (x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')) || [])[1] || '';
const limpa = (s) => String(s).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

async function manchetesDa(cidade) {
  const q = `"${cidade}" when:1d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Google Notícias ${r.status}`);
  const xml = await r.text();
  const itens = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const fonte = limpa(tag(m[0], 'source'));
    const titulo = limpa(tag(m[0], 'title')).replace(/\s+-\s+[^-]+$/, '').trim();
    const data = limpa(tag(m[0], 'pubDate'));
    if (!titulo || PROIBIDO.test(titulo)) continue;
    itens.push({ cidade, titulo, fonte, data, link: limpa(tag(m[0], 'link')) });
  }
  return itens.slice(0, 15);
}

const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/**
 * Escolhe a notícia da cidade de hoje, escreve o Short (pesquisando na web) e deixa na lista da política com
 * nota alta, para a aprovação automática mandar para a Fábrica. Uma por dia (o id do documento é a data).
 */
export async function noticiaDaCidade(db, { forcar = false } = {}) {
  const col = db.collection(COLECAO_POLITICA);
  const id = `cidade-${hojeBR()}`;
  const ref = col.doc(id);
  // 17/11: se a de hoje foi DESCARTADA (sem imagem boa), tenta outra manchete — até 3 tentativas no dia
  const jaHoje = (await ref.get()).data();
  const tentadas = jaHoje?.status === 'descartada' ? [...(jaHoje.tentadas || []), jaHoje.titulo].filter(Boolean) : [];
  if (!forcar && jaHoje && (jaHoje.status !== 'descartada' || tentadas.length >= 3)) return { ok: false, motivo: 'já tem a notícia da cidade de hoje' };

  // Cidades dos últimos 3 dias perdem a vez (rodízio), menos Porto Alegre, que sempre entra na disputa
  const ult = (await db.collection('youvideo_config').doc('politica_cidade').get().catch(() => null))?.data?.() || {};
  const recentes = (ult.ultimas || []).slice(-3);
  const cidades = CIDADES.filter((c) => c === 'Porto Alegre' || !recentes.includes(c));
  const todas = (await Promise.all(cidades.map((c) => manchetesDa(c).catch(() => [])))).flat().filter((n) => !tentadas.includes(n.titulo));
  if (!todas.length) return { ok: false, motivo: 'nenhuma manchete local encontrada' };

  const lista = todas.slice(0, 160).map((n, i) => `${i + 1}. [${n.cidade} · ${n.fonte}] ${n.titulo}`).join('\n');
  const j = await ia(
    'Você é editor de um canal brasileiro de notícias em SHORTS e escolhe a "NOTÍCIA DA CIDADE" do dia: UM fato LOCAL de uma capital que faz a pessoa parar de rolar a tela. ' +
      'BOM: o que muda a vida de quem mora lá (tarifa e linha de ônibus, obra que fecha rua ou ponte, temporal, alagamento, falta de água ou luz, lei nova da Câmara de Vereadores, decisão da prefeitura, preço que subiu, evento enorme, inauguração, curiosidade marcante da cidade). ' +
      'PROIBIDO (nem considere): crime, morte, ataque, acidente com vítima, polícia, investigação, tragédia com pessoas, briga, fofoca, futebol, nota de rotina, agenda, homenagem. ' +
      'Prefira fonte grande e confiável (G1, GZH, Correio do Povo, Folha, Estadão, Agência Brasil, sites de prefeitura). ' +
      'Em empate, prefira Porto Alegre. Dê "potencial" de 1 a 10. Responda só JSON: {"n":número,"potencial":1-10,"porque":"curto"}. Se nenhuma servir, {"n":0}.',
    `Hoje: ${hojeBR()}\nMANCHETES LOCAIS:\n${lista}`,
    { temperatura: 0.2 }
  );
  const n = Number(j?.n);
  const esc = n >= 1 && n <= todas.length ? todas[n - 1] : null;
  if (!esc || PROIBIDO.test(esc.titulo)) return { ok: false, motivo: 'nenhuma notícia local boa hoje' };
  const potencial = Math.max(1, Math.min(10, Math.round(Number(j.potencial) || 7)));

  await ref.set({ status: 'escrevendo', tipo: 'cidade', titulo: esc.titulo, fonte: esc.fonte, cidade: esc.cidade, criadoEm: new Date().toISOString() });
  try {
    const tema = `${esc.cidade}: ${esc.titulo} (manchete de ${esc.fonte}, ${esc.data})`;
    const { ep } = await roteiroExplicador(tema, 'cidade');
    ep.id = `pol-cidade-${hojeBR()}-${crypto.createHash('md5').update(esc.titulo).digest('hex').slice(0, 6)}`;
    ep.cidade = esc.cidade;
    // 17/11: sem foto real do assunto (só vídeo genérico de banco), nem faz — não gasta crédito com vídeo ruim
    const { cenasDoTexto, faltaImagemDoAssunto } = await import('./travaQualidade');
    const motivo = faltaImagemDoAssunto(cenasDoTexto(ep.texto));
    if (motivo) {
      await ref.set({ status: 'descartada', motivo, tentadas, cidade: esc.cidade, titulo: esc.titulo, link: esc.link, fonte: esc.fonte, descartadaEm: new Date().toISOString() }, { merge: true });
      console.log(`[cidade] descartada: "${esc.titulo}" — ${motivo}`);
      return { ok: false, motivo };
    }
    await ref.set({
      status: 'aguardando',
      tipo: 'cidade',
      cidade: esc.cidade,
      titulo: esc.titulo,
      link: esc.link,
      fonte: esc.fonte,
      data: new Date().toISOString(),
      imagens: [],
      ep,
      potencial: Math.max(7, potencial), // 1 por dia: entra na aprovação automática como notícia boa
      criadoEm: new Date().toISOString(),
    });
    await db.collection('youvideo_config').doc('politica_cidade').set({ ultimas: [...(ult.ultimas || []), esc.cidade].slice(-10), em: new Date().toISOString() }, { merge: true });
    console.log(`[cidade] ${esc.cidade}: "${esc.titulo}" (${esc.fonte}, potencial ${potencial}) -> ${ep.titulo}`);
    return { ok: true, cidade: esc.cidade, titulo: ep.titulo };
  } catch (e) {
    await ref.set({ status: 'falhou', erro: String(e.message || e).slice(0, 200) }, { merge: true });
    console.log(`[cidade] falhou: ${String(e.message || e).slice(0, 200)}`);
    return { ok: false, motivo: String(e.message || e).slice(0, 200) };
  }
}
