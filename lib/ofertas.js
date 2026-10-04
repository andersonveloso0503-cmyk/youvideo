// Radar de Ofertas — parte que roda igual no navegador e no servidor (sem dependências do Node).
// A ideia: olhar uma oferta que está indo bem, ficar SÓ com o esqueleto (nicho, preço, ordem das seções,
// tipo de promessa) e montar uma oferta nova, com produto e texto próprios. Nada de texto, imagem ou nome
// da página de origem é reaproveitado — quem garante isso é a trava (lib/ofertasTrava.js).

export const COL_ANALISES = 'youvideo_ofertas_analises';
export const COL_OFERTAS = 'youvideo_ofertas';

/** Blocos que a página de vendas sabe montar. A análise só diz em que ordem a oferta de origem usa cada um. */
export const SECOES = {
  capa: 'Capa com título e botão',
  numeros: 'Números do produto',
  beneficios: 'Benefícios',
  paraQuem: 'Para quem é',
  itens: 'O que vem no pacote',
  bonus: 'Bônus',
  licenca: 'O que a licença permite',
  comoFunciona: 'Como funciona',
  preco: 'Preço e botão de compra',
  duvidas: 'Dúvidas frequentes',
};
const ORDEM_PADRAO = ['capa', 'numeros', 'beneficios', 'paraQuem', 'itens', 'bonus', 'licenca', 'comoFunciona', 'preco', 'duvidas'];

/** Ordem final das seções: segue a da oferta de origem, mas sempre começa na capa e nunca fica sem preço e dúvidas. */
export function ordemDasSecoes(secoes, produto) {
  const pedidas = (Array.isArray(secoes) ? secoes : []).filter((s, i, a) => SECOES[s] && a.indexOf(s) === i && s !== 'capa');
  const ordem = ['capa', ...(pedidas.length >= 3 ? pedidas : ORDEM_PADRAO.slice(1))];
  for (const obrigatoria of ['itens', 'preco', 'duvidas']) if (!ordem.includes(obrigatoria)) ordem.push(obrigatoria);
  const temBonus = (produto?.bonus || []).some((b) => b.titulo);
  return ordem.filter((s) => (s === 'bonus' ? temBonus : s === 'licenca' ? produto?.tipo === 'plr' : true));
}

export const LICENCA_PODE = [
  'Editar o texto, o título e a capa.',
  'Publicar com o seu nome ou a sua marca, sem citar o autor original.',
  'Vender ao consumidor final, pelo preço que você definir.',
  'Vender os itens juntos ou separados, sem limite de cópias.',
  'Usar qualquer item como bônus de outro produto seu.',
];
export const LICENCA_NAO_PODE = [
  'Revender, ceder ou repassar a licença PLR a outras pessoas.',
  'Compartilhar ou vender os arquivos editáveis.',
  'Distribuir o material de graça em sites, grupos ou redes de compartilhamento.',
  'Afirmar que o conteúdo é exclusivo seu.',
];

export function slug(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'oferta';
}

export function precoBr(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}

/** "1.249,90" -> 1249.9 | "49,90" -> 49.9 | 49.9 -> 49.9 */
export function numeroBr(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[^\d.,]/g, '');
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0;
}

/** Produto como o usuário informou, limpo e com tamanhos seguros. É a ÚNICA fonte de fatos da oferta. */
export function limparProduto(p = {}) {
  const t = (v, max) => String(v ?? '').trim().slice(0, max);
  const lista = (v, max) => (Array.isArray(v) ? v : []).slice(0, max);
  return {
    tipo: p.tipo === 'final' ? 'final' : 'plr',
    titulo: t(p.titulo, 90),
    descricao: t(p.descricao, 600),
    publico: t(p.publico, 200),
    itens: lista(p.itens, 12).map((i) => ({ titulo: t(i.titulo, 90), descricao: t(i.descricao, 300), paginas: Math.max(0, Math.min(2000, parseInt(i.paginas, 10) || 0)) })).filter((i) => i.titulo),
    bonus: lista(p.bonus, 6).map((b) => ({ titulo: t(b.titulo, 90), descricao: t(b.descricao, 300), paginas: Math.max(0, Math.min(2000, parseInt(b.paginas, 10) || 0)) })).filter((b) => b.titulo),
    itensConfirmados: !!p.itensConfirmados,
    preco: Math.max(0, Math.min(100000, numeroBr(p.preco))),
    garantiaDias: Math.max(7, Math.min(90, parseInt(p.garantiaDias, 10) || 7)),
    vendedor: t(p.vendedor, 90),
    documento: t(p.documento, 30),
    emailSuporte: t(p.emailSuporte, 120),
    imagemUrl: /^https:\/\//.test(String(p.imagemUrl || '')) ? t(p.imagemUrl, 500) : '',
    checkoutUrl: /^https:\/\//.test(String(p.checkoutUrl || '')) ? t(p.checkoutUrl, 500) : '',
    pixel: !!p.pixel,
  };
}

/** Números que aparecem na página: saem dos dados do produto, nunca da IA. */
export function numerosDoProduto(produto) {
  const n = [];
  const itens = produto.itens || [];
  const bonus = produto.bonus || [];
  const paginas = [...itens, ...bonus].reduce((s, i) => s + (i.paginas || 0), 0);
  if (itens.length) n.push({ valor: String(itens.length), rotulo: itens.length === 1 ? 'material principal' : 'materiais principais' });
  if (bonus.length) n.push({ valor: String(bonus.length), rotulo: bonus.length === 1 ? 'bônus incluído' : 'bônus incluídos' });
  if (paginas) n.push({ valor: String(paginas), rotulo: 'páginas no total' });
  n.push({ valor: `${produto.garantiaDias} dias`, rotulo: 'de garantia' });
  return n;
}

/**
 * A Hotmart recusa e-book de extensão reduzida. Um livro curto sozinho não sai: precisa virar kit.
 * Devolve o motivo do bloqueio ou '' quando está tudo certo.
 */
export function problemaDoKit(produto) {
  const itens = produto.itens || [];
  const bonus = produto.bonus || [];
  if (!itens.length) return 'Informe pelo menos um item do produto.';
  const comPaginas = [...itens, ...bonus].filter((i) => i.paginas > 0);
  const total = comPaginas.reduce((s, i) => s + i.paginas, 0);
  if (itens.length + bonus.length === 1 && total > 0 && total < 30) {
    return `Um livro de ${total} páginas sozinho tende a ser recusado pela plataforma. Monte um kit: junte mais livros ou acrescente bônus.`;
  }
  return '';
}

// ---------- Texto da oferta: de onde a trava e as regras leem ----------

/** Todos os trechos de texto escritos pela IA (ou editados por você), cada um com o nome do campo onde está. */
export function trechosDaOferta(oferta) {
  const out = [];
  const add = (campo, texto) => { if (String(texto || '').trim()) out.push({ campo, texto: String(texto) }); };
  const pg = oferta?.pagina || {};
  ['chamada', 'titulo', 'subtitulo', 'botao', 'fechamento'].forEach((c) => add(`Página · ${c}`, pg[c]));
  (pg.beneficios || []).forEach((b, i) => { add(`Página · benefício ${i + 1}`, b.titulo); add(`Página · benefício ${i + 1}`, b.texto); });
  (pg.paraQuem || []).forEach((t, i) => add(`Página · para quem ${i + 1}`, t));
  (pg.comoFunciona || []).forEach((p, i) => { add(`Página · passo ${i + 1}`, p.titulo); add(`Página · passo ${i + 1}`, p.texto); });
  (pg.duvidas || []).forEach((d, i) => { add(`Página · dúvida ${i + 1}`, d.pergunta); add(`Página · dúvida ${i + 1}`, d.resposta); });
  add('Cadastro · nome', oferta?.cadastro?.nome);
  add('Cadastro · descrição', oferta?.cadastro?.descricao);
  add('Afiliados', oferta?.afiliados);
  const dv = oferta?.divulgacao || {};
  (dv.posts || []).forEach((t, i) => add(`Divulgação · post ${i + 1}`, t));
  (dv.anuncios || []).forEach((a, i) => { add(`Divulgação · anúncio ${i + 1}`, a.titulo); add(`Divulgação · anúncio ${i + 1}`, a.texto); });
  add('Divulgação · roteiro de vídeo', dv.roteiroVideo);
  add('Divulgação · e-mail', dv.email?.assunto);
  add('Divulgação · e-mail', dv.email?.corpo);
  return out;
}

// ---------- Regras de conteúdo (o que a plataforma recusa e o que seria mentira) ----------

// Limites de palavra que entendem acento ("Últimas", "não"): o \b do JavaScript só conhece letras sem acento.
const INI = '(?<![\\p{L}\\p{N}])';
const FIM = '(?![\\p{L}\\p{N}])';
const palavra = (alternativas) => new RegExp(`${INI}(?:${alternativas})${FIM}`, 'iu');
const NEGACAO = palavra('n[aã]o|nem|sem|nenhum\\p{L}*|nunca|jamais');

const REGRAS = [
  { tipo: 'Promessa de ganho', re: palavra('ganhe|ganhar dinheiro|fature|faturar|faturamento|lucre|lucro garantido|renda extra|renda passiva|dinheiro r[aá]pido|enrique[cç]\\p{L}*|resultado garantido|vendas garantidas|retorno garantido|r\\$\\s?[\\d.,]+\\s*(?:por|ao|a cada)\\s*(?:dia|m[eê]s|semana)'), negavel: true },
  { tipo: 'Depoimento ou número de clientes sem prova', re: palavra('depoimentos?|avalia[cç][oõ]es de clientes|alunos satisfeitos|clientes satisfeitos|mais vendido|n[uú]mero 1|n[ºo]\\s?1|\\d[\\d.]*\\s*(?:mil\\s+)?(?:alunos|clientes|fam[ií]lias|vendas|compradores)|milhares de (?:pessoas|alunos|clientes|fam[ií]lias)'), negavel: true },
  { tipo: 'Urgência ou escassez inventada', re: palavra('[uú]ltimas (?:vagas|unidades|horas)|s[oó] hoje|somente hoje|oferta (?:termina|acaba|expira)|vagas limitadas|por tempo limitado|antes que acabe|pre[cç]o vai subir') },
  { tipo: 'Preço "de/por" sem preço anterior real', re: palavra('de\\s+r\\$\\s?[\\d.,]+\\s+por') },
  { tipo: 'Exclusividade (PLR não é exclusivo)', re: palavra('conte[uú]do exclusivo|material exclusivo|exclusividade'), soPlr: true, negavel: true },
];

function frases(texto) {
  return String(texto).split(/(?<=[.!?\n])\s+/).map((f) => f.trim()).filter(Boolean);
}

/** Devolve os alertas das regras de conteúdo: [{ tipo, campo, frase }]. Lista vazia = pode seguir. */
export function alertasDeConteudo(oferta, produto) {
  const alertas = [];
  for (const { campo, texto } of trechosDaOferta(oferta)) {
    for (const frase of frases(texto)) {
      for (const regra of REGRAS) {
        if (regra.soPlr && produto?.tipo !== 'plr') continue;
        if (!regra.re.test(frase)) continue;
        // "não prometemos ganhos" é exatamente o aviso que queremos manter
        if (regra.negavel && NEGACAO.test(frase)) continue;
        alertas.push({ tipo: regra.tipo, campo, frase: frase.slice(0, 220) });
      }
    }
  }
  return alertas;
}

// ---------- Termos de uso e política de privacidade da página pública ----------

export function textoTermos(produto) {
  const quem = [produto.vendedor || '[NOME DO VENDEDOR]', produto.documento].filter(Boolean).join(', ');
  const email = produto.emailSuporte || '[E-MAIL DE SUPORTE]';
  const itens = [...(produto.itens || []), ...(produto.bonus || [])].map((i) => i.titulo).join('; ');
  const s = [
    ['Quem vende', [`O produto é vendido por ${quem}. Para falar com o vendedor, escreva para ${email}.`]],
    ['O que você compra', [`Um produto digital: ${itens || produto.titulo}. Não há envio de produto físico.`]],
    ['Pagamento e entrega', ['O pagamento é processado pela plataforma indicada no checkout. Depois da confirmação, os arquivos ficam disponíveis para download na área de membros dessa plataforma.']],
  ];
  if (produto.tipo === 'plr') {
    s.push(['O que a licença permite', LICENCA_PODE]);
    s.push(['O que a licença não permite', [...LICENCA_NAO_PODE, 'A licença é pessoal, não exclusiva e intransferível. Outros compradores recebem o mesmo material.']]);
  } else {
    s.push(['Uso do material', ['O material é para uso pessoal, em casa, na igreja ou em sala de aula. Não é permitido revender nem distribuir os arquivos.']]);
  }
  s.push(['Reembolso', [`Você pode pedir o reembolso integral em até ${produto.garantiaDias} dias a partir da compra, pela plataforma de pagamento ou pelo e-mail de suporte.`]]);
  if (produto.tipo === 'plr') s.push(['Sem promessa de resultado', ['O pacote entrega um produto pronto para vender. O vendedor não promete nem garante ganhos: o resultado depende do seu público, do seu preço e da sua divulgação.']]);
  s.push(['Mudanças nestes termos', ['Estes termos podem ser atualizados. Vale para cada compra a versão publicada na data em que ela foi feita. Aplica-se a legislação brasileira.']]);
  return s.map(([titulo, linhas]) => ({ titulo, linhas }));
}

export function textoPrivacidade(produto) {
  const quem = [produto.vendedor || '[NOME DO VENDEDOR]', produto.documento].filter(Boolean).join(', ');
  const email = produto.emailSuporte || '[E-MAIL DE SUPORTE]';
  const s = [
    ['Quem cuida dos seus dados', [`O responsável pelos dados tratados nesta página é ${quem}. Para qualquer assunto sobre os seus dados, escreva para ${email}.`]],
    ['Dados da compra', ['Esta página não tem formulário de cadastro. Quando você compra, a plataforma de pagamento indicada no checkout coleta os seus dados de cadastro e de pagamento, conforme a política de privacidade dela. O vendedor recebe da plataforma o seu nome, o seu e-mail e as informações do pedido, e não recebe os dados completos do seu cartão.']],
  ];
  s.push(produto.pixel
    ? ['Cookies e medição de visitas', ['Esta página usa cookies e ferramentas de medição de audiência e de anúncios. Elas registram dados de navegação, como endereço IP, tipo de aparelho e páginas visitadas, para medir as visitas e o resultado dos anúncios. Você pode bloquear ou apagar os cookies nas configurações do seu navegador.']]
    : ['Cookies', ['Esta página não usa cookies de anúncios nem ferramentas de medição de audiência.']]);
  s.push(['Para que os dados são usados', ['Entregar o produto e prestar suporte.', 'Processar pedidos de reembolso.', 'Cumprir obrigações legais e fiscais.', ...(produto.pixel ? ['Medir as visitas e o resultado dos anúncios.'] : [])]]);
  s.push(['Seus direitos', [`A Lei Geral de Proteção de Dados (Lei 13.709/2018) garante a você o direito de confirmar se os seus dados são tratados, acessar, corrigir e pedir a exclusão deles. Para exercer esses direitos, escreva para ${email}.`]]);
  return s.map(([titulo, linhas]) => ({ titulo, linhas }));
}
