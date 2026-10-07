/* Short do cantor: o vídeo do cantor é gerado num site de fora (ilovesong). Aqui fica o antes e o depois:
   1) cortar o melhor trecho de cada música; 2) abrir o site; 3) trazer os vídeos baixados,
   reconhecer de qual música é cada um e mandar para "Subir p/ YouTube" já como Short. */
const Cantor = (() => {
  const q = (s) => document.querySelector(s);
  const SITE = 'https://ilovesong.ai/';
  const C = {
    musicas: [], // { arquivo, titulo, duracao, marcada, corte: { trecho, inicio, duracao } | null, erro }
    videos: [], // { arquivo, nome, duracao, deitado, trecho, completo, ... }
    trechos: [], // trechos já cortados neste PC (para trocar a música reconhecida, se preciso)
    pasta: '',
    ocupado: false,
  };
  let ligado = false;

  const mmss = (seg) => {
    seg = Math.max(0, Math.round(seg || 0));
    return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
  };
  // Aceita "1:12" ou "72"
  const paraSeg = (txt) => {
    const t = String(txt || '').trim().replace(',', '.');
    if (!t) return null;
    const p = t.split(':').map(Number);
    if (p.some((n) => isNaN(n))) return null;
    return p.length === 2 ? p[0] * 60 + p[1] : p[0];
  };
  const duracaoEscolhida = () => Number(q('#canDur').value) || 60;

  function renderMusicas() {
    const box = q('#canMusicas');
    box.innerHTML = '';
    if (!C.musicas.length) {
      box.innerHTML = '<p class="nota">Nenhuma música na lista. Coloque as músicas no Compilador (tela Compilar) ou clique em "+ Escolher outras músicas".</p>';
    }
    C.musicas.forEach((m) => {
      const l = document.createElement('div');
      l.className = 'can-item';
      l.innerHTML = '<input type="checkbox" /><div><div class="titulo"></div><div class="sub"></div></div>';
      const marca = l.querySelector('input');
      marca.checked = !!m.marcada;
      marca.onchange = () => {
        m.marcada = marca.checked;
        pintarBotoes();
      };
      l.querySelector('.titulo').textContent = m.titulo;
      const sub = l.querySelector('.sub');
      if (m.erro) {
        sub.textContent = `Não deu: ${m.erro}`;
        sub.classList.add('erro');
      } else if (m.corte) {
        sub.textContent = `✓ Trecho cortado: de ${mmss(m.corte.inicio)} até ${mmss(m.corte.inicio + m.corte.duracao)} da música`;
        sub.classList.add('ok');
        const c = document.createElement('div');
        c.className = 'corte';
        c.innerHTML = '<audio controls preload="none"></audio><span>Começar em</span><input type="text" /><button class="btn-mini">↻ Cortar de novo</button>';
        c.querySelector('audio').src = `${urlArquivo(m.corte.trecho)}?v=${m.corte.vez || 0}`;
        const campo = c.querySelector('input');
        campo.value = mmss(m.corte.inicio);
        campo.title = 'Minuto e segundo da música onde o trecho começa (ex.: 1:12)';
        c.querySelector('button').onclick = () => {
          const seg = paraSeg(campo.value);
          if (seg == null) return avisar('Escreva o começo assim: 1:12', true);
          cortar([m], seg);
        };
        l.appendChild(c);
      } else {
        sub.textContent = `Música de ${mmss(m.duracao)}`;
      }
      box.appendChild(l);
    });
    pintarBotoes();
  }

  function pintarBotoes() {
    const n = C.musicas.filter((m) => m.marcada).length;
    q('#canCortar').disabled = !n || C.ocupado;
    q('#canCortar').textContent = n > 1 ? `✂ Cortar ${n} trechos` : '✂ Cortar o trecho';
    q('#canPasta').hidden = !C.pasta;
  }

  async function cortar(lista, inicio = null) {
    if (C.ocupado || !lista.length) return;
    C.ocupado = true;
    q('#canErro').textContent = '';
    q('#canNota1').textContent = lista.length > 1 ? 'Escutando as músicas e cortando... 0%' : 'Escutando a música e cortando...';
    pintarBotoes();
    try {
      const r = await window.api.cantor.cortar({
        musicas: lista.map((m) => ({ arquivo: m.arquivo, titulo: m.titulo })),
        duracao: duracaoEscolhida(),
        inicio,
      });
      C.pasta = r.pasta;
      let feitos = 0;
      r.itens.forEach((it, i) => {
        const m = lista[i];
        if (it.erro) {
          m.erro = it.erro;
          m.corte = null;
        } else {
          m.erro = '';
          m.corte = { trecho: it.trecho, inicio: it.inicio, duracao: it.duracao, vez: Date.now() };
          m.marcada = false; // já cortada: sai da próxima leva
          feitos++;
        }
      });
      q('#canNota1').textContent = feitos ? `${feitos} trecho(s) na pasta. Agora é só mandar para o ilovesong.` : '';
      C.trechos = await window.api.cantor.trechos().catch(() => C.trechos);
    } catch (e) {
      q('#canNota1').textContent = '';
      q('#canErro').textContent = msgErro(e);
    } finally {
      C.ocupado = false;
      renderMusicas();
    }
  }

  function renderVideos() {
    const box = q('#canVideos');
    box.innerHTML = '';
    C.videos.forEach((v, i) => {
      const l = document.createElement('div');
      l.className = 'can-item can-video';
      l.innerHTML =
        '<div class="linha"><b class="arq"></b><span class="sub tam"></span><button class="btn-mini tirar">× Tirar</button></div>' +
        '<div class="linha"><span>🎵 É o trecho de</span><select></select></div><div class="sub link"></div><div class="sub formato"></div>';
      l.querySelector('.arq').textContent = v.nome;
      l.querySelector('.tam').textContent = mmss(v.duracao);
      const sel = l.querySelector('select');
      const op = (valor, texto) => {
        const o = document.createElement('option');
        o.value = valor;
        o.textContent = texto;
        sel.appendChild(o);
      };
      op('', v.trecho ? '— nenhuma destas —' : '— não reconheci: escolha a música —');
      const lista = [...C.trechos];
      if (v.trecho && !lista.find((t) => t.id === v.trecho.id)) lista.unshift(v.trecho);
      lista.forEach((t) => op(t.id, t.titulo));
      sel.value = v.trecho ? v.trecho.id : '';
      sel.onchange = async () => {
        v.trecho = lista.find((t) => t.id === sel.value) || null;
        v.completo = v.trecho ? await window.api.cantor.completo(v.trecho.id).catch(() => null) : null;
        renderVideos();
      };
      const link = l.querySelector('.link');
      if (v.completo) {
        link.textContent = `🔗 Vídeo completo desta música no canal: ${v.completo.titulo || v.completo.url}`;
        link.classList.add('ok');
      } else if (v.trecho) {
        link.textContent = 'Não achei o vídeo longo desta música na fila do Compilador. O Short sobe sem o link (dá para pôr depois).';
      } else {
        link.textContent = 'Sem música escolhida, o Short sobe com o nome do arquivo no título.';
      }
      l.querySelector('.formato').textContent = v.deitado ? '↻ Veio deitado: o Compilador deixa em pé para virar Short.' : '';
      l.querySelector('.tirar').onclick = () => {
        C.videos.splice(i, 1);
        renderVideos();
      };
      box.appendChild(l);
    });
    q('#canSubir').hidden = !C.videos.length;
    q('#canSubir').textContent = C.videos.length > 1 ? `▶ Continuar: subir ${C.videos.length} Shorts no YouTube` : '▶ Continuar: subir o Short no YouTube';
    q('#canAvisoLink').hidden = !C.videos.some((v) => v.completo);
  }

  async function trazer(caminhos) {
    if (!caminhos.length || C.ocupado) return;
    C.ocupado = true;
    q('#canErro').textContent = '';
    q('#canNota3').textContent = 'Escutando os vídeos para saber de qual música é cada um...';
    try {
      const ja = new Set(C.videos.map((v) => v.arquivo));
      const novos = (await window.api.cantor.reconhecer(caminhos)).filter((v) => !ja.has(v.arquivo));
      if (!novos.length) avisar('Não achei vídeo novo nesses arquivos', true);
      C.videos.push(...novos);
      const reconhecidos = novos.filter((v) => v.trecho).length;
      q('#canNota3').textContent = novos.length ? `${reconhecidos} de ${novos.length} reconhecido(s) pelo som.` : '';
    } catch (e) {
      q('#canNota3').textContent = '';
      q('#canErro').textContent = msgErro(e);
    } finally {
      C.ocupado = false;
      renderVideos();
    }
  }

  async function continuar() {
    if (C.ocupado || !C.videos.length) return;
    C.ocupado = true;
    q('#canErro').textContent = '';
    const b = q('#canSubir');
    b.disabled = true;
    try {
      // Os deitados viram vídeo em pé (os outros voltam iguais)
      const deitados = C.videos.filter((v) => v.deitado);
      if (deitados.length) {
        q('#canNota3').textContent = `Deixando ${deitados.length} vídeo(s) em pé...`;
        const prontos = await window.api.cantor.emPe(deitados.map((v) => v.arquivo));
        deitados.forEach((v, i) => {
          if (prontos[i]) Object.assign(v, { arquivo: prontos[i].arquivo, duracao: prontos[i].duracao, largura: prontos[i].largura, altura: prontos[i].altura, deitado: false });
        });
      }
      const paraSubir = C.videos.map((v) => {
        const base = { arquivo: v.arquivo, nome: v.nome, duracao: v.duracao, curto: true, capa: v.capa || null, musicas: null, clima: '' };
        if (!v.trecho) return base;
        const musica = v.trecho.titulo;
        return {
          ...base,
          nome: musica, // é o que a IA lê para escrever título e descrição
          musicas: [{ titulo: musica, inicio: 0 }],
          titulo: `${musica} 🎤 #Shorts`.slice(0, 100),
          descricao: `Trecho de "${musica}".\n\n🔔 Inscreva-se no canal para ouvir as músicas novas.`,
          tags: musica,
          fonte: 'manual',
          linkCompleto: v.completo?.url || '',
        };
      });
      q('#modalCantor').close();
      C.videos = [];
      q('#canNota3').textContent = '';
      renderVideos();
      await Subir.abrir(null, paraSubir);
    } catch (e) {
      q('#canNota3').textContent = '';
      q('#canErro').textContent = msgErro(e);
    } finally {
      C.ocupado = false;
      b.disabled = false;
    }
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    q('#canCortar').onclick = () => cortar(C.musicas.filter((m) => m.marcada));
    q('#canPasta').onclick = () => {
      const um = C.musicas.find((m) => m.corte)?.corte.trecho;
      if (um) window.api.abrir.pasta(um);
    };
    q('#canSite').onclick = () => window.api.abrir.link(SITE);
    q('#canEscolher').onclick = async () => {
      const novas = await window.api.dialogo.musicas();
      const ja = new Set(C.musicas.map((m) => m.arquivo));
      (novas || []).filter((m) => !ja.has(m.arquivo)).forEach((m) => C.musicas.push({ arquivo: m.arquivo, titulo: m.titulo, duracao: m.duracao, marcada: true, corte: null, erro: '' }));
      renderMusicas();
    };
    q('#canDur').onchange = () => {
      config.cantorDuracao = duracaoEscolhida();
      window.api.config.salvar({ cantorDuracao: config.cantorDuracao }).catch(() => {});
    };
    q('#canEscolherVideos').onclick = async () => trazer(((await window.api.envio.escolherVideos()) || []).map((v) => v.arquivo));
    const zona = q('#canZona');
    zona.addEventListener('dragover', (e) => {
      e.preventDefault();
      zona.classList.add('soltando');
    });
    zona.addEventListener('dragleave', () => zona.classList.remove('soltando'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zona.classList.remove('soltando');
      trazer([...e.dataTransfer.files].map((f) => window.api.caminhoDoArquivo(f)).filter(Boolean));
    });
    q('#canSubir').onclick = continuar;
    window.api.ao('cantor:progresso', (x) => {
      if (!q('#modalCantor').open || !C.ocupado) return;
      const pct = `${Math.round(x * 100)}%`;
      if (q('#canNota1').textContent.includes('cortando...')) q('#canNota1').textContent = `Escutando as músicas e cortando... ${pct}`;
      if (q('#canNota3').textContent.startsWith('Deixando')) q('#canNota3').textContent = q('#canNota3').textContent.replace(/\.\.\..*$/, `... ${pct}`);
    });
  }

  async function abrir() {
    ligar();
    q('#canErro').textContent = '';
    q('#canDur').value = String([30, 45, 60].includes(Number(config.cantorDuracao)) ? config.cantorDuracao : 60);
    // Começa com as músicas marcadas na lista do Compilador, mantendo o que já foi cortado nesta janela
    const antes = new Map(C.musicas.map((m) => [m.arquivo, m]));
    const daLista = (typeof selecionadas === 'function' ? selecionadas() : []).map((m) => antes.get(m.arquivo) || { arquivo: m.arquivo, titulo: m.titulo, duracao: m.duracao, marcada: true, corte: null, erro: '' });
    const vistos = new Set(daLista.map((m) => m.arquivo));
    C.musicas = [...daLista, ...C.musicas.filter((m) => !vistos.has(m.arquivo))];
    C.trechos = await window.api.cantor.trechos().catch(() => []);
    renderMusicas();
    renderVideos();
    if (!q('#modalCantor').open) q('#modalCantor').showModal();
  }

  return { abrir };
})();
