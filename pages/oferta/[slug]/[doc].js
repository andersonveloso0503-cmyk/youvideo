// Termos de uso e política de privacidade de uma oferta do Radar de Ofertas.
import Head from 'next/head';
import { estilo } from '../../../components/OfertaPagina';
import { ofertaPublica } from '../../../lib/ofertasPublica';
import { textoTermos, textoPrivacidade } from '../../../lib/ofertas';

const DOCS = { termos: ['Termos de uso', textoTermos], privacidade: ['Política de privacidade', textoPrivacidade] };

export async function getServerSideProps({ params }) {
  if (!DOCS[params.doc]) return { notFound: true };
  const achada = await ofertaPublica(params.slug);
  if (!achada) return { notFound: true };
  const [titulo, montar] = DOCS[params.doc];
  const data = achada.oferta.atualizadoEm ? new Date(achada.oferta.atualizadoEm).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : '';
  return { props: { titulo, secoes: montar(achada.oferta.produto), produto: achada.oferta.produto.titulo, data, base: `/oferta/${params.slug}`, outro: params.doc === 'termos' ? 'privacidade' : 'termos' } };
}

export default function Documento({ titulo, secoes, produto, data, base, outro }) {
  return (
    <div className="of-pagina" style={{ minHeight: '100vh' }}>
      <Head>
        <title>{`${titulo} · ${produto}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <header className="of-cab"><div className="of-miolo of-cab-linha"><a href={base} className="of-marca" style={{ textDecoration: 'none' }}>{produto}</a><a href={base}>Voltar à página do produto</a></div></header>
      <main className="of-doc">
        <h1>{titulo}</h1>
        <div className="of-data">{produto}{data ? ` · Última atualização: ${data}` : ''}</div>
        {secoes.map((s, i) => (
          <section key={s.titulo}>
            <h2>{i + 1}. {s.titulo}</h2>
            {s.linhas.length === 1 ? <p>{s.linhas[0]}</p> : <ul>{s.linhas.map((l) => <li key={l}>{l}</li>)}</ul>}
          </section>
        ))}
        <p style={{ marginTop: 32, fontSize: 15 }}>Veja também {outro === 'termos' ? 'os ' : 'a '}<a href={`${base}/${outro}`}>{outro === 'termos' ? 'termos de uso' : 'política de privacidade'}</a>.</p>
      </main>
      <style jsx global>{estilo}</style>
    </div>
  );
}
