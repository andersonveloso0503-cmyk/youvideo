// Radar de Ofertas — escreve a oferta nova para o SEU produto, seguindo o esqueleto de uma análise.
// POST { analiseId, produto } -> { oferta }
// A IA recebe só o esqueleto (nunca o texto da página de origem). Mesmo assim o resultado passa pela trava.
import { getDb } from '../../../lib/firebase-admin';
import { COL_OFERTAS, limparProduto } from '../../../lib/ofertas';
import { pedirJson, pedidoOferta, ofertaValida, normalizarOferta } from '../../../lib/ofertasIa';
import { limparNomesProibidos } from '../../../lib/ofertasTrava';
import { carregarAnalise, conferirOferta } from '../../../lib/ofertasServidor';

export const config = { maxDuration: 300 };
const TENTATIVAS = 3;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ erro: 'GROQ_API_KEY não configurada.' });
  try {
    const db = getDb();
    const analise = await carregarAnalise(db, req.body?.analiseId);
    if (!analise) return res.status(400).json({ erro: 'Escolha uma análise primeiro.' });
    let produto = limparProduto(req.body?.produto);
    if (!produto.titulo) return res.status(400).json({ erro: 'Dê um nome ao seu produto.' });
    const nomesProibidos = limparNomesProibidos(analise.nomesProibidos, produto.titulo);

    let melhor = null;
    let reforco = '';
    for (let i = 0; i < TENTATIVAS; i++) {
      const j = await pedirJson(pedidoOferta({ esqueleto: analise.esqueleto || {}, produto, nomesProibidos, reforco }), { temperatura: 0.8, valido: ofertaValida });
      const textos = normalizarOferta(j);
      let prod = produto;
      if (!produto.itens.length && textos.estrutura?.itens?.length) {
        // estrutura sugerida pela IA: fica marcada como NÃO confirmada até você criar os materiais
        prod = { ...produto, itens: textos.estrutura.itens, bonus: produto.bonus.length ? produto.bonus : textos.estrutura.bonus, itensConfirmados: false };
      }
      const conferida = conferirOferta({ ...textos, produto: prod, analiseId: analise.id }, analise);
      const problemas = conferida.trava.trechos.length + conferida.trava.nomes.length + conferida.alertas.length + (conferida.trava.refazer ? 5 : 0);
      if (!melhor || problemas < melhor.problemas) melhor = { conferida, problemas, sugerida: prod !== produto };
      if (!problemas) break;
      reforco = [
        conferida.trava.trechos.length || conferida.trava.refazer ? 'o texto anterior ficou parecido com páginas existentes; escreva com outras palavras e outra construção de frase' : '',
        conferida.trava.nomes.length ? `não use estes nomes: ${[...new Set(conferida.trava.nomes.map((n) => n.nome))].join('; ')}` : '',
        conferida.alertas.length ? `o texto anterior quebrou estas regras e precisa ser corrigido: ${[...new Set(conferida.alertas.map((a) => a.tipo))].join('; ')}` : '',
      ].filter(Boolean).join('. ');
      if (prod !== produto) produto = prod; // mantém a mesma estrutura sugerida nas próximas tentativas
    }

    const agora = new Date().toISOString();
    const oferta = { ...melhor.conferida, estruturaSugerida: melhor.sugerida, status: 'rascunho', slug: '', criadoEm: agora, atualizadoEm: agora };
    const ref = await db.collection(COL_OFERTAS).add(oferta);
    return res.status(200).json({ oferta: { id: ref.id, ...oferta } });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
