/* Biblioteca: todos os vídeos do Youvideo (nuvem) + os feitos no PC, por categoria.
   Daqui dá pra agendar 1 por dia no YouTube, Facebook, Instagram, TikTok e Kwai. */
const Biblioteca = (() => {
  const B = {
    itens: [],
    categorias: {},
    cat: 'todos',
    busca: '',
    formato: 'todos',
    naoPublicados: false,
    sel: [], // chaves na ordem em que foram marcadas
    aba: 'biblioteca',
    carregado: false,
    agenda: [],
  };
  const q = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ICONES = { todos: '🗂', compilacoes: '💻', historias: '🎨', series: '📖', cortes: '😂', musicas: '🎵', medleys: '🎶', cover: '🎤', outros: '📦' };
  const REDES = [
    ['youtube', 'YouTube', 'yt', '▶'],
    ['facebook', 'Facebook', 'fb', 'f'],
    ['instagram', 'Instagram', 'ig', '◎'],
    ['tiktok', 'TikTok', 'tt', '♪'],
    ['kwai', 'Kwai', 'kw', 'K'],
  ];
  const hojeISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function aviso(txt) {
    const a = q('#bibAviso');
    a.hidden = !txt;
    a.innerHTML = txt || '';
  }

  async function carregar() {
    q('#bibGrade').innerHTML = '<p class="bib-vazio">Carregando os vídeos do Youvideo...</p>';
    aviso('');
    try {
      const d = await window.api.central.biblioteca();
      B.itens = d.itens || [];
      B.categorias = d.categorias || {};
      B.carregado = true;
      if (d.avisos?.length) aviso('Alguns vídeos não carregaram: ' + esc(d.avisos.join(' · ')));
    } catch (e) {
      B.itens = [];
      aviso(
        `⚠ ${esc(msgErro(e))}<br><span class="nota">Para ligar a Biblioteca: crie <b>CENTRAL_TOKEN</b> na Vercel e cole a mesma senha em <b>Configurações → Central Youvideo</b>.</span>`
      );
    }
    renderCategorias();
    renderGrade();
  }

  function filtrados() {
    const termo = B.busca.trim().toLowerCase();
    return B.itens.filter((i) => {
      if (B.cat !== 'todos' && i.categoria !== B.cat) return false;
      if (termo && !String(i.titulo).toLowerCase().includes(termo)) return false;
      if (B.formato === 'curto' && !i.curto) return false;
      if (B.formato === 'longo' && i.curto) return false;
      if (B.naoPublicados && i.publicado?.youtube) return false;
      return true;
    });
  }

  function renderCategorias() {
    const nav = q('#bibCategorias');
    nav.innerHTML = '';
    const cont = (c) => (c === 'todos' ? B.itens.length : B.itens.filter((i) => i.categoria === c).length);
    const lista = ['todos', ...Object.keys(B.categorias)];
    for (const c of lista) {
      const n = cont(c);
      if (c !== 'todos' && !n && c !== 'compilacoes') continue;
      const b = document.createElement('button');
      b.className = 'bib-cat' + (B.cat === c ? ' ativo' : '');
      b.innerHTML = `<span>${ICONES[c] || '📁'}</span><span class="nome">${esc(c === 'todos' ? 'Todos' : B.categorias[c])}</span><b>${n}</b>`;
      b.onclick = () => {
        B.cat = c;
        renderCategorias();
        renderGrade();
      };
      nav.appendChild(b);
    }
  }

  function capaHtml(i) {
    if (i.categoria === 'cover') return '<div class="bib-capa audio">🎤</div>';
    const img = i.thumbnailUrl || (i.capa ? urlArquivo(i.capa) : null);
    if (img) return `<div class="bib-capa"><img loading="lazy" src="${esc(img)}" /></div>`;
    const src = i.videoUrl || (i.arquivo ? urlArquivo(i.arquivo) : null);
    return src ? `<div class="bib-capa"><video preload="metadata" muted src="${esc(src)}#t=3"></video></div>` : '<div class="bib-capa"></div>';
  }

  function renderGrade() {
    const grade = q('#bibGrade');
    const lista = filtrados();
    q('#bibContagem').textContent = `${lista.length} vídeo${lista.length === 1 ? '' : 's'}`;
    if (!lista.length) {
      grade.innerHTML = B.carregado ? '<p class="bib-vazio">Nenhum vídeo aqui.</p>' : '';
      renderPainel();
      return;
    }
    grade.innerHTML = '';
    for (const i of lista) {
      const card = document.createElement('div');
      const marcado = B.sel.includes(i.chave);
      card.className = 'bib-card' + (marcado ? ' sel' : '');
      const pub = REDES.filter(([r]) => i.publicado?.[r]).map(([, n, c, ic]) => `<span class="mini-rede ${c}" title="Já publicado no ${n}">${ic}</span>`).join('');
      const data = i.criadoEm ? new Date(i.criadoEm).toLocaleDateString('pt-BR') : '';
      card.innerHTML = `
        ${capaHtml(i)}
        ${i.categoria !== 'cover' ? `<label class="bib-check" title="Selecionar para agendar"><input type="checkbox" ${marcado ? 'checked' : ''} /><span>${marcado ? B.sel.indexOf(i.chave) + 1 : ''}</span></label>` : ''}
        <span class="bib-formato">${i.categoria === 'cover' ? 'ÁUDIO' : i.curto ? 'SHORT' : 'LONGO'}</span>
        <div class="bib-info">
          <b title="${esc(i.titulo)}">${esc(i.titulo)}</b>
          <span>${esc(B.categorias[i.categoria] || '')} · ${data}${i.duracao ? ' · ' + tempo(i.duracao) : ''}</span>
          <div class="bib-pub">${pub}</div>
        </div>
        <div class="bib-acoes"></div>`;
      const acoes = card.querySelector('.bib-acoes');
      const botao = (txt, titulo, fn) => {
        const b = document.createElement('button');
        b.textContent = txt;
        b.title = titulo;
        b.onclick = (e) => {
          e.stopPropagation();
          fn(b);
        };
        acoes.appendChild(b);
      };
      if (i.categoria === 'cover') {
        botao('🎵 Usar como música', 'Baixa o áudio e coloca na sua lista de músicas', (b) => usarComoMusica(i, b));
        botao('▶', 'Ouvir', () => window.api.abrir.link(i.audioUrl));
      } else {
        if (i.videoUrl) botao('▶', 'Assistir', () => window.api.abrir.link(i.videoUrl));
        if (i.arquivo) botao('📂', 'Abrir pasta', () => window.api.abrir.pasta(i.arquivo));
        if (i.videoUrl) botao('⬇', 'Baixar para o PC', (b) => baixarVideo(i, b));
        if (['projeto', 'medley', 'musica'].includes(i.origem)) botao('📁', 'Mudar de pasta', (b) => mudarPasta(i, b));
      }
      const chk = card.querySelector('.bib-check input');
      if (chk) {
        chk.onchange = () => alternar(i);
        card.onclick = (e) => {
          if (e.target.closest('.bib-acoes') || e.target.closest('.bib-check') || e.target.closest('select')) return;
          alternar(i);
        };
      }
      grade.appendChild(card);
    }
    renderPainel();
  }

  function alternar(i) {
    const k = B.sel.indexOf(i.chave);
    if (k >= 0) B.sel.splice(k, 1);
    else B.sel.push(i.chave);
    renderGrade();
  }

  async function usarComoMusica(i, b) {
    b.disabled = true;
    b.textContent = 'Baixando...';
    try {
      const arq = await window.api.central.baixar({ url: i.audioUrl, nome: i.titulo });
      const info = await window.api.midia.musicas([arq]);
      info.forEach((m) => (m.titulo = i.titulo));
      adicionarMusicas(info);
      b.textContent = '✓ Na lista de músicas';
    } catch (e) {
      avisar(msgErro(e), true);
      b.disabled = false;
      b.textContent = '🎵 Usar como música';
    }
  }

  async function baixarVideo(i, b) {
    b.disabled = true;
    b.textContent = '...';
    try {
      const arq = await window.api.central.baixar({ url: i.videoUrl, nome: i.titulo, pasta: P.saida.pasta || null });
      avisar('Vídeo baixado');
      window.api.abrir.pasta(arq);
    } catch (e) {
      avisar(msgErro(e), true);
    } finally {
      b.disabled = false;
      b.textContent = '⬇';
    }
  }

  function mudarPasta(i, b) {
    const sel = document.createElement('select');
    sel.className = 'bib-mover';
    for (const [c, nome] of Object.entries(B.categorias)) {
      if (c === 'compilacoes' || c === 'cover') continue;
      const o = document.createElement('option');
      o.value = c;
      o.textContent = nome;
      sel.appendChild(o);
    }
    sel.value = i.categoria;
    b.replaceWith(sel);
    sel.focus();
    sel.onchange = async () => {
      try {
        await window.api.central.categoria({ origem: i.origem, id: i.id, categoria: sel.value });
        i.categoria = sel.value;
        avisar(`Movido para ${B.categorias[sel.value]}`);
      } catch (e) {
        avisar(msgErro(e), true);
      }
      renderCategorias();
      renderGrade();
    };
    sel.onblur = () => setTimeout(renderGrade, 150);
  }

  // ---------- Agendar ----------
  function selecionados() {
    return B.sel.map((k) => B.itens.find((i) => i.chave === k)).filter(Boolean);
  }
  function horarios(n) {
    const base = new Date(`${q('#bibData').value || hojeISO()}T${q('#bibHora').value || '12:00'}:00`);
    const passo = Number(q('#bibIntervalo').value) * 3600e3;
    return Array.from({ length: n }, (_, i) => new Date(base.getTime() + i * passo));
  }
  function renderPainel() {
    const painel = q('#bibPainel');
    const itens = selecionados();
    painel.hidden = !itens.length;
    if (!itens.length) return;
    q('#bibQtdSel').textContent = itens.length;
    const sel = q('#redeYoutubeCanal');
    const atual = sel.value;
    sel.innerHTML = canais.length ? '' : '<option value="">Nenhum canal conectado</option>';
    canais.forEach((c) => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.titulo;
      sel.appendChild(o);
    });
    sel.value = atual && canais.find((c) => c.id === atual) ? atual : config.envioPrefs?.canalId || canais[0]?.id || '';
    sel.disabled = !q('#redeYoutube').checked;
    const hs = horarios(itens.length);
    q('#bibPrevia').innerHTML = itens
      .map((i, k) => `<li><b>${hs[k].toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${q('#bibHora').value}</b><span>${esc(i.titulo)}</span></li>`)
      .join('');
    const longos = itens.filter((i) => !i.curto).length;
    const avisos = [];
    if (longos && (q('#redeInstagram').checked || q('#redeTiktok').checked))
      avisos.push(`${longos} vídeo(s) longo(s): o Instagram aceita até 15 min e o TikTok até 10 min.`);
    if ((q('#redeFacebook').checked || q('#redeInstagram').checked || q('#redeTiktok').checked || q('#redeKwai').checked) && !config.temCentral)
      avisos.push('Para Facebook/Instagram/TikTok/Kwai, cadastre a senha da Central em Configurações.');
    q('#bibAvisoAgenda').textContent = avisos.join(' ');
  }

  function descricaoComCapitulos(desc, i) {
    let d = String(desc || '').trim();
    if (i.musicas && i.musicas.length > 1) {
      const fmt = (s) => {
        s = Math.floor(s);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s % 60).padStart(2, '0')}`;
      };
      d += (d ? '\n\n' : '') + '🎵 Músicas:\n' + i.musicas.map((m, k) => `${fmt(k ? m.inicio : 0)} ${m.titulo}`).join('\n');
    }
    return d.slice(0, 4900);
  }

  async function agendar() {
    const erro = q('#bibErro');
    erro.textContent = '';
    const itens = selecionados();
    const redes = {
      youtube: q('#redeYoutube').checked ? q('#redeYoutubeCanal').value : null,
      facebook: q('#redeFacebook').checked,
      instagram: q('#redeInstagram').checked,
      tiktok: q('#redeTiktok').checked,
      kwai: q('#redeKwai').checked,
    };
    if (!redes.youtube && !redes.facebook && !redes.instagram && !redes.tiktok && !redes.kwai) return (erro.textContent = 'Marque pelo menos uma rede.');
    if (q('#redeYoutube').checked && !redes.youtube) return (erro.textContent = 'Escolha o canal do YouTube (ou conecte um em Contas YouTube).');
    const hs = horarios(itens.length);
    if (hs[0].getTime() < Date.now() + 15 * 60e3) return (erro.textContent = 'O primeiro horário já passou. Escolha outra data ou horário.');
    const ia = q('#bibIa').checked;
    if (ia && !config.temGroq) return (erro.textContent = 'Para usar a IA, cadastre a chave da Groq em Configurações (ou desligue a opção).');

    const btn = q('#bibAgendar');
    btn.disabled = true;
    const lista = [];
    try {
      for (let k = 0; k < itens.length; k++) {
        const i = itens[k];
        let titulo = i.titulo;
        let descricao = i.descricao || '';
        let tags = [];
        if (ia) {
          btn.textContent = `✨ Escrevendo ${k + 1} de ${itens.length}...`;
          try {
            const r = await window.api.envio.gerarTextos({
              nome: i.titulo,
              musicas: (i.musicas || []).map((m) => m.titulo),
              duracaoSeg: i.duracao || 0,
              curto: i.curto,
              canal: redes.youtube ? canais.find((c) => c.id === redes.youtube)?.titulo || '' : '',
              contexto: [config.envioPrefs?.contexto, B.categorias[i.categoria]].filter(Boolean).join(' — '),
            });
            titulo = r.titulo;
            descricao = r.descricao;
            tags = r.tags;
          } catch (e) {
            avisar(`IA falhou em "${i.titulo}", usei o título original`, true);
          }
        }
        lista.push({
          item: i,
          quando: hs[k].toISOString(),
          titulo: String(titulo).slice(0, 100),
          descricao: descricaoComCapitulos(descricao, i),
          tags,
          legenda: [titulo, descricao].filter(Boolean).join('\n\n').slice(0, 2200),
        });
      }
      btn.textContent = 'Agendando...';
      const r = await window.api.central.agendar({ itens: lista, redes });
      const partes = [];
      if (r.youtube) partes.push(`${r.youtube} no YouTube (acompanhe na Fila)`);
      if (r.nuvem) partes.push(`${r.nuvem} nas redes`);
      avisar(`Agendado: ${partes.join(' e ')}`);
      B.sel = [];
      renderGrade();
      trocarAba('agenda');
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      btn.disabled = false;
      btn.textContent = '📅 Agendar';
    }
  }

  // ---------- Agenda ----------
  async function carregarAgenda() {
    const box = q('#agendaLista');
    box.innerHTML = '<p class="bib-vazio">Carregando a agenda...</p>';
    let nuvem = [];
    let erroNuvem = null;
    try {
      nuvem = (await window.api.central.agenda()).itens || [];
    } catch (e) {
      erroNuvem = msgErro(e);
    }
    // YouTube (agendado pelo próprio PC, direto no YouTube) + posts subindo do PC
    const locais = jobs
      .filter((j) => (j.tipo === 'envio' && j.envio?.agendarPara) || j.tipo === 'nuvem')
      .map((j) => ({
        local: true,
        job: j,
        titulo: j.nome,
        quando: j.tipo === 'envio' ? j.envio.agendarPara : j.nuvem.quando,
        redes:
          j.tipo === 'envio'
            ? { youtube: { status: j.status === 'concluido' ? 'ok' : j.status === 'erro' ? 'erro' : 'pendente', erro: j.erro, url: j.youtube?.url, canal: j.youtube?.canal } }
            : Object.fromEntries(j.nuvem.redes.map((r) => [r, { status: j.status === 'erro' ? 'erro' : 'subindo', erro: j.erro }])),
      }))
      .filter((x) => x.job.status !== 'concluido' || x.job.tipo === 'envio');
    B.agenda = [...nuvem, ...locais].sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
    renderAgenda(erroNuvem);
  }

  function chip(rede, st, item) {
    const [, nome, cls, ic] = REDES.find(([r]) => r === rede);
    const rotulo = { pendente: 'agendado', publicando: 'publicando…', subindo: 'subindo do PC…', ok: 'publicado', erro: 'erro', manual: 'postar pelo celular' }[st.status] || st.status;
    const icone = { pendente: '⏳', publicando: '⬆', subindo: '⬆', ok: '✅', erro: '❌', manual: '📱' }[st.status] || '';
    const el = document.createElement('span');
    el.className = `chip-rede ${cls} st-${st.status}`;
    el.innerHTML = `<i>${ic}</i> ${nome} <em>${icone} ${rotulo}</em>`;
    el.title = st.erro || st.obs || (st.canal ? `Canal: ${st.canal}` : '');
    if (st.url) {
      el.classList.add('link');
      el.onclick = () => window.api.abrir.link(st.url);
    }
    if (st.status === 'erro' && !item.local) {
      el.classList.add('link');
      el.title = (st.erro || '') + '\n\nClique para tentar de novo';
      el.onclick = async () => {
        await window.api.central.agendaAcao({ id: item.id, rede, acao: 'repetir' });
        avisar('Vai tentar de novo na próxima rodada (até 10 min)');
        carregarAgenda();
      };
    }
    return el;
  }

  function renderAgenda(erroNuvem) {
    const box = q('#agendaLista');
    box.innerHTML = '';
    if (erroNuvem) {
      const p = document.createElement('p');
      p.className = 'bib-aviso';
      p.textContent = `⚠ Agenda das redes indisponível: ${erroNuvem}`;
      box.appendChild(p);
    }
    // Kwai: o que está na hora de postar
    const agora = new Date().toISOString();
    const kwai = B.agenda.filter((a) => !a.local && a.redes?.kwai?.status === 'manual' && a.quando <= agora);
    if (kwai.length) {
      const sec = document.createElement('div');
      sec.className = 'agenda-kwai';
      sec.innerHTML = `<h3>📱 Para postar no Kwai agora (${kwai.length})</h3>`;
      for (const a of kwai) {
        const l = document.createElement('div');
        l.className = 'kwai-item';
        l.innerHTML = `<span></span><button class="btn-mini">⬇ Baixar vídeo</button><button class="btn-mini">📋 Copiar legenda</button><button class="btn-mini destaque">✓ Já postei</button>`;
        l.querySelector('span').textContent = a.titulo;
        const [bBaixar, bCopiar, bFeito] = l.querySelectorAll('button');
        bBaixar.onclick = async () => {
          bBaixar.textContent = 'Baixando...';
          try {
            const arq = await window.api.central.baixar({ url: a.videoUrl, nome: a.titulo, pasta: P.saida.pasta || null });
            window.api.abrir.pasta(arq);
            bBaixar.textContent = '✓ Baixado';
          } catch (e) {
            avisar(msgErro(e), true);
            bBaixar.textContent = '⬇ Baixar vídeo';
          }
        };
        bCopiar.onclick = async () => {
          await navigator.clipboard.writeText(a.legenda || a.titulo);
          avisar('Legenda copiada');
        };
        bFeito.onclick = async () => {
          await window.api.central.agendaAcao({ id: a.id, rede: 'kwai', acao: 'feito' });
          carregarAgenda();
        };
        sec.appendChild(l);
      }
      box.appendChild(sec);
    }
    if (!B.agenda.length) {
      box.insertAdjacentHTML('beforeend', '<p class="bib-vazio">Nada agendado ainda. Na aba Vídeos, marque os vídeos e clique em Agendar.</p>');
      return;
    }
    let diaAtual = '';
    for (const a of B.agenda) {
      const d = new Date(a.quando);
      const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
      if (dia !== diaAtual) {
        diaAtual = dia;
        const h = document.createElement('h4');
        h.className = 'agenda-dia' + (hojeISO(d) === hojeISO() ? ' hoje' : '');
        h.textContent = hojeISO(d) === hojeISO() ? `Hoje · ${dia}` : dia;
        box.appendChild(h);
      }
      const l = document.createElement('div');
      l.className = 'agenda-item';
      l.innerHTML = `<span class="hora">${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        ${a.thumbnailUrl ? `<img src="${esc(a.thumbnailUrl)}" />` : '<span class="sem-img"></span>'}
        <span class="titulo"></span><span class="chips"></span><span class="acoes"></span>`;
      l.querySelector('.titulo').textContent = a.titulo;
      const chips = l.querySelector('.chips');
      for (const [r, st] of Object.entries(a.redes || {})) chips.appendChild(chip(r, st, a));
      const acoes = l.querySelector('.acoes');
      const del = document.createElement('button');
      del.className = 'btn-mini perigo';
      del.textContent = '🗑';
      del.title = a.local ? 'Tirar da fila' : 'Cancelar este agendamento';
      del.onclick = async () => {
        if (a.local) {
          if (a.job.tipo === 'envio' && a.job.status === 'concluido') {
            return avisar('Esse já está agendado no YouTube. Para cancelar, apague pelo YouTube Studio.', true);
          }
          await window.api.fila.remover(a.job.id);
        } else {
          if (!confirm(`Cancelar "${a.titulo}" nas redes?\n(O que já foi publicado continua publicado.)`)) return;
          await window.api.central.agendaApagar(a.id);
        }
        carregarAgenda();
      };
      acoes.appendChild(del);
      box.appendChild(l);
    }
  }

  function trocarAba(aba) {
    B.aba = aba;
    q('#bibAbas').querySelectorAll('button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === aba));
    q('#bibCorpoVideos').hidden = aba !== 'biblioteca';
    q('#bibCorpoAgenda').hidden = aba !== 'agenda';
    q('#bibBusca').style.visibility = aba === 'biblioteca' ? 'visible' : 'hidden';
    if (aba === 'agenda') carregarAgenda();
  }

  let ligado = false;
  function ligar() {
    if (ligado) return;
    ligado = true;
    q('#bibAbas').querySelectorAll('button').forEach((b) => (b.onclick = () => trocarAba(b.dataset.v)));
    q('#bibAtualizar').onclick = () => (B.aba === 'agenda' ? carregarAgenda() : carregar());
    q('#bibBusca').oninput = (e) => {
      B.busca = e.target.value;
      renderGrade();
    };
    q('#bibFormato').querySelectorAll('button').forEach(
      (b) =>
        (b.onclick = () => {
          B.formato = b.dataset.v;
          q('#bibFormato').querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x === b));
          renderGrade();
        })
    );
    q('#bibNaoPublicados').onchange = (e) => {
      B.naoPublicados = e.target.checked;
      renderGrade();
    };
    ['#redeYoutube', '#redeFacebook', '#redeInstagram', '#redeTiktok', '#redeKwai', '#bibData', '#bibHora', '#bibIntervalo'].forEach((id) =>
      q(id).addEventListener('change', renderPainel)
    );
    q('#bibAgendar').onclick = agendar;
  }

  async function abrir() {
    ligar();
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    if (!q('#bibData').value || q('#bibData').value < hojeISO()) q('#bibData').value = hojeISO(amanha);
    q('#bibData').min = hojeISO();
    q('#modalBib').showModal();
    trocarAba(B.aba);
    if (!B.carregado) await carregar();
    else renderGrade();
  }

  // A fila muda várias vezes por segundo durante um envio: atualiza a agenda no máximo a cada 5 s
  let tAgenda = null;
  function atualizarAgenda() {
    if (B.aba !== 'agenda' || !q('#modalBib').open || tAgenda) return;
    tAgenda = setTimeout(() => {
      tAgenda = null;
      carregarAgenda();
    }, 5000);
  }

  return { abrir, atualizarAgenda };
})();
