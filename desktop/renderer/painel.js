// Painel: a tela principal do Compilador (aprovada pelo dono na prévia de 11/11).
// Mostra só o que precisa de atenção hoje: vídeos para aprovar (com conferência e nota), o que sobe nas próximas 24 h,
// o que os PCs estão fazendo, avisos (créditos, login do Studio, versão), números dos canais na semana,
// desempenho dos últimos Shorts, comentários para responder e a agenda. As ferramentas pouco usadas ficam em
// "Mais ferramentas" (nada foi apagado: os mesmos botões de antes, só fora da frente).
const Painel = (() => {
  const q = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (n) => (n == null ? '–' : Number(n).toLocaleString('pt-BR'));
  const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  const quando = (iso) => {
    if (!iso) return 'sem horário';
    const d = new Date(iso);
    const hoje = new Date();
    const amanha = new Date(Date.now() + 86400e3);
    const dia = d.toDateString() === hoje.toDateString() ? 'hoje' : d.toDateString() === amanha.toDateString() ? 'amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    return `${dia} ${hora(iso)}`;
  };
  const TIPO = { games: 'Games', politica: 'Política', brasil: 'Brasil Inacreditável', documentario: 'Documentário' };
  let visivel = true;
  let ultimo = { aprovar: null, fabrica: null, dados: null, studio: [], creditos: null };
  let carregando = false;

  // ---------- navegação ----------
  function mostrar(sim) {
    visivel = sim;
    const tela = q('#telaPainel');
    tela.style.top = q('.topo').offsetHeight + 'px';
    tela.hidden = !sim;
    q('#btnPainel').classList.toggle('ativo-topo', sim);
    if (sim) {
      if (document.querySelector('#modos .modo.ativo')?.dataset.v === 'criar') modo('compilar'); // tira a janela do Criar da frente
      carregar();
    }
  }
  function modo(v) {
    const b = document.querySelector(`#modos .modo[data-v="${v}"]`);
    if (b) b.click();
  }
  function irParaFila() {
    mostrar(false);
    modo('compilar');
    setTimeout(() => q('.fila')?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60);
  }
  function abrirAprovar() {
    if (typeof Biblioteca !== 'undefined') Biblioteca.abrir({ recarregar: true, aba: 'aprovar' });
  }
  function fecharMenu() {
    q('#menuMais').hidden = true;
    q('#btnMais').setAttribute('aria-expanded', 'false');
  }

  // ---------- desenho ----------
  function resumo() {
    const ap = ultimo.aprovar || [];
    const comAviso = ap.filter((i) => i.conferencia && !['pendente', 'conferindo'].includes(i.conferencia.status) && (i.conferencia.etapas || []).some((e) => !e.ok)).length;
    q('#pnAprovarN').textContent = ultimo.aprovar ? ap.length : '–';
    q('#pnAprovarDet').textContent = ap.length ? (comAviso ? `${comAviso} com ⚠ da conferência` : 'todos sem aviso da conferência') : 'nada esperando 👍';
    const badge = q('#qtdAprovarTopo');
    badge.hidden = !ap.length;
    badge.textContent = ap.length;

    const agora = Date.now();
    const prox = (ultimo.fabrica || []).filter((i) => {
      const t = Date.parse(i.quandoYoutube || i.quando || '');
      return i.youtube && ['pendente', 'enviando', 'ok'].includes(i.youtube.status) && t >= agora - 5 * 60e3 && t <= agora + 24 * 3600e3;
    });
    q('#pnSobemN').textContent = ultimo.fabrica ? prox.length : '–';
    const porTipo = {};
    for (const i of prox) {
      const t = i.games ? 'Games' : i.politica ? 'Política' : i.brasil ? 'Brasil' : 'Outros';
      porTipo[t] = (porTipo[t] || 0) + 1;
    }
    q('#pnSobemDet').textContent = Object.entries(porTipo).map(([k, v]) => `${k} ${v}`).join(' · ') || 'nada agendado';

    const meus = (typeof jobs !== 'undefined' && Array.isArray(jobs) ? jobs : []).filter((j) => !['concluido', 'erro', 'cancelado'].includes(j.status));
    const rodando = meus.filter((j) => RODANDO.includes(j.status));
    const outros = (ultimo.dados?.pcs || []).filter((p) => p.pc !== ultimo.dados?.eu && Date.now() - p.atualizadoEm < 10 * 60e3);
    const outrosRodando = outros.reduce((n, p) => n + (p.jobs || []).filter((j) => RODANDO.includes(j.status)).length, 0);
    q('#pnMontandoN').textContent = rodando.length + outrosRodando;
    q('#pnMontandoDet').textContent = `${meus.length - rodando.length} esperando a vez neste PC`;
    q('#qtdFilaTopo').textContent = meus.length;

    // Precisa de você
    const precisa = [];
    const nomeCanal = (id) => (ultimo.dados?.canais || []).find((c) => c.id === id)?.titulo || 'um canal';
    for (const id of ultimo.studio || []) precisa.push(`${nomeCanal(id)}: entrar no Studio (capas dos Shorts)`);
    const cr = (ultimo.creditos?.itens || []).filter((i) => i.nivel === 'critico');
    for (const c of cr) precisa.push(`${String(c.nome).replace(/\s*\(.*\)/, '')}: ${c.texto}`);
    const erros = (ultimo.fabrica || []).filter((i) => i.status === 'erro' && Date.now() - Date.parse(i.concluidoEm || i.criadoEm || 0) < 24 * 3600e3);
    if (erros.length) precisa.push(`${erros.length} vídeo(s) com erro hoje na Fábrica`);
    const semAnalytics = (ultimo.dados?.canais || []).filter((c) => c.analytics === 'reconectar');
    if (semAnalytics.length) precisa.push(`Reconectar ${semAnalytics.map((c) => c.titulo).join(', ')} em Contas YouTube (para ver a retenção)`);
    if ((ultimo.dados?.canais || []).some((c) => c.analytics === 'api-desligada')) precisa.push('Ativar a "YouTube Analytics API" no Google Cloud (para ver a retenção)');
    q('#pnPrecisaN').textContent = precisa.length;
    q('#pnPrecisaDet').textContent = precisa[0] || 'nada 👍';
    q('#pnPrecisaCard').classList.toggle('alerta', precisa.length > 0);
    return precisa;
  }

  function listaAprovar() {
    const box = q('#pnAprovarLista');
    const ap = (ultimo.aprovar || []).filter((i) => !i.dormir);
    if (!ultimo.aprovar) return (box.innerHTML = '<p class="nota">Carregando...</p>');
    if (!ap.length) return (box.innerHTML = '<p class="nota">Nenhum vídeo esperando aprovação. 👍</p>');
    box.innerHTML = ap
      .slice(0, 4)
      .map((i) => {
        const c = i.conferencia;
        let chips = '';
        if (!c) chips += '<span class="pn-chip">ainda não conferido</span>';
        else if (['pendente', 'conferindo'].includes(c.status)) chips += '<span class="pn-chip">conferindo...</span>';
        else {
          const ruins = (c.etapas || []).filter((e) => !e.ok);
          chips += ruins.length ? `<span class="pn-chip at">⚠ ${esc(ruins[0].nome)}${ruins.length > 1 ? ` +${ruins.length - 1}` : ''}</span>` : '<span class="pn-chip ok">✓ Conferido</span>';
          if (c.nota != null) chips += `<span class="pn-chip" title="${esc(c.porqueNota || '')}">Nota do vídeo <b>${String(c.nota).replace('.', ',')}</b></span>`;
        }
        return `<div class="pn-item">
          ${i.thumbnailUrl ? `<img src="${esc(i.thumbnailUrl)}" alt="">` : '<div class="sem-capa"></div>'}
          <div class="meio"><span class="nota">${esc(TIPO[i.tipo] || '')} · ${i.formato === 'short' ? 'Short' : 'Longo'} · ${esc(quando(i.quando))}</span><b title="${esc(i.titulo)}">${esc(i.titulo)}</b><div class="pn-chips">${chips}</div></div>
          <button class="btn-mini" data-abrir-aprovar>Ver</button>
        </div>`;
      })
      .join('') + (ap.length > 4 ? `<a class="nota" data-abrir-aprovar href="#">Ver todos os ${ap.length} no Aprovar →</a>` : '');
    box.querySelectorAll('[data-abrir-aprovar]').forEach((b) => (b.onclick = (e) => (e.preventDefault(), abrirAprovar())));
  }

  function avisos(precisa) {
    const box = q('#pnAvisos');
    const linhas = precisa.map((t) => `<div class="pn-aviso"><i style="color:#f0b86a">!</i><span>${esc(t)}</span></div>`);
    const cr = ultimo.creditos?.itens || [];
    if (cr.length && !cr.some((i) => i.nivel === 'critico')) {
      const baixos = cr.filter((i) => i.nivel === 'baixo');
      linhas.push(baixos.length ? `<div class="pn-aviso"><i style="color:#f0b86a">!</i><span>Crédito acabando: ${esc(baixos.map((b) => `${String(b.nome).replace(/\s*\(.*\)/, '')} (${b.texto})`).join(', '))}</span></div>` : '<div class="pn-aviso"><i style="color:#8fd6ac">✓</i><span>Créditos das IAs em dia.</span></div>');
    }
    const outros = (ultimo.dados?.pcs || []).filter((p) => p.pc !== ultimo.dados?.eu && p.versao);
    const velhos = outros.filter((p) => typeof versaoMenor === 'function' && APP_VERSAO && versaoMenor(p.versao, APP_VERSAO));
    linhas.push(velhos.length ? `<div class="pn-aviso"><i style="color:#f0b86a">!</i><span>${esc(velhos.map((p) => p.pcNome || p.pc).join(', '))} ainda na v${esc(velhos[0].versao)} (este está na v${esc(APP_VERSAO)}): atualiza sozinho quando terminar o que está fazendo.</span></div>` : (APP_VERSAO ? `<div class="pn-aviso"><i style="color:#8fd6ac">✓</i><span>PCs na mesma versão (v${esc(APP_VERSAO)}).</span></div>` : ''));
    box.innerHTML = linhas.join('');
  }

  function canais() {
    const box = q('#pnCanais');
    const cs = (ultimo.dados?.canais || []).filter((c) => !c.erro || c.videos?.length);
    if (!ultimo.dados) return (box.innerHTML = '<p class="nota">Carregando...</p>');
    if (!cs.length) return (box.innerHTML = '<p class="nota">Sem canais conectados.</p>');
    const semana = Date.now() - 7 * 86400e3;
    box.innerHTML = `<div class="pn-tabela"><span class="cab">Canal</span><span class="cab">Vídeos</span><span class="cab">Views (vídeos da semana)</span><span class="cab">Inscritos</span>${cs
      .map((c) => {
        const s = (c.videos || []).filter((v) => Date.parse(v.publicadoEm) >= semana);
        return `<b>${esc(c.titulo)}</b><span>${s.length}</span><span>${num(s.reduce((n, v) => n + v.views, 0))}</span><span>${c.ocultos ? 'oculto' : num(c.inscritos)}</span>`;
      })
      .join('')}</div>`;
  }

  function desempenho() {
    const box = q('#pnDesempenho');
    if (!ultimo.dados) return (box.innerHTML = '<p class="nota">Carregando...</p>');
    const linhas = [];
    for (const c of ultimo.dados.canais || []) {
      const shorts = (c.videos || []).filter((v) => v.curto);
      const base = shorts.filter((v) => Date.now() - Date.parse(v.publicadoEm) > 24 * 3600e3).slice(0, 15);
      if (base.length < 3) continue;
      const media = base.reduce((n, v) => n + v.views, 0) / base.length;
      for (const v of shorts.slice(0, 3)) linhas.push({ ...v, canal: c.titulo, media, rel: media ? v.views / media : 1 });
    }
    linhas.sort((a, b) => String(b.publicadoEm).localeCompare(String(a.publicadoEm)));
    if (!linhas.length) return (box.innerHTML = '<p class="nota">Ainda sem Shorts suficientes para comparar.</p>');
    box.innerHTML =
      linhas
        .slice(0, 6)
        .map((v) => `<div class="pn-linha-simples" title="${esc(v.canal)} · média ${num(Math.round(v.media))} views${v.seg ? ` · ${v.seg} s` : ''}"><span>${esc(v.titulo)}</span><span style="white-space:nowrap">${v.retencao != null ? `<span style="color:${corRet(v.retencao)};margin-right:8px" title="assistem em média ${Math.round(v.duracaoMedia || 0)} s">${Math.round(v.retencao)}%</span>` : ''}<span class="${v.rel >= 1 ? 'pn-sobe' : 'pn-desce'}">${v.rel >= 1 ? '▲' : '▼'} ${num(v.views)}</span></span></div>`)
        .join('') + '<span class="nota">▲ acima da média dos últimos Shorts do canal · ▼ abaixo · % = quanto do vídeo assistem</span>';
  }

  // Cor da retenção: verde 70%+, amarelo 55-69%, vermelho abaixo
  const corRet = (r) => (r >= 70 ? '#8fd6ac' : r >= 55 ? '#f0b86a' : '#f08a8a');

  function retencao() {
    const box = q('#pnRetencao');
    if (!box) return;
    if (!ultimo.dados) return (box.innerHTML = '<p class="nota">Carregando...</p>');
    const cs = ultimo.dados.canais || [];
    const reconectar = cs.filter((c) => c.analytics === 'reconectar');
    const desligada = cs.find((c) => c.analytics === 'api-desligada');
    const r = ultimo.dados.retencao;
    const partes = [];
    if (desligada)
      partes.push(`<div class="pn-aviso"><i style="color:#f0b86a">!</i><span>Falta ativar a <b>YouTube Analytics API</b> no Google Cloud (o mesmo projeto do Client ID do Compilador): console.cloud.google.com → APIs e serviços → Biblioteca → "YouTube Analytics API" → Ativar.</span></div>`);
    if (reconectar.length)
      partes.push(`<div class="pn-aviso"><i style="color:#f0b86a">!</i><span>Para ver a retenção, reconecte uma vez em <b>Contas YouTube</b>: ${esc(reconectar.map((c) => c.titulo).join(', '))} (o Google vai pedir a permissão nova de "ver relatórios do YouTube Analytics").</span></div>`);
    const linhas = (r?.porCanal || []).filter((c) => c.curto.qtd || c.medio.qtd);
    if (linhas.length) {
      const cel = (x) => (x.qtd ? `<span><b style="color:${corRet(x.retencao)}">${Math.round(x.retencao)}%</b> <span class="nota">(${x.qtd})</span></span>` : '<span class="nota">—</span>');
      partes.push(
        `<div class="pn-tabela" style="grid-template-columns:2fr 1fr 1fr"><span class="cab">Canal (últimos 45 dias)</span><span class="cab">Curto (até 40 s)</span><span class="cab">Médio (mais de 40 s)</span>${linhas
          .map((c) => `<b>${esc(c.canal)}</b>${cel(c.curto)}${cel(c.medio)}`)
          .join('')}</div>`
      );
    }
    // As aberturas que mais/menos seguraram ficam só no site: os roteiros novos aprendem com elas sozinhos (pedido do dono: painel limpo)
    if (!partes.length) partes.push('<p class="nota">Ainda sem dados de retenção (aparecem quando os Shorts têm 1 dia no ar).</p>');
    box.innerHTML = partes.join('');
  }

  function comentarios() {
    const box = q('#pnComentarios');
    const c = ultimo.dados?.comentarios;
    if (!ultimo.dados) return (box.innerHTML = '<p class="nota">Carregando...</p>');
    if (!c) return (box.innerHTML = '<p class="nota">Não consegui buscar os comentários agora.</p>');
    const porCanal = {};
    for (const it of c.itens || []) porCanal[it.canalId] = (porCanal[it.canalId] || 0) + 1;
    const nome = (id) => (ultimo.dados.canais || []).find((x) => x.id === id)?.titulo || 'Canal';
    const ids = [...new Set([...(c.canais || []).map((x) => x.id).filter(Boolean), ...Object.keys(porCanal)])];
    box.innerHTML =
      (ids.length ? ids.map((id) => `<div class="pn-linha-simples"><span>${esc(nome(id))}</span><span class="contador${porCanal[id] ? ' alerta' : ''}">${porCanal[id] || 0}</span></div>`).join('') : '<p class="nota">Nenhum comentário novo.</p>') +
      '<p class="nota" style="margin:0">Cada um já vem com a resposta sugerida pela IA; spam e ofensa ficam de fora.</p>' +
      ((c.itens || []).length ? '<button class="btn-ouro" id="pnResponder">Responder agora</button>' : '');
    const b = q('#pnResponder');
    if (b) b.onclick = () => window.api.abrir.link('https://youvideors2.vercel.app/comentarios');
  }

  function pcs() {
    const box = q('#pnPcs');
    const lista = [];
    const meus = typeof jobs !== 'undefined' && Array.isArray(jobs) ? jobs : [];
    lista.push({ nome: 'Este PC', ligado: true, versao: APP_VERSAO, jobs: meus });
    for (const p of (ultimo.dados?.pcs || []).filter((p) => p.pc !== ultimo.dados?.eu)) {
      lista.push({ nome: p.pcNome || p.pc, ligado: Date.now() - p.atualizadoEm < 5 * 60e3, visto: p.atualizadoEm, versao: p.versao, jobs: p.jobs || [] });
    }
    box.innerHTML = lista
      .map((p) => {
        const rod = p.jobs.find((j) => RODANDO.includes(j.status));
        const pct = Math.round((rod?.progresso || 0) * 100);
        const min = p.visto ? Math.round((Date.now() - p.visto) / 60000) : 0;
        return `<div class="pn-pc"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(p.nome)}</b><span style="font-size:12px;color:${p.ligado ? '#8fd6ac' : '#f0b86a'}">● ${p.ligado ? 'ligado' : `sem sinal há ${min < 60 ? min + ' min' : Math.round(min / 60) + ' h'}`}${p.versao ? ` · v${esc(p.versao)}` : ''}</span></div>
          <span>${rod ? `${esc(rod.etapa || 'Trabalhando')}: “${esc(rod.nome)}” · ${pct}%` : p.ligado ? 'Parado, esperando trabalho' : '—'}</span>
          ${rod ? `<div class="barra"><i style="width:${pct}%"></i></div>` : ''}</div>`;
      })
      .join('');
  }

  function agenda() {
    const box = q('#pnAgenda');
    if (!ultimo.fabrica) return (box.innerHTML = '<p class="nota">Carregando...</p>');
    const agora = Date.now();
    const prox = (ultimo.fabrica || [])
      .filter((i) => {
        const t = Date.parse(i.quandoYoutube || i.quando || '');
        return i.youtube && ['pendente', 'enviando', 'ok', 'revisar'].includes(i.youtube.status) && t >= agora - 5 * 60e3 && t <= agora + 24 * 3600e3;
      })
      .sort((a, b) => String(a.quandoYoutube || a.quando).localeCompare(String(b.quandoYoutube || b.quando)));
    if (!prox.length) return (box.innerHTML = '<p class="nota">Nada marcado para as próximas 24 horas.</p>');
    const grupos = {};
    for (const i of prox) {
      const g = i.canalYoutube?.titulo || (i.games ? 'Games' : i.politica ? 'Política' : 'Outros');
      (grupos[g] = grupos[g] || []).push(i);
    }
    box.innerHTML = `<div class="pn-agenda">${Object.entries(grupos)
      .map(([g, l]) => `<span class="nota">${esc(g)}</span><div class="faixa">${l.map((i) => `<span title="${esc(i.titulo || i.tema)}">${esc(hora(i.quandoYoutube || i.quando))} · ${esc(String(i.titulo || i.tema || '').slice(0, 34))}${i.youtube?.status === 'revisar' ? ' (aprovar)' : ''}</span>`).join('')}</div>`)
      .join('')}</div>`;
  }

  function desenhar() {
    const hoje = new Date();
    q('#pnHoje').textContent = `Hoje, ${hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}`;
    const seguro = (f, ...a) => {
      try {
        return f(...a);
      } catch (e) {
        console.warn('[painel]', f.name, e);
      }
    };
    const precisa = seguro(resumo) || [];
    for (const f of [listaAprovar, () => avisos(precisa), canais, desempenho, retencao, comentarios, pcs, agenda]) seguro(f);
  }

  async function carregar(forcar = false) {
    if (carregando) return;
    carregando = true;
    q('#pnSub').textContent = 'atualizando...';
    const pega = (p) => p.catch(() => null);
    const [aprovar, fabrica, studio, creditos] = await Promise.all([
      pega(window.api.fabrica.revisar().then((r) => r.itens || [])),
      pega(window.api.fabrica.listar().then((r) => r.itens || [])),
      pega(window.api.canais.studioPendentes().then((r) => r.semLogin || [])),
      pega(window.api.creditos.ler()),
    ]);
    Object.assign(ultimo, { aprovar: aprovar ?? ultimo.aprovar, fabrica: fabrica ?? ultimo.fabrica, studio: studio ?? ultimo.studio, creditos: creditos ?? ultimo.creditos });
    desenhar();
    // Canais/comentários/PCs (YouTube): mais lento — chega depois e redesenha
    const dados = await pega(window.api.painel.dados({ forcar }));
    if (dados) ultimo.dados = dados;
    desenhar();
    q('#pnSub').textContent = `atualizado às ${hora(new Date().toISOString())}`;
    carregando = false;
  }

  function ligar() {
    q('#btnPainel').onclick = () => mostrar(true);
    q('#btnAprovarTopo').onclick = abrirAprovar;
    q('#pnAbrirAprovar').onclick = abrirAprovar;
    q('#btnFilaTopo').onclick = irParaFila;
    q('#pnAtualizar').onclick = () => carregar(true);
    q('#btnMais').onclick = (e) => {
      e.stopPropagation();
      const m = q('#menuMais');
      m.hidden = !m.hidden;
      q('#btnMais').setAttribute('aria-expanded', String(!m.hidden));
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menu-mais-wrap')) fecharMenu();
    });
    q('#menuMais').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mais === 'compilar') (mostrar(false), modo('compilar'));
      if (b.dataset.mais === 'criar') (mostrar(false), modo('criar'));
      fecharMenu();
    });
    // Fábrica/Contas abrem por cima (modais): o Painel continua atrás
    window.api.ao('fila:mudou', () => {
      if (visivel) (resumo(), pcs());
    });
    window.api.ao('studio:login', (l) => {
      ultimo.studio = Array.isArray(l) ? l : [];
      if (visivel) desenhar();
    });
    window.api.ao('creditos:status', (c) => {
      ultimo.creditos = c;
      if (visivel) desenhar();
    });
    setInterval(() => visivel && !document.hidden && carregar(), 3 * 60e3);
    window.addEventListener('resize', () => (q('#telaPainel').style.top = q('.topo').offsetHeight + 'px'));
    mostrar(true); // abre no Painel
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar);
  else ligar();
  return { mostrar, carregar };
})();
