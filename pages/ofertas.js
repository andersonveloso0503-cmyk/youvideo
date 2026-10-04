// Radar de Ofertas — você cola o link de uma oferta que está vendendo bem; o Radar fica só com o esqueleto
// e monta a SUA oferta completa: estrutura do kit, página de vendas, textos de cadastro e de afiliados e a
// divulgação. Nada da página de origem é copiado: a trava confere antes de deixar publicar.
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { SECOES, precoBr, problemaDoKit } from '../lib/ofertas';

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let d = {};
  try { d = await r.json(); } catch { /* sem json */ }
  if (!r.ok || d.erro || d.error) {
    const e = new Error(d.erro || d.error || `Erro ${r.status}`);
    e.dados = d;
    throw e;
  }
  return d;
}

const PRODUTO_VAZIO = { tipo: 'plr', titulo: '', descricao: '', publico: '', itens: [], bonus: [], itensConfirmados: false, preco: '', garantiaDias: 7, vendedor: '', documento: '', emailSuporte: '', imagemUrl: '', checkoutUrl: '', pixel: false };
const ITEM_VAZIO = { titulo: '', descricao: '', paginas: '' };

function Copiar({ texto }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="ro-sec ro-mini" onClick={() => navigator.clipboard.writeText(texto || '').then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}>
      {ok ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function Campo({ rotulo, valor, onChange, linhas, dica, copiar, ...resto }) {
  return (
    <>
      <label>{rotulo}{copiar && <Copiar texto={valor} />}</label>
      {linhas ? <textarea rows={linhas} value={valor || ''} onChange={(e) => onChange(e.target.value)} {...resto} /> : <input type="text" value={valor ?? ''} onChange={(e) => onChange(e.target.value)} {...resto} />}
      {dica && <p className="ro-dica">{dica}</p>}
    </>
  );
}

/** Lista de itens do produto (ou bônus): título, descrição e páginas. */
function Itens({ titulo, lista, onChange, vazio }) {
  const mudar = (i, campo, v) => onChange(lista.map((x, k) => (k === i ? { ...x, [campo]: v } : x)));
  return (
    <>
      <label>{titulo}</label>
      {!lista.length && <p className="ro-dica">{vazio}</p>}
      {lista.map((it, i) => (
        <div className="ro-item" key={i}>
          <input type="text" placeholder="Título" value={it.titulo} onChange={(e) => mudar(i, 'titulo', e.target.value)} />
          <input type="text" placeholder="O que é, em uma frase" value={it.descricao} onChange={(e) => mudar(i, 'descricao', e.target.value)} />
          <input type="text" inputMode="numeric" placeholder="Páginas" aria-label="Páginas" value={it.paginas || ''} onChange={(e) => mudar(i, 'paginas', e.target.value.replace(/\D/g, ''))} />
          <button type="button" className="ro-sec ro-mini" aria-label="Remover" onClick={() => onChange(lista.filter((_, k) => k !== i))}>Remover</button>
        </div>
      ))}
      <button type="button" className="ro-sec ro-mini" onClick={() => onChange([...lista, { ...ITEM_VAZIO }])}>+ Adicionar</button>
    </>
  );
}

/** Lista de pares (título + texto) da página: benefícios, passos, dúvidas, anúncios. */
function Pares({ titulo, lista, a, b, onChange, linhas = 2 }) {
  const mudar = (i, campo, v) => onChange(lista.map((x, k) => (k === i ? { ...x, [campo]: v } : x)));
  return (
    <>
      <label>{titulo}</label>
      {lista.map((x, i) => (
        <div className="ro-par" key={i}>
          <input type="text" value={x[a] || ''} onChange={(e) => mudar(i, a, e.target.value)} />
          <textarea rows={linhas} value={x[b] || ''} onChange={(e) => mudar(i, b, e.target.value)} />
        </div>
      ))}
    </>
  );
}

export default function Ofertas() {
  const [analises, setAnalises] = useState([]);
  const [ofertas, setOfertas] = useState([]);
  const [livros, setLivros] = useState([]);
  const [url, setUrl] = useState('');
  const [texto, setTexto] = useState('');
  const [mostrarTexto, setMostrarTexto] = useState(false);
  const [sinais, setSinais] = useState({ temperatura: '', diasAnuncio: '' });
  const [analise, setAnalise] = useState(null);
  const [produto, setProduto] = useState(PRODUTO_VAZIO);
  const [oferta, setOferta] = useState(null);
  const [ocupado, setOcupado] = useState('');
  const [aviso, setAviso] = useState('');
  const [sujo, setSujo] = useState(false);

  useEffect(() => {
    api('/api/ofertas/analises').then((d) => {
      const lista = d.analises || [];
      setAnalises(lista);
      // o navegador de ofertas do Compilador abre esta tela já na análise recém-feita
      const pedida = new URLSearchParams(window.location.search).get('analise');
      const achada = pedida && lista.find((a) => a.id === pedida);
      if (achada) setAnalise(achada);
    }).catch((e) => setAviso(e.message));
    api('/api/ofertas').then((d) => setOfertas(d.ofertas || [])).catch(() => {});
    api('/api/livros').then((d) => setLivros(d.livros || [])).catch(() => {});
    try {
      const v = JSON.parse(localStorage.getItem('ofertas-vendedor') || '{}');
      setProduto((p) => ({ ...p, vendedor: v.vendedor || '', documento: v.documento || '', emailSuporte: v.emailSuporte || '' }));
    } catch { /* sem armazenamento */ }
  }, []);

  const topo = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const prod = (campo, v) => setProduto((p) => ({ ...p, [campo]: v }));

  async function analisar() {
    setAviso('');
    if (!url.trim() && !texto.trim()) { setAviso('Cole o link da página de vendas.'); return; }
    setOcupado('Lendo a página e extraindo o esqueleto… (até 1 minuto)');
    try {
      const d = await api('/api/ofertas/analises', { method: 'POST', body: JSON.stringify({ url, texto, sinais }) });
      setAnalises((a) => [d.analise, ...a]);
      setAnalise(d.analise);
      setUrl(''); setTexto(''); setMostrarTexto(false);
      topo();
    } catch (e) {
      if (e.dados?.colar) setMostrarTexto(true);
      setAviso(e.message);
    } finally {
      setOcupado('');
    }
  }

  function usarLivro(l) {
    const paginas = Number(l.paginas) || 0;
    const item = { titulo: l.titulo, descricao: l.subtitulo || '', paginas };
    setProduto((p) => ({ ...p, itens: [...p.itens, item], imagemUrl: p.imagemUrl || l.capa?.url || '' }));
  }

  async function gerar() {
    setAviso('');
    if (!produto.titulo.trim()) { setAviso('Dê um nome ao seu produto.'); return; }
    try { localStorage.setItem('ofertas-vendedor', JSON.stringify({ vendedor: produto.vendedor, documento: produto.documento, emailSuporte: produto.emailSuporte })); } catch { /* ok */ }
    setOcupado('Escrevendo a sua oferta e conferindo a originalidade… (1 a 3 minutos)');
    try {
      const d = await api('/api/ofertas/gerar', { method: 'POST', body: JSON.stringify({ analiseId: analise.id, produto }) });
      setOferta(d.oferta);
      setSujo(false);
      setOfertas((o) => [{ id: d.oferta.id, titulo: d.oferta.produto.titulo, status: d.oferta.status, slug: '', atualizadoEm: d.oferta.atualizadoEm, pendencias: d.oferta.pendencias.length }, ...o]);
      topo();
    } catch (e) {
      setAviso(e.message);
    } finally {
      setOcupado('');
    }
  }

  async function abrirOferta(id) {
    setAviso('');
    setOcupado('Abrindo…');
    try {
      const d = await api(`/api/ofertas?id=${id}`);
      setOferta(d.oferta);
      setSujo(false);
      topo();
    } catch (e) { setAviso(e.message); } finally { setOcupado(''); }
  }

  const resumo = (o) => ({ id: o.id, titulo: o.produto.titulo, status: o.status, slug: o.slug, atualizadoEm: o.atualizadoEm, pendencias: o.pendencias.length });

  async function salvar() {
    setAviso('');
    setOcupado('Salvando e conferindo de novo…');
    try {
      const d = await api('/api/ofertas', { method: 'POST', body: JSON.stringify({ oferta }) });
      setOferta(d.oferta);
      setSujo(false);
      setOfertas((os) => os.map((x) => (x.id === d.oferta.id ? resumo(d.oferta) : x)));
      return d.oferta;
    } catch (e) { setAviso(e.message); return null; } finally { setOcupado(''); }
  }

  async function publicar(sim) {
    const salva = sujo ? await salvar() : oferta;
    if (!salva) return;
    setOcupado(sim ? 'Publicando a página…' : 'Tirando a página do ar…');
    try {
      const d = await api('/api/ofertas/publicar', { method: 'POST', body: JSON.stringify({ id: salva.id, publicar: sim }) });
      setOferta(d.oferta);
      setOfertas((os) => os.map((x) => (x.id === d.oferta.id ? resumo(d.oferta) : x)));
      topo();
    } catch (e) {
      setAviso(e.dados?.pendencias ? `${e.message} ${e.dados.pendencias.join(' ')}` : e.message);
      if (e.dados?.pendencias) abrirOferta(salva.id);
    } finally { setOcupado(''); }
  }

  async function excluirOferta() {
    if (!window.confirm(`Excluir a oferta "${oferta.produto.titulo}"? A página sai do ar.`)) return;
    try { await api(`/api/ofertas?id=${oferta.id}`, { method: 'DELETE' }); } catch (e) { setAviso(e.message); return; }
    setOfertas((os) => os.filter((x) => x.id !== oferta.id));
    setOferta(null);
  }

  async function excluirAnalise(a) {
    if (!window.confirm('Excluir esta análise? As ofertas geradas a partir dela não poderão mais ser publicadas.')) return;
    setAnalises((as) => as.filter((x) => x.id !== a.id));
    if (analise?.id === a.id) setAnalise(null);
    try { await api(`/api/ofertas/analises?id=${a.id}`, { method: 'DELETE' }); } catch (e) { setAviso(e.message); }
  }

  // edição da oferta aberta
  const ed = (grupo, campo, v) => { setSujo(true); setOferta((o) => ({ ...o, [grupo]: { ...o[grupo], [campo]: v } })); };
  const edRaiz = (campo, v) => { setSujo(true); setOferta((o) => ({ ...o, [campo]: v })); };
  const enderecoPublico = oferta?.slug && typeof window !== 'undefined' ? `${window.location.origin}/oferta/${oferta.slug}` : '';
  const esq = analise?.esqueleto || {};
  const kit = problemaDoKit({ itens: produto.itens.filter((i) => i.titulo), bonus: produto.bonus.filter((i) => i.titulo) });

  return (
    <div className="container">
      <Head><title>Radar de Ofertas · Youvideo</title></Head>
      <h1>🧭 Radar de Ofertas</h1>
      <p className="subtitle"><a href="/" style={{ color: '#4f7cff' }}>← voltar pro painel</a> · Cole o link de uma oferta que está vendendo bem. O Radar fica só com o esqueleto dela e monta a sua oferta completa, com produto e texto seus.</p>

      {aviso && <div className="card" role="alert" style={{ borderColor: '#b1432f', color: '#ffb3a6' }}>{aviso}</div>}
      {ocupado && <div className="card" role="status"><span className="spinner spinner--muted" /> {ocupado}</div>}

      {/* ---------- Início ---------- */}
      {!analise && !oferta && (
        <>
          <div className="card">
            <h2>1. Cole o link da oferta</h2>
            <Campo rotulo="Link da página de vendas" valor={url} onChange={setUrl} placeholder="https://…" dica="Onde achar ofertas em alta: o mercado de afiliação da Hotmart (ordene pela temperatura) e a Biblioteca de Anúncios da Meta (anúncio ativo há muito tempo costuma ser oferta que dá resultado)." />
            {!mostrarTexto && <button type="button" className="ro-sec ro-mini" onClick={() => setMostrarTexto(true)}>A página não abre? Colar o texto dela</button>}
            {mostrarTexto && <Campo rotulo="Texto da página (abra o link, selecione tudo, copie e cole aqui)" valor={texto} onChange={setTexto} linhas={6} dica="O texto serve só para a análise e é descartado em seguida." />}
            <div className="row">
              <div><Campo rotulo="Temperatura na Hotmart (opcional)" valor={sinais.temperatura} onChange={(v) => setSinais((s) => ({ ...s, temperatura: v }))} placeholder="Ex.: 87°" /></div>
              <div><Campo rotulo="Dias com anúncio ativo (opcional)" valor={sinais.diasAnuncio} onChange={(v) => setSinais((s) => ({ ...s, diasAnuncio: v }))} placeholder="Ex.: 45" /></div>
            </div>
            <button disabled={!!ocupado} onClick={analisar}>Analisar oferta</button>
          </div>

          {analises.length > 0 && (
            <div className="card">
              <h2>Ofertas analisadas</h2>
              {analises.map((a) => (
                <div key={a.id} className="ro-linha">
                  <button className="ro-abrir" onClick={() => { setAnalise(a); setAviso(''); topo(); }}>
                    <b>{a.esqueleto?.nicho || 'Oferta'} · {a.esqueleto?.tipoProduto || ''}</b>
                    <small>{a.esqueleto?.preco || 'preço não informado'}{a.sinais?.temperatura ? ` · temperatura ${a.sinais.temperatura}` : ''}{a.sinais?.diasAnuncio ? ` · ${a.sinais.diasAnuncio} dias de anúncio` : ''} · {new Date(a.criadoEm).toLocaleDateString('pt-BR')}</small>
                  </button>
                  <button className="ro-sec ro-x" onClick={() => excluirAnalise(a)}>Excluir</button>
                </div>
              ))}
            </div>
          )}

          {ofertas.length > 0 && (
            <div className="card">
              <h2>Minhas ofertas</h2>
              {ofertas.map((o) => (
                <div key={o.id} className="ro-linha">
                  <button className="ro-abrir" onClick={() => abrirOferta(o.id)}>
                    <b>{o.titulo}</b>
                    <small>{o.status === 'publicada' ? 'No ar' : o.pendencias ? `Rascunho · ${o.pendencias} pendência(s)` : 'Rascunho · pronta para publicar'} · {new Date(o.atualizadoEm).toLocaleDateString('pt-BR')}</small>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---------- Análise + dados do seu produto ---------- */}
      {analise && !oferta && (
        <>
          <div className="card">
            <button className="ro-sec ro-mini" onClick={() => setAnalise(null)}>← Outra oferta</button>
            <h2 style={{ marginTop: 12 }}>Esqueleto da oferta de referência</h2>
            <table className="ro-tab"><tbody>
              {[['Nicho', esq.nicho], ['Público', esq.publico], ['Tipo de produto', esq.tipoProduto], ['Preço', esq.preco], ['Itens', esq.itens], ['Garantia', esq.garantia], ['Tipo de apelo', esq.angulo], ['Dúvidas que responde', (esq.objecoes || []).join(' · ')], ['Criativos', esq.criativos], ['Ordem das seções', (esq.secoes || []).map((s) => SECOES[s]).join(' → ')]]
                .filter(([, v]) => v).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
            </tbody></table>
            {esq.promessasProblematicas?.length > 0 && <p className="ro-dica">Promessas dela que a sua oferta não vai repetir: {esq.promessasProblematicas.join('; ')}.</p>}
            <p className="ro-dica">Do texto da página ficaram guardados só {analise.sequencias} códigos de conferência, usados pela trava. O texto, as imagens e os nomes dela não são reaproveitados.</p>
          </div>

          <div className="card">
            <h2>2. O seu produto</h2>
            <div className="ro-opcoes">
              <button className={produto.tipo === 'plr' ? 'on' : ''} onClick={() => prod('tipo', 'plr')}>PLR<small>Quem compra pode editar e revender</small></button>
              <button className={produto.tipo === 'final' ? 'on' : ''} onClick={() => prod('tipo', 'final')}>Consumidor final<small>Uso pessoal, sem revenda</small></button>
            </div>
            <Campo rotulo="Nome do produto" valor={produto.titulo} onChange={(v) => prod('titulo', v)} placeholder="Ex.: Kit Heróis da Fé" />
            <Campo rotulo="O que é" valor={produto.descricao} onChange={(v) => prod('descricao', v)} linhas={2} placeholder="Ex.: 4 livros infantis ilustrados com histórias da Bíblia, em PDF e Word editável" />
            <Campo rotulo="Para quem é" valor={produto.publico} onChange={(v) => prod('publico', v)} placeholder="Ex.: pais e professores de escola dominical" />

            {livros.length > 0 && (
              <>
                <label>Adicionar dos meus livros</label>
                <div className="ro-livros">
                  {livros.map((l) => <button key={l.id} type="button" onClick={() => usarLivro(l)}>+ {l.titulo}</button>)}
                </div>
              </>
            )}
            <Itens titulo="Itens do pacote" lista={produto.itens} onChange={(v) => prod('itens', v)} vazio="Sem itens, a IA sugere a estrutura do kit (títulos e bônus) para você criar depois em Livros bíblicos." />
            <Itens titulo="Bônus" lista={produto.bonus} onChange={(v) => prod('bonus', v)} vazio="Nenhum bônus." />
            {kit && produto.itens.length > 0 && <p className="ro-alerta">{kit}</p>}

            <div className="row">
              <div><Campo rotulo="Preço (R$)" valor={produto.preco} onChange={(v) => prod('preco', v.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="Ex.: 49,90" dica={esq.preco ? `A oferta de referência cobra: ${esq.preco}` : ''} /></div>
              <div><Campo rotulo="Garantia (dias)" valor={produto.garantiaDias} onChange={(v) => prod('garantiaDias', v.replace(/\D/g, ''))} inputMode="numeric" /></div>
            </div>
            <div className="row">
              <div><Campo rotulo="Vendedor (aparece no rodapé)" valor={produto.vendedor} onChange={(v) => prod('vendedor', v)} /></div>
              <div><Campo rotulo="CPF ou CNPJ (opcional)" valor={produto.documento} onChange={(v) => prod('documento', v)} /></div>
            </div>
            <Campo rotulo="E-mail de suporte" valor={produto.emailSuporte} onChange={(v) => prod('emailSuporte', v)} inputMode="email" />
            <Campo rotulo="Link da imagem da capa (opcional)" valor={produto.imagemUrl} onChange={(v) => prod('imagemUrl', v)} placeholder="https://…" dica="Ao adicionar um livro seu, a capa dele entra aqui sozinha." />
            <label className="ro-check"><input type="checkbox" checked={produto.pixel} onChange={(e) => prod('pixel', e.target.checked)} /> A página vai ter pixel de anúncios ou medição de visitas</label>
            <button disabled={!!ocupado} onClick={gerar}>Gerar a oferta completa</button>
            <p className="ro-dica">Sai de uma vez: página de vendas, textos de cadastro, texto de afiliados, posts, anúncios, roteiro de vídeo e e-mail. Você revisa tudo antes de publicar.</p>
          </div>
        </>
      )}

      {/* ---------- Oferta gerada: revisar, salvar, publicar ---------- */}
      {oferta && (
        <>
          <div className="card">
            <button className="ro-sec ro-mini" onClick={() => { setOferta(null); setAnalise(null); }}>← Voltar</button>
            <h2 style={{ marginTop: 12 }}>{oferta.produto.titulo}</h2>
            {oferta.status === 'publicada' && (
              <p className="ro-ok">No ar: <a href={enderecoPublico} target="_blank" rel="noreferrer">{enderecoPublico}</a> <Copiar texto={enderecoPublico} /></p>
            )}
            {sujo && <p className="ro-alerta">Há alterações não salvas. Salve para conferir de novo.</p>}
            {!sujo && oferta.pendencias.length > 0 && (
              <div className="ro-pend">
                <b>Antes de publicar, resolva:</b>
                <ul>{oferta.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            {!sujo && !oferta.pendencias.length && oferta.status !== 'publicada' && <p className="ro-ok">Tudo conferido. A oferta pode ser publicada.</p>}
            {oferta.estruturaSugerida && <p className="ro-alerta">A estrutura do kit abaixo foi sugerida pela IA. Crie os materiais em Livros bíblicos, ajuste os títulos e as páginas aqui e só então marque a confirmação.</p>}

            {(oferta.trava.trechos.length > 0 || oferta.trava.nomes.length > 0) && (
              <div className="ro-pend">
                <b>Trava de originalidade</b>
                <ul>
                  {oferta.trava.trechos.map((t, i) => <li key={`t${i}`}>{t.campo}: <mark>{t.texto}</mark></li>)}
                  {oferta.trava.nomes.map((n, i) => <li key={`n${i}`}>{n.campo}: usa o nome <mark>{n.nome}</mark>, que é da oferta de origem</li>)}
                </ul>
              </div>
            )}
            {oferta.alertas.length > 0 && (
              <div className="ro-pend">
                <b>Regras de conteúdo</b>
                <ul>{oferta.alertas.map((a, i) => <li key={i}>{a.tipo} ({a.campo}): <mark>{a.frase}</mark></li>)}</ul>
              </div>
            )}

            <div className="ro-acoes">
              <button disabled={!!ocupado} onClick={salvar}>Salvar e conferir</button>
              <a className="ro-botao ro-sec" href={`/oferta/previa-${oferta.id}`} target="_blank" rel="noreferrer">Ver prévia da página</a>
              {oferta.status === 'publicada'
                ? <button className="ro-sec" disabled={!!ocupado} onClick={() => publicar(false)}>Tirar do ar</button>
                : <button disabled={!!ocupado || (!sujo && oferta.pendencias.length > 0)} onClick={() => publicar(true)}>Publicar a página</button>}
              <button className="ro-sec" disabled={!!ocupado} onClick={excluirOferta}>Excluir</button>
            </div>
          </div>

          <div className="card">
            <h2>Produto</h2>
            <Itens titulo="Itens do pacote" lista={oferta.produto.itens} onChange={(v) => ed('produto', 'itens', v)} vazio="Sem itens." />
            <Itens titulo="Bônus" lista={oferta.produto.bonus} onChange={(v) => ed('produto', 'bonus', v)} vazio="Nenhum bônus." />
            <label className="ro-check"><input type="checkbox" checked={!!oferta.produto.itensConfirmados} onChange={(e) => ed('produto', 'itensConfirmados', e.target.checked)} /> Confirmo que esses itens e bônus existem e estão prontos para entrega</label>
            <div className="row">
              <div><Campo rotulo="Preço (R$)" valor={oferta.produto.preco || ''} onChange={(v) => ed('produto', 'preco', v.replace(/[^\d.,]/g, ''))} inputMode="decimal" dica={precoBr(oferta.produto.preco) ? `Na página: ${precoBr(oferta.produto.preco)}` : ''} /></div>
              <div><Campo rotulo="Garantia (dias)" valor={oferta.produto.garantiaDias} onChange={(v) => ed('produto', 'garantiaDias', v.replace(/\D/g, ''))} inputMode="numeric" /></div>
            </div>
            <Campo rotulo="Link de pagamento (checkout)" valor={oferta.produto.checkoutUrl} onChange={(v) => ed('produto', 'checkoutUrl', v)} placeholder="https://pay.hotmart.com/…" dica="A plataforma só gera esse link depois do cadastro. Publique a página antes, cadastre o produto com o endereço dela e volte aqui para colar o link." />
            <Campo rotulo="Link da imagem da capa" valor={oferta.produto.imagemUrl} onChange={(v) => ed('produto', 'imagemUrl', v)} placeholder="https://…" />
            <div className="row">
              <div><Campo rotulo="Vendedor" valor={oferta.produto.vendedor} onChange={(v) => ed('produto', 'vendedor', v)} /></div>
              <div><Campo rotulo="CPF ou CNPJ (opcional)" valor={oferta.produto.documento} onChange={(v) => ed('produto', 'documento', v)} /></div>
            </div>
            <Campo rotulo="E-mail de suporte" valor={oferta.produto.emailSuporte} onChange={(v) => ed('produto', 'emailSuporte', v)} />
            <label className="ro-check"><input type="checkbox" checked={!!oferta.produto.pixel} onChange={(e) => ed('produto', 'pixel', e.target.checked)} /> A página vai ter pixel de anúncios ou medição de visitas</label>
          </div>

          <div className="card">
            <h2>Página de vendas</h2>
            <p className="ro-dica">Ordem dos blocos: {oferta.secoes.map((s) => SECOES[s]).join(' → ')}</p>
            <Campo rotulo="Chamada (acima do título)" valor={oferta.pagina.chamada} onChange={(v) => ed('pagina', 'chamada', v)} />
            <Campo rotulo="Título" valor={oferta.pagina.titulo} onChange={(v) => ed('pagina', 'titulo', v)} />
            <Campo rotulo="Subtítulo" valor={oferta.pagina.subtitulo} onChange={(v) => ed('pagina', 'subtitulo', v)} linhas={3} />
            <Campo rotulo="Texto do botão" valor={oferta.pagina.botao} onChange={(v) => ed('pagina', 'botao', v)} />
            <Pares titulo="Benefícios" lista={oferta.pagina.beneficios} a="titulo" b="texto" onChange={(v) => ed('pagina', 'beneficios', v)} />
            <Campo rotulo="Para quem é (uma frase por linha)" valor={oferta.pagina.paraQuem.join('\n')} onChange={(v) => ed('pagina', 'paraQuem', v.split('\n'))} linhas={4} />
            <Pares titulo="Como funciona" lista={oferta.pagina.comoFunciona} a="titulo" b="texto" onChange={(v) => ed('pagina', 'comoFunciona', v)} />
            <Pares titulo="Dúvidas frequentes" lista={oferta.pagina.duvidas} a="pergunta" b="resposta" onChange={(v) => ed('pagina', 'duvidas', v)} linhas={3} />
            <Campo rotulo="Frase antes do botão final" valor={oferta.pagina.fechamento} onChange={(v) => ed('pagina', 'fechamento', v)} />
          </div>

          <div className="card">
            <h2>Cadastro na plataforma</h2>
            <Campo rotulo="Nome do produto" valor={oferta.cadastro.nome} onChange={(v) => ed('cadastro', 'nome', v)} copiar />
            <Campo rotulo="Descrição" valor={oferta.cadastro.descricao} onChange={(v) => ed('cadastro', 'descricao', v)} linhas={5} copiar />
            <Campo rotulo="Categoria sugerida" valor={oferta.cadastro.categoria} onChange={(v) => ed('cadastro', 'categoria', v)} />
            <Campo rotulo="Texto do programa de afiliados" valor={oferta.afiliados} onChange={(v) => edRaiz('afiliados', v)} linhas={10} copiar dica={`${(oferta.afiliados || '').length} de 2.000 caracteres. A comissão você define na plataforma.`} />
          </div>

          <div className="card">
            <h2>Divulgação</h2>
            {oferta.divulgacao.posts.map((p, i) => (
              <Campo key={i} rotulo={`Post ${i + 1} (Instagram e Facebook)`} valor={p} linhas={4} copiar onChange={(v) => ed('divulgacao', 'posts', oferta.divulgacao.posts.map((x, k) => (k === i ? v : x)))} />
            ))}
            <Pares titulo="Anúncios (título e texto)" lista={oferta.divulgacao.anuncios} a="titulo" b="texto" onChange={(v) => ed('divulgacao', 'anuncios', v)} />
            <Campo rotulo="Roteiro de vídeo curto (30 segundos)" valor={oferta.divulgacao.roteiroVideo} onChange={(v) => ed('divulgacao', 'roteiroVideo', v)} linhas={7} copiar />
            <Campo rotulo="E-mail · assunto" valor={oferta.divulgacao.email.assunto} onChange={(v) => ed('divulgacao', 'email', { ...oferta.divulgacao.email, assunto: v })} copiar />
            <Campo rotulo="E-mail · texto" valor={oferta.divulgacao.email.corpo} onChange={(v) => ed('divulgacao', 'email', { ...oferta.divulgacao.email, corpo: v })} linhas={8} copiar />
          </div>
        </>
      )}

      <style jsx global>{`
        .ro-dica { font-size: 12px; color: #999; margin: 6px 0 0; }
        .ro-alerta { font-size: 13px; color: #f1c27d; margin: 10px 0 0; }
        .ro-ok { font-size: 14px; color: #8fd6c1; margin: 10px 0 0; }
        .ro-ok a { color: #8fd6c1; word-break: break-all; }
        .ro-pend { border: 1px solid #b1432f; border-radius: 8px; padding: 12px 14px; margin-top: 12px; font-size: 14px; color: #ffb3a6; }
        .ro-pend ul { margin: 6px 0 0; padding-left: 18px; }
        .ro-pend li { margin-bottom: 4px; }
        .ro-pend mark { background: rgba(177, 67, 47, 0.35); color: #fff; padding: 0 3px; border-radius: 3px; }
        .ro-sec { background: transparent !important; border: 1px solid #444 !important; color: inherit !important; }
        .ro-mini { width: auto; margin: 6px 0 0; padding: 8px 12px; font-size: 13px; min-height: 36px; }
        label .ro-mini { margin: 0 0 0 10px; padding: 3px 10px; min-height: 0; font-size: 12px; }
        .ro-linha { display: flex; gap: 8px; margin-top: 8px; }
        .ro-abrir { flex: 1; text-align: left; margin-top: 0; background: transparent; border: 1px solid #444; color: inherit; }
        .ro-abrir small { display: block; font-weight: 400; opacity: 0.7; margin-top: 3px; }
        .ro-x { width: auto; margin-top: 0; font-size: 13px; }
        .ro-tab { width: 100%; border-collapse: collapse; font-size: 14px; }
        .ro-tab th { text-align: left; font-weight: 500; color: var(--text-muted); width: 34%; padding: 7px 10px 7px 0; vertical-align: top; }
        .ro-tab td { padding: 7px 0; }
        .ro-tab tr + tr th, .ro-tab tr + tr td { border-top: 1px solid var(--border); }
        .ro-opcoes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ro-opcoes button { text-align: left; background: transparent; border: 1px solid #444; color: inherit; margin-top: 0; }
        .ro-opcoes button small { display: block; font-weight: 400; opacity: 0.7; margin-top: 4px; }
        .ro-opcoes button.on { border-color: #d8a441; background: rgba(216, 164, 65, 0.14); color: #f1dfb6; }
        .ro-livros { display: flex; flex-wrap: wrap; gap: 6px; }
        .ro-livros button { width: auto; margin-top: 0; padding: 7px 12px; font-size: 13px; border-radius: 999px; background: transparent; border: 1px solid #444; color: inherit; font-weight: 500; }
        .ro-item { display: grid; grid-template-columns: 1.2fr 2fr 90px auto; gap: 6px; margin-bottom: 6px; align-items: center; }
        .ro-item .ro-mini { margin: 0; }
        .ro-par { display: grid; grid-template-columns: 1fr 2fr; gap: 6px; margin-bottom: 6px; }
        .ro-par textarea { min-height: 0; }
        .ro-check { display: flex; gap: 8px; align-items: flex-start; color: var(--text); font-size: 14px; margin-top: 14px; }
        .ro-check input { margin-top: 3px; }
        .ro-acoes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 16px; }
        .ro-acoes button, .ro-botao { width: auto; margin-top: 0; }
        .ro-botao { display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; }
        @media (max-width: 640px) { .ro-item, .ro-par, .ro-opcoes { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
