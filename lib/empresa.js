// Vídeos de divulgação da empresa (LCS Terceirização) — a "fábrica" da empresa.
// Mesma linha de produção dos Shorts bíblicos (roteiro → voz → imagens → montagem no PC → agenda),
// só que com roteiro de divulgação e publicando na Página e no Instagram da LCS.

export const EMPRESAS = {
  lcs: {
    nome: 'LCS Terceirização',
    marca: 'LCS Terceirização',
    cidade: 'Porto Alegre e região',
    whatsapp: '(51) 99889-3033',
    site: 'lcsterceirizacaors.com.br',
    servicos: ['limpeza', 'portaria', 'zeladoria'],
    publico: 'síndicos e administradoras de condomínios, e empresas',
    fatos: [
      'mais de 10 anos de atuação',
      'atende condomínios residenciais e empresas',
      'serviços de limpeza, portaria e zeladoria',
      'equipe uniformizada, treinada e com supervisão',
      'substituição do funcionário em faltas e férias, sem o condomínio ficar descoberto',
      'a empresa cuida de contratação, folha, encargos e treinamento',
    ],
    hashtags: ['#portoalegre', '#condominio', '#sindico', '#terceirizacao', '#portaria', '#limpeza', '#zeladoria', '#lcsterceirizacao'],
    cta: 'WhatsApp (51) 99889-3033',
    chamadaLegenda: '📲 Peça seu orçamento pelo WhatsApp (51) 99889-3033',
    acoesLegenda: [
      'pedir um orçamento pelo WhatsApp', 'chamar no WhatsApp para tirar dúvidas', 'enviar para o síndico ou a administradora do seu condomínio',
      'salvar para mostrar na próxima assembleia', 'marcar alguém da administração do prédio', 'comentar "QUERO" para receber uma proposta',
    ],
    env: { token: 'LCS_FACEBOOK_PAGE_ACCESS_TOKEN', pagina: 'LCS_FACEBOOK_PAGE_ID', instagram: 'LCS_INSTAGRAM_BUSINESS_ACCOUNT_ID' },
  },
};

export function empresa(id) {
  return EMPRESAS[id] || null;
}

/** O que falta configurar na Vercel para publicar na conta da empresa. Vazio = tudo certo. */
export function faltaConfigurar(id, redes = {}) {
  const e = empresa(id);
  if (!e) return ['empresa desconhecida'];
  const falta = [];
  if ((redes.facebook || redes.instagram) && !process.env[e.env.token]) falta.push(e.env.token);
  if (redes.facebook && !process.env[e.env.pagina]) falta.push(e.env.pagina);
  if (redes.instagram && !process.env[e.env.instagram]) falta.push(e.env.instagram);
  return falta;
}

async function groqJson(mensagens, temperatura = 0.9) {
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: modelo,
        temperature: temperatura,
        response_format: { type: 'json_object' },
        max_completion_tokens: 4000,
        ...(modelo.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
        messages: mensagens,
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
    return JSON.parse(d.choices?.[0]?.message?.content || '{}');
  };
  try {
    return await pedir('openai/gpt-oss-120b');
  } catch {
    return pedir('llama-3.3-70b-versatile');
  }
}

/** Temas (ângulos) dos vídeos de divulgação, sem repetir os já usados. */
export async function temasEmpresa(id, qtd, evitar = []) {
  const e = empresa(id);
  const j = await groqJson([
    {
      role: 'system',
      content:
        `Você planeja vídeos curtos (Reels de 25 a 30 segundos) para o Instagram e o Facebook da ${e.nome}, empresa de terceirização de ${e.servicos.join(', ')} em ${e.cidade}. ` +
        `Público: ${e.publico}. O que é verdade sobre a empresa: ${e.fatos.join('; ')}. ` +
        'Responda só JSON: {"temas": ["...", "..."]}. Cada tema é UMA ideia específica de vídeo, numa frase, que fala de uma dor ou desejo real do público e de como a terceirização resolve ' +
        '(ex.: "O porteiro faltou e o prédio ficou sem ninguém: como a terceirização resolve na hora", "Quanto custa de verdade ter um funcionário próprio no condomínio", ' +
        '"3 sinais de que a limpeza do seu prédio precisa de uma empresa especializada"). ' +
        `Varie entre os serviços (${e.servicos.join(', ')}), entre condomínios e empresas, e entre os formatos: dor do dia a dia, lista de dicas, mito x verdade, antes e depois, pergunta direta. ` +
        'Não invente preços, números, prêmios nem certificações. Nada repetido nem parecido com a lista de já usados.',
    },
    { role: 'user', content: `Quero ${qtd} temas diferentes.\n\nJá usados (não repetir):\n${evitar.slice(0, 120).map((t) => `- ${t}`).join('\n') || '(nenhum)'}` },
  ]);
  const vistos = new Set(evitar.map((t) => String(t).toLowerCase()));
  return (Array.isArray(j.temas) ? j.temas : []).map((t) => String(t).trim()).filter((t) => t && !vistos.has(t.toLowerCase())).slice(0, qtd);
}

/** Roteiro do vídeo de divulgação, no mesmo formato do roteiro dos vídeos narrados (para seguir a mesma linha de produção). */
export async function gerarRoteiroEmpresa(id, { tema, duracaoDesejada }) {
  const e = empresa(id);
  const seg = Math.max(20, Math.min(45, Number(duracaoDesejada) || 30));
  const palavras = Math.round(seg * 2.3);
  const j = await groqJson([
    {
      role: 'system',
      content:
        `Você é redator publicitário da ${e.nome} (terceirização de ${e.servicos.join(', ')} em ${e.cidade}) e escreve roteiros de Reels narrados. ` +
        `O que é verdade sobre a empresa (use só isto, sem inventar preço, número, prêmio ou certificação): ${e.fatos.join('; ')}. Público: ${e.publico}. ` +
        'Responda só JSON neste formato: ' +
        '{"titulo": "título curto do vídeo (até 60 caracteres)", ' +
        '"descricao": "2 frases para a descrição", ' +
        '"tags": ["8 a 12 palavras-chave"], ' +
        `"narracao": "texto falado completo, com cerca de ${palavras} palavras", ` +
        '"cenas": [{"descricao": "descrição visual da cena para gerar uma imagem realista", "textoNarrado": "trecho da narração dessa cena"}]}. ' +
        'REGRAS DA NARRAÇÃO: comece nos primeiros 3 segundos com a dor ou a pergunta do tema (nada de "olá" nem "você sabia"); frases curtas, tom humano e confiante, português do Brasil; ' +
        `mostre como a ${e.nome} resolve; termine com a chamada: peça seu orçamento pelo WhatsApp (não fale o número — ele aparece na tela). ` +
        'REGRAS DAS CENAS: de 5 a 6 cenas; a soma dos "textoNarrado" é a narração inteira, na ordem; cada "descricao" é uma foto realista e profissional no Brasil: ' +
        'prédios e condomínios modernos, portaria, recepção, corredores, áreas comuns, equipe com uniforme azul-marinho limpo e crachá, luz natural, enquadramento vertical; ' +
        'sem texto, letras, placas, logotipos ou marcas na imagem; pessoas adultas, de costas ou em plano médio, expressão tranquila; nada de acidentes, sujeira extrema ou situações de perigo.',
    },
    { role: 'user', content: `Tema do vídeo: ${tema}` },
  ], 0.8);
  if (!j.narracao || !Array.isArray(j.cenas) || !j.cenas.length) throw new Error('Roteiro: a IA não devolveu o roteiro completo');
  return {
    titulo: String(j.titulo || tema).slice(0, 90),
    descricao: String(j.descricao || ''),
    tags: Array.isArray(j.tags) ? j.tags : [],
    narracao: String(j.narracao),
    cenas: j.cenas.slice(0, 7).map((c) => ({ descricao: String(c.descricao || ''), textoNarrado: String(c.textoNarrado || '') })),
  };
}
