export default function handler(req, res) {
  const chave = process.env.SHOTSTACK_API_KEY || '';
  const chaveSandbox = process.env.SHOTSTACK_API_KEY_SANDBOX || '';

  const parcial = (v) => (v ? `${v.slice(0, 4)}...${v.slice(-4)} (${v.length} caracteres)` : 'NÃO CONFIGURADA');

  return res.status(200).json({
    SHOTSTACK_API_KEY: parcial(chave),
    SHOTSTACK_API_KEY_SANDBOX: parcial(chaveSandbox),
    SHOTSTACK_ENV: process.env.SHOTSTACK_ENV || null,
  });
}
