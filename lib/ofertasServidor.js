// Radar de Ofertas — conferência completa de uma oferta (só no servidor).
// Toda vez que a oferta é gerada, salva ou publicada, ela passa por aqui. O que vem do navegador
// nunca é aceito como "já conferido": trava, alertas, situação e endereço são sempre recalculados.
import { COL_ANALISES, alertasDeConteudo, limparProduto, problemaDoKit, ordemDasSecoes } from './ofertas';
import { travaDaOferta, limparNomesProibidos } from './ofertasTrava';
import { normalizarOferta } from './ofertasIa';

export async function carregarAnalise(db, id) {
  if (!id) return null;
  const snap = await db.collection(COL_ANALISES).doc(String(id)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Sem os códigos da origem (são muitos e só servem ao servidor). */
export function analiseParaTela(a) {
  if (!a) return null;
  const { codigos, ...resto } = a;
  return { ...resto, sequencias: resto.sequencias ?? (codigos || []).length };
}

/** Limpa o que veio da tela e recalcula trava, alertas e pendências. Devolve a oferta pronta para salvar. */
export function conferirOferta(entrada, analise) {
  const produto = limparProduto(entrada.produto);
  const textos = normalizarOferta(entrada);
  const origem = { codigos: analise?.codigos || [], nomesProibidos: limparNomesProibidos(analise?.nomesProibidos, produto.titulo) };
  const trava = travaDaOferta(textos, origem);
  const alertas = alertasDeConteudo(textos, produto);
  const pendencias = [];
  if (!analise) pendencias.push('A análise de origem desta oferta foi apagada. Gere a oferta de novo a partir de uma análise.');
  if (!trava.ok) pendencias.push('A trava de originalidade encontrou trechos parecidos com a página de origem.');
  if (alertas.length) pendencias.push('Há frases que quebram as regras de conteúdo.');
  const kit = problemaDoKit(produto);
  if (kit) pendencias.push(kit);
  if (!produto.itensConfirmados) pendencias.push('Confirme que os itens e bônus listados existem de verdade e estão prontos para entrega.');
  if (!produto.preco) pendencias.push('Informe o preço.');
  if (!produto.vendedor) pendencias.push('Informe o nome do vendedor.');
  if (!produto.emailSuporte) pendencias.push('Informe o e-mail de suporte.');
  return {
    analiseId: analise?.id || entrada.analiseId || '',
    produto,
    pagina: textos.pagina,
    cadastro: textos.cadastro,
    afiliados: textos.afiliados,
    divulgacao: textos.divulgacao,
    secoes: ordemDasSecoes(analise?.esqueleto?.secoes, produto),
    trava,
    alertas,
    pendencias,
  };
}
