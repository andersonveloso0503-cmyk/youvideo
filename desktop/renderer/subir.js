/* Janela "Subir p/ YouTube": vídeos prontos → canal escolhido, com IA e agendamento. */
const Subir = (() => {
  const S = {
    videos: [], // {arquivo, nome, duracao, curto, capa, previa, musicas, titulo, descricao, tags, fonte}
    canalId: '',
    privacidade: 'agendado',
    data: '',
    hora: '12:00',
    intervalo: '24',
    contexto: '',
    capitulos: true,
    modelo: { titulo: '{nome}', descricao: '', tags: '' },
  };
  let ligado = false;
  let gerandoIa = false;

  const q = (s) => document.querySelector(s);
  const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const dataBR = (d) => new Date(d).toLocaleDateString('pt-BR');
  const dataHoraBR = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  function salvarPrefs() {
    const { canalId, privacidade, hora, intervalo, contexto, capitulos, modelo } = S;
    const envioPrefs = { ...(config.envioPrefs || {}), canalId, privacidade, hora, intervalo, contexto, capitulos, modelo };
    config.envioPrefs = envioPrefs;
    window.api.config.salvar({ envioPrefs }).catch(() => {});
  }

  function fmtMin(seg) {
    seg = Math.floor(seg);
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
  }

  // Descrição final = texto + lista de músicas (capítulos) + hashtags do modelo
  function descricaoFinal(v) {
    let d = (v.descricao || '').trim();
    if (S.capitulos && v.musicas && v.musicas.length > 1) {
      const linhas = v.musicas.map((m, i) => `${fmtMin(i === 0 ? 0 : m.inicio)} ${m.titulo}`);
      const lista = '🎵 Músicas:\n' + linhas.join('\n');
      d = d ? `${d}\n\n${lista}` : lista;
    }
    if (v.curto && !/#shorts/i.test(d)) d += (d ? '\n\n' : '') + '#Shorts';
    return d.slice(0, 4900);
  }

  function aplicarModelo(v) {
    if (v.fonte === 'ia' || v.fonte === 'manual') return;
    v.titulo = (S.modelo.titulo || '{nome}').replace(/\{nome\}/g, v.nome).slice(0, 100);
    v.descricao = S.modelo.descricao || '';
    v.tags = S.modelo.tags || '';
    v.fonte = 'modelo';
  }

  function horarios() {
    const base = new Date(`${S.data || hojeISO()}T${S.hora || '12:00'}:00`);
    const passo = Number(S.intervalo) * 3600e3;
    return S.videos.map((_, i) => new Date(base.getTime() + i * passo));
  }

  function renderCanais() {
    const box = q('#chipsCanais');
    box.innerHTML = '';
    if (!canais.length) box.innerHTML = '<span class="nota">Nenhum canal conectado ainda — clique em "+ Conectar outro canal".</span>';
    if (!canais.find((c) => c.id === S.canalId)) S.canalId = canais[0]?.id || '';
    canais.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip-canal' + (c.id === S.canalId ? ' ativo' : '');
      b.innerHTML = `${c.thumb ? `<img src="${c.thumb}" />` : ''}<span></span>`;
      b.querySelector('span').textContent = (c.id === S.canalId ? '✓ ' : '') + c.titulo;
      b.onclick = () => {
        S.canalId = c.id;
        salvarPrefs();
        renderCanais();
        conferirAgenda();
      };
      box.appendChild(b);
    });
    q('#canalEscolhido').textContent = canais.find((c) => c.id === S.canalId)?.titulo || '—';
  }

  async function conferirAgenda() {
    const aviso = q('#avisoAgenda');
    aviso.innerHTML = '';
    if (!S.canalId || S.privacidade !== 'agendado') return;
    const canalConsultado = S.canalId;
    const ultimo = await window.api.envio.ultimoAgendado(S.canalId);
    if (canalConsultado !== S.canalId || !ultimo) return;
    const proximo = new Date(ultimo);
    proximo.setDate(proximo.getDate() + 1);
    const iso = `${proximo.getFullYear()}-${String(proximo.getMonth() + 1).padStart(2, '0')}-${String(proximo.getDate()).padStart(2, '0')}`;
    aviso.innerHTML = `Esse canal já tem vídeo agendado até <b>${dataBR(ultimo)}</b>. <button class="btn-continuar">continuar de ${dataBR(proximo)}</button>`;
    aviso.querySelector('button').onclick = () => {
      S.data = iso;
      q('#inEnvioData').value = iso;
      renderLista();
    };
  }

  async function atualizarContador() {
    const c = await window.api.envio.contador();
    q('#contadorEnvios').innerHTML = `Hoje: <b>${c.hoje} de ${c.limite}</b> envios${c.renova ? ` · renova às ${c.renova}` : ''}`;
  }

  function renderLista() {
    const ol = q('#listaEnvio');
    ol.innerHTML = '';
    const hs = horarios();
    S.videos.forEach((v, i) => {
      aplicarModelo(v);
      const li = document.createElement('li');
      li.className = 'item-envio' + (v.gerando ? ' gerando' : '');
      const quando =
        S.privacidade === 'agendado' ? `📅 ${dataHoraBR(hs[i])}` : S.privacidade === 'public' ? '🌎 publica na hora' : S.privacidade === 'unlisted' ? '🔗 não listado' : '🔒 privado';
      li.innerHTML = `
        <span class="num">${i + 1}</span>
        <div class="capa" title="Clique para trocar a capa">${v.previa ? `<img src="${urlArquivo(v.previa)}" />` : ''}<span>Trocar capa</span></div>
        <div class="campos">
          <div class="info"><span class="arq"></span><span>${tempo(v.duracao)}</span>${v.curto ? '<span>Shorts</span>' : ''}${v.musicas?.length ? `<span>${v.musicas.length} músicas</span>` : ''}<b>${quando}</b></div>
          <div class="titulo-linha"><input class="t" maxlength="100" list="opcoes-envio-${i}" placeholder="Título do vídeo no YouTube" /><span class="conta"></span></div>
          <datalist id="opcoes-envio-${i}">${(v.opcoes || []).map((o) => `<option value="${String(o).replace(/"/g, '&quot;')}"></option>`).join('')}</datalist>
          ${v.opcoes?.length > 1 ? `<span class="dica-opcoes">💡 ${v.opcoes.length} opções de título — apague o texto do título para ver as outras${v.palavra ? ` · palavra-chave: <b>${String(v.palavra).replace(/</g, '')}</b>` : ''}</span>` : ''}
          <textarea class="d" rows="2" placeholder="Descrição"></textarea>
          <input class="g" placeholder="Tags separadas por vírgula" />
        </div>
        <div class="acoes">
          <button class="ia" title="Gerar título, descrição e tags com IA só deste vídeo">✨</button>
          <button class="sobe" title="Subir na lista">▲</button>
          <button class="desce" title="Descer na lista">▼</button>
          <button class="tira" title="Tirar da lista">×</button>
        </div>`;
      li.querySelector('.arq').textContent = v.nome;
      li.querySelector('.arq').title = v.arquivo;
      const t = li.querySelector('.t');
      const conta = li.querySelector('.conta');
      const pintarConta = () => {
        conta.textContent = `${t.value.length}/100`;
        conta.classList.toggle('passou', t.value.length > 95);
      };
      t.value = v.titulo || '';
      pintarConta();
      t.oninput = () => {
        v.titulo = t.value;
        v.fonte = 'manual';
        pintarConta();
        atualizarBotao();
      };
      const d = li.querySelector('.d');
      d.value = v.descricao || '';
      d.oninput = () => {
        v.descricao = d.value;
        v.fonte = 'manual';
      };
      const g = li.querySelector('.g');
      g.value = Array.isArray(v.tags) ? v.tags.join(', ') : v.tags || '';
      g.oninput = () => {
        v.tags = g.value;
        v.fonte = 'manual';
      };
      li.querySelector('.capa').onclick = async () => {
        const c = await window.api.envio.escolherCapa();
        if (!c) return;
        v.capa = c;
        v.previa = await window.api.envio.previaCapa({ arquivo: v.arquivo, capa: c }).catch(() => null);
        renderLista();
      };
      li.querySelector('.ia').onclick = () => gerarIa([v]);
      li.querySelector('.tira').onclick = () => {
        S.videos.splice(i, 1);
        renderLista();
      };
      li.querySelector('.sobe').onclick = () => {
        if (i > 0) [S.videos[i - 1], S.videos[i]] = [S.videos[i], S.videos[i - 1]];
        renderLista();
      };
      li.querySelector('.desce').onclick = () => {
        if (i < S.videos.length - 1) [S.videos[i + 1], S.videos[i]] = [S.videos[i], S.videos[i + 1]];
        renderLista();
      };
      ol.appendChild(li);
    });
    q('#subirResumo').textContent = S.videos.length
      ? `${S.videos.length} vídeo${S.videos.length > 1 ? 's' : ''} · ${
          { agendado: 'sobe como privado e o YouTube publica sozinho na data', public: 'publica na hora', unlisted: 'não listado', private: 'privado' }[S.privacidade]
        }`
      : 'Escolha os vídeos, o canal e como publicar.';
    atualizarBotao();
  }

  function atualizarBotao() {
    const b = q('#btnSubirVideos');
    const n = S.videos.length;
    b.disabled = !n || !S.canalId || gerandoIa;
    b.textContent = n > 1 ? `⬆ Subir ${n} vídeos` : '⬆ Subir vídeo';
  }

  async function adicionarVideos(lista) {
    const existentes = new Set(S.videos.map((v) => v.arquivo));
    const novos = lista.filter((v) => !existentes.has(v.arquivo));
    if (!novos.length) {
      if (lista.length) avisar('Esses vídeos já estão na lista');
      else avisar('Nenhum vídeo encontrado');
      return;
    }
    const adicionados = novos.map((v) => ({ ...v, previa: null, fonte: null }));
    S.videos.push(...adicionados);
    renderLista();
    // Prévia das capas (a imagem com o mesmo nome do vídeo, ou um quadro dele)
    for (const v of adicionados) {
      v.previa = await window.api.envio.previaCapa({ arquivo: v.arquivo, capa: v.capa }).catch(() => null);
    }
    renderLista();
  }

  async function gerarIa(lista) {
    if (!config.temGroq) return avisar('Cadastre a chave da Groq em Configurações para usar a IA.', true);
    if (gerandoIa) return;
    gerandoIa = true;
    const btn = q('#btnIaTodos');
    btn.disabled = true;
    const canal = canais.find((c) => c.id === S.canalId)?.titulo || '';
    let falhas = 0;
    try {
      for (let i = 0; i < lista.length; i++) {
        const v = lista[i];
        btn.textContent = `✨ Gerando ${i + 1} de ${lista.length}...`;
        v.gerando = true;
        renderLista();
        try {
          const r = await window.api.envio.gerarTextos({
            nome: v.nome,
            musicas: (v.musicas || []).map((m) => m.titulo),
            duracaoSeg: v.duracao,
            curto: v.curto,
            clima: v.clima || '',
            canal,
            contexto: S.contexto,
          });
          Object.assign(v, { titulo: r.titulo, opcoes: r.opcoes, palavra: r.palavraPrincipal, descricao: r.descricao, tags: r.tags.join(', '), fonte: 'ia' });
        } catch (e) {
          falhas++;
          avisar(msgErro(e), true);
        }
        v.gerando = false;
      }
    } finally {
      gerandoIa = false;
      btn.disabled = false;
      btn.textContent = '✨ Gerar para todos os vídeos';
      renderLista();
    }
    if (!falhas) avisar(lista.length > 1 ? 'Títulos gerados — revise antes de subir' : 'Título gerado');
  }

  async function subir() {
    q('#erroSubir').textContent = '';
    if (!S.canalId) return (q('#erroSubir').textContent = 'Escolha o canal.');
    const hs = horarios();
    if (S.privacidade === 'agendado' && hs[0].getTime() < Date.now() + 15 * 60e3) {
      return (q('#erroSubir').textContent = 'O primeiro horário agendado já passou (ou é daqui a menos de 15 min). Escolha outra data ou horário.');
    }
    const semTitulo = S.videos.findIndex((v) => !String(v.titulo || '').trim());
    if (semTitulo >= 0) return (q('#erroSubir').textContent = `O vídeo ${semTitulo + 1} está sem título.`);
    const lista = S.videos.map((v, i) => ({
      arquivo: v.arquivo,
      titulo: String(v.titulo).trim().slice(0, 100),
      descricao: descricaoFinal(v),
      tags: (Array.isArray(v.tags) ? v.tags : String(v.tags || '').split(','))
        .map((t) => t.trim())
        .filter(Boolean),
      canalId: S.canalId,
      privacidade: S.privacidade === 'agendado' ? 'private' : S.privacidade,
      agendarPara: S.privacidade === 'agendado' ? hs[i].toISOString() : null,
      capa: v.capa || v.previa || null,
      curto: v.curto,
    }));
    try {
      const n = await window.api.envio.adicionar(lista);
      q('#modalSubir').close();
      S.videos = [];
      avisar(`${n} vídeo${n > 1 ? 's' : ''} na fila de envio — acompanhe embaixo, na Fila`);
    } catch (e) {
      q('#erroSubir').textContent = msgErro(e);
    }
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    q('#lnkEscolherVideos').onclick = async () => adicionarVideos(await window.api.envio.escolherVideos());
    q('#lnkEscolherPasta').onclick = async () => adicionarVideos(await window.api.envio.escolherPasta());
    q('#lnkProntos').onclick = async () => {
      const prontos = jobs.filter((j) => j.tipo !== 'envio' && j.status === 'concluido' && j.arquivoFinal && !j.youtube).map((j) => j.arquivoFinal);
      if (!prontos.length) return avisar('Não há vídeos prontos na fila que ainda não foram publicados');
      adicionarVideos(await window.api.envio.infoVideos(prontos));
    };
    const zona = q('#zonaEnvio');
    zona.addEventListener('dragover', (e) => {
      e.preventDefault();
      zona.classList.add('soltando');
    });
    zona.addEventListener('dragleave', () => zona.classList.remove('soltando'));
    zona.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      zona.classList.remove('soltando');
      const caminhos = [...e.dataTransfer.files].map((f) => window.api.caminhoDoArquivo(f)).filter(Boolean);
      adicionarVideos(await window.api.envio.infoVideos(caminhos));
    });
    q('#btnSubirConectar').onclick = () => {
      q('#erroCanais').textContent = '';
      q('#modalCanais').showModal();
    };
    q('#btnIaTodos').onclick = () => {
      if (!S.videos.length) return avisar('Adicione os vídeos primeiro');
      gerarIa(S.videos);
    };
    q('#inContextoIa').oninput = (e) => {
      S.contexto = e.target.value;
      salvarPrefs();
    };
    q('#cCapitulos').onchange = (e) => {
      S.capitulos = e.target.checked;
      salvarPrefs();
    };
    const modelo = () => {
      S.modelo = { titulo: q('#inModeloTitulo').value, descricao: q('#inModeloDescricao').value, tags: q('#inModeloTags').value };
      salvarPrefs();
      renderLista();
    };
    ['#inModeloTitulo', '#inModeloDescricao', '#inModeloTags'].forEach((id) => q(id).addEventListener('change', modelo));
    q('#inEnvioData').onchange = (e) => {
      S.data = e.target.value;
      renderLista();
    };
    q('#inEnvioHora').onchange = (e) => {
      S.hora = e.target.value;
      salvarPrefs();
      renderLista();
    };
    q('#selEnvioIntervalo').onchange = (e) => {
      S.intervalo = e.target.value;
      salvarPrefs();
      renderLista();
    };
    q('#segEnvioPrivacidade').querySelectorAll('button').forEach(
      (b) =>
        (b.onclick = () => {
          S.privacidade = b.dataset.v;
          salvarPrefs();
          pintarPrivacidade();
          renderLista();
          conferirAgenda();
        })
    );
    q('#btnSubirVideos').onclick = subir;
  }

  function pintarPrivacidade() {
    q('#segEnvioPrivacidade').querySelectorAll('button').forEach((b) => b.classList.toggle('ativo', b.dataset.v === S.privacidade));
    q('#notaPrivacidade').textContent = {
      agendado: 'Sobe como privado com data marcada — o YouTube publica sozinho na data (a data e o intervalo acima valem só neste modo).',
      public: 'Fica público assim que terminar de enviar.',
      unlisted: 'Só quem tiver o link consegue ver.',
      private: 'Só você vê. Dá para publicar depois pelo YouTube Studio.',
    }[S.privacidade];
    const agenda = S.privacidade === 'agendado';
    q('.grade-agenda').style.opacity = agenda ? '1' : '.45';
    q('.grade-agenda').style.pointerEvents = agenda ? '' : 'none';
  }

  async function abrir(arquivos) {
    ligar();
    const prefs = config.envioPrefs || {};
    Object.assign(S, {
      canalId: S.canalId || prefs.canalId || '',
      privacidade: prefs.privacidade || S.privacidade,
      hora: prefs.hora || S.hora,
      intervalo: prefs.intervalo || S.intervalo,
      contexto: prefs.contexto ?? S.contexto,
      capitulos: prefs.capitulos ?? S.capitulos,
      modelo: { ...S.modelo, ...(prefs.modelo || {}) },
    });
    if (!S.data || S.data < hojeISO()) S.data = hojeISO();
    // Se o horário de hoje já passou, começa amanhã
    if (S.data === hojeISO() && new Date(`${S.data}T${S.hora}:00`).getTime() < Date.now() + 15 * 60e3) {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      S.data = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;
    }
    q('#inEnvioData').value = S.data;
    q('#inEnvioData').min = hojeISO();
    q('#inEnvioHora').value = S.hora;
    q('#selEnvioIntervalo').value = S.intervalo;
    q('#inContextoIa').value = S.contexto;
    q('#cCapitulos').checked = S.capitulos;
    q('#inModeloTitulo').value = S.modelo.titulo;
    q('#inModeloDescricao').value = S.modelo.descricao;
    q('#inModeloTags').value = S.modelo.tags;
    q('#erroSubir').textContent = '';
    q('#notaIa').textContent = config.temGroq
      ? 'A IA usa o nome do arquivo e as músicas de cada vídeo. Dá pra revisar e editar tudo na lista antes de subir.'
      : '⚠ Para usar a IA, cadastre a chave da Groq em Configurações.';
    pintarPrivacidade();
    renderCanais();
    renderLista();
    atualizarContador();
    conferirAgenda();
    q('#modalSubir').showModal();
    if (arquivos?.length) await adicionarVideos(await window.api.envio.infoVideos(arquivos));
  }

  return { abrir, renderCanais: () => ligado && renderCanais() };
})();
