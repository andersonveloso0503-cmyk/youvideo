// pages/api/orcamento.js
//
// AJUSTE NECESSÁRIO: troque o import abaixo pelo caminho real do seu
// arquivo do Firebase (o mesmo Firestore que o Youvideo já usa pra
// "Meus Projetos"). Ele precisa exportar `db` (instância do Firestore).
import { db } from '../../lib/firebase';
import { buscarSaldoFal, buscarSaldoFlux, buscarSaldoElevenLabs } from '../../lib/orcamento';

// Ajuste estes três valores conforme sua realidade for mudando:
const ORCAMENTO_MENSAL_PADRAO = 250; // R$ — seu teto mensal combinado
const CUSTO_VIDEO_ANIMADO = 15; // R$ aproximado por vídeo com animação (fal.ai)
const CUSTO_VIDEO_FIXO = 3; // R$ aproximado por vídeo só com imagem estática

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const [fal, flux, elevenlabs] = await Promise.all([
        buscarSaldoFal(),
        buscarSaldoFlux(),
        buscarSaldoElevenLabs(),
      ]);

      const manualRef = db.collection('orcamento').doc('manual');
      const manualSnap = await manualRef.get();
      const manual = manualSnap.exists
        ? manualSnap.data()
        : { shotstack: {}, suno: {}, orcamento_mensal: ORCAMENTO_MENSAL_PADRAO, gasto_mes_atual: 0 };

      const orcamentoMensal = manual.orcamento_mensal ?? ORCAMENTO_MENSAL_PADRAO;
      const gastoAtual = manual.gasto_mes_atual ?? 0;
      const restante = orcamentoMensal - gastoAtual;

      let recomendacao = 'fixo';
      let motivo = `Restam R$ ${restante.toFixed(2)} no mês — menos que os ~R$ ${CUSTO_VIDEO_ANIMADO} de um vídeo animado. Melhor usar imagem fixa.`;
      if (restante >= CUSTO_VIDEO_ANIMADO) {
        recomendacao = 'animado';
        motivo = `Ainda sobram R$ ${restante.toFixed(2)} no mês — dá pra animar (custo médio ~R$ ${CUSTO_VIDEO_ANIMADO}).`;
      } else if (restante < CUSTO_VIDEO_FIXO) {
        motivo = `Restam só R$ ${restante.toFixed(2)} no mês — nem um vídeo fixo (~R$ ${CUSTO_VIDEO_FIXO}) cabe direito. Segure a geração.`;
      }

      return res.status(200).json({
        servicos: {
          fal: { ...fal, papel: 'Vídeo animado (Wan 2.2 Turbo)' },
          flux: { ...flux, papel: 'Geração de imagens' },
          elevenlabs: { ...elevenlabs, papel: 'Narração' },
          shotstack: {
            ok: true,
            manual: true,
            saldo: manual.shotstack?.saldo ?? null,
            moeda: 'créditos',
            atualizado_em: manual.shotstack?.atualizado_em ?? null,
            papel: 'Montagem final',
          },
          suno: {
            ok: true,
            manual: true,
            saldo: manual.suno?.musicas_restantes ?? null,
            moeda: 'músicas',
            atualizado_em: manual.suno?.atualizado_em ?? null,
            papel: 'Músicas (canal Nova Frequência)',
          },
          pexels: { ok: true, gratis: true, papel: 'Banco de imagens/vídeo de apoio' },
          groq: { ok: true, gratis: true, papel: 'Roteiro (texto)' },
        },
        orcamento: { mensal: orcamentoMensal, gasto_mes_atual: gastoAtual, restante },
        recomendacao,
        motivo,
      });
    } catch (err) {
      return res.status(500).json({ erro: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { shotstack, suno, orcamento_mensal, gasto_mes_atual } = req.body || {};
      const agora = new Date().toISOString();
      const atualizacao = {};
      if (shotstack !== undefined && shotstack !== '') {
        atualizacao.shotstack = { saldo: Number(shotstack), atualizado_em: agora };
      }
      if (suno !== undefined && suno !== '') {
        atualizacao.suno = { musicas_restantes: Number(suno), atualizado_em: agora };
      }
      if (orcamento_mensal !== undefined && orcamento_mensal !== '') {
        atualizacao.orcamento_mensal = Number(orcamento_mensal);
      }
      if (gasto_mes_atual !== undefined && gasto_mes_atual !== '') {
        atualizacao.gasto_mes_atual = Number(gasto_mes_atual);
      }

      await db.collection('orcamento').doc('manual').set(atualizacao, { merge: true });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ erro: err.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ erro: 'Método não permitido' });
}
