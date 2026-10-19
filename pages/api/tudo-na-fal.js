// GET /api/tudo-na-fal          -> mostra se o desvio está ligado e testa o texto na fal
// GET /api/tudo-na-fal?imagem=1 -> testa também uma imagem (gasta ~US$ 0,03)
import { instalarTudoNaFal, tudoNaFalAtivo, tudoNaFalInstalado } from '../../lib/tudoNaFal';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const instaladoNoInicio = tudoNaFalInstalado();
  instalarTudoNaFal();

  const resultado = {
    ligado: tudoNaFalAtivo(),
    instaladoNoInicio,
    modeloTexto: process.env.FAL_MODELO_TEXTO || '(o mesmo de cada tela)',
    testes: {},
  };
  if (!process.env.FAL_KEY) resultado.aviso = 'FAL_KEY não está configurada na Vercel.';
  else if (!resultado.ligado) resultado.aviso = 'Desligado: crie TUDO_NA_FAL = 1 na Vercel e faça redeploy.';
  else if (!instaladoNoInicio) resultado.aviso = 'O desvio não ligou sozinho no início do servidor. Confira se o instrumentation.js e o next.config.js novos subiram.';

  if (resultado.ligado) {
    const fal = { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' };
    try {
      const r = await fetch('https://fal.run/openrouter/router/openai/v1/chat/completions', {
        method: 'POST',
        headers: fal,
        body: JSON.stringify({
          model: process.env.FAL_MODELO_TEXTO || 'openai/gpt-oss-20b',
          messages: [{ role: 'user', content: 'Responda só: ok' }],
          max_tokens: 200,
        }),
      });
      const d = await r.json().catch(() => null);
      resultado.testes.texto = r.ok && (d?.choices || d?.output?.choices)
        ? { ok: true, resposta: (d.choices || d.output.choices)[0]?.message?.content || '' }
        : { ok: false, erro: JSON.stringify(d).slice(0, 300) };
    } catch (e) {
      resultado.testes.texto = { ok: false, erro: e.message };
    }

    if (req.query.imagem) {
      try {
        const r = await fetch('https://fal.run/fal-ai/flux-2-pro', {
          method: 'POST',
          headers: fal,
          body: JSON.stringify({ prompt: 'Pôr do sol sobre o mar da Galileia, pintura suave', image_size: { width: 768, height: 1344 } }),
        });
        const d = await r.json().catch(() => null);
        resultado.testes.imagem = d?.images?.[0]?.url
          ? { ok: true, url: d.images[0].url }
          : { ok: false, erro: JSON.stringify(d).slice(0, 300) };
      } catch (e) {
        resultado.testes.imagem = { ok: false, erro: e.message };
      }
    }
  }

  return res.status(200).json(resultado);
}
