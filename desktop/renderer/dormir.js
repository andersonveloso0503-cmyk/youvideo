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
    };
    window.api.config.salvar({ dormir: config.dormir }).catch(() => {});
  }

  function aplicarTema() {
    const t = tema();
    if (!t) return;
    q('#drmTitulo').value = t.titulo;
    q('#drmDescricao').value = t.descricao.replace(/\[NOME DO CANAL\]/g, q('#drmCanal').value.trim() || '[NOME DO CANAL]');
    q('#drmTags').value = t.tags;
    q('#drmPrompt').value = t.prompt;
    q('#drmMovimento').value = t.movimento;
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

  async function gerar() {
    const cenas = D.cenas.filter((c) => !c.gerando && !c.erro).map(({ imagem, video, ia }) => ({ imagem, video, ia }));
    salvar();
    D.rodando = true;
    D.pronto = null;
    q('#drmErro').textContent = '';
    q('#drmBarra').hidden = false;
    q('#drmBarra i').style.width = '0%';
    q('#drmDica').textContent = 'Começando...';
    pintar();
    try {
      const nome = (q('#drmTitulo').value || 'sons para dormir').replace(/[\\/:*?"<>|#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      D.pronto = await window.api.dormir.gerar({
        cenas,
        ambientes: D.ambientes.map((m) => m.arquivo),
        musicas: D.musicas.map((m) => m.arquivo),
        volAmbiente: Number(q('#drmVolAmb').value),
        volMusica: Number(q('#drmVolMus').value),
        horas: Number(q('#drmHoras').value),
        trocaMin: Number(q('#drmTroca').value),
        resolucao: q('#drmRes').value,
        nome,
      });
      q('#drmDica').textContent = `✓ Vídeo pronto (${horasTxt(D.pronto.duracao)}). Agora é só subir.`;
    } catch (e) {
      const m = msgErro(e);
      q('#drmDica').textContent = m === 'CANCELADO' ? 'Cancelado.' : '';
      if (m !== 'CANCELADO') q('#drmErro').textContent = m;
    } finally {
      D.rodando = false;
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
    q('#drmVolAmb').value = p.volAmb ?? 100;
    q('#drmVolMus').value = p.volMus ?? 35;
    q('#drmVolAmbTxt').textContent = `${q('#drmVolAmb').value}%`;
    q('#drmVolMusTxt').textContent = `${q('#drmVolMus').value}%`;
    if (!q('#drmTitulo').value) aplicarTema();
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
    if (D.pronto && !D.rodando) q('#drmDica').textContent = `✓ Vídeo pronto (${horasTxt(D.pronto.duracao)}). Agora é só subir.`;
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
        q('#drmDica').textContent = `✓ Vídeo pronto (${horasTxt(D.pronto.duracao)}). Agora é só subir.`;
      } else if (est?.fase === 'erro') {
        q('#drmErro').textContent = est.texto;
        q('#drmBarra').hidden = true;
      } else q('#drmBarra').hidden = true;
      pintar();
    }, 2000);
  }

  return { abrir };
})();
