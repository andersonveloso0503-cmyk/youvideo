// Fábrica de Shorts (controlada pelo Youvideo Compilador).
// GET                                   -> { itens }  lotes da fábrica (andamento de cada vídeo)
// GET  ?youtube=1                        -> { itens }  prontos esperando o PC subir no YouTube
// POST { acao:'criar', dias, horarios, redes, canalYoutube, animacao }  -> cria o lote (a IA escolhe os temas)
// POST { acao:'criar', tipo:'cortes', estiloCorte:'filme'|'comico'|'alternar', dias, porDia, horarios, animacao, redes, canalYoutube }
//                                        -> lote de cortes (cenas em diálogo: de filme e/ou cômicos)
// POST { acao:'youtube-pegar'|'youtube-feito'|'youtube-erro', id, ... }
// POST { acao:'cancelar', id }
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';
import { horarioBrasilia, diaBrasilia, somarDias } from '../../../lib/fabrica';
import { empresa, faltaConfigurar, temasEmpresa } from '../../../lib/empresa';
import { PERIODOS, intencaoDoDia, tituloOracao } from '../../../lib/oracaoDia';
import { testarConta } from '../../../lib/publicarSocial';
import { temasCortesDaIa, TONS_FILME } from '../../../lib/cortes';

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
    // GET ?conexao=lcs -> confere se a Página/Instagram da empresa estão ligados (não publica nada)
    if (req.method === 'GET' && req.query.conexao) {
      return res.status(200).json(await testarConta(String(req.query.conexao)));
    }
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
          marca: x.marca || '',
          oracao: x.oracao || null,
          renderId: x.renderId || null, // pedido de montagem no PC: liga o cartão da Fila do Compilador a este vídeo
          corte: x.corte ? { tipo: x.corte.tipo === 'comico' ? 'comico' : 'filme' } : null,
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
      const hora = (h, pad) => (/^\d{2}:\d{2}$/.test(String(h || '')) ? h : pad);

      // ── Vídeos de divulgação da empresa (LCS): 3 por semana (seg, qua, sex), só Facebook e Instagram da empresa ──
      if (b.marca) {
        const emp = empresa(b.marca);
        if (!emp) return res.status(400).json({ erro: 'Empresa desconhecida.' });
        const redesEmp = { youtube: false, facebook: !!b.redes?.facebook, instagram: !!b.redes?.instagram, tiktok: false, kwai: false };
        if (!redesEmp.facebook && !redesEmp.instagram) return res.status(400).json({ erro: 'Marque Facebook ou Instagram.' });
        const falta = faltaConfigurar(b.marca, redesEmp);
        if (falta.length) {
          return res.status(400).json({ erro: `Falta ligar a Página/Instagram da ${emp.nome} ao Youvideo. Na Vercel (projeto youvideo → Settings → Environment Variables) crie: ${falta.join(', ')} e faça um novo deploy.` });
        }
        const semanas = Math.max(1, Math.min(12, Number(b.semanas) || 4));
        const diasSemana = (Array.isArray(b.diasSemana) && b.diasSemana.length ? b.diasSemana : [1, 3, 5]).map(Number); // 1 = segunda
        const horario = hora(b.horarios?.[0], '11:30');
        const todos = await col.where('fabrica.ativo', '==', true).get();
        const daEmpresa = todos.docs.filter((d) => d.data().marca === b.marca);
        const ultimoEmp = daEmpresa.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
        const amanhaEmp = somarDias(diaBrasilia(), 1);
        let dia = ultimoEmp && diaBrasilia(new Date(ultimoEmp)) >= amanhaEmp ? somarDias(diaBrasilia(new Date(ultimoEmp)), 1) : amanhaEmp;
        const qtdEmp = semanas * diasSemana.length;
        const datas = [];
        for (let guarda = 0; datas.length < qtdEmp && guarda < 400; guarda++) {
          if (diasSemana.includes(new Date(`${dia}T12:00:00Z`).getUTCDay())) datas.push(dia);
          dia = somarDias(dia, 1);
        }
        const usadosEmp = daEmpresa.map((d) => d.data().tema).filter(Boolean);
        let temasEmp = await temasEmpresa(b.marca, qtdEmp, usadosEmp);
        if (temasEmp.length < qtdEmp) temasEmp = [...temasEmp, ...(await temasEmpresa(b.marca, qtdEmp - temasEmp.length, [...usadosEmp, ...temasEmp]))];
        if (!temasEmp.length) return res.status(500).json({ erro: 'A IA não devolveu temas. Tente de novo.' });
        const loteEmp = Date.now().toString(36);
        const batchEmp = db.batch();
        const criadosEmp = [];
        temasEmp.slice(0, datas.length).forEach((tema, i) => {
          const quando = horarioBrasilia(datas[i], horario);
          const ref = col.doc();
          batchEmp.set(ref, {
            tema,
            marca: b.marca,
            estilo: 'realista',
            formato: 'short',
            duracaoDesejada: '30',
            animar: false,
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: { ativo: true, lote: loteEmp, quando, quandoYoutube: null, redes: redesEmp, canalYoutube: null, conta: b.marca },
          });
          criadosEmp.push({ id: ref.id, tema, quando });
        });
        await batchEmp.commit();
        return res.status(200).json({ lote: loteEmp, criados: criadosEmp, primeiroDia: datas[0] });
      }

      // ── Oração do dia: 1 Short de oração por dia, com a data no título, no canal e nas redes escolhidas ──
      if (b.tipo === 'oracao') {
        const periodo = b.periodo === 'noite' ? 'noite' : 'manha';
        const diasOr = Math.max(1, Math.min(31, Number(b.dias) || 7));
        const horario = hora(b.horarios?.[0], PERIODOS[periodo].hora);
        const redesOr = {
          youtube: !!b.redes?.youtube && !!b.canalYoutube?.id,
          facebook: !!b.redes?.facebook, instagram: !!b.redes?.instagram, tiktok: !!b.redes?.tiktok, kwai: !!b.redes?.kwai,
        };
        if (!Object.values(redesOr).some(Boolean)) return res.status(400).json({ erro: 'Marque pelo menos uma rede.' });
        const todosOr = await col.where('fabrica.ativo', '==', true).get();
        const minhas = todosOr.docs.filter((d) => d.data().oracao?.periodo === periodo);
        const ultimaOr = minhas.map((d) => d.data().oracao?.dia).filter(Boolean).sort().pop();
        let primeiroOr = somarDias(diaBrasilia(), 1);
        // Precisa de tempo para roteiro, voz, imagens e montagem no PC: se faltar menos de 10 h, começa no dia seguinte
        if (new Date(horarioBrasilia(primeiroOr, horario)).getTime() - Date.now() < 10 * 3600e3) primeiroOr = somarDias(primeiroOr, 1);
        if (ultimaOr && ultimaOr >= primeiroOr) primeiroOr = somarDias(ultimaOr, 1); // continua depois da última já criada
        const loteOr = Date.now().toString(36);
        const batchOr = db.batch();
        const criadasOr = [];
        for (let i = 0; i < diasOr; i++) {
          const dia = somarDias(primeiroOr, i);
          const assunto = intencaoDoDia(dia, periodo);
          const quando = horarioBrasilia(dia, horario);
          const tema = `${tituloOracao({ dia, periodo })}: ${assunto}`;
          const ref = col.doc();
          batchOr.set(ref, {
            tema,
            oracao: { periodo, dia, assunto },
            estilo: 'realista',
            formato: 'short',
            duracaoDesejada: '70',
            animar: false,
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: {
              ativo: true,
              lote: loteOr,
              quando,
              quandoYoutube: redesOr.youtube ? quando : null,
              redes: redesOr,
              canalYoutube: redesOr.youtube ? { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') } : null,
            },
          });
          criadasOr.push({ id: ref.id, tema, quando });
        }
        await batchOr.commit();
        return res.status(200).json({ lote: loteOr, criados: criadasOr, primeiroDia: primeiroOr });
      }

      // ── Cortes: cenas curtas em diálogo. De filme (imagem realista, dramático) e/ou cômicos (desenho animado) ──
      if (b.tipo === 'cortes') {
        const estiloCorte = ['filme', 'comico', 'alternar'].includes(b.estiloCorte) ? b.estiloCorte : 'alternar';
        const diasCt = Math.max(1, Math.min(31, Number(b.dias) || 7));
        const porDiaCt = Number(b.porDia) === 2 ? 2 : 1;
        const horariosCt = [hora(b.horarios?.[0], '10:00'), hora(b.horarios?.[1], '16:00')];
        const animarCt = b.animacao !== 'nada';
        const redesCt = {
          youtube: !!b.redes?.youtube && !!b.canalYoutube?.id,
          facebook: !!b.redes?.facebook, instagram: !!b.redes?.instagram, tiktok: !!b.redes?.tiktok, kwai: !!b.redes?.kwai,
        };
        if (!Object.values(redesCt).some(Boolean)) return res.status(400).json({ erro: 'Marque pelo menos uma rede.' });

        // Agenda própria dos cortes: continua depois do último corte já reservado
        const todosCt = await col.where('fabrica.ativo', '==', true).get();
        const meus = todosCt.docs.filter((d) => d.data().corte);
        const ultimoCt = meus.map((d) => d.data().fabrica?.quando).filter(Boolean).sort().pop();
        let primeiroCt = somarDias(diaBrasilia(), 1);
        // Precisa de tempo para roteiro, vozes, imagens e montagem no PC: se faltar menos de 10 h, começa no dia seguinte
        if (new Date(horarioBrasilia(primeiroCt, horariosCt[0])).getTime() - Date.now() < 10 * 3600e3) primeiroCt = somarDias(primeiroCt, 1);
        if (ultimoCt && diaBrasilia(new Date(ultimoCt)) >= primeiroCt) primeiroCt = somarDias(diaBrasilia(new Date(ultimoCt)), 1);

        // Já usados (cortes da fábrica + projetos salvos) para não repetir cena
        const usadosCt = meus.map((d) => d.data().tema);
        const projCt = await db.collection('youvideo_projects').orderBy('criadoEm', 'desc').limit(200).get();
        projCt.docs.forEach((d) => usadosCt.push(d.data().tema || d.data().titulo));

        const qtdCt = diasCt * porDiaCt;
        const tipoDe = (i) => (estiloCorte === 'alternar' ? (i % 2 === 0 ? 'filme' : 'comico') : estiloCorte);
        const precisa = { filme: 0, comico: 0 };
        for (let i = 0; i < qtdCt; i++) precisa[tipoDe(i)]++;
        const temas = {
          filme: await temasCortesDaIa(precisa.filme, 'filme', usadosCt),
          comico: await temasCortesDaIa(precisa.comico, 'comico', usadosCt),
        };
        const loteCt = Date.now().toString(36);
        const batchCt = db.batch();
        const criadosCt = [];
        const vez = { filme: 0, comico: 0 };
        for (let i = 0; i < qtdCt; i++) {
          const tipo = tipoDe(i);
          const t = temas[tipo][vez[tipo]];
          if (!t) continue; // a IA e a lista pronta acabaram para esse tipo: o lote sai menor
          const tom = tipo === 'filme' ? TONS_FILME[vez.filme % TONS_FILME.length] : null;
          vez[tipo]++;
          const n = criadosCt.length; // posição na agenda (sem buraco se algum tema faltou)
          const quando = horarioBrasilia(somarDias(primeiroCt, Math.floor(n / porDiaCt)), horariosCt[n % porDiaCt]);
          const vaiYoutube = redesCt.youtube && n % porDiaCt === 0; // YouTube recebe 1 por dia (o do 1º horário)
          const ref = col.doc();
          batchCt.set(ref, {
            tema: t.nome,
            corte: { tipo, cena: t.cena, ...(tom ? { tom } : {}) },
            estilo: tipo === 'comico' ? 'desenho' : 'realista',
            formato: 'short',
            duracaoDesejada: tipo === 'comico' ? '60' : '45',
            animar: animarCt,
            status: 'pendente',
            origem: 'fabrica',
            criadoEm: new Date().toISOString(),
            fabrica: {
              ativo: true,
              lote: loteCt,
              quando,
              quandoYoutube: vaiYoutube ? quando : null,
              redes: { ...redesCt, youtube: vaiYoutube },
              canalYoutube: redesCt.youtube ? { id: String(b.canalYoutube.id), titulo: String(b.canalYoutube.titulo || '') } : null,
            },
          });
          criadosCt.push({ id: ref.id, tema: t.nome, quando, tipo });
        }
        if (!criadosCt.length) return res.status(500).json({ erro: 'Não consegui escolher cenas novas para os cortes. Tente de novo.' });
        await batchCt.commit();
        return res.status(200).json({ lote: loteCt, criados: criadosCt, primeiroDia: primeiroCt });
      }

      const dias = Math.max(1, Math.min(31, Number(b.dias) || 7));
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
      const todosAtivos = await col.where('fabrica.ativo', '==', true).get();
      const ativos = { docs: todosAtivos.docs.filter((d) => !d.data().marca && !d.data().oracao && !d.data().corte) }; // empresa, oração do dia e cortes têm agenda própria
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
