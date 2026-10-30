// GET /api/texto-claude -> mostra se o "Texto no Claude" está ligado e faz um teste rápido
// (gasta uma fração de centavo). Abra no navegador depois de colocar a ANTHROPIC_API_KEY na Vercel.
import { instalarTudoNaFal, tudoNaFalInstalado } from '../../lib/tudoNaFal';
import { claudeAtivo, modeloClaude } from '../../lib/textoNoClaude';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const instaladoNoInicio = tudoNaFalInstalado();
  instalarTudoNaFal();

  const resultado = {
    ligado: claudeAtivo(),
    modelo: modeloClaude(),
    reserva: process.env.TUDO_NA_FAL === '1' ? 'fal.ai e depois Groq' : 'Groq',
    instaladoNoInicio,
  };
  if (!resultado.ligado) {
    resultado.aviso = 'Desligado: crie a variável ANTHROPIC_API_KEY na Vercel e faça redeploy.';
    return res.status(200).json(resultado);
  }

  try {
    const inicio = Date.now();
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modeloClaude(),
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Escreva um título curto de vídeo sobre Davi e Golias. Responda só o título.' }],
      }),
    });
    const d = await r.json().catch(() => null);
    resultado.teste = r.ok
      ? { ok: true, resposta: (d?.content || []).map((b) => b.text || '').join('').trim(), segundos: (Date.now() - inicio) / 1000 }
      : { ok: false, erro: d?.error?.message || `Claude respondeu ${r.status}` };
  } catch (e) {
    resultado.teste = { ok: false, erro: e.message };
  }
  return res.status(200).json(resultado);
}
