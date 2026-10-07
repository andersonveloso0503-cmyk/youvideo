/* Arrumar os vídeos que já estão no canal: categoria certa, idioma, títulos fracos e etiquetas de outro estilo.
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
    q('#btnArrRep').onclick = desprogramar;
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
    q('#arrRepBox').hidden = true;
    q('#arrRepLista').innerHTML = '';
    q('#arrRepNota').textContent = '';
    q('#arrTagsBox').hidden = true;
    q('#arrTagsLista').innerHTML = '';
  }

  // Vídeos com etiquetas de outro estilo de música: mostra quais saem de cada um
  function mostrarEtiquetas() {
    const com = dados.videos.filter((x) => x.tagsErradas && x.tagsErradas.length);
    if (!com.length) return 0;
    const lista = q('#arrTagsLista');
    for (const x of com) {
      const l = document.createElement('label');
      l.className = 'arr-item arr-tag';
      l.dataset.id = x.id;
      l.innerHTML = '<input type="checkbox" checked /><div><div class="titulo"></div><div class="saem"></div></div>';
      l.querySelector('.titulo').textContent = x.titulo;
      l.querySelector('.saem').textContent = `Saem: ${x.tagsErradas.join(', ')}`;
      lista.appendChild(l);
    }
    q('#arrTagsQtd').textContent = `(${com.length})`;
    q('#arrTagsBox').hidden = false;
    return com.length;
  }

  // Vídeos longos ainda programados com a mesma duração = mesmas músicas em outra ordem.
  // Devolve os grupos com 3 ou mais (até 2 por conjunto é o recomendado), em ordem de data.
  function gruposRepetidos(videos) {
    const agora = Date.now();
    const prog = videos
      .filter((v) => v.privacidade === 'private' && v.agendadoPara && new Date(v.agendadoPara).getTime() > agora && v.duracaoSeg >= 300)
      .sort((a, b) => a.duracaoSeg - b.duracaoSeg);
    const grupos = [];
    for (const v of prog) {
      const ultimo = grupos[grupos.length - 1];
      // 1 segundo de folga: o YouTube arredonda a duração
      if (ultimo && v.duracaoSeg - ultimo[ultimo.length - 1].duracaoSeg <= 1) ultimo.push(v);
      else grupos.push([v]);
    }
    return grupos.filter((g) => g.length >= 3).map((g) => g.sort((a, b) => String(a.agendadoPara).localeCompare(String(b.agendadoPara))));
  }
  const minSeg = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function mostrarRepetidos() {
    const grupos = gruposRepetidos(dados.videos);
    if (!grupos.length) return 0;
    const lista = q('#arrRepLista');
    let total = 0;
    for (const g of grupos) {
      total += g.length;
      const cab = document.createElement('p');
      cab.className = 'arr-grupo';
      cab.textContent = `${g.length} vídeos de ${minSeg(g[0].duracaoSeg)} — ficam o primeiro e o último; os do meio saem`;
      lista.appendChild(cab);
      g.forEach((v, k) => {
        const fica = k === 0 || k === g.length - 1; // os dois mais afastados no calendário
        const l = document.createElement('label');
        l.className = 'arr-item arr-rep';
        l.dataset.id = v.id;
        l.innerHTML = '<input type="checkbox" /><div><div class="titulo"></div><div class="quando"></div></div>';
        l.querySelector('input').checked = !fica;
        l.querySelector('.titulo').textContent = v.titulo;
        l.querySelector('.quando').textContent = `Programado para ${dataHora(v.agendadoPara)}`;
        l.querySelector('input').onchange = contarRepetidos;
        lista.appendChild(l);
      });
    }
    q('#arrRepQtd').textContent = `(${total})`;
    q('#arrRepBox').hidden = false;
    contarRepetidos();
    return total;
  }
  function contarRepetidos() {
    const todos = document.querySelectorAll('#arrRepLista .arr-rep');
    const saem = [...todos].filter((l) => l.querySelector('input').checked && !l.classList.contains('feito')).length;
    q('#btnArrRep').textContent = saem ? `📅 Tirar ${saem} vídeo(s) da programação` : '📅 Nenhum marcado';
    q('#btnArrRep').disabled = !saem;
  }

  async function desprogramar() {
    const ids = [...document.querySelectorAll('#arrRepLista .arr-rep')].filter((l) => l.querySelector('input').checked && !l.classList.contains('feito')).map((l) => l.dataset.id);
    if (!ids.length) return;
    if (!confirm(`Tirar ${ids.length} vídeo(s) da programação?\n\nEles continuam no canal como privados, sem data, e não vão ao ar. Nada é apagado: dá para programar de novo depois pelo YouTube Studio.`)) return;
    const b = q('#btnArrRep');
    b.disabled = true;
    q('#arrRepNota').textContent = 'Tirando da programação...';
    try {
      const r = await window.api.canais.desprogramar({ id: canal.id, ids });
      const falhou = new Map(r.falhas.map((f) => [f.id, f.erro]));
      document.querySelectorAll('#arrRepLista .arr-rep').forEach((l) => {
        if (r.feitos.includes(l.dataset.id)) {
          l.classList.add('feito');
          l.querySelector('.quando').textContent = '✓ Saiu da programação (ficou privado, sem data)';
          l.querySelector('input').disabled = true;
        }
        if (falhou.has(l.dataset.id)) {
          l.classList.add('falhou');
          l.querySelector('.quando').textContent = `Não deu: ${falhou.get(l.dataset.id)}`;
        }
      });
      q('#arrRepNota').textContent = `${r.feitos.length} vídeo(s) fora da programação.${r.falhas.length ? ` ${r.falhas.length} não deram certo.` : ''}${r.parou ? ` ${r.parou}` : ''}`;
      if (r.feitos.length) avisar(`${r.feitos.length} vídeos saíram da programação`);
    } catch (e) {
      q('#arrRepNota').textContent = msgErro(e);
    } finally {
      contarRepetidos();
    }
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
    const repetidos = mostrarRepetidos();
    const etiquetas = mostrarEtiquetas();
    if (!ficha.length && !fracos.length && !etiquetas) {
      q('#arrResumo').textContent = repetidos
        ? `${v.length} vídeos conferidos. Categoria, idioma, títulos e etiquetas estão certos. Achei ${repetidos} vídeos repetidos na programação (veja abaixo).`
        : `${v.length} vídeos conferidos. Está tudo certo: categoria, idioma, títulos, etiquetas e programação. Nada para arrumar.`;
      return;
    }
    const achados = [
      ficha.length && `${ficha.length} com categoria ou idioma para arrumar`,
      fracos.length && `${fracos.length} com título fraco`,
      etiquetas && `${etiquetas} com etiquetas que não são do vídeo`,
      repetidos && `${repetidos} repetidos na programação`,
    ].filter(Boolean);
    q('#arrResumo').textContent = `${v.length} vídeos conferidos: ${achados.join(', ')}. Nada muda no YouTube antes de você clicar.`;

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
    const comEtiqueta = new Set(
      [...document.querySelectorAll('#arrTagsLista .arr-tag')].filter((l) => l.querySelector('input').checked && !l.classList.contains('feito')).map((l) => l.dataset.id)
    );
    comEtiqueta.forEach((id) => ids.add(id));
    if (comFicha) dados.videos.filter((x) => x.arrumarFicha).forEach((x) => ids.add(x.id));
    if (!ids.size) return (q('#arrErro').textContent = 'Marque pelo menos uma coisa para arrumar.');
    const nTit = Object.keys(titulos).length;
    if (!confirm(`Arrumar ${ids.size} vídeo(s) no YouTube${nTit ? `, trocando ${nTit} título(s)` : ''}${comEtiqueta.size ? `, tirando as etiquetas que não são do vídeo de ${comEtiqueta.size}` : ''}?`)) return;
    const b = q('#btnArrAplicar');
    b.disabled = true;
    q('#arrErro').textContent = '';
    q('#arrNota').textContent = 'Arrumando...';
    try {
      const r = await window.api.canais.corrigir({
        id: canal.id,
        itens: [...ids].map((id) => ({ id, titulo: titulos[id] || '', etiquetas: comEtiqueta.has(id) })),
        categoria: comFicha ? dados.categoriaCerta : '',
        idioma: comFicha ? dados.idiomaCerto : '',
      });
      const falhou = new Set(r.falhas.map((f) => f.id));
      document.querySelectorAll('#arrLista .arr-item').forEach((l) => {
        if (r.feitos.includes(l.dataset.id)) l.classList.add('feito');
        if (falhou.has(l.dataset.id)) l.classList.add('falhou');
      });
      document.querySelectorAll('#arrTagsLista .arr-tag').forEach((l) => {
        if (!comEtiqueta.has(l.dataset.id)) return;
        if (r.feitos.includes(l.dataset.id)) {
          l.classList.add('feito');
          l.querySelector('input').disabled = true;
          l.querySelector('.saem').textContent = '✓ Etiquetas retiradas';
        }
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
