// Página de vendas pública de uma oferta do Radar. Monta os blocos na ordem guardada em oferta.secoes.
// Os fatos (itens, bônus, preço, garantia, números) vêm sempre de oferta.produto; a IA só escreve o texto em volta.
import Head from 'next/head';
import { LICENCA_PODE, LICENCA_NAO_PODE, numerosDoProduto, precoBr } from '../lib/ofertas';

const Certo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3F6B35" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const Errado = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8C2F1B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

function Botao({ produto, texto, grande }) {
  if (!produto.checkoutUrl) return <span className={`of-botao of-botao--off ${grande ? 'of-botao--g' : ''}`}>Disponível em breve</span>;
  return <a className={`of-botao ${grande ? 'of-botao--g' : ''}`} href={produto.checkoutUrl} rel="noopener">{texto}</a>;
}

export default function OfertaPagina({ oferta, previa = false, base = '' }) {
  const { produto, pagina } = oferta;
  const preco = precoBr(produto.preco);
  const plr = produto.tipo === 'plr';
  const blocos = {
    capa: (
      <section className="of-capa" key="capa">
        <div className="of-capa-texto">
          {pagina.chamada && <div className="of-chamada">{pagina.chamada}</div>}
          <h1>{pagina.titulo}</h1>
          {pagina.subtitulo && <p className="of-sub">{pagina.subtitulo}</p>}
          <div className="of-acoes">
            <Botao produto={produto} texto={pagina.botao} grande />
            <a className="of-botao of-botao--linha of-botao--g" href="#pacote">Ver o que vem no pacote</a>
          </div>
          <div className="of-nota">Pagamento único · Garantia de {produto.garantiaDias} dias</div>
        </div>
        {produto.imagemUrl && (
          <div className="of-capa-img"><img src={produto.imagemUrl} alt={`Capa de ${produto.titulo}`} /></div>
        )}
      </section>
    ),
    numeros: (
      <section className="of-faixa" key="numeros" aria-label="O produto em números">
        <div className="of-miolo of-numeros">
          {numerosDoProduto(produto).map((n) => (
            <div key={n.rotulo}><div className="of-num">{n.valor}</div><div className="of-rot">{n.rotulo}</div></div>
          ))}
        </div>
      </section>
    ),
    beneficios: pagina.beneficios?.length ? (
      <section className="of-miolo of-sec" key="beneficios">
        <div className="of-grade">
          {pagina.beneficios.map((b, i) => (
            <div className="of-topo" key={i}><h3>{b.titulo}</h3><p>{b.texto}</p></div>
          ))}
        </div>
      </section>
    ) : null,
    paraQuem: pagina.paraQuem?.length ? (
      <section className="of-clara" key="paraQuem">
        <div className="of-miolo of-sec">
          <h2>Para quem é</h2>
          <ul className="of-lista">{pagina.paraQuem.map((t, i) => <li key={i}><Certo /><span>{t}</span></li>)}</ul>
        </div>
      </section>
    ) : null,
    itens: (
      <section className="of-miolo of-sec" id="pacote" key="itens">
        <h2>O que vem no pacote</h2>
        <div className="of-grade">
          {produto.itens.map((it, i) => (
            <div className="of-cartao" key={i}>
              <h3>{it.titulo}</h3>
              {it.descricao && <p>{it.descricao}</p>}
              {it.paginas > 0 && <div className="of-pag">{it.paginas} páginas</div>}
            </div>
          ))}
        </div>
      </section>
    ),
    bonus: produto.bonus?.length ? (
      <section className="of-faixa" key="bonus">
        <div className="of-miolo of-sec">
          <h2>{produto.bonus.length === 1 ? 'E mais um bônus' : `E mais ${produto.bonus.length} bônus`}</h2>
          <div className="of-grade">
            {produto.bonus.map((it, i) => (
              <div className="of-bonus" key={i}>
                <div className="of-etq">Bônus {i + 1}</div>
                <h3>{it.titulo}</h3>
                {it.descricao && <p>{it.descricao}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>
    ) : null,
    licenca: plr ? (
      <section className="of-miolo of-sec" key="licenca">
        <h2>O que a licença permite</h2>
        <p className="of-lead">PLR quer dizer direito de marca própria: você compra o material uma vez e publica como seu.</p>
        <div className="of-grade of-grade--2">
          <div className="of-cartao"><h3>Você pode</h3><ul className="of-lista">{LICENCA_PODE.map((t) => <li key={t}><Certo /><span>{t}</span></li>)}</ul></div>
          <div className="of-cartao"><h3>Você não pode</h3><ul className="of-lista">{LICENCA_NAO_PODE.map((t) => <li key={t}><Errado /><span>{t}</span></li>)}</ul></div>
        </div>
      </section>
    ) : null,
    comoFunciona: pagina.comoFunciona?.length ? (
      <section className="of-clara" key="comoFunciona">
        <div className="of-miolo of-sec">
          <h2>Como funciona</h2>
          <div className="of-grade">
            {pagina.comoFunciona.map((p, i) => (
              <div key={i}><div className="of-passo">{i + 1}</div><h3>{p.titulo}</h3><p>{p.texto}</p></div>
            ))}
          </div>
        </div>
      </section>
    ) : null,
    preco: (
      <section className="of-miolo of-sec" id="oferta" key="preco">
        <div className="of-preco">
          <div className="of-chamada">{produto.titulo}</div>
          {pagina.fechamento && <h2>{pagina.fechamento}</h2>}
          {preco && <div className="of-valor">{preco}</div>}
          <ul className="of-lista">
            {[...produto.itens, ...produto.bonus.map((b) => ({ ...b, titulo: `Bônus: ${b.titulo}` }))].map((it, i) => <li key={i}><Certo /><span>{it.titulo}</span></li>)}
            {plr && <li><Certo /><span>Licença PLR por escrito</span></li>}
            <li><Certo /><span>Garantia de {produto.garantiaDias} dias: se não gostar, peça o reembolso</span></li>
          </ul>
          <Botao produto={produto} texto={pagina.botao} grande />
          {plr && <p className="of-aviso">Este pacote não promete ganhos. Ele entrega um produto pronto; as vendas dependem do seu trabalho de divulgação.</p>}
        </div>
      </section>
    ),
    duvidas: pagina.duvidas?.length ? (
      <section className="of-clara" key="duvidas">
        <div className="of-miolo of-sec of-estreito">
          <h2>Dúvidas frequentes</h2>
          {pagina.duvidas.map((d, i) => (
            <details key={i}><summary>{d.pergunta}</summary><p>{d.resposta}</p></details>
          ))}
        </div>
      </section>
    ) : null,
  };

  return (
    <div className="of-pagina">
      <Head>
        <title>{pagina.titulo || produto.titulo}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={(pagina.subtitulo || '').slice(0, 160)} />
        {previa && <meta name="robots" content="noindex" />}
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      {previa && <div className="of-previa">Prévia: esta página ainda não está publicada.</div>}
      <header className="of-cab"><div className="of-miolo of-cab-linha"><div className="of-marca">{produto.titulo}</div><Botao produto={produto} texto={pagina.botao} /></div></header>
      {(oferta.secoes || []).map((s) => blocos[s]).filter(Boolean)}
      <footer className="of-rodape">
        <div className="of-miolo of-rodape-linha">
          <div><div className="of-marca of-marca--clara">{produto.titulo}</div><div>{[produto.vendedor, produto.documento].filter(Boolean).join(' · ')}</div></div>
          <div>
            {produto.emailSuporte && <div>Suporte: <a href={`mailto:${produto.emailSuporte}`}>{produto.emailSuporte}</a></div>}
            <div className="of-links"><a href={`${base}/termos`}>Termos de uso</a><a href={`${base}/privacidade`}>Política de privacidade</a></div>
          </div>
        </div>
      </footer>
      <style jsx global>{estilo}</style>
    </div>
  );
}

export const estilo = `
  html { scroll-behavior: smooth; }
  body { background: #FBF8F1; }
  .of-pagina { font-family: 'Figtree', 'Segoe UI', sans-serif; color: #23261E; background: #FBF8F1; font-size: 17px; line-height: 1.55; }
  .of-pagina h1, .of-pagina h2 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; letter-spacing: -0.015em; line-height: 1.1; margin: 0; }
  .of-pagina h1 { font-size: clamp(34px, 6vw, 56px); }
  .of-pagina h2 { font-size: clamp(26px, 4vw, 38px); margin-bottom: 28px; }
  .of-pagina h3 { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
  .of-pagina p { margin: 0; color: #3D4233; }
  .of-pagina a { color: #23261E; }
  .of-miolo { max-width: 1120px; margin: 0 auto; padding-left: clamp(20px, 5vw, 48px); padding-right: clamp(20px, 5vw, 48px); }
  .of-sec { padding-top: clamp(44px, 7vw, 80px); padding-bottom: clamp(44px, 7vw, 80px); }
  .of-estreito { max-width: 800px; }
  .of-previa { background: #8C2F1B; color: #fff; text-align: center; padding: 8px 16px; font-size: 14px; font-weight: 600; }
  .of-cab { border-bottom: 1px solid #DDD5C2; }
  .of-cab-linha { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 24px; padding-top: 12px; padding-bottom: 12px; }
  .of-marca { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 21px; }
  .of-marca--clara { color: #FBF8F1; font-size: 18px; }
  .of-botao { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; background: #A94A28; color: #fff !important; font-weight: 600; font-size: 15px; border-radius: 8px; text-decoration: none; }
  .of-botao--g { min-height: 54px; padding: 0 28px; font-size: 17px; }
  .of-botao--linha { background: transparent; color: #23261E !important; border: 1.5px solid #23261E; }
  .of-botao--off { background: #DDD5C2; color: #5A5F50 !important; }
  .of-capa { max-width: 1120px; margin: 0 auto; padding: clamp(40px, 7vw, 84px) clamp(20px, 5vw, 48px); display: flex; flex-wrap: wrap; align-items: center; gap: 44px 64px; }
  .of-capa-texto { flex: 1 1 440px; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
  .of-capa-img { flex: 0 1 360px; min-width: 240px; margin: 0 auto; }
  .of-capa-img img { width: 100%; display: block; border-radius: 4px 12px 12px 4px; box-shadow: 0 28px 52px -22px rgba(35, 38, 30, 0.6); }
  .of-chamada { font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #A94A28; }
  .of-sub { font-size: clamp(17px, 2vw, 20px); max-width: 560px; }
  .of-acoes { display: flex; flex-wrap: wrap; gap: 12px; }
  .of-nota { font-size: 15px; color: #5A5F50; }
  .of-faixa { background: #2A3323; color: #FBF8F1; }
  .of-faixa h2, .of-faixa h3 { color: #FBF8F1; }
  .of-faixa p { color: #D5D9C6; }
  .of-numeros { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 24px 32px; padding-top: 34px; padding-bottom: 34px; }
  .of-num { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 40px; line-height: 1; }
  .of-rot { font-size: 15px; color: #C9CDB8; margin-top: 4px; }
  .of-clara { background: #F1EBDD; }
  .of-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; }
  .of-grade--2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .of-topo { padding-top: 18px; border-top: 2px solid #23261E; }
  .of-cartao { background: #fff; border: 1px solid #DDD5C2; border-radius: 10px; padding: 24px; }
  .of-pag { margin-top: 10px; font-size: 14px; color: #5A5F50; }
  .of-bonus { border: 1.5px solid #8E9A78; border-radius: 10px; padding: 24px; }
  .of-etq { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #E9C9A8; margin-bottom: 8px; }
  .of-lead { margin: -14px 0 26px !important; max-width: 720px; }
  .of-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; text-align: left; }
  .of-lista li { display: flex; gap: 10px; }
  .of-lista svg { flex: 0 0 20px; margin-top: 3px; }
  .of-passo { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 42px; line-height: 1; color: #A94A28; margin-bottom: 8px; }
  .of-preco { max-width: 640px; margin: 0 auto; background: #fff; border: 2px solid #23261E; border-radius: 14px; padding: clamp(26px, 5vw, 46px); display: flex; flex-direction: column; gap: 20px; align-items: center; text-align: center; }
  .of-preco h2 { margin: 0; font-size: clamp(24px, 3.4vw, 32px); }
  .of-preco .of-lista { align-self: stretch; }
  .of-preco .of-botao { align-self: stretch; }
  .of-valor { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: clamp(44px, 8vw, 62px); line-height: 1; }
  .of-aviso { font-size: 15px; color: #5A5F50 !important; }
  .of-pagina details { border-top: 1px solid #CFC6B0; padding: 4px 0; }
  .of-pagina details:last-of-type { border-bottom: 1px solid #CFC6B0; }
  .of-pagina summary { cursor: pointer; min-height: 44px; padding: 12px 0; font-size: 18px; font-weight: 700; }
  .of-pagina details p { margin: 0 0 16px; }
  .of-rodape { background: #23261E; color: #C9CDB8; font-size: 14px; }
  .of-rodape a { color: #FBF8F1; }
  .of-rodape-linha { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px 32px; padding-top: 32px; padding-bottom: 32px; }
  .of-links { display: flex; flex-wrap: wrap; gap: 0 20px; }
  .of-links a { display: inline-flex; align-items: center; min-height: 44px; }
  .of-doc { max-width: 760px; margin: 0 auto; padding: clamp(32px, 6vw, 60px) clamp(20px, 5vw, 48px) 72px; }
  .of-doc h1 { font-size: clamp(30px, 5vw, 42px); margin-bottom: 6px; }
  .of-doc h2 { font-family: 'Figtree', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 0; margin: 28px 0 8px; }
  .of-doc ul { margin: 0; padding-left: 22px; color: #3D4233; }
  .of-doc li { margin-bottom: 6px; }
  .of-doc .of-data { font-size: 15px; color: #5A5F50; }
`;
