// Responder comentários pelo celular: os comentários novos dos canais de games e política, com a resposta já sugerida pela IA.
// Você confere, corrige se quiser e aperta Responder; o Compilador publica como o canal em até 1 minuto.
import { useEffect, useState } from 'react';
import Head from 'next/head';

const CHAVE = 'youvideo-central-token';
const TIPO = { games: '🎮 Games', politica: '🏛️ Política' };

export default function Comentarios() {
  const [token, setToken] = useState('');
  const [digitado, setDigitado] = useState('');
  const [itens, setItens] = useState(null);
  const [canais, setCanais] = useState([]);
  const [textos, setTextos] = useState({});
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

  async function api(corpo, forcar = false) {
    const r = await fetch(`/api/central/comentarios${forcar ? '?forcar=1' : ''}`, {
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

  async function carregar(forcar = false) {
    setErro('');
    try {
      const d = await api(null, forcar);
      setCanais(d.canais || []);
      setItens(d.itens || []);
      setTextos(Object.fromEntries((d.itens || []).map((i) => [i.id, i.sugestao || ''])));
    } catch (e) {
      setErro(e.message);
    }
  }
  useEffect(() => {
    if (token) carregar();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acao(i, nome) {
    setOcupado(i.id);
    try {
      await api({ id: i.id, acao: nome, texto: textos[i.id] });
      setItens((l) => l.filter((x) => x.id !== i.id));
      setAviso(nome === 'responder' ? `✅ Resposta para ${i.autor} vai ao ar em até 1 minuto` : 'Ignorado');
    } catch (e) {
      setAviso(`⚠️ ${e.message}`);
    } finally {
      setOcupado('');
    }
  }

  const botao = (cor) => ({ flex: 1, padding: '13px 8px', fontSize: 16, fontWeight: 700, borderRadius: 12, border: 'none', background: cor, color: '#fff' });

  return (
    <div style={{ minHeight: '100vh', background: '#15130f', color: '#f3ead9', fontFamily: 'system-ui, sans-serif', padding: '16px 12px 40px' }}>
      <Head>
        <title>Comentários — Youvideo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>
            <a href="/acompanhar" style={{ color: '#c9bfae', textDecoration: 'none', marginRight: 8 }}>‹</a>💬 Comentários
          </h1>
          {token && (
            <button onClick={carregar} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #3a3226', background: '#211d17', color: '#f3ead9' }}>
              ↻ Atualizar
            </button>
          )}
        </div>
        <p style={{ fontSize: 13, color: '#c9bfae', marginTop: 4 }}>
          Comentários novos dos canais de games e política, com a resposta sugerida. Corrija se quiser e aperte Responder. Spam e ofensa já ficam de fora.
        </p>

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
            {canais.length > 0 && (
              <div style={{ fontSize: 13, opacity: 0.85, margin: '4px 0 12px', lineHeight: 1.5 }}>
                {canais.map((c, k) => (
                  <div key={c.id || k}>
                    {TIPO[c.tipo] || 'Canal'}:{' '}
                    {c.erro
                      ? `⚠️ não consegui ler os comentários (${c.erro})`
                      : c.em
                        ? `conferido às ${new Date(c.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${typeof c.achados === 'number' ? ` · ${c.achados} sem resposta no YouTube` : ''}`
                        : 'ainda não conferido'}
                  </div>
                ))}
                <button onClick={() => carregar(true)} style={{ marginTop: 6, padding: '6px 12px', borderRadius: 10, border: '1px solid #6b5f48', background: 'transparent', color: '#f3ead9' }}>
                  🔄 Buscar agora
                </button>
              </div>
            )}
            {itens && !itens.length && <p>Nenhum comentário novo esperando resposta. 👍</p>}
            {(itens || []).map((i) => (
              <div key={i.id} style={{ background: '#211d17', border: '1px solid #3a3226', borderRadius: 16, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: '#c9bfae' }}>
                  {TIPO[i.tipo] || ''} · <a href={`https://www.youtube.com/watch?v=${i.videoId}`} style={{ color: '#c9bfae' }}>{i.videoTitulo || 'vídeo'}</a>
                </div>
                <div style={{ margin: '8px 0', fontSize: 15 }}>
                  <b>{i.autor}</b>
                  {i.curtidas ? <span style={{ color: '#c9bfae', fontSize: 12 }}> · 👍 {i.curtidas}</span> : null}
                  <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{i.texto}</div>
                </div>
                <textarea
                  value={textos[i.id] ?? ''}
                  onChange={(e) => setTextos((t) => ({ ...t, [i.id]: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 10, border: '1px solid #3a3226', background: '#15130f', color: '#f3ead9', fontSize: 15, marginBottom: 10 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={!!ocupado || !String(textos[i.id] || '').trim()} style={botao('#2f8a5b')} onClick={() => acao(i, 'responder')}>
                    💬 Responder
                  </button>
                  <button disabled={!!ocupado} style={{ ...botao('#5a4a2e'), flex: 0.5 }} onClick={() => acao(i, 'ignorar')}>
                    Ignorar
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
