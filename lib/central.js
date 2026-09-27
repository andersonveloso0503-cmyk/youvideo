// lib/central.js
//
// "Central" = a ponte entre o painel Youvideo (nuvem) e o app de PC (Compilador).
// O Compilador lista os vídeos daqui, agenda posts e a nuvem publica na hora.
//
// Variável de ambiente (Vercel): CENTRAL_TOKEN — uma senha longa qualquer.
// A mesma senha vai no Compilador em Configurações → Central Youvideo.

export const CATEGORIAS = {
  historias: 'Histórias animadas',
  series: 'Séries e narrados',
  cortes: 'Cortes cômicos',
  musicas: 'Músicas',
  medleys: 'Medleys',
  cover: 'Cover IA',
  outros: 'Outros',
};

export function autorizado(req) {
  const esperado = process.env.CENTRAL_TOKEN;
  if (!esperado) return { ok: false, erro: 'CENTRAL_TOKEN não configurado na Vercel.' };
  const recebido = req.headers['x-central-token'] || req.query.token;
  if (recebido !== esperado) return { ok: false, erro: 'Senha da Central incorreta.' };
  return { ok: true };
}

export function exigirToken(req, res) {
  const a = autorizado(req);
  if (!a.ok) {
    res.status(401).json({ erro: a.erro });
    return false;
  }
  return true;
}

export function ehCurto(formato) {
  return /short|vertical|9:16|curto/i.test(String(formato || ''));
}

// Descobre a categoria de um projeto salvo em youvideo_projects
export function categoriaDoProjeto(p) {
  if (p.categoria && CATEGORIAS[p.categoria]) return p.categoria;
  const origem = String(p.origem || '');
  if (origem === 'cortes') return 'cortes';
  if (origem === 'desenho') return 'historias';
  if (origem === 'musica' || origem === 'cantor' || p.canal === 'musica') return 'musicas';
  if (origem === 'medley') return 'medleys';
  if (p.estilo === 'desenho') return ehCurto(p.formato) ? 'cortes' : 'historias';
  if (p.videoUrl) return 'series';
  return 'outros';
}

export function paraIso(v) {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v).toISOString();
  if (typeof v === 'string') return v;
  if (v.toDate) return v.toDate().toISOString();
  return null;
}
