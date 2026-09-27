import { useEffect, useState } from 'react';
import Head from 'next/head';

// ============================================================
// Youvideo Radar — acha canais e vídeos em alta no YouTube pra modelar
// Abas: Busca (Radar Score) · Canais em Crescimento · Tendências ·
//       Spy de Canal · Vigiados
// ============================================================

const ABAS = [
  { id: 'busca', nome: 'Busca', icone: '⌕', desc: 'Radar Score' },
  { id: 'crescimento', nome: 'Canais em Crescimento', icone: '↗', desc: 'Pequenos que estouram' },
  { id: 'tendencias', nome: 'Tendências', icone: '∿', desc: 'O que está esquentando' },
  { id: 'spy', nome: 'Spy de Canal', icone: '◉', desc: 'A fórmula de um canal' },
  { id: 'vigiados', nome: 'Vigiados', icone: '★', desc: 'Canais que você segue' },
];

// ---------- utilidades ----------
function curto(n) {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(Math.round(n));
}
function dur(s) {
  if (!s) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
function atras(data) {
  if (!data) return '';
  const d = (Date.now() - new Date(data).getTime()) / 86400000;
  if (d < 1) return 'hoje';
  if (d < 2) return 'há 1 dia';
  if (d < 30) return `há ${Math.floor(d)} dias`;
  if (d < 60) return 'há 1 mês';
  if (d < 365) return `há ${Math.floor(d / 30)} meses`;
  const a = Math.floor(d / 365);
  return a === 1 ? 'há 1 ano' : `há ${a} anos`;
}
function idade(dias) {
  if (dias == null) return '';
  if (dias < 60) return `${dias} dias`;
  if (dias < 730) return `${Math.round(dias / 30)} meses`;
  return `${Math.round(dias / 365)} anos`;
}
function dataBR(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '';
}
async function api(url, body, metodo) {
  const r = await fetch(url, {
    method: metodo || (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({ error: 'Resposta inválida do servidor' }));
  if (!r.ok || j.error) throw new Error(j.error || 'Erro');
  return j;
}
function copiar(txt) {
  try { navigator.clipboard.writeText(txt); } catch (e) { /* ignora */ }
}
const linkCanal = (c) => (c?.handle ? `https://www.youtube.com/${c.handle.startsWith('@') ? c.handle : '@' + c.handle}` : `https://www.youtube.com/channel/${c?.id || c?.canalId}`);

// ---------- peças visuais ----------
function Chips({ opcoes, valor, onChange }) {
  return (
    <div className="rd-chips">
      {opcoes.map(([v, rotulo]) => (
        <button key={v} type="button" className={`rd-chip ${valor === v ? 'on' : ''}`} onClick={() => onChange(v)}>
          {rotulo}
        </button>
      ))}
    </div>
  );
}
function Carregando({ texto }) {
  return (
    <div className="rd-loading">
      <div className="rd-radar"><span /></div>
      <div>{texto || 'Varrendo o YouTube…'}</div>
    </div>
  );
}
function Erro({ msg }) {
  return msg ? <div className="rd-erro">{msg}</div> : null;
}
function Rodape({ info }) {
  if (!info) return null;
  return (
    <div className="rd-rodape">
      {info.doCache ? `resultado guardado de ${new Date(info.atualizadoEm).toLocaleString('pt-BR')} (não gastou cota)` : `cota usada nesta busca: ${info.cotaUsada ?? 0} de 10.000/dia`}
    </div>
  );
}
function Barras({ valores, cor }) {
  if (!valores?.length) return null;
  const max = Math.max(...valores, 1);
  return (
    <div className="rd-bars">
      {valores.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: i === valores.length - 1 ? cor || 'var(--rd-green)' : undefined }} />
      ))}
    </div>
  );
}
function Stat({ valor, rotulo, destaque }) {
  return (
    <div className="rd-stat">
      <div className={`rd-stat-v ${destaque ? 'hl' : ''}`}>{valor}</div>
      <div className="rd-stat-l">{rotulo}</div>
    </div>
  );
}
function BotaoCopiar({ texto, rotulo = 'Copiar' }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="rd-btn-mini" onClick={() => { copiar(texto); setOk(true); setTimeout(() => setOk(false), 1500); }}>
      {ok ? 'Copiado ✓' : rotulo}
    </button>
  );
}
function BotaoVigiar({ canalId, origem }) {
  const [estado, setEstado] = useState('');
  return (
    <button
      type="button"
      className="rd-btn-ghost"
      disabled={estado === 'ok' || estado === '…'}
      onClick={async () => {
        setEstado('…');
        try { await api('/api/radar/vigiados', { canalId, origem }); setEstado('ok'); } catch (e) { setEstado('erro'); alert(e.message); }
      }}
    >
      {estado === 'ok' ? '★ Vigiando' : estado === '…' ? '…' : '☆ Vigiar'}
    </button>
  );
}

// ============================================================
// ABA: BUSCA
// ============================================================
function Busca({ pedido, irSpy }) {
  const [f, setF] = useState({
    q: '', idioma: 'pt', duracao: 'any', minSeg: '', maxSeg: '', periodo: 'mes',
    viewsMin: '', inscritosMin: '', inscritosMax: '', idadeCanal: 'qualquer', ordem: 'score', paginas: 1,
  });
  const [res, setRes] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function buscar(extra) {
    const corpo = { ...f, ...(extra || {}) };
    if (!corpo.q.trim()) return setErro('Digite um nicho, ex: moda de viola, lofi, louvor');
    setErro(''); setCarregando(true);
    try { setRes(await api('/api/radar/busca', corpo)); } catch (e) { setErro(e.message); }
    setCarregando(false);
  }

  useEffect(() => {
    if (pedido?.q) { setF((x) => ({ ...x, q: pedido.q })); buscar({ q: pedido.q }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  return (
    <div className="rd-busca">
      <aside className="rd-filtros">
        <label>Nicho ou palavra-chave</label>
        <input value={f.q} onChange={(e) => set('q')(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="ex: moda de viola, lofi, louvor" />

        <label>Idioma / país</label>
        <Chips valor={f.idioma} onChange={set('idioma')} opcoes={[['pt', 'BR'], ['en', 'US'], ['es', 'ES'], ['todos', 'Todos']]} />

        <label>Duração</label>
        <Chips valor={f.duracao} onChange={set('duracao')} opcoes={[['any', 'Qualquer'], ['short', '< 4 min'], ['medium', '4–20 min'], ['long', '20+ min']]} />
        <div className="rd-row2">
          <input value={f.minSeg ? f.minSeg / 60 : ''} onChange={(e) => set('minSeg')(e.target.value ? e.target.value * 60 : '')} placeholder="min (minutos)" type="number" />
          <input value={f.maxSeg ? f.maxSeg / 60 : ''} onChange={(e) => set('maxSeg')(e.target.value ? e.target.value * 60 : '')} placeholder="máx (minutos)" type="number" />
        </div>

        <label>Publicado</label>
        <Chips valor={f.periodo} onChange={set('periodo')} opcoes={[['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['3meses', '3 meses'], ['ano', 'Ano'], ['qualquer', 'Sempre']]} />

        <label>Desempenho</label>
        <div className="rd-row2">
          <input value={f.viewsMin} onChange={(e) => set('viewsMin')(e.target.value)} placeholder="views mín." type="number" />
          <select value={f.ordem} onChange={(e) => set('ordem')(e.target.value)}>
            <option value="score">Ordenar: Score</option>
            <option value="viewsDia">Views por dia</option>
            <option value="multiplo">Views ÷ inscritos</option>
            <option value="views">Views totais</option>
            <option value="recentes">Mais recentes</option>
            <option value="inscritos">Canal menor</option>
          </select>
        </div>
        <div className="rd-row2">
          <input value={f.inscritosMin} onChange={(e) => set('inscritosMin')(e.target.value)} placeholder="inscritos mín." type="number" />
          <input value={f.inscritosMax} onChange={(e) => set('inscritosMax')(e.target.value)} placeholder="inscritos máx." type="number" />
        </div>

        <label>Canal criado há no máximo</label>
        <Chips valor={f.idadeCanal} onChange={set('idadeCanal')} opcoes={[['qualquer', 'Qualquer'], ['1mes', '1 mês'], ['3meses', '3 meses'], ['6meses', '6 meses'], ['1ano', '1 ano']]} />

        <label>Profundidade</label>
        <Chips valor={f.paginas} onChange={set('paginas')} opcoes={[[1, '50 vídeos (100 cota)'], [2, '100 vídeos (200 cota)']]} />

        <button className="rd-btn-red" onClick={() => buscar()} disabled={carregando}>⌕ Buscar vídeos</button>
        <button className="rd-btn-ghost" onClick={() => { setF((x) => ({ ...x, viewsMin: '', inscritosMin: '', inscritosMax: '', minSeg: '', maxSeg: '', idadeCanal: 'qualquer', duracao: 'any', periodo: 'mes' })); }}>Limpar filtros</button>
      </aside>

      <section className="rd-resultados">
        <Erro msg={erro} />
        {carregando && <Carregando />}
        {!carregando && !res && !erro && (
          <div className="rd-vazio">
            <div className="rd-vazio-t">O vídeo que estourou e ninguém percebeu ainda</div>
            Digite o nicho e deixe ordenado por <b>Score</b>: os primeiros são os outliers do momento — vídeos com muito mais views do que o canal tem de inscritos.
          </div>
        )}
        {!carregando && res && (
          <>
            <div className="rd-contagem">● {res.total} vídeos encontrados</div>
            <div className="rd-grid-videos">
              {res.videos.map((v) => (
                <div key={v.id} className="rd-vcard">
                  <a className="rd-thumb" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
                    <img src={v.thumb} alt="" loading="lazy" />
                    <span className="rd-tag-vpd">🔥 {curto(v.viewsPorDia)}/dia</span>
                    <span className="rd-tag-score">{v.score}</span>
                    <span className="rd-tag-dur">{dur(v.duracao)}</span>
                  </a>
                  <div className="rd-vcard-b">
                    <div className="rd-vtitle">{v.titulo}</div>
                    <div className="rd-vchan">
                      {v.canal.thumb && <img src={v.canal.thumb} alt="" />}
                      <span>{v.canal.nome}</span>
                      {v.multiplo >= 2 && <span className="rd-pill-green">{v.multiplo}x</span>}
                    </div>
                    <div className="rd-vstats">
                      <span>👁 {curto(v.views)}</span><span>👍 {curto(v.likes)}</span><span>💬 {curto(v.comentarios)}</span>
                    </div>
                    <div className="rd-vmeta">
                      <span>{curto(v.canal.inscritos)} inscritos</span>
                      <span>{atras(v.publicadoEm)}</span>
                    </div>
                    <div className="rd-vmeta amarelo">Canal criado: {dataBR(v.canal.criadoEm)} ({idade(v.canal.idadeDias)})</div>
                    <div className="rd-scorebar"><span style={{ width: `${v.score}%` }} /></div>
                    <div className="rd-vcard-a">
                      <a className="rd-btn-ghost" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">Ver vídeo</a>
                      <button className="rd-btn-purple" onClick={() => irSpy(v.canal.id)}>Analisar canal</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Rodape info={res} />
          </>
        )}
      </section>
    </div>
  );
}

// ============================================================
// ABA: CANAIS EM CRESCIMENTO
// ============================================================
function Crescimento({ irSpy, irBusca }) {
  const [f, setF] = useState({ q: '', categoria: 'musica', idioma: 'pt', duracao: 'any', minSeg: '', maxSeg: '', decolagem: 'qualquer', inscritosMax: 100000 });
  const [res, setRes] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function buscar(embaralhar) {
    setErro(''); setCarregando(true);
    try { setRes(await api('/api/radar/crescimento', { ...f, embaralhar })); } catch (e) { setErro(e.message); }
    setCarregando(false);
  }

  return (
    <div>
      <div className="rd-cab">
        <span className="rd-badge-orange">↗ CRESCIMENTO</span>
        <h1>Canais em Crescimento</h1>
      </div>
      <p className="rd-sub">Canais pequenos com mais views do que deviam pro tamanho. <b>Outlier Score</b> = média de views por vídeo ÷ inscritos.</p>

      <div className="rd-filtros-linha">
        <input className="rd-input-nicho" value={f.q} onChange={(e) => set('q')(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="Nicho (opcional) — ex: moda de viola, forró, louvor" />
        <Chips valor={f.idioma} onChange={set('idioma')} opcoes={[['todos', '🌐'], ['pt', 'BR'], ['en', 'US'], ['es', 'ES']]} />
        <Chips valor={f.categoria} onChange={set('categoria')} opcoes={[['tudo', 'Tudo'], ['musica', '♫ Música'], ['ia', '◈ IA']]} />
      </div>
      <div className="rd-filtros-linha">
        <span className="rd-lbl">Duração:</span>
        <Chips valor={f.duracao} onChange={set('duracao')} opcoes={[['any', 'Qualquer'], ['short', '< 4 min'], ['medium', '4–20 min'], ['long', '20+ min']]} />
        <input className="rd-input-min" type="number" placeholder="min" value={f.minSeg ? f.minSeg / 60 : ''} onChange={(e) => set('minSeg')(e.target.value ? e.target.value * 60 : '')} />
        <span className="rd-lbl">até</span>
        <input className="rd-input-min" type="number" placeholder="máx" value={f.maxSeg ? f.maxSeg / 60 : ''} onChange={(e) => set('maxSeg')(e.target.value ? e.target.value * 60 : '')} />
        <span className="rd-lbl">min</span>
      </div>
      <div className="rd-filtros-linha">
        <span className="rd-lbl">Decolagem:</span>
        <Chips valor={f.decolagem} onChange={set('decolagem')} opcoes={[['qualquer', 'Qualquer'], ['acelerando', '🚀 Acelerando agora'], ['3meses', 'Decolou ≤ 3 meses'], ['3a5meses', 'Decolou há 3–5 meses']]} />
        <span className="rd-lbl">Até</span>
        <select value={f.inscritosMax} onChange={(e) => set('inscritosMax')(+e.target.value)}>
          <option value={10000}>10 mil inscritos</option>
          <option value={50000}>50 mil inscritos</option>
          <option value={100000}>100 mil inscritos</option>
          <option value={500000}>500 mil inscritos</option>
        </select>
      </div>
      <div className="rd-filtros-linha">
        <button className="rd-btn-red" onClick={() => buscar(false)} disabled={carregando}>Procurar canais</button>
        {res && <button className="rd-btn-ghost" onClick={() => buscar(true)} disabled={carregando}>⤮ Embaralhar</button>}
        {res && <span className="rd-lbl">{res.canais.length} canais · termo “{res.termo}”</span>}
      </div>

      <Erro msg={erro} />
      {carregando && <Carregando texto="Achando canais pequenos que estão estourando… (leva uns 20–40s)" />}
      {!carregando && res && !res.canais.length && <div className="rd-vazio">Nenhum canal passou nos filtros. Tente aumentar o limite de inscritos ou trocar a decolagem.</div>}
      {!carregando && res && (
        <div className="rd-grid-canais">
          {res.canais.map((x) => (
            <div key={x.canal.id} className="rd-ccard">
              <div className="rd-ccard-h">
                <img className="rd-avatar" src={x.canal.thumb} alt="" />
                <div className="rd-ccard-n">
                  <a href={linkCanal(x.canal)} target="_blank" rel="noreferrer"><b>{x.canal.nome}</b></a>
                  <div className="rd-muted">{curto(x.canal.inscritos)} inscritos · canal de {idade(x.canal.idadeDias)}</div>
                  <div className="rd-badges">
                    {x.novoNoRadar && <span className="rd-pill-blue">NOVO no radar</span>}
                    {x.tendencia != null && x.tendencia > 15 && <span className="rd-pill-green">🚀 Acelerando +{x.tendencia}%</span>}
                    {x.tendencia != null && x.tendencia < -15 && <span className="rd-pill-purple">❄ Esfriando {x.tendencia}%</span>}
                  </div>
                </div>
                <Barras valores={x.historico} />
              </div>
              <div className="rd-stats4">
                <Stat valor={curto(x.mediaViews)} rotulo="Média views/vídeo" />
                <Stat valor={x.canal.totalVideos} rotulo="Vídeos" />
                <Stat valor={x.diasDesdeUltimo != null ? `${Math.floor(x.diasDesdeUltimo)}d` : '—'} rotulo="Último post" />
                <Stat valor={`${x.outlierScore}x`} rotulo="Outlier Score" destaque />
              </div>
              <div className="rd-sec">Vídeos mais populares</div>
              <div className="rd-grid-mini">
                {x.topVideos.map((v) => (
                  <a key={v.id} className="rd-mini" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
                    <div className="rd-mini-t"><img src={v.thumb} alt="" loading="lazy" /><span>{dur(v.duracao)}</span></div>
                    <div className="rd-mini-title">{v.titulo}</div>
                    <div className="rd-muted">{curto(v.views)} views · {atras(v.publicadoEm)}</div>
                  </a>
                ))}
              </div>
              <div className="rd-ccard-a">
                <button className="rd-btn-purple" onClick={() => irSpy(x.canal.id)}>✦ Analisar canal</button>
                <button className="rd-btn-ghost" onClick={() => irBusca(x.topVideos[0]?.titulo.split(/[|\-–(]/)[0].trim())}>Similares</button>
                <BotaoVigiar canalId={x.canal.id} origem="crescimento" />
              </div>
            </div>
          ))}
        </div>
      )}
      <Rodape info={res} />
    </div>
  );
}

// ============================================================
// ABA: TENDÊNCIAS
// ============================================================
function Tendencias({ irSpy, irBusca }) {
  const [q, setQ] = useState('música');
  const [idioma, setIdioma] = useState('pt');
  const [res, setRes] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [sub, setSub] = useState(null);
  const [subTexto, setSubTexto] = useState('lofi, piano instrumental, sertanejo, forró, gospel, louvor, funk, pagode, jazz, música para dormir, rap, reggae');
  const [subCarregando, setSubCarregando] = useState(false);

  async function carregar() {
    setErro(''); setCarregando(true);
    try { setRes(await api('/api/radar/tendencias', { q, idioma })); } catch (e) { setErro(e.message); }
    setCarregando(false);
  }
  async function medirSub() {
    setSubCarregando(true);
    try { setSub(await api('/api/radar/subnichos', { subnichos: subTexto.split(','), idioma })); } catch (e) { setErro(e.message); }
    setSubCarregando(false);
  }
  const maxAlta = Math.max(...(sub?.subnichos || []).map((s) => Math.abs(s.alta || 0)), 1);
  const qtdSub = subTexto.split(',').filter((s) => s.trim()).length;

  return (
    <div>
      <div className="rd-cab">
        <span className="rd-badge-blue">∿ TENDÊNCIAS</span>
        <h1>Radar de Tendências</h1>
      </div>
      <p className="rd-sub">O que está aquecendo no nicho: keywords em ascensão (últimos 10 dias contra os 20 anteriores), sub-nichos esquentando, os canais que mais cresceram e os que acabaram de entrar no radar. Clique numa keyword e a busca já abre naquele termo.</p>
      <div className="rd-filtros-linha">
        <input className="rd-input-nicho" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && carregar()} placeholder="Nicho — ex: música, louvor, moda de viola" />
        <Chips valor={idioma} onChange={setIdioma} opcoes={[['pt', 'BR'], ['en', 'US'], ['es', 'ES'], ['todos', '🌐']]} />
        <button className="rd-btn-red" onClick={carregar} disabled={carregando}>Ver tendências</button>
      </div>
      <Erro msg={erro} />
      {carregando && <Carregando texto="Comparando os últimos 10 dias com os 20 anteriores…" />}

      <div className="rd-grid-2">
        <div className="rd-painel">
          <div className="rd-painel-t">🔥 Keywords em ascensão</div>
          <div className="rd-muted">Termos que mais cresceram nos vídeos mais vistos dos últimos 10 dias.</div>
          {!res && !carregando && <div className="rd-vazio-p">Clique em “Ver tendências”.</div>}
          {res && (
            <div className="rd-kw">
              {res.keywords.length === 0 && <div className="rd-muted">Nada subindo forte agora nesse nicho.</div>}
              {res.keywords.map((k) => (
                <button key={k.palavra} className="rd-kw-chip" onClick={() => irBusca(`${k.palavra} ${q === 'música' ? '' : q}`.trim())}>
                  {k.palavra} <b>{k.novo ? 'novo' : `+${k.alta}%`}</b>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rd-painel">
          <div className="rd-painel-t">▦ Sub-nichos esquentando</div>
          <div className="rd-muted">Média de views/dia dos vídeos novos x os de 10–30 dias atrás. Custa ~{qtdSub * 101} de cota (fica 24h guardado).</div>
          <textarea className="rd-textarea" value={subTexto} onChange={(e) => setSubTexto(e.target.value)} rows={2} />
          <button className="rd-btn-ghost" onClick={medirSub} disabled={subCarregando}>{subCarregando ? 'Medindo…' : 'Medir sub-nichos'}</button>
          {sub && (
            <div className="rd-sub-lista">
              {sub.subnichos.map((s) => (
                <div key={s.nome} className="rd-sub-item" onClick={() => irBusca(s.nome)}>
                  <span className="rd-sub-nome">{s.nome}</span>
                  <span className="rd-sub-barra"><span className={s.alta < 0 ? 'neg' : ''} style={{ width: `${Math.max(3, (Math.abs(s.alta || 0) / maxAlta) * 100)}%` }} /></span>
                  <span className={`rd-sub-v ${s.alta < 0 ? 'neg' : ''}`}>{s.alta == null ? '—' : `${s.alta > 0 ? '+' : ''}${s.alta}%`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rd-painel">
          <div className="rd-painel-t">🚀 Top Growers (10 dias)</div>
          <div className="rd-muted">Views dos vídeos dos últimos 10 dias ÷ inscritos do canal.</div>
          {res && <ListaCanais itens={res.topGrowers} valor={(x) => `${curto(x.crescimento)}x`} irSpy={irSpy} />}
        </div>

        <div className="rd-painel">
          <div className="rd-painel-t">🆕 Novos no radar</div>
          <div className="rd-muted">Canais com menos de 45 dias que já aparecem entre os mais vistos.</div>
          {res && <ListaCanais itens={res.novosNoRadar} valor={(x) => curto(x.viewsRecentes)} irSpy={irSpy} vazio="Nenhum canal novo apareceu nesse nicho agora." />}
        </div>
      </div>
      <Rodape info={res} />
    </div>
  );
}
function ListaCanais({ itens, valor, irSpy, vazio }) {
  if (!itens?.length) return <div className="rd-muted" style={{ marginTop: 10 }}>{vazio || 'Nada por aqui.'}</div>;
  return (
    <div className="rd-lista">
      {itens.map((x, i) => (
        <div key={x.canal.id} className="rd-lista-i">
          <span className="rd-num">{i + 1}</span>
          <img src={x.canal.thumb} alt="" />
          <div className="rd-lista-n">
            <b>{x.canal.nome}</b>
            <div className="rd-muted">{curto(x.canal.inscritos)} inscritos · {idade(x.canal.idadeDias)} · {x.melhorVideo?.titulo}</div>
          </div>
          <span className="rd-lista-v">{valor(x)}</span>
          <button className="rd-btn-dot" title="Analisar canal" onClick={() => irSpy(x.canal.id)}>✦</button>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// ABA: SPY DE CANAL
// ============================================================
function Spy({ pedido, irBusca }) {
  const [entrada, setEntrada] = useState('');
  const [res, setRes] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [nicho, setNicho] = useState('');
  const [ia, setIa] = useState(null);
  const [iaCarregando, setIaCarregando] = useState(false);
  const [escolhidos, setEscolhidos] = useState({});
  const [enviado, setEnviado] = useState('');

  async function analisar(valor) {
    const alvo = (valor ?? entrada).trim();
    if (!alvo) return setErro('Cole o @ ou o link do canal');
    setErro(''); setCarregando(true); setIa(null); setEnviado('');
    try { setRes(await api('/api/radar/spy', { canal: alvo })); } catch (e) { setErro(e.message); setRes(null); }
    setCarregando(false);
  }
  async function gerarIa() {
    setIaCarregando(true); setErro('');
    try {
      const j = await api('/api/radar/spy-ia', {
        canalNome: res.canal.nome, outliers: res.outliers, keywords: res.keywords, desempenho: res.desempenho, meuNicho: nicho,
      });
      setIa(j); setEscolhidos({});
    } catch (e) { setErro(e.message); }
    setIaCarregando(false);
  }
  async function mandarTemas() {
    const temas = (ia?.titulos || []).filter((_, i) => escolhidos[i]);
    if (!temas.length) return;
    try { await api('/api/temas-adicionar', { temas }); setEnviado(`${temas.length} título(s) enviados pro banco de Temas do Youvideo ✓`); } catch (e) { setErro(e.message); }
  }

  useEffect(() => {
    if (pedido?.canalId) {
      const url = `https://www.youtube.com/channel/${pedido.canalId}`;
      setEntrada(url); analisar(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  const d = res?.desempenho;
  const maxDia = Math.max(...(res?.dias || []).map((x) => x.media), 1);

  return (
    <div>
      <div className="rd-cab">
        <span className="rd-badge-red">◉ SPY DE CANAL</span>
        <h1>Spy de Canal</h1>
      </div>
      <p className="rd-sub">Anos de estratégia de um canal, em segundos. Cole o @, o link do canal ou o link de um vídeo dele.</p>
      <div className="rd-filtros-linha">
        <input className="rd-input-nicho grande" value={entrada} onChange={(e) => setEntrada(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && analisar()} placeholder="https://www.youtube.com/@canal   ou   @canal" />
        <button className="rd-btn-purple" onClick={() => analisar()} disabled={carregando}>Analisar canal</button>
      </div>
      <Erro msg={erro} />
      {carregando && <Carregando texto="Lendo até 150 vídeos do canal…" />}

      {!carregando && res && res.vazio && <div className="rd-vazio">Esse canal ainda não tem vídeos públicos.</div>}
      {!carregando && res && !res.vazio && (
        <div className="rd-spy">
          <div className="rd-spy-col">
            <div className="rd-painel">
              <div className="rd-spy-h">
                <img className="rd-avatar lg" src={res.canal.thumb} alt="" />
                <div>
                  <div className="rd-spy-nome">{res.canal.nome}</div>
                  <a className="rd-link" href={linkCanal(res.canal)} target="_blank" rel="noreferrer">Ver no YouTube ↗</a>
                  <div className="rd-muted">Canal criado em {dataBR(res.canal.criadoEm)} ({idade(res.canal.idadeDias)}){res.canal.pais ? ` · ${res.canal.pais}` : ''}</div>
                </div>
              </div>
              <div className="rd-spy-acoes">
                <BotaoVigiar canalId={res.canal.id} origem="spy" />
                <button className="rd-btn-ghost" onClick={() => irBusca(res.keywords.slice(0, 2).map((k) => k.palavra).join(' '))}>⌕ Buscar canais similares</button>
              </div>
              <div className="rd-stats3">
                <Stat valor={curto(res.canal.inscritos)} rotulo="Inscritos" />
                <Stat valor={curto(res.canal.viewsTotal)} rotulo="Total views" />
                <Stat valor={res.canal.totalVideos} rotulo="Vídeos" />
              </div>
            </div>

            <div className="rd-painel">
              <div className="rd-painel-t">Desempenho do canal <span className="rd-muted">({res.analisados} vídeos analisados)</span></div>
              <div className="rd-stats2">
                <Stat valor={curto(d.mediaViews)} rotulo="Média de views" />
                <Stat valor={d.intervaloDias != null ? `a cada ${d.intervaloDias}d` : '—'} rotulo="Freq. de posts" />
                <Stat valor={d.melhorDia || '—'} rotulo={`Melhor dia${d.melhorHora ? ` · ${d.melhorHora}` : ''}`} />
                <Stat valor={dur(d.duracaoMediaTop5)} rotulo="Duração média top 5" />
                <Stat valor={curto(d.medianaViews)} rotulo="Mediana de views" />
                <Stat valor={`${d.pctShorts}%`} rotulo="São Shorts" />
                <Stat valor={`${d.engajamento}%`} rotulo="Engajamento" />
                <Stat valor={`${Math.floor(d.diasDesdeUltimo)}d`} rotulo="Último post" />
              </div>
              <div className="rd-sec">Views médias por dia da semana</div>
              <div className="rd-dias">
                {res.dias.map((x) => (
                  <div key={x.dia} className={`rd-dia ${x.dia === d.melhorDia ? 'on' : ''}`} title={`${x.videos} vídeos`}>
                    <div className="rd-dia-b"><span style={{ height: `${Math.max(4, (x.media / maxDia) * 100)}%` }} /></div>
                    <div>{x.dia.slice(0, 3)}</div>
                  </div>
                ))}
              </div>
              <div className="rd-sec">Keywords dominantes</div>
              <div className="rd-kw">
                {res.keywords.map((k) => (
                  <button key={k.palavra} className="rd-kw-chip" onClick={() => irBusca(k.palavra)}>{k.palavra} <b>{k.vezes}</b></button>
                ))}
              </div>
            </div>

            <div className="rd-painel">
              <div className="rd-painel-t">Top 10 vídeos outliers</div>
              <div className="rd-muted">Os mais vistos do canal, com quantas vezes bateram a mediana.</div>
              <div className="rd-lista">
                {res.outliers.map((v, i) => (
                  <a key={v.id} className="rd-lista-i" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
                    <span className="rd-num">{i + 1}</span>
                    <img className="rd-thumb-sm" src={v.thumb} alt="" />
                    <div className="rd-lista-n">
                      <b>{v.titulo}</b>
                      <div className="rd-muted">{curto(v.views)} views · {dur(v.duracao)} · {atras(v.publicadoEm)}</div>
                    </div>
                    <span className={`rd-pill-${v.vezesMedia >= 5 ? 'green' : v.vezesMedia >= 2 ? 'orange' : 'gray'}`}>{v.vezesMedia}x</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="rd-spy-col">
            <div className="rd-painel rd-ia">
              <div className="rd-ia-ico">✦</div>
              <div className="rd-painel-t" style={{ textAlign: 'center' }}>Modelar com IA</div>
              <div className="rd-muted" style={{ textAlign: 'center' }}>Lê os outliers e devolve a fórmula, títulos novos no mesmo padrão, capa, descrição e tags.</div>
              <input value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="Seu canal/nicho (opcional) — ex: Nova Frequência, música gospel" />
              <button className="rd-btn-purple largo" onClick={gerarIa} disabled={iaCarregando}>{iaCarregando ? 'Pensando…' : ia ? '↻ Gerar de novo' : '✦ Analisar com IA'}</button>
            </div>

            {ia && (
              <>
                <div className="rd-painel">
                  <div className="rd-painel-t">A fórmula</div>
                  <p className="rd-texto">{ia.formula}</p>
                  {ia.padroes?.length > 0 && (
                    <ul className="rd-ul">{ia.padroes.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  )}
                </div>
                <div className="rd-painel">
                  <div className="rd-painel-t">Títulos modelados</div>
                  <div className="rd-muted">Marque os que gostou e mande pro banco de Temas do Youvideo.</div>
                  <div className="rd-titulos">
                    {ia.titulos?.map((t, i) => (
                      <label key={i} className="rd-titulo">
                        <input type="checkbox" checked={!!escolhidos[i]} onChange={(e) => setEscolhidos((x) => ({ ...x, [i]: e.target.checked }))} />
                        <span>{t}</span>
                        <BotaoCopiar texto={t} />
                      </label>
                    ))}
                  </div>
                  <div className="rd-filtros-linha">
                    <button className="rd-btn-blue" onClick={mandarTemas} disabled={!Object.values(escolhidos).some(Boolean)}>Mandar pro banco de Temas</button>
                    <BotaoCopiar texto={(ia.titulos || []).join('\n')} rotulo="Copiar todos" />
                  </div>
                  {enviado && <div className="rd-ok">{enviado}</div>}
                </div>
                <div className="rd-painel">
                  <div className="rd-painel-t">🎨 Capa (thumbnail)</div>
                  <p className="rd-texto">{ia.thumbnail?.ideia}</p>
                  {ia.thumbnail?.textoNaCapa && <div className="rd-capa-texto">{ia.thumbnail.textoNaCapa}</div>}
                  <div className="rd-prompt">{ia.thumbnail?.prompt}</div>
                  <BotaoCopiar texto={ia.thumbnail?.prompt || ''} rotulo="Copiar prompt da capa" />
                </div>
                <div className="rd-painel">
                  <div className="rd-painel-t">✎ Descrição + Tags</div>
                  <div className="rd-prompt">{ia.descricao}</div>
                  <BotaoCopiar texto={ia.descricao || ''} rotulo="Copiar descrição" />
                  <div className="rd-kw" style={{ marginTop: 12 }}>
                    {ia.tags?.map((t) => <span key={t} className="rd-kw-chip">{t}</span>)}
                  </div>
                  <BotaoCopiar texto={(ia.tags || []).join(', ')} rotulo="Copiar tags" />
                </div>
              </>
            )}

            <div className="rd-painel">
              <div className="rd-painel-t">Últimos vídeos</div>
              <div className="rd-grid-mini dois">
                {res.recentes.map((v) => (
                  <a key={v.id} className="rd-mini" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
                    <div className="rd-mini-t"><img src={v.thumb} alt="" loading="lazy" /><span>{dur(v.duracao)}</span></div>
                    <div className="rd-mini-title">{v.titulo}</div>
                    <div className="rd-muted">{curto(v.views)} views · {atras(v.publicadoEm)}</div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <Rodape info={res} />
    </div>
  );
}

// ============================================================
// ABA: VIGIADOS
// ============================================================
function Vigiados({ ativa, irSpy }) {
  const [res, setRes] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true); setErro('');
    try { setRes(await api('/api/radar/vigiados')); } catch (e) { setErro(e.message); }
    setCarregando(false);
  }
  async function remover(canalId) {
    if (!confirm('Parar de vigiar esse canal?')) return;
    await api('/api/radar/vigiados', { canalId }, 'DELETE').catch((e) => alert(e.message));
    carregar();
  }
  useEffect(() => { if (ativa) carregar(); }, [ativa]);

  return (
    <div>
      <div className="rd-cab">
        <span className="rd-badge-orange">★ VIGIADOS</span>
        <h1>Canais vigiados</h1>
        <button className="rd-btn-ghost" onClick={carregar} disabled={carregando}>↻ Atualizar</button>
      </div>
      <p className="rd-sub">Canais de referência que você está acompanhando. A cada atualização (no máximo 1 a cada 12h) o radar tira uma foto dos números pra mostrar quanto cresceram.</p>
      <Erro msg={erro} />
      {carregando && !res && <Carregando texto="Atualizando números…" />}
      {res && !res.canais.length && <div className="rd-vazio">Nenhum canal vigiado ainda. Use o botão “☆ Vigiar” nos canais que achar no radar.</div>}
      {res && res.canais.length > 0 && (
        <div className="rd-painel">
          <div className="rd-lista">
            {res.canais.map((c) => (
              <div key={c.canalId} className="rd-lista-i">
                <img src={c.thumb} alt="" />
                <div className="rd-lista-n">
                  <a href={linkCanal(c)} target="_blank" rel="noreferrer"><b>{c.nome}</b></a>
                  <div className="rd-muted">
                    {curto(c.inscritos)} inscritos · {curto(c.views)} views · {c.videos} vídeos · canal de {idade(c.idadeDias)} · vigiando há {Math.floor(c.diasVigiando)}d
                  </div>
                </div>
                <div className="rd-vig-num">
                  <b className={c.ganhoInscritos >= 0 ? 'verde' : 'vermelho'}>{c.ganhoInscritos >= 0 ? '+' : ''}{curto(c.ganhoInscritos)}</b>
                  <span className="rd-muted">{c.inscritosPorDia != null ? `${curto(c.inscritosPorDia)}/dia` : 'inscritos'}</span>
                </div>
                <div className="rd-vig-bars"><Barras valores={c.historico} /></div>
                <button className="rd-btn-dot" title="Analisar" onClick={() => irSpy(c.canalId)}>✦</button>
                <button className="rd-btn-dot" title="Parar de vigiar" onClick={() => remover(c.canalId)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PÁGINA
// ============================================================
export default function Radar() {
  const [aba, setAba] = useState('busca');
  const [pedidoBusca, setPedidoBusca] = useState(null);
  const [pedidoSpy, setPedidoSpy] = useState(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('aba') && ABAS.some((a) => a.id === p.get('aba'))) setAba(p.get('aba'));
    if (p.get('canal')) { setAba('spy'); setPedidoSpy({ canalId: p.get('canal'), t: Date.now() }); }
  }, []);

  function trocar(id) {
    setAba(id);
    window.history.replaceState(null, '', `/radar?aba=${id}`);
    window.scrollTo({ top: 0 });
  }
  const irSpy = (canalId) => { setPedidoSpy({ canalId, t: Date.now() }); trocar('spy'); };
  const irBusca = (q) => { if (!q) return; setPedidoBusca({ q, t: Date.now() }); trocar('busca'); };

  return (
    <div className="rd">
      <Head>
        <title>Youvideo Radar</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <header className="rd-top">
        <a href="/radar" className="rd-logo"><span className="rd-logo-ico"><i /></span>Youvideo <b>Radar</b></a>
        <div className="rd-top-d">
          <button className={`rd-top-b ${aba === 'busca' ? 'on' : ''}`} onClick={() => trocar('busca')}>Busca</button>
          <button className={`rd-top-b ${aba === 'spy' ? 'on' : ''}`} onClick={() => trocar('spy')}>Spy de Canal</button>
          <a className="rd-top-link" href="/">← Painel Youvideo</a>
        </div>
      </header>

      <div className="rd-corpo">
        <nav className="rd-menu">
          <div className="rd-menu-t">MENU</div>
          {ABAS.map((a) => (
            <button key={a.id} className={`rd-menu-i ${aba === a.id ? 'on' : ''}`} onClick={() => trocar(a.id)}>
              <span className="rd-menu-ico">{a.icone}</span>
              <span>{a.nome}</span>
            </button>
          ))}
          <div className="rd-menu-rod">A API do YouTube dá 10.000 unidades de cota por dia. Uma busca gasta ~100–250; resultados ficam guardados por algumas horas.</div>
        </nav>

        <main className="rd-main">
          <div style={{ display: aba === 'busca' ? 'block' : 'none' }}><Busca pedido={pedidoBusca} irSpy={irSpy} /></div>
          <div style={{ display: aba === 'crescimento' ? 'block' : 'none' }}><Crescimento irSpy={irSpy} irBusca={irBusca} /></div>
          <div style={{ display: aba === 'tendencias' ? 'block' : 'none' }}><Tendencias irSpy={irSpy} irBusca={irBusca} /></div>
          <div style={{ display: aba === 'spy' ? 'block' : 'none' }}><Spy pedido={pedidoSpy} irBusca={irBusca} /></div>
          <div style={{ display: aba === 'vigiados' ? 'block' : 'none' }}><Vigiados ativa={aba === 'vigiados'} irSpy={irSpy} /></div>
        </main>
      </div>

      <style jsx global>{`
        body { background: #0c0c0e; }
        .rd {
          --rd-bg: #0c0c0e; --rd-card: #151518; --rd-card2: #1c1c21; --rd-borda: #26262d;
          --rd-txt: #f1f1f3; --rd-mut: #8b8b96; --rd-red: #ff2b2b; --rd-red-soft: rgba(255,43,43,.14);
          --rd-green: #2fd67b; --rd-purple: #9b5cff; --rd-pink: #e2459b; --rd-blue: #3b82f6; --rd-orange: #ff9a2e; --rd-yellow: #f5c542;
          min-height: 100vh; background: var(--rd-bg); color: var(--rd-txt);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px;
        }
        .rd a { color: inherit; text-decoration: none; }
        .rd input, .rd select, .rd textarea {
          background: var(--rd-card2); border: 1px solid var(--rd-borda); color: var(--rd-txt);
          border-radius: 8px; padding: 9px 11px; font: inherit; width: 100%; margin: 0;
        }
        .rd input:focus, .rd select:focus, .rd textarea:focus { outline: none; border-color: var(--rd-purple); }
        .rd button { font: inherit; cursor: pointer; margin: 0; width: auto; }
        .rd button:disabled { opacity: .5; cursor: default; }

        .rd-top { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 12px 22px; background: rgba(12,12,14,.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--rd-borda); }
        .rd-logo { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; letter-spacing: -.01em; }
        .rd-logo b { color: var(--rd-red); }
        .rd-logo-ico { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--rd-red); position: relative; display: inline-block; }
        .rd-logo-ico::before { content: ''; position: absolute; inset: 5px; border-radius: 50%; border: 2px solid var(--rd-red); opacity: .6; }
        .rd-logo-ico i { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px; border-radius: 50%; background: var(--rd-red); }
        .rd-top-d { display: flex; align-items: center; gap: 6px; }
        .rd-top-b { background: transparent; border: 0; color: var(--rd-mut); padding: 8px 14px; border-radius: 8px; font-weight: 600; }
        .rd-top-b.on { background: var(--rd-red); color: #fff; }
        .rd-top-link { color: var(--rd-mut) !important; padding: 8px 10px; font-size: 13px; }

        .rd-corpo { display: flex; }
        .rd-menu { width: 230px; flex-shrink: 0; padding: 18px 12px; border-right: 1px solid var(--rd-borda); position: sticky; top: 57px; height: calc(100vh - 57px); display: flex; flex-direction: column; gap: 2px; }
        .rd-menu-t { color: var(--rd-mut); font-size: 11px; letter-spacing: .12em; padding: 0 10px 8px; }
        .rd-menu-i { display: flex; align-items: center; gap: 10px; background: transparent; border: 0; border-left: 2px solid transparent; color: #c9c9d1; padding: 10px 12px; border-radius: 8px; text-align: left; font-size: 14px; }
        .rd-menu-i:hover { background: var(--rd-card); }
        .rd-menu-i.on { background: var(--rd-red-soft); color: #ff6b6b; border-left-color: var(--rd-red); }
        .rd-menu-ico { width: 18px; text-align: center; font-size: 15px; }
        .rd-menu-rod { margin-top: auto; color: var(--rd-mut); font-size: 11px; line-height: 1.5; padding: 10px; border-top: 1px solid var(--rd-borda); }
        .rd-main { flex: 1; min-width: 0; padding: 22px 26px 80px; }

        .rd-cab { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .rd-cab h1 { font-family: inherit; font-size: 22px; font-weight: 700; margin: 0; letter-spacing: -.01em; }
        .rd-sub { color: var(--rd-mut); margin: 8px 0 16px; line-height: 1.5; max-width: 820px; }
        .rd-badge-orange, .rd-badge-blue, .rd-badge-red { font-size: 11px; font-weight: 700; letter-spacing: .06em; padding: 5px 10px; border-radius: 6px; }
        .rd-badge-orange { background: linear-gradient(90deg,#ff7a18,#ffb347); color: #1a0f00; }
        .rd-badge-blue { background: rgba(59,130,246,.18); color: #7fb0ff; border: 1px solid rgba(59,130,246,.4); }
        .rd-badge-red { background: var(--rd-red-soft); color: #ff6b6b; border: 1px solid rgba(255,43,43,.45); }

        .rd-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .rd-chip { background: var(--rd-card2); border: 1px solid var(--rd-borda); color: #c9c9d1; padding: 6px 11px; border-radius: 8px; font-size: 13px; }
        .rd-chip.on { background: var(--rd-red); border-color: var(--rd-red); color: #fff; font-weight: 600; }
        .rd-lbl { color: var(--rd-mut); font-size: 13px; white-space: nowrap; }
        .rd-filtros-linha { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
        .rd-filtros-linha select { width: auto; }
        .rd-input-nicho { max-width: 380px; }
        .rd-input-nicho.grande { max-width: 620px; flex: 1; }
        .rd-input-min { width: 74px !important; }

        .rd-btn-red, .rd-btn-purple, .rd-btn-blue { border: 0; color: #fff; font-weight: 600; padding: 10px 16px; border-radius: 9px; }
        .rd-btn-red { background: var(--rd-red); }
        .rd-btn-purple { background: linear-gradient(90deg, var(--rd-purple), var(--rd-pink)); }
        .rd-btn-blue { background: var(--rd-blue); }
        .rd-btn-purple.largo { width: 100%; }
        .rd-btn-ghost { background: var(--rd-card2); border: 1px solid var(--rd-borda); color: #d6d6dd; padding: 9px 13px; border-radius: 9px; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; }
        .rd-btn-ghost:hover { border-color: #3a3a44; }
        .rd-btn-mini { background: transparent; border: 1px solid var(--rd-borda); color: var(--rd-mut); padding: 4px 9px; border-radius: 7px; font-size: 12px; white-space: nowrap; }
        .rd-btn-dot { background: var(--rd-card2); border: 1px solid var(--rd-borda); color: #c9c9d1; width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; }
        .rd-btn-dot:hover { background: var(--rd-purple); color: #fff; }

        .rd-erro { background: var(--rd-red-soft); border: 1px solid rgba(255,43,43,.4); color: #ffb0b0; padding: 12px 14px; border-radius: 10px; margin: 10px 0; }
        .rd-ok { color: var(--rd-green); margin-top: 8px; font-size: 13px; }
        .rd-rodape { color: var(--rd-mut); font-size: 12px; margin-top: 18px; }
        .rd-vazio { background: var(--rd-card); border: 1px dashed var(--rd-borda); border-radius: 14px; padding: 36px; color: var(--rd-mut); line-height: 1.6; text-align: center; }
        .rd-vazio-t { color: var(--rd-txt); font-size: 20px; font-weight: 700; margin-bottom: 8px; }
        .rd-vazio-p { color: var(--rd-mut); padding: 20px 0; }
        .rd-muted { color: var(--rd-mut); font-size: 12px; line-height: 1.45; }

        .rd-loading { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 50px 0; color: var(--rd-mut); }
        .rd-radar { width: 64px; height: 64px; border-radius: 50%; border: 2px solid rgba(255,43,43,.5); position: relative; overflow: hidden;
          background: radial-gradient(circle, rgba(255,43,43,.15) 0 30%, transparent 31% 58%, rgba(255,43,43,.1) 59% 60%, transparent 61%); }
        .rd-radar span { position: absolute; inset: 0; background: conic-gradient(from 0deg, rgba(255,43,43,.6), transparent 25%); animation: rdgira 1.4s linear infinite; }
        @keyframes rdgira { to { transform: rotate(360deg); } }

        /* Busca */
        .rd-busca { display: flex; gap: 20px; align-items: flex-start; }
        .rd-filtros { width: 270px; flex-shrink: 0; background: var(--rd-card); border: 1px solid var(--rd-borda); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 8px; position: sticky; top: 76px; }
        .rd-filtros label { color: var(--rd-mut); font-size: 12px; font-weight: 600; margin-top: 6px; text-transform: uppercase; letter-spacing: .05em; }
        .rd-filtros .rd-btn-red { margin-top: 10px; }
        .rd-row2 { display: flex; gap: 6px; }
        .rd-resultados { flex: 1; min-width: 0; }
        .rd-contagem { color: var(--rd-green); font-size: 13px; margin-bottom: 12px; }
        .rd-grid-videos { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
        .rd-vcard { background: var(--rd-card); border: 1px solid var(--rd-borda); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
        .rd-thumb { position: relative; display: block; aspect-ratio: 16/9; background: #000; }
        .rd-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .rd-tag-vpd { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,.75); color: var(--rd-yellow); font-size: 11px; font-weight: 700; padding: 3px 7px; border-radius: 6px; }
        .rd-tag-score { position: absolute; top: 8px; right: 8px; background: var(--rd-purple); color: #fff; font-size: 12px; font-weight: 700; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; }
        .rd-tag-dur { position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,.8); font-size: 11px; padding: 2px 6px; border-radius: 5px; }
        .rd-vcard-b { padding: 11px 12px 12px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .rd-vtitle { font-weight: 600; font-size: 13px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .rd-vchan { display: flex; align-items: center; gap: 6px; color: #c9c9d1; font-size: 12px; }
        .rd-vchan img { width: 18px; height: 18px; border-radius: 50%; }
        .rd-vchan span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .rd-vstats, .rd-vmeta { display: flex; gap: 10px; color: var(--rd-mut); font-size: 12px; flex-wrap: wrap; }
        .rd-vmeta { justify-content: space-between; }
        .rd-vmeta.amarelo { color: var(--rd-yellow); justify-content: flex-start; }
        .rd-scorebar { height: 5px; background: var(--rd-card2); border-radius: 3px; overflow: hidden; }
        .rd-scorebar span { display: block; height: 100%; background: linear-gradient(90deg, var(--rd-orange), var(--rd-yellow)); }
        .rd-vcard-a { display: flex; gap: 6px; margin-top: auto; padding-top: 4px; }
        .rd-vcard-a > * { flex: 1; padding: 8px 6px; font-size: 12px; }

        .rd-pill-green, .rd-pill-blue, .rd-pill-purple, .rd-pill-orange, .rd-pill-gray { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; white-space: nowrap; }
        .rd-pill-green { background: rgba(47,214,123,.15); color: var(--rd-green); }
        .rd-pill-blue { background: rgba(59,130,246,.18); color: #7fb0ff; }
        .rd-pill-purple { background: rgba(155,92,255,.18); color: #c4a1ff; }
        .rd-pill-orange { background: rgba(255,154,46,.16); color: var(--rd-orange); }
        .rd-pill-gray { background: var(--rd-card2); color: var(--rd-mut); }

        /* Crescimento */
        .rd-grid-canais { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; margin-top: 8px; }
        .rd-ccard { background: var(--rd-card); border: 1px solid var(--rd-borda); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .rd-ccard-h { display: flex; gap: 12px; align-items: flex-start; }
        .rd-avatar { width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0; background: var(--rd-card2); }
        .rd-avatar.lg { width: 64px; height: 64px; }
        .rd-ccard-n { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .rd-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 3px; }
        .rd-bars { display: flex; align-items: flex-end; gap: 3px; height: 38px; width: 80px; flex-shrink: 0; }
        .rd-bars span { flex: 1; background: #3a3a44; border-radius: 2px; min-height: 3px; }
        .rd-stats4, .rd-stats3, .rd-stats2 { display: grid; gap: 8px; }
        .rd-stats4 { grid-template-columns: repeat(4, 1fr); }
        .rd-stats3 { grid-template-columns: repeat(3, 1fr); }
        .rd-stats2 { grid-template-columns: repeat(2, 1fr); }
        .rd-stat { background: var(--rd-card2); border: 1px solid var(--rd-borda); border-radius: 10px; padding: 10px 8px; text-align: center; }
        .rd-stat-v { font-weight: 700; font-size: 17px; }
        .rd-stat-v.hl { color: var(--rd-green); }
        .rd-stat-l { color: var(--rd-mut); font-size: 11px; margin-top: 2px; }
        .rd-sec { color: #ff6b6b; font-weight: 600; font-size: 13px; margin-top: 4px; }
        .rd-grid-mini { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .rd-grid-mini.dois { grid-template-columns: repeat(2, 1fr); margin-top: 10px; }
        .rd-mini { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .rd-mini-t { position: relative; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; background: #000; }
        .rd-mini-t img { width: 100%; height: 100%; object-fit: cover; }
        .rd-mini-t span { position: absolute; right: 4px; bottom: 4px; background: rgba(0,0,0,.8); font-size: 10px; padding: 1px 5px; border-radius: 4px; }
        .rd-mini-title { font-size: 11.5px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .rd-ccard-a { display: flex; gap: 8px; }
        .rd-ccard-a .rd-btn-purple { flex: 1; }

        /* Tendências */
        .rd-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 8px; }
        .rd-painel { background: var(--rd-card); border: 1px solid var(--rd-borda); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
        .rd-painel-t { font-weight: 700; font-size: 15px; }
        .rd-kw { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .rd-kw-chip { background: var(--rd-card2); border: 1px solid var(--rd-borda); color: #d6d6dd; padding: 5px 10px; border-radius: 999px; font-size: 12.5px; }
        .rd-kw-chip b { color: var(--rd-green); margin-left: 4px; font-weight: 700; }
        button.rd-kw-chip:hover { border-color: var(--rd-green); }
        .rd-textarea { font-size: 12.5px !important; resize: vertical; }
        .rd-sub-lista { display: flex; flex-direction: column; gap: 7px; margin-top: 6px; }
        .rd-sub-item { display: grid; grid-template-columns: 130px 1fr 60px; align-items: center; gap: 10px; cursor: pointer; font-size: 13px; }
        .rd-sub-nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rd-sub-barra { height: 9px; background: var(--rd-card2); border-radius: 5px; overflow: hidden; }
        .rd-sub-barra span { display: block; height: 100%; background: linear-gradient(90deg, #2563eb, #60a5fa); border-radius: 5px; }
        .rd-sub-barra span.neg { background: #52525b; }
        .rd-sub-v { text-align: right; color: var(--rd-green); font-weight: 600; font-size: 12px; }
        .rd-sub-v.neg { color: var(--rd-mut); }
        .rd-lista { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
        .rd-lista-i { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 10px; }
        .rd-lista-i:hover { background: var(--rd-card2); }
        .rd-lista-i > img { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; }
        .rd-lista-i > img.rd-thumb-sm { width: 78px; height: 44px; border-radius: 6px; object-fit: cover; }
        .rd-num { color: var(--rd-orange); font-weight: 700; width: 18px; text-align: center; flex-shrink: 0; }
        .rd-lista-n { flex: 1; min-width: 0; }
        .rd-lista-n b { display: block; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rd-lista-n .rd-muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rd-lista-v { color: var(--rd-green); font-weight: 700; font-size: 13px; white-space: nowrap; }

        /* Spy */
        .rd-spy { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; margin-top: 6px; }
        .rd-spy-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .rd-spy-h { display: flex; gap: 14px; align-items: center; }
        .rd-spy-nome { font-size: 18px; font-weight: 700; }
        .rd-link { color: #c4a1ff !important; font-size: 13px; }
        .rd-spy-acoes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .rd-dias { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; text-align: center; font-size: 11px; color: var(--rd-mut); }
        .rd-dia-b { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
        .rd-dia-b span { width: 70%; background: #3a3a44; border-radius: 4px 4px 0 0; }
        .rd-dia.on { color: var(--rd-green); font-weight: 700; }
        .rd-dia.on .rd-dia-b span { background: var(--rd-green); }
        .rd-ia { align-items: stretch; }
        .rd-ia-ico { width: 44px; height: 44px; margin: 0 auto; border-radius: 50%; display: grid; place-items: center; background: rgba(155,92,255,.18); color: #c4a1ff; font-size: 20px; }
        .rd-texto { margin: 0; line-height: 1.55; color: #d6d6dd; }
        .rd-ul { margin: 0; padding-left: 18px; color: #d6d6dd; line-height: 1.6; }
        .rd-titulos { display: flex; flex-direction: column; gap: 6px; }
        .rd-titulo { display: flex; align-items: center; gap: 10px; background: var(--rd-card2); border: 1px solid var(--rd-borda); border-radius: 9px; padding: 8px 10px; cursor: pointer; }
        .rd-titulo input { width: auto !important; accent-color: var(--rd-purple); }
        .rd-titulo span { flex: 1; font-size: 13px; line-height: 1.4; }
        .rd-capa-texto { font-weight: 900; font-size: 22px; letter-spacing: .02em; color: var(--rd-yellow); text-shadow: 0 2px 0 #000; }
        .rd-prompt { background: var(--rd-card2); border: 1px solid var(--rd-borda); border-radius: 9px; padding: 10px 12px; font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; color: #d6d6dd; }
        .rd-painel .rd-btn-mini { align-self: flex-start; }

        /* Vigiados */
        .rd-vig-num { display: flex; flex-direction: column; align-items: flex-end; min-width: 70px; }
        .rd-vig-num .verde { color: var(--rd-green); }
        .rd-vig-num .vermelho { color: #ff6b6b; }
        .rd-vig-bars .rd-bars { width: 90px; height: 30px; }

        @media (max-width: 1100px) {
          .rd-grid-2, .rd-spy { grid-template-columns: 1fr; }
          .rd-grid-canais { grid-template-columns: 1fr; }
        }
        @media (max-width: 820px) {
          .rd-top { padding: 10px 14px; }
          .rd-top-b { display: none; }
          .rd-corpo { flex-direction: column; }
          .rd-menu { width: 100%; height: auto; position: sticky; top: 51px; z-index: 9; flex-direction: row; overflow-x: auto; padding: 8px 10px; border-right: 0; border-bottom: 1px solid var(--rd-borda); background: var(--rd-bg); }
          .rd-menu-t, .rd-menu-rod { display: none; }
          .rd-menu-i { white-space: nowrap; border-left: 0; padding: 8px 12px; font-size: 13px; }
          .rd-main { padding: 16px 14px 70px; }
          .rd-busca { flex-direction: column; }
          .rd-filtros { width: 100%; position: static; }
          .rd-stats4 { grid-template-columns: repeat(2, 1fr); }
          .rd-grid-mini { grid-template-columns: repeat(2, 1fr); }
          .rd-vig-bars { display: none; }
          .rd-sub-item { grid-template-columns: 100px 1fr 54px; }
        }
      `}</style>
    </div>
  );
}
