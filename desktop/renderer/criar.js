/* Tela "Criar": as ferramentas do Youvideo abertas dentro do Compilador. */
const Criar = (() => {
  const GRUPOS = [
    {
      titulo: 'Vídeos bíblicos — Em Nome de Jesus',
      cor: '#d9a441',
      itens: [
        ['/', '🎬', 'Vídeo narrado', 'Roteiro, narração, imagens e montagem — séries dos apóstolos e milagres'],
        ['/desenho', '🎨', 'Histórias animadas', 'Histórias bíblicas prontas em desenho animado, só escolher e gerar'],
        ['/cortes-comicos', '😂', 'Cortes cômicos', 'Situações engraçadas com personagens bíblicos, em Short'],
        ['/series', '👤', 'Séries e personagens', 'Personagens com rosto consistente entre os vídeos'],
        ['/oracao', '🌅', 'Orações matinais', 'Oração calma com 1 imagem em loop'],
        ['/oracao-falada', '🙏', 'Oração falada', 'Personagem falando a oração'],
        ['/livros', '📚', 'Livros bíblicos', 'Você escolhe a história: infantil ilustrado ou devocional, em PDF e Word'],
        ['/temas', '💡', 'Temas', 'Banco de ideias para os vídeos narrados'],
        ['/agendar', '⏰', 'Fila automática', 'Vídeos bíblicos narrados gerados sozinhos, 1 por dia'],
      ],
    },
    {
      titulo: 'Música — Nova Frequência e Aqui Tem Música',
      cor: '#b1432f',
      itens: [
        ['/estudio-musica', '🎼', 'Estúdio de Música', 'Crie músicas com IA: letra, estilo, instrumentos e voz'],
        ['/musica', '🎵', 'Música', 'Uma música, do áudio até o vídeo pronto'],
        ['/musica-fila', '📋', 'Fila de músicas', 'Suba várias e deixe gerar sozinho'],
        ['/medley', '🎶', 'Medley', 'Junte músicas de estilos diferentes numa faixa só'],
        ['/musica-cantada', '🧑‍🎤', 'Cantor virtual', 'Vídeo do personagem cantando'],
        ['/cover', '🎤', 'Cover IA', 'Separa voz e instrumental e canta com voz de IA'],
        ['/transcrever', '📝', 'Transcrever áudio', 'Recupera a letra cantada de uma música'],
      ],
    },
    {
      titulo: 'Ofertas — vender os seus livros',
      cor: '#b1432f',
      itens: [
        ['/ofertas', '🧭', 'Radar de Ofertas', 'Suas análises e ofertas: página de vendas, cadastro e divulgação'],
        // endereço começando com http abre no navegador de ofertas, com o botão "Criar oferta desta página"
        ['https://app.hotmart.com/market', '🔥', 'Mercado da Hotmart', 'Veja o que está em alta pela temperatura e crie a sua oferta a partir da página de vendas'],
        ['https://dashboard.kiwify.com.br/marketplace', '🥝', 'Mercado da Kiwify', 'Navegue pelos produtos e crie a sua oferta a partir da página de vendas'],
        ['https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR', '📣', 'Biblioteca de Anúncios', 'Anúncio ativo há muito tempo costuma ser oferta que dá resultado'],
      ],
    },
    {
      titulo: 'Canais e ideias',
      cor: '#4a7a6e',
      itens: [
        ['/radar', '📡', 'Radar', 'Canais e vídeos em alta no YouTube para modelar'],
        ['/canal', '📺', 'Meus canais', 'Temas, status e reformatar vídeos por canal'],
        ['/novo-canal', '➕', 'Novo canal', 'Criar um canal do zero, passo a passo'],
        ['/projetos', '🗂', 'Meus projetos', 'Tudo que já foi criado no Youvideo'],
      ],
    },
  ];

  const q = (s) => document.querySelector(s);
  let modo = 'compilar';
  let navegando = false;
  let ligado = false;
  let externo = false; // true = navegador de ofertas (site de fora); false = tela do Youvideo

  function limites() {
    const r = q('#criarVista').getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  }

  // A tela do Youvideo fica "por cima" de tudo; some quando uma janela do app abre
  function algumModalAberto() {
    return [...document.querySelectorAll('dialog')].some((d) => d.open);
  }
  function ajustarVisibilidade() {
    const deveMostrar = modo === 'criar' && navegando && !algumModalAberto();
    window.api.criar.visivel(deveMostrar);
    if (deveMostrar) window.api.criar.limites(limites());
  }

  function renderHub() {
    const box = q('#criarGrupos');
    box.innerHTML = '';
    for (const g of GRUPOS) {
      const sec = document.createElement('div');
      sec.className = 'criar-grupo';
      sec.innerHTML = `<h3>${g.titulo}</h3><div class="criar-grade"></div>`;
      const grade = sec.querySelector('.criar-grade');
      for (const [rota, ic, nome, desc] of g.itens) {
        const b = document.createElement('button');
        b.className = 'criar-tile';
        b.style.setProperty('--cor', g.cor);
        b.innerHTML = `<span class="ic">${ic}</span><div><b></b><span></span></div>`;
        b.querySelector('b').textContent = nome;
        b.querySelector('div span').textContent = desc;
        b.onclick = () => abrirFerramenta(rota, nome);
        grade.appendChild(b);
      }
      box.appendChild(sec);
    }
  }

  function modoExterno(sim) {
    externo = sim;
    q('#criarNavegador').classList.toggle('externo', sim);
    q('#ofertasEndereco').hidden = !sim;
    q('#ofertasCapturar').hidden = !sim;
  }

  async function abrirFerramenta(rota, nome) {
    navegando = true;
    q('#criarHub').hidden = true;
    q('#criarNavegador').hidden = false;
    q('#criarTitulo').textContent = nome;
    q('#criarErro').textContent = '';
    const fora = /^https?:\/\//i.test(rota);
    modoExterno(fora);
    if (fora) q('#ofertasEndereco').value = rota;
    await new Promise((r) => requestAnimationFrame(r));
    if (fora) await window.api.ofertas.abrir({ url: rota, limites: limites() });
    else await window.api.criar.abrir({ rota, limites: limites() });
    ajustarVisibilidade();
  }

  // Lê a página aberta, pede a análise e já abre o Radar de Ofertas no passo "o seu produto"
  async function capturarOferta() {
    const b = q('#ofertasCapturar');
    const rotulo = b.textContent;
    b.disabled = true;
    b.textContent = 'Analisando a página… (até 1 minuto)';
    try {
      await new Promise((r) => requestAnimationFrame(r));
      const r = await window.api.ofertas.capturar({ limites: limites() });
      modoExterno(false);
      q('#criarTitulo').textContent = 'Radar de Ofertas';
      await new Promise((ok) => requestAnimationFrame(ok));
      window.api.criar.limites(limites());
      avisar(`Oferta analisada${r.nicho ? ` (${r.nicho})` : ''}. Agora informe o seu produto.`);
    } catch (e) {
      avisar(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true);
    } finally {
      b.disabled = false;
      b.textContent = rotulo;
    }
  }

  function voltarAoHub() {
    navegando = false;
    q('#criarHub').hidden = false;
    q('#criarNavegador').hidden = true;
    ajustarVisibilidade();
  }

  function trocarModo(novo) {
    modo = novo;
    document.querySelectorAll('#modos .modo').forEach((b) => b.classList.toggle('ativo', b.dataset.v === novo));
    const tela = q('#telaCriar');
    tela.style.top = q('.topo').offsetHeight + 'px';
    tela.hidden = novo !== 'criar';
    ajustarVisibilidade();
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    renderHub();
    document.querySelectorAll('#modos .modo').forEach((b) => (b.onclick = () => trocarModo(b.dataset.v)));
    q('#criarFerramentas').onclick = voltarAoHub;
    const acao = (a) => (externo ? window.api.ofertas.acao(a) : window.api.criar.acao(a));
    q('#criarVoltar').onclick = () => acao('voltar');
    q('#criarRecarregar').onclick = () => acao('recarregar');
    q('#criarNavegadorExterno').onclick = () => acao('navegador');
    q('#ofertasCapturar').onclick = capturarOferta;
    q('#ofertasEndereco').onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      q('#criarErro').textContent = '';
      window.api.ofertas.acao({ ir: e.target.value }).catch(() => avisar('Esse endereço não parece válido.', true));
      e.target.blur();
    };
    const abrirBib = () => Biblioteca.abrir({ recarregar: true });
    q('#criarBib').onclick = abrirBib;
    q('#lnkCriarBib').onclick = abrirBib;

    window.api.ao('criar:navegou', (d) => {
      if (!!d.externo !== externo) return; // aviso da vista que não está na tela
      if (d.externo) {
        const campo = q('#ofertasEndereco');
        if (document.activeElement !== campo) campo.value = d.url || '';
        q('#criarErro').textContent = '';
      } else if (d.titulo) q('#criarTitulo').textContent = d.titulo.replace(/\s*[|·-]\s*Youvideo.*$/i, '') || 'Youvideo';
      q('#criarVoltar').disabled = !d.voltar;
    });
    window.api.ao('criar:carregando', (v) => (q('#criarCarregando').hidden = !v));
    window.api.ao('criar:erro', (msg) => (q('#criarErro').textContent = msg));
    window.api.ao('criar:download', (d) => {
      const el = q('#criarDownload');
      if (d.estado === 'baixando') el.textContent = `⬇ Baixando ${d.nome}${d.x ? ` ${Math.round(d.x * 100)}%` : ''}`;
      else if (d.estado === 'completed') {
        el.textContent = `✓ ${d.nome} salvo`;
        el.style.cursor = 'pointer';
        el.onclick = () => window.api.abrir.pasta(d.arquivo);
        avisar(`Download salvo: ${d.nome}`);
      } else if (d.estado === 'montagem') {
        el.textContent = `🎬 "${d.nome}" foi para a fila`;
        el.onclick = null;
        avisar(`"${d.nome}" entrou na fila para montar aqui no PC — acompanhe em 🎬 Compilar › Fila`);
      } else if (d.estado === 'erro') {
        el.textContent = `Não consegui montar: ${d.erro || d.nome}`;
        avisar(d.erro || 'Não consegui ler a receita do vídeo', true);
      } else el.textContent = `Download não terminou: ${d.nome}`;
    });

    // Reposiciona a tela quando a janela muda de tamanho, e esconde quando uma janela do app abre
    new ResizeObserver(() => modo === 'criar' && navegando && window.api.criar.limites(limites())).observe(q('#criarVista'));
    window.addEventListener('resize', () => (q('#telaCriar').style.top = q('.topo').offsetHeight + 'px'));
    const obs = new MutationObserver(ajustarVisibilidade);
    document.querySelectorAll('dialog').forEach((d) => obs.observe(d, { attributes: true, attributeFilter: ['open'] }));
  }

  return { ligar, trocarModo };
})();

Criar.ligar();
