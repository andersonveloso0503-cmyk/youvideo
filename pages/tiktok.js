// Conexão do TikTok: confere o que falta, conecta a conta e manda um vídeo de teste como rascunho.
import { useEffect, useState } from 'react';
import Head from 'next/head';

const CHAVE = 'youvideo-central-token';

export default function ConexaoTiktok() {
  const [token, setToken] = useState('');
  const [digitado, setDigitado] = useState('');
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [teste, setTeste] = useState(null); // { texto, ok }
  const [testando, setTestando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    try { setToken(localStorage.getItem(CHAVE) || ''); } catch { /* sem armazenamento */ }
  }, []);

  const api = async (metodo, corpo) => {
    const resp = await fetch('/api/central/tiktok', {
      method: metodo,
      headers: { 'x-central-token': token, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    const d = await resp.json().catch(() => ({}));
    if (resp.status === 401) {
      try { localStorage.removeItem(CHAVE); } catch { /* ok */ }
      setToken('');
      throw new Error('Senha da Central incorreta.');
    }
    if (!resp.ok) throw new Error(d.erro || `Erro ${resp.status}`);
    return d;
  };

  async function conferir() {
    if (!token) return;
    setCarregando(true);
    setErro('');
    try {
      setR(await api('GET'));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { if (token) conferir(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function mandarTeste() {
    setTestando(true);
    setTeste({ texto: 'Mandando o vídeo mais recente para o seu TikTok... (pode levar 1 minuto)' });
    try {
      const d = await api('POST', { acao: 'teste' });
      setTeste({ texto: `Vídeo enviado: "${d.titulo}". Esperando o TikTok receber...` });
      for (let i = 0; i < 24; i++) {
        await new Promise((ok) => setTimeout(ok, 5000));
        const s = await api('POST', { acao: 'status', publishId: d.publishId });
        if (s.status === 'SEND_TO_USER_INBOX' || s.status === 'PUBLISH_COMPLETE') return setTeste({ texto: s.texto, ok: true });
        if (s.erro) return setTeste({ texto: s.texto, ok: false });
        setTeste({ texto: s.texto || 'Esperando o TikTok...' });
      }
      setTeste({ texto: 'O TikTok ainda está processando. Abra o aplicativo do TikTok daqui a pouco e veja a caixa de entrada.' });
    } catch (e) {
      setTeste({ texto: e.message, ok: false });
    } finally {
      setTestando(false);
    }
  }

  async function desconectar() {
    if (!window.confirm('Desconectar o TikTok do Youvideo?')) return;
    try {
      await api('POST', { acao: 'desconectar' });
      setTeste(null);
      conferir();
    } catch (e) {
      setErro(e.message);
    }
  }

  const linha = (ok, texto) => (
    <p style={{ fontSize: 16, color: ok ? '#8fd6c1' : '#ffb3a6', margin: '8px 0' }}>{ok ? '✅' : '⚠️'} {texto}</p>
  );
  const nota = { fontSize: 14, color: '#c9bda6', lineHeight: 1.5 };
  const temChaves = r && r.chaves?.key && r.chaves?.secret;
  const linkConectar = (escopo) => `/api/auth/tiktok?token=${encodeURIComponent(token)}${escopo ? `&escopo=${escopo}` : ''}`;

  return (
    <div className="container">
      <Head><title>Conexão do TikTok · Youvideo</title></Head>
      <h1>Conexão do TikTok</h1>
      <p className="subtitle">Liga o Youvideo ao seu TikTok para os vídeos chegarem prontos dentro do aplicativo.</p>

      {!token && (
        <div className="card">
          <label>Senha da Central</label>
          <input type="password" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="a mesma do Compilador" />
          <button onClick={() => { try { localStorage.setItem(CHAVE, digitado.trim()); } catch { /* ok */ } setToken(digitado.trim()); }}>Entrar</button>
        </div>
      )}

      {carregando && <div className="card">Conferindo...</div>}
      {erro && <div className="card" style={{ color: '#ffb3a6' }}>{erro}</div>}

      {r && (
        <>
          <div className="card">
            <h2>1. Chaves do aplicativo</h2>
            {temChaves ? (
              <>
                {linha(true, `As chaves ${r.chaves.sandbox ? 'de teste (Sandbox)' : 'do aplicativo'} estão na Vercel${r.chaves.final ? ` (a chave termina em …${r.chaves.final})` : ''}.`)}
                {r.validacao && r.validacao.ok === true && linha(true, 'O TikTok reconheceu essas chaves.')}
                {r.validacao && r.validacao.ok === false && (
                  <>
                    {linha(false, `O TikTok NÃO reconhece essas chaves (resposta dele: ${r.validacao.erro}).`)}
                    <p style={nota}>
                      Enquanto isso não ficar verde, o botão Conectar vai dar erro de client_key. Confira no site do TikTok, na tela do <b>Sandbox</b>:
                      o <b>Client key</b> termina em …{r.chaves.final}? Se não termina, o valor na Vercel é de outro lugar (cole de novo o do Sandbox).
                      Se termina igual, o problema é o <b>Client secret</b> (copie de novo) ou faltou clicar em <b>Apply changes</b> no Sandbox.
                    </p>
                  </>
                )}
                {r.validacao && r.validacao.ok === null && <p style={nota}>Não consegui confirmar as chaves agora: {r.validacao.erro}.</p>}
                {r.tamanhos && (
                  <p style={{ ...nota, fontSize: 12.5, opacity: 0.8 }}>
                    Tamanho do que está na Vercel — Sandbox: chave {r.tamanhos.sandboxKey} letras, segredo {r.tamanhos.sandboxSecret} letras · Normal: chave {r.tamanhos.key}, segredo {r.tamanhos.secret}.
                    (0 quer dizer que a variável não existe neste projeto ou está vazia.)
                  </p>
                )}
                {!r.chaves.sandbox && !r.conectado && (
                  <p style={nota}>
                    Se ao conectar o TikTok mostrar <b>erro de client_key</b>, é porque o aplicativo ainda não foi aprovado e essa chave só vale depois da aprovação.
                    Nesse caso use as chaves de teste: no site developers.tiktok.com abra o aplicativo, mude para <b>Sandbox</b> (no alto da página), crie o Sandbox,
                    e crie na Vercel duas variáveis novas com os valores de lá: <b>TIKTOK_SANDBOX_CLIENT_KEY</b> e <b>TIKTOK_SANDBOX_CLIENT_SECRET</b>. Depois faça o Redeploy.
                    Não precisa apagar as que já existem.
                  </p>
                )}
              </>
            ) : (
              <>
                {linha(false, `Falta na Vercel: ${[!r.chaves?.key && 'TIKTOK_CLIENT_KEY', !r.chaves?.secret && 'TIKTOK_CLIENT_SECRET'].filter(Boolean).join(' e ')}`)}
                <p style={nota}>
                  Onde pegar: no site developers.tiktok.com, em <b>Manage apps</b>, abra o seu aplicativo. Se ele ainda não foi aprovado, use a aba <b>Sandbox</b>.
                  Copie o <b>Client key</b> e o <b>Client secret</b> e cole direto na Vercel (projeto do Youvideo → Settings → Environment Variables), depois faça o Redeploy.
                  Não mande esses valores em conversa.
                </p>
              </>
            )}
          </div>

          <div className="card">
            <h2>2. Endereço de retorno</h2>
            <p style={nota}>No aplicativo do TikTok, em <b>Login Kit → Redirect URI</b>, precisa estar exatamente este endereço:</p>
            <p style={{ background: '#15130f', borderRadius: 8, padding: 10, fontSize: 13, wordBreak: 'break-all', userSelect: 'all' }}>{r.redirect}</p>
            <button onClick={async () => { try { await navigator.clipboard.writeText(r.redirect); setCopiado(true); } catch { /* ok */ } }}>{copiado ? '✓ Copiado' : '📋 Copiar endereço'}</button>
            <p style={nota}>
              No mesmo aplicativo confira também: produtos <b>Login Kit</b> e <b>Content Posting API</b> adicionados, e as permissões <b>video.upload</b> e <b>video.publish</b>.
              Na aba Sandbox, a sua conta do TikTok precisa estar em <b>Target Users</b>.
            </p>
          </div>

          <div className="card">
            <h2>3. Conectar a conta</h2>
            {r.conectado ? (
              <>
                {linha(!r.erro, r.conta?.nome ? `Conectado em ${r.conta.nome}${r.conta.usuario ? ` (@${r.conta.usuario})` : ''}.` : r.erro ? `A conexão existe, mas o TikTok respondeu: ${r.erro}` : 'Conectado.')}
                {r.semNome && <p style={nota}>Esta conexão só tem a permissão de rascunho; por isso o TikTok não mostra o nome da conta. O envio funciona igual.</p>}
                <button onClick={desconectar} style={{ marginTop: 8 }}>Desconectar</button>
              </>
            ) : temChaves ? (
              <>
                {linha(false, 'Ainda não conectado.')}
                <a href={linkConectar('')}><button>🔗 Conectar o TikTok</button></a>
                <p style={nota}>
                  Abre o TikTok para você entrar na conta e autorizar. Se aparecer erro de permissão (scope),{' '}
                  <a href={linkConectar('upload')} style={{ color: '#d9a441' }}>tente conectar só com a permissão de rascunho</a>.
                </p>
              </>
            ) : linha(false, 'Primeiro coloque as chaves do aplicativo (passo 1).')}
          </div>

          {r.conectado && (
            <div className="card">
              <h2>4. Teste</h2>
              <p style={nota}>Manda o vídeo mais recente da agenda para dentro do seu TikTok, como rascunho. Nada é publicado.</p>
              <button onClick={mandarTeste} disabled={testando}>{testando ? 'Enviando...' : '📥 Mandar um vídeo de teste'}</button>
              {teste && <p style={{ fontSize: 15, color: teste.ok === true ? '#8fd6c1' : teste.ok === false ? '#ffb3a6' : '#e8c46a', marginTop: 10 }}>{teste.ok === true ? '✅ ' : teste.ok === false ? '⚠️ ' : ''}{teste.texto}</p>}
            </div>
          )}

          <div className="card">
            <h2>Como fica no dia a dia</h2>
            <p style={nota}>
              Na hora de cada post, o Youvideo manda o vídeo para dentro do seu TikTok. Você abre o aplicativo, toca no aviso do vídeo na caixa de entrada,
              cola a legenda (ela fica na página <a href="/postar" style={{ color: '#d9a441' }}>Postar pelo celular</a>) e publica.
            </p>
            <p style={nota}>
              O TikTok aceita até 5 vídeos esperando por dia e pede para publicar em até 24 horas. Publicar sozinho, sem esse toque, o TikTok só libera para aplicativos auditados por ele.
            </p>
            <button onClick={conferir}>Conferir de novo</button>
          </div>
        </>
      )}
    </div>
  );
}
