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
export async function conferirVideo(item) {
  const etapas = [];
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
  if (item.formato === 'short' && (item.games || item.politica)) {
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
    return fechar(etapas, cenas);
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
      '"cenas":[{"n":1,"ok":true|false,"motivo":"curto, só se ok=false"}],' +
      '"capa":{"ok":true|false,"textoLido":"o texto escrito na capa","motivo":"curto, só se ok=false"}}\n' +
      'TEXTO: erros de ortografia, letra faltando ou sobrando, palavra trocada, acento errado, concordância — no título, na descrição, na narração e nos textos dos desenhos. Estilo e opinião NÃO são erro.\n' +
      'CENAS (só as que têm imagem): ok=false se a imagem NÃO mostra o que está sendo falado, se é de OUTRO jogo (num vídeo de um jogo, gameplay/arte de outro jogo é erro grave, exceto na cena que fala daquele outro jogo), ' +
      'se é outra pessoa (a fala cita alguém e a foto é de outra pessoa), se é de outro país quando a fala é do Brasil, ou se é algo sem relação (carro, paisagem, escritório qualquer num vídeo de games). ' +
      'Imagem genérica mas coerente (console num vídeo de console, Congresso numa notícia do Congresso) é ok. Cenas de desenho (ilustração) só conferem o TEXTO do desenho.\n' +
      'CAPA: ok=false se o texto tem erro de escrita, se não combina com o título, se mostra jogo/pessoa errados, ou rosto inventado de político real.',
  });

  try {
    const r = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELO(), max_tokens: 3000, temperature: 0, messages: [{ role: 'user', content: conteudo }] }),
      signal: AbortSignal.timeout(150000),
    });
    if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const d = await r.json();
    const txt = (d.content || []).map((p) => p.text || '').join('');
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const erros = (j.texto?.erros || []).map(String).filter(Boolean).slice(0, 8);
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
    etapas.unshift({ nome: 'Conferência com IA', ok: false, detalhe: `Não rodou agora (${String(e.message || e).slice(0, 120)}). Assista com atenção.` });
  }
  return fechar(etapas, cenas);
}

function fechar(etapas, cenas) {
  return {
    status: etapas.every((e) => e.ok) ? 'ok' : 'atencao',
    em: new Date().toISOString(),
    etapas,
    cenas: cenas.map(({ n, start, fim, fala, midia, imageUrl, ok, motivo }) => ({ n, start: start ?? null, fim: fim ?? null, fala: String(fala || '').slice(0, 200), midia, imageUrl: imageUrl || null, ok, motivo })),
  };
}

/** Roda a conferência de até `quantos` vídeos que esperam por ela (chamado pelo processador da fila). */
export async function conferirPendentes(db, quantos = 1) {
  const snap = await db.collection('youvideo_fila').where('conferencia.status', '==', 'pendente').limit(quantos).get();
  for (const doc of snap.docs) {
    await doc.ref.update({ 'conferencia.status': 'conferindo', 'conferencia.inicio': Date.now() });
    try {
      const resultado = await conferirVideo(doc.data());
      await doc.ref.update({ conferencia: resultado });
    } catch (e) {
      await doc.ref.update({ conferencia: { status: 'erro', em: new Date().toISOString(), etapas: [{ nome: 'Conferência', ok: false, detalhe: String(e.message || e).slice(0, 200) }], cenas: [] } });
    }
  }
  // Travou no meio (função caiu): volta para a fila depois de 10 min
  const presos = await db.collection('youvideo_fila').where('conferencia.status', '==', 'conferindo').limit(5).get();
  for (const d of presos.docs) if (Date.now() - (d.data().conferencia?.inicio || 0) > 10 * 60e3) await d.ref.update({ 'conferencia.status': 'pendente' });
  return snap.size;
}
