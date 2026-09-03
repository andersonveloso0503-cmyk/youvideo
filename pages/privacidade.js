export default function Privacidade() {
  return (
    <div className="container">
      <h1>Política de Privacidade</h1>
      <p className="subtitle">Youvideo</p>
      <div className="card">
        <p>
          O Youvideo é uma ferramenta de uso pessoal, operada por Anderson Veloso, para criação
          e publicação de vídeos com apoio de inteligência artificial em seus próprios canais.
        </p>
        <p>
          Esta ferramenta não coleta dados de visitantes ou de terceiros. Os únicos dados
          processados são o conteúdo do próprio operador (roteiros, áudios e vídeos gerados) e
          as credenciais de autorização das plataformas conectadas (YouTube, TikTok), usadas
          apenas para publicar conteúdo na conta do próprio operador.
        </p>
        <p>
          Nenhum dado é vendido, compartilhado ou usado para fins de publicidade.
        </p>
        <p>Última atualização: {new Date().getFullYear()}.</p>
      </div>
    </div>
  );
}
