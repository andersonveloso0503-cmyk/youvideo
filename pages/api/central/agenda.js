// Agenda de posts nas redes (Facebook, Instagram, TikTok, Kwai).
// GET    /api/central/agenda                 -> { itens }
// POST   /api/central/agenda  { itens: [...] } -> cria (1 documento por vídeo/horário)
// PATCH  /api/central/agenda  { id, rede, acao: 'repetir' | 'feito' } -> tenta de novo / marca Kwai como postado
// DELETE /api/central/agenda?id=...          -> apaga
import { legendaCelular, legendasCriativas, hashtagsDe } from '../../../lib/fabrica';

export const config = { maxDuration: 60 };
import { getDb } from '../../../lib/firebase-admin';
import { empresa } from '../../../lib/empresa';
import { exigirToken } from '../../../lib/central';

const REDES = ['facebook', 'instagram', 'tiktok', 'kwai'];
const MANUAIS = ['kwai', 'tiktok']; // sem publicação automática: vão para a página do celular
const COL = 'youvideo_agenda';

export default async function handler(req, res) {
  if (!exigirToken(req, res)) return;
  const db = getDb();
  try {
    if (req.method === 'GET') {
      // ?lembrete=1 -> só o que chegou na hora nas últimas 6 h (o PC usa para avisar "hora de postar"); gasta poucas leituras
      if (req.query.lembrete === '1') {
        const agora = new Date().toISOString();
        const de = new Date(Date.now() - 6 * 3600e3).toISOString();
        const s = await db.collection(COL).where('quando', '>=', de).where('quando', '<=', agora).get();
        return res.status(200).json({ itens: s.docs.map((d) => ({ id: d.id, ...d.data() })) });
      }
      const desde = new Date(Date.now() - 14 * 86400e3).toISOString();
      const snap = await db.collection(COL).where('quando', '>=', desde).orderBy('quando', 'asc').limit(500).get();
      return res.status(200).json({ itens: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }

    if (req.method === 'POST') {
      const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
      if (!itens.length) return res.status(400).json({ erro: 'Nada para agendar.' });
      // Vídeos da empresa (LCS) agendados pela Biblioteca: publicam na conta da LCS, só Facebook e Instagram
      const empresaSnap = await db.collection('youvideo_projects').where('categoria', '==', 'empresa').get().catch(() => ({ docs: [] }));
      const daEmpresa = new Map(empresaSnap.docs.map((d) => [d.data().videoUrl, d.data().canal || 'lcs']));
      // Legendas criativas (gancho + chamada para ação) para cada vídeo, 4 por vez; sem IA fica a legenda enviada
      const criativas = [];
      const fila = itens.slice(0, 200).map((it, k) => [it, k]);
      const inicio = Date.now();
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (fila.length && Date.now() - inicio < 40000) {
          const [it, k] = fila.shift();
          const emp = empresa(daEmpresa.get(it.videoUrl));
          criativas[k] = it.legendaPronta
            ? null
            : await legendasCriativas({
                titulo: it.titulo,
                resumo: it.legenda,
                ...(emp ? { obrigatorio: emp.chamadaLegenda, acoes: emp.acoesLegenda, perfil: `${emp.nome}, empresa de terceirização de ${emp.servicos.join(', ')} em ${emp.cidade}` } : {}),
              });
        }
      }));
      const lote = db.batch();
      const ids = [];
      for (const [k, it] of itens.slice(0, 200).entries()) {
        const cr = criativas[k];
        if (!/^https:\/\//.test(it.videoUrl || '')) return res.status(400).json({ erro: `Vídeo sem link público: ${it.titulo}` });
        const quando = new Date(it.quando);
        if (isNaN(quando)) return res.status(400).json({ erro: `Data inválida: ${it.titulo}` });
        const conta = daEmpresa.get(it.videoUrl) || '';
        const redes = {};
        for (const r of REDES) if (it.redes?.includes(r) && !(conta && MANUAIS.includes(r))) redes[r] = { status: MANUAIS.includes(r) ? 'manual' : 'pendente' };
        if (!Object.keys(redes).length) continue;
        const ref = db.collection(COL).doc();
        lote.set(ref, {
          titulo: String(it.titulo || '').slice(0, 150),
          legenda: (cr ? `${cr.redes}\n\n${hashtagsDe(it.legenda, conta ? empresa(conta)?.hashtags || [] : [], 8).join(' ')}` : String(it.legenda || '')).trim().slice(0, 2200),
          // TikTok e Kwai: chamada criativa + hashtags (sem IA: frase pronta + título + hashtags)
          legendaCelular: cr ? `${cr.celular}\n\n${hashtagsDe(it.legenda, [], 8).join(' ')}`.trim().slice(0, 2200) : legendaCelular(it.titulo, it.legenda),
          videoUrl: it.videoUrl,
          conta,
          thumbnailUrl: it.thumbnailUrl || null,
          curto: !!it.curto,
          chaveBiblioteca: it.chaveBiblioteca || null,
          quando: quando.toISOString(),
          redes,
          pendente: Object.keys(redes).some((r) => !MANUAIS.includes(r)),
          criadoEm: new Date().toISOString(),
        });
        ids.push(ref.id);
      }
      await lote.commit();
      return res.status(200).json({ ids });
    }

    if (req.method === 'PATCH') {
      const { id, rede, acao } = req.body || {};
      if (!id || !REDES.includes(rede)) return res.status(400).json({ erro: 'Pedido inválido.' });
      // Kwai e TikTok são postados pelo celular (página /postar)
      const status = acao === 'feito' ? 'ok' : MANUAIS.includes(rede) ? 'manual' : 'pendente';
      const upd = { [`redes.${rede}`]: { status, em: new Date().toISOString() } };
      if (status === 'pendente') upd.pendente = true;
      await db.collection(COL).doc(String(id)).update(upd);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ erro: 'Faltou o id.' });
      await db.collection(COL).doc(String(id)).delete();
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
