// Troca de capa no Studio passada de um PC para outro.
// Quando um PC não consegue trocar a capa de um Short no Studio (ex.: o login do Studio dele está no canal errado e
// ninguém tem acesso a esse PC), ele manda a capa para cá e o OUTRO PC, que consegue, troca no lugar dele.
// POST { acao:'passar', pc, videoId, canalId, titulo, imagem(base64 jpg/png) } -> guarda
// POST { acao:'feita', pc, videoId }                                          -> tira da lista
// GET  ?pc=NOME                                                               -> as capas que outros PCs passaram (não as dele)
import { put } from '@vercel/blob';
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';

export const config = { api: { bodyParser: { sizeLimit: '6mb' } }, maxDuration: 120 };
const col = () => getDb().collection('youvideo_capas_studio');

// Uma vez: os Shorts de games e política dos últimos 30 dias que já subiram com a capa pronta (feita no site)
// entram nesta lista — qualquer PC com o canal troca a capa no Studio (antes só os últimos dias, e só no PC que subiu)
async function repassarAntigas() {
  const cfg = getDb().collection('youvideo_config').doc('capas-studio');
  if ((await cfg.get()).data()?.repasse1) return;
  await cfg.set({ repasse1: Date.now() }, { merge: true });
  const desde = new Date(Date.now() - 45 * 86400e3).toISOString();
  const id = (x) => x.fabrica?.youtubeId || (String(x.fabrica?.youtube?.url || '').match(/(?:shorts\/|youtu\.be\/|[?&]v=)([\w-]{11})/) || [])[1];
  let n = 0;
  let semCapaPronta = 0;
  for (const campo of ['games', 'politica']) {
    const snap = await getDb().collection('youvideo_fila').where(campo, '==', true).get();
    for (const d of snap.docs) {
      const x = d.data();
      const vid = id(x);
      if (!vid || String(x.criadoEm || '') < desde || x.formato !== 'short') continue;
      if (!x.capaIa || !/^https?:/.test(String(x.thumbnailUrl || ''))) {
        semCapaPronta++;
        continue;
      }
      const cy = x.fabrica?.canalYoutube;
      const canalId = (typeof cy === 'string' ? cy : cy?.id || cy?.canalId) || '';
      if (!canalId) continue;
      const ref = col().doc(vid);
      if ((await ref.get()).exists) continue;
      await ref.set({ canalId, titulo: String(x.roteiro?.titulo || x.tema || '').slice(0, 100), url: x.thumbnailUrl, de: 'site (Shorts antigos)', falhouEm: [], em: Date.now() });
      n++;
    }
  }
  console.log(`[capa-studio] repasse dos Shorts antigos: ${n} capas na lista para os PCs trocarem (${semCapaPronta} Shorts sem capa pronta no site)`);
}

// Os Shorts antigos SEM capa pronta (261 em 12/11): o site faz a capa GRÁTIS (foto real + título grande, sem IA paga)
// aos poucos — 4 por pedido dos PCs — e põe na mesma lista para os PCs trocarem no Studio.
async function capasGratisAntigas() {
  const cfgRef = getDb().collection('youvideo_config').doc('capas-studio');
  const cfg = (await cfgRef.get()).data() || {};
  if (cfg.gratisFeito) return;
  let pendentes = cfg.gratisPendentes;
  if (!Array.isArray(pendentes)) {
    // 1ª vez: monta a lista (ids da fila) uma vez só, para não ler a fila inteira a cada pedido
    const desde = new Date(Date.now() - 45 * 86400e3).toISOString();
    const vidDe = (x) => x.fabrica?.youtubeId || (String(x.fabrica?.youtube?.url || '').match(/(?:shorts\/|youtu\.be\/|[?&]v=)([\w-]{11})/) || [])[1];
    pendentes = [];
    for (const campo of ['games', 'politica']) {
      const snap = await getDb().collection('youvideo_fila').where(campo, '==', true).get();
      for (const d of snap.docs) {
        const x = d.data();
        if (!vidDe(x) || String(x.criadoEm || '') < desde || x.formato !== 'short' || x.desafio) continue;
        if (x.capaIa && /^https?:/.test(String(x.thumbnailUrl || ''))) continue; // já tinha capa pronta (foi no repasse 1)
        pendentes.push({ id: d.id, em: x.criadoEm || '' });
      }
    }
    pendentes = pendentes.sort((a, b) => String(b.em).localeCompare(String(a.em))).map((x) => x.id); // mais novos primeiro
    await cfgRef.set({ gratisPendentes: pendentes, gratisTotal: pendentes.length }, { merge: true });
  }
  if (!pendentes.length) return cfgRef.set({ gratisFeito: Date.now() }, { merge: true });
  const lote = pendentes.slice(0, 4);
  await cfgRef.set({ gratisPendentes: pendentes.slice(4) }, { merge: true }); // tira antes: se der erro, não trava a lista
  const { capaShortGratis, imagensDaCapa } = await import('../../../lib/capaShortGratis');
  const { textoDaCapa } = await import('../../../lib/capaShortIa');
  for (const filaId of lote) {
    try {
      const x = (await getDb().collection('youvideo_fila').doc(filaId).get()).data();
      if (!x) continue;
      const vid = x.fabrica?.youtubeId || (String(x.fabrica?.youtube?.url || '').match(/(?:shorts\/|youtu\.be\/|[?&]v=)([\w-]{11})/) || [])[1];
      const cy = x.fabrica?.canalYoutube;
      const canalId = (typeof cy === 'string' ? cy : cy?.id || cy?.canalId) || '';
      if (!vid || !canalId || (await col().doc(vid).get()).exists) continue;
      const url = await capaShortGratis({ tipo: x.games ? 'games' : 'politica', texto: textoDaCapa(x), imagens: await imagensDaCapa(x) });
      if (!url) continue;
      await col().doc(vid).set({ canalId, titulo: String(x.roteiro?.titulo || x.tema || '').slice(0, 100), url, de: 'site (capa grátis de Short antigo)', falhouEm: [], em: Date.now() });
    } catch (e) {
      console.log(`[capa-studio] capa grátis falhou (${filaId}): ${String(e.message || e).slice(0, 140)}`);
    }
  }
  console.log(`[capa-studio] capas grátis dos Shorts antigos: faltam ${pendentes.length - lote.length} de ${cfg.gratisTotal || pendentes.length}`);
}

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  try {
    if (req.method === 'GET') {
      const pc = String(req.query.pc || '');
      await repassarAntigas().catch((e) => console.log(`[capa-studio] repasse dos antigos falhou: ${String(e.message || e).slice(0, 160)}`));
      await capasGratisAntigas().catch((e) => console.log(`[capa-studio] capas grátis falharam: ${String(e.message || e).slice(0, 160)}`));
      const snap = await col().get();
      const limite = Date.now() - 6 * 86400e3;
      const lista = [];
      for (const d of snap.docs) {
        const x = d.data();
        if ((x.em || 0) < limite) {
          await d.ref.delete().catch(() => {});
          continue;
        }
        if ((x.falhouEm || []).includes(pc)) continue;
        // já está com outro PC (há menos de 40 min): não pega a mesma (antes os dois PCs trocavam a mesma capa)
        if (x.pegoPor && x.pegoPor !== pc && Date.now() - (x.pegoEm || 0) < 40 * 60e3) continue;
        if (lista.length >= 8) continue;
        await d.ref.update({ pegoPor: pc, pegoEm: Date.now() }).catch(() => {});
        lista.push({ videoId: d.id, canalId: x.canalId, titulo: x.titulo, url: x.url, de: x.de });
      }
      return res.status(200).json({ capas: lista });
    }
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use GET ou POST.' });
    const b = req.body || {};
    const videoId = String(b.videoId || '');
    if (!/^[\w-]{11}$/.test(videoId)) return res.status(400).json({ erro: 'videoId inválido.' });
    const pc = String(b.pc || '?').slice(0, 60);
    if (b.acao === 'feita') {
      await col().doc(videoId).delete().catch(() => {});
      console.log(`[capa-studio] ${videoId}: trocada pelo PC ${pc} (passada de outro PC)`);
      return res.status(200).json({ ok: true });
    }
    if (b.acao === 'falhou') {
      const ref = col().doc(videoId);
      const d = (await ref.get()).data();
      if (d) await ref.update({ falhouEm: [...new Set([...(d.falhouEm || []), pc])] });
      return res.status(200).json({ ok: true });
    }
    // passar
    const existente = (await col().doc(videoId).get()).data();
    if (existente) {
      await col().doc(videoId).update({ falhouEm: [...new Set([...(existente.falhouEm || []), pc])] });
      return res.status(200).json({ ok: true, ja: true });
    }
    const buf = Buffer.from(String(b.imagem || ''), 'base64');
    if (buf.length < 2000) return res.status(400).json({ erro: 'Imagem vazia.' });
    const png = buf[0] === 0x89;
    const blob = await put(`capas-studio/${videoId}-${Date.now()}.${png ? 'png' : 'jpg'}`, buf, { access: 'public', contentType: png ? 'image/png' : 'image/jpeg' });
    await col().doc(videoId).set({ canalId: String(b.canalId || ''), titulo: String(b.titulo || '').slice(0, 100), url: blob.url, de: pc, falhouEm: [pc], em: Date.now() });
    console.log(`[capa-studio] ${videoId}: o PC ${pc} não conseguiu, passou para outro PC`);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e).slice(0, 300) });
  }
}
