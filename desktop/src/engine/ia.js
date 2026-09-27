// Títulos, descrições e tags com IA (Groq — mesma chave usada na legenda).
const MODELO = 'openai/gpt-oss-120b';
const MODELO_RESERVA = 'llama-3.3-70b-versatile';

function limparNome(nome) {
  return String(nome || '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+-\s+Parte\s+\d+$/i, (m) => m) // mantém "Parte X"
    .replace(/\s+/g, ' ')
    .trim();
}

async function chamarGroq(groqKey, mensagens, modelo) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: modelo,
      messages: mensagens,
      temperature: 0.8,
      max_completion_tokens: 2500,
      response_format: { type: 'json_object' },
    }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = d?.error?.message || `Groq respondeu ${r.status}`;
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  return d?.choices?.[0]?.message?.content || '';
}

function lerJson(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    const m = String(texto).match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('A IA respondeu num formato inesperado. Tente de novo.');
  }
}

/**
 * Gera { titulo, descricao, tags } para um vídeo.
 * info = { nome, musicas: [titulos], duracaoSeg, curto, canal, contexto, idioma }
 */
async function gerarTextosVideo(groqKey, info) {
  if (!groqKey) throw new Error('Para gerar com IA, cadastre a chave da Groq em Configurações.');
  const idioma = info.idioma === 'en' ? 'inglês' : info.idioma === 'es' ? 'espanhol' : 'português do Brasil';
  const horas = info.duracaoSeg ? Math.floor(info.duracaoSeg / 3600) : 0;
  const minutos = info.duracaoSeg ? Math.round((info.duracaoSeg % 3600) / 60) : 0;
  const duracao = info.duracaoSeg ? (horas ? `${horas}h${minutos ? String(minutos).padStart(2, '0') : ''}` : `${minutos} min`) : 'desconhecida';
  const musicas = (info.musicas || []).filter(Boolean).slice(0, 40);

  const sistema = `Você é especialista em SEO de YouTube para canais de música (compilações, playlists, música instrumental, gospel, rock, relaxamento).
Escreva em ${idioma}. Responda SOMENTE com um JSON: {"titulo": "...", "descricao": "...", "tags": ["...", "..."]}.
Regras do título: até 90 caracteres; comece pelo que a pessoa busca (gênero/estilo + ocasião ou sentimento); pode usar 1 emoji e separadores como "|" ou "•"; se o vídeo for longo, diga a duração (ex.: "3 Horas"); nada de clickbait falso; não use aspas; não invente nomes de artistas que não estejam na informação dada.
Regras da descrição: 2 a 4 parágrafos curtos e naturais, com as palavras-chave do nicho no primeiro parágrafo, um convite para curtir, comentar e se inscrever, e 3 a 5 hashtags no final. NÃO inclua lista de músicas nem minutagem (o app coloca isso sozinho).
Regras das tags: 12 a 20 tags curtas, do mais específico ao mais amplo, sem "#".${info.curto ? '\nÉ um YouTube Shorts: título mais curto (até 60 caracteres) e inclua #Shorts nas hashtags.' : ''}`;

  const usuario = `Nome do arquivo do vídeo: ${limparNome(info.nome)}
Duração: ${duracao}${info.curto ? ' (Shorts vertical)' : ''}
${musicas.length ? `Músicas no vídeo (${musicas.length}):\n- ${musicas.join('\n- ')}` : ''}
${info.canal ? `Canal: ${info.canal}` : ''}
${info.contexto ? `Sobre o canal / instruções extras: ${info.contexto}` : ''}`.trim();

  const msgs = [
    { role: 'system', content: sistema },
    { role: 'user', content: usuario },
  ];
  let texto;
  try {
    texto = await chamarGroq(groqKey, msgs, MODELO);
  } catch (e) {
    if (e.status === 401) throw new Error('A chave da Groq foi recusada. Confira em Configurações.');
    texto = await chamarGroq(groqKey, msgs, MODELO_RESERVA);
  }
  const j = lerJson(texto);
  const tags = (Array.isArray(j.tags) ? j.tags : String(j.tags || '').split(','))
    .map((t) => String(t).replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 30);
  return {
    titulo: String(j.titulo || limparNome(info.nome)).replace(/^["']|["']$/g, '').slice(0, 100),
    descricao: String(j.descricao || '').trim(),
    tags,
  };
}

module.exports = { gerarTextosVideo, limparNome };
