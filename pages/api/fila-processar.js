import { getDb } from '../../lib/firebase-admin';
import { escolherProximo } from '../../lib/montarPc';
import { agendarItemPronto } from '../../lib/fabrica';
import { empresa, gerarRoteiroEmpresa } from '../../lib/empresa';
import { gerarRoteiroOracaoDia } from '../../lib/oracaoDia';
import { buscarSaldoFal } from '../../lib/orcamento';
import { comLegenda, roteiroDoEpisodio, passoVozDocumentario, passoMidiaDocumentario, thumbDocumentario, temposDasCenas, buscarMidiaReal, conferidorDeCena } from '../../lib/documentario';
import { TODOS_EPISODIOS as EPISODIOS } from '../../lib/documentarioEpisodios';
import {
  gerarRoteiroInfantil,
  garantirReferencia,
  gerarImagensInfantis,
  garantirReferenciasAmigos,
  thumbInfantil,
  falasDasCenas,
  criarShortDaMusica,
  enviarLabios,
  linhaDoTempo,
  vozesDosPersonagens,
  falasDoBloco,
  escutarFala,
  falaConfere,
  reencaixarBloco,
  gerarEfeitosSonoros,
  duracaoMp3,
  ESTILO_MUSICA,
  DURACAO_MUSICA,
} from '../../lib/infantil';
import {
  gerarRoteiro,
  garantirChamada,
  gerarNarracao,
  gerarImagens,
  enviarAnimacao,
  checarAnimacao,
  gerarThumbnail,
  publicarYoutubePrivado,
} from '../../lib/pipeline';

// Aumenta o limite de execução da função (padrão é bem curto e cortava a
// resposta da ElevenLabs no meio pra roteiros mais longos). Precisa do
// plano Pro do Vercel pra valer mais que ~60s.
export const maxDuration = 300;

const CENAS_ANIMADAS_ECONOMICO = 3;


/**
 * Documentários que já tinham as imagens prontas antes da conferência por IA (algumas imagens fora de
 * contexto: coisa moderna no meio da história) e ainda não foram ao ar: refaz só as imagens e a montagem.
 * A voz fica a mesma. Roda no máximo 1 vez por hora.
 */
async function refazerImagensDocumentarios(db) {
  if (!process.env.GEMINI_API_KEY) return;
  const cfg = db.collection('youvideo_config').doc('documentario_midia');
  const c = (await cfg.get()).data() || {};
  if (c.em && Date.now() - c.em < 3600e3) return;
  await cfg.set({ em: Date.now() }, { merge: true });
  const snap = await db.collection('youvideo_fila').where('documentario', '==', true).get();
  const agora = new Date().toISOString();
  for (const d of snap.docs) {
    const x = d.data();
    if (x.midiaConferida || x.fabrica?.ativo === false) continue;
    if (!['imagens_ok', 'animando', 'montando', 'concluido'].includes(x.status)) continue;
    if (!x.fabrica?.quandoYoutube || x.fabrica.quandoYoutube < agora) continue; // já foi ao ar: não mexe
    await d.ref.update({
      status: 'voz_ok',
      arquivos: null,
      arquivosParciais: null,
      videoUrl: null,
      renderId: null,
      thumbnailUrl: null,
      'fabrica.youtube': null,
      'fabrica.quando': agora,
      imagensRefeitas: true,
    });
  }
}

export default async function handler(req, res) {
  const db = getDb();
  const baseUrl = `https://${req.headers.host}`;

  // Usa o MESMO endpoint de montagem que música/medley usam (em vez de uma
  // cópia separada no lib/pipeline.js), pra qualquer correção futura valer
  // pros dois de uma vez. Também repassa audioSegments quando a narração
  // foi dividida em mais de um pedaço (textos longos passam do limite de
  // caracteres da ElevenLabs numa chamada só).
  // Quadrinhos do documentário: aparecem quando a cena muda de lugar, ficam até 8 s
  const quadrinhosDoDocumentario = (arquivos) => {
    const lista = [];
    let anterior = '';
    for (const a of arquivos || []) {
      if (!a.local?.titulo || a.start == null || !a.length) continue;
      const chave = `${a.local.titulo}|${a.local.texto || ''}`;
      if (chave === anterior || a.length < 3) continue;
      anterior = chave;
      lista.push({ titulo: a.local.titulo, texto: a.local.texto || '', start: Number((a.start + 0.8).toFixed(2)), length: Number(Math.min(8, a.length - 1.2).toFixed(2)) });
    }
    return lista;
  };

  const iniciarMontagemViaApi = async ({ audioUrl, audioSegments, cenas, formato, palavras, titulo, marca, cta, legenda, semBotao, textos, musica }) => {
    // Um pedaço só e sem palavras (Short da música): manda o pedaço com a duração, senão a montagem não sabe o tamanho
    const temVariosPedacos = (audioSegments || []).length > 1 || ((audioSegments || []).length === 1 && !(palavras || []).length);
    const r = await fetch(`${baseUrl}/api/assemble-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        { ...(temVariosPedacos ? { audioSegments } : { audioUrl }), cenas, formato, palavras, titulo, origem: 'fila', ...(marca ? { marca } : {}), ...(cta ? { cta } : {}), ...(legenda === false ? { legenda: false } : {}), ...(semBotao ? { semBotao: true } : {}), ...(textos?.length ? { textos } : {}), ...(musica?.url ? { musica } : {}) }
      ),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao iniciar a montagem');
    return data.renderId;
  };

  // Cortes (de filme e cômicos): o roteiro e as vozes vêm das MESMAS rotas que as telas
  // /cortes-filme e /cortes-comicos usam, para o corte da Fábrica sair igual ao feito à mão.
  const chamarApi = async (caminho, corpo) => {
    const r = await fetch(`${baseUrl}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || data.erro || `Erro em ${caminho} (${r.status})`);
    return data;
  };
  // Nome que aparece no canto do vídeo (empresa: o dela; cortes: o do canal, como nas telas de cortes)
  const marcaDe = (item) => (item.marca ? empresa(item.marca)?.marca : item.corte ? 'Em Nome de Jesus' : '');

  const checarMontagemViaApi = async (renderId) => {
    const r = await fetch(`${baseUrl}/api/assemble-video?id=${renderId}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro checando a montagem');
    return data;
  };

  // Um passo de um item (cada chamada do cron faz alguns passos de itens diferentes)
  async function passo(doc) {
    const item = doc.data();
    const ref = doc.ref;
    switch (item.status) {
      case 'pendente': {
        if (item.infantil) {
          // Desenho infantil: roteiro em 3 blocos (antes da música, a música chiclete, depois)
          const roteiroIf = await gerarRoteiroInfantil({
            tema: item.tema,
            personagem: item.infantil.personagem,
            duracaoSeg: Number(item.duracaoDesejada) || 270,
            temporada: item.infantil.temporada || null, // série: lembra o episódio anterior e deixa gancho
          });
          await ref.update({ roteiro: roteiroIf, status: 'roteiro_ok' });
          break;
        }
        if (item.documentario) {
          // Documentário para dormir: o roteiro já vem escrito, só libera para a voz
          // (fica 'pendente' até faltar 3 dias para ir ao ar, para não gastar crédito antes da hora)
          await ref.update({ status: 'roteiro_ok' });
          break;
        }
        if (item.marca) {
          // Vídeo de divulgação da empresa: roteiro publicitário
          const roteiroEmp = await gerarRoteiroEmpresa(item.marca, { tema: item.tema, duracaoDesejada: item.duracaoDesejada });
          await ref.update({ roteiro: roteiroEmp, status: 'roteiro_ok' });
          break;
        }
        if (item.oracao) {
          // Oração do dia: texto de oração, com a data no título
          const roteiroOr = garantirChamada(await gerarRoteiroOracaoDia(item.oracao), 'oracao');
          await ref.update({ roteiro: roteiroOr, status: 'roteiro_ok' });
          break;
        }
        if (item.corte) {
          // Corte: cena em diálogo (cada "cena" do roteiro é a fala de um personagem)
          const rc = await chamarApi(item.corte.tipo === 'comico' ? '/api/generate-script-comico' : '/api/generate-script-filme', {
            tema: item.corte.cena ? `${item.tema}. ${item.corte.cena}` : item.tema,
            estilo: item.estilo,
            formato: item.formato,
            duracaoDesejada: item.duracaoDesejada,
            tom: item.corte.tom || undefined,
          });
          const falas = (Array.isArray(rc.cenas) ? rc.cenas : []).filter((c) => c && String(c.textoNarrado || '').trim());
          if (!falas.length) throw new Error('O roteiro do corte veio sem falas.');
          const roteiroCorte = {
            titulo: String(rc.titulo || item.tema),
            descricao: String(rc.descricao || ''),
            tags: Array.isArray(rc.tags) ? rc.tags : [],
            thumbnailTitulo: String(rc.thumbnailTitulo || ''),
            thumbnailSubtitulo: String(rc.thumbnailSubtitulo || ''),
            referencia: String(rc.referencia || ''),
            narracao: falas.map((c) => `${c.personagem || 'Narrador'}: ${c.textoNarrado}`).join('\n'),
            cenas: falas.map((c) => ({
              personagem: String(c.personagem || 'Narrador'),
              sexo: c.sexo === 'mulher' ? 'mulher' : c.sexo === 'homem' ? 'homem' : '',
              textoNarrado: String(c.textoNarrado).trim(),
              vozTipo: ['grave', 'aguda'].includes(c.vozTipo) ? c.vozTipo : 'normal',
              descricao: String(c.descricao || ''),
            })),
          };
          await ref.update({ roteiro: roteiroCorte, status: 'roteiro_ok' });
          break;
        }
        let roteiro = await gerarRoteiro({
          tema: item.tema,
          estilo: item.estilo,
          formato: item.formato,
          duracaoDesejada: item.duracaoDesejada,
          serie: item.serie || null,
        });
        // Série no meio termina com "siga para a parte N" (já pede para seguir); nas outras, garante o pedido de comentário
        const meioDeSerie = item.serie && item.serie.total > 1 && item.serie.parte < item.serie.total;
        if (!meioDeSerie) roteiro = garantirChamada(roteiro, 'historia');
        await ref.update({ roteiro, status: 'roteiro_ok' });
        break;
      }

      case 'roteiro_ok': {
        if (item.infantil) {
          // Uma coisa por rodada do cron (cada uma pode demorar): falas do bloco antes, do bloco depois, a música.
          // Narrador + cada bichinho com a sua voz (sempre a mesma em todos os episódios).
          const vi = item.vozInfantil || {};
          const vozNarrador = item.vozId || process.env.INFANTIL_VOICE_ID || undefined;
          const modeloIf = item.modelo || process.env.ELEVENLABS_MODELO_PADRAO;
          const gerarFalas = async (falas) => {
            const vozes = await vozesDosPersonagens({ personagem: item.infantil.personagem, falas, vozNarrador });
            const v = await chamarApi('/api/generate-voice-dialogo', {
              falas: falas.map((f) => ({ personagem: f.personagem, texto: f.texto, vozTipo: f.vozTipo, ...(f.sexo ? { sexo: f.sexo } : {}) })),
              vozes,
              ...(modeloIf === 'flash' ? { modelo: 'flash' } : {}),
            });
            if (!v.audioSegments?.length) throw new Error('As vozes do episódio vieram vazias.');
            return { audioUrl: v.audioUrl, audioSegments: v.audioSegments, cenasComTempo: v.cenasComTempo || [] };
          };
          const gerarBloco = (cenas) => gerarFalas(falasDoBloco(cenas));
          // Conferência: escuta cada fala (24 por rodada) e refaz as que não batem com o roteiro.
          // Devolve true quando o bloco inteiro está conferido.
          const conferir = async (nome, cenas) => {
            if (vi.ok?.[nome]) return true;
            const falas = falasDoBloco(cenas);
            let voz = vi[nome];
            const conf = vi.conf?.[nome] || { i: 0, tent: {} };
            const ate = Math.min(falas.length, conf.i + 24);
            let mudou = false;
            for (let k = conf.i; k < ate; k++) {
              const seg = voz.audioSegments[k];
              if (!seg) break;
              let ouvido;
              try {
                ouvido = await escutarFala(seg.url);
              } catch {
                break; // Whisper ocupado: continua desta fala na próxima rodada
              }
              if (!falaConfere(falas[k].texto, ouvido)) {
                const t = (conf.tent[k] || 0) + 1;
                conf.tent[k] = t;
                if (t > 3) {
                  // Não acertou nem refazendo: para aqui (nada é publicado) e o ↻ refaz as vozes do bloco do zero
                  await ref.update({
                    status: 'erro',
                    statusAntes: 'roteiro_ok',
                    erro: `A fala ${k + 1} (${falas[k].personagem}) não saiu igual ao roteiro nem refazendo 3 vezes: "${falas[k].texto.slice(0, 60)}". Ouvido: "${ouvido.texto.slice(0, 60)}". Clique em ↻ para refazer as vozes.`,
                    [`vozInfantil.${nome}`]: null,
                    [`vozInfantil.conf.${nome}`]: null,
                  });
                  return false;
                }
                const nova = await gerarFalas([falas[k]]);
                voz = { ...voz, audioSegments: voz.audioSegments.map((x, j) => (j === k ? { ...x, url: nova.audioSegments[0].url, length: nova.audioSegments[0].length } : x)) };
                voz = reencaixarBloco(voz);
                mudou = true;
                conf.i = k; // escuta de novo a fala refeita na próxima rodada
                await ref.update({ [`vozInfantil.${nome}`]: voz, [`vozInfantil.conf.${nome}`]: conf });
                return false;
              }
              conf.i = k + 1;
            }
            const pronto = conf.i >= falas.length;
            await ref.update({
              ...(mudou ? { [`vozInfantil.${nome}`]: voz } : {}),
              [`vozInfantil.conf.${nome}`]: conf,
              ...(pronto ? { [`vozInfantil.ok.${nome}`]: true } : {}),
            });
            return false; // conferido: segue na próxima rodada (não estoura o tempo da função)
          };
          if (!vi.antes) {
            await ref.update({ 'vozInfantil.antes': await gerarBloco(item.roteiro.antes) });
            break;
          }
          if (!(await conferir('antes', item.roteiro.antes))) break;
          if (!vi.depois) {
            await ref.update({ 'vozInfantil.depois': await gerarBloco(item.roteiro.depois) });
            break;
          }
          if (!(await conferir('depois', item.roteiro.depois))) break;
          if (!vi.musica) {
            // Música cantada pelo Estúdio de Música (ElevenLabs, com direito de uso comercial)
            const r = await chamarApi('/api/estudio/gerar', {
              motor: 'elevenlabs',
              modo: 'personalizado',
              titulo: item.roteiro.musica.titulo,
              letra: item.roteiro.musica.letra,
              estilo: ESTILO_MUSICA,
              voz: '',
              duracaoSeg: DURACAO_MUSICA,
            });
            const audioUrl = r.musica?.audioUrl;
            if (!audioUrl) throw new Error('O Estúdio de Música não devolveu o áudio da música do episódio.');
            let duracao = 0;
            try {
              duracao = duracaoMp3(Buffer.from(await (await fetch(audioUrl)).arrayBuffer()));
            } catch {
              /* usa a duração pedida */
            }
            await ref.update({ 'vozInfantil.musica': { audioUrl, duracao: duracao || DURACAO_MUSICA, id: r.musica.id || null } });
            break;
          }
          if (!vi.sons) {
            // Efeitos sonoros das cenas (splash, bzzz...); se a ElevenLabs recusar, segue sem eles
            const ef = await gerarEfeitosSonoros(item.roteiro);
            await ref.update({ 'vozInfantil.sons': ef.sons, ...(ef.aviso ? { aviso: ef.aviso } : {}) });
            break;
          }
          // Tudo pronto: junta na linha do tempo e dá o tempo de cada cena
          const lt = linhaDoTempo({ roteiro: item.roteiro, narracaoAntes: vi.antes, musica: vi.musica, narracaoDepois: vi.depois, sons: vi.sons || [] });
          await ref.update({
            narracao: { audioUrl: vi.antes.audioUrl, audioSegments: lt.audioSegments, palavras: [] },
            'roteiro.cenas': item.roteiro.cenas.map((c, i) => ({ ...c, start: lt.tempos[i]?.start ?? null, length: lt.tempos[i]?.length ?? null })),
            status: 'voz_ok',
          });
          break;
        }
        if (item.documentario) {
          // Antes da primeira voz: usa o roteiro mais novo do episódio escrito (o episódio pode ter sido
          // melhorado depois de entrar na Fábrica, ex.: vídeos reais, quadrinhos e música de fundo)
          if (!item.narracaoParcial?.segmentos?.length) {
            const epAtual = EPISODIOS.find((e) => e.id === item.episodioId);
            if (epAtual) {
              item.roteiro = roteiroDoEpisodio(epAtual);
              await ref.update({ roteiro: item.roteiro });
            }
          }
          // Voz em pedaços (o texto é longo): cada rodada do cron faz alguns pedaços
          await ref.update(await passoVozDocumentario(item));
          break;
        }
        if (item.corte) {
          // Uma voz por personagem; a resposta traz o tempo exato de cada fala,
          // que vira o tempo da imagem daquela cena
          const modeloVoz = item.modelo || process.env.ELEVENLABS_MODELO_PADRAO;
          const voz = await chamarApi('/api/generate-voice-dialogo', {
            falas: item.roteiro.cenas.map((c) => ({ personagem: c.personagem, texto: c.textoNarrado, vozTipo: c.vozTipo, ...(c.sexo ? { sexo: c.sexo } : {}) })),
            ...(modeloVoz === 'flash' ? { modelo: 'flash' } : {}),
          });
          if (!voz.audioSegments?.length) throw new Error('As vozes do corte vieram vazias.');
          const tempos = voz.cenasComTempo || [];
          await ref.update({
            narracao: { audioUrl: voz.audioUrl, audioSegments: voz.audioSegments, palavras: voz.palavras || [] },
            'roteiro.cenas': item.roteiro.cenas.map((c, i) => ({ ...c, start: tempos[i]?.start ?? null, length: tempos[i]?.length ?? null })),
            status: 'voz_ok',
          });
          break;
        }
        const narracao = await gerarNarracao({
          texto: item.roteiro.narracao,
          modelo: item.modelo || process.env.ELEVENLABS_MODELO_PADRAO,
          // empresa: voz própria, se configurada (LCS_VOICE_ID); senão, a voz padrão
          ...(item.marca && process.env[`${item.marca.toUpperCase()}_VOICE_ID`] ? { vozId: process.env[`${item.marca.toUpperCase()}_VOICE_ID`] } : {}),
        });
        await ref.update({ narracao, status: 'voz_ok' });
        break;
      }

      case 'voz_ok': {
        if (item.infantil) {
          // Ficha do personagem (uma vez) e depois 16 imagens por rodada (4 ao mesmo tempo), todas com o personagem igual
          let refUrl = item.infantil.refUrl;
          if (!refUrl) {
            refUrl = await garantirReferencia(item.infantil.personagem);
            await ref.update({ 'infantil.refUrl': refUrl });
          }
          // Fichas dos amigos (Zuzu, Tonico, Margarida, Dona Nuvem): uma vez só, guardadas no banco
          let refsAmigos = item.infantil.refsAmigos;
          if (!refsAmigos) {
            refsAmigos = await garantirReferenciasAmigos(item.infantil.personagem);
            await ref.update({ 'infantil.refsAmigos': refsAmigos });
            break; // as fichas levam um tempo: as cenas começam na próxima rodada
          }
          const feitas = item.arquivosParciais || [];
          const novas = await gerarImagensInfantis({
            cenas: item.roteiro.cenas.slice(feitas.length, feitas.length + 16),
            personagem: item.infantil.personagem,
            referencia: refUrl,
            referenciasAmigos: refsAmigos,
          });
          const todas = [...feitas, ...novas];
          if (todas.length < item.roteiro.cenas.length) {
            await ref.update({ arquivosParciais: todas });
            break;
          }
          const arquivosIf = todas.map((a, i) => {
            const c = item.roteiro.cenas[i];
            return c && c.start != null && c.length != null ? { ...a, start: c.start, length: c.length } : a;
          });
          if (!arquivosIf.some((a) => a.imageUrl)) throw new Error('Nenhuma imagem do episódio passou pelo filtro de conteúdo.');
          await ref.update({ arquivos: arquivosIf, arquivosParciais: null, status: 'imagens_ok' });
          break;
        }
        if (item.documentario) {
          // Vídeos e fotos reais (Pexels e Wikimedia), 10 cenas por rodada
          await ref.update(await passoMidiaDocumentario(item));
          break;
        }
        const visualImg = item.marca ? 'empresa' : item.oracao ? 'oracao' : 'biblico'; // empresa: nada bíblico; oração: paisagens serenas
        if (item.formato !== 'short' && (item.roteiro.cenas || []).length > 8) {
          // Vídeo longo tem ~30 cenas: gerar todas de uma vez passa do tempo máximo da função.
          // Gera 8 por rodada (o cron roda a cada 5 min) e só segue quando todas estiverem prontas.
          const feitas = item.arquivosParciais || [];
          // Algumas cenas viram vídeo REAL de banco de imagens (Pexels), pelo campo "broll" do roteiro:
          // o vídeo ganha movimento e ainda economiza imagem do Flux.
          // Empresa, oração e cortes ficam como estavam.
          const comBroll = !item.marca && !item.oracao && !item.corte;
          const usados = new Set(feitas.map((a) => a.midiaId).filter(Boolean));
          const novas = [];
          // Vídeo real só onde a fala é sobre lugar/natureza/objeto (a IA deixa "broll" vazio quando fala de
          // personagem) e no máximo 1 a cada 3 cenas, para a imagem sempre mostrar o que está sendo dito
          let ultimoBroll = feitas.map((a, k) => (a.videoUrl ? k : -9)).reduce((a, b) => Math.max(a, b), -9);
          for (let i = feitas.length; i < Math.min(item.roteiro.cenas.length, feitas.length + 8); i++) {
            const cena = item.roteiro.cenas[i];
            if (comBroll && i - ultimoBroll >= 3 && String(cena.broll || '').trim()) {
              const conferir = conferidorDeCena({ tema: item.roteiro.titulo || item.tema || '', trecho: cena.textoNarrado || '', busca: String(cena.broll) });
              const m = await buscarMidiaReal(String(cena.broll), usados, conferir).catch(() => null);
              if (m?.videoUrl) {
                ultimoBroll = i;
                usados.add(m.id);
                novas.push({ cena: cena.descricao, textoNarrado: cena.textoNarrado || '', midiaId: m.id, imageUrl: m.imageUrl || null, videoUrl: m.videoUrl, videoLoop: true, duracao: m.duracao || null, animar: false });
                continue;
              }
            }
            novas.push(...(await gerarImagens({ cenas: [cena], estilo: item.estilo, formato: item.formato, visual: visualImg })));
          }
          const todas = [...feitas, ...novas];
          if (todas.length < item.roteiro.cenas.length) {
            await ref.update({ arquivosParciais: todas });
            break;
          }
          await ref.update({ arquivos: todas, arquivosParciais: null, status: 'imagens_ok' });
          break;
        }
        let arquivos = await gerarImagens({
          cenas: item.roteiro.cenas,
          estilo: item.estilo,
          formato: item.formato,
          visual: visualImg,
        });
        if (item.corte) {
          // Cada imagem entra e sai junto com a fala da sua cena (mesma ordem do roteiro)
          arquivos = arquivos.map((a, i) => {
            const c = item.roteiro.cenas[i];
            return c && c.start != null && c.length != null ? { ...a, start: c.start, length: c.length } : a;
          });
          if (!arquivos.some((a) => a.imageUrl)) throw new Error('Nenhuma imagem do corte passou pelo filtro de conteúdo.');
        }
        await ref.update({ arquivos, status: 'imagens_ok', ...(item.marca ? { visual: 'empresa' } : {}) });
        break;
      }

      case 'imagens_ok': {
        // Sincroniza cada imagem com a fala: a cena entra no segundo em que a frase dela começa
        // (antes o tempo era dividido igualmente entre as cenas). Corte e documentário já vêm com tempo.
        if (!item.corte && !item.documentario && !item.infantil && (item.narracao?.palavras || []).length && (item.arquivos || []).every((a) => a.start == null)) {
          const pal = item.narracao.palavras.filter((p) => p.end != null);
          const duracaoTotal = (item.narracao.audioSegments || []).length > 1
            ? Math.max(...item.narracao.audioSegments.map((x) => x.start + x.length))
            : (pal[pal.length - 1]?.end || 0) + 0.4;
          const tempos = temposDasCenas((item.roteiro.cenas || []).map((c) => c.textoNarrado || ''), pal, duracaoTotal);
          if (tempos.length === item.arquivos.length) {
            item.arquivos = item.arquivos.map((a, i) => ({ ...a, ...tempos[i] }));
            await ref.update({ arquivos: item.arquivos });
          }
        }
        const emLoop = !!item.fabrica; // fábrica: animação em loop, sem imagem parada
        const numCenas = (item.roteiro.cenas || item.arquivos || []).length || 1;
        const ultimaPalavra = (item.narracao.palavras || []).filter((p) => p.end != null).pop();
        const duracaoAlvo = ultimaPalavra ? (ultimaPalavra.end + 0.4) / numCenas : undefined;

        // Fábrica sem crédito na fal.ai: sai com imagens em zoom em vez de travar
        let semCreditoFal = false;
        if (item.fabrica && item.animar !== false) {
          const saldo = await buscarSaldoFal();
          semCreditoFal = saldo.ok && saldo.saldo != null && saldo.saldo < 1;
        }
        if (item.animar === false || semCreditoFal) {
          // Vídeo estático (mais barato): pula a animação e já manda montar
          // direto com as imagens paradas.
          if (semCreditoFal && item.animar !== false) {
            // Avisa na Fábrica: antes caía em imagem parada sem ninguém saber (o episódio parecia "slideshow")
            await ref.update({ aviso: 'Acabou o crédito da fal.ai: este vídeo saiu com imagens paradas (zoom), sem animação. Recarregue em fal.ai → Billing.' });
          }
          const renderId = await iniciarMontagemViaApi({
            audioUrl: item.narracao.audioUrl,
            audioSegments: item.narracao.audioSegments,
            titulo: item.roteiro?.titulo || item.tema,
            cenas: item.arquivos,
            formato: item.formato,
            // Documentário para dormir: sem legenda na tela (não acorda quem está dormindo)
            palavras: (item.documentario && !comLegenda(item)) || item.infantil ? [] : item.narracao.palavras,
            marca: marcaDe(item),
            cta: item.marca ? empresa(item.marca)?.cta : '',
            // Documentário: sem legenda (não acorda quem dorme); infantil: criança pequena não lê, a tela fica limpa
            ...((item.documentario && !comLegenda(item)) || item.infantil ? { legenda: false } : {}),
            ...(item.infantil ? { semBotao: true } : {}), // conteúdo para crianças: sem botão de like/inscrever gravado
            // Documentário: quadrinho explicando o lugar que aparece e música baixinha por baixo da narração
            ...(item.documentario ? { textos: quadrinhosDoDocumentario(item.arquivos), musica: item.musicaUrl ? { url: item.musicaUrl, volume: 0.1 } : null } : {}),
          });
          // duracaoAlvo só existe quando a narração guarda as palavras (o documentário não guarda)
          await ref.update({ ...(duracaoAlvo != null ? { duracaoAlvo } : {}), renderId, status: 'montando' });
          break;
        }

        // Manda animar só um LOTE pequeno de cenas por execução (evita estourar
        // o tempo limite quando há muitas cenas). O que já foi enviado fica
        // marcado; a próxima execução do cron continua de onde parou.
        // Enviar para animar é rápido (só entra na fila da fal.ai): o desenho infantil manda 20 por rodada
        const LOTE = item.infantil ? (item.resolucaoAnim === 'omnihuman' ? 12 : 20) : 5;
        const arquivosAnimados = [...item.arquivos];
        let enviadosNesseLote = 0;
        // Fábrica em modo econômico (padrão): anima só as 3 primeiras cenas — o começo é o que segura quem assiste —
        // e o resto entra como imagem com zoom. Cada cena animada custa cerca de US$ 0,10 na fal.ai.
        const limiteAnimadas = item.fabrica && item.animacaoCompleta !== true ? CENAS_ANIMADAS_ECONOMICO : Infinity;

        // Boca sincronizada (OmniHuman): cenas em que um personagem fala; o resto (narrador, música, dança) vai no Kling
        const labios = item.infantil && item.resolucaoAnim === 'omnihuman' ? falasDasCenas(item) : [];
        for (let i = 0; i < arquivosAnimados.length && enviadosNesseLote < LOTE; i++) {
          const arquivo = arquivosAnimados[i];
          if (i >= limiteAnimadas) break;
          if (!arquivo.imageUrl || arquivo.videoUrl || arquivo.klingTaskId || arquivo.avisoVideo) continue;
          if (labios[i] && (item.roteiro.cenas || []).length === arquivosAnimados.length) {
            try {
              const { requestId, statusUrl, responseUrl } = await enviarLabios({ imageUrl: arquivo.imageUrl, fala: labios[i], cena: item.roteiro.cenas[i]?.descricao || '' });
              arquivosAnimados[i] = { ...arquivo, klingTaskId: requestId, statusUrl, responseUrl, labios: true };
            } catch (err) {
              // Não deu a boca sincronizada: essa cena vai no Kling, como antes
              try {
                const k = await enviarAnimacao(arquivo.imageUrl, arquivo.cena, item.formato, duracaoAlvo, emLoop, 'kling');
                arquivosAnimados[i] = { ...arquivo, klingTaskId: k.requestId, statusUrl: k.statusUrl, responseUrl: k.responseUrl, videoLoop: true, avisoLabios: err.message };
              } catch (err2) {
                arquivosAnimados[i] = { ...arquivo, avisoVideo: err2.message };
              }
            }
            enviadosNesseLote++;
            continue;
          }
          try {
            const { requestId, statusUrl, responseUrl } = await enviarAnimacao(arquivo.imageUrl, arquivo.cena, item.formato, duracaoAlvo, emLoop, item.resolucaoAnim === 'omnihuman' ? 'kling' : item.resolucaoAnim || '720p');
            arquivosAnimados[i] = { ...arquivo, klingTaskId: requestId, statusUrl, responseUrl, ...(emLoop ? { videoLoop: true } : {}) };
          } catch (err) {
            arquivosAnimados[i] = { ...arquivo, avisoVideo: err.message };
          }
          enviadosNesseLote++;
        }

        const faltamEnviar = arquivosAnimados.some((a, i) => i < limiteAnimadas && a.imageUrl && !a.videoUrl && !a.klingTaskId && !a.avisoVideo);
        await ref.update({
          arquivos: arquivosAnimados,
          ...(duracaoAlvo != null ? { duracaoAlvo } : {}),
          status: faltamEnviar ? 'imagens_ok' : 'animando',
        });
        break;
      }

      case 'animando': {
        const arquivosAtualizados = [];
        let todasProntas = true;
        for (const arquivo of item.arquivos) {
          if (!arquivo.klingTaskId || arquivo.videoUrl || arquivo.falhouAnimacao) {
            arquivosAtualizados.push(arquivo);
            continue;
          }
          try {
            const check = await checarAnimacao(arquivo.statusUrl, arquivo.responseUrl);
            if (check.status === 'done') {
              arquivosAtualizados.push({ ...arquivo, videoUrl: check.videoUrl });
            } else if (check.status === 'failed') {
              arquivosAtualizados.push({ ...arquivo, falhouAnimacao: true, avisoVideo: check.error });
            } else {
              arquivosAtualizados.push(arquivo);
              todasProntas = false;
            }
          } catch (err) {
            // Não deixa uma cena com erro derrubar a execução inteira —
            // marca essa cena como falha e segue com as outras.
            arquivosAtualizados.push({ ...arquivo, falhouAnimacao: true, avisoVideo: err.message });
          }
        }
        if (todasProntas) {
          const renderId = await iniciarMontagemViaApi({
            audioUrl: item.narracao.audioUrl,
            audioSegments: item.narracao.audioSegments,
            titulo: item.roteiro?.titulo || item.tema,
            cenas: arquivosAtualizados,
            formato: item.formato,
            palavras: (item.documentario && !comLegenda(item)) || item.infantil ? [] : item.narracao.palavras,
            marca: marcaDe(item),
            cta: item.marca ? empresa(item.marca)?.cta : '',
            ...((item.documentario && !comLegenda(item)) || item.infantil ? { legenda: false } : {}),
            ...(item.infantil ? { semBotao: true } : {}),
          });
          await ref.update({ arquivos: arquivosAtualizados, renderId, status: 'montando' });
        } else {
          await ref.update({ arquivos: arquivosAtualizados });
        }
        break;
      }

      case 'montando': {
        const check = await checarMontagemViaApi(item.renderId);
        if (check.status === 'done' && item.fabrica) {
          // Fábrica: Short usa a 1ª imagem como capa (vídeo longo ganha thumbnail com texto, logo abaixo) e sem subir no YouTube daqui —
          // o Compilador sobe agendado no canal escolhido; as outras redes vão para a Agenda.
          const primeiraImagem = (item.arquivos || []).find((x) => x.imageUrl)?.imageUrl || null;
          let thumbnailUrl = primeiraImagem;
          let avisoThumb = null;
          if (item.infantil && !item.shortMusica) {
            // Desenho infantil: o personagem grande e alegre (o Compilador põe o título por cima, se quiser)
            thumbnailUrl = (await thumbInfantil({ avisar: (m) => { avisoThumb = `A thumbnail com título não saiu (${m}) — foi uma imagem sem texto. Use 🎨 na Fábrica para refazer.`; }, personagem: item.infantil.personagem, referencia: item.infantil.refUrl, titulo: item.roteiro.titulo, thumbnailTitulo: item.roteiro.thumbnailTitulo, cena: (item.roteiro.cenas || []).find((c) => c.bloco === 'antes' && !/close-up/i.test(c.descricao))?.descricao || '' }).catch(() => null)) || primeiraImagem;
          } else if (item.games) {
            // Canal de games: imagem oficial do jogo + texto curto gigante (branco e verde neon)
            const { thumbGames } = await import('../../lib/capaGames');
            thumbnailUrl =
              (await thumbGames({ fotoUrl: item.capaUrl || primeiraImagem, texto: item.roteiro.thumbnailTitulo, subtitulo: item.roteiro.thumbnailSubtitulo }).catch(() => null)) ||
              primeiraImagem;
          } else if (item.documentario) {
            // Documentário: foto real escurecida + a pergunta da capa
            // Episódios criados antes da capa pintada: pega título, subtítulo e pintura do episódio escrito
            const ep = EPISODIOS.find((e) => e.id === item.episodioId) || {};
            thumbnailUrl =
              (await thumbDocumentario({
                fotoUrl: item.capaUrl || primeiraImagem,
                texto: ep.thumb || item.roteiro.thumbnailTitulo,
                subtitulo: ep.thumbSub || item.roteiro.thumbnailSubtitulo,
                arte: ep.arte || item.roteiro.arte,
              })) || primeiraImagem;
          } else if (item.formato !== 'short') {
            // Vídeo longo: thumbnail de verdade, com a frase grande do mistério (ex.: "ONDE ELE ESTAVA?")
            try {
              thumbnailUrl = (await gerarThumbnail({
                tema: item.tema,
                titulo: item.roteiro.titulo,
                estilo: item.estilo,
                thumbnailTitulo: item.roteiro.thumbnailTitulo,
                thumbnailSubtitulo: item.roteiro.thumbnailSubtitulo,
              })) || primeiraImagem;
            } catch {
              thumbnailUrl = primeiraImagem;
            }
          }
          // Não agenda duas vezes (se algo der erro depois daqui e o ↻ repetir, o Facebook postaria em dobro)
          const jaAgendado = item.fabrica.agendaId ||
            (await db.collection('youvideo_agenda').where('videoUrl', '==', check.videoUrl).limit(1).get().then((q) => q.docs[0]?.id).catch(() => null));
          const agendaId = jaAgendado || (await agendarItemPronto(item, check.videoUrl, thumbnailUrl));
          if (agendaId && !item.fabrica.agendaId) await ref.update({ 'fabrica.agendaId': agendaId });
          await db.collection('youvideo_projects').add({
            origem: 'fabrica',
            categoria: item.marca ? 'empresa' : item.infantil ? 'infantil' : item.games ? 'games' : item.documentario ? 'documentarios' : item.corte ? 'cortes' : item.longo ? 'longos' : item.estilo === 'desenho' ? 'historias' : 'series',
            ...(item.marca ? { canal: item.marca } : {}),
            tema: item.tema,
            estilo: item.estilo,
            formato: item.formato,
            titulo: item.roteiro.titulo,
            descricao: item.roteiro.descricao,
            narracaoTexto: item.roteiro.narracao || '', // Short da música não tem narração (undefined o banco recusa)
            videoUrl: check.videoUrl,
            thumbnailUrl,
            criadoEm: new Date().toISOString(),
          });
          await ref.update({
            status: 'concluido',
            videoUrl: check.videoUrl,
            thumbnailUrl,
            ...(avisoThumb ? { aviso: avisoThumb } : {}),
            'fabrica.agendaId': agendaId,
            comBotao: check.comBotao === true, // botão de like já gravado na montagem: o PC não põe de novo no YouTube
            'fabrica.youtube': item.fabrica.redes?.youtube ? { status: 'pendente' } : null,
          });
          // Desenho infantil: o clipe da música vira um Short vertical, que sai no dia seguinte (mesmo horário)
          if (item.infantil && !item.shortMusica && !item.infantil.teste && item.infantil.shortsMusica !== false && item.vozInfantil?.musica?.audioUrl) {
            try {
              await criarShortDaMusica(db, item, doc.id);
            } catch (e) {
              // O Short da música é um extra: se falhar, o episódio segue normal — mas avisa (antes falhava calado)
              await ref.update({ aviso: `O Short da música não foi criado: ${String(e?.message || e).slice(0, 160)}` }).catch(() => {});
            }
          }
        } else if (check.status === 'done') {
          const thumbnailUrl = await gerarThumbnail({
            tema: item.tema,
            titulo: item.roteiro.titulo,
            estilo: item.estilo,
            thumbnailTitulo: item.roteiro.thumbnailTitulo,
            thumbnailSubtitulo: item.roteiro.thumbnailSubtitulo,
          });

          let youtubeVideoId = null;
          let avisoYoutube = null;
          if (process.env.YOUTUBE_REFRESH_TOKEN) {
            try {
              youtubeVideoId = await publicarYoutubePrivado({
                videoUrl: check.videoUrl,
                thumbnailUrl,
                titulo: item.roteiro.titulo,
                descricao: item.roteiro.descricao,
                tags: item.roteiro.tags,
                palavras: item.narracao.palavras,
              });
            } catch (err) {
              avisoYoutube = `Vídeo pronto, mas não subiu pro YouTube sozinho: ${err.message}`;
            }
          }

          await db.collection('youvideo_projects').add({
            tema: item.tema,
            estilo: item.estilo,
            formato: item.formato,
            titulo: item.roteiro.titulo,
            descricao: item.roteiro.descricao,
            narracaoTexto: item.roteiro.narracao || '', // Short da música não tem narração (undefined o banco recusa)
            videoUrl: check.videoUrl,
            thumbnailUrl: thumbnailUrl || null,
            youtubeVideoId: youtubeVideoId || null,
            avisoYoutube,
            criadoEm: new Date().toISOString(),
          });
          await ref.update({
            status: 'concluido',
            videoUrl: check.videoUrl,
            thumbnailUrl: thumbnailUrl || null,
            youtubeVideoId: youtubeVideoId || null,
          });
        } else if (check.status === 'failed') {
          await ref.update({ status: 'erro', statusAntes: 'imagens_ok', erro: `Falha na montagem: ${check.erro || 'motivo não informado'}` }); // ↻ monta de novo sem refazer nada
        }
        break;
      }

      default:
        break;
    }

  }

  // Só a fábrica? (o agendamento automático processa só os vídeos da Fábrica; itens antigos
  // da fila só andam quando alguém chama manualmente, como sempre foi)
  const soFabrica = req.query.fabrica === '1';
  const inicio = Date.now();
  if (soFabrica) await refazerImagensDocumentarios(db).catch(() => {});

  const feitos = [];
  const vistos = new Set();
  try {
    // Fábrica (cron de 5 em 5 min): lê só os vídeos que vão ao ar entre 4 dias atrás e 3 dias à frente —
    // antes lia a fila inteira a cada volta e estourava o limite diário de leituras do banco.
    const snapshot = soFabrica
      ? await db
          .collection('youvideo_fila')
          .where('fabrica.quando', '>=', new Date(Date.now() - 4 * 24 * 3600e3).toISOString())
          .where('fabrica.quando', '<=', new Date(Date.now() + 3 * 24 * 3600e3).toISOString())
          .get()
      : await db.collection('youvideo_fila').where('status', 'not-in', ['concluido', 'erro']).limit(200).get();
    // Na ordem em que vão ser publicados (fábrica) ou de criação: termina um vídeo antes de começar o próximo
    const prioridade = (d) => d.data().fabrica?.quando || d.data().criadoEm || '';
    // Fábrica: só produz o que vai ao ar nos próximos 3 dias (o crédito é gasto aos poucos,
    // dá para cancelar o resto, e o PC não recebe 60 montagens de uma vez)
    const limite = new Date(Date.now() + 3 * 24 * 3600e3).toISOString();
    let docs = snapshot.docs
      .filter((d) => !['concluido', 'erro'].includes(d.data().status))
      .filter((d) => (!soFabrica || d.data().fabrica) && (!d.data().fabrica || d.data().status !== 'pendente' || prioridade(d) <= limite))
      .sort((x, y) => prioridade(x).localeCompare(prioridade(y)));
    if (!docs.length) return res.status(200).json({ mensagem: 'Fila vazia, nada a processar.' });

    // Até ~3 min por chamada, um passo de cada item
    let roteiros = 0;
    while (Date.now() - inicio < 170e3 && feitos.length < 6) {
      // No máximo 1 roteiro por rodada: a Groq grátis tem limite por minuto
      const doc = await escolherProximo(docs.filter((d) => !vistos.has(d.id) && !(roteiros >= 1 && d.data().status === 'pendente')));
      if (!doc) break;
      vistos.add(doc.id);
      const statusAnterior = doc.data().status;
      if (statusAnterior === 'pendente') roteiros++;
      try {
        await passo(doc);
        feitos.push({ id: doc.id, statusAnterior });
        if (doc.data().tentativas) await doc.ref.update({ tentativas: 0 });
      } catch (err) {
        // Não deixa um item com erro travar a fila (nem gastar crédito repetindo para sempre)
        const tentativas = (doc.data().tentativas || 0) + 1;
        // Falta de crédito (Flux, fal.ai, ElevenLabs): espera a recarga automática cair — tenta por até ~1 hora
        // (12 rodadas) antes de dar erro, em vez de parar na 3ª tentativa
        const semCredito = /cr[eé]dito|insufficient credits|credit balance|top up|rate limit|quota|payment required|402|429/i.test(err.message);
        const limite = semCredito ? 12 : 3;
        await doc.ref.update(tentativas >= limite ? { status: 'erro', erro: err.message, tentativas, statusAntes: statusAnterior } : { tentativas, ultimoErro: semCredito ? `Esperando crédito (tentativa ${tentativas} de ${limite}): ${err.message}` : err.message });
        feitos.push({ id: doc.id, statusAnterior, erro: err.message });
      }
      if (!soFabrica) break; // chamada manual: um passo só, como antes
    }
    if (!feitos.length) return res.status(200).json({ mensagem: 'Só tem vídeo esperando o Youvideo Compilador montar no PC.' });
    return res.status(200).json({ feitos, processado: feitos[0].id, statusAnterior: feitos[0].statusAnterior });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
