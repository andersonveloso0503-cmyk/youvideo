// Troca de capa no Studio passada de um PC para outro.
// Quando um PC não consegue trocar a capa de um Short no Studio (ex.: o login do Studio dele está no canal errado e
// ninguém tem acesso a esse PC), ele manda a capa para cá e o OUTRO PC, que consegue, troca no lugar dele.
// POST { acao:'passar', pc, videoId, canalId, titulo, imagem(base64 jpg/png) } -> guarda
// POST { acao:'feita', pc, videoId }                                          -> tira da lista
// GET  ?pc=NOME                                                               -> as capas que outros PCs passaram (não as dele)
import { put } from '@vercel/blob';
import { getDb } from '../../../lib/firebase-admin';
import { exigirToken } from '../../../lib/central';

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };
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

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  try {
    if (req.method === 'GET') {
      const pc = String(req.query.pc || '');
      await repassarAntigas().catch((e) => console.log(`[capa-studio] repasse dos antigos falhou: ${String(e.message || e).slice(0, 160)}`));
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
