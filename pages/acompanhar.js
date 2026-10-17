// Acompanhar pelo celular: o que a Fábrica está produzindo agora, o que deu erro, o que ficou pronto
// e o que cada PC com o Compilador está fazendo. Pede a senha da Central uma vez (fica guardada no celular).
import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';

const ETAPAS = ['pendente', 'roteiro_ok', 'voz_ok', 'imagens_ok', 'animando', 'montando', 'concluido'];
const ETAPA = {
  pendente: 'Escrevendo o roteiro',
  roteiro_ok: 'Gerando as vozes',
  voz_ok: 'Gerando as imagens',
  imagens_ok: 'Mandando animar',
  animando: 'Animando as cenas',
  montando: 'Montando no PC',
  concluido: 'Pronto',
  erro: 'Erro',
};
const TIPO = (i) =>
  i.marca ? ['🏢', 'Empresa'] : i.infantil ? ['🧸', i.infantil.shortMusica ? 'Short da música' : 'Planeta Fofura'] : i.oracao ? ['🙏', 'Oração'] : i.documentario ? ['🌙', 'Documentário'] : i.longo ? ['📺', 'Vídeo longo'] : i.corte ? ['🎬', 'Corte'] : i.estilo === 'desenho' ? ['🎨', 'Desenho'] : ['🎥', 'Short'];

const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const ha = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dias`;
};
const naEspera = (i) => i.status === 'pendente' && i.quando && new Date(i.quando).getTime() > Date.now();

function lerSenha() {
  try {
    return localStorage.getItem('central-token') || '';
  } catch {
    return '';
  }
}
function gravarSenha(v) {
  try {
    if (v) localStorage.setItem('central-token', v);
    else localStorage.removeItem('central-token');
  } catch {}
}

function Barra({ valor, cor = '#7c5cff' }) {
  return (
    <div style={{ height: 6, background: '#2a2a3a', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${Math.round(Math.max(0.03, Math.min(1, valor)) * 100)}%`, height: '100%', background: cor, transition: 'width .4s' }} />
    </div>
  );
}

function Item({ i, acao }) {
  const [emoji, tipo] = TIPO(i);
  const etapaIdx = ETAPAS.indexOf(i.status);
  let detalhe = ETAPA[i.status] || i.status;
  let prog = etapaIdx >= 0 ? (etapaIdx + 0.5) / ETAPAS.length : 0;
  if (i.cenas && ['imagens_ok', 'animando'].includes(i.status)) {
    detalhe += ` · ${i.cenas.animadas} de ${i.cenas.total} cenas prontas`;
    prog = (4 + i.cenas.animadas / Math.max(1, i.cenas.total)) / ETAPAS.length;
  }
  const yt = i.youtube?.status;
  const ytTxt = yt === 'ok' ? '✅ no YouTube' : yt === 'enviando' ? '⏫ subindo no YouTube' : yt === 'pendente' ? '⏳ esperando o PC subir' : yt === 'erro' ? '⚠ YouTube deu erro' : '';
  return (
    <div style={{ background: '#1b1b28', borderRadius: 12, padding: 12, marginBottom: 10, borderLeft: `4px solid ${i.status === 'erro' ? '#ff6b6b' : i.status === 'concluido' ? '#4cd18a' : '#ffc94d'}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {i.thumbnailUrl ? (
          <a href={i.thumbnailUrl} target="_blank" rel="noreferrer">
            <img src={i.thumbnailUrl} alt="" style={{ width: 88, height: 50, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
          </a>
        ) : (
          <div style={{ fontSize: 26, width: 34, textAlign: 'center' }}>{emoji}</div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, wordBreak: 'break-word' }}>{i.titulo || i.tema}</div>
          <div style={{ fontSize: 12.5, color: '#a9a9c0', marginTop: 3 }}>
            {tipo} · {i.status === 'concluido' ? `vai ao ar ${quando(i.quandoYoutube || i.quando)}` : naEspera(i) ? `começa ${quando(i.quando)}` : detalhe}
          </div>
          {i.status === 'erro' && <div style={{ fontSize: 13, color: '#ff8a8a', marginTop: 4 }}>{i.erro || 'Erro sem detalhe'}</div>}
          {i.status !== 'erro' && i.status !== 'concluido' && i.erro && <div style={{ fontSize: 12.5, color: '#ffb36b', marginTop: 4 }}>⏳ Travou e está tentando de novo: {i.erro}</div>}
          {i.aviso && <div style={{ fontSize: 12.5, color: '#ffb36b', marginTop: 4 }}>⚠ {i.aviso}</div>}
          {ytTxt && <div style={{ fontSize: 12.5, marginTop: 4, color: '#cfcfe0' }}>{ytTxt}{yt === 'erro' && i.youtube?.erro ? `: ${i.youtube.erro}` : ''}</div>}
        </div>
      </div>
      {!['concluido', 'erro'].includes(i.status) && !naEspera(i) && <Barra valor={prog} />}
      {(i.videoUrl || i.youtube?.url || i.status === 'erro' || yt === 'erro' || naEspera(i) || (i.erro && i.status !== 'concluido')) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {i.status === 'erro' && <BotaoAcao acao={acao} id={i.id} tipo="repetir" texto="↻ Tentar de novo" ok="Volta a produzir em até 5 min, de onde parou" />}
          {i.status !== 'erro' && i.status !== 'concluido' && !naEspera(i) && i.erro && <BotaoAcao acao={acao} id={i.id} tipo="destravar" texto="↻ Tentar agora" ok="Tenta de novo em até 5 min" />}
          {yt === 'erro' && <BotaoAcao acao={acao} id={i.id} tipo="youtube-repetir" texto="↻ Subir de novo no YouTube" ok="O PC tenta subir de novo em até 2 min" />}
          {naEspera(i) && <BotaoAcao acao={acao} id={i.id} tipo="produzir-agora" texto="⚡ Produzir agora" ok="Começa em até 5 min (a data no YouTube continua a mesma)" />}
          {i.videoUrl && <a href={i.videoUrl} target="_blank" rel="noreferrer" style={botao}>▶ Assistir</a>}
          {i.youtube?.url && <a href={i.youtube.url} target="_blank" rel="noreferrer" style={botao}>Abrir no YouTube</a>}
        </div>
      )}
    </div>
  );
}

function BotaoAcao({ acao, id, tipo, texto, ok }) {
  const [estado, setEstado] = useState('');
  return (
    <button
      disabled={estado === '…'}
      onClick={async () => {
        setEstado('…');
        const r = await acao(id, tipo);
        setEstado(r === true ? '✓' : '');
        if (r !== true) alert(r);
        else alert(`✓ ${ok}`);
      }}
      style={{ ...botao, border: 0, background: tipo === 'produzir-agora' ? '#2d2d44' : '#7c5cff' }}
    >
      {estado === '…' ? 'Enviando…' : estado === '✓' ? '✓ Feito' : texto}
    </button>
  );
}

const botao = { background: '#2d2d44', color: '#fff', padding: '7px 12px', borderRadius: 8, fontSize: 13, textDecoration: 'none' };

function Pc({ p }) {
  const ativos = (p.jobs || []).filter((j) => !['concluido', 'cancelado'].includes(j.status));
  const erros = (p.jobs || []).filter((j) => j.status === 'erro');
  const online = Date.now() - (p.atualizadoEm || 0) < 10 * 60e3;
  return (
    <div style={{ background: '#1b1b28', borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <div style={{ fontWeight: 700 }}>
        💻 {p.pcNome || p.pc} <span style={{ fontSize: 12, fontWeight: 400, color: online ? '#4cd18a' : '#a9a9c0' }}>· {online ? 'ligado' : `visto ${ha(p.atualizadoEm)}`}</span>
      </div>
      {!ativos.length && <div style={{ fontSize: 13, color: '#a9a9c0', marginTop: 4 }}>Nada na fila agora.</div>}
      {ativos.filter((j) => j.status !== 'erro').slice(0, 8).map((j) => (
        <div key={j.id} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13.5, wordBreak: 'break-word' }}>{j.nome || j.tipo}</div>
          <div style={{ fontSize: 12, color: '#a9a9c0' }}>
            {j.etapa || j.status}
            {j.restanteSeg ? ` · falta ~${Math.max(1, Math.round(j.restanteSeg / 60))} min` : ''}
          </div>
          {j.status !== 'aguardando' && <Barra valor={j.progresso} cor="#4da3ff" />}
        </div>
      ))}
      {erros.slice(0, 4).map((j) => (
        <div key={j.id} style={{ marginTop: 8, fontSize: 12.5, color: '#ff8a8a', wordBreak: 'break-word' }}>
          ⚠ {j.nome}: {j.erro}
        </div>
      ))}
    </div>
  );
}

export default function Acompanhar() {
  const [senha, setSenha] = useState('');
  const [digitada, setDigitada] = useState('');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [aba, setAba] = useState('andamento');

  useEffect(() => setSenha(lerSenha()), []);

  const carregar = useCallback(async () => {
    if (!senha) return;
    setCarregando(true);
    try {
      const h = { 'x-central-token': senha };
      const [f, p] = await Promise.all([fetch('/api/central/fabrica', { headers: h }), fetch('/api/central/pc-filas', { headers: h })]);
      if (f.status === 401) {
        gravarSenha('');
        setSenha('');
        setErro('Senha incorreta. É a mesma senha da Central que está no Compilador.');
        return;
      }
      const fab = await f.json();
      const pcs = p.ok ? await p.json() : { pcs: [] };
      if (fab.erro) throw new Error(fab.erro);
      setDados({ itens: fab.itens || [], pcs: pcs.pcs || [], em: Date.now() });
      setErro('');
    } catch (e) {
      setErro(`Não consegui atualizar: ${e.message}`);
    } finally {
      setCarregando(false);
    }
  }, [senha]);

  const acao = useCallback(
    async (id, tipo) => {
      try {
        const r = await fetch('/api/central/fabrica', { method: 'POST', headers: { 'x-central-token': senha, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, acao: tipo }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return d.erro || `Erro ${r.status}`;
        setTimeout(carregar, 1500);
        return true;
      } catch (e) {
        return e.message;
      }
    },
    [senha, carregar]
  );

  useEffect(() => {
    carregar();
    // Atualiza sozinho a cada 2 min, só com a tela aberta (economiza leituras do banco)
    const t = setInterval(() => document.visibilityState === 'visible' && carregar(), 120000);
    const v = () => document.visibilityState === 'visible' && carregar();
    document.addEventListener('visibilitychange', v);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', v);
    };
  }, [carregar]);

  const itens = dados?.itens || [];
  const erros = itens.filter((i) => i.status === 'erro');
  const produzindo = itens.filter((i) => !['concluido', 'erro'].includes(i.status) && !naEspera(i));
  const espera = itens.filter(naEspera);
  const prontos = itens.filter((i) => i.status === 'concluido').sort((a, b) => String(b.quandoYoutube || b.quando).localeCompare(String(a.quandoYoutube || a.quando)));
  const avisos = itens.filter((i) => i.status !== 'erro' && i.aviso);

  return (
    <div style={{ minHeight: '100vh', background: '#11111a', color: '#f1f1f7', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: '16px 16px 40px', maxWidth: 640, margin: '0 auto' }}>
      <Head>
        <title>Acompanhar produção</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#11111a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Produção" />
      </Head>
      <h1 style={{ fontSize: 22, margin: '4px 0 2px' }}>📱 Produção</h1>

      {!senha ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            gravarSenha(digitada.trim());
            setSenha(digitada.trim());
          }}
          style={{ marginTop: 20 }}
        >
          <p style={{ color: '#a9a9c0', fontSize: 14 }}>Digite a senha da Central (a mesma que está no Compilador, em Configurações). Ela fica guardada neste celular.</p>
          <input type="password" value={digitada} onChange={(e) => setDigitada(e.target.value)} placeholder="Senha da Central" style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #33334a', background: '#1b1b28', color: '#fff', fontSize: 16, boxSizing: 'border-box' }} />
          <button type="submit" style={{ ...botao, border: 0, marginTop: 10, padding: '12px 16px', fontSize: 15, background: '#7c5cff', width: '100%' }}>Entrar</button>
          {erro && <p style={{ color: '#ff8a8a', fontSize: 14 }}>{erro}</p>}
        </form>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: '#a9a9c0', marginBottom: 12 }}>
            {dados ? `Atualizado ${ha(dados.em)}` : 'Carregando…'}
            <button onClick={carregar} disabled={carregando} style={{ ...botao, border: 0, marginLeft: 10, padding: '5px 10px', fontSize: 12.5 }}>
              {carregando ? '…' : '↻ Atualizar'}
            </button>
          </div>
          {erro && <p style={{ color: '#ff8a8a', fontSize: 14 }}>{erro}</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              ['Produzindo', produzindo.length, '#ffc94d', 'andamento'],
              ['Com erro', erros.length, '#ff6b6b', 'andamento'],
              ['Prontos', prontos.length, '#4cd18a', 'prontos'],
              ['Na espera', espera.length, '#a9a9c0', 'espera'],
            ].map(([nome, n, cor, alvo]) => (
              <button key={nome} onClick={() => setAba(alvo)} style={{ background: '#1b1b28', border: 0, borderRadius: 10, padding: '10px 4px', color: '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: cor }}>{n}</div>
                <div style={{ fontSize: 11.5, color: '#a9a9c0' }}>{nome}</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
            {[
              ['andamento', 'Andamento'],
              ['pcs', 'PCs'],
              ['prontos', 'Prontos'],
              ['espera', 'Na espera'],
            ].map(([id, nome]) => (
              <button key={id} onClick={() => setAba(id)} style={{ ...botao, border: 0, background: aba === id ? '#7c5cff' : '#2d2d44', whiteSpace: 'nowrap' }}>
                {nome}
              </button>
            ))}
          </div>

          {aba === 'andamento' && (
            <>
              {erros.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={titulo}>⚠ Com erro</h3>
                  {erros.length > 1 && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Tentar de novo os ${erros.length} vídeos com erro?`)) return;
                        const r = await Promise.all(erros.map((i) => acao(i.id, 'repetir')));
                        const falhas = r.filter((x) => x !== true).length;
                        alert(falhas ? `${erros.length - falhas} voltaram a produzir; ${falhas} deram erro.` : '✓ Todos voltam a produzir em até 5 min, de onde pararam');
                      }}
                      style={{ ...botao, border: 0, background: '#7c5cff' }}
                    >
                      ↻ Tentar todos
                    </button>
                  )}
                </div>
              )}
              {erros.map((i) => <Item key={i.id} i={i} acao={acao} />)}
              <h3 style={titulo}>⚙ Produzindo agora</h3>
              {!produzindo.length && <p style={vazio}>Nenhum vídeo sendo produzido agora.</p>}
              {produzindo.map((i) => <Item key={i.id} i={i} acao={acao} />)}
              {avisos.length > 0 && <h3 style={titulo}>Avisos</h3>}
              {avisos.filter((i) => !produzindo.includes(i)).map((i) => <Item key={i.id} i={i} acao={acao} />)}
            </>
          )}
          {aba === 'pcs' && (
            <>
              {!dados?.pcs?.length && <p style={vazio}>Nenhum PC mandou a fila ainda.</p>}
              {(dados?.pcs || []).sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0)).map((p) => <Pc key={p.pc} p={p} />)}
            </>
          )}
          {aba === 'prontos' && (
            <>
              {!prontos.length && <p style={vazio}>Nenhum vídeo pronto nos últimos dias.</p>}
              {prontos.map((i) => <Item key={i.id} i={i} acao={acao} />)}
            </>
          )}
          {aba === 'espera' && (
            <>
              {!espera.length && <p style={vazio}>Nada esperando a vez.</p>}
              {espera.map((i) => <Item key={i.id} i={i} acao={acao} />)}
            </>
          )}

          <p style={{ fontSize: 12, color: '#6f6f88', marginTop: 24 }}>
            Dica: no navegador do celular, use “Adicionar à tela inicial” para abrir como um app.{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                gravarSenha('');
                setSenha('');
                setDados(null);
              }}
              style={{ color: '#8f8fb0' }}
            >
              Sair
            </a>
          </p>
        </>
      )}
    </div>
  );
}

const titulo = { fontSize: 15, margin: '16px 0 8px', color: '#d6d6ea' };
const vazio = { fontSize: 13.5, color: '#a9a9c0' };
