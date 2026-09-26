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
  constructor({ dirDados, fontsDir, obterConfig, obterCanal }) {
    super();
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
    const qtd = curto ? 0 : Number(projeto.formato.qtdVideos) || 0;
    const opcoes = { limiteMusicaSeg: Number(projeto.formato.limiteMusicaSeg) || 0, crossfade: Number(projeto.audio?.crossfade) || 0 };
    const grupos = qtd
      ? R.dividirEmQuantidade(musicas, qtd, opcoes)
      : R.dividirEmVideos(musicas, {
          duracaoMaxMin: curto ? Number(projeto.formato.duracaoMaxMin) || 1 : Number(projeto.formato.duracaoMaxMin) || 0,
          ...opcoes,
        });
    // Com quantidade escolhida, a duração máxima não corta nada
    if (qtd) projeto = { ...projeto, formato: { ...projeto.formato, duracaoMaxMin: '' } };
    const lote = crypto.randomBytes(4).toString('hex');
    const criados = grupos.map((grupo, i) => {
      const sufixo = grupos.length > 1 ? (curto ? ` - ${grupo[0].titulo}` : ` - Parte ${i + 1}`) : '';
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

  limpar() {
    this.jobs = this.jobs.filter((j) => EM_ANDAMENTO.includes(j.status) || j.status === 'aguardando');
    this.salvar();
    this.emitir();
  }

  proximo() {
    const cfg = this.obterConfig();
    const limite = cfg.modo === 'maximo' ? Math.max(1, Math.min(3, Number(cfg.simultaneos) || 1)) : 1;
    while (this.rodando.size < limite) {
      const j = this.jobs.find((x) => x.status === 'aguardando' && !this.rodando.has(x.id));
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

  async processar(job) {
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
      const pasta = p.saida?.pasta && fs.existsSync(p.saida.pasta) ? p.saida.pasta : path.join(os.homedir(), 'Videos');
      fs.mkdirSync(pasta, { recursive: true });
      const saida = caminhoLivre(pasta, nomeSeguro((p.saida?.nome || p.nome || 'compilacao') + (job.sufixo || '')));
      const temporario = path.join(dir, 'final.mp4');
      const encoder = cfg.encoder && cfg.encoder !== 'auto' ? cfg.encoder : await detectarEncoder();
      const inicioRender = Date.now();
      try {
        await R.renderizarFinal({
          fundo, audioArquivo: audio.arquivo, total: audio.total, W, H, efeito: p.efeito, textura: p.textura,
          assArquivo, fontsDir: path.join(dir, 'fonts'), saida: temporario, encoder, modo, dir, registrarCancelar,
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
            assArquivo, fontsDir: path.join(dir, 'fonts'), saida: temporario, encoder: 'libx264', modo, dir, registrarCancelar, onProgresso: progR,
          });
        } else throw e;
      }
      moverArquivo(temporario, saida);

      // Miniatura: primeira imagem de fundo
      let miniatura = null;
      const primeiraImg = (p.fundos || []).find((f) => R.ehImagem(f) && fs.existsSync(f));
      if (primeiraImg) {
        miniatura = path.join(dir, 'miniatura.jpg');
        try {
          await rodar(['-i', primeiraImg, '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', '-q:v', '3', '-frames:v', '1', miniatura]).promise;
        } catch {
          miniatura = null;
        }
      }

      this.atualizar(job, { arquivoFinal: saida, timeline: audio.timeline.map((t) => ({ titulo: t.titulo, inicio: t.inicio })), duracao: audio.total });

      // 7) Publicar
      if (publica) {
        checar();
        const progP = etapa('publicando', 'Enviando para o YouTube');
        const canal = this.obterCanal(p.publicar.canalId);
        if (!canal) throw new Error('Canal do YouTube não encontrado — conecte de novo em Contas YouTube.');
        const titulo = (p.publicar.titulo || p.nome || 'Compilação') + (job.partes > 1 ? job.sufixo : '');
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
            descricao: p.publicar.descricao,
            timeline: audio.timeline,
            incluirTracklist: p.publicar.incluirTracklist !== false,
            curto: p.formato.tipo === 'curto',
            tags: p.publicar.tags,
          }),
          tags: p.publicar.tags,
          privacidade: p.publicar.privacidade,
          agendarPara,
          miniatura: p.formato.tipo === 'curto' ? null : miniatura,
          onProgresso: (x) => {
            progP(x);
            this.atualizar(job, { etapa: `Enviando para o YouTube ${Math.round(x * 100)}%` }, false);
          },
        });
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
