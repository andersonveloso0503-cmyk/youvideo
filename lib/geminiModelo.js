// 16/11: o Google desligou o "gemini-2.5-flash" (respondia 404) e TODA conferência de foto caía no plano B.
// Aqui: se o modelo pedido não existe mais (404), tenta os nomes que acompanham a versão nova sozinhos
// ("-latest") e guarda o que funcionou para as próximas chamadas.
const ALTERNATIVOS = {
  flash: ['gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-lite-latest'],
  pro: ['gemini-pro-latest', 'gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-flash-latest'],
};
const funcionou = {};

export async function fetchGemini(modelo, key, init) {
  const familia = /pro/.test(String(modelo)) ? 'pro' : 'flash';
  const lista = [...new Set([funcionou[familia], modelo, ...ALTERNATIVOS[familia]].filter(Boolean))];
  let r;
  for (const m of lista) {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent${key ? `?key=${key}` : ''}`, init);
    if (r.status !== 404) {
      if (r.ok && funcionou[familia] !== m) {
        funcionou[familia] = m;
        if (m !== modelo) console.log(`[gemini] usando ${m} (o ${modelo} não existe mais)`);
      }
      return r;
    }
  }
  return r;
}
