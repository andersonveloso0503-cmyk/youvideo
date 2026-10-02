// Confere se a Página e o Instagram da LCS estão ligados ao Youvideo (não publica nada).
import { useEffect, useState } from 'react';
import Head from 'next/head';

const CHAVE = 'youvideo-central-token';

export default function ConexaoLcs() {
  const [token, setToken] = useState('');
  const [digitado, setDigitado] = useState('');
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    try { setToken(localStorage.getItem(CHAVE) || ''); } catch { /* sem armazenamento */ }
  }, []);

  async function testar(t = token) {
    if (!t) return;
    setCarregando(true);
    setErro('');
    setR(null);
    try {
      const resp = await fetch('/api/central/fabrica?conexao=lcs', { headers: { 'x-central-token': t } });
      const d = await resp.json();
      if (resp.status === 401) {
        try { localStorage.removeItem(CHAVE); } catch { /* ok */ }
        setToken('');
        throw new Error('Senha da Central incorreta.');
      }
      if (!resp.ok) throw new Error(d.erro || `Erro ${resp.status}`);
      setR(d);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { if (token) testar(token); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const linha = (ok, texto) => (
    <p style={{ fontSize: 16, color: ok ? '#8fd6c1' : '#ffb3a6', margin: '8px 0' }}>{ok ? '✅' : '⚠️'} {texto}</p>
  );

  return (
    <div className="container">
      <Head><title>Conexão da LCS · Youvideo</title></Head>
      <h1>Conexão da LCS</h1>
      <p className="subtitle">Confere se o Youvideo consegue publicar na Página e no Instagram da LCS Terceirização. Não publica nada.</p>

      {!token && (
        <div className="card">
          <label>Senha da Central</label>
          <input type="password" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="a mesma do Compilador" />
          <button onClick={() => { try { localStorage.setItem(CHAVE, digitado.trim()); } catch { /* ok */ } setToken(digitado.trim()); }}>Entrar</button>
        </div>
      )}

      {carregando && <div className="card">Conferindo com a Meta…</div>}
      {erro && <div className="card" style={{ color: '#ffb3a6' }}>{erro}</div>}

      {r && (
        <div className="card">
          {r.falta
            ? linha(false, `Ainda não encontrei a chave. Crie a variável ${r.falta} na Vercel (projeto do Youvideo) e faça o Redeploy.`)
            : (
              <>
                {linha(!!r.pagina, r.pagina ? `Página encontrada: ${r.pagina.nome || r.pagina.id}` : 'Não consegui abrir a Página com essa chave.')}
                {linha(!!r.ok, r.ok ? 'Facebook: pode publicar.' : 'Facebook: ainda não pode publicar.')}
                {linha(!!r.instagramOk, r.instagramOk ? `Instagram: pode publicar em @${r.instagram.usuario || r.instagram.id}.` : 'Instagram: ainda não pode publicar.')}
                {(r.erros || []).map((e, k) => <p key={k} style={{ fontSize: 13, color: '#e8c46a' }}>• {e}</p>)}
              </>
            )}
          <button onClick={() => testar()} style={{ marginTop: 12 }}>Conferir de novo</button>
        </div>
      )}
    </div>
  );
}
