// DOCUMENTÁRIO LONGO de ARQUEOLOGIA / HISTÓRIA para o "Noites na História" (1 por semana, tema modelado em vídeos que deram certo).
// Mesmo formato dos episódios escritos à mão (lib/documentarioEpisodios): capítulos "#", cenas "@ foto/vídeo atual/ilustração" em inglês.
import { claudeComBusca } from './gamesDicas';

const limpa = (t) => String(t || '').replace(/\s+/g, ' ').trim();

export async function roteiroHistoriaLongo(tema, tituloSugerido = '') {
  const { json: j, fontes } = await claudeComBusca(
    'Você escreve DOCUMENTÁRIOS LONGOS do canal brasileiro "Noites na História" (arqueologia, civilizações antigas, cidades perdidas, catástrofes e mistérios REAIS), 10 a 12 minutos. ' +
      'ANTES de escrever, pesquise na web (Wikipédia em várias línguas, museus, universidades, revistas de arqueologia e história) e use SÓ o que encontrou: não invente data, número, nome nem descoberta. ' +
      'Quando houver dúvida entre os pesquisadores, diga que há dúvida e quais são as hipóteses. Nada de teoria sem base (alienígenas, conspiração). ' +
      'Português do Brasil, narração calma e envolvente, frases curtas, com [pausa] nos momentos fortes. Números por extenso na fala. Não copie frases das fontes. ' +
      'ESTRUTURA: abertura com 4 a 6 cenas (a 1ª frase até 12 palavras com o fato mais impressionante; a 2ª deixa um mistério que só se resolve no fim; convite para se inscrever no Noites na História); ' +
      '5 a 7 capítulos em ordem, cada um com 5 a 8 cenas; final com 3 a 4 cenas (o desfecho, o que existe hoje e uma pergunta para os comentários). Total de 1500 a 1800 palavras narradas. Cada cena tem 1 a 3 frases. ' +
      'Mídia de cada cena: "foto: <até 8 palavras em inglês de lugar, objeto ou achado real>" (prefira: ruínas, museu, artefato, sítio arqueológico), "vídeo atual: <até 8 palavras em inglês>" para o lugar hoje, ' +
      '"ilustração: <até 25 palavras em inglês: cena da época, foto realista colorida, sem sangue, sem texto, sem rosto de pessoa famosa real>" só onde não existe foto. ' +
      'Na 1ª cena de um lugar novo pode pôr um quadrinho no fim da mídia: "foto: ... | Nome do lugar | Data ou detalhe curto". ' +
      'No final da sua resposta, coloque SÓ um JSON (sem texto depois) assim: ' +
      '{"titulo":"até 90 caracteres, curiosidade forte que o vídeo entrega","thumb":"2 a 4 palavras em CAIXA ALTA","thumbSub":"lugar e ano, até 3 palavras","arte":"até 40 palavras em inglês: a pintura épica da capa","capa":"até 6 palavras em inglês: foto real do lugar","epoca":"lugar e época em português","descricao":"2 parágrafos curtos sem entregar o final","tags":["10 a 14 tags"],' +
      '"abertura":[{"midia":"...","texto":"..."}],"capitulos":[{"titulo":"nome curto","cenas":[{"midia":"...","texto":"..."}]}],"final":[{"midia":"...","texto":"..."}]}',
    `Tema do documentário: ${tema}${tituloSugerido ? `\nTítulo sugerido (pode melhorar): ${tituloSugerido}` : ''}\nData de hoje: ${new Date().toISOString().slice(0, 10)}`
  );
  const cena = (c) => (c?.texto ? `@ ${limpa(c.midia || 'vídeo atual: ancient ruins at sunset').replace(/^@\s*/, '')}\n${limpa(c.texto)}` : '');
  const caps = (j?.capitulos || []).filter((c) => (c.cenas || []).length);
  if (caps.length < 3) throw new Error('A pesquisa não rendeu capítulos suficientes para o documentário.');
  const partes = ['# Abertura', ...(j.abertura || []).map(cena)];
  for (const c of caps) partes.push('', `# ${limpa(c.titulo).slice(0, 60)}`, ...c.cenas.map(cena));
  partes.push('', '# Final', ...(j.final || []).map(cena));
  const tags = (j.tags || []).map(String).slice(0, 14);
  const slug = String(tema).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const ep = {
    id: `hist-${slug}-${Date.now().toString(36)}`,
    serie: 'Arqueologia e Mistérios',
    titulo: limpa(j.titulo || tituloSugerido || tema).slice(0, 100),
    thumb: limpa(j.thumb).toUpperCase().slice(0, 40),
    thumbSub: limpa(j.thumbSub).slice(0, 30),
    arte: limpa(j.arte).slice(0, 400),
    capa: limpa(j.capa || 'ancient ruins aerial').slice(0, 80),
    epoca: limpa(j.epoca).slice(0, 120),
    ritmo: 'documentario',
    cauda: false,
    musica: 'Mysterious cinematic score with soft strings, deep drones and a distant choir, ancient and epic atmosphere, quiet',
    playlist: { titulo: 'Arqueologia e Mistérios', descricao: 'Cidades perdidas, civilizações antigas e descobertas da arqueologia, contadas do começo ao fim. Inscreva-se no Noites na História!' },
    descricao: [
      limpa(j.descricao) || limpa(j.titulo),
      fontes.length ? 'Fontes:\n' + fontes.slice(0, 8).map((f) => `• ${f.titulo}: ${f.url}`).join('\n') : '',
      '🔔 Inscreva-se no Noites na História: toda semana uma nova história real.',
      '#historia #arqueologia #documentario',
    ].filter(Boolean).join('\n\n'),
    tags: [...tags, 'arqueologia', 'história', 'documentário', 'noites na história'],
    texto: partes.filter((x) => x !== undefined).join('\n'),
  };
  return { ep, fontes };
}
