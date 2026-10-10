// Fábrica de Música: todo dia cria um álbum de músicas cantadas para cada canal de música
// (gospel e "música normal"), faz a capa no Gemini, monta o vídeo longo e alguns Shorts,
// e deixa tudo PRONTO PARA APROVAR — nada sobe para o YouTube sem o dono clicar.
//
// Passos de cada álbum (cada um fica salvo, então dá para fechar o app e continuar depois):
//   planejar (títulos) → músicas (letra + áudio, 2 de cada vez) → capa (Gemini) → baixar → montar → pronto → aprovado
const fs = require('fs');
const path = require('path');
const Central = require('./central');

const CANAIS = {
  gospel: { nome: 'Gospel', gospel: true },
  normal: { nome: 'Músicas', gospel: false },
};
const PADRAO_CANAL = { ativo: false, canalId: '', estilos: [] };
const PADRAO = { gospel: { ...PADRAO_CANAL }, normal: { ...PADRAO_CANAL }, hora: '08:00', qtd: 10, shorts: 2, folgaDias: 3 };
const FORA_DO_NORMAL = ['infantil']; // estilos que não entram sozinhos no canal de música normal
const MAX_TENTATIVAS_DIA = 2;
// Quanto da letra precisa ser entendido ao ouvir a música (0 a 1). Abaixo disso a música é refeita.
const NOTA_MINIMA_LETRA = 0.5;
const palavras = (t) =>
  String(t || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ') // tira [Refrão], (2x) etc.
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
// Motor da semana: 5 dias Google Lyria (mais barato) e 2 dias ElevenLabs (quarta e sábado)
const DIAS_ELEVENLABS = [3, 6];
const motorDoDia = (d) => (DIAS_ELEVENLABS.includes(d.getDay()) ? 'elevenlabs' : 'lyria');

const hoje = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const limpo = (t) => String(t || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

async function emLotes(itens, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; await fn(itens[k], k); }
  }));
}

class MusicaAuto {
  /**
   * @param {object} o
   * @param {string} o.dirDados
   * @param {() => object} o.obterConfig      configuração do app (centralUrl, centralToken, groqKey, ultimoProjeto, musicaAuto)
   * @param {(cfg: object) => void} o.salvarConfig
   * @param {object} o.fila                   fila de vídeos (adicionar, lista, retentar, on('mudou'))
   * @param {(arquivos: string[]) => Promise<object[]>} o.infoMusicas
   * @param {string} o.pastaMusicas           onde os áudios ficam (Músicas/Youvideo Estúdio)
   * @param {(evento: string, dados: any) => void} o.enviar
   * @param {(titulo: string, texto: string) => void} [o.notificar]
   * @param {object} [o.central]              para testes
   */
  constructor(o) {
    Object.assign(this, o);
    this.central = o.central || Central;
    this.arquivo = path.join(o.dirDados, 'musica-auto.json');
    this.estado = this.carregar();
    this.rodando = null; // id do álbum em andamento
    this.cadeia = Promise.resolve();
    this.presetsCache = null;
    this.fila.on('mudou', () => this.conferirMontagem());
  }

  carregar() {
    try {
      const e = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
      // Fechou o app no meio: volta a ficar parado (continua do passo onde estava)
      for (const a of e.albuns || []) if (a.fase === 'trabalhando') a.fase = 'parado';
      return { albuns: [], ...e };
    } catch {
      return { albuns: [] };
    }
  }

  salvar() {
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    const tmp = this.arquivo + '.tmp';
    // guarda só os últimos 60 álbuns
    this.estado.albuns = this.estado.albuns.slice(-60);
    fs.writeFileSync(tmp, JSON.stringify(this.estado, null, 1));
    fs.renameSync(tmp, this.arquivo);
  }

  prefs() {
    const c = this.obterConfig().musicaAuto || {};
    return {
      ...PADRAO,
      ...c,
      gospel: { ...PADRAO_CANAL, ...(c.gospel || {}) },
      normal: { ...PADRAO_CANAL, ...(c.normal || {}) },
    };
  }

  salvarPrefs(novas) {
    const atual = this.prefs();
    const m = { ...atual, ...novas, gospel: { ...atual.gospel, ...(novas.gospel || {}) }, normal: { ...atual.normal, ...(novas.normal || {}) } };
    m.qtd = Math.max(5, Math.min(20, Number(m.qtd) || 10));
    m.shorts = Math.max(0, Math.min(5, Number(m.shorts) || 0));
    m.folgaDias = Math.max(1, Math.min(30, Number(m.folgaDias) || 3));
    this.salvarConfig({ musicaAuto: m });
    this.avisarTela();
    return m;
  }

  async presets() {
    if (this.presetsCache) return this.presetsCache;
    const { presets } = await this.central.chamar(this.obterConfig(), '/api/central/musica-auto');
    this.presetsCache = presets;
    return presets;
  }

  /** Para a tela: preferências, estilos e álbuns (mais novos primeiro). */
  async resumo() {
    let presets = [];
    try { presets = await this.presets(); } catch { /* sem internet: a tela mostra sem os estilos */ }
    return {
      prefs: this.prefs(),
      presets: presets.map(({ id, nome, gospel }) => ({ id, nome, gospel })),
      rodando: this.rodando,
      pulos: Object.fromEntries(Object.entries(this.estado.pulos || {}).filter(([, v]) => v.dia === hoje())),
      albuns: [...this.estado.albuns].reverse().slice(0, 20).map((a) => ({
        id: a.id, canal: a.canal, dia: a.dia, preset: a.presetNome, motor: a.motor, fase: a.fase, etapa: a.etapa, erro: a.erro,
        titulo: a.capa?.titulo || '', subtitulo: a.capa?.subtitulo || '', capa: a.capa?.capaArquivo || null,
        musicas: (a.musicas || []).filter(Boolean).map((m) => m.titulo), total: a.ideias?.length || 0,
        prontas: (a.musicas || []).filter((m) => m && m.url).length,
        recusadas: a.recusadas || 0,
      })),
    };
  }

  avisarTela() {
    this.enviar('musicaAuto:mudou', null);
  }

  marcar(a, campos) {
    Object.assign(a, campos);
    this.salvar();
    this.avisarTela();
  }

  /** Estilos que valem para o canal (o que o dono marcou, ou todos do grupo). */
  estilosDoCanal(canal, presets) {
    const p = this.prefs()[canal];
    const doGrupo = presets.filter((x) => (canal === 'gospel' ? x.gospel : !x.gospel && !FORA_DO_NORMAL.includes(x.id)));
    const marcados = doGrupo.filter((x) => (p.estilos || []).includes(x.id));
    return marcados.length ? marcados : doGrupo;
  }

  /** Chamado de tempos em tempos: começa o álbum do dia na hora marcada. */
  verificarAgenda(agora = new Date()) {
    const p = this.prefs();
    const [h, m] = String(p.hora || '08:00').split(':').map(Number);
    const naHora = agora.getHours() * 60 + agora.getMinutes() >= (h || 0) * 60 + (m || 0);
    if (!naHora) return;
    for (const canal of Object.keys(CANAIS)) {
      if (!p[canal].ativo || !p[canal].canalId) continue;
      const doDia = this.estado.albuns.filter((a) => a.canal === canal && a.dia === hoje(agora) && a.auto);
      const andando = doDia.find((a) => !['erro', 'pronto', 'aprovado'].includes(a.fase));
      if (andando) { if (andando.fase === 'parado') this.fazer(canal, { continuar: andando.id }); continue; }
      if (doDia.some((a) => ['pronto', 'aprovado', 'montando'].includes(a.fase))) continue;
      const comErro = doDia.find((a) => a.fase === 'erro');
      // Com erro: tenta de novo sozinho só mais uma vez no dia (depois fica para o dono ver)
      if (comErro) { if ((comErro.tentativas || 0) < MAX_TENTATIVAS_DIA - 1) this.fazer(canal, { continuar: comErro.id, auto: true }); }
      else if (!doDia.length) this.talvezComecar(canal, agora);
    }
  }

  /**
   * Antes de criar o álbum do dia, olha o que o canal já tem marcado no YouTube (e na fila do PC).
   * Não cria se: já tem álbum esperando aprovação, ou já tem vídeo longo agendado para os próximos dias.
   * Olha o YouTube no máximo 1 vez por dia por canal (gasta pouco da cota).
   */
  async talvezComecar(canal, agora = new Date()) {
    this.estado.pulos = this.estado.pulos || {};
    const dia = hoje(agora);
    if (this.estado.pulos[canal]?.dia === dia) return;
    if (this.olhando?.[canal]) return;
    this.olhando = { ...(this.olhando || {}), [canal]: true };
    try {
      const motivo = await this.motivoParaPular(canal, agora);
      if (motivo) {
        this.estado.pulos[canal] = { dia, texto: motivo };
        this.salvar();
        this.avisarTela();
        return;
      }
      delete this.estado.pulos[canal];
      this.fazer(canal, { auto: true });
    } finally {
      this.olhando[canal] = false;
    }
  }

  async motivoParaPular(canal, agora = new Date()) {
    const esperando = this.estado.albuns.filter((a) => a.canal === canal && a.fase === 'pronto');
    if (esperando.length) return `Hoje não fiz álbum novo: ${esperando.length > 1 ? `${esperando.length} álbuns estão` : 'um álbum está'} esperando você aprovar.`;
    const r = await this.resumoAgenda(canal, agora);
    if (r && r.ultimoLongo && new Date(r.ultimoLongo).getTime() - agora.getTime() >= this.prefs().folgaDias * 86400e3) {
      const ate = new Date(r.ultimoLongo).toLocaleDateString('pt-BR');
      return `Hoje não fiz álbum novo: o canal já tem vídeo longo agendado até ${ate}. Volto a fazer quando faltar menos de ${this.prefs().folgaDias} dias.`;
    }
    return '';
  }

  /** O que o canal já tem marcado no futuro (para a tela e para decidir se faz álbum novo). */
  async resumoAgenda(canal, agora = new Date()) {
    const canalId = this.prefs()[canal]?.canalId;
    if (!canalId || !this.verAgenda) return null;
    const lista = await this.verAgenda(canalId).catch(() => null);
    if (!lista) return null; // não deu para olhar o YouTube: segue normal
    const futuros = lista.filter((x) => new Date(x.quando).getTime() > agora.getTime());
    const longos = futuros.filter((x) => !x.curto);
    return {
      total: futuros.length,
      longos: longos.length,
      shorts: futuros.length - longos.length,
      ultimo: futuros.length ? futuros[futuros.length - 1].quando : null,
      ultimoLongo: longos.length ? longos[longos.length - 1].quando : null,
      naFila: futuros.filter((x) => x.naFila).length,
    };
  }

  /** Põe um álbum na vez (um de cada vez: os motores de música aceitam poucos pedidos juntos). */
  fazer(canal, { continuar = null, auto = false } = {}) {
    if (!CANAIS[canal]) throw new Error('Canal desconhecido.');
    if (continuar && this.rodando === continuar) return continuar;
    let a = continuar ? this.estado.albuns.find((x) => x.id === continuar) : null;
    if (a && a.fase === 'na vez') return a.id; // já está esperando a vez
    if (!a) {
      a = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, canal, dia: hoje(), auto, fase: 'na vez', etapa: 'Esperando a vez', criadoEm: new Date().toISOString(), tentativas: 0 };
      this.estado.albuns.push(a);
    } else {
      // retentativa de álbum com erro conta como mais uma tentativa no dia
      if (a.fase === 'erro' && auto) a.tentativas = (a.tentativas || 0) + 1;
      a.fase = 'na vez';
      a.erro = '';
      a.etapa = 'Esperando a vez';
    }
    this.salvar();
    this.avisarTela();
    const id = a.id;
    this.cadeia = this.cadeia.then(() => this.rodar(id)).catch(() => {});
    return id;
  }

  async rodar(id) {
    const a = this.estado.albuns.find((x) => x.id === id);
    if (!a || ['pronto', 'aprovado'].includes(a.fase)) return;
    this.rodando = id;
    a.fase = 'trabalhando';
    try {
      await this.passos(a);
    } catch (e) {
      this.marcar(a, { fase: 'erro', erro: String(e.message || e).slice(0, 300), etapa: 'Parou com erro' });
    } finally {
      this.rodando = null;
      this.avisarTela();
    }
  }

  async passos(a) {
    const cfg = () => this.obterConfig();
    const prefs = this.prefs();
    const presets = await this.presets();
    const info = CANAIS[a.canal];

    // 1) Estilo e motor (alterna estilos e motores entre os dias)
    if (!a.presetId) {
      const anteriores = this.estado.albuns.filter((x) => x.canal === a.canal && x.id !== a.id && x.presetId);
      const opcoes = this.estilosDoCanal(a.canal, presets);
      const recentes = anteriores.slice(-opcoes.length + 1).map((x) => x.presetId);
      const escolhido = opcoes.find((x) => !recentes.includes(x.id)) || opcoes[anteriores.length % opcoes.length];
      const motor = motorDoDia(new Date(`${a.dia}T12:00:00`));
      this.marcar(a, { presetId: escolhido.id, presetNome: escolhido.nome, motor, canalId: prefs[a.canal].canalId });
    }
    const preset = presets.find((x) => x.id === a.presetId);
    if (!preset) throw new Error('O estilo deste álbum não existe mais.');

    // 2) Títulos das músicas
    if (!a.ideias?.length) {
      this.marcar(a, { etapa: 'Planejando as músicas' });
      const evitar = this.estado.albuns.flatMap((x) => (x.ideias || []).map((i) => i.titulo)).slice(-80);
      const pl = await this.central.chamar(cfg(), '/api/estudio/letra', {
        metodo: 'POST',
        corpo: { acao: 'planoAlbum', quantidade: prefs.qtd, estilo: preset.nome, gospel: preset.gospel, tema: preset.tema, evitar },
      });
      this.marcar(a, { ideias: pl.ideias, musicas: Array(pl.ideias.length).fill(null), grupoId: `auto-${a.id}` });
    }

    const pasta = path.join(this.pastaMusicas, limpo(`${info.nome} ${a.dia} ${preset.nome}`) || a.id);
    fs.mkdirSync(pasta, { recursive: true });

    // 3) Músicas (letra + áudio), 2 ao mesmo tempo, cada uma tenta 2 vezes.
    //    Cada música é OUVIDA (transcrição) e comparada com a letra: se a letra cantada não bate
    //    (palavras emboladas, trocadas, gritaria), ela é refeita; se falhar de novo, fica de fora do álbum.
    const faltam = a.ideias.map((_, i) => i).filter((i) => !a.musicas[i]?.url);
    if (faltam.length) {
      let feitas = a.ideias.length - faltam.length;
      this.marcar(a, { etapa: `Criando as músicas (${feitas} de ${a.ideias.length})` });
      await emLotes(faltam, 2, async (k) => {
        const ideia = a.ideias[k];
        const voz = preset.vozes[k % preset.vozes.length];
        for (let t = 1; t <= 2; t++) {
          try {
            const l = await this.central.chamar(cfg(), '/api/estudio/letra', {
              metodo: 'POST',
              corpo: {
                acao: 'letra',
                tema: `${ideia.angulo} (título: "${ideia.titulo}"; tema do álbum: ${preset.tema})`,
                evitar: a.ideias.filter((_, i) => i !== k).map((x) => `"${x.titulo}"`).slice(0, 29),
                estilo: preset.nome,
                voz,
                detalhes: preset.instrumentos,
              },
            });
            const d = await this.central.chamar(cfg(), '/api/estudio/gerar', {
              metodo: 'POST',
              corpo: {
                motor: a.motor, modo: 'personalizado', titulo: ideia.titulo, letra: l.letra, estilo: preset.estilo,
                voz, instrumental: false, duracaoSeg: 180, grupoId: a.grupoId, versao: k + 1,
              },
            });
            const titulo = d.musica.titulo || ideia.titulo;
            const arquivo = await this.central.baixar(d.musica.audioUrl, path.join(pasta, `${String(k + 1).padStart(2, '0')} - ${limpo(titulo) || `Música ${k + 1}`}${t > 1 ? ` (${t})` : ''}.mp3`));
            const nota = await this.conferirLetra(arquivo, l.letra);
            if (nota !== null && nota < NOTA_MINIMA_LETRA) {
              fs.rmSync(arquivo, { force: true });
              a.recusadas = (a.recusadas || 0) + 1;
              throw new Error(`a letra cantada não ficou clara (${Math.round(nota * 100)}% das palavras entendidas)`);
            }
            a.musicas[k] = { titulo, url: d.musica.audioUrl, arquivo, notaLetra: nota };
            feitas++;
            this.marcar(a, { etapa: `Criando as músicas (${feitas} de ${a.ideias.length})` });
            return;
          } catch (e) {
            a.ultimoErroMusica = String(e.message || e).slice(0, 200);
          }
        }
      });
      const ok = a.musicas.filter((m) => m?.url).length;
      if (ok < Math.max(3, Math.ceil(a.ideias.length * 0.6))) throw new Error(`Só ${ok} música(s) deram certo. ${a.ultimoErroMusica || ''}`.trim());
    }

    // 4) Capa no Gemini (16:9 com o título, e um fundo em pé sem texto para os Shorts)
    if (!a.capa?.capaArquivo || !fs.existsSync(a.capa.capaArquivo)) {
      this.marcar(a, { etapa: 'Fazendo a capa no Gemini' });
      if (!a.capa?.capaUrl) {
        const evitar = this.estado.albuns.map((x) => x.capa?.titulo).filter(Boolean).slice(-30);
        const c = await this.central.chamar(cfg(), '/api/central/musica-auto', {
          metodo: 'POST',
          corpo: { acao: 'capa', estilo: preset.nome, gospel: preset.gospel, titulos: a.musicas.filter(Boolean).map((m) => m.titulo), evitar },
        });
        a.capa = { titulo: c.titulo, subtitulo: c.subtitulo, capaUrl: c.capaUrl, fundoUrl: c.fundoUrl };
        this.salvar();
      }
      const ext = (u) => (/\.jpe?g(\?|$)/i.test(u) ? 'jpg' : 'png');
      a.capa.capaArquivo = await this.central.baixar(a.capa.capaUrl, path.join(pasta, `00 - Capa.${ext(a.capa.capaUrl)}`));
      if (a.capa.fundoUrl) a.capa.fundoArquivo = await this.central.baixar(a.capa.fundoUrl, path.join(pasta, `00 - Fundo Shorts.${ext(a.capa.fundoUrl)}`)).catch(() => null);
      this.salvar();
    }

    // 5) Baixar os áudios
    const prontas = a.musicas.map((m, i) => ({ m, i })).filter((x) => x.m?.url);
    this.marcar(a, { etapa: 'Baixando as músicas' });
    for (const { m, i } of prontas) {
      if (m.arquivo && fs.existsSync(m.arquivo)) continue;
      m.arquivo = await this.central.baixar(m.url, path.join(pasta, `${String(i + 1).padStart(2, '0')} - ${limpo(m.titulo) || `Música ${i + 1}`}.mp3`));
    }
    this.salvar();

    // 6) Montar: 1 vídeo longo + alguns Shorts (começando no refrão)
    this.marcar(a, { etapa: 'Montando os vídeos' });
    const infos = await this.infoMusicas(prontas.map((x) => x.m.arquivo));
    const ordem = prontas.map((x) => x.m.arquivo);
    const musicas = infos
      .sort((x, y) => ordem.indexOf(x.arquivo) - ordem.indexOf(y.arquivo))
      .map((x) => ({ arquivo: x.arquivo, titulo: prontas.find((p) => p.m.arquivo === x.arquivo).m.titulo, duracao: x.duracao }));
    if (!musicas.length) throw new Error('Os áudios baixados não abriram.');

    const base = this.obterConfig().ultimoProjeto || {};
    const nome = limpo(`${a.capa.titulo}${a.capa.subtitulo ? ` - ${a.capa.subtitulo}` : ''}`) || limpo(`${preset.nome} ${a.dia}`);
    const comum = {
      enquadramento: 'auto',
      efeito: { estilo: 'onda', cor: '#d9a441', largura: 66, intensidade: 75, posX: 50, posY: 88, opacidade: 95, ...(base.efeito || {}) },
      textura: { granulado: 0, vinheta: true, escurecer: 15, ...(base.textura || {}) },
      audio: { crossfade: 2, normalizar: false, ...(base.audio || {}), somenteInstrumental: false },
      inscrever: { ativo: false },
      publicar: { ativo: false },
    };
    const longo = this.fila.adicionar({
      ...comum,
      nome,
      musicas,
      fundos: [a.capa.capaArquivo],
      legenda: { ...(base.legenda || {}), ativo: false, mostrarNome: false },
      formato: { tipo: 'longo', resolucao: base.formato?.resolucao || '1080', versoes: '', qtdVideos: '1', duracaoMaxMin: '', limiteMusicaSeg: '' },
      saida: { pasta: base.saida?.pasta || '', nome },
    });
    let shorts = [];
    const nShorts = Math.min(prefs.shorts, musicas.length);
    if (nShorts) {
      // Shorts das músicas espalhadas pelo álbum (não só as primeiras)
      const passo = musicas.length / nShorts;
      const escolhidas = Array.from({ length: nShorts }, (_, i) => musicas[Math.floor(i * passo)]);
      shorts = this.fila.adicionar({
        ...comum,
        nome: `${nome} - Short`,
        musicas: escolhidas,
        fundos: [a.capa.fundoArquivo || a.capa.capaArquivo],
        legenda: { idioma: 'pt', posicao: 'baixo', tamanho: 100, cor: '#ffffff', ...(base.legenda || {}), ativo: !!this.obterConfig().groqKey, mostrarNome: false },
        formato: { tipo: 'curto', resolucao: base.formato?.resolucao || '1080', versoes: '', qtdVideos: '', duracaoMaxMin: '1', limiteMusicaSeg: '', refrao: true },
        saida: { pasta: base.saida?.pasta || '', nome: `${nome} - Short` },
      });
    }
    this.marcar(a, { fase: 'montando', etapa: 'Montando os vídeos', jobs: { longo: longo.map((j) => j.id), shorts: shorts.map((j) => j.id) } });
    this.conferirMontagem();
  }

  /**
   * Ouve a música (transcrição da Groq) e diz quanto da letra foi entendido (0 a 1).
   * null = não deu para conferir (sem chave da Groq ou erro): a música segue.
   */
  async conferirLetra(arquivo, letra) {
    const cfg = this.obterConfig();
    if (!this.transcrever || !cfg.groqKey || !letra) return null;
    try {
      const linhas = await this.transcrever(arquivo, { groqKey: cfg.groqKey, idioma: 'pt', dirCache: this.dirCache });
      const ouvidas = new Set(palavras(linhas.map((l) => l.texto).join(' ')));
      const daLetra = [...new Set(palavras(letra))];
      if (daLetra.length < 8) return null;
      return daLetra.filter((w) => ouvidas.has(w)).length / daLetra.length;
    } catch {
      return null;
    }
  }

  /** Quando os vídeos de um álbum ficam prontos na fila, ele vira "pronto para aprovar". */
  conferirMontagem() {
    for (const a of this.estado.albuns) {
      if (a.fase !== 'montando' || !a.jobs) continue;
      const ids = [...a.jobs.longo, ...a.jobs.shorts];
      const jobs = ids.map((id) => this.fila.lista().find((j) => j.id === id));
      if (jobs.some((j) => !j)) { this.marcar(a, { fase: 'erro', erro: 'Os vídeos deste álbum foram tirados da fila.' }); continue; }
      const erro = jobs.find((j) => j.status === 'erro' || j.status === 'cancelado');
      if (erro) { this.marcar(a, { fase: 'erro', erro: `Vídeo "${erro.nome}": ${erro.erro || erro.status}` }); continue; }
      const feitos = jobs.filter((j) => j.status === 'concluido' && j.arquivoFinal).length;
      if (feitos < jobs.length) {
        const etapa = `Montando os vídeos (${feitos} de ${jobs.length})`;
        if (a.etapa !== etapa) this.marcar(a, { etapa });
        continue;
      }
      this.marcar(a, { fase: 'pronto', etapa: 'Pronto para você aprovar' });
      if (this.notificar) this.notificar('🎵 Álbum pronto para aprovar', `${a.capa?.titulo || a.presetNome} (${CANAIS[a.canal].nome}) — abra a Fábrica → Músicas.`);
    }
  }

  /** Vídeos de um álbum, no formato da janela "Subir p/ YouTube". */
  paraSubir(id) {
    const a = this.estado.albuns.find((x) => x.id === id);
    if (!a || !a.jobs) throw new Error('Álbum não encontrado.');
    const jobs = [...a.jobs.longo, ...a.jobs.shorts].map((jid) => this.fila.lista().find((j) => j.id === jid)).filter((j) => j?.arquivoFinal && fs.existsSync(j.arquivoFinal));
    if (!jobs.length) throw new Error('Os vídeos deste álbum não estão mais na pasta.');
    return {
      canalId: a.canalId || this.prefs()[a.canal].canalId,
      videos: jobs.map((j) => {
        const curto = j.projeto?.formato?.tipo === 'curto';
        return {
          arquivo: j.arquivoFinal,
          nome: j.nome,
          duracao: j.duracao,
          curto,
          // vídeo longo usa a capa do Gemini; o Short usa a miniatura dele (em pé)
          capa: curto ? j.capa || null : a.capa?.capaArquivo || j.capa || null,
          capaManual: !curto && !!a.capa?.capaArquivo,
          musicas: (j.timeline || []).map((t) => ({ titulo: t.titulo, inicio: t.inicio })),
          clima: j.clima || '',
        };
      }),
    };
  }

  aprovar(id) {
    const a = this.estado.albuns.find((x) => x.id === id);
    if (a) this.marcar(a, { fase: 'aprovado', etapa: 'Enviado para subir', aprovadoEm: new Date().toISOString() });
  }

  descartar(id) {
    const a = this.estado.albuns.find((x) => x.id === id);
    if (!a || this.rodando === id) return;
    this.estado.albuns = this.estado.albuns.filter((x) => x.id !== id);
    this.salvar();
    this.avisarTela();
  }

  /** "Tentar de novo": continua do passo onde parou (e refaz vídeos com erro na fila). */
  tentarDeNovo(id) {
    const a = this.estado.albuns.find((x) => x.id === id);
    if (!a) return;
    if (a.jobs && a.fase === 'erro') {
      const jobs = [...a.jobs.longo, ...a.jobs.shorts].map((jid) => this.fila.lista().find((j) => j.id === jid));
      if (jobs.every(Boolean)) {
        for (const j of jobs) if (j.status === 'erro' || j.status === 'cancelado') this.fila.retentar(j.id);
        this.marcar(a, { fase: 'montando', erro: '', etapa: 'Montando os vídeos' });
        return;
      }
      a.jobs = null; // vídeos sumiram da fila: monta de novo
    }
    this.fazer(a.canal, { continuar: a.id });
  }
}

module.exports = { MusicaAuto, CANAIS, hoje, motorDoDia, palavras };
