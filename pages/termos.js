export default function Termos() {
  return (
    <div className="container">
      <h1>Termos de Uso</h1>
      <p className="subtitle">Youvideo</p>
      <div className="card">
        <p>
          O Youvideo é uma ferramenta de uso pessoal para criação e publicação de vídeos com
          apoio de inteligência artificial, operada por Anderson Veloso para uso próprio em
          seus canais de conteúdo.
        </p>
        <p>
          Esta ferramenta não coleta, armazena ou compartilha dados de terceiros. As integrações
          com plataformas como YouTube e TikTok são usadas exclusivamente para publicar conteúdo
          na conta do próprio operador da ferramenta.
        </p>
        <p>Última atualização: {new Date().getFullYear()}.</p>
      </div>
    </div>
  );
}
