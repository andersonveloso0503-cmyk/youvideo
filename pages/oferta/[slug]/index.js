// Página de vendas pública de uma oferta do Radar de Ofertas.
import OfertaPagina from '../../../components/OfertaPagina';
import { ofertaPublica } from '../../../lib/ofertasPublica';

export async function getServerSideProps({ params, res }) {
  const achada = await ofertaPublica(params.slug);
  if (!achada) return { notFound: true };
  if (!achada.previa) res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  return { props: { ...achada, base: `/oferta/${params.slug}` } };
}

export default function Oferta({ oferta, previa, base }) {
  return <OfertaPagina oferta={oferta} previa={previa} base={base} />;
}
