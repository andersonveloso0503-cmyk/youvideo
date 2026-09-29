// "Montar no PC": manda o vídeo para a fila do Youvideo Compilador, que monta
// no computador (grátis, sem limite de duração) e devolve o vídeo pronto.
export async function montarNoPc(corpo, titulo) {
  const r = await fetch('/api/assemble-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...corpo, motor: 'pc', titulo }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.renderId) throw new Error(d.error || 'Não consegui mandar o vídeo para o PC.');
  return '✅ Foi para a fila do Youvideo Compilador — com o app aberto no PC ele monta sozinho. O vídeo pronto fica na pasta de saída do app e na Fila (🎬 Compilar).';
}
