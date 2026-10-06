// Limpeza automática dos vídeos antigos (regra em lib/limpeza.js).
// Cron da Vercel (1x por dia)            -> apaga, se a limpeza estiver ligada
// GET  (página /limpeza, com a senha)    -> { ligada, dias, candidatos, historico }   não apaga nada
// POST { acao: 'ligar' | 'desligar' | 'rodar' }
import { getDb } from '../../../lib/firebase-admin';
import { autorizado } from '../../../lib/central';
import { DIAS, lerConfig, ligar, candidatos, rodar, resumo } from '../../../lib/limpeza';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const cron =
    (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) ||
    /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (!cron && !autorizado(req).ok) return res.status(401).json({ erro: 'Senha da Central incorreta.' });
  const db = getDb();
  try {
    if (cron) {
      const cfg = await lerConfig(db);
      if (!cfg.ligada) return res.status(200).json({ ligada: false, mensagem: 'Limpeza desligada.' });
      return res.status(200).json(await rodar(db));
    }
    if (req.method === 'GET') {
      const cfg = await lerConfig(db);
      const lista = await candidatos(db);
      return res.status(200).json({ ligada: !!cfg.ligada, dias: DIAS, candidatos: lista.slice(0, 200).map(resumo), total: lista.length, historico: cfg.historico || [] });
    }
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' });
    const { acao } = req.body || {};
    if (acao === 'ligar' || acao === 'desligar') {
      await ligar(db, acao === 'ligar');
      return res.status(200).json({ ligada: acao === 'ligar' });
    }
    if (acao === 'rodar') return res.status(200).json(await rodar(db));
    return res.status(400).json({ erro: 'Pedido desconhecido.' });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
