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
        };
      });
      if (req.query.youtube === '1') {
        const agora = Date.now();
        itens = itens.filter(
          (i) =>
            i.status === 'concluido' && i.videoUrl && i.redes?.youtube &&
            (i.youtube?.status === 'pendente' || (i.youtube?.status === 'enviando' && agora - (i.youtube.em || 0) > 3 * 3600e3))
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
      ativos.docs.forEach((d) => usados.push(d.data().tema));
      const proj = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(200).get();
      proj.docs.forEach((d) => usados.push(d.data().tema || d.data().titulo));
      const qtd = dias * porDia;
      let temas = await temasDaIa(qtd, usados.filter(Boolean));
      if (temas.length < qtd) temas = [...temas, ...(await temasDaIa(qtd - temas.length, [...usados, ...temas]))];
      if (!temas.length) return res.status(500).json({ erro: 'A IA não devolveu temas. Tente de novo.' });

      const lote = Date.now().toString(36);
      const batch = db.batch();
      const criados = [];
      temas.slice(0, qtd).forEach((tema, i) => {
        const dia = somarDias(primeiroDia, Math.floor(i / porDia));
        const vez = i % porDia; // 0 = 1º horário do dia (esse vai também para o YouTube)
        const estilo = i % 2 === 0 ? 'desenho' : 'realista'; // alterna história animada e narrado realista
        const animar = animacao === 'tudo' ? true : animacao === 'nada' ? false : estilo === 'desenho';
        const quando = horarioBrasilia(dia, horarios[vez]);
        const ref = col.doc();
        batch.set(ref, {
          tema,
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
            quandoYoutube: vez === 0 && redes.youtube ? horarioBrasilia(dia, horarios[0]) : null,
            redes: { ...redes, youtube: vez === 0 && redes.youtube },
            canalYoutube: redes.youtube ? { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') } : null,
          },
        });
        criados.push({ id: ref.id, tema, quando, estilo, animar });
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
        const livre = y.status === 'pendente' || (y.status === 'enviando' && Date.now() - (y.em || 0) > 3 * 3600e3);
        if (!livre) return false;
        t.update(ref, { 'fabrica.youtube': { status: 'enviando', em: Date.now(), pc: String(b.pc || '').slice(0, 60) } });
        return true;
      });
      return res.status(200).json({ ok });
    }
    if (b.acao === 'youtube-feito') {
      await ref.update({ 'fabrica.youtube': { status: 'ok', em: Date.now(), url: String(b.url || '').slice(0, 200) } });
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'youtube-erro') {
      await ref.update({ 'fabrica.youtube': { status: 'erro', em: Date.now(), erro: String(b.erro || '').slice(0, 400) } });
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
