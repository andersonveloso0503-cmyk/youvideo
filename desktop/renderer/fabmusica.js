/* Fábrica → 🎵 Músicas: álbum do dia para o canal gospel e para o canal de música normal.
   O PC cria as músicas, a capa (Gemini), monta o vídeo longo e os Shorts e deixa PRONTO PARA APROVAR. */
const FabMusica = (() => {
  const q = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let ligado = false;
  let dados = null;
  let tRecarregar = null;

  const NOME_CANAL = { gospel: '✝️ Gospel', normal: '🎶 Músicas' };
  const FASE = {
    'na vez': '⏳ Esperando a vez',
    trabalhando: '⚙️ Trabalhando',
    parado: '⏸ Parado (continua sozinho)',
    montando: '🎬 Montando os vídeos',
    pronto: '✅ Pronto para aprovar',
    aprovado: '📤 Aprovado',
    erro: '⚠ Erro',
  };
  const nomeMotor = (m) => (m === 'lyria' ? 'Google Lyria' : 'ElevenLabs');

  function opcoesCanais(sel) {
    const lista = typeof canais !== 'undefined' ? canais : [];
    return ['<option value="">— escolha o canal —</option>', ...lista.map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.titulo)}</option>`)].join('');
  }

  function cartaoCanal(canal) {
    const p = dados.prefs[canal];
    const doGrupo = dados.presets.filter((x) => (canal === 'gospel' ? x.gospel : !x.gospel));
    const marcados = new Set(p.estilos || []);
    const todos = !marcados.size;
    return `
      <div class="fm-canal" data-canal="${canal}">
        <div class="fm-canal-topo">
          <b>${NOME_CANAL[canal]}</b>
          <label class="interruptor"><input type="checkbox" class="fm-ativo" ${p.ativo ? 'checked' : ''} /><span></span> Todo dia</label>
        </div>
        <div class="campo-config"><label>Canal do YouTube</label><select class="fm-yt">${opcoesCanais(p.canalId)}</select></div>
        <div class="fm-estilos-tit">Estilos (alterna um por dia) ${todos ? '<small>— todos</small>' : ''}</div>
        <div class="fm-estilos">${doGrupo
          .map((x) => `<button type="button" class="chip-estilo ${todos || marcados.has(x.id) ? 'on' : ''}" data-id="${esc(x.id)}">${esc(x.nome)}</button>`)
          .join('') || '<span class="nota">Sem internet para ler os estilos.</span>'}</div>
        ${dados.pulos?.[canal] ? `<div class="fm-pulo">⏭ ${esc(dados.pulos[canal].texto)}</div>` : ''}
        <button class="btn-mini destaque fm-agora">▶ Fazer um álbum agora</button>
      </div>`;
  }

  function cartaoAlbum(a) {
    const acoes = [];
    if (a.fase === 'pronto') acoes.push(`<button class="btn-primario fm-subir" data-id="${a.id}">👀 Ver e subir</button>`);
    if (a.fase === 'erro') acoes.push(`<button class="btn-mini destaque fm-de-novo" data-id="${a.id}">↻ Tentar de novo</button>`);
    if (!['trabalhando', 'na vez'].includes(a.fase)) acoes.push(`<button class="btn-mini fm-descartar" data-id="${a.id}" title="Tira da lista (as músicas e os vídeos continuam na pasta)">✕</button>`);
    const nome = a.titulo ? `${esc(a.titulo)}${a.subtitulo ? ` <small>${esc(a.subtitulo)}</small>` : ''}` : esc(a.preset || 'Álbum');
    const progresso = a.total && a.prontas < a.total && ['trabalhando', 'parado', 'erro'].includes(a.fase) ? ` · ${a.prontas}/${a.total} músicas` : '';
    return `
      <div class="fm-album fase-${a.fase.replace(' ', '-')}">
        ${a.capa ? `<img src="${esc(urlArquivo(a.capa))}" alt="" />` : '<div class="fm-sem-capa">🎵</div>'}
        <div class="fm-album-info">
          <div class="fm-album-nome">${nome}</div>
          <div class="nota">${NOME_CANAL[a.canal]} · ${esc(a.preset || '')} · ${nomeMotor(a.motor)} · ${new Date(`${a.dia}T12:00`).toLocaleDateString('pt-BR')}</div>
          <div class="fm-fase">${FASE[a.fase] || a.fase}${a.etapa && !['pronto', 'aprovado'].includes(a.fase) ? ` — ${esc(a.etapa)}` : ''}${progresso}</div>
          ${a.erro ? `<div class="erro">${esc(a.erro)}</div>` : ''}
          ${a.musicas.length && ['pronto', 'aprovado', 'montando'].includes(a.fase) ? `<details><summary>${a.musicas.length} músicas</summary><ol>${a.musicas.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></details>` : ''}
        </div>
        <div class="fm-acoes">${acoes.join('')}</div>
      </div>`;
  }

  function render() {
    const caixa = q('#fabMusica');
    if (!dados) { caixa.innerHTML = '<p class="nota">Carregando...</p>'; return; }
    const p = dados.prefs;
    caixa.innerHTML = `
      <div class="fm-canais">${cartaoCanal('gospel')}${cartaoCanal('normal')}</div>
      <div class="fm-geral">
        <div class="campo-config"><label>Começar todo dia às</label><input type="time" id="fmHora" value="${esc(p.hora)}" /></div>
        <div class="campo-config"><label>Músicas por álbum</label><select id="fmQtd">${[5, 8, 10, 12, 15].map((n) => `<option ${n === p.qtd ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="campo-config"><label>Não fazer se já tiver vídeo longo agendado para</label><select id="fmFolga">${[2, 3, 5, 7, 14].map((n) => `<option value="${n}" ${n === p.folgaDias ? 'selected' : ''}>${n} dias ou mais</option>`).join('')}</select></div>
        <div class="campo-config"><label>Shorts por álbum</label><select id="fmShorts">${[0, 1, 2, 3].map((n) => `<option ${n === p.shorts ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      </div>
      <p class="nota" id="fmCusto"></p>
      <div class="fab-topo-lista"><h3>Álbuns</h3></div>
      <div id="fmLista">${dados.albuns.length ? dados.albuns.map(cartaoAlbum).join('') : '<p class="nota">Nenhum álbum ainda. Ligue "Todo dia" num canal ou clique em "Fazer um álbum agora".</p>'}</div>`;
    custo();
    ligarEventos();
  }

  function custo() {
    const p = dados.prefs;
    const ativos = ['gospel', 'normal'].filter((c) => p[c].ativo).length;
    // Semana: 5 dias Lyria (~R$ 0,75 por música) e 2 dias ElevenLabs (~R$ 4); capa ~R$ 1
    const porAlbum = (p.qtd * (5 * 0.75 + 2 * 4)) / 7 + 1;
    q('#fmCusto').innerHTML = `Cada álbum: ${p.qtd} músicas cantadas + capa do Gemini + 1 vídeo longo${p.shorts ? ` + ${p.shorts} Short${p.shorts > 1 ? 's' : ''}` : ''}. Motor: Google Lyria em 5 dias da semana (~R$ ${Math.round(p.qtd * 0.75)} o álbum) e ElevenLabs na quarta e no sábado (~R$ ${Math.round(p.qtd * 4)} o álbum).` +
      (ativos ? ` <b>Média: ~R$ ${Math.round(porAlbum * ativos)} por dia (~R$ ${Math.round(porAlbum * ativos * 30)} por mês).</b>` : '') +
      ' Nada sobe sozinho: quando ficar pronto, você clica em <b>Ver e subir</b>. O computador precisa estar ligado com o Compilador aberto.';
  }

  async function salvar(novas) {
    try {
      dados.prefs = await window.api.musicaAuto.salvarPrefs(novas);
    } catch (e) {
      avisar(msgErro(e), true);
    }
  }

  function ligarEventos() {
    document.querySelectorAll('#fabMusica .fm-canal').forEach((el) => {
      const canal = el.dataset.canal;
      el.querySelector('.fm-ativo').onchange = async (e) => {
        if (e.target.checked && !el.querySelector('.fm-yt').value) {
          e.target.checked = false;
          return avisar('Escolha o canal do YouTube primeiro', true);
        }
        await salvar({ [canal]: { ativo: e.target.checked } });
        custo();
      };
      el.querySelector('.fm-yt').onchange = async (e) => {
        const id = e.target.value;
        if (id && typeof canalCombina === 'function' && !canalCombina(id, 'musica')) { e.target.value = dados.prefs[canal].canalId || ''; return; }
        const outro = canal === 'gospel' ? 'normal' : 'gospel';
        if (id && id === dados.prefs[outro].canalId && !confirm('Esse canal já está no outro cartão. Usar o mesmo canal para os dois?')) { e.target.value = dados.prefs[canal].canalId || ''; return; }
        await salvar({ [canal]: { canalId: id } });
      };
      el.querySelectorAll('.chip-estilo').forEach((b) => {
        b.onclick = async () => {
          const todosIds = [...el.querySelectorAll('.chip-estilo')].map((x) => x.dataset.id);
          let marcados = new Set(dados.prefs[canal].estilos?.length ? dados.prefs[canal].estilos : todosIds);
          if (marcados.has(b.dataset.id)) marcados.delete(b.dataset.id);
          else marcados.add(b.dataset.id);
          if (!marcados.size) return avisar('Deixe pelo menos um estilo', true);
          if (marcados.size === todosIds.length) marcados = new Set();
          await salvar({ [canal]: { estilos: [...marcados] } });
          render();
        };
      });
      el.querySelector('.fm-agora').onclick = async () => {
        if (!config.temCentral) return avisar('Cadastre a senha da Central em Configurações.', true);
        if (!dados.prefs[canal].canalId) return avisar('Escolha o canal do YouTube primeiro', true);
        const p = dados.prefs;
        const botao = el.querySelector('.fm-agora');
        botao.disabled = true;
        botao.textContent = 'Olhando a agenda do canal...';
        const ag = await window.api.musicaAuto.agenda(canal).catch(() => null);
        botao.disabled = false;
        botao.textContent = '▶ Fazer um álbum agora';
        const dataBR = (d) => new Date(d).toLocaleDateString('pt-BR');
        const agendaTxt = !ag
          ? 'Não consegui olhar a agenda do canal no YouTube agora.'
          : ag.total
          ? `ATENÇÃO: esse canal já tem ${ag.total} vídeo(s) agendado(s) — ${ag.longos} longo(s) e ${ag.shorts} Short(s)${ag.ultimoLongo ? `, vídeo longo até ${dataBR(ag.ultimoLongo)}` : ''}${ag.naFila ? ` (${ag.naFila} ainda na fila do PC)` : ''}.`
          : 'Esse canal não tem nada agendado no YouTube.';
        if (!confirm(`${agendaTxt}\n\nFazer agora um álbum de ${p.qtd} músicas cantadas para ${NOME_CANAL[canal]}?\n\nMotor de hoje: ${[3, 6].includes(new Date().getDay()) ? `ElevenLabs (~R$ ${Math.round(p.qtd * 4)})` : `Google Lyria (~R$ ${Math.round(p.qtd * 0.75)})`}. Leva uns 20 a 40 minutos, mais a montagem dos vídeos.\n\nNada sobe para o YouTube sem você aprovar.`)) return;
        try {
          await window.api.musicaAuto.fazer(canal);
          avisar('Álbum na fila — acompanhe aqui embaixo');
        } catch (e) {
          avisar(msgErro(e), true);
        }
      };
    });
    q('#fmHora').onchange = (e) => salvar({ hora: e.target.value || '08:00' });
    q('#fmQtd').onchange = async (e) => { await salvar({ qtd: Number(e.target.value) }); custo(); };
    q('#fmFolga').onchange = (e) => salvar({ folgaDias: Number(e.target.value) });
    q('#fmShorts').onchange = async (e) => { await salvar({ shorts: Number(e.target.value) }); custo(); };
    document.querySelectorAll('#fabMusica .fm-subir').forEach((b) => (b.onclick = () => verESubir(b.dataset.id)));
    document.querySelectorAll('#fabMusica .fm-de-novo').forEach((b) => (b.onclick = () => window.api.musicaAuto.tentarDeNovo(b.dataset.id).catch((e) => avisar(msgErro(e), true))));
    document.querySelectorAll('#fabMusica .fm-descartar').forEach((b) => {
      b.onclick = () => confirm('Tirar este álbum da lista? (As músicas e os vídeos continuam na pasta.)') && window.api.musicaAuto.descartar(b.dataset.id);
    });
  }

  async function verESubir(id) {
    try {
      const r = await window.api.musicaAuto.paraSubir(id);
      q('#modalFabrica').close();
      await Subir.abrir(null, r.videos, { canalId: r.canalId, continuarAgenda: true, aoSubir: () => window.api.musicaAuto.aprovar(id) });
    } catch (e) {
      avisar(msgErro(e), true);
    }
  }

  async function carregar() {
    try {
      dados = await window.api.musicaAuto.resumo();
    } catch (e) {
      q('#fabMusica').innerHTML = `<p class="erro">${esc(msgErro(e))}</p>`;
      return;
    }
    render();
  }

  function mostrar() {
    if (!ligado) {
      ligado = true;
      // Atualiza sozinho enquanto trabalha (sem redesenhar a cada segundo)
      window.api.ao('musicaAuto:mudou', () => {
        if (q('#fabMusica').hidden || tRecarregar) return;
        tRecarregar = setTimeout(() => { tRecarregar = null; carregar(); }, 800);
      });
    }
    carregar();
  }

  return { mostrar };
})();
