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
  const nomeMotor = (m) => (m === 'lyria' ? 'Google Lyria' : m === 'pasta' ? 'Da sua pasta' : 'ElevenLabs');

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
        <div class="campo-config"><label>De onde vêm as músicas</label><select class="fm-fonte">
          <option value="pasta" ${p.fonte === 'pasta' ? 'selected' : ''}>Da minha pasta (fiz no Nuivi / Suno)</option>
          <option value="ia" ${p.fonte !== 'pasta' ? 'selected' : ''}>A IA cria (ElevenLabs / Lyria)</option>
        </select></div>
        ${p.fonte === 'pasta' ? blocoPasta(canal) : `
        <div class="fm-estilos-tit">Estilos (alterna um por dia) ${todos ? '<small>— todos</small>' : ''}</div>
        <div class="fm-estilos">${doGrupo
          .map((x) => `<button type="button" class="chip-estilo ${todos || marcados.has(x.id) ? 'on' : ''}" data-id="${esc(x.id)}">${esc(x.nome)}</button>`)
          .join('') || '<span class="nota">Sem internet para ler os estilos.</span>'}</div>`}
        ${dados.pulos?.[canal] ? `<div class="fm-pulo">⏭ ${esc(dados.pulos[canal].texto)}</div>` : ''}
        <button class="btn-mini destaque fm-agora">▶ Fazer um álbum agora</button>
      </div>`;
  }

  // Modo pasta: mostra quantas músicas estão esperando, por estilo (cada subpasta é um estilo)
  function blocoPasta(canal) {
    const pa = dados.pastas?.[canal] || { grupos: [], total: 0 };
    const qtd = dados.prefs.qtd;
    const grupos = pa.grupos.length
      ? pa.grupos.map((g) => `<span class="chip-estilo ${g.n >= qtd ? 'on' : ''}" title="${g.n >= qtd ? 'Dá um álbum' : `Faltam ${qtd - g.n} para um álbum`}">${esc(g.nome)}: ${g.n}</span>`).join('')
      : '<span class="nota">Nenhuma música na pasta ainda.</span>';
    return `
        <div class="fm-estilos-tit">Músicas esperando na pasta (cada subpasta é um estilo; ${qtd} do mesmo estilo = 1 álbum)</div>
        <div class="fm-estilos">${grupos}</div>
        <div class="nota fm-caminho" title="${esc(pa.raiz || '')}">📁 ${esc(pa.raiz || '')}</div>
        <div class="linha-botoes"><button class="btn-mini fm-abrir-pasta">📂 Abrir a pasta</button><button class="btn-mini fm-trocar-pasta">Trocar pasta</button></div>`;
  }

  function cartaoAlbum(a) {
    const acoes = [];
    if (a.fase === 'pronto') acoes.push(`<button class="btn-primario fm-subir" data-id="${a.id}">👀 Ver e subir</button>`);
    if (a.fase === 'erro') acoes.push(`<button class="btn-mini destaque fm-de-novo" data-id="${a.id}">↻ Tentar de novo</button>`);
    // Capa simples (o Gemini não conseguiu): o álbum segue mesmo assim; dá para refazer a capa depois
    // Aparecem em todo álbum que não está trabalhando agora (antes só com capa pronta — e o álbum que
    // parou justamente na capa ficava sem os botões)
    if (!['trabalhando', 'na vez'].includes(a.fase)) {
      acoes.push(`<button class="btn-mini fm-prompt-capa" data-id="${a.id}" title="Copia o pedido da capa para você fazer no Gemini (app ou gemini.google.com)">📝 Prompt da capa</button>`);
      acoes.push(`<button class="btn-mini fm-usar-capa" data-id="${a.id}" title="Escolhe a imagem que você fez no Gemini (ou no Canva) e usa como capa">📥 Trazer capa</button>`);
    }
    if (!['trabalhando', 'na vez'].includes(a.fase)) acoes.push(`<button class="btn-mini ${a.capaSimples ? 'destaque' : ''} fm-refazer-capa" data-id="${a.id}" title="Faz a capa de novo no Gemini">🎨 ${a.capaSimples ? 'Refazer capa' : 'Outra capa'}</button>`);
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
          ${a.fundo === 'animado' ? '<div class="nota">🎬 Vídeo com fundo animado (cena que se mexe)</div>' : a.fundo === 'parado' ? '<div class="nota">🖼 Fundo com a cena parada (a animação não ficou pronta a tempo)</div>' : a.fundo === 'erro' ? `<div class="nota" style="color:var(--terracota)">⚠ O fundo animado não saiu${a.fundoErro ? ` (${esc(a.fundoErro.slice(0, 100))})` : ''}: o vídeo usou a capa parada</div>` : ''}
          ${a.capaSimples ? `<div class="nota" style="color:var(--terracota)">⚠ Capa simples: o Gemini não conseguiu fazer a capa${a.capaErro ? ` (${esc(a.capaErro.slice(0, 120))})` : ''}. O álbum seguiu mesmo assim — depois use 🎨 Refazer capa, ou 📝 Prompt da capa para fazer no Gemini e 📥 Trazer capa.</div>` : ''}
          ${a.recusadas ? `<div class="nota">🎧 ${a.recusadas} música${a.recusadas > 1 ? 's foram refeitas' : ' foi refeita'} porque a letra não ficou clara</div>` : ''}
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
        <div class="campo-config"><label>Músicas por álbum</label><select id="fmQtd">${[5, 8, 10, 12, 15, 18, 20].map((n) => `<option ${n === p.qtd ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="campo-config"><label>Não fazer se já tiver vídeo longo agendado para</label><select id="fmFolga">${[2, 3, 5, 7, 14].map((n) => `<option value="${n}" ${n === p.folgaDias ? 'selected' : ''}>${n} dias ou mais</option>`).join('')}</select></div>
        <div class="campo-config"><label>Fundo do vídeo longo</label><select id="fmFundo"><option value="1" ${p.fundoAnimado !== false ? 'selected' : ''}>Cena desenhada que se mexe (~US$ 0,50)</option><option value="0" ${p.fundoAnimado === false ? 'selected' : ''}>Só a capa parada</option></select></div>
        <div class="campo-config"><label>Tamanho do vídeo longo</label><select id="fmLongo" title="Repete as músicas do álbum em outra ordem até chegar no tempo (quem assiste na TV deixa tocando)">${[[0, 'Só o álbum'], [60, '~1 hora'], [90, '~1h30'], [120, '~2 horas']].map(([v, t]) => `<option value="${v}" ${Number(p.longoMin || 0) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
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
    const ativos = ['gospel', 'normal'].filter((c) => p[c].ativo && p[c].fonte !== 'pasta').length;
    const daPasta = ['gospel', 'normal'].filter((c) => p[c].fonte === 'pasta');
    if (daPasta.length === 2 || (daPasta.length && !ativos)) {
      q('#fmCusto').innerHTML = `Com as músicas da sua pasta, o Compilador só faz a <b>capa no Gemini</b> (centavos), o vídeo longo${p.shorts ? ` e ${p.shorts} Short${p.shorts > 1 ? 's' : ''}` : ''}. Crie as músicas no Nuivi, baixe e coloque na pasta do canal — de preferência numa subpasta com o nome do estilo (ex.: <b>Pagode Gospel</b>), que vira o tema da capa. As usadas vão para a subpasta "Usadas". Nada sobe sozinho: você aprova em <b>Ver e subir</b>.`;
      return;
    }
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
      el.querySelector('.fm-fonte').onchange = async (e) => { await salvar({ [canal]: { fonte: e.target.value } }); carregar(); };
      const abrir = el.querySelector('.fm-abrir-pasta');
      if (abrir) abrir.onclick = () => window.api.musicaAuto.abrirPasta(canal).then(() => setTimeout(carregar, 1500)).catch((er) => avisar(msgErro(er), true));
      const trocar = el.querySelector('.fm-trocar-pasta');
      if (trocar) trocar.onclick = async () => { if (await window.api.musicaAuto.escolherPasta(canal)) carregar(); };
      el.querySelectorAll('.fm-estilos button.chip-estilo').forEach((b) => {
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
        const daPasta = p[canal].fonte === 'pasta';
        if (daPasta && !(dados.pastas?.[canal]?.grupos || []).some((g) => g.n >= p.qtd)) return avisar(`Faltam músicas na pasta: precisa de ${p.qtd} do mesmo estilo`, true);
        if (daPasta && !confirm(`${agendaTxt}\n\nFazer agora um álbum com ${p.qtd} músicas da sua pasta para ${NOME_CANAL[canal]}?\n\nO Compilador faz a capa no Gemini, o vídeo longo e os Shorts. As músicas usadas vão para a subpasta "Usadas".\n\nNada sobe para o YouTube sem você aprovar.`)) return;
        if (!daPasta && !confirm(`${agendaTxt}\n\nFazer agora um álbum de ${p.qtd} músicas cantadas para ${NOME_CANAL[canal]}?\n\nMotor de hoje: ${[3, 6].includes(new Date().getDay()) ? `ElevenLabs (~R$ ${Math.round(p.qtd * 4)})` : `Google Lyria (~R$ ${Math.round(p.qtd * 0.75)})`}. Leva uns 20 a 40 minutos, mais a montagem dos vídeos.\n\nNada sobe para o YouTube sem você aprovar.`)) return;
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
    q('#fmFundo').onchange = (e) => salvar({ fundoAnimado: e.target.value === '1' });
    q('#fmShorts').onchange = async (e) => { await salvar({ shorts: Number(e.target.value) }); custo(); };
    q('#fmLongo').onchange = async (e) => { await salvar({ longoMin: Number(e.target.value) }); custo(); };
    document.querySelectorAll('#fabMusica .fm-subir').forEach((b) => (b.onclick = () => verESubir(b.dataset.id)));
    document.querySelectorAll('#fabMusica .fm-prompt-capa').forEach((b) => (b.onclick = async () => {
      try {
        const texto = await window.api.musicaAuto.promptCapa(b.dataset.id);
        // Mostra numa janela (antes só copiava em silêncio e parecia que nada acontecia)
        let d = document.getElementById('dlgPromptCapa');
        if (!d) {
          d = document.createElement('dialog');
          d.id = 'dlgPromptCapa';
          d.style.cssText = 'max-width:760px;width:92vw;max-height:86vh;overflow:auto;border:none;border-radius:16px;padding:22px';
          document.body.appendChild(d);
        }
        d.innerHTML =
          '<h3 style="margin-top:0">📝 Prompt da capa</h3>' +
          '<p class="nota">1) Clique em <b>Copiar</b>. 2) Clique em <b>Abrir o Gemini</b> e cole lá (Ctrl+V). 3) Baixe a imagem. 4) Volte aqui e clique em <b>📥 Trazer capa</b> no álbum.</p>' +
          `<textarea id="txtPromptCapa" readonly style="width:100%;height:44vh;font-size:12.5px">${esc(texto)}</textarea>` +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn-primario" id="btnPcCopiar">📋 Copiar</button><button type="button" class="btn-mini" id="btnPcGemini">🌐 Abrir o Gemini</button><button type="button" class="btn-mini" id="btnPcFechar">Fechar</button></div>';
        const copiar = async () => {
          try {
            await navigator.clipboard.writeText(texto);
          } catch {
            const t = d.querySelector('#txtPromptCapa');
            t.focus();
            t.select();
            document.execCommand('copy');
          }
          d.querySelector('#btnPcCopiar').textContent = '✓ Copiado';
        };
        d.querySelector('#btnPcCopiar').onclick = copiar;
        d.querySelector('#btnPcGemini').onclick = () => window.api.abrir.link('https://gemini.google.com/app');
        d.querySelector('#btnPcFechar').onclick = () => d.close();
        if (!d.open) d.showModal();
      } catch (e) {
        avisar(msgErro(e), true);
      }
    }));
    document.querySelectorAll('#fabMusica .fm-usar-capa').forEach((b) => (b.onclick = async () => {
      try {
        const arquivo = await window.api.envio.escolherCapa();
        if (!arquivo) return;
        const r = await window.api.musicaAuto.usarCapa({ id: b.dataset.id, arquivo });
        avisar(r?.noYoutube ? 'Capa trocada — e já trocada no YouTube' : 'Capa trocada — ela vai como thumbnail quando o álbum subir');
      } catch (e) {
        avisar(msgErro(e), true);
      }
    }));
    document.querySelectorAll('#fabMusica .fm-refazer-capa').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      b.textContent = '🎨 Fazendo...';
      try {
        const r = await window.api.musicaAuto.refazerCapa(b.dataset.id);
        avisar(r?.noYoutube ? 'Capa nova pronta e trocada no YouTube' : 'Capa nova pronta — ela vai como thumbnail quando o álbum subir');
      } catch (e) {
        avisar(msgErro(e), true);
      }
    }));
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
