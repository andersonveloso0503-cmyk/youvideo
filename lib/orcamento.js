// lib/orcamento.js
// Busca automática de saldo nos serviços que têm API pública de créditos.
// Shotstack e Suno não têm API de saldo pública — por isso ficam de fora
// daqui e são atualizados manualmente (ver pages/api/orcamento.js).

async function buscarSaldoFal() {
  try {
    // O endpoint de saldo da fal.ai exige uma "Admin API key" própria —
    // é diferente da FAL_KEY normal que você já usa pra gerar vídeo.
    // Gere uma em fal.ai/dashboard/keys (tipo "Admin") e salve como
    // FAL_ADMIN_KEY no Vercel.
    if (!process.env.FAL_ADMIN_KEY) throw new Error('FAL_ADMIN_KEY não configurada');
    const resp = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
      headers: { Authorization: `Key ${process.env.FAL_ADMIN_KEY}` },
    });
    if (!resp.ok) throw new Error(`fal.ai respondeu ${resp.status}`);
    const data = await resp.json();
    return {
      ok: true,
      saldo: data.credits?.current_balance ?? null,
      moeda: data.credits?.currency ?? 'USD',
    };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

async function buscarSaldoFlux() {
  try {
    // Mesma variável que o generate-visual.js já usa pra gerar imagem
    if (!process.env.FLUX_API_KEY) throw new Error('FLUX_API_KEY não configurada');
    const resp = await fetch('https://api.bfl.ai/v1/credits', {
      headers: { 'x-key': process.env.FLUX_API_KEY },
    });
    if (!resp.ok) throw new Error(`Black Forest Labs respondeu ${resp.status}`);
    const data = await resp.json();
    return { ok: true, saldo: data.credits ?? null, moeda: 'créditos' };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

async function buscarSaldoElevenLabs() {
  try {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY não configurada');
    const resp = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    });
    if (!resp.ok) throw new Error(`ElevenLabs respondeu ${resp.status}`);
    const data = await resp.json();
    const limite = data.character_limit ?? null;
    const usado = data.character_count ?? null;
    const restante = limite !== null && usado !== null ? limite - usado : null;
    return { ok: true, saldo: restante, limite, usado, moeda: 'caracteres' };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

module.exports = { buscarSaldoFal, buscarSaldoFlux, buscarSaldoElevenLabs };
