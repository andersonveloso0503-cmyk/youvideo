// VÍDEOS LONGOS MODELADOS (pedido do dono: 2 longos por semana em games + 2 em política, "modelar vídeos que deram certo").
// 1) Acha no YouTube (pt-BR) vídeos longos do nicho que estouraram nos últimos meses (muitas views para o tamanho do canal).
// 2) A IA escolhe UM tema com nota alta (8,5+) para o NOSSO canal, inspirado no FORMATO e no assunto que deu certo
//    — nunca copia: outro ângulo, outro título, nossas fontes, nossas imagens.
// 3) O roteiro é escrito com pesquisa na web (games: curiosidades/segredos com gameplay oficial; política: "entenda do começo").
import { buscarVideos, novoContador, radarScore, comCache, diasDesde } from './radar';
import { getDb } from './firebase-admin';

const BUSCAS = {
  // Vencedores achados em 12/11 (vidIQ): listas nostálgicas e "esquecidos" estouram em canal pequeno
  // ("10 Jogos Perfeitos de GBA Que Passaram Despercebidos" 44x, "11 jogos de 2026 que foram esquecidos" 6x, "10 jogos estranhos..." 6x)
  games: ['gta 6', 'jogos de ps1 que impressionam', 'fatos obscuros pokémon', 'mistérios minecraft', 'detalhes geniais jogos', 'jogos esquecidos', 'jogos que passaram despercebidos', 'jogos estranhos', 'jogos de ps2', 'curiosidades de jogos', 'segredos gta', 'história da saga jogo', 'detalhes escondidos jogo'],
  // "O Iceberg da Política Brasileira" 100 mil, "A maldição da política brasileira" 150 mil, "Os debates mais absurdos" 10x, "entenda o caso" 29x
  politica: ['como era viver no brasil', 'ideologia política explicada', 'como funciona explicado política', 'e agora eleição', 'iceberg da política', 'história da política brasileira', 'debates mais absurdos política', 'entenda o caso explicado', 'curiosidades política brasileira', 'escândalo brasil explicado', 'stf explicado'],
  // "Os Sumérios: o segredo da civilização mais antiga" 118x, "Por que Ur foi a cidade mais importante" 43x, "Olisipo: cidade romana sob Lisboa" 32x,
  // "Satélite encontra cidade antiga na Amazônia" 136 mil
  historia: ['civilização mais antiga', 'cidade perdida', 'civilização perdida amazônia', 'descoberta arqueológica', 'segredo civilização antiga', 'cidade antiga reconstrução', 'mistérios da história'],
};

// O que os vencedores de cada nicho têm em comum (vai no pedido da IA para escolher o tema)
const PADRAO = {
  games: 'Os que mais estouram em canal pequeno: LISTAS NUMERADAS nostálgicas ou de descoberta ("10 jogos perfeitos de GBA que passaram despercebidos", "11 jogos de 2026 que foram esquecidos", "10 jogos estranhos que vão mexer com sua cabeça", "10 jogos de corrida esquecidos do PS2") e a HISTÓRIA de uma saga famosa com curiosidades. ',
  politica: 'Os que mais estouram: visão geral com curiosidade e humor leve, sem torcida ("O iceberg da política brasileira", "Os debates mais absurdos da política brasileira", "A maldição da política brasileira", "Entenda o caso que viralizou"). ',
  historia: 'Os que mais estouram: civilização antiga com um SEGREDO ou "a mais antiga/avançada" ("Os Sumérios: o segredo da civilização mais antiga do mundo", "Por que Ur foi a cidade mais importante da história antiga"), cidade perdida debaixo de outra ("a cidade romana perdida sob Lisboa") e descoberta na Amazônia ("satélite encontra cidade antiga na Amazônia"). ',
};

// PAUTA DA PESQUISA (13/11/2026): vencedores achados direto no YouTube (busca por views, este ano, 4-20 min,
// comparando views x inscritos do canal). Os temas abaixo são a NOSSA versão de cada vencedor e saem PRIMEIRO,
// na ordem, antes da IA escolher sozinha. Cada um só sai uma vez (fica na lista de "feitos").
const PAUTA = {
  games: [
    // GTA 6 sai em 19/11/2026: "GTA 6: GUIA COMPLETO DO MAPA" 2,77 mi views em 6 dias (canal de 12,7 mil) e "TUDO sobre o GIGANTESCO MAPA de GTA 6" 475 mil (canal de 1,5 mil)
    { tema: 'GTA 6: tudo o que já foi confirmado oficialmente antes do lançamento de 19 de novembro — mapa de Leonida, Vice City, Lucia e Jason, o que é rumor e o que é oficial', titulo: 'GTA 6: TUDO o que já é CONFIRMADO antes do lançamento', nota: 9.5, inspirado: 'GTA 6: GUIA COMPLETO DO MAPA (2,77 mi views, canal de 12,7 mil)' },
    // "15 COISAS de GTA 5 que Você NÃO Vai Poder Fazer em GTA 6" 2,28 mi (canal de 21,6 mil) e "GTA 6 vai CONSERTAR o MAIOR ERRO do GTA 5" 734 mil
    { tema: 'As maiores diferenças entre GTA 5 e GTA 6 confirmadas pela Rockstar: o que muda, o que melhora e o que some', titulo: 'GTA 5 vs GTA 6: as 12 MAIORES diferenças confirmadas', nota: 9.2, inspirado: '15 COISAS de GTA 5 que Você NÃO Vai Poder Fazer em GTA 6 (2,28 mi views, canal de 21,6 mil)' },
    // "A Cidade de GTA San Andreas Que a Rockstar Esqueceu" 456 mil (canal de 1 mil)
    { tema: 'Segredos, lugares escondidos e conteúdos cortados de GTA San Andreas que quase ninguém conhece', titulo: 'Os SEGREDOS de GTA San Andreas que a Rockstar escondeu', nota: 9, inspirado: 'A Cidade de GTA San Andreas Que a Rockstar Esqueceu (456 mil views, canal de 1 mil)' },
    // "18 Jogos de PS1 Que Ainda Impressionam Mais de 25 Anos Depois" 979 mil (canal de 3,8 mil)
    { tema: 'Jogos de PS2 que ainda impressionam mais de 20 anos depois (gráficos, ideias e mecânicas à frente do seu tempo)', titulo: '15 Jogos de PS2 que AINDA impressionam 20 anos depois', nota: 8.9, inspirado: '18 Jogos de PS1 Que Ainda Impressionam Mais de 25 Anos Depois (979 mil views, canal de 3,8 mil)' },
    // "10 Fatos Obscuros Sobre Pokémon Que Você NÃO Conhece" 471 mil em 5 dias
    { tema: 'Fatos obscuros e curiosidades pouco conhecidas sobre a história dos jogos de Pokémon', titulo: '10 Fatos OBSCUROS sobre Pokémon que quase ninguém conhece', nota: 8.8, inspirado: '10 Fatos Obscuros Sobre Pokémon Que Você NÃO Conhece (471 mil views em 5 dias)' },
    // "10 mistérios mais perturbadores do Minecraft" 506 mil (canal de 5,2 mil) e "8 Configurações Secretas do Minecraft" 519 mil
    { tema: 'Mistérios, lendas e segredos reais do Minecraft que até hoje intrigam os jogadores (Herobrine, seeds famosas, coisas removidas)', titulo: '10 MISTÉRIOS do Minecraft que ninguém explicou até hoje', nota: 8.7, inspirado: '10 mistérios mais perturbadores do Minecraft (506 mil views, canal de 5,2 mil)' },
    // "11 Detalhes GENIAIS nos jogos de Dragon Ball!" 396 mil em 2 semanas
    { tema: 'Detalhes geniais e escondidos na saga God of War que a maioria dos jogadores não percebeu', titulo: '11 Detalhes GENIAIS em God of War que você não percebeu', nota: 8.6, inspirado: '11 Detalhes GENIAIS nos jogos de Dragon Ball! (396 mil views em 2 semanas)' },
    // "Eu testei TODOS os controles de PlayStation já lançados" 1 mi (canal de 1,4 mil)
    { tema: 'A evolução de todos os consoles PlayStation, do PS1 ao PS5: o que cada um trouxe de novo e as curiosidades de cada geração', titulo: 'Do PS1 ao PS5: a EVOLUÇÃO de todos os PlayStation', nota: 8.6, inspirado: 'Eu testei TODOS os controles de PlayStation já lançados (1 mi views, canal de 1,4 mil)' },
  ],
  politica: [
    // "Como Era Viver no Brasil Durante a Ditadura Militar (1964–1985)" 1,24 mi (canal de 7,2 mil)
    { tema: 'Como era o dia a dia no Brasil durante o regime militar (1964 a 1985): economia, censura, eleições indiretas e a volta da democracia, com o que historiadores dos dois lados dizem', titulo: 'Como era VIVER no Brasil durante a ditadura (1964–1985)', nota: 9.2, inspirado: 'Como Era Viver no Brasil Durante a Ditadura Militar (1,24 mi views, canal de 7,2 mil)' },
    // "Cada Ideologia Política Explicada (Sem Tomar Partido)" 415 mil (canal muito pequeno)
    { tema: 'Esquerda, direita, centro, liberalismo, conservadorismo e socialismo: cada ideologia política explicada de forma simples e sem tomar partido', titulo: 'Cada ideologia política EXPLICADA (sem tomar partido)', nota: 9, inspirado: 'Cada Ideologia Política Explicada (Sem Tomar Partido) (415 mil views)' },
    // "Do Soldado Ao General: Como Funciona A Hierarquia Do Exército" 663 mil (canal de 6,1 mil)
    { tema: 'Do vereador ao presidente: o que faz cada cargo político no Brasil, quanto ganha e quanto poder tem de verdade', titulo: 'Do VEREADOR ao PRESIDENTE: o que cada político faz (e quanto ganha)', nota: 9, inspirado: 'Do Soldado Ao General: Como Funciona A Hierarquia Do Exército (663 mil views, canal de 6,1 mil)' },
    // "O que são as ELEIÇÕES de meio de mandato nos EUA?" 866 mil e "POV: ... acabou de ganhar as eleições… e agora?" 274 mil (canal de 2,5 mil)
    { tema: 'O que acontece agora depois das eleições de 2026: posse, novo Congresso a partir de fevereiro de 2027, novos governadores e o que muda na prática para o brasileiro', titulo: 'Eleição acabou… e AGORA? O que muda a partir de 2027', nota: 8.9, inspirado: 'O que são as ELEIÇÕES de meio de mandato nos EUA? (866 mil views, canal de 8,1 mil)' },
    // "Todo Ditador que Destruiu seu País, Explicado" 347 mil (canal muito pequeno)
    { tema: 'Os presidentes do Brasil que não terminaram o mandato: renúncias, impeachments, golpes e mortes, explicado caso a caso', titulo: 'Os presidentes que NÃO terminaram o mandato (e por quê)', nota: 8.8, inspirado: 'Todo Ditador que Destruiu seu País, Explicado (347 mil views)' },
    // "Quem está por trás do Banco Master?" 1 mi (canal de 10 mil) — "quem está por trás" de algo que todo mundo ouve falar
    { tema: 'Como funciona o STF: quem são os 11 ministros, como são escolhidos, por que o Supremo virou o centro da política brasileira e o que cada lado critica', titulo: 'Por que o STF manda TANTO? Entenda o Supremo do começo', nota: 8.7, inspirado: 'Quem está por trás do Banco Master? (1 mi views, canal de 10 mil)' },
  ],
};

/** Vídeos longos (4 a 20 min) em português que mais estouraram nos últimos 120 dias, por nicho. */
export async function referenciasDeSucesso(nicho) {
  return comCache(`longo-modelado-${nicho}`, 24, async () => {
    const contador = novoContador();
    const desde = new Date(Date.now() - 120 * 86400e3).toISOString();
    const todos = new Map();
    for (const q of BUSCAS[nicho] || []) {
      try {
        const { videos, canais } = await buscarVideos({ q, idioma: 'pt', videoDuration: 'medium', publishedAfter: desde, order: 'viewCount' }, contador);
        const porCanal = canais || {};
        for (const v of videos || []) {
          if (todos.has(v.id) || (v.duracao || 0) < 360) continue;
          const c = porCanal[v.canalId] || {};
          const dias = Math.max(1, Math.round(diasDesde(v.publicadoEm)));
          const views = Number(v.views) || 0;
          const score = radarScore({ views, inscritos: Number(c.inscritos) || 0, viewsPorDia: views / dias, idadeCanalDias: c.idadeDias ?? null });
          todos.set(v.id, { id: v.id, titulo: v.titulo, canal: c.nome || v.canalNome || '', inscritos: Number(c.inscritos) || 0, views, dias, score });
        }
      } catch (e) {
        console.log(`[longo-modelado] busca "${q}" falhou: ${String(e.message || e).slice(0, 120)}`);
      }
    }
    return [...todos.values()].sort((a, b) => b.score - a.score).slice(0, 25);
  });
}

/** A IA escolhe o tema do próximo longo (nota 0-10), inspirado no que deu certo e sem repetir o que já fizemos. */
export async function escolherTemaModelado(nicho) {
  const cfgRef = getDb().collection('youvideo_config').doc(`longos_modelados_${nicho}`);
  const todosFeitos = (await cfgRef.get()).data()?.temas || [];
  // 1º: a pauta da pesquisa (vencedores reais do YouTube), na ordem, cada tema uma vez só
  const daPauta = (PAUTA[nicho] || []).find((p) => !todosFeitos.includes(p.tema));
  if (daPauta) {
    await cfgRef.set({ temas: [...todosFeitos, daPauta.tema].slice(-60), ultimo: { tema: daPauta.tema, titulo: daPauta.titulo, nota: daPauta.nota, porque: 'Pauta da pesquisa de vencedores (13/11)', inspirado: { titulo: daPauta.inspirado }, em: new Date().toISOString() } }, { merge: true });
    console.log(`[longo-modelado] ${nicho}: pauta "${daPauta.tema}" inspirado em ${daPauta.inspirado}`);
    return { tema: daPauta.tema, titulo: daPauta.titulo, nota: daPauta.nota, porque: 'Pauta da pesquisa de vencedores', inspirado: { titulo: daPauta.inspirado } };
  }
  const refs = await referenciasDeSucesso(nicho).catch(() => []);
  const feitos = todosFeitos.slice(-40);
  const { ia } = await import('./gamesNoticias');
  const lista = refs.map((r, i) => `${i + 1}. "${r.titulo}" — ${r.views.toLocaleString('pt-BR')} views em ${r.dias} dias, canal com ${r.inscritos.toLocaleString('pt-BR')} inscritos (nota de sucesso ${r.score})`).join('\n');
  const j = await ia(
    (nicho === 'games'
      ? 'Você é o editor do canal brasileiro de GAMES "Próxima Fase" e escolhe o tema do próximo VÍDEO LONGO (8 a 12 min) de CURIOSIDADES. '
      : nicho === 'historia'
        ? 'Você é o editor do canal brasileiro "Noites na História" (documentários de ARQUEOLOGIA, civilizações antigas, cidades perdidas, catástrofes e mistérios reais) e escolhe o tema do próximo DOCUMENTÁRIO LONGO (10 a 12 min). Só fatos reais e bem documentados, nada de teoria sem base (alienígenas, conspiração). '
        : 'Você é o editor de um canal brasileiro IMPARCIAL de POLÍTICA e escolhe o tema do próximo VÍDEO LONGO (8 a 10 min) no estilo "entenda do começo". ') +
      (PADRAO[nicho] || '') +
      'Abaixo estão vídeos longos em português que ESTOURARAM recentemente (muitas views para o tamanho do canal). MODELE o que deu certo: o tipo de assunto, a promessa do título e o formato — ' +
      'mas com um tema e um ângulo NOSSOS (nunca o mesmo título, nunca copiar). Prefira assunto que as pessoas PESQUISAM e que continua valendo daqui a meses, com muita curiosidade. ' +
      (nicho === 'politica' ? 'Imparcial: nada de tema que só ataca ou só defende um lado; o vídeo mostra o que cada lado diz. ' : 'Prefira jogos e franquias muito buscados no Brasil (GTA, Zelda, Mario, Pokémon, God of War, Minecraft, Roblox, Free Fire, Resident Evil...). ') +
      `Não repita estes temas já feitos: ${feitos.join(' | ') || '(nenhum)'}. ` +
      'Dê "nota" de 0 a 10 (chance de dar muitas views e horas assistidas). Responda só JSON: {"tema":"o tema do vídeo em uma frase","titulo":"título nosso, até 80 caracteres, curiosidade forte sem mentir","nota":0-10,"porque":"1 frase","inspirado":número da referência}',
    `VÍDEOS QUE DERAM CERTO:\n${lista || '(sem referências agora: escolha pelo que costuma dar certo no nicho)'}`,
    { temperatura: 0.5 }
  );
  const tema = String(j?.tema || '').trim();
  if (!tema) throw new Error('A IA não escolheu um tema.');
  const ref = refs[Number(j.inspirado) - 1] || null;
  await cfgRef.set({ temas: [...feitos, tema].slice(-60), ultimo: { tema, titulo: j.titulo, nota: j.nota, porque: j.porque, inspirado: ref, em: new Date().toISOString() } }, { merge: true });
  console.log(`[longo-modelado] ${nicho}: "${tema}" (nota ${j.nota}) inspirado em ${ref ? `"${ref.titulo}" (${ref.views} views)` : '—'}`);
  return { tema, titulo: String(j.titulo || '').slice(0, 90), nota: Number(j.nota) || null, porque: String(j.porque || ''), inspirado: ref };
}
