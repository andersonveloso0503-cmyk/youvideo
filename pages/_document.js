import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        <meta
          name="tiktok-developers-site-verification"
          content="UT74xCdNdBJiPXf0bQ5vBYL4BmClQnsj"
        />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Youvideo" />
        <meta name="theme-color" content="#0f1115" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
