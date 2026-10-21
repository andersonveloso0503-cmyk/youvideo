/* Sons para dormir: vídeo longo (1 a 10 h) com cenas lindas em movimento, som ambiente e músicas calmas.
   1) escolher o tema; 2) gerar as cenas com IA (ou trazer do PC); 3) escolher o som; 4) gerar e subir. */
const Dormir = (() => {
  const q = (s) => document.querySelector(s);
  const D = {
    temaId: '',
    cenas: [], // { imagem, video, ia, gerando, status, erro }
    ambientes: [], // { arquivo, titulo, duracao }
    musicas: [],
    rodando: false,
    pronto: null, // vídeo gerado
  };
  let ligado = false;

  const tema = () => DORMIR_TEMAS.find((t) => t.id === D.temaId) || null;
  const horasTxt = (seg) => {
    const h = Math.floor(seg / 3600);
    const m = Math.round((seg % 3600) / 60);
    return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
  };

  function salvar() {
    config.dormir = {
      temaId: D.temaId,
      horas: q('#drmHoras').value,
      troca: q('#drmTroca').value,
      resolucao: q('#drmRes').value,
      animar: q('#drmAnimar').checked,
      qtd: q('#drmQtd').value,
      volAmb: q('#drmVolAmb').value,
      volMus: q('#drmVolMus').value,
      v: 2, // v2: som e música normalizados (volumes antigos não valem mais)
    };
    window.api.config.salvar({ dormir: config.dormir }).catch(() => {});
  }

  function aplicarTema() {
    const t = tema();
    if (!t) return;
    q('#drmTitulo').value = t.titulo;
    q('#drmDescricao').value = t.descricao.replace(/\[NOME DO CANAL\]/g, q('#drmCanal').value.trim() || '[NOME DO CANAL]');
    q('#drmTags').value = t.tags;
    q('#drmCapaFrase').value = t.capaFrase || '';
    q('#drmCapaDestaque').value = t.capaDestaque || '';
    q('#drmPrompt').value = t.prompt;
    q('#drmMovimento').value = t.movimento;
    q('#drmSomPrompt').value = t.somPrompt || '';
    q('#drmMusPrompt').value = t.musicaPrompt || '';
  }

  function renderCenas() {
    const box = q('#drmCenas');
    box.innerHTML = '';
    if (!D.cenas.length) box.innerHTML = '<p class="nota">Nenhuma cena ainda. Gere com IA ou traga imagens/vídeos do PC.</p>';
    D.cenas.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'drm-cena';
      if (c.gerando) {
        el.innerHTML = '<div class="drm-cena-carregando"><span class="drm-giro"></span><small></small></div>';
        el.querySelector('small').textContent = c.status || 'Gerando...';
      } else if (c.erro) {
        el.innerHTML = '<div class="drm-cena-carregando erro"><small></small></div>';
        el.querySelector('small').textContent = c.erro;
      } else if (c.video) {
        el.innerHTML = '<video muted loop autoplay playsinline></video>';
        el.querySelector('video').src = urlArquivo(c.video);
      } else {
        el.innerHTML = '<img alt="" />';
        el.querySelector('img').src = urlArquivo(c.imagem);
      }
      const selo = document.createElement('span');
      selo.className = 'drm-selo';
      selo.textContent = c.gerando || c.erro ? `Cena ${i + 1}` : `Cena ${i + 1} · ${c.video ? 'em movimento' : 'zoom suave'}`;
      el.appendChild(selo);
      if (!c.gerando) {
        const x = document.createElement('button');
        x.className = 'drm-tirar';
        x.title = 'Tirar esta cena';
        x.textContent = '×';
        x.onclick = () => {
          D.cenas.splice(i, 1);
          renderCenas();
        };
        el.appendChild(x);
      }
      box.appendChild(el);
    });
    pintar();
  }

  function renderSons() {
    const lista = (alvo, itens, vazio) => {
      const box = q(alvo);
      box.innerHTML = '';
      if (!itens.length) box.innerHTML = `<p class="nota">${vazio}</p>`;
      itens.forEach((m, i) => {
        const l = document.createElement('div');
        l.className = 'drm-som';
        l.innerHTML = '<span class="t"></span><span class="d"></span><button class="btn-mini" title="Tirar">×</button>';
        l.querySelector('.t').textContent = m.titulo;
        l.querySelector('.d').textContent = horasTxt(m.duracao || 0).replace(/^0 min$/, '');
        l.querySelector('button').onclick = () => {
          itens.splice(i, 1);
          renderSons();
        };
        box.appendChild(l);
      });
    };
    lista('#drmAmbientes', D.ambientes, 'Escolha o som da chuva, do mar, da cachoeira... (com licença de uso comercial).');
    lista('#drmMusicas', D.musicas, 'Opcional. Use músicas suas (do Estúdio de música), para não ter reivindicação de direitos.');
    pintar();
  }

  function pintar() {
    const gerando = D.cenas.some((c) => c.gerando);
    const prontas = D.cenas.filter((c) => !c.gerando && !c.erro);
    const temSom = D.ambientes.length || D.musicas.length;
    q('#drmGerarCenas').disabled = gerando || D.rodando;
    q('#drmGerar').disabled = D.rodando || gerando || !prontas.length || !temSom;
    q('#drmCancelar').hidden = !D.rodando;
    q('#drmSubir').hidden = !D.pronto || D.rodando;
    q('#drmAbrirPasta').hidden = !D.pronto || D.rodando;
    let dica = '';
    if (!prontas.length) dica = 'Falta: as cenas.';
    else if (!temSom) dica = 'Falta: o som ambiente ou as músicas.';
    else {
      const horas = Number(q('#drmHoras').value);
      const troca = Number(q('#drmTroca').value);
      dica = `${horas} h de vídeo, ${prontas.length} cena${prontas.length > 1 ? 's' : ''} alternando a cada ${troca} min.`;
    }
    if (!D.rodando) q('#drmDica').textContent = dica;
  }

  async function gerarCenas() {
    const prompt = q('#drmPrompt').value.trim();
    if (!prompt) return avisar('Escreva a descrição da cena (ou escolha um tema).', true);
    if (!config.temFal) return avisar('Cadastre a chave da fal.ai em Configurações para gerar as cenas.', true);
    const qtd = Number(q('#drmQtd').value) || 3;
    const animar = q('#drmAnimar').checked;
    salvar();
    const novas = Array.from({ length: qtd }, () => ({ gerando: true, status: 'Na fila...' }));
    const base = D.cenas.filter((c) => !c.erro).length;
    D.cenas = D.cenas.filter((c) => !c.erro).concat(novas);
    renderCenas();
    // 2 de cada vez: mais rápido sem estourar a fila da fal.ai
    let proxima = 0;
    const trabalhar = async () => {
      while (proxima < novas.length) {
        const i = proxima++;
        const c = novas[i];
        c.status = 'Desenhando a cena';
        renderCenas();
        try {
          const r = await window.api.dormir.cena({ prompt, movimento: q('#drmMovimento').value.trim(), indice: base + i, animar, tema: tema()?.nome || 'personalizado' });
          Object.assign(c, { imagem: r.imagem, video: r.video, ia: true, gerando: false });
          if (r.aviso) avisar(r.aviso);
        } catch (e) {
          Object.assign(c, { gerando: false, erro: msgErro(e).slice(0, 160) });
        }
        renderCenas();
      }
    };
    await Promise.all([trabalhar(), trabalhar()]);
    window.api.creditos?.ler?.().catch?.(() => {});
  }

  // Gera em lote (2 de cada vez) e vai colocando na lista de som
  async function gerarAudios({ tipo, qtd, chamar, lista, botao }) {
    if (!config.temFal) return avisar('Cadastre a chave da fal.ai em Configurações.', true);
    const b = q(botao);
    const textoBotao = b.textContent;
    b.disabled = true;
    const nota = q('#drmSomNota');
    let feitos = 0;
    let erros = 0;
    const atualizar = () => (nota.textContent = `${tipo}: ${feitos} de ${qtd} prontos${erros ? ` (${erros} falharam)` : ''}...`);
    atualizar();
    let proximo = 0;
    const base = lista.length;
    const trabalhar = async () => {
      while (proximo < qtd) {
        const i = proximo++;
        try {
          const r = await chamar(base + i);
          lista.push(r);
          feitos++;
        } catch (e) {
          erros++;
          nota.textContent = msgErro(e);
        }
        atualizar();
        renderSons();
      }
    };
    try {
      await Promise.all([trabalhar(), trabalhar()]);
      nota.textContent = `✓ ${tipo}: ${feitos} pronto${feitos === 1 ? '' : 's'}${erros ? `, ${erros} falharam` : ''}. Ouça na pasta "Sons para dormir" e tire os que não gostar.`;
    } finally {
      b.disabled = false;
      b.textContent = textoBotao;
    }
  }


  // Prévia do vídeo pronto (modo manual): assista antes de clicar em "Subir"
  function previa() {
    const v = q('#drmPrevia');
    if (!v) return;
    if (D.pronto?.arquivo && !D.rodando) {
      if (v.dataset.src !== D.pronto.arquivo) {
        v.src = urlArquivo(D.pronto.arquivo);
        v.dataset.src = D.pronto.arquivo;
      }
      v.hidden = false;
    } else {
      try { v.pause(); } catch {}
      v.hidden = true;
    }
  }

  async function gerar() {
    const cenas = D.cenas.filter((c) => !c.gerando && !c.erro).map(({ imagem, video, ia }) => ({ imagem, video, ia }));
    salvar();
    D.rodando = true;
    D.pronto = null;
    previa();
    q('#drmErro').textContent = '';
    q('#drmBarra').hidden = false;
    q('#drmBarra i').style.width = '0%';
    q('#drmDica').textContent = 'Começando...';
    pintar();
    try {
      const nome = (q('#drmTitulo').value || 'sons para dormir').replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      D.pronto = await window.api.dormir.gerar({
        cenas,
        movimento: q('#drmMovimento').value.trim(),
        ambientes: D.ambientes.map((m) => m.arquivo),
        musicas: D.musicas.map((m) => m.arquivo),
        volAmbiente: Number(q('#drmVolAmb').value),
        volMusica: Number(q('#drmVolMus').value),
        horas: Number(q('#drmHoras').value),
        trocaMin: Number(q('#drmTroca').value),
        resolucao: q('#drmRes').value,
        capaFrase: q('#drmCapaFrase').value.trim(),
        capaDestaque: q('#drmCapaDestaque').value.trim(),
        nome,
      });
      q('#drmDica').textContent = `✓ Vídeo pronto (${horasTxt(D.pronto.duracao)}). Agora é só subir.`; previa();
    } catch (e) {
      const m = msgErro(e);
      q('#drmDica').textContent = m === 'CANCELADO' ? 'Cancelado.' : '';
      if (m !== 'CANCELADO') q('#drmErro').textContent = m;
    } finally {
      D.rodando = false;
      previa();
      q('#drmBarra').hidden = !D.pronto;
      pintar();
    }
  }

  async function subir() {
    if (!D.pronto) return;
    const titulo = q('#drmTitulo').value.trim().slice(0, 100);
    const v = {
      ...D.pronto,
      curto: false,
      nome: titulo || D.pronto.nome,
      musicas: null,
      clima: 'sons para dormir e relaxar',
      titulo,
      descricao: q('#drmDescricao').value.trim(),
      tags: q('#drmTags').value.trim(),
      fonte: 'manual',
    };
    q('#modalDormir').close();
    await Subir.abrir(null, [v]);
  }

  async function escolherSons(lista) {
    const novas = await window.api.dialogo.musicas();
    const ja = new Set(lista.map((m) => m.arquivo));
    (novas || []).filter((m) => !ja.has(m.arquivo)).forEach((m) => lista.push({ arquivo: m.arquivo, titulo: m.titulo, duracao: m.duracao }));
    renderSons();
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    const sel = q('#drmTema');
    sel.innerHTML = '<option value="">✏ Personalizado (escrevo eu)</option>' + DORMIR_TEMAS.map((t, i) => `<option value="${t.id}">${i + 1}. ${t.nome}</option>`).join('');
    sel.onchange = () => {
      D.temaId = sel.value;
      aplicarTema();
      salvar();
    };
    q('#drmCanal').onchange = () => {
      config.dormirCanal = q('#drmCanal').value.trim();
      window.api.config.salvar({ dormirCanal: config.dormirCanal }).catch(() => {});
      const d = q('#drmDescricao');
      d.value = d.value.replace(/\[NOME DO CANAL\]/g, config.dormirCanal || '[NOME DO CANAL]');
    };
    q('#drmGerarCenas').onclick = gerarCenas;
    q('#drmTrazerCenas').onclick = async () => {
      const novas = await window.api.dormir.escolherCenas();
      D.cenas.push(...(novas || []));
      renderCenas();
    };
    q('#drmAddAmbiente').onclick = () => escolherSons(D.ambientes);
    q('#drmGerarSom').onclick = () => {
      const texto = q('#drmSomPrompt').value.trim();
      if (!texto) return avisar('Escreva como é o som ambiente.', true);
      gerarAudios({ tipo: 'Som ambiente', qtd: Number(q('#drmSomQtd').value), lista: D.ambientes, botao: '#drmGerarSom', chamar: (indice) => window.api.dormir.som({ texto, indice, tema: tema()?.nome || 'personalizado' }) });
    };
    q('#drmGerarMus').onclick = () => {
      const prompt = q('#drmMusPrompt').value.trim();
      if (!prompt) return avisar('Escreva o estilo da música.', true);
      const segundos = Number(q('#drmMusMin').value) * 60;
      gerarAudios({ tipo: 'Músicas', qtd: Number(q('#drmMusQtd').value), lista: D.musicas, botao: '#drmGerarMus', chamar: (indice) => window.api.dormir.musica({ prompt, segundos, indice, tema: tema()?.nome || 'personalizado', motor: q('#drmMusMotor').value }) });
    };
    q('#drmAddMusica').onclick = () => escolherSons(D.musicas);
    for (const id of ['#drmHoras', '#drmTroca', '#drmRes', '#drmAnimar', '#drmQtd']) q(id).onchange = () => (salvar(), pintar());
    for (const id of ['#drmVolAmb', '#drmVolMus']) {
      q(id).oninput = () => (q(id + 'Txt').textContent = `${q(id).value}%`);
      q(id).onchange = salvar;
    }
    q('#drmGerar').onclick = gerar;
    q('#drmCancelar').onclick = () => window.api.dormir.cancelar();
    q('#drmSubir').onclick = subir;
    q('#drmAbrirPasta').onclick = () => D.pronto && window.api.abrir.pasta(D.pronto.arquivo);
    window.api.ao('dormir:progresso', (e) => {
      if (!e) return;
      if (e.fase === 'cena') return; // o status de cada cena é atualizado pela própria chamada
      if (!D.rodando) return;
      q('#drmBarra i').style.width = `${Math.round((e.pct || 0) * 100)}%`;
      if (e.texto) q('#drmDica').textContent = `${e.texto} — pode fechar esta janela, continua gerando.`;
    });
  }

  async function abrir() {
    ligar();
    const p = config.dormir || {};
    D.temaId = p.temaId ?? (D.temaId || DORMIR_TEMAS[0].id);
    q('#drmTema').value = D.temaId;
    q('#drmCanal').value = config.dormirCanal || '';
    if (p.horas) q('#drmHoras').value = p.horas;
    if (p.troca) q('#drmTroca').value = p.troca;
    if (p.resolucao) q('#drmRes').value = p.resolucao;
    if (p.qtd) q('#drmQtd').value = p.qtd;
    q('#drmAnimar').checked = p.animar !== false;
    const novo = p.v === 2;
    q('#drmVolAmb').value = novo ? p.volAmb ?? 45 : 45;
    q('#drmVolMus').value = novo ? p.volMus ?? 80 : 80;
    q('#drmVolAmbTxt').textContent = `${q('#drmVolAmb').value}%`;
    q('#drmVolMusTxt').textContent = `${q('#drmVolMus').value}%`;
    if (!q('#drmTitulo').value) aplicarTema();
    await Semana.abrir();
    // Se um vídeo está sendo gerado (ou ficou pronto) com a janela fechada, mostra o estado
    const est = await window.api.dormir.estado().catch(() => null);
    if (est?.rodando) {
      D.rodando = true;
      q('#drmBarra').hidden = false;
      q('#drmBarra i').style.width = `${Math.round((est.pct || 0) * 100)}%`;
      q('#drmDica').textContent = est.texto || 'Gerando...';
      esperarTerminar();
    } else if (est?.fase === 'pronto' && est.video) {
      D.pronto = est.video;
    }
    renderCenas();
    renderSons();
    if (D.pronto && !D.rodando) q('#drmDica').textContent = `✓ Vídeo pronto (${horasTxt(D.pronto.duracao)}). Agora é só subir.`; previa();
    if (!q('#modalDormir').open) q('#modalDormir').showModal();
  }

  // A janela foi reaberta no meio da geração: acompanha até acabar
  function esperarTerminar() {
    const t = setInterval(async () => {
      const est = await window.api.dormir.estado().catch(() => null);
      if (est?.rodando) return;
      clearInterval(t);
      D.rodando = false;
      if (est?.fase === 'pronto') {
        D.pronto = est.video;
        q('#drmDica').textContent = `✓ Vídeo pronto (${horasTxt(D.pronto.duracao)}). Agora é só subir.`; previa();
      } else if (est?.fase === 'erro') {
        q('#drmErro').textContent = est.texto;
        q('#drmBarra').hidden = true;
      } else q('#drmBarra').hidden = true;
      pintar();
    }, 2000);
  }

  // ---------- Semana inteira ----------
  const Semana = (() => {
    let ligadoS = false;
    let estado = null;
    const ESTADOS = { cenas: '🖼 Cenas', som: '🌧 Som', musicas: '🎵 Músicas', video: '🎬 Vídeo', aprovar: '👀 Aprovar', agendado: '✅ Agendado' };
    const amanha = () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const dataBR = (iso) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    function prefs() {
      return config.dormirSemana || {};
    }
    function guardar() {
      config.dormirSemana = {
        canalId: q('#drsCanal').value,
        hora: q('#drsHora').value,
        horas: q('#drsHoras').value,
        res: q('#drsRes').value,
        cenas: q('#drsCenas').value,
        animar: q('#drsAnimar').checked,
        aprovar: q('#drsAprovar').checked,
        musicas: q('#drsMusicas').value,
        motor: q('#drsMotor').value,
        volAmb: q('#drsVolAmb').value,
        volMus: q('#drsVolMus').value,
        temas: [...document.querySelectorAll('#drsTemas input:checked')].map((c) => c.value),
      };
      window.api.config.salvar({ dormirSemana: config.dormirSemana }).catch(() => {});
    }

    function renderTemas() {
      const box = q('#drsTemas');
      const marcados = new Set(prefs().temas || DORMIR_TEMAS.slice(0, 7).map((t) => t.id));
      box.innerHTML = '';
      DORMIR_TEMAS.forEach((t, i) => {
        const l = document.createElement('label');
        l.className = 'drs-tema';
        l.innerHTML = '<input type="checkbox" /><span></span>';
        const c = l.querySelector('input');
        c.value = t.id;
        c.checked = marcados.has(t.id);
        c.onchange = () => (guardar(), contar());
        l.querySelector('span').textContent = `${i + 1}. ${t.nome}`;
        box.appendChild(l);
      });
      contar();
    }
    function contar() {
      const n = document.querySelectorAll('#drsTemas input:checked').length;
      let periodo = '';
      const ini = q('#drsInicio').value;
      if (n && ini) {
        const [a, m, d] = ini.split('-').map(Number);
        const fim = new Date(a, m - 1, d + n - 1);
        const fmt = (x) => x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        periodo = n > 1 ? `, de ${fmt(new Date(a, m - 1, d))} a ${fmt(fim)}` : ` em ${fmt(fim)}`;
      }
      q('#drsCriar').textContent = n ? `📅 Criar: 1 vídeo por dia${periodo} (${n} no total)` : '📅 Marque os temas';
      q('#drsCriar').disabled = !n || !!estado?.rodando;
    }

    const selecao = new Set();
    function render() {
      const box = q('#drsDias');
      box.innerHTML = '';
      const rodando = !!estado?.rodando;
      const pendentes = estado?.dias?.some((d) => d.passo !== 'agendado');
      const podeAndar = estado?.dias?.some((d) => d.passo !== 'agendado' && !(d.passo === 'aprovar' && !d.aprovado));
      q('#drsCriar').hidden = !!estado && (rodando || pendentes);
      q('#drsContinuar').hidden = !estado || rodando || !podeAndar;
      q('#drsCancelar').hidden = !rodando;
      q('#drsLimpar').hidden = !estado || rodando;
      contar();
      if (!estado) return;
      estado.dias.forEach((d, i) => {
        const l = document.createElement('div');
        l.className = 'drs-dia' + (d.passo === 'agendado' ? ' ok' : d.erro ? ' erro' : '');
        l.innerHTML = '<b class="quando"></b><span class="nome"></span><span class="passo"></span><span class="etapa"></span>';
        l.querySelector('.quando').textContent = dataBR(d.quando);
        l.querySelector('.nome').textContent = d.tema.nome;
        l.querySelector('.passo').textContent = d.semEnvio ? '🚫 Sem envio' : ESTADOS[d.passo] || d.passo;
        l.querySelector('.etapa').textContent = d.erro ? `⚠ ${d.erro}` : d.etapa;
        box.appendChild(l);
        // Vídeo pronto esperando você: player para assistir + Aprovar / Tentar outro
        if (d.passo === 'aprovar' && !d.aprovado && d.video?.arquivo) {
          const p = document.createElement('div');
          p.className = 'drs-previa';
          p.style.cssText = 'margin:-2px 0 6px;padding:10px 12px;border:1px solid var(--borda);border-radius:9px;display:flex;flex-direction:column;gap:8px';
          p.innerHTML =
            '<video controls preload="metadata" style="width:100%;max-width:760px;border-radius:8px;background:#000"></video>' +
            '<small style="color:var(--mudo)">Assista um pedaço (pode pular pela barra). Repare se o fundo se mexe de verdade e se a troca de cena fica suave.</small>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-primario" data-ok>✓ Aprovar e agendar</button><button class="btn-mini perigo" data-outro>✗ Não gostei, tentar outro</button></div>';
          p.querySelector('video').src = urlArquivo(d.video.arquivo);
          p.querySelector('[data-ok]').onclick = async (ev) => {
            ev.target.disabled = true;
            try {
              estado = await window.api.dormir.semanaAprovar(i);
            } catch (e) {
              q('#drsErro').textContent = msgErro(e);
            }
            render();
          };
          p.querySelector('[data-outro]').onclick = async (ev) => {
            if (!confirm('Apagar este vídeo e as cenas dele e criar cenas novas? O som e as músicas ficam. (Gasta crédito de novo nas cenas.)')) return;
            ev.target.disabled = true;
            try {
              estado = await window.api.dormir.semanaRecusar(i);
            } catch (e) {
              q('#drsErro').textContent = msgErro(e);
            }
            render();
          };
          box.appendChild(p);
        }
      });
      desenharCards(box, rodando);
    }

    // Cartões com mini-preview de cada vídeo pronto; marque os que quer refazer (só as cenas)
    function desenharCards(box, rodando) {
      const prontos = estado.dias.map((d, i) => ({ d, i })).filter(({ d }) => d.passo === 'agendado' && d.video?.arquivo);
      if (!prontos.length || rodando) return;
      for (const k of [...selecao]) if (!prontos.some((x) => x.i === k)) selecao.delete(k);
      const bar = document.createElement('div');
      bar.style.cssText = 'margin:12px 0 6px;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
      bar.innerHTML =
        '<b>🎞 Seus vídeos prontos</b><button class="btn-mini" data-todos></button>' +
        '<button class="btn-primario" data-refazer></button>' +
        '<small style="color:var(--mudo)">Passe o mouse para ver o movimento. Refazer troca só as cenas; som e músicas ficam. O vídeo antigo continua no YouTube até você apagar.</small>';
      const grade = document.createElement('div');
      grade.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px';
      const atualizarBarra = () => {
        bar.querySelector('[data-todos]').textContent = selecao.size === prontos.length ? 'Desmarcar todos' : 'Marcar todos';
        const b = bar.querySelector('[data-refazer]');
        b.textContent = selecao.size ? `🎬 Refazer cenas selecionadas (${selecao.size})` : '🎬 Marque os vídeos';
        b.disabled = !selecao.size;
        grade.querySelectorAll('.drs-card').forEach((c) => {
          const on = selecao.has(Number(c.dataset.i));
          c.style.borderColor = on ? 'var(--primaria, #6c8cff)' : 'var(--borda)';
          c.querySelector('input').checked = on;
        });
      };
      for (const { d, i } of prontos) {
        const c = document.createElement('div');
        c.className = 'drs-card';
        c.dataset.i = i;
        c.style.cssText = 'border:1px solid var(--borda);border-radius:10px;overflow:hidden;display:flex;flex-direction:column';
        c.innerHTML =
          '<video muted loop playsinline preload="metadata" style="width:100%;aspect-ratio:16/9;object-fit:cover;background:#000;cursor:pointer"></video>' +
          '<label style="display:flex;gap:8px;align-items:center;padding:8px 10px;cursor:pointer;font-size:12.5px"><input type="checkbox" /><span><b class="n"></b><br><small class="q" style="color:var(--mudo)"></small></span></label>';
        const v = c.querySelector('video');
        v.src = urlArquivo(d.video.arquivo) + '#t=4';
        v.onmouseenter = () => v.play().catch(() => {});
        v.onmouseleave = () => { if (!v.controls) { v.pause(); } };
        v.onclick = () => { v.controls = true; v.muted = false; v.play().catch(() => {}); };
        const bt = document.createElement('div');
        bt.style.cssText = 'display:flex;gap:6px;padding:0 10px 10px;flex-wrap:wrap';
        bt.innerHTML = '<button class="btn-mini perigo" data-cancelarenvio></button><button class="btn-mini" data-agora>⚡ Enviar agora</button>';
        bt.querySelector('[data-cancelarenvio]').textContent = d.semEnvio ? '🚫 Envio cancelado' : '🚫 Cancelar envio';
        bt.querySelector('[data-cancelarenvio]').disabled = !!d.semEnvio;
        const acao = async (ev, canal, pergunta) => {
          if (!confirm(pergunta)) return;
          ev.target.disabled = true;
          q('#drsErro').textContent = '';
          try {
            estado = await window.api.dormir[canal](i);
          } catch (e) {
            q('#drsErro').textContent = msgErro(e);
          }
          render();
        };
        bt.querySelector('[data-cancelarenvio]').onclick = (ev) =>
          acao(ev, 'semanaCancelarEnvio', `Cancelar o envio de "${d.tema.nome}" (${dataBR(d.quando)})?\nSe esse vídeo ainda não subiu, ele não sobe. Se já subiu, fica no YouTube e você apaga no Studio. O vídeo que já está bom no YouTube não é mexido.`);
        bt.querySelector('[data-agora]').onclick = (ev) =>
          acao(ev, 'semanaEnviarAgora', `Enviar "${d.tema.nome}" agora, sem esperar ${dataBR(d.quando)}?\nEle fica PÚBLICO na hora no canal.`);
        c.appendChild(bt);
        c.querySelector('.n').textContent = d.tema.nome;
        c.querySelector('.q').textContent = dataBR(d.quando) + (d.tentativa ? ` · refeito ${d.tentativa}x` : '');
        c.querySelector('input').onchange = (ev) => {
          if (ev.target.checked) selecao.add(i); else selecao.delete(i);
          atualizarBarra();
        };
        grade.appendChild(c);
      }
      bar.querySelector('[data-todos]').onclick = () => {
        if (selecao.size === prontos.length) selecao.clear(); else prontos.forEach((x) => selecao.add(x.i));
        atualizarBarra();
      };
      bar.querySelector('[data-refazer]').onclick = async (ev) => {
        const idx = [...selecao].sort((a, b) => a - b);
        const nomes = idx.map((i) => estado.dias[i].tema.nome).join(', ');
        if (!confirm(`Refazer só as cenas de: ${nomes}?\nGasta crédito só nas cenas novas. Cada vídeo novo aparece aqui para você aprovar antes de ir para a fila.`)) return;
        ev.target.disabled = true;
        q('#drsErro').textContent = '';
        try {
          estado = await window.api.dormir.semanaRefazerCenas({ i: idx, forcar: false });
          selecao.clear();
        } catch (e) {
          const m = msgErro(e);
          if (m.startsWith('FALTAM_SONS')) {
            if (confirm(m.replace('FALTAM_SONS: ', '') + '\n\nRefazer mesmo assim?')) {
              try {
                estado = await window.api.dormir.semanaRefazerCenas({ i: idx, forcar: true });
                selecao.clear();
              } catch (e2) {
                q('#drsErro').textContent = msgErro(e2);
              }
            }
          } else q('#drsErro').textContent = m;
        }
        render();
      };
      box.appendChild(bar);
      box.appendChild(grade);
      atualizarBarra();
    }

    async function criar() {
      q('#drsErro').textContent = '';
      guardar();
      const ids = new Set(prefs().temas || []);
      const canal = q('#drsCanal');
      const temas = DORMIR_TEMAS.filter((t) => ids.has(t.id));
      try {
        estado = await window.api.dormir.semanaCriar({
          canalId: canal.value,
          canalNome: canal.selectedOptions[0]?.textContent || '',
          inicio: q('#drsInicio').value,
          hora: q('#drsHora').value,
          horas: Number(q('#drsHoras').value),
          resolucao: q('#drsRes').value,
          trocaMin: 25,
          animar: q('#drsAnimar').checked,
          aprovar: q('#drsAprovar').checked,
          qtdCenas: Number(q('#drsCenas').value),
          qtdSons: 5,
          qtdMusicas: Number(q('#drsMusicas').value),
          motorMusica: q('#drsMotor').value,
          volAmbiente: Number(q('#drsVolAmb').value),
          volMusica: Number(q('#drsVolMus').value),
          temas,
        });
        render();
      } catch (e) {
        q('#drsErro').textContent = msgErro(e);
      }
    }

    function ligarS() {
      if (ligadoS) return;
      ligadoS = true;
      for (const id of ['#drsCanal', '#drsHora', '#drsHoras', '#drsRes', '#drsCenas', '#drsAnimar', '#drsAprovar', '#drsMusicas', '#drsMotor']) q(id).onchange = guardar;
      q('#drsInicio').onchange = contar;
      for (const id of ['#drsVolAmb', '#drsVolMus']) {
        q(id).oninput = () => (q(id + 'Txt').textContent = `${q(id).value}%`);
        q(id).onchange = guardar;
      }
      q('#drsCriar').onclick = criar;
      q('#drsContinuar').onclick = async () => {
        q('#drsErro').textContent = '';
        estado = await window.api.dormir.semanaContinuar();
        render();
      };
      q('#drsCancelar').onclick = () => window.api.dormir.semanaCancelar();
      q('#drsLimpar').onclick = async () => {
        if (estado?.dias?.some((d) => d.passo !== 'agendado') && !confirm('Ainda tem vídeos desta semana sem terminar. Começar outra semana mesmo assim?')) return;
        await window.api.dormir.semanaLimpar();
        estado = null;
        q('#drsInicio').value = amanha();
        render();
      };
      window.api.ao('dormir:semana', (e) => {
        estado = e;
        const assistindo = [...document.querySelectorAll('#drsDias video')].some((v) => !v.paused && !v.ended);
        if (q('#modalDormir').open && !assistindo) render();
      });
      document.querySelectorAll('#drmModos button').forEach((b) => (b.onclick = () => modo(b.dataset.v)));
    }

    function modo(v) {
      config.dormirModo = v;
      window.api.config.salvar({ dormirModo: v }).catch(() => {});
      document.querySelectorAll('#drmModos button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === v));
      document.querySelectorAll('#modalDormir > .cartao').forEach((c) => (c.hidden = (c.id === 'drmSemana') !== (v === 'semana')));
    }

    async function abrirS() {
      ligarS();
      const p = prefs();
      const canais = await window.api.canais.listar().catch(() => []);
      const sel = q('#drsCanal');
      sel.innerHTML = canais.length ? '' : '<option value="">Conecte o canal em "Contas YouTube"</option>';
      canais.forEach((c) => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.titulo;
        sel.appendChild(o);
      });
      const doSono = canais.find((c) => /sono|dormir|sleep|tranquil/i.test(c.titulo || ''));
      sel.value = canais.find((c) => c.id === p.canalId)?.id || doSono?.id || canais[0]?.id || '';
      if (!q('#drsInicio').value || q('#drsInicio').value < amanha()) q('#drsInicio').value = amanha();
      q('#drsInicio').min = amanha();
      if (p.hora) q('#drsHora').value = p.hora;
      if (p.horas) q('#drsHoras').value = p.horas;
      if (p.res) q('#drsRes').value = p.res;
      if (p.cenas) q('#drsCenas').value = p.cenas;
      q('#drsAnimar').checked = p.animar !== false;
      q('#drsAprovar').checked = p.aprovar !== false;
      if (p.musicas != null) q('#drsMusicas').value = p.musicas;
      if (p.motor) q('#drsMotor').value = p.motor;
      q('#drsVolAmb').value = p.volAmb ?? 45;
      q('#drsVolMus').value = p.volMus ?? 80;
      q('#drsVolAmbTxt').textContent = `${q('#drsVolAmb').value}%`;
      q('#drsVolMusTxt').textContent = `${q('#drsVolMus').value}%`;
      renderTemas();
      estado = await window.api.dormir.semanaEstado().catch(() => null);
      render();
      modo(estado?.rodando ? 'semana' : config.dormirModo || 'um');
    }

    return { abrir: abrirS };
  })();

  return { abrir };
})();
