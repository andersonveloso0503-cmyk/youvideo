// Fila de vídeos: processa um de cada vez (ou dois no modo máximo), guarda o
// estado no disco e avisa a tela a cada passo.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { probe, rodar, detectarEncoder } = require('./ffmpeg');
const R = require('./render');
const { separar } = require('./separar');
const { transcrever } = require('./legenda');
const YT = require('./youtube');
const { gerarMiniatura, capaAoLado } = require('./miniatura');
const Central = require('./central');
const { resumoClima } = require('./analise');
const IA = require('./ia');
const M = require('./montagem');

const EM_ANDAMENTO = ['separando', 'legenda', 'audio', 'fundos', 'renderizando', 'publicando'];

function nomeSeguro(n) {
  return String(n || 'video').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
}

function caminhoLivre(pasta, nome) {
  let alvo = path.join(pasta, `${nome}.mp4`);
  let i = 2;
  while (fs.existsSync(alvo)) alvo = path.join(pasta, `${nome} (${i++}).mp4`);
  return alvo;
}

// Várias versões com as MESMAS músicas: a versão 1 começa com a música 1, a 2 com a música 2...
// e o resto vem embaralhado, diferente em cada versão.
function gerarVersoes(musicas, n) {
  const embaralhar = (l) => {
    const a = [...l];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const vistas = new Set();
  return Array.from({ length: n }, (_, k) => {
    const primeira = musicas[k % musicas.length];
    let ordem;
    for (let t = 0; t < 20; t++) {
      ordem = [primeira, ...embaralhar(musicas.filter((m) => m !== primeira))];
      const assinatura = ordem.map((m) => m.arquivo).join('|');
      if (!vistas.has(assinatura) || musicas.length < 3) {
        vistas.add(assinatura);
        break;
      }
    }
    return ordem;
  });
}

function girar(lista, n) {
  if (!lista.length) return lista;
  const k = n % lista.length;
  return [...lista.slice(k), ...lista.slice(0, k)];
}

// Quando divide em vários vídeos e os fundos são só imagens, cada música leva
// a imagem da mesma posição (música 1 → imagem 1, música 2 → imagem 2...).
// Assim cada vídeo sai com a sua própria capa. Com vídeos de fundo, só gira a ordem.
function fundosDaParte(fundos, todas, grupo, i) {
  if (!fundos.length) return fundos;
  if (fundos.every((f) => R.ehImagem(f))) {
    return [...new Set(grupo.map((m) => fundos[todas.indexOf(m) % fundos.length]))];
  }
  return girar(fundos, i);
}

class Fila extends EventEmitter {
  constructor({ dirDados, fontsDir, obterConfig, obterCanal, registrarEnvio }) {
    super();
    this.registrarEnvio = registrarEnvio || (() => {});
    this.dirDados = dirDados;
    this.dirCache = path.join(dirDados, 'cache');
    this.arquivo = path.join(dirDados, 'fila.json');
    this.fontsDir = fontsDir;
    this.obterConfig = obterConfig; // () => { falKey, groqKey, google:{clientId,clientSecret,redirectOriginal}, modo, simultaneos }
    this.obterCanal = obterCanal; // (id) => { refreshToken, titulo }
    this.jobs = [];
    this.cancelamentos = new Map();
    this.rodando = new Set();
    this.carregar();
  }

  carregar() {
    try {
      this.jobs = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
    } catch {
      this.jobs = [];
    }
    // O que estava rodando quando o app fechou fica como "interrompido"
    for (const j of this.jobs) {
      if (EM_ANDAMENTO.includes(j.status) || j.status === 'aguardando') {
        if (EM_ANDAMENTO.includes(j.status)) {
          j.status = 'interrompido';
          j.etapa = 'Processamento interrompido';
        }
      }
    }
    this.salvar();
  }

  salvar() {
    fs.mkdirSync(this.dirDados, { recursive: true });
    fs.writeFileSync(this.arquivo, JSON.stringify(this.jobs, null, 1));
  }

  lista() {
    return this.jobs;
  }

  emitir() {
    this.emit('mudou', this.jobs);
  }

  atualizar(job, campos, salvar = true) {
    Object.assign(job, campos);
    if (salvar) this.salvar();
    this.emitir();
  }

  /** Recebe o projeto da tela e cria um ou vários vídeos (divide pela duração máxima). */
  adicionar(projeto) {
    const musicas = projeto.musicas.filter((m) => m.duracao > 0);
    if (!musicas.length) throw new Error('Selecione pelo menos uma música.');
    const curto = projeto.formato.tipo === 'curto';
    const versoes = curto ? 0 : Math.min(30, Number(projeto.formato.versoes) || 0);
    const qtd = curto || versoes > 1 ? 0 : Number(projeto.formato.qtdVideos) || 0;
    const opcoes = { limiteMusicaSeg: Number(projeto.formato.limiteMusicaSeg) || 0, crossfade: Number(projeto.audio?.crossfade) || 0 };
    const grupos = versoes > 1
      ? gerarVersoes(musicas, versoes)
      : qtd
      ? R.dividirEmQuantidade(musicas, qtd, opcoes)
      : R.dividirEmVideos(musicas, {
          duracaoMaxMin: curto ? Number(projeto.formato.duracaoMaxMin) || 1 : Number(projeto.formato.duracaoMaxMin) || 0,
          ...opcoes,
        });
    // Com quantidade escolhida, a duração máxima não corta nada
    if (qtd || versoes > 1) projeto = { ...projeto, formato: { ...projeto.formato, duracaoMaxMin: '' } };
    const lote = crypto.randomBytes(4).toString('hex');
    const criados = grupos.map((grupo, i) => {
      const sufixo = grupos.length > 1 ? (curto ? ` - ${grupo[0].titulo}` : versoes > 1 ? ` - Versão ${i + 1}` : ` - Parte ${i + 1}`) : '';
      const job = {
        id: `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
        lote,
        parte: i + 1,
        partes: grupos.length,
        criadoEm: new Date().toISOString(),
        nome: `${projeto.nome || 'Compilação'}${sufixo}`,
        status: 'aguardando',
        etapa: 'Aguardando na fila',
        progresso: 0,
        // Com vários vídeos, cada um começa por um fundo diferente
        projeto: { ...projeto, musicas: grupo, fundos: fundosDaParte(projeto.fundos || [], musicas, grupo, i) },
        sufixo,
      };
      this.jobs.push(job);
      return job;
    });
    this.salvar();
    this.emitir();
    this.proximo();
    return criados;
  }

  /** Vídeos prontos para subir no YouTube (tela "Subir p/ YouTube"). */
  adicionarEnvios(lista) {
    const lote = crypto.randomBytes(4).toString('hex');
    const criados = lista.map((e, i) => {
      const job = {
        id: `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
        tipo: 'envio',
        lote,
        parte: i + 1,
        partes: lista.length,
        criadoEm: new Date().toISOString(),
        nome: e.titulo || path.basename(e.arquivo),
        status: 'aguardando',
        etapa: 'Aguardando para enviar',
        progresso: 0,
        envio: e,
      };
      this.jobs.push(job);
      return job;
    });
    this.salvar();
    this.emitir();
    this.proximo();
    return criados;
  }

  async processarEnvio(job) {
    const cfg = this.obterConfig();
    const e = job.envio;
    job.cancelado = false;
    try {
      // Vídeo da Biblioteca (na nuvem): baixa primeiro
      if (e.baixarDe && (!e.arquivo || !fs.existsSync(e.arquivo))) {
        this.atualizar(job, { status: 'publicando', etapa: 'Baixando o vídeo' });
        const destino = path.join(this.dirCache, 'biblioteca', `${e.chaveArquivo || job.id}.mp4`);
        e.arquivo = await Central.baixar(e.baixarDe, destino, (x) =>
          this.atualizar(job, { progresso: x * 0.3, etapa: `Baixando o vídeo ${Math.round(x * 100)}%` }, false)
        );
        if (e.capaUrl && !e.capa) {
          try {
            e.capa = await Central.baixar(e.capaUrl, path.join(this.dirCache, 'biblioteca', `${e.chaveArquivo || job.id}-capa.jpg`));
          } catch {}
        }
        this.salvar();
      }
      if (!fs.existsSync(e.arquivo)) throw new Error(`Vídeo não encontrado: ${e.arquivo}`);
      const canal = this.obterCanal(e.canalId);
      if (!canal) throw new Error('Canal do YouTube não encontrado — conecte de novo em Contas YouTube.');
      this.atualizar(job, { status: 'publicando', etapa: 'Preparando capa' });
      let miniatura = e.capa && fs.existsSync(e.capa) ? e.capa : null;
      if (miniatura) {
        const pronta = path.join(os.tmpdir(), `youvideo-capa-${job.id}.jpg`);
        try {
          await gerarMiniatura(miniatura, pronta, { vertical: !!e.curto });
          miniatura = pronta;
        } catch {
          miniatura = null;
        }
      }
      if (job.cancelado) throw new Error('CANCELADO');
      this.atualizar(job, { etapa: 'Enviando para o YouTube' });
      const r = await YT.publicar({
        credenciais: cfg.google,
        redirectOriginal: canal.redirect,
        refreshToken: canal.refreshToken,
        arquivo: e.arquivo,
        titulo: e.titulo,
        descricao: e.descricao,
        tags: e.tags,
        privacidade: e.privacidade,
        agendarPara: e.agendarPara || null,
        miniatura: e.curto ? null : miniatura,
        onProgresso: (x) => {
          const ini = e.baixarDe ? 0.3 : 0;
          this.atualizar(job, { progresso: ini + x * (0.97 - ini), etapa: `Enviando ${Math.round(x * 100)}%` }, false);
        },
      });
      this.registrarEnvio();
      this.atualizar(job, {
        status: 'concluido',
        etapa: e.agendarPara ? 'Agendado' : 'Enviado',
        progresso: 1,
        youtube: { ...r, canal: canal.titulo, agendadoPara: e.agendarPara || null },
        arquivoFinal: e.arquivo,
        aviso: r.miniaturaErro || null,
        concluidoEm: new Date().toISOString(),
      });
    } catch (err) {
      const cancelado = err.message === 'CANCELADO' || job.cancelado;
      let msg = err.message;
      if (/quota|uploadLimitExceeded/i.test(msg)) msg = 'O YouTube recusou: limite de envios do dia atingido. Tente de novo amanhã.';
      if (/invalid_grant/i.test(msg)) msg = 'A autorização desse canal expirou. Em Contas YouTube, desconecte e conecte o canal de novo.';
      this.atualizar(job, { status: cancelado ? 'cancelado' : 'erro', etapa: cancelado ? 'Cancelado' : 'Erro', erro: cancelado ? null : msg });
      throw err;
    }
  }

  /** Posts para Facebook/Instagram/TikTok/Kwai de um vídeo do PC: sobe pra nuvem e agenda. */
  adicionarNuvem(lista) {
    const criados = lista.map((n) => {
      const job = {
        id: `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
        tipo: 'nuvem',
        criadoEm: new Date().toISOString(),
        nome: n.titulo || path.basename(n.arquivo),
        status: 'aguardando',
        etapa: 'Aguardando para subir',
        progresso: 0,
        nuvem: n, // { arquivo, titulo, legenda, curto, redes, quando }
      };
      this.jobs.push(job);
      return job;
    });
    this.salvar();
    this.emitir();
    this.proximo();
    return criados;
  }

  async processarNuvem(job) {
    const cfg = this.obterConfig();
    const n = job.nuvem;
    job.cancelado = false;
    try {
      if (!fs.existsSync(n.arquivo)) throw new Error(`Vídeo não encontrado: ${n.arquivo}`);
      this.atualizar(job, { status: 'publicando', etapa: 'Subindo para a nuvem' });
      if (!n.videoUrl) {
        n.videoUrl = await Central.subirParaNuvem(cfg, n.arquivo, (x) =>
          this.atualizar(job, { progresso: x * 0.95, etapa: `Subindo para a nuvem ${Math.round(x * 100)}%` }, false)
        );
        this.salvar();
      }
      if (job.cancelado) throw new Error('CANCELADO');
      this.atualizar(job, { etapa: 'Agendando nas redes' });
      await Central.chamar(cfg, '/api/central/agenda', {
        metodo: 'POST',
        corpo: { itens: [{ titulo: n.titulo, legenda: n.legenda, videoUrl: n.videoUrl, curto: n.curto, redes: n.redes, quando: n.quando }] },
      });
      this.atualizar(job, { status: 'concluido', etapa: `Agendado: ${n.redes.join(', ')}`, progresso: 1, concluidoEm: new Date().toISOString() });
    } catch (err) {
      const cancelado = err.message === 'CANCELADO' || job.cancelado;
      this.atualizar(job, { status: cancelado ? 'cancelado' : 'erro', etapa: cancelado ? 'Cancelado' : 'Erro', erro: cancelado ? null : err.message });
      throw err;
    }
  }

  retentar(id) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j || EM_ANDAMENTO.includes(j.status)) return;
    this.atualizar(j, { status: 'aguardando', etapa: 'Aguardando na fila', progresso: 0, erro: null });
    this.proximo();
  }

  cancelar(id) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) return;
    if (j.status === 'aguardando') this.atualizar(j, { status: 'cancelado', etapa: 'Cancelado' });
    const c = this.cancelamentos.get(id);
    j.cancelado = true;
    if (c) c();
  }

  remover(id) {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) return;
    if (EM_ANDAMENTO.includes(j.status)) this.cancelar(id);
    this.jobs = this.jobs.filter((x) => x.id !== id);
    this.salvar();
    this.emitir();
  }

  // tudo = true também para o que está gerando/enviando agora
  limpar(tudo = false) {
    if (tudo) for (const j of this.jobs) if (EM_ANDAMENTO.includes(j.status)) this.cancelar(j.id);
    this.jobs = tudo ? [] : this.jobs.filter((j) => EM_ANDAMENTO.includes(j.status));
    this.salvar();
    this.emitir();
  }

  proximo() {
    const cfg = this.obterConfig();
    const limite = cfg.modo === 'maximo' ? Math.max(1, Math.min(3, Number(cfg.simultaneos) || 1)) : 1;
    // Geração (usa o processador) e envio (usa a internet) andam em paralelo, cada um na sua vez
    const vaga = (j) => (!j?.tipo || j.tipo === 'video' || j.tipo === 'montagem' ? 'video' : 'rede');
    const rodandoDe = (tipo) => [...this.rodando].filter((id) => vaga(this.jobs.find((j) => j.id === id)) === tipo).length;
    for (const [tipo, max] of [['video', limite], ['rede', 1]]) {
      while (rodandoDe(tipo) < max) {
        const j = this.jobs.find((x) => x.status === 'aguardando' && !this.rodando.has(x.id) && vaga(x) === tipo);
        if (!j) break;
        this.rodando.add(j.id);
        this.processar(j)
          .catch(() => {})
          .finally(() => {
            this.rodando.delete(j.id);
            this.cancelamentos.delete(j.id);
            this.proximo();
          });
      }
    }
  }

  /** Vídeo criado no site (história animada/narrada) para montar aqui no PC. */
  adicionarMontagem(receita, pastaSaida) {
    const job = {
      id: `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
      tipo: 'montagem',
      criadoEm: new Date().toISOString(),
      nome: receita.titulo || 'História do Youvideo',
      status: 'aguardando',
      etapa: 'Aguardando para montar',
      progresso: 0,
      receita,
      pastaSaida,
    };
    this.jobs.push(job);
    this.salvar();
    this.emitir();
    this.proximo();
    return job;
  }

  async processarMontagem(job) {
    const cfg = this.obterConfig();
    const modo = cfg.modo || 'normal';
    const rc = job.receita;
    const curto = rc.formato === 'short' || rc.formato === 'curto';
    const [W, H] = curto ? [1080, 1920] : [1920, 1080];
    const dir = path.join(os.tmpdir(), 'youvideo-compilador', job.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    job.cancelado = false;
    const registrarCancelar = (fn) => this.cancelamentos.set(job.id, fn);
    const checar = () => { if (job.cancelado) throw new Error('CANCELADO'); };
    // Peso de cada etapa na barra: baixar 15%, áudio 5%, cenas 45%, final 35%
    const faixa = (ini, tam, status, etapa) => {
      this.atualizar(job, { status, etapa });
      return (x) => this.atualizar(job, { progresso: ini + tam * Math.min(1, x) }, false);
    };
    try {
      const pasta = pastaDeSaida(job.pastaSaida || cfg.ultimoProjeto?.saida?.pasta);
      const locais = await M.baixarTudo(rc, this.dirCache, faixa(0, 0.15, 'audio', 'Baixando cenas e narração'), checar);
      checar();
      faixa(0.15, 0.05, 'audio', 'Preparando narração')(0);
      const audio = await M.prepararAudio(rc, locais, dir, { modo, registrarCancelar });
      checar();
      const { fundo, capaOrigem } = await M.prepararFundo(rc, locais, dir, W, H, {
        modo, registrarCancelar, checar, onProgresso: faixa(0.2, 0.45, 'fundos', 'Preparando as cenas'),
      });
      let assArquivo = null;
      if (rc.legenda !== false && (rc.palavras || []).length || rc.marca) {
        assArquivo = path.join(dir, 'legenda.ass');
        fs.writeFileSync(assArquivo, M.gerarAssNarracao({ W, H, palavras: rc.legenda === false ? [] : rc.palavras, duracao: rc.duracao, marca: rc.marca, curto }));
        const fontsTmp = path.join(dir, 'fonts');
        fs.mkdirSync(fontsTmp, { recursive: true });
        for (const f of fs.readdirSync(this.fontsDir)) fs.copyFileSync(path.join(this.fontsDir, f), path.join(fontsTmp, f));
      }
      checar();
      const progR = faixa(0.65, 0.35, 'renderizando', 'Gerando vídeo');
      const saida = caminhoLivre(pasta, nomeSeguro(job.nome));
      const temporario = path.join(dir, 'final.mp4');
      const encoder = cfg.encoder && cfg.encoder !== 'auto' ? cfg.encoder : await detectarEncoder();
      const inicio = Date.now();
      const renderizar = (enc) => R.renderizarFinal({
        fundo: { tipo: 'loop', arquivo: fundo }, audioArquivo: audio, total: rc.duracao, W, H,
        efeito: { estilo: 'nenhum' }, textura: {}, assArquivo, fontsDir: path.join(dir, 'fonts'), inscrever: null,
        saida: temporario, encoder: enc, modo, dir, registrarCancelar,
        onProgresso: (x) => {
          progR(x);
          const dec = (Date.now() - inicio) / 1000;
          this.atualizar(job, { etapa: `Gerando vídeo ${Math.round(x * 100)}%`, restanteSeg: x > 0.01 ? dec / x - dec : null }, false);
        },
      });
      try {
        await renderizar(encoder);
      } catch (e) {
        if (encoder === 'libx264' || e.message === 'CANCELADO') throw e;
        this.atualizar(job, { etapa: 'Placa de vídeo falhou, tentando com o processador' });
        await renderizar('libx264');
      }
      moverArquivo(temporario, saida);
      let capa = null;
      try {
        capa = saida.replace(/\.mp4$/i, '.jpg');
        await gerarMiniatura(capaOrigem || saida, capa, { vertical: curto });
      } catch {
        capa = null;
      }
      this.atualizar(job, {
        arquivoFinal: saida, capa, duracao: rc.duracao, curto,
        status: 'concluido', etapa: 'Pronto', progresso: 1, restanteSeg: null, concluidoEm: new Date().toISOString(),
      });
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      const cancelado = e.message === 'CANCELADO' || job.cancelado;
      this.atualizar(job, { status: cancelado ? 'cancelado' : 'erro', etapa: cancelado ? 'Cancelado' : 'Erro', erro: cancelado ? null : e.message, restanteSeg: null });
      if (cancelado) fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }

  async processar(job) {
    if (job.tipo === 'envio') return this.processarEnvio(job);
    if (job.tipo === 'nuvem') return this.processarNuvem(job);
    if (job.tipo === 'montagem') return this.processarMontagem(job);
    const cfg = this.obterConfig();
    const modo = cfg.modo || 'normal';
    const p = job.projeto;
    const dir = path.join(os.tmpdir(), 'youvideo-compilador', job.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    job.cancelado = false;
    const registrarCancelar = (fn) => this.cancelamentos.set(job.id, fn);
    const checar = () => {
      if (job.cancelado) throw new Error('CANCELADO');
    };
    const faixa = (ini, fim) => (x) => this.atualizar(job, { progresso: ini + (fim - ini) * x }, false);

    const usaSeparacao = !!p.audio?.somenteInstrumental;
    const usaLegenda = !!p.legenda?.ativo;
    const publica = !!p.publicar?.ativo && !!p.publicar?.canalId;
    // Pesos de cada etapa na barra de progresso
    const pesos = { separando: usaSeparacao ? 0.2 : 0, legenda: usaLegenda ? 0.08 : 0, audio: 0.07, fundos: 0.05, publicando: publica ? 0.15 : 0 };
    pesos.renderizando = 1 - Object.values(pesos).reduce((a, b) => a + b, 0);
    let base = 0;
    const etapa = (status, texto) => {
      this.atualizar(job, { status, etapa: texto });
      const ini = base;
      base += pesos[status] || 0;
      return faixa(ini, base);
    };

    try {
      // Confere se os arquivos ainda existem
      for (const m of p.musicas) if (!fs.existsSync(m.arquivo)) throw new Error(`Música não encontrada: ${m.arquivo}`);
      // Confere a pasta de saída logo no começo (antes de gastar tempo gerando)
      const pasta = pastaDeSaida(p.saida?.pasta);

      // 1) Separar voz/instrumental
      const musicas = p.musicas.map((m) => ({ ...m, arquivoOriginal: m.arquivo, arquivoVoz: null }));
      if (usaSeparacao) {
        const prog = etapa('separando', 'Separando voz e instrumental');
        for (let i = 0; i < musicas.length; i++) {
          checar();
          const r = await separar(musicas[i].arquivo, {
            falKey: cfg.falKey,
            dirCache: this.dirCache,
            registrarCancelar,
            onStatus: (s) => this.atualizar(job, { etapa: `${s} — ${i + 1}/${musicas.length}` }, false),
          });
          musicas[i].arquivo = r.instrumental;
          musicas[i].arquivoVoz = r.voz;
          musicas[i].duracao = Math.min(musicas[i].duracao, (await probe(r.instrumental)).duracao || musicas[i].duracao);
          prog((i + 1) / musicas.length);
        }
      }

      // 2) Juntar o áudio
      checar();
      const [W, H] = R.dimensoes(p.formato);
      const progA = etapa('audio', 'Juntando as músicas');
      const audio = await R.prepararAudio({ musicas, audio: p.audio, formato: p.formato, dir, modo, onProgresso: progA, registrarCancelar });

      // 3) Legenda (usa a voz separada quando existir — fica bem mais precisa)
      let legendas = [];
      if (usaLegenda) {
        const prog = etapa('legenda', 'Gerando legenda');
        const limite = Number(p.formato.limiteMusicaSeg) || 0;
        for (let i = 0; i < musicas.length; i++) {
          checar();
          const m = musicas[i];
          const t = audio.timeline[i];
          if (!t) break;
          const linhas = await transcrever(m.arquivoVoz || m.arquivoOriginal, {
            groqKey: cfg.groqKey,
            idioma: p.legenda.idioma || 'pt',
            dirCache: this.dirCache,
            registrarCancelar,
            onStatus: (s) => this.atualizar(job, { etapa: `${s} — ${i + 1}/${musicas.length}` }, false),
          });
          const durMusica = t.fim - t.inicio;
          for (const l of linhas) {
            if (limite && l.inicio >= limite) continue;
            if (l.inicio >= durMusica) continue;
            legendas.push({ inicio: t.inicio + l.inicio, fim: t.inicio + Math.min(l.fim, durMusica), texto: l.texto });
          }
          prog((i + 1) / musicas.length);
        }
      }

      // 4) Fundos
      checar();
      const progF = etapa('fundos', 'Preparando fundos');
      const fundo = await R.prepararFundos({
        fundos: p.fundos, W, H, enquadramento: p.enquadramento, textura: p.textura,
        timeline: audio.timeline, total: audio.total, dir, modo, onProgresso: progF, registrarCancelar,
      });

      // 5) Textos (nome da música + legenda)
      let assArquivo = null;
      if (usaLegenda || p.legenda?.mostrarNome) {
        assArquivo = path.join(dir, 'textos.ass');
        fs.writeFileSync(assArquivo, R.gerarAss({ W, H, timeline: audio.timeline, total: audio.total, legendas, mostrarNome: !!p.legenda?.mostrarNome, legenda: p.legenda }));
        const fontsTmp = path.join(dir, 'fonts');
        fs.mkdirSync(fontsTmp, { recursive: true });
        for (const f of fs.readdirSync(this.fontsDir)) fs.copyFileSync(path.join(this.fontsDir, f), path.join(fontsTmp, f));
      }

      // 6) Renderizar
      checar();
      const progR = etapa('renderizando', 'Gerando vídeo');
      const saida = caminhoLivre(pasta, nomeSeguro((p.saida?.nome || p.nome || 'compilacao') + (job.sufixo || '')));
      const temporario = path.join(dir, 'final.mp4');
      const encoder = cfg.encoder && cfg.encoder !== 'auto' ? cfg.encoder : await detectarEncoder();
      const inicioRender = Date.now();
      try {
        await R.renderizarFinal({
          fundo, audioArquivo: audio.arquivo, total: audio.total, W, H, efeito: p.efeito, textura: p.textura,
          assArquivo, fontsDir: path.join(dir, 'fonts'), inscrever: p.inscrever?.ativo ? p.inscrever : null,
          saida: temporario, encoder, modo, dir, registrarCancelar,
          onProgresso: (x, seg) => {
            progR(x);
            const decorrido = (Date.now() - inicioRender) / 1000;
            const restante = x > 0.01 ? decorrido / x - decorrido : null;
            this.atualizar(job, { etapa: `Gerando vídeo ${Math.round(x * 100)}%`, restanteSeg: restante }, false);
          },
        });
      } catch (e) {
        // Se o codificador da placa de vídeo falhar, tenta de novo só com o processador
        if (encoder !== 'libx264' && e.message !== 'CANCELADO') {
          this.atualizar(job, { etapa: 'Placa de vídeo falhou, tentando com o processador' });
          await R.renderizarFinal({
            fundo, audioArquivo: audio.arquivo, total: audio.total, W, H, efeito: p.efeito, textura: p.textura,
            assArquivo, fontsDir: path.join(dir, 'fonts'), inscrever: p.inscrever?.ativo ? p.inscrever : null,
            saida: temporario, encoder: 'libx264', modo, dir, registrarCancelar, onProgresso: progR,
          });
        } else throw e;
      }
      moverArquivo(temporario, saida);

      // Capa do YouTube (1280x720, < 2 MB), salva ao lado do vídeo com o mesmo nome
      let miniatura = null;
      const primeiraImg = (p.fundos || []).find((f) => R.ehImagem(f) && fs.existsSync(f));
      try {
        miniatura = saida.replace(/\.mp4$/i, '.jpg');
        await gerarMiniatura(primeiraImg || saida, miniatura, { vertical: p.formato.tipo === 'curto', enquadramento: p.enquadramento || 'auto' });
      } catch {
        miniatura = null;
      }

      this.atualizar(job, { arquivoFinal: saida, capa: miniatura, clima: resumoClima(p.musicas), timeline: audio.timeline.map((t) => ({ titulo: t.titulo, inicio: t.inicio })), duracao: audio.total });

      // 7) Publicar
      if (publica) {
        checar();
        const progP = etapa('publicando', 'Enviando para o YouTube');
        const canal = this.obterCanal(p.publicar.canalId);
        if (!canal) throw new Error('Canal do YouTube não encontrado — conecte de novo em Contas YouTube.');
        let titulo = (p.publicar.titulo || p.nome || 'Compilação') + (job.partes > 1 ? job.sufixo : '');
        let descricaoBase = p.publicar.descricao;
        let tags = p.publicar.tags;
        // Vários vídeos: cada um ganha um título próprio da IA (títulos repetidos o YouTube vê como spam)
        const pedido = p.publicar.pedido || cfg.envioPrefs?.contexto || '';
        if (job.partes > 1 && p.publicar.iaPorVideo !== false && cfg.groqKey && (job.parte > 1 || !p.publicar.titulo)) {
          this.atualizar(job, { etapa: 'Criando título com IA' }, false);
          // Um de cada vez, para cada vídeo enxergar os títulos que os outros já pegaram
          const antes = this.travaIa || Promise.resolve();
          let soltar;
          this.travaIa = new Promise((ok) => (soltar = ok));
          await antes;
          const usados = [p.publicar.titulo, ...this.jobs.filter((x) => x.lote === job.lote && x !== job && x.tituloIa).map((x) => x.tituloIa)].filter(Boolean);
          try {
            const r = await IA.gerarTextosVideo(cfg.groqKey, {
              nome: p.nome,
              musicas: p.musicas.map((m) => m.titulo),
              duracaoSeg: audio.total,
              curto: p.formato.tipo === 'curto',
              clima: resumoClima(p.musicas),
              canal: canal.titulo,
              pedido,
              evitar: usados.slice(-12),
            });
            titulo = r.titulo;
            if (r.descricao) descricaoBase = r.descricao;
            if (r.tags?.length) tags = r.tags;
          } catch {}
          this.atualizar(job, { tituloIa: titulo });
          soltar();
        } else if (job.parte === 1 || job.partes === 1) {
          titulo = p.publicar.titulo || titulo;
        }
        this.atualizar(job, { tituloIa: titulo });
        let agendarPara = null;
        if (p.publicar.agendar?.ativo && p.publicar.agendar.inicio) {
          const ini = new Date(p.publicar.agendar.inicio).getTime();
          agendarPara = new Date(ini + (job.parte - 1) * (Number(p.publicar.agendar.intervaloHoras) || 24) * 3600e3);
        }
        const r = await YT.publicar({
          credenciais: cfg.google,
          redirectOriginal: canal.redirect,
          refreshToken: canal.refreshToken,
          arquivo: saida,
          titulo,
          descricao: YT.montarDescricao({
            descricao: descricaoBase,
            timeline: audio.timeline,
            incluirTracklist: p.publicar.incluirTracklist !== false,
            curto: p.formato.tipo === 'curto',
            tags,
          }),
          tags,
          privacidade: p.publicar.privacidade,
          agendarPara,
          miniatura: p.formato.tipo === 'curto' ? null : miniatura,
          onProgresso: (x) => {
            progP(x);
            this.atualizar(job, { etapa: `Enviando para o YouTube ${Math.round(x * 100)}%` }, false);
          },
        });
        this.registrarEnvio();
        this.atualizar(job, { youtube: { ...r, canal: canal.titulo, agendadoPara: agendarPara ? agendarPara.toISOString() : null } });
      }

      this.atualizar(job, { status: 'concluido', etapa: publica ? 'Publicado' : 'Pronto', progresso: 1, restanteSeg: null, concluidoEm: new Date().toISOString() });
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      const cancelado = e.message === 'CANCELADO' || job.cancelado;
      this.atualizar(job, {
        status: cancelado ? 'cancelado' : 'erro',
        etapa: cancelado ? 'Cancelado' : 'Erro',
        erro: cancelado ? null : e.message,
        restanteSeg: null,
      });
      if (cancelado) fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }
}

// Devolve uma pasta onde dá pra gravar. Aceita raiz de disco (E:\\).
// Se a pasta escolhida não existir ou não deixar gravar, explica o motivo.
function pastaDeSaida(escolhida) {
  const pasta = escolhida ? path.resolve(escolhida) : path.join(os.homedir(), 'Videos');
  const ehRaiz = path.parse(pasta).root === pasta;
  if (!fs.existsSync(pasta)) {
    if (ehRaiz) throw new Error(`O disco ${pasta} não foi encontrado. Ele está conectado? Escolha outra pasta em Saída.`);
    try {
      fs.mkdirSync(pasta, { recursive: true });
    } catch (e) {
      throw new Error(`Não consegui criar a pasta ${pasta} (${e.code || e.message}). Escolha outra pasta em Saída.`);
    }
  }
  // Teste de gravação
  const teste = path.join(pasta, `.youvideo-teste-${process.pid}`);
  try {
    fs.writeFileSync(teste, 'ok');
    fs.rmSync(teste, { force: true });
  } catch (e) {
    throw new Error(`O Windows não deixou gravar em ${pasta} (${e.code || e.message}). Crie uma pasta dentro dele (ex.: ${path.join(pasta, 'Videos')}) e escolha ela em Saída.`);
  }
  return pasta;
}

function moverArquivo(de, para) {
  try {
    fs.renameSync(de, para);
  } catch {
    // Outra unidade (ex.: E:\) — copia e apaga
    fs.copyFileSync(de, para);
    fs.rmSync(de, { force: true });
  }
}

module.exports = { Fila };
