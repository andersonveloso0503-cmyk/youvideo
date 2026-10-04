// Radar de Ofertas — análise de uma oferta de referência.
// POST { url, texto?, sinais? } -> { analise }   lê a página (ou o texto colado) e guarda SÓ o esqueleto
// GET -> { analises } | DELETE ?id=
import { getDb } from '../../../lib/firebase-admin';
import { COL_ANALISES } from '../../../lib/ofertas';
import { lerPagina, contarPalavras } from '../../../lib/ofertasLer';
import { codigosDaOrigem, limparEsqueleto, limparNomesProibidos } from '../../../lib/ofertasTrava';
import { pedirJson, pedidoEsqueleto, normalizarEsqueleto } from '../../../lib/ofertasIa';
import { analiseParaTela } from '../../../lib/ofertasServidor';

export const config = { maxDuration: 120, api: { bodyParser: { sizeLimit: '1mb' } } };
const MIN_PALAVRAS = 150;

export default async function handler(req, res) {
  try {
    const db = getDb();
    if (req.method === 'GET') {
      // a lista não carrega os códigos de conferência (são milhares por análise)
      const snap = await db.collection(COL_ANALISES).orderBy('criadoEm', 'desc').limit(50).select('endereco', 'criadoEm', 'esqueleto', 'nomesProibidos', 'palavrasOrigem', 'sequencias', 'sinais').get();
      return res.status(200).json({ analises: snap.docs.map((d) => analiseParaTela({ id: d.id, ...d.data() })) });
    }
    if (req.method === 'DELETE') {
      if (!req.query.id) return res.status(400).json({ erro: 'id faltando.' });
      await db.collection(COL_ANALISES).doc(String(req.query.id)).delete();
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
    if (!process.env.GROQ_API_KEY) return res.status(500).json({ erro: 'GROQ_API_KEY não configurada.' });

    const b = req.body || {};
    const colado = String(b.texto || '').trim().slice(0, 200000);
    let endereco = String(b.url || '').trim().slice(0, 600);
    let texto = colado;
    if (contarPalavras(colado) < MIN_PALAVRAS) {
      if (!endereco) return res.status(400).json({ erro: 'Cole o link da página de vendas.' });
      const lida = await lerPagina(endereco);
      texto = lida.texto;
      endereco = lida.endereco;
      if (contarPalavras(texto) < MIN_PALAVRAS) {
        return res.status(422).json({ erro: 'Não consegui ler o texto dessa página (ela é montada só no navegador). Abra o link, selecione tudo, copie e cole o texto no campo abaixo.', colar: true });
      }
    }

    const j = await pedirJson(pedidoEsqueleto(texto), { temperatura: 0.3, valido: (x) => !!(x && x.nicho && Array.isArray(x.secoes)) });
    const codigos = codigosDaOrigem(texto);
    const esqueleto = limparEsqueleto(normalizarEsqueleto(j), codigos);
    // só vale como "nome da origem" o que realmente aparece no texto dela
    const plano = texto.toLowerCase();
    const nomesProibidos = limparNomesProibidos((Array.isArray(j.nomesProprios) ? j.nomesProprios : []).filter((n) => plano.includes(String(n || '').toLowerCase())));
    const s = b.sinais || {};
    const analise = {
      endereco,
      criadoEm: new Date().toISOString(),
      esqueleto,
      codigos, // códigos das sequências de 5 palavras: é tudo que fica do texto da origem
      sequencias: codigos.length,
      nomesProibidos,
      palavrasOrigem: contarPalavras(texto),
      sinais: { temperatura: String(s.temperatura || '').slice(0, 20), diasAnuncio: String(s.diasAnuncio || '').slice(0, 20) },
    };
    const ref = await db.collection(COL_ANALISES).add(analise);
    return res.status(200).json({ analise: analiseParaTela({ id: ref.id, ...analise }) });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
