// Séries fixas do canal de games (o público passa a esperar):
//  • "Jogos grátis da semana" (Epic Games Store, toda quinta)
//  • "Mais vendidos da Steam no Brasil e quanto custam em reais" (toda segunda)
// Os dados vêm direto das lojas (nada inventado) e viram uma "notícia" que passa pelo mesmo roteiro dos Shorts.
import { roteiroShort, COLECAO_NOTICIAS } from './gamesNoticias';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const reais = (centavos) => `R$ ${(Number(centavos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const semana = () => {
  const d = new Date();
  const ini = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-${String(Math.ceil(((d - ini) / 86400e3 + ini.getUTCDay() + 1) / 7)).padStart(2, '0')}`;
};

/** Jogos grátis da Epic agora e os da próxima semana. */
async function noticiaEpicGratis() {
  const r = await fetch('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Epic respondeu ${r.status}`);
  const d = await r.json();
  const agora = [];
  const proximos = [];
  for (const g of d?.data?.Catalog?.searchStore?.elements || []) {
    const atual = g.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
    const futuro = g.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0];
    const img = (g.keyImages || []).find((k) => /OfferImageWide|DieselStoreFrontWide|featuredMedia/i.test(k.type))?.url || (g.keyImages || [])[0]?.url;
    const preco = g.price?.totalPrice?.fmtPrice?.originalPrice;
    if (atual && Number(atual.discountSetting?.discountPercentage) === 0) agora.push({ titulo: g.title, ate: atual.endDate, img, preco });
    else if (futuro && Number(futuro.discountSetting?.discountPercentage) === 0) proximos.push({ titulo: g.title, de: futuro.startDate, img });
  }
  if (!agora.length) throw new Error('Nenhum jogo grátis na Epic agora');
  const texto =
    `Jogos GRÁTIS na Epic Games Store esta semana (é só resgatar e o jogo fica na sua conta para sempre): ` +
    agora.map((g) => `${g.titulo}${g.preco && g.preco !== '0' ? ` (custa normalmente ${g.preco})` : ''}, grátis até ${dataBR(g.ate)}`).join('; ') +
    '. ' +
    (proximos.length ? `Na próxima semana ficam grátis: ${proximos.map((g) => `${g.titulo} (a partir de ${dataBR(g.de)})`).join('; ')}.` : '');
  return {
    id: `serie-epic-gratis-${semana()}`,
    titulo: `Jogos grátis da semana na Epic: ${agora.map((g) => g.titulo).join(' e ')}`,
    link: 'https://store.epicgames.com/pt-BR/free-games',
    fonteNome: 'Epic Games Store',
    oficial: true,
    data: new Date().toISOString(),
    texto,
    imagens: [...agora, ...proximos].map((g) => g.img).filter(Boolean).slice(0, 6),
  };
}

/** Os mais vendidos da Steam no Brasil, com o preço em reais (e o desconto, se tiver). */
async function noticiaSteamMaisVendidos() {
  const r = await fetch('https://store.steampowered.com/api/featuredcategories?cc=br&l=portuguese', { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Steam respondeu ${r.status}`);
  const d = await r.json();
  const itens = (d?.top_sellers?.items || []).filter((x) => x.name && !/steam deck|valve index|steam controller/i.test(x.name)).slice(0, 5);
  if (itens.length < 3) throw new Error('Steam sem lista de mais vendidos');
  const preco = (x) => (x.final_price === 0 ? 'grátis para jogar' : `${reais(x.final_price)}${x.discount_percent ? ` (com ${x.discount_percent}% de desconto, antes ${reais(x.original_price)})` : ''}`);
  const texto =
    'Os jogos MAIS VENDIDOS da Steam no Brasil agora e quanto cada um custa em reais: ' +
    itens.map((x, i) => `${i + 1}º ${x.name}: ${preco(x)}`).join('; ') +
    '. Preços da loja brasileira da Steam no dia de hoje; podem mudar.';
  return {
    id: `serie-steam-top-${semana()}`,
    titulo: `Os mais vendidos da Steam no Brasil e quanto custam em reais`,
    link: 'https://store.steampowered.com/search/?filter=topsellers&cc=br',
    fonteNome: 'Steam',
    oficial: true,
    data: new Date().toISOString(),
    texto,
    imagens: itens.map((x) => x.large_capsule_image || x.header_image).filter(Boolean),
  };
}

const SERIES = { 'epic-gratis': noticiaEpicGratis, 'steam-top': noticiaSteamMaisVendidos };

/** Cria o Short da série (uma vez por semana) e devolve { ref, d } para aprovar, ou { pulou }. */
export async function criarSerieGames(db, tipo) {
  const fazer = SERIES[tipo];
  if (!fazer) throw new Error('Série desconhecida');
  const n = await fazer();
  const col = db.collection(COLECAO_NOTICIAS);
  const ref = col.doc(n.id);
  if ((await ref.get()).exists) return { pulou: 'já feito nesta semana' };
  const ep = await roteiroShort(n);
  ep.potencial = Math.max(Number(ep.potencial) || 0, 8); // série fixa: entra na frente
  const d = {
    status: 'aguardando',
    tipo: 'short',
    serie: tipo,
    titulo: n.titulo,
    link: n.link,
    fonte: n.fonteNome,
    oficial: true,
    data: n.data,
    texto: n.texto,
    imagens: n.imagens,
    ep,
    criadoEm: new Date().toISOString(),
  };
  await ref.set(d);
  return { ref, d };
}
