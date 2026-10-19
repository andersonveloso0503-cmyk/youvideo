// Roda uma vez quando o servidor do painel liga (em cada função da Vercel).
// Liga o desvio "Tudo na fal" (lib/tudoNaFal.js) — só age se TUDO_NA_FAL=1 na Vercel.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { instalarTudoNaFal } = await import('./lib/tudoNaFal');
    instalarTudoNaFal();
  }
}
