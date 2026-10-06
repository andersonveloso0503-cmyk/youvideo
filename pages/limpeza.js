// Limpeza automática dos vídeos antigos: mostra o que seria apagado e liga/desliga.
import { useEffect, useState } from 'react';
import Head from 'next/head';

const CHAVE = 'youvideo-central-token';

export default function Limpeza() {
  const [token, setToken] = useState('');
  const [digitado, setDigitado] = useState('');
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    try { setToken(localStorage.getItem(CHAVE) || ''); } catch { /* sem armazenamento */ }
  }, []);

  const api = async (metodo, corpo) => {
    const resp = await fetch('/api/central/limpeza', {
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
    if (!resp.ok) throw new Error(/quota|RESOURCE_EXHAUSTED/i.test(d.erro || '') ? 'O banco de dados atingiu o limite de hoje. Tente de novo amanhã cedo.' : d.erro || `Erro ${resp.status}`);
    return d;
  };

  async function carregar() {
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
  useEffect(() => { if (token) carregar(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acao(nome, confirmar) {
    if (confirmar && !window.confirm(confirmar)) return;
    setMsg('');
    setErro('');
    try {
      const d = await api('POST', { acao: nome });
      if (nome === 'rodar') setMsg(`${d.apagados} vídeo(s) apagado(s).${d.faltam ? ` Faltam ${d.faltam}, que saem nos próximos dias.` : ''}`);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  const data = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
  const nota = { fontSize: 14, color: '#c9bda6', lineHeight: 1.5 };

  return (
    <div className="container">
      <Head><title>Limpeza automática · Youvideo</title></Head>
      <h1>Limpeza automática</h1>
      <p className="subtitle">Apaga sozinho os vídeos antigos que já cumpriram o papel, para o Youvideo ficar leve.</p>

      {!token && (
        <div className="card">
          <label>Senha da Central</label>
          <input type="password" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="a mesma do Compilador" />
          <button onClick={() => { try { localStorage.setItem(CHAVE, digitado.trim()); } catch { /* ok */ } setToken(digitado.trim()); }}>Entrar</button>
        </div>
      )}
      {carregando && <div className="card">Conferindo...</div>}
      {erro && <div className="card" style={{ color: '#ffb3a6' }}>{erro}</div>}
      {msg && <div className="card" style={{ color: '#8fd6c1' }}>{msg}</div>}

      {r && (
        <>
          <div className="card">
            <h2>A regra</h2>
            <p style={nota}>
              Um vídeo só é apagado quando as três coisas são verdade: tem <b>mais de {r.dias} dias</b>, <b>já está no YouTube</b> e
              <b> não tem post esperando</b> em nenhuma rede. Roda uma vez por dia, de madrugada, no máximo 20 vídeos por dia.
            </p>
            <p style={nota}>Apagar não tem volta. Os arquivos que estão no seu computador não são tocados, e o vídeo continua no YouTube e nas redes.</p>
            <p style={{ fontSize: 17, color: r.ligada ? '#8fd6c1' : '#ffb3a6' }}>{r.ligada ? '✅ A limpeza automática está LIGADA.' : '⏸ A limpeza automática está DESLIGADA.'}</p>
            {r.ligada
              ? <button onClick={() => acao('desligar')}>Desligar</button>
              : <button onClick={() => acao('ligar', 'Ligar a limpeza automática? A partir de amanhã ela apaga sozinha os vídeos da lista abaixo.')}>Ligar a limpeza automática</button>}
          </div>

          <div className="card">
            <h2>O que seria apagado hoje ({r.total})</h2>
            {!r.total && <p style={nota}>Nada. Nenhum vídeo bate com a regra ainda.</p>}
            {r.candidatos.map((c, k) => (
              <p key={k} style={{ fontSize: 14, margin: '6px 0', borderBottom: '1px solid #2c261b', paddingBottom: 6 }}>
                <b>{c.titulo}</b><br />
                <span style={{ color: '#9c8f79' }}>{c.tipo} · {data(c.criadoEm)}</span>
              </p>
            ))}
            {r.total > 0 && <button onClick={() => acao('rodar', `Apagar agora ${Math.min(20, r.total)} vídeo(s) da lista? Não tem volta.`)} style={{ marginTop: 10 }}>Apagar agora (até 20)</button>}
          </div>

          <div className="card">
            <h2>Últimas limpezas</h2>
            {!(r.historico || []).length && <p style={nota}>Ainda não rodou nenhuma.</p>}
            {(r.historico || []).map((h, k) => (
              <details key={k} style={{ margin: '6px 0' }}>
                <summary style={{ cursor: 'pointer', fontSize: 14 }}>{new Date(h.em).toLocaleString('pt-BR')} — {h.apagados} apagado(s)</summary>
                {(h.itens || []).map((i, n) => <p key={n} style={{ fontSize: 13, margin: '4px 0 4px 14px', color: i.erro ? '#ffb3a6' : '#c9bda6' }}>{i.titulo}{i.erro ? ` — erro: ${i.erro}` : ''}</p>)}
              </details>
            ))}
            <button onClick={carregar} style={{ marginTop: 10 }}>Conferir de novo</button>
          </div>
        </>
      )}
    </div>
  );
}
