// Situação da fila (só leitura, sem dados sensíveis): para conferir de fora por que um vídeo não subiu.
// GET -> vídeos criados nas últimas 36 h com etapa, status do YouTube, conferência e PC.
import { getDb } from '../../../lib/firebase-admin';

export default async function handler(req, res) {
  const desde = new Date(Date.now() - 36 * 3600e3).toISOString();
  const snap = await getDb().collection('youvideo_fila').where('criadoEm', '>=', desde).get();
  const itens = snap.docs.map((d) => {
    const x = d.data();
    return {
      titulo: String(x.roteiro?.titulo || x.tema || '').slice(0, 70),
      canal: x.games ? 'games' : x.politica ? 'politica' : x.brasil ? 'brasil' : x.documentario ? 'doc' : x.tipo || '',
      formato: x.formato || '',
      status: x.status || '',
      erro: String(x.erro || '').slice(0, 120),
      youtube: x.fabrica?.youtube?.status || '',
      ytErro: String(x.fabrica?.youtube?.erro || '').slice(0, 500),
      confDetalhe: String((x.conferencia?.etapas || []).find((e) => /^Confer/.test(e?.nome || ''))?.detalhe || '').slice(0, 600),
      agendado: x.fabrica?.youtube?.publicarEm || x.fabrica?.youtube?.agendadoPara || '',
      conferencia: x.conferencia?.status || '',
      nota: x.conferencia?.nota ?? null,
      confEm: x.conferencia?.em || '',
      pc: x.pc || x.montadoPor || x.fabrica?.pc || '',
      ilustracoes: (x.arquivos || []).map((a) => a?.ilustracao?.tipo).filter(Boolean).join(','),
      criadoEm: x.criadoEm,
      atualizadoEm: x.atualizadoEm || '',
    };
  });
  itens.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  const cont = {};
  for (const i of itens) cont[`${i.status}|${i.youtube}`] = (cont[`${i.status}|${i.youtube}`] || 0) + 1;
  const pcs = (await getDb().collection('youvideo_pc_filas').get()).docs.map((d) => ({ pc: d.id, versao: d.data().versao || '', visto: new Date(d.data().atualizadoEm || 0).toISOString() }));
  const cmds = (await getDb().collection('youvideo_pc_comandos').where('acao', '==', 'atualizar').limit(400).get()).docs
    .map((d) => d.data())
    .filter((c) => c.criadoEm > Date.now() - 6 * 3600e3)
    .sort((a, b) => b.criadoEm - a.criadoEm)
    .slice(0, 12)
    .map((c) => ({ pc: c.pc, status: c.status, erro: c.erro || '', de: c.deNome, em: new Date(c.criadoEm).toISOString(), feito: c.feitoEm ? new Date(c.feitoEm).toISOString() : '' }));
  const ia = (await getDb().collection('youvideo_config').doc('ia').get()).data() || {};
  const conf = {};
  for (const d of snap.docs) { const c = d.data().conferencia?.status || '-'; conf[c] = (conf[c] || 0) + 1; }
  res.status(200).json({ agora: new Date().toISOString(), ia: { semCreditoEm: ia.semCreditoEm ? new Date(ia.semCreditoEm).toISOString() : '', msg: ia.semCreditoMsg || '' }, conferencias: conf, pcs, atualizacoes: cmds, contagem: cont, itens: itens.slice(0, 8) });
}
