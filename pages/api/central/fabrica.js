// Fábrica de Shorts (controlada pelo Youvideo Compilador).
// GET                                   -> { itens }  lotes da fábrica (andamento de cada vídeo)
// GET  ?youtube=1                        -> { itens }  prontos esperando o PC subir no YouTube
// POST { acao:'criar', dias, horarios, redes, canalYoutube, animacao }  -> cria o lote (a IA escolhe os temas)
// POST { acao:'youtube-pegar'|'youtube-feito'|'youtube-erro', id, ... }
// POST { acao:'cancelar', id }
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { horarioBrasilia, diaBrasilia, somarDias } from '../../../lib/fabrica';

export const config = { maxDuration: 60 };

const COL = 'youvideo_fila';

async function temasDaIa(qtd, evitar) {
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você escolhe temas para Shorts (1 minuto) de um canal cristão brasileiro chamado "Em Nome de Jesus". ' +
              'Responda só JSON: {"temas": ["...", "..."]}. Cada tema é UMA história ou passagem bíblica específica, contada de um jeito que prende nos primeiros segundos ' +
              '(ex.: "Davi enfrenta Golias com uma funda", "A mulher que tocou no manto de Jesus", "Pedro anda sobre as águas e afunda"). ' +
              'Varie entre Antigo e Novo Testamento, milagres, parábolas, personagens pouco conhecidos e lições para o dia a dia. Nada repetido nem parecido com a lista de já usados.',
          },
          { role: 'user', content: `Quero ${qtd} temas diferentes.\n\nJá usados (não repetir):\n${evitar.slice(0, 250).map((t) => `- ${t}`).join('\n') || '(nenhum)'}` },
        ],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
    return JSON.parse(d.choices?.[0]?.message?.content || '{}').temas || [];
  };
  let temas = [];
  try {
    temas = await pedir('openai/gpt-oss-120b');
  } catch {
    temas = await pedir('llama-3.3-70b-versatile');
  }
  const vistos = new Set(evitar.map((t) => t.toLowerCase()));
  return temas.map((t) => String(t).trim()).filter((t) => t && !vistos.has(t.toLowerCase())).slice(0, qtd);
}

// Séries: cada história dividida em partes, cada parte termina num gancho ("siga para ver a parte 2").
async function seriesDaIa(qtd, partes, evitar) {
  const pedir = async (modelo) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você planeja SÉRIES de Shorts (1 minuto cada) de um canal cristão brasileiro chamado "Em Nome de Jesus". ' +
              `Cada série conta UMA história bíblica específica dividida em exatamente ${partes} partes em ordem cronológica. ` +
              'Cada parte (menos a última) precisa terminar num momento de suspense que faz a pessoa querer ver a próxima. ' +
              'Responda só JSON: {"series": [{"nome": "nome curto da história (ex.: Davi e Golias)", ' +
              '"personagem": "aparência fixa do personagem principal para as imagens: idade, cabelo, barba, roupa e cores (em português, 1 frase)", ' +
              `"partes": ["o que acontece na parte 1 e onde ela para", ...${partes} itens]}]}. ` +
              'Varie entre Antigo e Novo Testamento, milagres, heróis da fé e personagens pouco conhecidos. Nada repetido nem parecido com a lista de já usados.',
          },
          { role: 'user', content: `Quero ${qtd} séries diferentes.\n\nJá usados (não repetir):\n${evitar.slice(0, 250).map((t) => `- ${t}`).join('\n') || '(nenhum)'}` },
        ],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Groq respondeu ${r.status}`);
    return JSON.parse(d.choices?.[0]?.message?.content || '{}').series || [];
  };
  let series = [];
  try {
    series = await pedir('openai/gpt-oss-120b');
  } catch {
    series = await pedir('llama-3.3-70b-versatile');
  }
  const vistos = new Set(evitar.map((t) => String(t).toLowerCase()));
  return series
    .map((s) => ({
      nome: String(s?.nome || '').trim(),
      personagem: String(s?.personagem || '').trim().slice(0, 300),
      partes: (Array.isArray(s?.partes) ? s.partes : []).map((p) => String(p).trim()).filter(Boolean),
    }))
    .filter((s) => s.nome && s.partes.length >= partes && !vistos.has(s.nome.toLowerCase()))
    .map((s) => ({ ...s, partes: s.partes.slice(0, partes) }))
    .slice(0, qtd);
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const db = getDb();
  const col = db.collection(COL);

  try {
    if (req.method === 'GET') {
      const snap = await col.where('fabrica.ativo', '==', true).get();
      let itens = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          tema: x.tema,
          titulo: x.roteiro?.titulo || null,
          descricao: x.roteiro?.descricao || '',
          tags: x.roteiro?.tags || [],
          estilo: x.estilo,
          animar: x.animar !== false,
          status: x.status,
          erro: x.erro || x.ultimoErro || null,
          videoUrl: x.videoUrl || null,
          thumbnailUrl: x.thumbnailUrl || null,
          quando: x.fabrica.quando,
          quandoYoutube: x.fabrica.quandoYoutube || null,
          redes: x.fabrica.redes,
          canalYoutube: x.fabrica.canalYoutube || null,
          youtube: x.fabrica.youtube || null,
          lote: x.fabrica.lote,
          serie: x.serie || null,
        };
      });
      if (req.query.youtube === '1') {
        const agora = Date.now();
        itens = itens.filter(
          (i) =>
            i.status === 'concluido' && i.videoUrl && i.redes?.youtube &&
            (i.youtube?.status === 'pendente' ||
              (i.youtube?.status === 'enviando' && agora - (i.youtube.em || 0) > 3 * 3600e3) ||
              // deu erro (limite do dia, internet...): tenta de novo sozinho depois de 6 h, até 3 vezes
              (i.youtube?.status === 'erro' && agora - (i.youtube.em || 0) > 6 * 3600e3 && (i.youtube.tentativas || 0) < 3))
        );
      }
      itens.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
      return res.status(200).json({ itens });
    }

    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
    const b = req.body || {};

    if (b.acao === 'criar') {
      if (!process.env.GROQ_API_KEY) return res.status(500).json({ erro: 'GROQ_API_KEY não configurada na Vercel.' });
      const dias = Math.max(1, Math.min(31, Number(b.dias) || 7));
      const hora = (h, pad) => (/^\d{2}:\d{2}$/.test(String(h || '')) ? h : pad);
      const horarios = [hora(b.horarios?.[0], '12:00'), hora(b.horarios?.[1], '19:00')];
      const redes = {
        youtube: !!b.redes?.youtube && !!b.canalYoutube?.id,
        facebook: !!b.redes?.facebook,
        instagram: !!b.redes?.instagram,
        tiktok: !!b.redes?.tiktok,
        kwai: !!b.redes?.kwai,
      };
      if (!Object.values(redes).some(Boolean)) return res.status(400).json({ erro: 'Marque pelo menos uma rede.' });
      const porDia = b.porDia === 1 ? 1 : 2;
      const animacao = ['tudo', 'metade', 'nada'].includes(b.animacao) ? b.animacao : 'metade';

      // Continua depois do último horário já reservado pela fábrica (não encavala lotes)
      const ativos = await col.where('fabrica.ativo', '==', true).get();
      const ultimo = ativos.docs.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
      const amanha = somarDias(diaBrasilia(), 1);
      const primeiroDia = ultimo && diaBrasilia(new Date(ultimo)) >= amanha ? somarDias(diaBrasilia(new Date(ultimo)), 1) : amanha;

      // Temas já usados (fila + projetos) para a IA não repetir
      const usados = [];
      ativos.docs.forEach((d) => usados.push(d.data().serie?.nome || d.data().tema));
      const proj = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(200).get();
      proj.docs.forEach((d) => usados.push(d.data().tema || d.data().titulo));
      const qtd = dias * porDia;
      const partes = b.series === false ? 0 : [2, 3].includes(Number(b.partes)) ? Number(b.partes) : 3;

      const lote = Date.now().toString(36);
      // Lista de vídeos: { tema, serie?, grupo } (grupo = índice da série, para manter o mesmo estilo nas partes)
      let videos = [];
      if (partes) {
        const qtdSeries = Math.ceil(qtd / partes);
        let series = await seriesDaIa(qtdSeries, partes, usados.filter(Boolean));
        if (series.length < qtdSeries) series = [...series, ...(await seriesDaIa(qtdSeries - series.length, partes, [...usados, ...series.map((s) => s.nome)]))];
        series.slice(0, qtdSeries).forEach((s, g) => {
          s.partes.forEach((resumo, p) => {
            videos.push({
              tema: `${s.nome} (Parte ${p + 1} de ${partes}): ${resumo}`,
              grupo: g,
              serie: { id: `${lote}-${g}`, nome: s.nome, parte: p + 1, total: partes, personagem: s.personagem, resumos: s.partes },
            });
          });
        });
      } else {
        let temas = await temasDaIa(qtd, usados.filter(Boolean));
        if (temas.length < qtd) temas = [...temas, ...(await temasDaIa(qtd - temas.length, [...usados, ...temas]))];
        videos = temas.slice(0, qtd).map((tema, i) => ({ tema, grupo: i }));
      }
      if (!videos.length) return res.status(500).json({ erro: 'A IA não devolveu temas. Tente de novo.' });

      // Séries: TODAS as partes vão ao YouTube, 1 por dia, em ordem (a série fica completa no canal).
      // O YouTube anda mais devagar que as outras redes; continua depois do último dia já reservado.
      let diaYoutube = amanha;
      if (partes && redes.youtube) {
        const ultimoYt = ativos.docs.map((d) => d.data().fabrica?.quandoYoutube).filter(Boolean).sort().pop();
        if (ultimoYt && diaBrasilia(new Date(ultimoYt)) >= amanha) diaYoutube = somarDias(diaBrasilia(new Date(ultimoYt)), 1);
        if (diaYoutube < primeiroDia) diaYoutube = primeiroDia; // nunca antes do vídeo ficar pronto
      }

      const batch = db.batch();
      const criados = [];
      videos.forEach((v, i) => {
        const dia = somarDias(primeiroDia, Math.floor(i / porDia));
        const vez = i % porDia; // 0 = 1º horário do dia
        const estilo = v.grupo % 2 === 0 ? 'desenho' : 'realista'; // alterna história animada e narrado realista
        const animar = animacao === 'tudo' ? true : animacao === 'nada' ? false : estilo === 'desenho';
        const quando = horarioBrasilia(dia, horarios[vez]);
        const vaiYoutube = redes.youtube && (partes ? true : vez === 0);
        const quandoYoutube = !vaiYoutube ? null : partes ? horarioBrasilia(somarDias(diaYoutube, i), horarios[0]) : horarioBrasilia(dia, horarios[0]);
        const ref = col.doc();
        batch.set(ref, {
          tema: v.tema,
          ...(v.serie ? { serie: v.serie } : {}),
          estilo,
          formato: 'short',
          duracaoDesejada: '60',
          animar,
          status: 'pendente',
          origem: 'fabrica',
          criadoEm: new Date().toISOString(),
          fabrica: {
            ativo: true,
            lote,
            quando,
            quandoYoutube,
            redes: { ...redes, youtube: vaiYoutube },
            canalYoutube: redes.youtube ? { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') } : null,
          },
        });
        criados.push({ id: ref.id, tema: v.tema, quando, estilo, animar });
      });
      await batch.commit();
      return res.status(200).json({ lote, criados, primeiroDia });
    }

    const ref = col.doc(String(b.id || ''));
    if (!b.id) return res.status(400).json({ erro: 'Falta o id.' });

    if (b.acao === 'youtube-pegar') {
      const ok = await db.runTransaction(async (t) => {
        const d = await t.get(ref);
        const y = d.data()?.fabrica?.youtube;
        if (!y) return false;
        const livre =
          y.status === 'pendente' ||
          (y.status === 'enviando' && Date.now() - (y.em || 0) > 3 * 3600e3) ||
          (y.status === 'erro' && Date.now() - (y.em || 0) > 6 * 3600e3 && (y.tentativas || 0) < 3);
        if (!livre) return false;
        t.update(ref, { 'fabrica.youtube': { status: 'enviando', em: Date.now(), pc: String(b.pc || '').slice(0, 60), tentativas: y.tentativas || 0 } });
        return true;
      });
      return res.status(200).json({ ok });
    }
    if (b.acao === 'youtube-feito') {
      await ref.update({ 'fabrica.youtube': { status: 'ok', em: Date.now(), url: String(b.url || '').slice(0, 200) } });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'youtube-erro') {
      const antes = (await ref.get()).data()?.fabrica?.youtube || {};
      await ref.update({ 'fabrica.youtube': { status: 'erro', em: Date.now(), erro: String(b.erro || '').slice(0, 400), tentativas: (antes.tentativas || 0) + 1 } });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'youtube-repetir') {
      await ref.update({ 'fabrica.youtube': { status: 'pendente', em: Date.now() } });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'cancelar') {
      const d = (await ref.get()).data();
      if (d?.status === 'concluido') {
        await ref.update({ 'fabrica.ativo': false });
        if (d.fabrica?.agendaId) await db.collection('youvideo_agenda').doc(d.fabrica.agendaId).delete().catch(() => {});
      } else {
        await ref.delete();
      }
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'repetir') {
      // Continua da etapa em que parou (não gera tudo de novo)
      const d = (await ref.get()).data() || {};
      await ref.update({ status: d.statusAntes || 'pendente', tentativas: 0, erro: null, ultimoErro: null });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ erro: 'Ação desconhecida.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
