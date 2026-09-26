import { useEffect, useState } from 'react';
import Head from 'next/head';

const REPO = 'andersonveloso0503-cmyk/youvideo';
const PAGINA_RELEASES = `https://github.com/${REPO}/releases`;

export default function Compilador() {
  const [release, setRelease] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    // Procura a versão mais nova do instalador publicada pelo GitHub Actions
    fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista) => {
        const r = (Array.isArray(lista) ? lista : []).find((x) => String(x.tag_name).startsWith('compilador-v'));
        const exe = r && (r.assets || []).find((a) => a.name.endsWith('.exe'));
        if (r && exe) {
          setRelease({
            versao: r.tag_name.replace('compilador-v', ''),
            url: exe.browser_download_url,
            tamanhoMb: Math.round(exe.size / 1024 / 1024),
            data: new Date(r.published_at).toLocaleDateString('pt-BR'),
          });
        }
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="container">
      <Head>
        <title>Compilador (app de PC) · Youvideo</title>
      </Head>
      <a href="/" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>← Voltar ao painel</a>
      <h1>Compilador</h1>
      <p className="subtitle">
        App de PC para montar compilações de músicas (de minutos a várias horas) com onda de áudio, fundos, legenda e
        publicação direto nos seus canais do YouTube. Gera tudo no próprio computador — sem custo por vídeo e sem limite de duração.
      </p>

      <div className="hub-tile hub-tile--gold" style={{ padding: 20 }}>
        {carregando ? (
          <div className="hub-tile-desc">Procurando a versão mais nova…</div>
        ) : release ? (
          <>
            <div className="hub-tile-title">Youvideo Compilador {release.versao} para Windows</div>
            <div className="hub-tile-desc" style={{ marginBottom: 14 }}>
              {release.tamanhoMb} MB · publicado em {release.data}
            </div>
            <a
              href={release.url}
              style={{
                display: 'inline-block', background: 'var(--terracotta)', color: '#fff', padding: '12px 22px',
                borderRadius: 10, fontWeight: 600, textDecoration: 'none',
              }}
            >
              Baixar instalador (.exe)
            </a>
          </>
        ) : (
          <>
            <div className="hub-tile-title">Instalador ainda sendo gerado</div>
            <div className="hub-tile-desc">
              O GitHub monta o instalador sozinho alguns minutos depois de cada atualização. Veja em{' '}
              <a href={PAGINA_RELEASES} style={{ color: 'var(--gold)' }}>Releases no GitHub</a>.
            </div>
          </>
        )}
      </div>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Primeira vez</h2>
      <ol style={{ lineHeight: 1.8, color: 'var(--text)', paddingLeft: 20 }}>
        <li>
          Instale o .exe. Se aparecer "O Windows protegeu o computador", clique em <b>Mais informações → Executar assim mesmo</b>.
        </li>
        <li>
          No app, abra <b>Configurações</b> e cole as mesmas chaves que estão na Vercel: <code>FAL_KEY</code> (separar voz),{' '}
          <code>GROQ_API_KEY</code> (legenda), <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code>.
        </li>
        <li>
          No Google Cloud (projeto youvideo-507511 → APIs e serviços → Credenciais → seu cliente OAuth), adicione em
          "URIs de redirecionamento autorizados": <code>http://127.0.0.1:53682/callback</code>
        </li>
        <li>
          Em <b>Contas YouTube</b>, clique em <b>Conectar canal pelo navegador</b> uma vez para cada canal (Em Nome de Jesus, Nova
          Frequência, Aqui Tem Música…).
        </li>
      </ol>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>O que ele faz</h2>
      <ul style={{ lineHeight: 1.8, color: 'var(--text-muted)', paddingLeft: 20 }}>
        <li>Junta várias músicas num vídeo longo, com transição suave e volume igualado</li>
        <li>Divide sozinho em vários vídeos pela duração máxima, ou faz um Short por música</li>
        <li>Onda de áudio em 7 estilos, com cor, tamanho, posição e opacidade</li>
        <li>Fundos com imagens (uma por música) ou vídeos em loop, granulado, vinheta e escurecer</li>
        <li>Só instrumental (tira a voz pela fal.ai, com cache — cada música é separada só uma vez)</li>
        <li>Legenda automática da letra (Groq) e nome da música na tela</li>
        <li>Fila: deixa vários vídeos gerando em sequência e publica em qualquer canal conectado, com agendamento</li>
        <li>Modo Leve para usar o PC enquanto gera; usa a placa de vídeo quando o PC tiver</li>
      </ul>
    </div>
  );
}
