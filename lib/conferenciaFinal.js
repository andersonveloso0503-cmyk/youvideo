import { fetchGemini } from './geminiModelo';
// CONFERÊNCIA FINAL (pedido do dono: "confere tudo antes, prefiro do que ficar errando").
// Roda sozinha quando um vídeo de games/política/documentário fica pronto e vai para o ✅ Aprovar.
// Monta uma LINHA DO TEMPO conferindo, nesta ordem:
//   1. Texto (título, descrição e narração): ortografia, letra faltando, palavra errada
//   2. Início do áudio: a fala não pode começar colada no 0 s (a 1ª letra some no celular)
//   3. Legenda: existe, acompanha a fala e não fica buraco sem legenda
//   4. Cada cena: a imagem/vídeo mostra o que está sendo dito? É o jogo certo / a pessoa certa?
//   5. Capa: texto escrito certo, combina com o assunto, jogo/pessoa certos, sem rosto inventado de político
//   6. Final: o "se inscreve" é a última fala
// Usa o Claude com visão (não depende dos créditos do Gemini). Resultado em item.conferencia,
// mostrado no ✅ Aprovar (celular e Compilador) com ✅ / ⚠️ em cada etapa.
import { CLAUDE_URL } from './textoNoClaude';

const MODELO = () => (process.env.CLAUDE_MODELO_CONFERENCIA || '').trim() || 'claude-sonnet-5-5';
const MAX_IMAGENS = 24;
const UA = 'Youvideo/1.0 (https://youvideors2.vercel.app)';

const limpo = (t) => String(t || '').replace(/^@\s*/, '').replace(/\s+/g, ' ').trim();
const mmss = (s) => {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

async function imagemBase64(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 3.6e6 || buf.length < 800) return null;
    const tipo = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : buf.slice(0, 4).toString() === 'RIFF' ? 'image/webp' : buf.slice(0, 3).toString() === 'GIF' ? 'image/gif' : null;
    if (!tipo) return null;
    return { type: 'image', source: { type: 'base64', media_type: tipo, data: buf.toString('base64') } };
  } catch {
    return null;
  }
}

/** O que o narrador fala entre start e start+length (pelas palavras da legenda; senão pelo texto das cenas). */
function falaDaCena(item, a, i, total) {
  const pal = item.narracao?.palavras || [];
  if (pal.length && a.start != null) {
    const fim = a.start + (a.length || 3);
    const t = pal.filter((p) => p.start >= a.start - 0.15 && p.start < fim).map((p) => p.texto).join(' ');
    if (t) return t;
  }
  const cenas = item.roteiro?.cenas || [];
  const c = cenas[Math.min(cenas.length - 1, Math.floor((i / Math.max(1, total)) * cenas.length))];
  return limpo(c?.textoNarrado || c?.texto || a.textoNarrado || '');
}

function textoDaIlustracao(il) {
  const partes = [];
  const andar = (v) => {
    if (v == null) return;
    if (typeof v === 'string' || typeof v === 'number') partes.push(String(v));
    else if (Array.isArray(v)) v.forEach(andar);
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!['tipo', 'clima', 'cor', 'quem', 'casa', 'icone', 'lugar', 'videoUrl', 'fotoUrl', 'url', 'videoCredito'].includes(k)) andar(x);
  };
  andar(il);
  return partes.join(' | ').slice(0, 400);
}

/** Conferência completa. Devolve { status:'ok'|'atencao'|'erro', em, etapas:[{nome, ok, detalhe}], cenas:[...] }. */
// Conferência pelo Gemini quando o Claude não responde (mesmo pedido, mesmas imagens)
async function conferirNoGemini(conteudo) {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('sem GEMINI_API_KEY');
  const parts = conteudo.map((b) => (b.type === 'image' ? { inlineData: { mimeType: b.source.media_type, data: b.source.data } } : { text: b.text || '' }));
  const modelo = (process.env.GEMINI_MODELO_CONFERENCIA || '').trim() || 'gemini-flash-latest'; // 18/11: o Pro custava caro (era reserva do Claude)
  const r = await fetchGemini(modelo, null, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8000 } }),
    signal: AbortSignal.timeout(150000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `Gemini ${r.status}`);
  const txt = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!txt.includes('{')) throw new Error('Gemini não devolveu a conferência');
  return txt;
}

export async function conferirVideo(item) {
  const etapas = [];
  let semCreditoIA = false;
  let notaVideo = null;
  const titulo = item.roteiro?.titulo || item.tema || '';
  const descricao = String(item.roteiro?.descricao || '').slice(0, 1500);
  const narracao = String(item.roteiro?.narracao || (item.roteiro?.cenas || []).map((c) => c.textoNarrado || c.texto || '').join(' ')).slice(0, 6000);
  const arquivos = (item.arquivos || []).filter((a) => !a.cauda);

  // ---- 2. Início do áudio (sem IA)
  const ini = Number(item.narracao?.audioSegments?.[0]?.start ?? 0);
  etapas.push(
    ini >= 0.3
      ? { nome: 'Início do áudio', ok: true, detalhe: `A fala começa em ${ini.toFixed(1)} s (a 1ª letra não some).` }
      : { nome: 'Início do áudio', ok: false, detalhe: 'A fala começa colada no 0 s: no celular a 1ª letra pode sumir. Refazer resolve.' }
  );

  // ---- Narrador (sem IA): política e Brasil Inacreditável têm voz própria; se caiu na voz padrão, avisa o porquê
  if (item.politica || item.brasil) {
    const n = item.narracao || {};
    if (n.vozNarrador === 'padrao') etapas.push({ nome: 'Narrador', ok: false, detalhe: `Saiu com a voz PADRÃO, não a do canal: ${n.vozMotivo || 'motivo desconhecido'}.` });
    else if (n.vozNarrador === 'canal') etapas.push({ nome: 'Narrador', ok: true, detalhe: 'Voz própria do canal.' });
  }

  // ---- 3. Legenda (sem IA)
  const pal = item.narracao?.palavras || [];
  if (item.games || item.politica) {
    if (!pal.length) etapas.push({ nome: 'Legenda', ok: false, detalhe: 'O vídeo saiu sem as palavras da legenda.' });
    else {
      const falados = narracao.split(/\s+/).filter(Boolean).length;
      let buraco = 0;
      for (let k = 1; k < pal.length; k++) buraco = Math.max(buraco, pal[k].start - pal[k - 1].start);
      const ok = Math.abs(pal.length - falados) <= Math.max(6, falados * 0.08) && buraco < 4;
      etapas.push({
        nome: 'Legenda',
        ok,
        detalhe: ok
          ? `${pal.length} palavras, acompanhando a fala do início ao fim.`
          : buraco >= 4
            ? `Fica ${buraco.toFixed(1)} s sem legenda num trecho.`
            : `A legenda tem ${pal.length} palavras e a narração ${falados}: pode faltar pedaço.`,
      });
    }
  }

  // ---- 6. Final (sem IA)
  const cenasRot = item.roteiro?.cenas || [];
  const ultima = limpo(cenasRot[cenasRot.length - 1]?.textoNarrado || cenasRot[cenasRot.length - 1]?.texto || '');
  // Só na política o "se inscreve" é a ÚLTIMA fala; nos games ele vem logo após o melhor momento e o fim é um gancho
  if (item.formato === 'short' && item.politica) {
    const ok = /inscrev/i.test(ultima);
    etapas.push({ nome: 'Final', ok, detalhe: ok ? 'Termina pedindo para se inscrever.' : `A última fala não pede inscrição: "${ultima.slice(0, 80)}"` });
  }

  // Cenas sem mídia nenhuma
  const semMidia = arquivos.filter((a) => a.erro && !a.ilustracao);
  if (semMidia.length) etapas.push({ nome: 'Mídia das cenas', ok: false, detalhe: `${semMidia.length} cena(s) ficaram sem imagem: ${semMidia[0].erro}` });

  // ---- 1, 4, 5: uma chamada só ao Claude com o texto, as cenas (imagens) e a capa
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  const cenas = arquivos.map((a, i) => ({
    n: i + 1,
    start: a.start,
    fim: a.start != null ? a.start + (a.length || 0) : null,
    fala: falaDaCena(item, a, i, arquivos.length).slice(0, 300),
    midia: a.ilustracao ? `ilustração (${a.ilustracao.tipo})` : a.videoUrl ? 'vídeo' : a.imageUrl ? 'foto' : 'nada',
    jogo: a.jogo || null,
    imageUrl: a.ilustracao?.fotoUrl || a.imageUrl || null,
    ilustracaoTexto: a.ilustracao ? textoDaIlustracao(a.ilustracao) : '',
    ok: null,
    motivo: '',
  }));
  if (!key) {
    etapas.unshift({ nome: 'Conferência com IA', ok: false, detalhe: 'Sem a chave do Claude (ANTHROPIC_API_KEY): só as conferências simples rodaram.' });
    marcarRepetidas(arquivos, cenas, etapas);
    return fechar(etapas, cenas, notaVideo);
  }
  // Até 24 imagens (vídeo longo: amostra espalhada)
  const comImagem = cenas.filter((c) => c.imageUrl && !c.ilustracaoTexto);
  const passo = Math.max(1, Math.ceil(comImagem.length / MAX_IMAGENS));
  const escolhidas = comImagem.filter((_, k) => k % passo === 0).slice(0, MAX_IMAGENS);
  const blocos = await Promise.all(escolhidas.map((c) => imagemBase64(c.imageUrl)));
  const capaImg = item.thumbnailUrl ? await imagemBase64(item.thumbnailUrl) : null;

  const tipoCanal = item.games ? 'GAMES (notícias de jogos)' : item.politica ? 'POLÍTICA (notícias, canal imparcial)' : item.brasil ? 'histórias reais do Brasil' : 'documentário';
  const conteudo = [
    {
      type: 'text',
      text:
        `Você é o REVISOR FINAL de um vídeo de um canal brasileiro de ${tipoCanal}, antes de ir ao YouTube. O dono perde credibilidade com qualquer erro: seja rigoroso, mas não invente problema.\n\n` +
        `TÍTULO: ${titulo}\nDESCRIÇÃO: ${descricao}\nNARRAÇÃO (é também a legenda na tela):\n${narracao}\n\n` +
        'CENAS (o que o narrador fala naquele momento e o que aparece na tela):\n' +
        cenas
          .map((c) => `CENA ${c.n} [${mmss(c.start)}-${mmss(c.fim)}] fala: "${c.fala}" | tela: ${c.midia}${c.jogo ? ` (do jogo ${c.jogo})` : ''}${c.ilustracaoTexto ? ` | texto do desenho: ${c.ilustracaoTexto}` : ''}`)
          .join('\n'),
    },
  ];
  escolhidas.forEach((c, k) => {
    if (!blocos[k]) return;
    conteudo.push({ type: 'text', text: `Imagem da CENA ${c.n} (fala: "${c.fala.slice(0, 160)}"):` }, blocos[k]);
  });
  if (capaImg) conteudo.push({ type: 'text', text: 'CAPA do vídeo (thumbnail):' }, capaImg);
  conteudo.push({
    type: 'text',
    text:
      'Confira e responda SÓ JSON:\n' +
      '{"texto":{"ok":true|false,"erros":["trecho errado -> como fica certo"]},' +
      '"roteiro":{"ok":true|false,"problemas":["curto: qual fala e por quê"]},' +
      '"cenas":[{"n":1,"ok":true|false,"motivo":"curto, só se ok=false"}],' +
      '"capa":{"ok":true|false,"textoLido":"o texto escrito na capa","motivo":"curto, só se ok=false"},' +
      '"nota":0-10,"porqueNota":"uma frase"}\n' +
      'NOTA DO VÍDEO (0 a 10, uma casa decimal): o quanto este vídeo está pronto para ir ao ar e prender quem assiste — começo que fisga, explicação clara, imagens que mostram o que é falado, capa forte, sem erro. 9-10 excelente, 7-8 bom, 5-6 fraco, abaixo de 5 refazer.\n' +
      'FORMATO DOS ERROS DE TEXTO: cada item é EXATAMENTE "trecho errado -> trecho certo", com o trecho certo pronto para substituir o errado palavra por palavra (ele vai direto para a narração). Nada de explicação, alternativas, "ou", aspas ou comentários no trecho certo; se não souber a troca exata, não liste.\n' +
      'TEXTO: erros de ortografia, letra faltando ou sobrando, palavra trocada, acento errado, concordância — no título, na descrição, na narração e nos textos dos desenhos. Estilo e opinião NÃO são erro.\n' +
      'CENAS (só as que têm imagem): ok=false se a imagem NÃO mostra o que está sendo falado, se é de OUTRO jogo (num vídeo de um jogo, gameplay/arte de outro jogo é erro grave, exceto na cena que fala daquele outro jogo), ' +
      'se é outra pessoa (a fala cita alguém e a foto é de outra pessoa), se é de outro país quando a fala é do Brasil, ou se é algo sem relação (carro, paisagem, escritório qualquer num vídeo de games). ' +
      'VÍDEO GENÉRICO DE BANCO (pessoa jogando, controle qualquer, mãos no teclado, cidade, escritório, gente andando) numa cena cuja fala é sobre um JOGO, PESSOA, LUGAR ou FATO específico é ok=false — a tela tem que mostrar AQUELE jogo/pessoa/lugar. ' +
      'Imagem genérica mas coerente (console num vídeo de console, Congresso numa notícia do Congresso) é ok; mas paisagem/vista aérea de cidade, brasão ou prédio qualquer quando a fala é sobre um fato específico (um apartamento, um julgamento, um valor) é ok=false. Cenas de desenho (ilustração) só conferem o TEXTO do desenho.\n' +
      'ROTEIRO (todos os canais): ok=false se a notícia é VELHA/requentada (fala de algo que já aconteceu há dias como se fosse novidade), se é fraca (nota de rotina, sem nada novo), se alguma fala não é do assunto do título ou se promete algo e não entrega (ex.: "no final você vê o trailer"). ' +
      'Na NOTA: imagem que não mostra o que é falado em mais de uma cena, ou notícia velha/fraca, não passa de 6.\n' +
      (item.politica
        ? 'ROTEIRO (política): ok=false se alguma fala NÃO é sobre o assunto do título, se o vídeo promete algo e não entrega ("fica até o fim", "o detalhe mais estranho", pergunta sem resposta), ' +
          'se abre com detalhe ou pessoa secundária em vez do fato principal, ou se tem frase genérica de enchimento. ' +
          'CENAS (política, mais rígido): foto de um político/autoridade numa cena cuja fala NÃO cita essa pessoa é ok=false (ex.: fala sobre trabalhadores do comércio e aparece o ministro). ' +
          'Na nota, vídeo com fala fora do assunto, promessa sem resposta ou voz com cara de robô não passa de 6.\n'
        : '') +
      'CAPA: ok=false se o texto tem erro de escrita, se não combina com o título, se mostra jogo/pessoa errados, ou rosto inventado de político real.',
  });

  try {
    const r = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO(), max_tokens: 3000, messages: [{ role: 'user', content: conteudo }] }), // sem temperature: o modelo atual não aceita
      signal: AbortSignal.timeout(150000),
    });
    let txt;
    if (r.ok) {
      const d = await r.json();
      txt = (d.content || []).map((p) => p.text || '').join('');
    } else {
      const erroClaude = `Claude ${r.status}: ${(await r.text()).slice(0, 160)}`;
      // Claude fora (ex.: crédito da API acabou em 15/11): a MESMA conferência vai para o Gemini, que também enxerga imagem
      txt = await conferirNoGemini(conteudo).catch((e) => {
        throw new Error(`${erroClaude} | Gemini: ${String(e.message || e).slice(0, 120)}`);
      });
      console.log(`[conferencia] Claude fora (${r.status}), conferido pelo Gemini: ${titulo.slice(0, 60)}`);
    }
    import('./freioProducao').then((f) => f.marcarComCredito()).catch(() => {});
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const erros = (j.texto?.erros || []).map(String).filter(Boolean).slice(0, 8);
    const nota = Number(j.nota);
    if (Number.isFinite(nota)) notaVideo = { nota: Math.max(0, Math.min(10, Math.round(nota * 10) / 10)), porque: String(j.porqueNota || '').slice(0, 160) };
    if (j.roteiro) {
      const probs = (j.roteiro.problemas || []).map(String).filter(Boolean).slice(0, 5);
      etapas.push({ nome: 'Roteiro (falas)', ok: j.roteiro.ok !== false && !probs.length, detalhe: probs.length ? probs.join(' · ') : 'Todas as falas são do assunto e o que promete, entrega.' });
    }
    if (notaVideo) { // 17/11: nota 7+ vale para todos os canais (antes só política)
      // 16/11 (dono: "todos você recomenda não subir"): o corte era 8 e quase nada passava. Agora: 7+ sobe
      // (com a dica do que dá para melhorar); abaixo de 7 o próprio sistema reescreve as falas e narra de novo.
      const boa = notaVideo.nota >= 7;
      etapas.push({ nome: 'Nota do vídeo', ok: boa, detalhe: boa ? `Nota ${notaVideo.nota}: pode subir.${notaVideo.nota < 8 && notaVideo.porque ? ` Dá para melhorar: ${notaVideo.porque}` : ''}` : `Nota ${notaVideo.nota}: abaixo do padrão — ${notaVideo.porque || 'abaixo do padrão do canal'}.` });
    }
    etapas.unshift({ nome: 'Texto (título, descrição, narração)', ok: j.texto?.ok !== false && !erros.length, detalhe: erros.length ? erros.join(' · ') : 'Sem erro de escrita.' });
    const porN = Object.fromEntries((j.cenas || []).map((c) => [Number(c.n), c]));
    const vistas = new Set(escolhidas.filter((_, k) => blocos[k]).map((c) => c.n));
    for (const c of cenas) {
      if (c.ilustracaoTexto) c.ok = true;
      else if (vistas.has(c.n)) {
        const x = porN[c.n];
        c.ok = x ? x.ok !== false : true;
        c.motivo = x && x.ok === false ? String(x.motivo || 'não combina com a fala').slice(0, 160) : '';
      }
    }
    const ruins = cenas.filter((c) => c.ok === false);
    etapas.push({
      nome: 'Imagens das cenas',
      ok: !ruins.length,
      detalhe: ruins.length ? ruins.map((c) => `Cena ${c.n} (${mmss(c.start)}): ${c.motivo}`).join(' · ') : `${vistas.size} imagens conferidas com a fala.`,
    });
    if (capaImg)
      etapas.push({
        nome: 'Capa',
        ok: j.capa?.ok !== false,
        detalhe: j.capa?.ok === false ? `${j.capa.motivo || 'conferir'}${j.capa.textoLido ? ` (lido: "${j.capa.textoLido}")` : ''}` : `Texto "${String(j.capa?.textoLido || '').slice(0, 60)}" certo e combina com o assunto.`,
      });
    else etapas.push({ nome: 'Capa', ok: false, detalhe: 'Não consegui abrir a capa para conferir.' });
  } catch (e) {
    const msg = String(e.message || e);
    // 18/11: as duas IAs (Claude e Gemini) ficaram SEM CRÉDITO e 68 vídeos bons foram barrados como "não ficou bom".
    // Sem crédito não é vídeo ruim: o vídeo espera e é conferido de novo quando o crédito voltar.
    if (/credit balance is too low|credits are depleted|prepayment credits|billing|quota|RESOURCE_EXHAUSTED|insufficient/i.test(msg)) semCreditoIA = true;
    if (semCreditoIA) await import('./freioProducao').then((f) => f.marcarSemCredito(msg)).catch(() => {});
    etapas.unshift({ nome: 'Conferência com IA', ok: false, detalhe: semCreditoIA ? 'Esperando: as IAs que conferem (Claude e Gemini) estão sem crédito. Confere sozinho quando o crédito voltar.' : `Não rodou agora (${msg.slice(0, 400)}). Assista com atenção.` });
  }
  marcarRepetidas(arquivos, cenas, etapas);
  if (semCreditoIA) return { ...fechar(etapas, cenas, notaVideo), status: 'sem_credito' };
  return fechar(etapas, cenas, notaVideo);
}

// A MESMA imagem/vídeo em várias cenas (13/11: o mesmo vídeo aéreo de Brasília de 5:58 a 8:33 no vídeo do tríplex).
// Sem IA: a 1ª vez fica, as repetições viram "cena ruim" e o conserto automático troca por outra imagem.
function marcarRepetidas(arquivos, cenas, etapas) {
  const porMidia = new Map();
  arquivos.forEach((a, i) => {
    if (a.ilustracao) return;
    const k = String(a.videoUrl || a.imageUrl || '').split('?')[0];
    if (!k) return;
    if (!porMidia.has(k)) porMidia.set(k, []);
    porMidia.get(k).push(i);
  });
  const total = arquivos.reduce((n, a) => n + (Number(a.length) || 0), 0) || 1;
  const repetidas = [];
  for (const idx of porMidia.values()) {
    const seg = idx.reduce((n, i) => n + (Number(arquivos[i].length) || 0), 0);
    if (idx.length < 3 && seg < 25 && seg / total < 0.12) continue;
    for (const i of idx.slice(1)) {
      if (!cenas[i]) continue;
      cenas[i].ok = false;
      cenas[i].motivo = `mesma imagem da cena ${idx[0] + 1} repetida (${idx.length} vezes, ${Math.round(seg)} s no total)`;
      repetidas.push(i);
    }
  }
  if (repetidas.length) etapas.push({ nome: 'Imagens repetidas', ok: false, detalhe: `${repetidas.length} cena(s) repetem a mesma imagem: ${repetidas.slice(0, 6).map((i) => `cena ${i + 1} (${mmss(cenas[i].start)})`).join(', ')}${repetidas.length > 6 ? '…' : ''}` });
}

function fechar(etapas, cenas, notaVideo = null) {
  return {
    ...(notaVideo ? { nota: notaVideo.nota, porqueNota: notaVideo.porque } : {}),
    status: etapas.every((e) => e.ok) ? 'ok' : 'atencao',
    em: new Date().toISOString(),
    etapas,
    cenas: cenas.map(({ n, start, fim, fala, midia, imageUrl, ok, motivo }) => ({ n, start: start ?? null, fim: fim ?? null, fala: String(fala || '').slice(0, 200), midia, imageUrl: imageUrl || null, ok, motivo })),
  };
}

/** Roda a conferência de até `quantos` vídeos que esperam por ela (chamado pelo processador da fila). */
export async function conferirPendentes(db, quantos = 1) {
  const snap = await db.collection('youvideo_fila').where('conferencia.status', '==', 'pendente').limit(quantos + 10).get();
  let feitas = 0;
  for (const doc of snap.docs) {
    // 18/11: vídeo que voltou da falta de crédito e já tem mais de 12 h não é conferido de novo (fica para o dono)
    const xv = doc.data();
    if (xv.conferencia?.etapas?.some((e) => /sem crédito|credit balance|credits are depleted/.test(String(e?.detalhe || ''))) && Date.now() - Date.parse(xv.criadoEm || 0) > 12 * 3600e3) {
      await doc.ref.update({ 'conferencia.status': 'sem_credito' });
      continue;
    }
    if (feitas++ >= quantos) break;
    await doc.ref.update({ 'conferencia.status': 'conferindo', 'conferencia.inicio': Date.now() });
    try {
      const item = doc.data();
      const resultado = await conferirVideo(item);
      // IAs sem crédito: não corrige (gastaria voz e imagem à toa) nem barra; espera e confere de novo depois
      if (resultado.status === 'sem_credito') {
        await doc.ref.update({ conferencia: { ...resultado, ...(item.correcao ? { corrigido: item.correcao } : {}) } });
        continue;
      }
      // Achou problema: arruma sozinho UMA vez (troca imagem, refaz capa, corrige texto/narração) e confere de novo
      let corrigiu = null;
      // 17/11: o vídeo LONGO é importante para as visualizações — tem até 4 rodadas de correção (o Short, 2)
      const maxRodadas = item.formato === 'longo' ? 4 : 2;
      if (resultado.status === 'atencao' && (item.correcao ? item.correcao.rodada || 1 : 0) < maxRodadas) {
        const { corrigirSozinho } = await import('./corrigirVideo');
        corrigiu = await corrigirSozinho(db, doc.ref, item, resultado).catch((e) => {
          console.log(`[correcao] falhou "${String(item.tema || '').slice(0, 50)}": ${String(e.message || e).slice(0, 200)}`);
          return null;
        });
        if (corrigiu?.corrigindo) console.log(`[correcao] "${String(item.tema || '').slice(0, 50)}": ${(corrigiu.oque || []).join(' · ') || 'refazendo'}`);
      }
      if (!corrigiu?.corrigindo) {
        await doc.ref.update({ conferencia: { ...resultado, ...(item.correcao ? { corrigido: item.correcao } : {}) } });
        // 17/11 (dono: "notícias acima de nota 8 podem subir automático, sei que a notícia está correta"):
        // Short de notícia (games, política, cidade) que passou em TUDO na conferência e tirou nota 8+ vai sozinho
        // para o YouTube no horário marcado, sem esperar o ✅ Aprovar. Abaixo de 8 continua esperando o dono.
        const noticia = (item.games || item.politica) && item.formato !== 'longo';
        if (noticia && resultado.status === 'ok' && Number(resultado.nota) >= 8 && item.fabrica?.youtube?.status === 'revisar' && item.fabrica?.ativo !== false) {
          await doc.ref.update({ 'fabrica.youtube': { status: 'pendente', aprovadoEm: new Date().toISOString(), aprovadoSozinho: `nota ${resultado.nota}` } });
          console.log(`[conferencia] nota ${resultado.nota}: subiu sozinho "${String(item.tema || '').slice(0, 60)}"`);
        }
      }
    } catch (e) {
      await doc.ref.update({ conferencia: { status: 'erro', em: new Date().toISOString(), etapas: [{ nome: 'Conferência', ok: false, detalhe: String(e.message || e).slice(0, 200) }], cenas: [] } });
    }
  }
  // 18/11: vídeos barrados como "não ficou bom" só porque a IA estava sem crédito voltam: esperam conferência
  // (e aparecem no Aprovar para o dono, se quiser subir na mão)
  try {
    const barrados = await db.collection('youvideo_fila').where('fabrica.youtube.status', '==', 'erro').limit(150).get();
    for (const d of barrados.docs) {
      const x = d.data();
      const er = String(x.fabrica?.youtube?.erro || '');
      if (!/^Não subi: o vídeo não ficou bom\. • Confer[êe]ncia com IA: Não rodou agora \(Claude 400.*(credit balance|credits are depleted)/.test(er)) continue;
      if (Date.now() - (Number(x.fabrica?.youtube?.em) || 0) > 48 * 3600e3) continue;
      await d.ref.update({ 'conferencia.status': 'sem_credito', 'conferencia.em': new Date(Date.now() - 31 * 60e3).toISOString(), 'fabrica.youtube': { status: 'revisar', em: Date.now() } });
    }
  } catch (e) {
    console.log('[conferencia] liberar barrados por falta de crédito:', String(e.message || e).slice(0, 120));
  }
  // Sem crédito nas IAs: tenta de novo a cada 30 min (quando o crédito voltar, confere e segue normal)
  const esperando = await db.collection('youvideo_fila').where('conferencia.status', '==', 'sem_credito').limit(20).get();
  // (só vídeo de até 12 h: os mais velhos ficam no Aprovar para o dono decidir — conferir notícia velha é gastar à toa)
  const novo = (x) => Date.now() - Date.parse(x.criadoEm || 0) < 12 * 3600e3;
  for (const d of esperando.docs) if (novo(d.data()) && Date.now() - Date.parse(d.data().conferencia?.em || 0) > 30 * 60e3) await d.ref.update({ 'conferencia.status': 'pendente' });
  // Travou no meio (função caiu): volta para a fila depois de 10 min
  const presos = await db.collection('youvideo_fila').where('conferencia.status', '==', 'conferindo').limit(5).get();
  for (const d of presos.docs) if (Date.now() - (d.data().conferencia?.inicio || 0) > 10 * 60e3) await d.ref.update({ 'conferencia.status': 'pendente' });
  return snap.size;
}
