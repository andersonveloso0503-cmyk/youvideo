/* Fábrica de Shorts: a IA escolhe os temas, o site cria (roteiro, voz, imagens, animação),
   o PC monta e cada vídeo é agendado sozinho: YouTube pelo PC, Facebook/Instagram pela nuvem,
   TikTok/Kwai na página do celular. */
const Fabrica = (() => {
  const q = (s) => document.querySelector(s);
  let ligado = false;
  let marca = ''; // '' = histórias bíblicas; 'cortes' = cortes de filme e cômicos; 'oracao' = oração do dia; 'lcs' = vídeos de divulgação da LCS
  // Em qual aba cada vídeo da fábrica aparece
  const abaDe = (i) => i.marca || (i.oracao ? 'oracao' : i.corte ? 'cortes' : '');
  const NOTAS = {
    '': 'A IA escolhe os temas, o site cria roteiro, voz e imagens, o seu PC monta, e cada vídeo é agendado sozinho nas redes. Alterna <b>história animada</b> e <b>narrado realista</b>, sem repetir tema.',
    cortes: 'Cenas curtas em <b>diálogo</b>, com uma voz para cada personagem. <b>Corte de filme</b>: cena bíblica dramática, com imagem realista (cerca de 45 s). <b>Corte cômico</b>: situação engraçada em desenho animado (cerca de 1 min). A IA escolhe as cenas sem repetir, escreve as falas, o seu PC monta, e cada corte é agendado sozinho nas redes.',
    oracao: 'Um Short de <b>oração por dia</b> (cerca de 1 minuto), com a data no título — por exemplo "Oração da Manhã de 7 de Outubro" —, que é como as pessoas procuram oração no YouTube. A IA escreve a oração (um assunto diferente por dia), narra com imagens calmas, o seu PC monta, e ela é publicada sozinha no horário.',
    lcs: 'Vídeos curtos (cerca de 30 s) divulgando a <b>LCS Terceirização</b>: a IA escolhe o assunto (limpeza, portaria, zeladoria; condomínios e empresas), escreve o roteiro, narra, cria as imagens, o seu PC monta com o WhatsApp da LCS na tela, e cada um é publicado sozinho na <b>Página e no Instagram da LCS</b>.',
  };

  function trocarMarca(nova) {
    marca = nova;
    document.querySelectorAll('#fabMarcaAbas button').forEach((b) => b.classList.toggle('ativo', (b.dataset.marca || '') === marca));
    q('#fabNota').innerHTML = NOTAS[marca];
    q('#fabConfigLcs').hidden = marca !== 'lcs';
    q('#fabConfigOracao').hidden = marca !== 'oracao';
    q('#fabConfigCortes').hidden = marca !== 'cortes';
    q('#fabConfigBiblia').hidden = marca !== '';
    q('#fabYoutube').parentElement.lastChild.textContent = marca === 'oracao' ? ' YouTube' : ' YouTube (1 por dia)';
    document.querySelectorAll('#modalFabrica .so-biblia').forEach((el) => (el.hidden = marca === 'lcs'));
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
      animacao: q('#fabAnimacao').value, canal: q('#fabCanal').value, formato: q('#fabFormato').value,
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
    const animados = anim === 'tudo' ? n : anim === 'nada' ? 0 : Math.ceil(n / 2);
    const total = animados * custoAnimado() + (n - animados) * CUSTO.parado;
    q('#fabCusto').textContent = `${n} Shorts · custo aproximado US$ ${total.toFixed(0)} (imagens, voz e animação)`;
  }

  function preencherCanais() {
    const lista = typeof canais !== 'undefined' ? canais : [];
    const p = prefs();
    for (const id of ['#fabCanal', '#fabOrCanal', '#fabCtCanal']) {
      const sel = q(id);
      sel.innerHTML = lista.length
        ? lista.map((c) => `<option value="${esc(c.id)}">${esc(c.titulo)}</option>`).join('')
        : '<option value="">Nenhum canal conectado (Contas YouTube)</option>';
      if (p.canal && lista.some((c) => c.id === p.canal)) sel.value = p.canal;
    }
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
    for (const [r, id] of [['youtube', '#fabYoutube'], ['facebook', '#fabFacebook'], ['instagram', '#fabInstagram'], ['tiktok', '#fabTiktok'], ['kwai', '#fabKwai']]) {
      if (p.redes && r in p.redes) q(id).checked = !!p.redes[r];
    }
    ['#fabDias', '#fabPorDia', '#fabHora1', '#fabHora2', '#fabAnimacao', '#fabCenas', '#fabFormato', '#fabCanal', '#fabYoutube', '#fabFacebook', '#fabInstagram', '#fabTiktok', '#fabKwai'].forEach((id) =>
      q(id).addEventListener('change', () => {
        salvarPrefs();
        custo();
        q('#fabHora2').disabled = q('#fabPorDia').value === '1';
      })
    );
    document.querySelectorAll('#fabMarcaAbas button').forEach((b) => (b.onclick = () => trocarMarca(b.dataset.marca || '')));
    ['#fabSemanas', '#fabDiasSemana', '#fabHoraLcs', '#fabOrDias'].forEach((id) => q(id).addEventListener('change', custo));
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
    q('#btnFabAtualizar').onclick = () => carregar(true);
  }

  async function criar() {
    const erro = q('#fabErro');
    erro.textContent = '';
    if (!config.temCentral) return (erro.textContent = 'Cadastre a senha da Central em Configurações.');
    if (marca === 'lcs') return criarEmpresa(erro);
    if (marca === 'oracao') return criarOracao(erro);
    if (marca === 'cortes') return criarCortes(erro);
    const redes = {
      youtube: q('#fabYoutube').checked, facebook: q('#fabFacebook').checked, instagram: q('#fabInstagram').checked,
      tiktok: q('#fabTiktok').checked, kwai: q('#fabKwai').checked,
    };
    if (!Object.values(redes).some(Boolean)) return (erro.textContent = 'Marque pelo menos uma rede.');
    const canalId = q('#fabCanal').value;
    if (redes.youtube && !canalId) return (erro.textContent = 'Conecte um canal em Contas YouTube (ou desmarque o YouTube).');
    const n = Number(q('#fabDias').value) * Number(q('#fabPorDia').value);
    if (!confirm(`Criar ${n} Shorts? ${q('#fabCusto').textContent.split('·')[1] || ''}\nA IA escolhe os temas e eles já ficam agendados.`)) return;
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
        redes,
        canalYoutube: redes.youtube && canal ? { id: canal.id, titulo: canal.titulo } : null,
      });
      avisar(`${r.criados.length} Shorts na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}`);
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
          <span class="tipo" title="${i.marca ? 'Divulgação da empresa' : i.oracao ? 'Oração do dia' : `${i.corte ? (i.corte.tipo === 'comico' ? 'Corte cômico · ' : 'Corte de filme · ') : ''}${i.animar ? 'Animado' : 'Imagens com zoom'}`}">${i.marca ? '🏢' : i.oracao ? '🙏' : i.corte ? (i.corte.tipo === 'comico' ? '😂' : '🎬') : i.estilo === 'desenho' ? '🎨' : '🎥'}${i.animar && !i.marca ? '✨' : ''}</span>
          <span class="txt"><b></b><small></small></span>
          <span class="acoes"></span>`;
        l.querySelector('b').textContent = i.titulo || (i.serie ? `${i.serie.nome} (Parte ${i.serie.parte}/${i.serie.total})` : i.tema);
        l.querySelector('small').innerHTML = `${esc(i.status === 'erro' ? `Erro: ${i.erro || ''}` : naEspera(i) ? `Aguardando a vez: começa a ser produzido ${comecaEm(i)}` : ETAPA[i.status] || i.status)} · ${esc(redes)} ${seloYoutube(i)}`;
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
        if (i.status === 'erro') botao('↻', 'Tentar de novo (continua de onde parou)', async () => { await window.api.fabrica.acao({ id: i.id, acao: 'repetir' }); carregar(); });
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
