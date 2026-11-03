// Conexão do Instagram pelo LOGIN DO INSTAGRAM (sem Página do Facebook) — para contas que o Meta não deixa ligar a uma Página.
import { useEffect, useState } from 'react';
import Head from 'next/head';

const CHAVE = 'youvideo-central-token';
const nota = { fontSize: 14, color: '#c9bfae', lineHeight: 1.6 };

export default function ConexaoInstagram() {
  const [token, setToken] = useState('');
  const [digitado, setDigitado] = useState('');
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(CHAVE) || '');
    } catch {
      /* sem armazenamento */
    }
  }, []);

  async function conferir(t = token) {
    if (!t) return;
    setErro('');
    try {
      const resp = await fetch('/api/central/instagram', { headers: { 'x-central-token': t } });
      const d = await resp.json().catch(() => ({}));
      if (resp.status === 401) {
        try {
          localStorage.removeItem(CHAVE);
        } catch {
          /* ok */
        }
        setToken('');
        throw new Error('Senha da Central incorreta.');
      }
      if (!resp.ok) throw new Error(d.erro || `Erro ${resp.status}`);
      setR(d);
    } catch (e) {
      setErro(e.message);
    }
  }
  useEffect(() => {
    if (token) conferir(token);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const linha = (ok, texto) => <p style={{ margin: '6px 0', fontSize: 15, color: ok ? '#8fd6c1' : '#ffb3a6' }}>{ok ? '✅ ' : '⚠️ '}{texto}</p>;
  const caixa = { background: '#211d17', border: '1px solid #3a3226', borderRadius: 14, padding: 20, marginBottom: 16 };

  return (
    <div style={{ minHeight: '100vh', background: '#15130f', color: '#f3ead9', fontFamily: 'system-ui, sans-serif', padding: '32px 16px' }}>
      <Head>
        <title>Instagram — Youvideo</title>
      </Head>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1 style={{ fontSize: 26 }}>📸 Instagram (sem Página do Facebook)</h1>
        <p style={nota}>Para contas que o Meta não deixa ligar a uma Página. O vídeo é publicado direto no Instagram, entrando com o login do próprio Instagram.</p>

        {!token ? (
          <div style={caixa}>
            <p>Senha da Central (a mesma do Compilador):</p>
            <input type="password" value={digitado} onChange={(e) => setDigitado(e.target.value)} style={{ padding: 10, borderRadius: 8, width: '100%', marginBottom: 10 }} />
            <button
              onClick={() => {
                try {
                  localStorage.setItem(CHAVE, digitado);
                } catch {
                  /* ok */
                }
                setToken(digitado);
              }}
            >
              Entrar
            </button>
          </div>
        ) : (
          <>
            {erro && linha(false, erro)}
            {r && (
              <>
                <div style={caixa}>
                  <h2 style={{ fontSize: 18 }}>1. Chaves do app do Meta</h2>
                  {linha(r.chaves.id && r.chaves.secret, r.chaves.id && r.chaves.secret ? 'INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET estão na Vercel.' : 'Faltam INSTAGRAM_APP_ID e/ou INSTAGRAM_APP_SECRET na Vercel.')}
                  <p style={nota}>
                    No <b>developers.facebook.com</b>, app <b>Youvideo Publicador</b> → <b>Adicionar produto: Instagram</b> → <b>Configuração da API com login do Instagram</b>.
                    Lá aparecem o <b>ID do app do Instagram</b> e a <b>Chave secreta do app do Instagram</b>: coloque na Vercel como INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET (e faça Redeploy).
                  </p>
                </div>
                <div style={caixa}>
                  <h2 style={{ fontSize: 18 }}>2. Endereço de retorno</h2>
                  <p style={nota}>Na mesma tela, em <b>Configurar login comercial do Instagram → URIs de redirecionamento OAuth</b>, coloque exatamente:</p>
                  <p style={{ background: '#15130f', borderRadius: 8, padding: 10, fontSize: 13, wordBreak: 'break-all', userSelect: 'all' }}>{r.redirect}</p>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(r.redirect);
                        setCopiado(true);
                      } catch {
                        /* ok */
                      }
                    }}
                  >
                    {copiado ? '✓ Copiado' : '📋 Copiar endereço'}
                  </button>
                  <p style={nota}>
                    Enquanto o app não passar pela análise do Meta, a conta do Instagram precisa ser <b>testadora</b>: em <b>Funções do app → Funções → Testadores do Instagram</b>, adicione o @ da conta e
                    aceite o convite no Instagram (Configurações → Apps e sites → Convites de testador).
                  </p>
                </div>
                <div style={caixa}>
                  <h2 style={{ fontSize: 18 }}>3. Conectar</h2>
                  {r.contas.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {linha(c.conectado, `${c.nome}: ${c.conectado ? `conectado (@${c.usuario})` : 'ainda não conectado'}`)}
                      <a href={`/api/auth/instagram?token=${encodeURIComponent(token)}&conta=${c.id}`}>
                        <button disabled={!r.chaves.id}>{c.conectado ? '↻ Conectar de novo' : '🔗 Conectar'}</button>
                      </a>
                    </div>
                  ))}
                  <p style={nota}>Abre o Instagram para você entrar na conta e autorizar. Entre com a conta certa antes de clicar.</p>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
