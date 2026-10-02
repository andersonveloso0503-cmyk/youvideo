/* Fábrica de Shorts: a IA escolhe os temas, o site cria (roteiro, voz, imagens, animação),
   o PC monta e cada vídeo é agendado sozinho: YouTube pelo PC, Facebook/Instagram pela nuvem,
   TikTok/Kwai na página do celular. */
const Fabrica = (() => {
  const q = (s) => document.querySelector(s);
  let ligado = false;
  let marca = ''; // '' = histórias bíblicas; 'lcs' = vídeos de divulgação da LCS
  const NOTAS = {
    '': 'A IA escolhe os temas, o site cria roteiro, voz e imagens, o seu PC monta, e cada vídeo é agendado sozinho nas redes. Alterna <b>história animada</b> e <b>narrado realista</b>, sem repetir tema.',
    lcs: 'Vídeos curtos (cerca de 30 s) divulgando a <b>LCS Terceirização</b>: a IA escolhe o assunto (limpeza, portaria, zeladoria; condomínios e empresas), escreve o roteiro, narra, cria as imagens, o seu PC monta com o WhatsApp da LCS na tela, e cada um é publicado sozinho na <b>Página e no Instagram da LCS</b>.',
  };

  function trocarMarca(nova) {
    marca = nova;
    document.querySelectorAll('#fabMarcaAbas button').forEach((b) => b.classList.toggle('ativo', (b.dataset.marca || '') === marca));
    q('#fabNota').innerHTML = NOTAS[marca];
    q('#fabConfigLcs').hidden = marca !== 'lcs';
    q('#fabConfigBiblia').hidden = marca === 'lcs';
    document.querySelectorAll('#modalFabrica .so-biblia').forEach((el) => (el.hidden = marca === 'lcs'));
    custo();
    carregar();
  }

  const ETAPA = {
    pendente: 'Na fila: escrevendo roteiro',
    roteiro_ok: 'Gerando a voz',
    voz_ok: 'Gerando as imagens',
    imagens_ok: 'Animando as cenas',
    animando: 'Animando as cenas',
    montando: 'Montando no PC',
    concluido: 'Pronto e agendado',
    erro: 'Erro',
  };
  // Custo aproximado por Short de 1 min (imagens + voz + animação)
  const CUSTO = { animado: 1.3, parado: 0.45 };

  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const quandoTxt = (iso) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  function prefs() {
    return config.fabricaPrefs || {};
  }
  function salvarPrefs() {
    const p = {
      dias: q('#fabDias').value, porDia: q('#fabPorDia').value, hora1: q('#fabHora1').value, hora2: q('#fabHora2').value,
      animacao: q('#fabAnimacao').value, canal: q('#fabCanal').value, formato: q('#fabFormato').value,
      redes: { youtube: q('#fabYoutube').checked, facebook: q('#fabFacebook').checked, instagram: q('#fabInstagram').checked, tiktok: q('#fabTiktok').checked, kwai: q('#fabKwai').checked },
    };
    config.fabricaPrefs = p;
    window.api.config.salvar({ fabricaPrefs: p }).catch(() => {});
  }

  function custo() {
    if (marca === 'lcs') {
      const qtd = Number(q('#fabSemanas').value) * q('#fabDiasSemana').value.split(',').length;
      q('#fabCusto').textContent = `${qtd} vídeos · custo aproximado US$ ${(qtd * 0.35).toFixed(0)} (imagens e voz)`;
      return;
    }
    const n = Number(q('#fabDias').value) * Number(q('#fabPorDia').value);
    const anim = q('#fabAnimacao').value;
    const animados = anim === 'tudo' ? n : anim === 'nada' ? 0 : Math.ceil(n / 2);
    const total = animados * CUSTO.animado + (n - animados) * CUSTO.parado;
    q('#fabCusto').textContent = `${n} Shorts · custo aproximado US$ ${total.toFixed(0)} (imagens, voz e animação)`;
  }

  function preencherCanais() {
    const sel = q('#fabCanal');
    const lista = typeof canais !== 'undefined' ? canais : [];
    sel.innerHTML = lista.length
      ? lista.map((c) => `<option value="${esc(c.id)}">${esc(c.titulo)}</option>`).join('')
      : '<option value="">Nenhum canal conectado (Contas YouTube)</option>';
    const p = prefs();
    if (p.canal && lista.some((c) => c.id === p.canal)) sel.value = p.canal;
  }

  function ligar() {
    if (ligado) return;
    ligado = true;
    const p = prefs();
    if (p.dias) q('#fabDias').value = p.dias;
    if (p.porDia) q('#fabPorDia').value = p.porDia;
    if (p.hora1) q('#fabHora1').value = p.hora1;
    if (p.hora2) q('#fabHora2').value = p.hora2;
    if (p.animacao) q('#fabAnimacao').value = p.animacao;
    if (p.formato != null) q('#fabFormato').value = p.formato;
    for (const [r, id] of [['youtube', '#fabYoutube'], ['facebook', '#fabFacebook'], ['instagram', '#fabInstagram'], ['tiktok', '#fabTiktok'], ['kwai', '#fabKwai']]) {
      if (p.redes && r in p.redes) q(id).checked = !!p.redes[r];
    }
    ['#fabDias', '#fabPorDia', '#fabHora1', '#fabHora2', '#fabAnimacao', '#fabFormato', '#fabCanal', '#fabYoutube', '#fabFacebook', '#fabInstagram', '#fabTiktok', '#fabKwai'].forEach((id) =>
      q(id).addEventListener('change', () => {
        salvarPrefs();
        custo();
        q('#fabHora2').disabled = q('#fabPorDia').value === '1';
      })
    );
    document.querySelectorAll('#fabMarcaAbas button').forEach((b) => (b.onclick = () => trocarMarca(b.dataset.marca || '')));
    ['#fabSemanas', '#fabDiasSemana', '#fabHoraLcs'].forEach((id) => q(id).addEventListener('change', custo));
    q('#btnFabCriar').onclick = criar;
    q('#btnFabAtualizar').onclick = carregar;
  }

  async function criar() {
    const erro = q('#fabErro');
    erro.textContent = '';
    if (!config.temCentral) return (erro.textContent = 'Cadastre a senha da Central em Configurações.');
    if (marca === 'lcs') return criarEmpresa(erro);
    const redes = {
      youtube: q('#fabYoutube').checked, facebook: q('#fabFacebook').checked, instagram: q('#fabInstagram').checked,
      tiktok: q('#fabTiktok').checked, kwai: q('#fabKwai').checked,
    };
    if (!Object.values(redes).some(Boolean)) return (erro.textContent = 'Marque pelo menos uma rede.');
    const canalId = q('#fabCanal').value;
    if (redes.youtube && !canalId) return (erro.textContent = 'Conecte um canal em Contas YouTube (ou desmarque o YouTube).');
    const n = Number(q('#fabDias').value) * Number(q('#fabPorDia').value);
    if (!confirm(`Criar ${n} Shorts? ${q('#fabCusto').textContent.split('·')[1] || ''}\nA IA escolhe os temas e eles já ficam agendados.`)) return;
    const b = q('#btnFabCriar');
    b.disabled = true;
    b.textContent = '🏭 A IA está escolhendo os temas...';
    try {
      const canal = (typeof canais !== 'undefined' ? canais : []).find((c) => c.id === canalId);
      const r = await window.api.fabrica.criar({
        dias: Number(q('#fabDias').value),
        porDia: Number(q('#fabPorDia').value),
        horarios: [q('#fabHora1').value, q('#fabHora2').value],
        animacao: q('#fabAnimacao').value,
        series: q('#fabFormato').value !== '0',
        partes: Number(q('#fabFormato').value) || 3,
        redes,
        canalYoutube: redes.youtube && canal ? { id: canal.id, titulo: canal.titulo } : null,
      });
      avisar(`${r.criados.length} Shorts na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      carregar();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🏭 Criar lote';
    }
  }

  async function criarEmpresa(erro) {
    const redes = { facebook: q('#fabFacebook').checked, instagram: q('#fabInstagram').checked };
    if (!redes.facebook && !redes.instagram) return (erro.textContent = 'Marque Facebook ou Instagram.');
    const diasSemana = q('#fabDiasSemana').value.split(',').map(Number);
    const qtd = Number(q('#fabSemanas').value) * diasSemana.length;
    if (!confirm(`Criar ${qtd} vídeos de divulgação da LCS? ${q('#fabCusto').textContent.split('·')[1] || ''}\nA IA escolhe os assuntos e eles já ficam agendados na Página e no Instagram da LCS.`)) return;
    const b = q('#btnFabCriar');
    b.disabled = true;
    b.textContent = '🏭 A IA está escolhendo os assuntos...';
    try {
      const r = await window.api.fabrica.criar({ marca: 'lcs', semanas: Number(q('#fabSemanas').value), diasSemana, horarios: [q('#fabHoraLcs').value], redes });
      avisar(`${r.criados.length} vídeos da LCS na fábrica, a partir de ${new Date(r.primeiroDia + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      carregar();
    } catch (e) {
      erro.textContent = msgErro(e);
    } finally {
      b.disabled = false;
      b.textContent = '🏭 Criar lote';
    }
  }

  function seloYoutube(i) {
    if (!i.redes?.youtube) return '';
    const y = i.youtube;
    if (!y) return `<span class="fab-yt">▶ YouTube${i.quandoYoutube ? ` ${esc(quandoTxt(i.quandoYoutube))}` : ''}: depois de pronto</span>`;
    if (y.status === 'ok') return `<a class="fab-yt ok" data-link="${esc(y.url || '')}">▶ YouTube agendado ✅</a>`;
    if (y.status === 'erro') return `<a class="fab-yt erro" data-repetir-yt="${esc(i.id)}" title="${esc(y.erro || '')}">▶ YouTube: erro — ${esc(String(y.erro || 'sem detalhe').slice(0, 110))} (clique p/ tentar de novo)</a>`;
    if (y.status === 'enviando') return '<span class="fab-yt">▶ YouTube: subindo pelo PC...</span>';
    return '<span class="fab-yt">▶ YouTube: esperando o PC subir</span>';
  }

  async function carregar() {
    const box = q('#fabLista');
    try {
      const { itens: todos = [] } = await window.api.fabrica.listar();
      const itens = todos.filter((i) => (i.marca || '') === marca); // cada aba mostra só os seus
      if (!itens.length) {
        box.innerHTML = '<p class="nota">Nenhum vídeo na fábrica ainda. Escolha os dias e clique em "Criar lote".</p>';
        return;
      }
      const prontos = itens.filter((i) => i.status === 'concluido').length;
      const erros = itens.filter((i) => i.status === 'erro').length;
      box.innerHTML = `<p class="nota">${itens.length} vídeos · ${prontos} prontos · ${itens.length - prontos - erros} em produção${erros ? ` · <b style="color:var(--terracota)">${erros} com erro</b>` : ''}. A fábrica anda sozinha a cada 5 min (o PC precisa estar com o app aberto para montar).</p>`;
      let dia = '';
      for (const i of itens) {
        const d = new Date(i.quando).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
        if (d !== dia) {
          dia = d;
          box.insertAdjacentHTML('beforeend', `<h4 class="fab-dia">${esc(d)}</h4>`);
        }
        const redes = ['facebook', 'instagram', 'tiktok', 'kwai'].filter((r) => i.redes?.[r]).map((r) => ({ facebook: 'FB', instagram: 'IG', tiktok: 'TikTok', kwai: 'Kwai' })[r]).join(' · ');
        const l = document.createElement('div');
        l.className = `fab-item st-${i.status}`;
        l.innerHTML = `
          <span class="hora">${esc(new Date(i.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</span>
          <span class="tipo" title="${i.marca ? 'Divulgação da empresa' : i.animar ? 'Animado' : 'Imagens com zoom'}">${i.marca ? '🏢' : i.estilo === 'desenho' ? '🎨' : '🎥'}${i.animar && !i.marca ? '✨' : ''}</span>
          <span class="txt"><b></b><small></small></span>
          <span class="acoes"></span>`;
        l.querySelector('b').textContent = i.titulo || (i.serie ? `${i.serie.nome} (Parte ${i.serie.parte}/${i.serie.total})` : i.tema);
        l.querySelector('small').innerHTML = `${esc(i.status === 'erro' ? `Erro: ${i.erro || ''}` : ETAPA[i.status] || i.status)} · ${esc(redes)} ${seloYoutube(i)}`;
        const acoes = l.querySelector('.acoes');
        const botao = (txt, titulo, fn) => {
          const bt = document.createElement('button');
          bt.className = 'btn-mini';
          bt.textContent = txt;
          bt.title = titulo;
          bt.onclick = fn;
          acoes.appendChild(bt);
        };
        if (i.videoUrl) botao('▶', 'Assistir', () => window.api.abrir.link(i.videoUrl));
        if (i.status === 'erro') botao('↻', 'Tentar de novo (continua de onde parou)', async () => { await window.api.fabrica.acao({ id: i.id, acao: 'repetir' }); carregar(); });
        botao('🗑', i.status === 'concluido' ? 'Tirar da fábrica e da agenda das redes' : 'Cancelar este vídeo', async () => {
          if (!confirm(`Tirar "${i.titulo || i.tema}" da fábrica?`)) return;
          await window.api.fabrica.acao({ id: i.id, acao: 'cancelar' });
          carregar();
        });
        l.querySelectorAll('[data-link]').forEach((a) => a.dataset.link && (a.onclick = () => window.api.abrir.link(a.dataset.link)));
        l.querySelectorAll('[data-repetir-yt]').forEach((a) => (a.onclick = async () => { await window.api.fabrica.acao({ id: i.id, acao: 'youtube-repetir' }); carregar(); }));
        box.appendChild(l);
      }
    } catch (e) {
      box.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'erro';
      p.textContent = msgErro(e);
      box.appendChild(p);
    }
  }

  function abrir() {
    ligar();
    preencherCanais();
    q('#fabHora2').disabled = q('#fabPorDia').value === '1';
    custo();
    if (!q('#modalFabrica').open) q('#modalFabrica').showModal();
    carregar();
    window.api.creditos.ler().then((c) => {
      if (!c?.itens?.length) return;
      const txt = c.itens.map((i) => `${i.nivel === 'ok' ? '' : '⚠ '}${i.nome.split(' ')[0]}: ${i.texto}`).join(' · ');
      q('#fabCusto').textContent = `${q('#fabCusto').textContent.split(' | ')[0]} | Créditos: ${txt}`;
    }).catch(() => {});
  }

  return { abrir };
})();
