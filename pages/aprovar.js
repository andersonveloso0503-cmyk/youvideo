// Aprovar pelo celular: os vídeos prontos de games, política, Noites na História e Brasil Inacreditável esperam aqui (igual à aba ✅ Aprovar do Compilador).
import { useEffect, useState } from 'react';
import Head from 'next/head';

const CHAVE = 'youvideo-central-token';
const TIPO = { games: '🎮 Games', politica: '🏛️ Política', documentario: '🌙 Noites na História', brasil: '🇧🇷 Brasil Inacreditável' };

export default function Aprovar() {
  const [token, setToken] = useState('');
  const [digitado, setDigitado] = useState('');
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');

  useEffect(() => {
    try {
      setToken(localStorage.getItem(CHAVE) || localStorage.getItem('central-token') || '');
    } catch {
      /* sem armazenamento */
    }
  }, []);

  async function api(caminho, corpo) {
    const r = await fetch(caminho, {
      method: corpo ? 'POST' : 'GET',
      headers: { 'x-central-token': token, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) {
      try {
        localStorage.removeItem(CHAVE);
      } catch {
        /* ok */
      }
      setToken('');
      throw new Error('Senha da Central incorreta.');
    }
    if (!r.ok) throw new Error(d.erro || `Erro ${r.status}`);
    return d;
  }

  async function carregar() {
    setErro('');
    try {
      const d = await api('/api/central/fabrica?revisar=1');
      setItens(d.itens || []);
    } catch (e) {
      setErro(e.message);
    }
  }
  useEffect(() => {
    if (token) carregar();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acao(i, nome, msg, pergunta) {
    if (pergunta && !confirm(pergunta)) return;
    setOcupado(i.id + nome);
    try {
      const r = await api('/api/central/fabrica', { id: i.id, acao: nome });
      setItens((lista) => lista.filter((x) => x.id !== i.id));
      setAviso(nome === 'video-aprovar' && r.instagram ? `${msg} (e vai para o Instagram também)` : msg);
    } catch (e) {
      setAviso(`⚠️ ${e.message}`);
    } finally {
      setOcupado('');
    }
  }

  const botao = (cor) => ({ flex: 1, padding: '14px 8px', fontSize: 16, fontWeight: 700, borderRadius: 12, border: 'none', background: cor, color: '#fff' });

  return (
    <div style={{ minHeight: '100vh', background: '#15130f', color: '#f3ead9', fontFamily: 'system-ui, sans-serif', padding: '16px 12px 40px' }}>
      <Head>
        <title>Aprovar vídeos — Youvideo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>
            <a href="/acompanhar" style={{ color: '#c9bfae', textDecoration: 'none', marginRight: 8 }}>‹</a>✅ Aprovar vídeos
          </h1>
          {token && (
            <button onClick={carregar} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #3a3226', background: '#211d17', color: '#f3ead9' }}>
              ↻ Atualizar
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: '#c9bfae', marginTop: 4 }}>Nada vai ao YouTube antes de você aprovar. Shorts aprovados vão também para o Instagram do canal, no mesmo horário.</p>

        {!token ? (
          <div style={{ background: '#211d17', borderRadius: 14, padding: 16 }}>
            <p>Senha da Central (a mesma do Compilador):</p>
            <input type="password" value={digitado} onChange={(e) => setDigitado(e.target.value)} style={{ padding: 12, borderRadius: 10, width: '100%', fontSize: 16, marginBottom: 10 }} />
            <button
              style={botao('#c0522f')}
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
            {erro && <p style={{ color: '#ffb3a6' }}>⚠️ {erro}</p>}
            {aviso && <p style={{ background: '#1f2e26', color: '#8fd6c1', padding: 10, borderRadius: 10 }}>{aviso}</p>}
            {itens === null && !erro && <p>Carregando...</p>}
            {itens && !itens.length && <p>Nenhum vídeo esperando aprovação. 👍</p>}
            {(itens || []).map((i) => {
              const curto = i.formato === 'short';
              const quando = i.quando ? new Date(i.quando).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sem horário';
              return (
                <div key={i.id} style={{ background: '#211d17', border: '1px solid #3a3226', borderRadius: 16, overflow: 'hidden', marginBottom: 18 }}>
                  <video
                    src={i.videoUrl}
                    poster={i.thumbnailUrl || undefined}
                    controls
                    playsInline
                    preload="none"
                    style={{ width: '100%', background: '#000', aspectRatio: curto ? '9/16' : '16/9', maxHeight: curto ? '70vh' : 'none', display: 'block' }}
                  />
                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 12, color: '#c9bfae' }}>
                      {TIPO[i.tipo] || ''} · {curto ? 'Short' : 'Vídeo longo'} · {i.canal}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, margin: '6px 0' }}>{i.titulo}</div>
                    <div style={{ fontSize: 13, color: '#c9bfae', marginBottom: 12 }}>📅 Vai ao ar: {quando}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={!!ocupado} style={botao('#2f8a5b')} onClick={() => acao(i, 'video-aprovar', `Aprovado: "${i.titulo}"`)}>
                        ✅ Aprovar
                      </button>
                      <button
                        disabled={!!ocupado}
                        style={botao('#5a4a2e')}
                        onClick={() => acao(i, 'refazer-documentario', 'Refazendo: volta para cá quando ficar pronto', `Refazer "${i.titulo}" com imagens novas?`)}
                      >
                        🎬 Refazer
                      </button>
                      <button
                        disabled={!!ocupado}
                        style={{ ...botao('#6b2a22'), flex: 0.5 }}
                        onClick={() => acao(i, 'cancelar', 'Descartado', `Descartar "${i.titulo}"? Ele não vai para o YouTube.`)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
