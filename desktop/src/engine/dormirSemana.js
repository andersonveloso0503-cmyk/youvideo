// Sons para dormir — "Criar a semana": faz 1 vídeo por tema, um atrás do outro, e já manda cada um
// para a fila de envio AGENDADO no YouTube (1 por dia, no horário escolhido).
// Cada passo fica salvo: se fechar o app, é só clicar em "Continuar" que ele segue de onde parou
// (sem gastar crédito de novo no que já ficou pronto).
//
// Passos de cada dia: cenas (fal.ai) → som ambiente (fal.ai) → músicas (Estúdio) → vídeo (PC) → agendado
const fs = require('fs');
const path = require('path');
const Dormir = require('./dormir');

const PASSOS = ['cenas', 'som', 'musicas', 'video', 'aprovar', 'agendado'];

async function emLotes(n, total, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, total) }, async () => {
      while (i < total) {
        const k = i++;
        await fn(k);
      }
    })
  );
}

function lerJson(arquivo) {
  try {
    const t = fs.readFileSync(arquivo, 'utf8').replace(/\u0000/g, '').trim();
    if (!t) return null;
    const j = JSON.parse(t);
    return j && Array.isArray(j.dias) ? j : null;
  } catch {
    return null;
  }
}

// Os temas ficam no arquivo da tela (dormirTemas.js); aqui só precisamos ler a lista
function carregarTemas() {
  try {
    const t = fs.readFileSync(path.join(__dirname, '..', '..', 'renderer', 'dormirTemas.js'), 'utf8');
    return JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
  } catch {
    return [];
  }
}

class DormirSemana {
  /** opcoes: { arquivo, pastaBase, fontsDir, obterConfig, adicionarEnvios, aoMudar } */
  constructor(op) {
    Object.assign(this, op);
    this.rodando = false;
    this.cancelado = false;
    this.cancelarAtual = null;
    // Lê a semana salva. Se o arquivo estragou (PC desligou/travou no meio da gravação), usa a cópia
    // de segurança; se nem ela existir, remonta a semana a partir das pastas (nada que já ficou pronto se perde).
    this.estado = lerJson(this.arquivo) || lerJson(this.arquivo + '.bak');
    this.recuperado = false;
    if (!this.estado) {
      try {
        const r = this.montarDaPasta();
        if (r) {
          this.estado = r;
          this.recuperado = true;
          this.salvar();
        }
      } catch {
        /* sem pasta da semana: começa vazio */
      }
    }
    try {
      this.consertarSemMusica();
    } catch {}
  }

  // Grava sem risco de estragar: escreve num arquivo novo e troca de uma vez (e guarda a versão anterior)
  salvar() {
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    const tmp = this.arquivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.estado, null, 1));
    try {
      if (lerJson(this.arquivo)) fs.copyFileSync(this.arquivo, this.arquivo + '.bak');
    } catch {}
    fs.renameSync(tmp, this.arquivo);
    this.aoMudar && this.aoMudar(this.paraTela());
  }

  /**
   * Remonta a semana olhando a pasta "Sons para dormir/Semana": cada dia tem uma pasta "<tema>-AAAA-MM-DD"
   * com as cenas, sons e músicas, e o vídeo "AAAA-MM-DD - <tema>.mp4". O que já foi para a fila de envio
   * volta como agendado; o resto volta para você aprovar ou para continuar de onde parou.
   */
  montarDaPasta() {
    const base = path.join(this.pastaBase(), 'Semana');
    if (!fs.existsSync(base)) return null;
    const temas = carregarTemas();
    const cfg = (this.obterConfig && this.obterConfig()) || {};
    const pref = cfg.dormirSemana || {};
    const [hh, mm] = String(pref.hora || '20:00').split(':').map(Number);
    const envios = (this.listarEnvios && this.listarEnvios()) || [];
    const naFila = (arq) => envios.find((j) => j.tipo === 'envio' && j.envio?.arquivo && path.resolve(j.envio.arquivo) === path.resolve(arq) && j.status !== 'cancelado');
    const arquivos = (dir, exts) => {
      try {
        return fs.readdirSync(dir).filter((f) => exts.includes(path.extname(f).toLowerCase()) && !f.endsWith('.parcial')).map((f) => path.join(dir, f)).sort();
      } catch {
        return [];
      }
    };
    const dias = [];
    for (const nome of fs.readdirSync(base)) {
      const m = /^(.+)-(\d{4})-(\d{2})-(\d{2})$/.exec(nome);
      const pasta = path.join(base, nome);
      if (!m || !fs.statSync(pasta).isDirectory()) continue;
      const tema = temas.find((t) => Dormir.slug(t.nome) === m[1]) || { id: m[1], nome: m[1].replace(/-/g, ' '), titulo: m[1].replace(/-/g, ' '), descricao: '', tags: '', prompt: '', movimento: '', somPrompt: '', musicaPrompt: '' };
      const data = `${m[2]}-${m[3]}-${m[4]}`;
      const quando = new Date(Number(m[2]), Number(m[3]) - 1, Number(m[4]), hh || 20, mm || 0, 0);
      // Cenas: a imagem e, se tiver, a animação com o mesmo nome
      const cenas = arquivos(path.join(pasta, 'cenas'), ['.jpg', '.jpeg', '.png', '.webp']).map((img) => {
        const vid = img.replace(/\.[^.]+$/, '.mp4');
        return { imagem: img, video: fs.existsSync(vid) ? vid : null, ia: true };
      });
      const sons = arquivos(path.join(pasta, 'sons'), ['.mp3', '.wav', '.m4a', '.flac']).map((a, i) => ({ arquivo: a, titulo: `Som ambiente ${i + 1}`, duracao: 0 }));
      const musicas = arquivos(path.join(pasta, 'musicas'), ['.mp3', '.wav', '.m4a', '.flac']).map((a, i) => ({ arquivo: a, titulo: `Música ${i + 1}`, duracao: 0 }));
      const nomeVideo = path.join(base, `${data} - ${tema.nome}`.replace(/[\\/:*?"<>|#]+/g, ' ') + '.mp4');
      const temVideo = fs.existsSync(nomeVideo) && fs.statSync(nomeVideo).size > 1e6;
      const capa = nomeVideo.slice(0, -4) + '.jpg';
      const video = temVideo ? { arquivo: nomeVideo, capa: fs.existsSync(capa) ? capa : null, duracao: 0 } : null;
      const job = temVideo ? naFila(nomeVideo) : null;
      let passo = 'cenas';
      let etapa = 'Recuperado: clique em Continuar para terminar este dia (o que já estava pronto não é refeito)';
      if (job) {
        passo = 'agendado';
        etapa = job.status === 'concluido' ? 'Recuperado: já enviado para o YouTube' : 'Recuperado: já está na fila de envio';
      } else if (temVideo) {
        passo = 'aprovar';
        etapa = quando.getTime() < Date.now() ? 'Recuperado: vídeo pronto, mas a data já passou. Se aprovar, ele publica logo depois de subir' : 'Recuperado: vídeo pronto. Assista a prévia e aprove';
      }
      dias.push({ tema, quando: quando.toISOString(), passo, etapa, erro: '', cenas, sons, musicas, video, aprovado: false, exigeAprovar: true, recuperado: true });
    }
    if (!dias.length) return null;
    dias.sort((a, b) => a.quando.localeCompare(b.quando));
    const canal = (cfg._canais || []).find((c) => c.id === pref.canalId);
    return {
      id: Date.now().toString(36),
      criadoEm: new Date().toISOString(),
      recuperadoEm: new Date().toISOString(),
      plano: {
        canalId: pref.canalId || '',
        canalNome: canal?.titulo || '',
        inicio: dias[0].quando.slice(0, 10),
        hora: pref.hora || '20:00',
        horas: Number(pref.horas) || 2,
        resolucao: pref.res || '1080',
        trocaMin: 25,
        animar: pref.animar !== false,
        aprovar: true,
        qtdCenas: Number(pref.cenas) || 3,
        qtdSons: 5,
        qtdMusicas: pref.musicas != null ? Number(pref.musicas) : 8,
        motorMusica: pref.motor || 'lyria',
        volAmbiente: Number(pref.volAmb ?? 45),
        volMusica: Number(pref.volMus ?? 80),
      },
      dias,
    };
  }

  /** Botão "Procurar na pasta": refaz a lista a partir das pastas (não apaga nada). */
  recuperarDaPasta() {
    if (this.rodando) throw new Error('Espere terminar (ou cancele) antes de procurar na pasta.');
    const r = this.montarDaPasta();
    if (!r) throw new Error('Não achei nenhum vídeo da semana na pasta "Sons para dormir\\Semana".');
    this.estado = r;
    this.recuperado = true;
    this.salvar();
    return this.paraTela();
  }

  paraTela() {
    if (!this.estado) return null;
    return { ...this.estado, rodando: this.rodando, recuperado: this.recuperado };
  }

  /**
   * plano: { canalId, canalNome, inicio:'AAAA-MM-DD', hora:'HH:MM', horas, resolucao, trocaMin, animar, qtdCenas,
   *          qtdSons, qtdMusicas, motorMusica, volAmbiente, volMusica, temas:[{id,nome,titulo,descricao,tags,prompt,movimento,somPrompt,musicaPrompt,capaFrase,capaDestaque}] }
   */
  novo(plano) {
    if (this.rodando) throw new Error('A semana já está sendo criada. Espere terminar ou cancele.');
    if (!plano.canalId) throw new Error('Escolha o canal do YouTube.');
    if (!plano.temas?.length) throw new Error('Marque pelo menos um tema.');
    const [a, m, d] = String(plano.inicio).split('-').map(Number);
    const [hh, mm] = String(plano.hora || '20:00').split(':').map(Number);
    const primeiro = new Date(a, m - 1, d, hh, mm, 0);
    if (isNaN(primeiro) || primeiro.getTime() < Date.now() + 60 * 60e3) throw new Error('O primeiro dia precisa ser pelo menos 1 hora no futuro.');
    this.estado = {
      id: Date.now().toString(36),
      criadoEm: new Date().toISOString(),
      plano: { ...plano, temas: undefined },
      dias: plano.temas.map((t, i) => {
        const quando = new Date(primeiro);
        quando.setDate(quando.getDate() + i);
        return { tema: t, quando: quando.toISOString(), passo: 'cenas', etapa: 'Esperando', erro: '', cenas: [], sons: [], musicas: [], video: null };
      }),
    };
    this.salvar();
    return this.rodar();
  }

  // Parar NA HORA: a tela já fica livre; o pedido que estava no meio (uma música ou cena na internet)
  // termina sozinho por trás e é guardado, mas nada novo começa
  cancelar() {
    this.cancelado = true;
    this.cancelarAtual && this.cancelarAtual();
    if (this.aoCancelar) this.aoCancelar();
  }

  limpar() {
    if (this.rodando) throw new Error('Cancele antes de limpar.');
    this.estado = null;
    for (const f of [this.arquivo, this.arquivo + '.bak', this.arquivo + '.tmp']) {
      try {
        fs.rmSync(f, { force: true });
      } catch {}
    }
    this.recuperado = false;
    this.aoMudar && this.aoMudar(null);
  }

  marcar(dia, mudanca) {
    Object.assign(dia, mudanca);
    this.salvar();
  }

  checar() {
    if (this.cancelado) throw new Error('CANCELADO');
  }

  async rodar({ soFila = false } = {}) {
    if (this.rodando || !this.estado) return this.paraTela();
    this.rodando = true;
    // Se você parou e já clicou em Continuar, espera o pedido que ficou no meio acabar (sem fazer nada duas vezes)
    if (this.trabalhoAtual) {
      await this.trabalhoAtual;
      this.trabalhoAtual = null;
    }
    this.cancelado = false;
    this.salvar();
    try {
      // 1ª passada: tudo que falta. Se você aprovar ou recusar um vídeo enquanto o app ainda trabalha,
      // ele faz mais uma passada, só com os dias que você mexeu (sem tentar de novo os que deram erro).
      let primeira = !soFila;
      do {
        this.refazer = false;
        await this.passar(primeira);
        primeira = false;
      } while (this.refazer && !this.cancelado);
    } finally {
      this.rodando = false;
      this.cancelarAtual = null;
      this.salvar();
    }
    return this.paraTela();
  }

  /** Vídeos montados sem música (o Estúdio falhou) e ainda não enviados: volta para o passo das músicas. */
  consertarSemMusica() {
    const p = this.estado?.plano;
    if (!p || !(p.qtdMusicas > 0)) return 0;
    let n = 0;
    for (const dia of this.estado.dias) {
      if (dia.passo === 'agendado' || !dia.video) continue;
      const musicas = (dia.musicas || []).filter((m) => m?.arquivo && fs.existsSync(m.arquivo));
      if (musicas.length) continue;
      // o arquivo antigo (sem música) fica na pasta; o novo sai com outro nome
      Object.assign(dia, { video: null, passo: 'musicas', aprovado: false, fila: true, erro: '', etapa: 'Estava sem música: criando as músicas e montando de novo' });
      n++;
    }
    if (n) this.salvar();
    return n;
  }

  async passar(primeira) {
    if (primeira) this.consertarSemMusica();
    for (const dia of this.estado.dias) {
      if (dia.passo === 'agendado') continue;
      if (dia.tirado) continue; // você tirou este dia da semana
      if (dia.passo === 'aprovar' && !dia.aprovado) continue; // esperando a sua decisão
      if (!primeira && !dia.fila) continue;
      if (this.cancelado) break;
      dia.fila = false;
      this.diaAtual = dia;
      try {
        const trabalho = this.fazerDia(dia);
        this.trabalhoAtual = trabalho.catch(() => {});
        await Promise.race([trabalho, new Promise((_, falha) => (this.aoCancelar = () => falha(new Error('CANCELADO'))))]);
        this.aoCancelar = null;
      } catch (e) {
        this.aoCancelar = null;
        if (String(e?.message || e) === 'CANCELADO' || this.cancelado) {
          this.marcar(dia, { etapa: 'Parado (clique em Continuar para seguir de onde parou)', erro: '' });
          break;
        }
        // Um dia com problema não segura a semana: marca e segue para o próximo
        this.marcar(dia, { etapa: 'Deu erro', erro: String(e?.message || e).slice(0, 300) });
      }
    }
    this.diaAtual = null;
  }

  /** Tira um dia da semana (não cria nem envia). Os arquivos já feitos ficam na pasta. */
  tirarDia(i) {
    const dia = this.estado?.dias?.[Number(i)];
    if (!dia) throw new Error('Dia não encontrado.');
    if (dia.passo === 'agendado') throw new Error('Este já está agendado: use "Cancelar envio" no cartão dele.');
    if (this.rodando && this.diaAtual === dia) throw new Error('Este dia está sendo criado agora: clique em Cancelar (lá embaixo) e depois tire o dia.');
    this.marcar(dia, { tirado: true, erro: '', etapa: 'Tirado da semana: não será criado nem enviado' });
    return this.paraTela();
  }

  voltarDia(i) {
    const dia = this.estado?.dias?.[Number(i)];
    if (!dia) throw new Error('Dia não encontrado.');
    this.marcar(dia, { tirado: false, fila: true, erro: '', etapa: 'De volta à semana: clique em Continuar' });
    return this.paraTela();
  }

  /** Troca o motor das músicas da semana já criada (ex.: Lyria sem crédito → ElevenLabs) e libera os dias com erro. */
  trocarMotor(motor) {
    if (!this.estado) throw new Error('Nenhuma semana criada.');
    this.estado.plano.motorMusica = motor === 'elevenlabs' ? 'elevenlabs' : 'lyria';
    for (const dia of this.estado.dias) if (dia.erro && !dia.tirado && dia.passo !== 'agendado') Object.assign(dia, { erro: '', fila: true, etapa: 'Motor trocado: clique em Continuar' });
    this.salvar();
    return this.paraTela();
  }

  /** Você viu a prévia e gostou: agora sim vai para a fila de envio agendado. */
  aprovar(i) {
    const dia = this.estado?.dias?.[i];
    if (!dia || dia.passo !== 'aprovar') throw new Error('Esse vídeo não está esperando aprovação.');
    this.marcar(dia, { aprovado: true, passo: 'video', fila: true, etapa: 'Aprovado: indo para a fila de envio' });
    this.refazer = true;
    return this.rodar({ soFila: true });
  }

  /** Não gostou: apaga as cenas e o vídeo deste dia e faz tudo de novo com cenas novas (o som e as músicas ficam). */
  recusar(i) {
    const dia = this.estado?.dias?.[i];
    if (!dia || dia.passo !== 'aprovar') throw new Error('Esse vídeo não está esperando aprovação.');
    const base = path.resolve(this.pastaBase());
    const apagar = (f) => {
      try {
        // só apaga arquivos que o próprio app criou, dentro da pasta dele
        if (f && path.resolve(f).startsWith(base + path.sep)) fs.rmSync(f, { force: true });
      } catch {}
    };
    for (const c of dia.cenas || []) [c.imagem, c.video].forEach(apagar);
    [dia.video?.arquivo, dia.video?.capa].forEach(apagar);
    this.marcar(dia, {
      passo: 'cenas',
      cenas: [],
      video: null,
      aprovado: false,
      fila: true,
      tentativa: (dia.tentativa || 0) + 1,
      erro: '',
      etapa: 'Você pediu outro: criando novas cenas',
    });
    this.refazer = true;
    return this.rodar({ soFila: true });
  }

  /**
   * Dia que já ficou pronto ou já foi agendado: refaz SÓ as cenas e a montagem do vídeo.
   * O som ambiente e as músicas que já estão no PC são reaproveitados (não gasta crédito deles de novo).
   * O vídeo novo passa pela prévia (você aprova) e entra na fila no mesmo dia e hora.
   * Se o vídeo antigo já foi para a fila de envio, o arquivo dele não é apagado.
   */
  refazerCenas(indices, { forcar = false } = {}) {
    const lista = [...new Set((Array.isArray(indices) ? indices : [indices]).map(Number))];
    const dias = lista.map((i) => this.estado?.dias?.[i]);
    if (!lista.length || dias.some((d) => !d)) throw new Error('Dia não encontrado.');
    if (this.rodando) throw new Error('Espere o que está sendo feito terminar (ou cancele) para refazer as cenas.');
    const existe = (l) => (l || []).filter((x) => x?.arquivo && fs.existsSync(x.arquivo)).length;
    const semSom = dias.filter((dia) => (dia.sons || []).length > existe(dia.sons) || (dia.musicas || []).length > existe(dia.musicas) || existe(dia.sons) + existe(dia.musicas) === 0);
    if (semSom.length && !forcar) throw new Error(`FALTAM_SONS: o som ambiente ou as músicas de ${semSom.map((d) => `"${d.tema.nome}"`).join(', ')} não estão mais no PC. Refazer vai gastar crédito deles também.`);
    const base = path.resolve(this.pastaBase());
    const apagar = (f) => {
      try {
        if (f && path.resolve(f).startsWith(base + path.sep)) fs.rmSync(f, { force: true });
      } catch {}
    };
    for (const dia of dias) {
      for (const c of dia.cenas || []) [c.imagem, c.video].forEach(apagar);
      if (dia.passo !== 'agendado') [dia.video?.arquivo, dia.video?.capa].forEach(apagar); // o já enviado fica
      this.marcar(dia, {
        passo: 'cenas',
        cenas: [],
        video: null,
        aprovado: false,
        exigeAprovar: true,
        fila: true,
        tentativa: (dia.tentativa || 0) + 1,
        erro: '',
        etapa: 'Na fila para refazer só as cenas (o som e as músicas ficam)',
      });
    }
    this.refazer = true;
    return this.rodar({ soFila: true });
  }

  /** Dados do envio ao YouTube deste dia (agendado para a data e hora dele). */
  montarEnvio(dia) {
    const p = this.estado.plano;
    const t = dia.tema;
    const descricao = String(t.descricao || '').replace(/\[NOME DO CANAL\]/g, p.canalNome || 'nosso canal');
    return {
      arquivo: dia.video.arquivo,
      titulo: String(t.titulo || t.nome).slice(0, 100),
      descricao,
      tags: String(t.tags || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      canalId: p.canalId,
      privacidade: 'private',
      agendarPara: dia.quando,
      capa: dia.video.capa || null,
      capaManual: !!dia.video.capa,
      curto: false,
      playlist: { titulo: 'Sons para Dormir', descricao: '' },
    };
  }

  /** Guarda no dia o que aconteceu com o envio (cancelado, publicado agora...). */
  anotarEnvio(i, campos) {
    const dia = this.estado?.dias?.[i];
    if (!dia) throw new Error('Dia não encontrado.');
    this.marcar(dia, campos);
  }

  async fazerDia(dia) {
    const p = this.estado.plano;
    const t = dia.tema;
    const cfg = this.obterConfig();
    const slug = Dormir.slug(`${t.nome}-${dia.quando.slice(0, 10)}`);
    const pasta = path.join(this.pastaBase(), 'Semana', slug);
    const vivo = (lista) => lista.filter((x) => x && (x.arquivo || x.imagem || x.video) && [x.arquivo, x.imagem, x.video].filter(Boolean).every((f) => fs.existsSync(f)));
    dia.erro = '';

    // 1) Cenas
    dia.cenas = vivo(dia.cenas);
    if (dia.cenas.length < p.qtdCenas) {
      this.marcar(dia, { passo: 'cenas', etapa: `Criando as cenas (${dia.cenas.length} de ${p.qtdCenas})` });
      const faltam = p.qtdCenas - dia.cenas.length;
      const baseCenas = dia.cenas.length;
      let erro = '';
      await emLotes(2, faltam, async (k) => {
        if (this.cancelado) return;
        // Cada "tentar outro" muda o ângulo da cena (as variações andam de 2 em 2), então vem algo diferente
        const indice = baseCenas + k + (dia.tentativa || 0) * 2;
        for (let tent = 0; tent < 2 && !this.cancelado; tent++) {
          try {
            const c = await Dormir.gerarCena({ falKey: cfg.falKey, prompt: t.prompt, movimento: t.movimento, indice, animar: p.animar !== false, pasta: path.join(pasta, 'cenas') });
            dia.cenas.push({ imagem: c.imagem, video: c.video, ia: true });
            this.marcar(dia, { etapa: `Criando as cenas (${dia.cenas.length} de ${p.qtdCenas})` });
            return;
          } catch (e) {
            erro = e.message;
          }
        }
      });
      this.checar();
      if (!dia.cenas.length) throw new Error(`Nenhuma cena saiu: ${erro}`);
    }

    // 2) Som ambiente
    dia.sons = vivo(dia.sons);
    if (p.qtdSons > 0 && dia.sons.length < p.qtdSons) {
      this.marcar(dia, { passo: 'som', etapa: `Criando o som ambiente (${dia.sons.length} de ${p.qtdSons})` });
      const baseSons = dia.sons.length;
      await emLotes(2, p.qtdSons - dia.sons.length, async (k) => {
        if (this.cancelado) return;
        try {
          const s = await Dormir.gerarSom({ falKey: cfg.falKey, texto: t.somPrompt, indice: baseSons + k, pasta: path.join(pasta, 'sons') });
          dia.sons.push(s);
          this.marcar(dia, { etapa: `Criando o som ambiente (${dia.sons.length} de ${p.qtdSons})` });
        } catch {
          /* uma versão a menos não atrapalha */
        }
      });
      this.checar();
      if (!dia.sons.length) throw new Error('O som ambiente não saiu (confira o crédito da fal.ai).');
    }

    // 3) Músicas pelo Estúdio
    dia.musicas = vivo(dia.musicas);
    if (p.qtdMusicas > 0 && dia.musicas.length < p.qtdMusicas) {
      this.marcar(dia, { passo: 'musicas', etapa: `Criando as músicas no Estúdio (${dia.musicas.length} de ${p.qtdMusicas})` });
      let erro = '';
      const baseMusicas = dia.musicas.length;
      await emLotes(2, p.qtdMusicas - dia.musicas.length, async (k) => {
        if (this.cancelado) return;
        const indice = baseMusicas + k;
        for (let tent = 0; tent < 2 && !this.cancelado; tent++) {
          try {
            const m = await Dormir.gerarMusicaEstudio({
              cfg,
              prompt: t.musicaPrompt,
              segundos: 180,
              indice,
              motor: p.motorMusica,
              titulo: `${t.nome} ${indice + 1} (Sons para dormir)`,
              pasta: path.join(pasta, 'musicas'),
            });
            dia.musicas.push(m);
            const aviso = m.motor && m.motor !== p.motorMusica ? ` · ${p.motorMusica === 'lyria' ? 'Lyria' : 'ElevenLabs'} sem crédito, usando ${m.motor === 'lyria' ? 'Lyria' : 'ElevenLabs'}` : '';
            this.marcar(dia, { etapa: `Criando as músicas no Estúdio (${dia.musicas.length} de ${p.qtdMusicas})${aviso}` });
            return;
          } catch (e) {
            erro = e.message;
          }
        }
      });
      this.checar();
      // Você pediu música: sem nenhuma, NÃO monta o vídeo só com o som ambiente — para e mostra o motivo
      // (clique em Continuar depois de resolver; as cenas e o som já feitos são aproveitados)
      if (!dia.musicas.length) throw new Error(`As músicas não saíram do Estúdio, por isso o vídeo não foi montado (só teria a chuva). Motivo: ${erro || 'desconhecido'}`);
    }

    // 4) Vídeo
    if (!dia.video?.arquivo || !fs.existsSync(dia.video.arquivo)) {
      this.checar();
      this.marcar(dia, { passo: 'video', etapa: 'Montando o vídeo' });
      const nomeCanal = p.canalNome || '';
      const r = await Dormir.gerarVideo({
        cenas: dia.cenas,
        movimento: t.movimento,
        ambientes: dia.sons.map((s) => s.arquivo),
        musicas: dia.musicas.map((m) => m.arquivo),
        volAmbiente: p.volAmbiente,
        volMusica: p.volMusica,
        horas: p.horas,
        trocaMin: p.trocaMin,
        resolucao: p.resolucao,
        capaFrase: t.capaFrase,
        capaDestaque: t.capaDestaque,
        fontsDir: this.fontsDir,
        pasta: path.join(this.pastaBase(), 'Semana'),
        nome: `${dia.quando.slice(0, 10)} - ${t.nome}`.replace(/[\\/:*?"<>|#]+/g, ' '),
        registrarCancelar: (fn) => (this.cancelarAtual = fn),
        onProgresso: (_f, pct, texto) => {
          dia.etapa = `Montando o vídeo: ${texto} (${Math.round(pct * 100)}%)`;
          this.aoMudar && this.aoMudar(this.paraTela());
        },
      });
      this.cancelarAtual = null;
      this.marcar(dia, { video: { ...r, qtdMusicas: dia.musicas.length, qtdSons: dia.sons.length }, etapa: `Vídeo pronto (${dia.musicas.length} música${dia.musicas.length === 1 ? '' : 's'} + som ambiente)` });
    }

    // 4b) Prévia: o vídeo só vai para o YouTube depois que você assistir e aprovar
    if ((p.aprovar !== false || dia.exigeAprovar) && !dia.aprovado) {
      this.marcar(dia, { passo: 'aprovar', etapa: 'Pronto! Assista a prévia e aprove, ou peça outro' });
      return;
    }

    // 5) Agendar no YouTube (sobe agora como privado e publica sozinho no dia/hora)
    this.checar();
    this.adicionarEnvios([this.montarEnvio(dia)]);
    this.marcar(dia, { passo: 'agendado', etapa: `Na fila de envio: publica em ${new Date(dia.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` });
  }
}

module.exports = { DormirSemana, PASSOS };
