export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return new Response('Parâmetro url é obrigatório', { status: 400 });

  const videoRes = await fetch(url);
  if (!videoRes.ok || !videoRes.body) {
    return new Response('Não foi possível baixar o vídeo original', { status: 500 });
  }

  return new Response(videoRes.body, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': 'attachment; filename="youvideo.mp4"',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
