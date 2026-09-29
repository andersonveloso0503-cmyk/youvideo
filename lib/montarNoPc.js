// "Montar no PC": em vez de mandar para a Shotstack (plano limitado a 60 s),
// o site gera a receita do vídeo e o Youvideo Compilador monta no computador,
// de graça e sem limite de duração.
export function estaNoCompilador() {
  return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
}

export async function montarNoPc(corpo, titulo) {
  const r = await fetch('/api/assemble-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...corpo, motor: 'pc', titulo }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.receita) throw new Error(d.error || 'Não consegui preparar o vídeo para montar no PC.');
  const nome = String(titulo || 'video-youvideo').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 90) || 'video-youvideo';
  const blob = new Blob([JSON.stringify(d.receita)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nome}.youvideo.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return estaNoCompilador()
    ? '✅ Foi para a fila do Youvideo Compilador — ele monta aqui no seu PC (acompanhe em 🎬 Compilar › Fila). Quando terminar, use "Subir p/ YouTube" na fila.'
    : '📥 Baixou o arquivo ".youvideo.json". Abra o Youvideo Compilador e clique em 🎬 Compilar › Fila › "📥 Abrir receita" (ou faça esta etapa pela aba ✨ Criar do app, que já manda direto para a fila).';
}
