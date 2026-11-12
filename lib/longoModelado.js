// VÍDEOS LONGOS MODELADOS (pedido do dono: 2 longos por semana em games + 2 em política, "modelar vídeos que deram certo").
// 1) Acha no YouTube (pt-BR) vídeos longos do nicho que estouraram nos últimos meses (muitas views para o tamanho do canal).
// 2) A IA escolhe UM tema com nota alta (8,5+) para o NOSSO canal, inspirado no FORMATO e no assunto que deu certo
//    — nunca copia: outro ângulo, outro título, nossas fontes, nossas imagens.
// 3) O roteiro é escrito com pesquisa na web (games: curiosidades/segredos com gameplay oficial; política: "entenda do começo").
import { buscarVideos, novoContador, radarScore, comCache, diasDesde } from './radar';
import { getDb } from './firebase-admin';

const BUSCAS = {
  games: ['curiosidades de jogos', 'segredos gta', 'coisas que você não sabia jogo', 'história do jogo explicada', 'detalhes escondidos jogo', 'jogos mais esperados', 'easter eggs jogos'],
  historia: ['descoberta arqueológica', 'cidades perdidas história', 'civilizações antigas documentário', 'mistérios da história', 'catástrofes que mudaram o mundo', 'arqueologia mistério', 'cidade abandonada história'],
  politica: ['entenda o caso explicado', 'política brasileira explicada', 'como funciona o congresso', 'história do brasil política', 'o que aconteceu com', 'stf explicado', 'escândalo brasil explicado'],
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
  const refs = await referenciasDeSucesso(nicho).catch(() => []);
  const cfgRef = getDb().collection('youvideo_config').doc(`longos_modelados_${nicho}`);
  const feitos = ((await cfgRef.get()).data()?.temas || []).slice(-40);
  const { ia } = await import('./gamesNoticias');
  const lista = refs.map((r, i) => `${i + 1}. "${r.titulo}" — ${r.views.toLocaleString('pt-BR')} views em ${r.dias} dias, canal com ${r.inscritos.toLocaleString('pt-BR')} inscritos (nota de sucesso ${r.score})`).join('\n');
  const j = await ia(
    (nicho === 'games'
      ? 'Você é o editor do canal brasileiro de GAMES "Próxima Fase" e escolhe o tema do próximo VÍDEO LONGO (8 a 12 min) de CURIOSIDADES. '
      : nicho === 'historia'
        ? 'Você é o editor do canal brasileiro "Noites na História" (documentários de ARQUEOLOGIA, civilizações antigas, cidades perdidas, catástrofes e mistérios reais) e escolhe o tema do próximo DOCUMENTÁRIO LONGO (10 a 12 min). Só fatos reais e bem documentados, nada de teoria sem base (alienígenas, conspiração). '
        : 'Você é o editor de um canal brasileiro IMPARCIAL de POLÍTICA e escolhe o tema do próximo VÍDEO LONGO (8 a 10 min) no estilo "entenda do começo". ') +
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
