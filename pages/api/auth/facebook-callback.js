export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código de autorização ausente');

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  try {
    // 1) Troca o code por um token de usuário de curta duração.
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&client_secret=${appSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error?.message || 'Erro ao trocar o código pelo token');

    // 2) Troca por um token de usuário de longa duração (~60 dias).
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    );
    const longData = await longRes.json();
    if (!longRes.ok) throw new Error(longData.error?.message || 'Erro ao gerar o token de longa duração');

    // 3) Lista as Páginas que esse usuário administra — cada uma já vem com
    // seu próprio Page Access Token, que NÃO expira enquanto o usuário
    // continuar sendo admin da Página (mesmo o token de usuário expirando).
    const paginasRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longData.access_token}`
    );
    const paginasData = await paginasRes.json();
    if (!paginasRes.ok) throw new Error(paginasData.error?.message || 'Erro ao listar as Páginas');

    if (!paginasData.data || !paginasData.data.length) {
      return res.send(`
        <div style="font-family: sans-serif; padding: 40px; background:#0f1115; color:#eaeaea;">
          <h2>Nenhuma Página encontrada ⚠️</h2>
          <p>Sua conta não administra nenhuma Página do Facebook, ou a permissão não foi concedida. Confirme que você é admin da Página "Em Nome de Jesus" e tente de novo.</p>
        </div>
      `);
    }

    // 4) Pra cada Página, busca a conta do Instagram vinculada (se tiver).
    const paginasComInstagram = await Promise.all(
      paginasData.data.map(async (pagina) => {
        try {
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${pagina.id}?fields=instagram_business_account&access_token=${pagina.access_token}`
          );
          const igData = await igRes.json();
          return { ...pagina, instagramId: igData.instagram_business_account?.id || null };
        } catch {
          return { ...pagina, instagramId: null };
        }
      })
    );

    const linhas = paginasComInstagram
      .map(
        (p) => `
        <div style="border:1px solid #333; border-radius:8px; padding:16px; margin-bottom:16px;">
          <h3 style="margin:0 0 8px;">${p.name}</h3>
          <p><b>Permissões concedidas para essa Página:</b> ${(p.tasks || []).join(', ') || '(não informado)'}</p>
          <p><b>FACEBOOK_PAGE_ID</b></p>
          <textarea style="width:100%; height:36px;">${p.id}</textarea>
          <p><b>FACEBOOK_PAGE_ACCESS_TOKEN</b></p>
          <textarea style="width:100%; height:60px;">${p.access_token}</textarea>
          <p><b>INSTAGRAM_BUSINESS_ACCOUNT_ID</b></p>
          <textarea style="width:100%; height:36px;">${p.instagramId || '(nenhuma conta do Instagram vinculada a essa Página)'}</textarea>
        </div>`
      )
      .join('');

    res.send(`
      <div style="font-family: sans-serif; padding: 40px; background:#0f1115; color:#eaeaea;">
        <h2>Autorização concluída ✅</h2>
        <p>Copie os 3 valores da Página certa ("Em Nome de Jesus", ou a que for) e salve no Vercel com os nomes indicados.</p>
        <p>Confira se "Permissões concedidas" inclui algo como <b>CREATE_CONTENT</b> ou <b>MANAGE</b> — se não incluir, o Facebook não deixou essa autorização gerenciar posts/vídeos dessa Página.</p>
        ${linhas}
      </div>
    `);
  } catch (err) {
    res.status(500).send('Erro: ' + err.message);
  }
}
