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

class DormirSemana {
  /** opcoes: { arquivo, pastaBase, fontsDir, obterConfig, adicionarEnvios, aoMudar } */
  constructor(op) {
    Object.assign(this, op);
    this.rodando = false;
    this.cancelado = false;
    this.cancelarAtual = null;
    try {
      this.estado = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
    } catch {
      this.estado = null;
    }
  }

  salvar() {
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    fs.writeFileSync(this.arquivo, JSON.stringify(this.estado, null, 1));
    this.aoMudar && this.aoMudar(this.paraTela());
  }

  paraTela() {
    if (!this.estado) return null;
    return { ...this.estado, rodando: this.rodando };
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

  cancelar() {
    this.cancelado = true;
    this.cancelarAtual && this.cancelarAtual();
  }

  limpar() {
    if (this.rodando) throw new Error('Cancele antes de limpar.');
    this.estado = null;
    try {
      fs.rmSync(this.arquivo, { force: true });
    } catch {}
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

  async passar(primeira) {
    for (const dia of this.estado.dias) {
      if (dia.passo === 'agendado') continue;
      if (dia.passo === 'aprovar' && !dia.aprovado) continue; // esperando a sua decisão
      if (!primeira && !dia.fila) continue;
      if (this.cancelado) break;
      dia.fila = false;
      try {
        await this.fazerDia(dia);
      } catch (e) {
        if (String(e?.message || e) === 'CANCELADO') {
          this.marcar(dia, { etapa: 'Cancelado (clique em Continuar para seguir)', erro: '' });
          break;
        }
        // Um dia com problema não segura a semana: marca e segue para o próximo
        this.marcar(dia, { etapa: 'Deu erro', erro: String(e?.message || e).slice(0, 300) });
      }
    }
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
          this.marcar(dia, { etapa: `Criando as músicas no Estúdio (${dia.musicas.length} de ${p.qtdMusicas})` });
        } catch (e) {
          erro = e.message;
        }
      });
      this.checar();
      // Música é opcional: com pelo menos 3 já dá um bom ciclo; sem nenhuma, o vídeo sai só com o som ambiente
      if (!dia.musicas.length && !dia.sons.length) throw new Error(`As músicas não saíram: ${erro}`);
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
      this.marcar(dia, { video: r, etapa: 'Vídeo pronto' });
    }

    // 4b) Prévia: o vídeo só vai para o YouTube depois que você assistir e aprovar
    if (p.aprovar !== false && !dia.aprovado) {
      this.marcar(dia, { passo: 'aprovar', etapa: 'Pronto! Assista a prévia e aprove, ou peça outro' });
      return;
    }

    // 5) Agendar no YouTube (sobe agora como privado e publica sozinho no dia/hora)
    this.checar();
    const descricao = String(t.descricao || '').replace(/\[NOME DO CANAL\]/g, p.canalNome || 'nosso canal');
    this.adicionarEnvios([
      {
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
      },
    ]);
    this.marcar(dia, { passo: 'agendado', etapa: `Na fila de envio: publica em ${new Date(dia.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` });
  }
}

module.exports = { DormirSemana, PASSOS };
