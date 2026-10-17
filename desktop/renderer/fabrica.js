/* Fábrica de Shorts: a IA escolhe os temas, o site cria (roteiro, voz, imagens, animação),
   o PC monta e cada vídeo é agendado sozinho: YouTube pelo PC, Facebook/Instagram pela nuvem,
   TikTok/Kwai na página do celular. */
const Fabrica = (() => {
  const q = (s) => document.querySelector(s);
  let ligado = false;
  let marca = ''; // '' = histórias bíblicas; 'cortes' = cortes de filme e cômicos; 'oracao' = oração do dia; 'lcs' = vídeos de divulgação da LCS
  // Em qual aba cada vídeo da fábrica aparece
  const abaDe = (i) => i.marca || (i.infantil ? 'infantil' : i.documentario ? 'documentario' : i.oracao ? 'oracao' : i.corte ? 'cortes' : i.longo ? 'longos' : '');
  const NOTAS = {
    '': 'A IA escolhe os temas, o site cria roteiro, voz e imagens, o seu PC monta, e cada vídeo é agendado sozinho nas redes. Alterna <b>história animada</b> e <b>narrado realista</b>, sem repetir tema.',
    longos: '<b>Vídeos longos</b> (cerca de 12 minutos) no estilo <b>mistério</b>: o título faz uma pergunta (ex.: "O que aconteceu com Jesus nos 3 dias no túmulo?"), o vídeo vai revelando detalhes e só responde no final. Thumbnail com a frase grande. São os vídeos que trazem <b>inscritos</b> e monetização. Vão para o <b>YouTube</b> (e Facebook, se marcar), com imagens em zoom para caber no orçamento.',
    documentario: '<b>Documentários para dormir</b> (canal Noites na História): os <b>roteiros já estão escritos</b> (vikings, castelo medieval, caravelas, Egito, gaúchos, Pompeia, monges, imigrantes italianos, pirâmides e iglus). O site narra <b>devagar, com pausas</b>, usa <b>vídeos e fotos reais</b> (Pexels e Wikimedia) conferidos pela IA para combinar com a fala e com a época (quando nenhum serve, pinta a cena), faz a <b>capa pintada</b> com o título em letra medieval e coloca os <b>capítulos</b> na descrição. O seu PC monta e sobe <b>1 por dia</b> no YouTube.',
    infantil: '<b>Desenho infantil</b> com um personagem fixo (começa com o <b>Pingo</b>): episódios de <b>4 a 5 minutos</b>, todo animado, com uma <b>música chiclete nova</b> no meio de cada episódio (o refrão volta no final). A IA escreve a historinha com uma lição, narra, compõe e canta a música (Estúdio de Música), cria as imagens sempre com o mesmo personagem, anima, o seu PC monta e sobe no <b>YouTube</b> marcado como <b>conteúdo para crianças</b>, na playlist do personagem.',
    cortes: 'Cenas curtas em <b>diálogo</b>, com uma voz para cada personagem. <b>Corte de filme</b>: cena bíblica dramática, com imagem realista (cerca de 45 s). <b>Corte cômico</b>: situação engraçada em desenho animado (cerca de 1 min). A IA escolhe as cenas sem repetir, escreve as falas, o seu PC monta, e cada corte é agendado sozinho nas redes.',
    oracao: 'Um Short de <b>oração por dia</b> (cerca de 1 minuto), com a data no título — por exemplo "Oração da Manhã de 7 de Outubro" —, que é como as pessoas procuram oração no YouTube. A IA escreve a oração (um assunto diferente por dia), narra com imagens calmas, o seu PC monta, e ela é publicada sozinha no horário.',
    musica: 'Um <b>álbum por dia</b> para cada canal de música. As músicas vêm <b>da sua pasta</b> (as que você fez no Nuivi/Suno — melhor qualidade) ou a IA cria (ElevenLabs/Lyria). O <b>Gemini faz a capa</b> e o Compilador monta o vídeo longo e os Shorts (começando no refrão). <b>Nada sobe sem você aprovar.</b>',
    lcs: 'Vídeos curtos (cerca de 30 s) divulgando a <b>LCS Terceirização</b>: a IA escolhe o assunto (limpeza, portaria, zeladoria; condomínios e empresas), escreve o roteiro, narra, cria as imagens, o seu PC monta com o WhatsApp da LCS na tela, e cada um é publicado sozinho na <b>Página e no Instagram da LCS</b>.',
  };

  function trocarMarca(nova) {
    marca = nova;
    document.querySelectorAll('#fabMarcaAbas button').forEach((b) => b.classList.toggle('ativo', (b.dataset.marca || '') === marca));
    q('#fabNota').innerHTML = NOTAS[marca];
    const musica = marca === 'musica';
    q('#fabMusica').hidden = !musica;
    for (const id of ['#fabLinhaCriar', '#fabErro', '#fabTopoLista', '#fabLista']) q(id).hidden = musica;
    q('#modalFabrica .fab-redes').hidden = musica;
    if (musica) {
      ['#fabConfigLcs', '#fabConfigOracao', '#fabConfigCortes', '#fabConfigBiblia', '#fabConfigLongos', '#fabConfigDoc', '#fabConfigInfantil'].forEach((id) => (q(id).hidden = true));
      FabMusica.mostrar();
      return;
    }
    q('#fabConfigLcs').hidden = marca !== 'lcs';
    q('#fabConfigOracao').hidden = marca !== 'oracao';
    q('#fabConfigCortes').hidden = marca !== 'cortes';
    q('#fabConfigLongos').hidden = marca !== 'longos';
    q('#fabConfigDoc').hidden = marca !== 'documentario';
    q('#fabConfigInfantil').hidden = marca !== 'infantil';
    const soYoutube = marca === 'longos' || marca === 'documentario' || marca === 'infantil';
    if (marca === 'documentario' && !q('#fabDocInicio').value) {
      const d = new Date(Date.now() + 2 * 86400e3);
      q('#fabDocInicio').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    q('#fabConfigBiblia').hidden = marca !== '';
    q('#fabYoutube').parentElement.lastChild.textContent = marca === 'oracao' || soYoutube ? ' YouTube' : ' YouTube (1 por dia)';
    document.querySelectorAll('#modalFabrica .so-biblia').forEach((el) => (el.hidden = marca === 'lcs'));
    // Longos: só YouTube (sempre) e Facebook. Instagram, TikTok e Kwai são para vídeo curto.
    q('#fabInstagram').parentElement.hidden = soYoutube;
    q('#fabFacebook').parentElement.hidden = marca === 'documentario'; // infantil: YouTube + Página do Planeta Fofura
    for (const id of ['#fabTiktok', '#fabKwai']) q(id).parentElement.hidden = marca === 'lcs' || soYoutube;
    q('#fabYoutube').disabled = soYoutube;
    if (soYoutube) q('#fabYoutube').checked = true;
    custo();
    carregar();
  }

  const ETAPA = {
    pendente: 'Na fila: escrevendo roteiro',
    roteiro_ok: 'Gerando a voz',
    voz_ok: 'Gerando as imagens',
    imagens_ok: 'Animando as cenas',
    animando: 'Animando as cenas',
    montando: 'Montando no PC',
    concluido: 'Pronto e agendado',
    erro: 'Erro',
  };
  // Custo aproximado por Short de 1 min (imagens + voz + animação)
  // animado = todas as cenas animadas; economico = só as 3 primeiras (o resto com zoom)
  const CUSTO = { animado: 1.3, economico: 0.75, parado: 0.45 };
  const custoAnimado = () => (q('#fabCenas')?.value === 'todas' ? CUSTO.animado : CUSTO.economico);
  // Corte tem mais cenas (uma imagem por fala) e várias vozes: sai um pouco mais caro que um Short narrado
  const CUSTO_CORTE = { animado: 1.6, parado: 0.55 };

  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const quandoTxt = (iso) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  function prefs() {
    return config.fabricaPrefs || {};
  }
  function salvarPrefs() {
    const p = {
      dias: q('#fabDias').value, porDia: q('#fabPorDia').value, hora1: q('#fabHora1').value, hora2: q('#fabHora2').value,
      animacao: q('#fabAnimacao').value, canal: q('#fabCanal').value, formato: q('#fabFormato').value, estilo: q('#fabEstilo').value,
      redes: { youtube: q('#fabYoutube').checked, facebook: q('#fabFacebook').checked, instagram: q('#fabInstagram').checked, tiktok: q('#fabTiktok').checked, kwai: q('#fabKwai').checked },
      cortes: { tipo: q('#fabCtTipo').value, dias: q('#fabCtDias').value, porDia: q('#fabCtPorDia').value, hora1: q('#fabCtHora1').value, hora2: q('#fabCtHora2').value, animacao: q('#fabCtAnimacao').value },
    };
    config.fabricaPrefs = p;
    window.api.config.salvar({ fabricaPrefs: p }).catch(() => {});
  }

  function custo() {
    if (marca === 'cortes') {
      const qtd = Number(q('#fabCtDias').value) * Number(q('#fabCtPorDia').value);
      const animado = q('#fabCtAnimacao').value !== 'nada';
      const total = qtd * (animado ? CUSTO_CORTE.animado : CUSTO_CORTE.parado);
      q('#fabCusto').textContent = `${qtd} cortes · custo aproximado US$ ${Math.max(1, Math.round(total))} (${animado ? 'imagens, vozes e animação' : 'imagens e vozes'})`;
      return;
    }
    if (marca === 'infantil') {
      const teste = q('#fabIfSemanas').value === 'teste';
      const qtd = teste ? 1 : Number(q('#fabIfSemanas').value) * q('#fabIfDias').value.split(',').length;
      // ~25 imagens (Flux) + narração + música (ElevenLabs) + animação (US$ 0,10 por cena na fal.ai)
      const fator = Number(q('#fabIfDuracao').value) >= 480 ? 1.9 : 1; // 8 min ≈ o dobro de cenas
      // uma imagem por fala (a imagem troca junto com quem fala): ~45 cenas num episódio de 4 min
      // animação = ~45 cenas × preço da qualidade escolhida; o resto (imagens, voz, música) ~US$ 1
      const precoCena = { kling: 0.35, '720p': 0.1, '580p': 0.075, '480p': 0.05 }[q('#fabIfRes').value] || 0.1;
      const porEp = ({ todas: 1 + 45 * precoCena, 3: 1 + 3 * precoCena, nada: 1 }[q('#fabIfAnim').value] || 1 + 45 * precoCena) * (q('#fabIfAnim').value === '3' ? 1.6 : fator);
      q('#fabCusto').textContent = `${qtd} episódios · custo aproximado US$ ${Math.max(1, Math.round(qtd * porEp))} (imagens, voz, música e animação) + ~${qtd * 3} mil caracteres e ${qtd} músicas da ElevenLabs`;
      return;
    }
    if (marca === 'documentario') {
      const qtd = Number(q('#fabDocQuantos').value);
      // Imagens e vídeos reais são grátis (Pexels/Wikimedia); a voz gasta ~25 mil caracteres por episódio
      q('#fabCusto').textContent = `até ${qtd} documentários · imagens reais grátis + ~${qtd * 25} mil caracteres da ElevenLabs (voz)`;
      return;
    }
    if (marca === 'longos') {
      const qtd = Number(q('#fabLgSemanas').value) * q('#fabLgDias').value.split(',').length;
      const min = Number(q('#fabLgDuracao').value) / 60;
      // ~2,5 imagens por minuto (Flux) + voz; cada minuto de narração gasta ~850 caracteres da ElevenLabs
      const total = qtd * min * 0.16;
      q('#fabCusto').textContent = `${qtd} vídeos longos · custo aproximado US$ ${Math.max(1, Math.round(total))} em imagens + ~${Math.round((qtd * min * 850) / 1000)} mil caracteres da ElevenLabs (voz)`;
      return;
    }
    if (marca === 'oracao') {
      const qtd = Number(q('#fabOrDias').value);
      q('#fabCusto').textContent = `${qtd} orações · custo aproximado US$ ${Math.max(1, Math.round(qtd * 0.25))} (imagens e voz)`;
      return;
    }
    if (marca === 'lcs') {
      const qtd = Number(q('#fabSemanas').value) * q('#fabDiasSemana').value.split(',').length;
      q('#fabCusto').textContent = `${qtd} vídeos · custo aproximado US$ ${(qtd * 0.35).toFixed(0)} (imagens e voz)`;
      return;
    }
    const n = Number(q('#fabDias').value) * Number(q('#fabPorDia').value);
    const anim = q('#fabAnimacao').value;
    // "Metade" anima as histórias em desenho: com "só desenho" são todas; com "só realista", nenhuma
    const est = q('#fabEstilo').value;
    const animados = anim === 'tudo' ? n : anim === 'nada' ? 0 : est === 'desenho' ? n : est === 'realista' ? 0 : Math.ceil(n / 2);
    const total = animados * custoAnimado() + (n - animados) * CUSTO.parado;
    q('#fabCusto').textContent = `${n} Shorts · custo aproximado US$ ${total.toFixed(0)} (imagens, voz e animação)`;
  }

  function preencherCanais() {
    const lista = typeof canais !== 'undefined' ? canais : [];
    const p = prefs();
    for (const id of ['#fabCanal', '#fabOrCanal', '#fabCtCanal', '#fabLgCanal', '#fabDocCanal', '#fabIfCanal']) {
      const sel = q(id);
      sel.innerHTML = lista.length
        ? lista.map((c) => `<option value="${esc(c.id)}">${esc(c.titulo)}</option>`).join('')
        : '<option value="">Nenhum canal conectado (Contas YouTube)</option>';
      if (p.canal && lista.some((c) => c.id === p.canal)) sel.value = p.canal;
    }
    // Documentários: já vem marcado o canal Noites na História (se estiver conectado)
    const noites = lista.find((c) => /noites|dormir/i.test(c.titulo || ''));
    if (noites) q('#fabDocCanal').value = noites.id;
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    const p = prefs();
    if (p.dias) q('#fabDias').value = p.dias;
    if (p.porDia) q('#fabPorDia').value = p.porDia;
    if (p.hora1) q('#fabHora1').value = p.hora1;
    if (p.hora2) q('#fabHora2').value = p.hora2;
    if (p.animacao) q('#fabAnimacao').value = p.animacao;
    if (p.formato != null) q('#fabFormato').value = p.formato;
    if (p.estilo) q('#fabEstilo').value = p.estilo;
    for (const [r, id] of [['youtube', '#fabYoutube'], ['facebook', '#fabFacebook'], ['instagram', '#fabInstagram'], ['tiktok', '#fabTiktok'], ['kwai', '#fabKwai']]) {
      if (p.redes && r in p.redes) q(id).checked = !!p.redes[r];
    }
    ['#fabDias', '#fabPorDia', '#fabHora1', '#fabHora2', '#fabAnimacao', '#fabCenas', '#fabFormato', '#fabEstilo', '#fabCanal', '#fabYoutube', '#fabFacebook', '#fabInstagram', '#fabTiktok', '#fabKwai'].forEach((id) =>
      q(id).addEventListener('change', () => {
        salvarPrefs();
        custo();
        q('#fabHora2').disabled = q('#fabPorDia').value === '1';
      })
    );
    document.querySelectorAll('#fabMarcaAbas button').forEach((b) => (b.onclick = () => trocarMarca(b.dataset.marca || '')));
    ['#fabSemanas', '#fabDiasSemana', '#fabHoraLcs', '#fabOrDias', '#fabLgSemanas', '#fabLgDias', '#fabLgDuracao', '#fabDocQuantos', '#fabIfSemanas', '#fabIfDias', '#fabIfAnim', '#fabIfDuracao'].forEach((id) => q(id).addEventListener('change', custo));
    // Cortes: lembra as escolhas da última vez
    const pc = p.cortes || {};
    for (const [chave, id] of [['tipo', '#fabCtTipo'], ['dias', '#fabCtDias'], ['porDia', '#fabCtPorDia'], ['hora1', '#fabCtHora1'], ['hora2', '#fabCtHora2'], ['animacao', '#fabCtAnimacao']]) {
      if (pc[chave]) q(id).value = pc[chave];
    }
    ['#fabCtTipo', '#fabCtDias', '#fabCtPorDia', '#fabCtHora1', '#fabCtHora2', '#fabCtAnimacao', '#fabCtCanal'].forEach((id) =>
      q(id).addEventListener('change', () => {
        salvarPrefs();
        custo();
        q('#fabCtHora2').disabled = q('#fabCtPorDia').value === '1';
      })
    );
    q('#fabCtHora2').disabled = q('#fabCtPorDia').value === '1';
    // Oração da noite: sugere o horário da noite
    q('#fabOrPeriodo').addEventListener('change', () => (q('#fabOrHora').value = q('#fabOrPeriodo').value === 'noite' ? '21:00' : '06:00'));
    q('#btnFabCriar').onclick = criar;
    q('#btnFabIfPrevia').onclick = previaInfantil;
    q('#btnFabIfComparar').onclick = compararQualidades;
    q('#fabIfRes').addEventListener('change', custo);
    q('#btnFabAtualizar').onclick = () => carregar(true);
  }

  async function criar() {
    const erro = q('#fabErro');
    erro.textContent = '';
    if (!config.temCentral) return (erro.textContent = 'Cadastre a senha da Central em Configurações.');
    if (marca === 'lcs') return criarEmpresa(erro);
    if (marca === 'oracao') return criarOracao(erro);
    if (marca === 'cortes') return criarCortes(erro);
    if (marca === 'longos') return criarLongos(erro);
    if (marca === 'documentario') return criarDocumentarios(erro);
    if (marca === 'infantil') return criarInfantil(erro);
    const redes = {
      youtube: q('#fabYoutube').checked, facebook: q('#fabFacebook').checked, instagram: q('#fabInstagram').checked,
      tiktok: q('#fabTiktok').checked, kwai: q('#fabKwai').checked,
    };
    if (!Object.values(redes).some(Boolean)) return (erro.textContent = 'Marque pelo menos uma rede.');
    const canalId = q('#fabCanal').value;
    if (redes.youtube && !canalId) return (erro.textContent = 'Conecte um canal em Contas YouTube (ou desmarque o YouTube).');
    if (redes.youtube && !canalCombina(canalId, 'falado')) return (erro.textContent = 'Escolha o canal certo para o YouTube.');
    const n = Number(q('#fabDias').value) * Number(q('#fabPorDia').value);
    const nTemas = q('#fabTemas').value.split('\n').filter((t) => t.trim()).length;
    if (!confirm(`Criar ${n} Shorts? ${q('#fabCusto').textContent.split('·')[1] || ''}\n${nTemas ? `Os ${nTemas} temas que você escreveu entram primeiro; a IA completa o resto.` : 'A IA escolhe os temas'} e eles já ficam agendados.`)) return;
    const b = q('#btnFabCriar');
    b.disabled = true;
    b.textContent = '🏭 A IA está escolhendo os temas...';
    try {
      const canal = (typeof canais !== 'undefined' ? canais : []).find((c) => c.id === canalId);
      const r = await window.api.fabrica.criar({
        dias: Number(q('#fabDias').value),
        porDia: Number(q('#fabPorDia').value),
        horarios: [q('#fabHora1').value, q('#fabHora2').value],
        animacao: q('#fabAnimacao').value,
        animacaoCompleta: q('#fabCenas').value === 'todas',
        series: q('#fabFormato').value !== '0',
        partes: Number(q('#fabFormato').value) || 3,
        estiloModo: q('#fabEstilo').value,
        temas: q('#fabTemas').value.split('\n').map((t) => t.trim()).filter(Boolean),
        redes,
        canalYoutube: redes.youtube && canal ? { id: canal.id, titulo: canal.titulo } : null,
      });
      avisar(`${r.criados.length} Shorts na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      q('#fabTemas').value = ''; // temas usados: o próximo lote começa limpo
      carregar();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🏭 Criar lote';
    }
  }

  async function criarLongos(erro) {
    const canalId = q('#fabLgCanal').value;
    if (!canalId) return (erro.textContent = 'Conecte um canal em Contas YouTube: vídeo longo vai para o YouTube.');
    if (!canalCombina(canalId, 'falado')) return (erro.textContent = 'Escolha o canal certo para o YouTube.');
    const diasSemana = q('#fabLgDias').value.split(',').map(Number);
    const qtd = Number(q('#fabLgSemanas').value) * diasSemana.length;
    const temas = q('#fabLgTemas').value.split('\n').map((t) => t.trim()).filter(Boolean);
    if (!confirm(`Criar ${qtd} vídeos longos no estilo mistério? ${q('#fabCusto').textContent.split('·')[1] || ''}\n${temas.length ? `Os ${temas.length} temas que você escreveu entram primeiro; a IA completa o resto.` : 'A IA escolhe os temas'} e eles já ficam agendados no YouTube às ${q('#fabLgHora').value}.`)) return;
    const b = q('#btnFabCriar');
    b.disabled = true;
    b.textContent = '🏭 A IA está escolhendo os temas...';
    try {
      const canal = (typeof canais !== 'undefined' ? canais : []).find((c) => c.id === canalId);
      const r = await window.api.fabrica.criar({
        tipo: 'longos',
        semanas: Number(q('#fabLgSemanas').value),
        diasSemana,
        horarios: [q('#fabLgHora').value],
        duracao: Number(q('#fabLgDuracao').value),
        estiloModo: q('#fabLgEstilo').value,
        temas,
        redes: { youtube: true, facebook: q('#fabFacebook').checked },
        canalYoutube: canal ? { id: canal.id, titulo: canal.titulo } : null,
      });
      avisar(`${r.criados.length} vídeos longos na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      q('#fabLgTemas').value = '';
      carregar();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🏭 Criar lote';
    }
  }

  async function criarInfantil(erro) {
    const canalId = q('#fabIfCanal').value;
    if (!canalId) return (erro.textContent = 'Conecte o canal infantil em Contas YouTube primeiro.');
    const canal = (typeof canais !== 'undefined' ? canais : []).find((c) => c.id === canalId);
    // Desenho infantil vai marcado como "para crianças": nunca no canal bíblico, de música ou de documentário
    if (canal && /jesus|cristo|b[ií]bli|ora[cç][aã]o|evangel|m[uú]sica|frequ[eê]ncia|louvor|noites|hist[oó]ria/i.test(canal.titulo || '') &&
        !confirm(`O canal "${canal.titulo}" parece ser de outro assunto. Os vídeos sobem marcados como conteúdo para crianças. Mandar para ele mesmo?`)) return;
    const nome = q('#fabIfNome').value.trim();
    const descricao = q('#fabIfDesc').value.trim();
    if (!nome || !descricao) return (erro.textContent = 'Escreva o nome e a aparência do personagem.');
    const diasSemana = q('#fabIfDias').value.split(',').map(Number);
    const teste = q('#fabIfSemanas').value === 'teste';
    const qtd = teste ? 1 : Number(q('#fabIfSemanas').value) * diasSemana.length;
    const temas = q('#fabIfTemas').value.split('\n').map((t) => t.trim()).filter(Boolean);
    if (!confirm(`${teste ? `Criar 1 episódio de TESTE do ${nome}? Ele sobe no YouTube como PRIVADO (sem data para publicar): você assiste no YouTube Studio e publica se gostar.` : `Criar ${qtd} episódios do ${nome}, com uma música nova em cada um?`} ${q('#fabCusto').textContent.split('·')[1] || ''}\nEles sobem no YouTube às ${q('#fabIfHora').value}, marcados como conteúdo para crianças. Cada episódio começa a ser produzido 3 dias antes de ir ao ar.`)) return;
    const b = q('#btnFabCriar');
    b.disabled = true;
    b.textContent = '🧸 Planejando os episódios...';
    try {
      const anim = q('#fabIfAnim').value;
      const r = await window.api.fabrica.criar({
        tipo: 'infantil',
        personagem: { nome, descricao },
        semanas: teste ? 1 : Number(q('#fabIfSemanas').value),
        teste,
        redes: { youtube: true, facebook: q('#fabFacebook').checked },
        diasSemana,
        horarios: [q('#fabIfHora').value],
        animacao: anim === 'nada' ? 'nada' : 'tudo',
        animacaoCompleta: anim === 'todas',
        duracao: Number(q('#fabIfDuracao').value),
        shortsMusica: q('#fabIfShorts').value !== 'nao',
        resolucaoAnim: q('#fabIfRes').value,
        vozId: q('#fabIfVoz').value.trim(),
        temas,
        canalYoutube: canal ? { id: canal.id, titulo: canal.titulo } : null,
      });
      avisar(`${r.criados.length} episódios do ${nome} na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      q('#fabIfTemas').value = '';
      carregar();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🏭 Criar lote';
    }
  }

  // Prévia grátis: a IA escreve o roteiro e a letra do próximo episódio (sem imagem, voz, música — não gasta crédito)
  async function previaInfantil() {
    const erro = q('#fabErro');
    erro.textContent = '';
    if (!config.temCentral) return (erro.textContent = 'Cadastre a senha da Central em Configurações.');
    const nome = q('#fabIfNome').value.trim();
    const descricao = q('#fabIfDesc').value.trim();
    if (!nome || !descricao) return (erro.textContent = 'Escreva o nome e a aparência do personagem.');
    const b = q('#btnFabIfPrevia');
    b.disabled = true;
    b.textContent = '✍️ Escrevendo o roteiro (até 1 min)...';
    try {
      const tema = q('#fabIfTemas').value.split('\n').map((t) => t.trim()).find(Boolean) || '';
      const { tema: temaUsado, roteiro: r } = await window.api.fabrica.criar({ tipo: 'previa-infantil', personagem: { nome, descricao }, tema, duracao: Number(q('#fabIfDuracao').value) });
      const cor = (p) => (/^narrador$/i.test(p) ? '#7E57C2' : p.toLowerCase() === nome.toLowerCase() ? '#1E88E5' : '#E91E63');
      const cenaHtml = (c, i) =>
        `<div style="margin:10px 0;padding:10px 12px;border-radius:10px;background:rgba(127,127,127,.08)"><small style="opacity:.6">Cena ${i + 1} · ${esc(c.descricao)}</small>` +
        (c.falas || []).map((f) => `<div style="margin-top:4px"><b style="color:${cor(f.personagem)}">${esc(f.personagem)}${f.vozTipo !== 'normal' ? ` <small>(voz ${esc(f.vozTipo)})</small>` : ''}:</b> ${esc(f.texto)}</div>`).join('') +
        '</div>';
      let d = document.getElementById('dlgPreviaInfantil');
      if (!d) {
        d = document.createElement('dialog');
        d.id = 'dlgPreviaInfantil';
        d.style.cssText = 'max-width:760px;width:92vw;max-height:86vh;overflow:auto;border:none;border-radius:16px;padding:22px';
        document.body.appendChild(d);
      }
      d.innerHTML =
        `<h3 style="margin-top:0">👀 Prévia: ${esc(r.titulo)}</h3>` +
        `<p class="nota">Episódio: ${esc(temaUsado)}<br><b>Lição:</b> ${esc(r.licao || '')}<br>Nada foi gerado nem gasto. Se gostar, escreva esse episódio no campo "Episódios que você quer" e crie o teste.</p>` +
        `<h4>Parte 1 — antes da música</h4>${r.antes.map(cenaHtml).join('')}` +
        `<h4>🎵 Música: ${esc(r.musica.titulo)}</h4><pre style="white-space:pre-wrap;font-family:inherit;background:rgba(255,235,59,.15);padding:12px;border-radius:10px">${esc(r.musica.letra)}</pre>` +
        `<h4>Parte 2 — depois da música</h4>${r.depois.map((c, i) => cenaHtml(c, r.antes.length + i)).join('')}` +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button type="button" class="btn-mini" id="btnPreviaUsar">Usar este episódio</button><button type="button" class="btn-mini" id="btnPreviaOutra">Gerar outra</button><button type="button" class="btn-mini" id="btnPreviaFechar">Fechar</button></div>';
      d.querySelector('#btnPreviaFechar').onclick = () => d.close();
      d.querySelector('#btnPreviaOutra').onclick = () => { d.close(); previaInfantil(); };
      d.querySelector('#btnPreviaUsar').onclick = () => {
        const linhas = q('#fabIfTemas').value.split('\n').map((t) => t.trim()).filter(Boolean);
        if (!linhas.includes(temaUsado)) q('#fabIfTemas').value = [temaUsado, ...linhas.filter((t) => t !== tema)].join('\n');
        d.close();
        avisar('Episódio colocado na lista. Agora é só criar o teste.');
      };
      if (!d.open) d.showModal();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '👀 Prévia grátis do roteiro';
    }
  }

  // Anima a mesma cena em 720p, 580p e 480p e mostra lado a lado (custa uns US$ 0,23)
  async function compararQualidades() {
    const erro = q('#fabErro');
    erro.textContent = '';
    if (!confirm('Animar a mesma cena no Kling, no Wan 720p e no Wan 480p para comparar? Custa uns US$ 0,50 na fal.ai e leva uns 2 a 5 minutos.')) return;
    const b = q('#btnFabIfComparar');
    b.disabled = true;
    b.textContent = '🔍 Animando nas 3 qualidades...';
    try {
      const { jobs } = await window.api.fabrica.criar({ tipo: 'comparar-anim' });
      let prontos = [];
      for (let volta = 0; volta < 60; volta++) {
        await new Promise((ok) => setTimeout(ok, 6000));
        const r = await window.api.fabrica.criar({ tipo: 'comparar-status', jobs });
        prontos = r.jobs || [];
        if (prontos.every((j) => j.status === 'done' || j.status === 'failed')) break;
      }
      const preco = { kling: 'US$ 0,35', '720p': 'US$ 0,10', '580p': 'US$ 0,075', '480p': 'US$ 0,05' };
      let d = document.getElementById('dlgCompararAnim');
      if (!d) {
        d = document.createElement('dialog');
        d.id = 'dlgCompararAnim';
        d.style.cssText = 'max-width:1200px;width:96vw;border:none;border-radius:16px;padding:20px';
        document.body.appendChild(d);
      }
      d.innerHTML =
        '<h3 style="margin-top:0">🔍 A mesma cena nas 3 qualidades</h3><p class="nota">Veja em tela cheia (⤢) para notar a diferença. Depois escolha em "Qualidade da animação".</p>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">' +
        prontos.map((j) => `<div><b>${esc(j.res === 'kling' ? 'Kling 2.5 Pro' : `Wan ${j.res}`)}</b> <small>· ${preco[j.res] || ''} por cena</small>${j.videoUrl ? `<video src="${esc(j.videoUrl)}" controls autoplay loop muted style="width:100%;border-radius:10px;margin-top:6px"></video>` : `<p class="erro">${esc(j.erro || 'Não ficou pronto a tempo')}</p>`}</div>`).join('') +
        '</div><div style="text-align:right;margin-top:12px"><button type="button" class="btn-mini" id="btnFecharCmp">Fechar</button></div>';
      d.querySelector('#btnFecharCmp').onclick = () => d.close();
      if (!d.open) d.showModal();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🔍 Comparar as 3 qualidades';
    }
  }

  async function criarDocumentarios(erro) {
    const canalId = q('#fabDocCanal').value;
    if (!canalId) return (erro.textContent = 'Conecte o canal Noites na História em Contas YouTube primeiro.');
    const canal = (typeof canais !== 'undefined' ? canais : []).find((c) => c.id === canalId);
    // Documentário não é para o canal bíblico nem para os de música
    if (canal && /jesus|cristo|b[ií]bli|ora[cç][aã]o|evangel|m[uú]sica|frequ[eê]ncia|louvor/i.test(canal.titulo || '') &&
        !confirm(`O canal "${canal.titulo}" parece ser de outro assunto. Mandar os documentários para ele mesmo?`)) return;
    const quantos = Number(q('#fabDocQuantos').value);
    const inicio = q('#fabDocInicio').value;
    if (!confirm(`Colocar até ${quantos} documentários na fábrica, 1 por dia às ${q('#fabDocHora').value}, começando em ${inicio ? new Date(inicio + 'T12:00:00').toLocaleDateString('pt-BR') : 'daqui a 2 dias'}?\n\n${q('#fabCusto').textContent}\n\nA voz de cada um só começa a ser gerada 3 dias antes de ir ao ar.`)) return;
    const b = q('#btnFabCriar');
    b.disabled = true;
    b.textContent = '🌙 Colocando os episódios na fábrica...';
    try {
      const r = await window.api.fabrica.criar({
        tipo: 'documentario',
        quantos,
        inicio,
        horarios: [q('#fabDocHora').value],
        vozId: q('#fabDocVoz').value.trim(),
        canalYoutube: canal ? { id: canal.id, titulo: canal.titulo } : null,
      });
      avisar(`${r.criados.length} documentários na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      carregar();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🏭 Criar lote';
    }
  }

  async function criarCortes(erro) {
    const redes = {
      youtube: q('#fabYoutube').checked, facebook: q('#fabFacebook').checked, instagram: q('#fabInstagram').checked,
      tiktok: q('#fabTiktok').checked, kwai: q('#fabKwai').checked,
    };
    if (!Object.values(redes).some(Boolean)) return (erro.textContent = 'Marque pelo menos uma rede.');
    const canalId = q('#fabCtCanal').value;
    if (redes.youtube && !canalId) return (erro.textContent = 'Conecte um canal em Contas YouTube (ou desmarque o YouTube).');
    if (redes.youtube && !canalCombina(canalId, 'falado')) return (erro.textContent = 'Escolha o canal certo para o YouTube.');
    const dias = Number(q('#fabCtDias').value);
    const porDia = Number(q('#fabCtPorDia').value);
    const tipo = q('#fabCtTipo').value;
    const nomeTipo = { alternar: 'cortes (de filme e cômicos)', filme: 'cortes de filme', comico: 'cortes cômicos' }[tipo];
    if (!confirm(`Criar ${dias * porDia} ${nomeTipo}? ${q('#fabCusto').textContent.split('·')[1] || ''}\nA IA escolhe as cenas e eles já ficam agendados.`)) return;
    const b = q('#btnFabCriar');
    b.disabled = true;
    b.textContent = '🏭 A IA está escolhendo as cenas...';
    try {
      const canal = (typeof canais !== 'undefined' ? canais : []).find((c) => c.id === canalId);
      const r = await window.api.fabrica.criar({
        tipo: 'cortes', estiloCorte: tipo, dias, porDia,
        horarios: [q('#fabCtHora1').value, q('#fabCtHora2').value],
        animacao: q('#fabCtAnimacao').value,
        animacaoCompleta: q('#fabCenas').value === 'todas',
        redes,
        canalYoutube: redes.youtube && canal ? { id: canal.id, titulo: canal.titulo } : null,
      });
      const faltou = dias * porDia - r.criados.length;
      avisar(`${r.criados.length} cortes na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}${faltou > 0 ? ` (${faltou === 1 ? 'faltou 1' : `faltaram ${faltou}`}: a IA não achou mais cenas novas)` : ''}`);
      carregar();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🏭 Criar lote';
    }
  }

  async function criarOracao(erro) {
    const redes = {
      youtube: q('#fabYoutube').checked, facebook: q('#fabFacebook').checked, instagram: q('#fabInstagram').checked,
      tiktok: q('#fabTiktok').checked, kwai: q('#fabKwai').checked,
    };
    if (!Object.values(redes).some(Boolean)) return (erro.textContent = 'Marque pelo menos uma rede.');
    const canalId = q('#fabOrCanal').value;
    if (redes.youtube && !canalId) return (erro.textContent = 'Conecte um canal em Contas YouTube (ou desmarque o YouTube).');
    if (redes.youtube && !canalCombina(canalId, 'falado')) return (erro.textContent = 'Escolha o canal certo para o YouTube.');
    const dias = Number(q('#fabOrDias').value);
    const periodo = q('#fabOrPeriodo').value;
    if (!confirm(`Criar ${dias} orações da ${periodo === 'noite' ? 'noite' : 'manhã'}, uma por dia às ${q('#fabOrHora').value}? ${q('#fabCusto').textContent.split('·')[1] || ''}`)) return;
    const b = q('#btnFabCriar');
    b.disabled = true;
    b.textContent = '🏭 Criando as orações...';
    try {
      const canal = (typeof canais !== 'undefined' ? canais : []).find((c) => c.id === canalId);
      const r = await window.api.fabrica.criar({
        tipo: 'oracao', dias, periodo, horarios: [q('#fabOrHora').value], redes,
        canalYoutube: redes.youtube && canal ? { id: canal.id, titulo: canal.titulo } : null,
      });
      avisar(`${r.criados.length} orações na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      carregar();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🏭 Criar lote';
    }
  }

  async function criarEmpresa(erro) {
    const redes = { facebook: q('#fabFacebook').checked, instagram: q('#fabInstagram').checked };
    if (!redes.facebook && !redes.instagram) return (erro.textContent = 'Marque Facebook ou Instagram.');
    const diasSemana = q('#fabDiasSemana').value.split(',').map(Number);
    const qtd = Number(q('#fabSemanas').value) * diasSemana.length;
    if (!confirm(`Criar ${qtd} vídeos de divulgação da LCS? ${q('#fabCusto').textContent.split('·')[1] || ''}\nA IA escolhe os assuntos e eles já ficam agendados na Página e no Instagram da LCS.`)) return;
    const b = q('#btnFabCriar');
    b.disabled = true;
    b.textContent = '🏭 A IA está escolhendo os assuntos...';
    try {
      const r = await window.api.fabrica.criar({ marca: 'lcs', semanas: Number(q('#fabSemanas').value), diasSemana, horarios: [q('#fabHoraLcs').value], redes });
      avisar(`${r.criados.length} vídeos da LCS na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      carregar();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🏭 Criar lote';
    }
  }

  function seloYoutube(i) {
    if (!i.redes?.youtube) return '';
    const y = i.youtube;
    if (!y) return `<span class="fab-yt">▶ YouTube${i.quandoYoutube ? ` ${esc(quandoTxt(i.quandoYoutube))}` : ''}: depois de pronto</span>`;
    if (y.status === 'ok') return `<a class="fab-yt ok" data-link="${esc(y.url || '')}">▶ YouTube agendado ✅</a>`;
    if (y.status === 'erro') return `<a class="fab-yt erro" data-repetir-yt="${esc(i.id)}" title="${esc(y.erro || '')}">▶ YouTube: erro — ${esc(String(y.erro || 'sem detalhe').slice(0, 110))} (clique p/ tentar de novo)</a>`;
    if (y.status === 'enviando') return '<span class="fab-yt">▶ YouTube: subindo pelo PC...</span>';
    return '<span class="fab-yt">▶ YouTube: esperando o PC subir</span>';
  }

  // A fábrica só começa a produzir um vídeo 3 dias antes de ele ir ao ar (o crédito é gasto aos poucos)
  const JANELA_MS = 3 * 24 * 3600e3;
  const naEspera = (i) => i.status === 'pendente' && new Date(i.quando).getTime() - Date.now() > JANELA_MS;
  const comecaEm = (i) => quandoTxt(new Date(new Date(i.quando).getTime() - JANELA_MS).toISOString());

  async function carregar(peloBotao) {
    const box = q('#fabLista');
    const bt = q('#btnFabAtualizar');
    if (peloBotao === true) {
      bt.disabled = true;
      bt.textContent = '↻ Atualizando...';
    }
    try {
      const { itens: todos = [] } = await window.api.fabrica.listar();
      const itens = todos.filter((i) => abaDe(i) === marca); // cada aba mostra só os seus
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (!itens.length) {
        box.innerHTML = `<p class="nota">Nenhum vídeo na fábrica ainda. Escolha os dias e clique em "Criar lote". <b>Atualizado às ${hora}.</b></p>`;
        return;
      }
      const prontos = itens.filter((i) => i.status === 'concluido').length;
      const erros = itens.filter((i) => i.status === 'erro').length;
      const espera = itens.filter(naEspera).length;
      box.innerHTML = `<p class="nota">${itens.length} vídeos · ${prontos} prontos · ${itens.length - prontos - erros - espera} em produção${espera ? ` · ${espera} aguardando a vez` : ''}${erros ? ` · <b style="color:var(--terracota)">${erros} com erro</b>` : ''}. A fábrica anda sozinha a cada 5 min e começa cada vídeo 3 dias antes de ele ir ao ar (o PC precisa estar com o app aberto para montar). <b>Atualizado às ${hora}.</b></p>`;
      let dia = '';
      for (const i of itens) {
        const d = new Date(i.quando).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
        if (d !== dia) {
          dia = d;
          box.insertAdjacentHTML('beforeend', `<h4 class="fab-dia">${esc(d)}</h4>`);
        }
        const redes = ['facebook', 'instagram', 'tiktok', 'kwai'].filter((r) => i.redes?.[r]).map((r) => ({ facebook: 'FB', instagram: 'IG', tiktok: 'TikTok', kwai: 'Kwai' })[r]).join(' · ');
        const l = document.createElement('div');
        l.className = `fab-item st-${i.status}`;
        l.innerHTML = `
          <span class="hora">${esc(new Date(i.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</span>
          <span class="tipo" title="${i.marca ? 'Divulgação da empresa' : i.infantil ? `Desenho infantil${i.infantil.musica ? ` · música: ${i.infantil.musica}` : ''}` : i.oracao ? 'Oração do dia' : i.documentario ? 'Documentário para dormir' : i.longo ? 'Vídeo longo (mistério)' : `${i.corte ? (i.corte.tipo === 'comico' ? 'Corte cômico · ' : 'Corte de filme · ') : ''}${i.animar ? 'Animado' : 'Imagens com zoom'}`}">${i.marca ? '🏢' : i.infantil ? '🧸' : i.oracao ? '🙏' : i.documentario ? '🌙' : i.longo ? '📺' : i.corte ? (i.corte.tipo === 'comico' ? '😂' : '🎬') : i.estilo === 'desenho' ? '🎨' : '🎥'}${i.animar && !i.marca ? '✨' : ''}</span>
          <span class="txt"><b></b><small></small></span>
          <span class="acoes"></span>`;
        l.querySelector('b').textContent = i.titulo || (i.serie ? `${i.serie.nome} (Parte ${i.serie.parte}/${i.serie.total})` : i.tema);
        l.querySelector('small').innerHTML = `${i.aviso ? `<span style="color:var(--terracota)">⚠ ${esc(String(i.aviso).slice(0, 140))}</span> · ` : ''}${esc(i.status === 'erro' ? `Erro: ${i.erro || ''}` : naEspera(i) ? `Aguardando a vez: começa a ser produzido ${comecaEm(i)}` : ETAPA[i.status] || i.status)} · ${esc(redes)} ${seloYoutube(i)}`;
        const acoes = l.querySelector('.acoes');
        const botao = (txt, titulo, fn) => {
          const bt = document.createElement('button');
          bt.className = 'btn-mini';
          bt.textContent = txt;
          bt.title = titulo;
          bt.onclick = fn;
          acoes.appendChild(bt);
        };
        if (i.videoUrl) botao('▶', 'Assistir', () => window.api.abrir.link(i.videoUrl));
        if (i.thumbnailUrl) botao('🖼', 'Ver a thumbnail (capa) que vai para o YouTube', () => window.api.abrir.link(i.thumbnailUrl));
        if (naEspera(i)) botao('⚡', 'Produzir agora (não esperar a vez; o horário no YouTube continua o mesmo)', async () => {
          try {
            await window.api.fabrica.acao({ id: i.id, acao: 'produzir-agora' });
            avisar('Vai começar a ser produzido em até 5 minutos');
          } catch (e) {
            avisar(msgErro(e), true);
          }
          carregar();
        });
        if (i.status === 'erro') botao('↻', 'Tentar de novo (continua de onde parou)', async () => { await window.api.fabrica.acao({ id: i.id, acao: 'repetir' }); carregar(); });
        if (i.longo) botao('⤢', 'Refazer mais longo (roteiro novo, mesmo tema e horário)', async () => {
          const min = Math.round(Number(q('#fabLgDuracao')?.value || 720) / 60);
          if (!confirm(`Refazer "${i.titulo || i.tema}" com uns ${min} minutos?\n\nA fábrica escreve um roteiro novo (mesmo tema e mesmo horário) e monta de novo. O custo é o de um vídeo novo (imagens e voz).${i.youtube?.status === 'ok' ? '\n\nEste já subiu para o YouTube: apague o antigo no YouTube Studio para não ficar repetido.' : ''}`)) return;
          try {
            const r = await window.api.fabrica.acao({ id: i.id, acao: 'refazer-longo', duracao: Number(q('#fabLgDuracao')?.value || 720) });
            avisar(r?.jaNoYoutube ? 'Refazendo. Lembre de apagar o vídeo antigo no YouTube Studio.' : 'Refazendo com roteiro mais longo');
          } catch (e) {
            avisar(msgErro(e), true);
          }
          carregar();
        });
        botao('🗑', i.status === 'concluido' ? 'Tirar da fábrica e da agenda das redes' : 'Cancelar este vídeo', async () => {
          if (!confirm(`Tirar "${i.titulo || i.tema}" da fábrica?`)) return;
          await window.api.fabrica.acao({ id: i.id, acao: 'cancelar' });
          carregar();
        });
        l.querySelectorAll('[data-link]').forEach((a) => a.dataset.link && (a.onclick = () => window.api.abrir.link(a.dataset.link)));
        l.querySelectorAll('[data-repetir-yt]').forEach((a) => (a.onclick = async () => { await window.api.fabrica.acao({ id: i.id, acao: 'youtube-repetir' }); carregar(); }));
        box.appendChild(l);
      }
    } catch (e) {
      box.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'erro';
      p.textContent = msgErro(e);
      box.appendChild(p);
    } finally {
      bt.disabled = false;
      bt.textContent = '↻ Atualizar';
    }
  }

  function abrir() {
    ligar();
    preencherCanais();
    q('#fabHora2').disabled = q('#fabPorDia').value === '1';
    custo();
    if (!q('#modalFabrica').open) q('#modalFabrica').showModal();
    carregar();
    window.api.creditos.ler().then((c) => {
      if (!c?.itens?.length) return;
      const txt = c.itens.map((i) => `${i.nivel === 'ok' ? '' : '⚠ '}${i.nome.split(' ')[0]}: ${i.texto}`).join(' · ');
      q('#fabCusto').textContent = `${q('#fabCusto').textContent.split(' | ')[0]} | Créditos: ${txt}`;
    }).catch(() => {});
  }

  return { abrir };
})();
