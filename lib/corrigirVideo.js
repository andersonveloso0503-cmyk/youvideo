// CORREÇÃO AUTOMÁTICA (pedido do dono: "faz a conferência mas não arruma se tiver errado?").
// Quando a conferência final acha problema, o vídeo é arrumado sozinho UMA vez antes de ir para o ✅ Aprovar:
//   - erro de escrita no título/descrição/capa  -> corrige o texto (sem refazer nada)
//   - erro na NARRAÇÃO, fala colada no 0 s, legenda faltando, voz padrão no lugar da do canal -> narra de novo
//     com o texto corrigido (e busca as imagens de novo, porque o tempo das cenas muda)
//   - imagem errada numa cena / cena sem imagem -> busca outra imagem SÓ a partir da 1ª cena ruim, nunca a mesma
//   - capa errada -> faz a capa de novo
// Depois monta de novo no PC e confere outra vez. Se ainda tiver problema, chega no Aprovar com ⚠️ (não tenta de novo).
import { roteiroDoEpisodio, jogoCerto } from './documentario';
import { COLECAO_NOTICIAS } from './gamesNoticias';
import { COLECAO_POLITICA } from './politicaNoticias';
import { COLECAO_BRASIL } from './brasilInacreditavel';

const FLAGS_MIDIA = ['midiasPlanejadas', 'frasesDivididas', 'midiasFrase', 'ilusParcial', 'ilusDiag', 'cartoesFeitos', 'videosPreferidos', 'arquivosParciais', 'infoIlustracoes'];

/** "trecho errado -> como fica certo" -> [errado, certo] */
function trocaDe(t) {
  const m = String(t || '').split(/\s*(?:->|→|=>)\s*/);
  if (m.length < 2) return null;
  const limpa = (x) => x.trim().replace(/^["'“”‘’«]+|["'“”‘’»]+$/g, '').trim();
  const errado = limpa(m[0]);
  const certo = limpa(m.slice(1).join(' '));
  return errado && certo && errado !== certo && errado.length >= 2 ? [errado, certo] : null;
}
const aplicar = (txt, trocas) => trocas.reduce((t, [a, b]) => (typeof t === 'string' ? t.split(a).join(b) : t), txt);

/**
 * Decide e começa a correção. Devolve { corrigindo:true, oque:[...] } ou { corrigindo:false, motivo }.
 * `ref` = documento do vídeo na youvideo_fila; `item` = dados; `conf` = resultado da conferência.
 */
export async function corrigirSozinho(db, ref, item, conf) {
  if (item.correcao) return { corrigindo: false, motivo: 'já foi corrigido uma vez' };
  if (!(item.games || item.politica || item.brasil || item.documentario)) return { corrigindo: false, motivo: 'tipo sem correção' };
  if (item.fabrica?.youtube?.status && item.fabrica.youtube.status !== 'revisar') return { corrigindo: false, motivo: 'já aprovado/enviado' };
  const etapa = (nome) => (conf.etapas || []).find((e) => e.nome.startsWith(nome) && e.ok === false);
  const eTexto = etapa('Texto');
  const eAudio = etapa('Início do áudio');
  const eLegenda = etapa('Legenda');
  const eVoz = etapa('Narrador');
  const eCapa = etapa('Capa');
  const ruins = (conf.cenas || []).filter((c) => c.ok === false).map((c) => c.n - 1);
  const semMidia = (item.arquivos || []).map((a, i) => (a.erro && !a.ilustracao ? i : -1)).filter((i) => i >= 0);
  const cenasRuins = [...new Set([...ruins, ...semMidia])].sort((a, b) => a - b);
  const capaRuim = eCapa && !/Não consegui abrir/i.test(eCapa.detalhe || '');

  // Erros de escrita: separa o que está na narração (precisa narrar de novo) do que está só no título/descrição/capa
  const trocas = eTexto ? String(eTexto.detalhe || '').split(' · ').map(trocaDe).filter(Boolean) : [];
  const r = item.roteiro || {};
  const narracaoTxt = String(r.narracao || (r.cenas || []).map((c) => c.textoNarrado || '').join(' '));
  const naNarracao = trocas.filter(([a]) => narracaoTxt.includes(a));
  const revozear = !!(naNarracao.length || eAudio || eLegenda || eVoz);

  if (!trocas.length && !revozear && !cenasRuins.length && !capaRuim) return { corrigindo: false, motivo: 'nada que dê para arrumar sozinho' };

  const oque = [];
  const novo = {};
  // Texto fora da narração: corrige direto
  if (trocas.length) {
    novo['roteiro.titulo'] = aplicar(r.titulo, trocas);
    novo['roteiro.descricao'] = aplicar(r.descricao, trocas);
    if (r.thumbnailTitulo) novo['roteiro.thumbnailTitulo'] = aplicar(r.thumbnailTitulo, trocas);
    oque.push(`texto corrigido (${trocas.map(([a, b]) => `"${a}" → "${b}"`).join(', ').slice(0, 200)})`);
  }

  // Tira o vídeo do Aprovar e o post agendado nas outras redes (vai sair outro vídeo)
  const vaiRefazer = revozear || cenasRuins.length || (capaRuim && item.renderId);
  if (vaiRefazer && item.fabrica?.agendaId) await db.collection('youvideo_agenda').doc(item.fabrica.agendaId).delete().catch(() => {});
  const limpar = { renderId: null, videoUrl: null, thumbnailUrl: null, capaIa: false, 'fabrica.youtube': null, 'fabrica.agendaId': null, aviso: null };

  if (revozear) {
    // Narra de novo: refaz o roteiro a partir do episódio (com o texto corrigido) e busca as imagens de novo
    const colecao = item.politica ? COLECAO_POLITICA : item.brasil ? COLECAO_BRASIL : COLECAO_NOTICIAS;
    const epRef = item.noticia ? db.collection(colecao).doc(String(item.noticia)) : null;
    let ep = epRef ? (await epRef.get().catch(() => null))?.data?.()?.ep : null;
    let roteiro;
    if (ep) {
      if (trocas.length) {
        ep = { ...ep, titulo: aplicar(ep.titulo, trocas), texto: aplicar(ep.texto, trocas), ...(ep.descricao ? { descricao: aplicar(ep.descricao, trocas) } : {}), ...(ep.thumb ? { thumb: aplicar(ep.thumb, trocas) } : {}) };
        await epRef.update({ ep }).catch(() => {});
      }
      roteiro = roteiroDoEpisodio(ep);
    } else {
      // sem o episódio guardado: corrige o próprio roteiro
      roteiro = {
        ...r,
        titulo: aplicar(r.titulo, trocas),
        descricao: aplicar(r.descricao, trocas),
        narracao: aplicar(r.narracao, trocas),
        cenas: (r.cenas || []).map(({ start, length, ilustracao, ...c }) => ({ ...c, textoNarrado: aplicar(c.textoNarrado, trocas) })),
      };
    }
    const evitar = cenasRuins.map((i) => item.arquivos?.[i]?.midiaId).filter(Boolean);
    await ref.update({
      ...limpar,
      roteiro,
      narracao: null,
      duracaoNarracao: null,
      arquivos: null,
      ...Object.fromEntries(FLAGS_MIDIA.map((k) => [k, null])),
      evitarMidias: [...(item.evitarMidias || []), ...evitar],
      status: 'roteiro_ok',
      conferencia: { ...conf, status: 'corrigindo' },
      correcao: { em: new Date().toISOString(), oque: [...oque, naNarracao.length ? 'narração corrigida e narrada de novo' : eVoz ? 'narrado de novo com a voz do canal' : 'narrado de novo (início/legenda)', ...(cenasRuins.length ? [`${cenasRuins.length} imagem(ns) trocada(s)`] : [])], antes: { nota: conf.nota ?? null, etapas: (conf.etapas || []).filter((e) => !e.ok).map((e) => e.nome) } },
    });
    return { corrigindo: true, oque };
  }

  if (cenasRuins.length) {
    // Busca outra imagem a partir da 1ª cena ruim (as de antes ficam), nunca a mesma que foi recusada
    const primeira = cenasRuins[0];
    const cenas = [...(r.cenas || [])];
    // Games: cena ruim que pedia OUTRO jogo passa a mostrar o jogo do vídeo
    if (item.games) {
      const jogo = await jogoCerto(item, cenas).catch(() => '');
      if (jogo)
        for (const i of cenasRuins) {
          const b = String(cenas[i]?.busca || '');
          if (cenas[i] && (!/^jogo:/i.test(b) || !b.toLowerCase().includes(jogo.toLowerCase()))) cenas[i] = { ...cenas[i], busca: `jogo: ${jogo}`, descricao: `jogo: ${jogo}` };
        }
    }
    const evitar = cenasRuins.map((i) => item.arquivos?.[i]?.midiaId).filter(Boolean);
    await ref.update({
      ...limpar,
      ...novo,
      'roteiro.cenas': cenas,
      arquivosParciais: (item.arquivos || []).slice(0, primeira),
      arquivos: null,
      evitarMidias: [...(item.evitarMidias || []), ...evitar],
      status: 'voz_ok',
      conferencia: { ...conf, status: 'corrigindo' },
      correcao: { em: new Date().toISOString(), oque: [...oque, `${cenasRuins.length} imagem(ns) trocada(s) (cena ${cenasRuins.map((i) => i + 1).join(', ')})`, ...(capaRuim ? ['capa feita de novo'] : [])], antes: { nota: conf.nota ?? null, etapas: (conf.etapas || []).filter((e) => !e.ok).map((e) => e.nome) } },
    });
    return { corrigindo: true, oque };
  }

  // Só capa e/ou texto fora da narração: a montagem fica, só refaz a capa (volta um passo: "montagem pronta")
  if (capaRuim || trocas.length) {
    await ref.update({
      ...novo,
      ...(capaRuim ? { thumbnailUrl: null, capaIa: false } : {}),
      ...(capaRuim && item.renderId ? { status: 'montando', 'fabrica.youtube': null, 'fabrica.agendaId': null } : {}),
      conferencia: capaRuim && item.renderId ? { ...conf, status: 'corrigindo' } : { status: 'pendente' },
      correcao: { em: new Date().toISOString(), oque: [...oque, ...(capaRuim ? ['capa feita de novo'] : [])], antes: { nota: conf.nota ?? null, etapas: (conf.etapas || []).filter((e) => !e.ok).map((e) => e.nome) } },
    });
    return { corrigindo: true, oque };
  }
  return { corrigindo: false, motivo: 'nada a fazer' };
}
