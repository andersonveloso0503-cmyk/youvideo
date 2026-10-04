// Livros bíblicos — a IA escreve o livro (texto original) a partir da história escolhida.
// POST { tipo: 'infantil'|'adulto', historia, paginas: 12|16, detalhes } -> { livro }
import { pedidoLivro, partes } from '../../../lib/livros';

export const config = { maxDuration: 120 };

async function pedir(modelo, mensagens) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: modelo,
      temperature: 0.8,
      max_completion_tokens: 9000,
      response_format: { type: 'json_object' },
      ...(modelo.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      messages: mensagens,
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
  return JSON.parse(d.choices?.[0]?.message?.content || '{}');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ erro: 'GROQ_API_KEY não configurada.' });
  const b = req.body || {};
  const tipo = b.tipo === 'adulto' ? 'adulto' : 'infantil';
  const historia = String(b.historia || '').trim().slice(0, 300);
  if (!historia) return res.status(400).json({ erro: 'Escolha ou escreva a história.' });
  const paginas = Number(b.paginas) === 16 ? 16 : 12;
  const n = partes(tipo, paginas);
  const mensagens = pedidoLivro({ tipo, historia, paginas, detalhes: String(b.detalhes || '').slice(0, 400) });
  const texto = (t, max = 4000) => String(t || '').trim().slice(0, max);
  try {
    let ultimo = '';
    for (const modelo of ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b']) {
      try {
        const j = await pedir(modelo, mensagens);
        const lista = tipo === 'adulto' ? j.capitulos : j.paginas;
        if (!j.titulo || !Array.isArray(lista) || lista.length < Math.max(4, n - 2)) { ultimo = 'a IA devolveu o livro incompleto'; continue; }
        const base = { tipo, historia, paginas, titulo: texto(j.titulo, 80), subtitulo: texto(j.subtitulo, 140), referencia: texto(j.referencia, 80), capa: { cena: texto(j.capa, 500), url: '' } };
        const livro = tipo === 'adulto'
          ? {
              ...base,
              introducao: texto(j.introducao),
              capitulos: lista.slice(0, n).map((c) => ({ titulo: texto(c.titulo, 90), texto: texto(c.texto), aplicacao: texto(c.aplicacao, 500), oracao: texto(c.oracao, 500), cena: texto(c.cena, 500), url: '' })),
              conclusao: texto(j.conclusao),
              oracaoFinal: texto(j.oracaoFinal, 1200),
            }
          : {
              ...base,
              personagem: texto(j.personagem, 300),
              paginasTexto: lista.slice(0, n).map((p) => ({ texto: texto(p.texto, 700), cena: texto(p.cena, 500), url: '' })),
              licao: texto(j.licao, 700),
              oracao: texto(j.oracao, 500),
              perguntas: (Array.isArray(j.perguntas) ? j.perguntas : []).slice(0, 4).map((q) => texto(q, 200)),
            };
        return res.status(200).json({ livro });
      } catch (e) {
        ultimo = e.message;
      }
    }
    return res.status(500).json({ erro: `Não consegui escrever o livro agora (${ultimo}). Tente de novo.` });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
