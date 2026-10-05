/* Arrumar os vídeos que já estão no canal: categoria certa, idioma e títulos fracos.
   Primeiro só confere e mostra; nada muda no YouTube antes de clicar em "Aplicar". */
const Arrumar = (() => {
  const q = (s) => document.querySelector(s);
  const NOME_CATEGORIA = { 10: 'Música', 22: 'Pessoas e blogs', 27: 'Educação', 24: 'Entretenimento', 1: 'Filmes e animação' };
  let canal = null;
  let dados = null;
  let ligado = false;

  function ligar() {
    if (ligado) return;
    ligado = true;
    q('#btnArrAplicar').onclick = aplicar;
    window.api.ao('canais:progresso', (x) => {
      if (q('#modalArrumar').open) q('#arrNota').textContent = `Arrumando... ${Math.round(x * 100)}%`;
    });
  }

  function limpar() {
    q('#arrErro').textContent = '';
    q('#arrNota').textContent = '';
    q('#arrFichaLinha').hidden = true;
    q('#arrTitulosBox').hidden = true;
    q('#btnArrAplicar').hidden = true;
    q('#arrLista').innerHTML = '';
  }

  async function abrir(c) {
    ligar();
    canal = c;
    dados = null;
    limpar();
    q('#arrTitulo').textContent = `Arrumar vídeos de ${c.titulo}`;
    q('#arrResumo').textContent = 'Conferindo os vídeos do canal e pedindo títulos novos para a IA... (pode levar 1 minuto)';
    if (!q('#modalArrumar').open) q('#modalArrumar').showModal();
    try {
      dados = await window.api.canais.conferir(c.id);
      mostrar();
    } catch (e) {
      q('#arrResumo').textContent = '';
      q('#arrErro').textContent = msgErro(e);
    }
  }

  function mostrar() {
    const v = dados.videos;
    const ficha = v.filter((x) => x.arrumarFicha);
    const fracos = v.filter((x) => x.motivoTitulo);
    if (!ficha.length && !fracos.length) {
      q('#arrResumo').textContent = `${v.length} vídeos conferidos. Está tudo certo: categoria, idioma e títulos. Nada para arrumar.`;
      return;
    }
    q('#arrResumo').textContent = `${v.length} vídeos conferidos: ${ficha.length} com categoria ou idioma para arrumar e ${fracos.length} com título fraco. Nada muda no YouTube antes de você clicar em Aplicar.`;

    if (ficha.length) {
      const erradas = ficha.filter((x) => x.categoriaErrada);
      const de = [...new Set(erradas.map((x) => NOME_CATEGORIA[x.categoria] || `categoria ${x.categoria}`))].join(', ');
      const para = NOME_CATEGORIA[dados.categoriaCerta] || dados.categoriaCerta;
      const partes = [];
      if (erradas.length) partes.push(`${erradas.length} estão em "${de}" e vão para "${para}"`);
      const semIdioma = ficha.filter((x) => x.semIdioma).length;
      if (semIdioma) partes.push(`${semIdioma} estão sem idioma e ficam marcados como português`);
      q('#arrFichaTxt').textContent = `Corrigir categoria e idioma de ${ficha.length} vídeos (${partes.join('; ')})`;
      q('#arrFicha').checked = true;
      q('#arrFichaLinha').hidden = false;
    }

    if (fracos.length) {
      q('#arrTitulosQtd').textContent = `(${fracos.length})`;
      const lista = q('#arrLista');
      for (const x of fracos) {
        const l = document.createElement('div');
        l.className = 'arr-item';
        l.dataset.id = x.id;
        l.innerHTML = '<input type="checkbox" /><div><div class="antigo"></div><div class="motivo"></div></div><input type="text" maxlength="100" placeholder="Escreva o título novo" />';
        l.querySelector('.antigo').textContent = x.titulo;
        l.querySelector('.motivo').textContent = x.motivoTitulo;
        const txt = l.querySelector('input[type="text"]');
        const marca = l.querySelector('input[type="checkbox"]');
        txt.value = x.tituloNovo || '';
        marca.checked = !!x.tituloNovo;
        txt.oninput = () => (marca.checked = txt.value.trim().length >= 5);
        lista.appendChild(l);
      }
      q('#arrTitulosBox').hidden = false;
      if (dados.avisoIa) q('#arrErro').textContent = dados.avisoIa;
    }
    q('#btnArrAplicar').hidden = false;
    q('#arrNota').textContent = 'Se o YouTube parar no meio por causa do limite do dia, é só conferir de novo amanhã.';
  }

  async function aplicar() {
    const comFicha = !q('#arrFichaLinha').hidden && q('#arrFicha').checked;
    const titulos = {};
    document.querySelectorAll('#arrLista .arr-item').forEach((l) => {
      const novo = l.querySelector('input[type="text"]').value.trim();
      if (l.querySelector('input[type="checkbox"]').checked && novo.length >= 5) titulos[l.dataset.id] = novo;
    });
    const ids = new Set(Object.keys(titulos));
    if (comFicha) dados.videos.filter((x) => x.arrumarFicha).forEach((x) => ids.add(x.id));
    if (!ids.size) return (q('#arrErro').textContent = 'Marque pelo menos uma coisa para arrumar.');
    const nTit = Object.keys(titulos).length;
    if (!confirm(`Arrumar ${ids.size} vídeo(s) no YouTube${nTit ? `, trocando ${nTit} título(s)` : ''}?`)) return;
    const b = q('#btnArrAplicar');
    b.disabled = true;
    q('#arrErro').textContent = '';
    q('#arrNota').textContent = 'Arrumando...';
    try {
      const r = await window.api.canais.corrigir({
        id: canal.id,
        itens: [...ids].map((id) => ({ id, titulo: titulos[id] || '' })),
        categoria: comFicha ? dados.categoriaCerta : '',
        idioma: comFicha ? dados.idiomaCerto : '',
      });
      const falhou = new Set(r.falhas.map((f) => f.id));
      document.querySelectorAll('#arrLista .arr-item').forEach((l) => {
        if (r.feitos.includes(l.dataset.id)) l.classList.add('feito');
        if (falhou.has(l.dataset.id)) l.classList.add('falhou');
      });
      q('#arrNota').textContent = `${r.feitos.length} vídeo(s) arrumado(s).${r.falhas.length ? ` ${r.falhas.length} não deram certo.` : ''}`;
      const avisos = [r.parou, r.falhas[0] ? `Motivo da falha: ${r.falhas[0].erro}` : ''].filter(Boolean);
      q('#arrErro').textContent = avisos.join(' ');
      if (!r.parou && !r.falhas.length) {
        b.hidden = true;
        q('#arrFichaLinha').hidden = true;
        avisar(`${r.feitos.length} vídeos arrumados no YouTube`);
      }
    } catch (e) {
      q('#arrNota').textContent = '';
      q('#arrErro').textContent = msgErro(e);
    } finally {
      b.disabled = false;
    }
  }

  return { abrir };
})();
