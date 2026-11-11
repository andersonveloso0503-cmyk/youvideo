/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // necessário no Next 14 para rodar o instrumentation.js (desvio "Tudo na fal")
    instrumentationHook: true,
    // mupdf (desenha a 1ª página do PDF dos documentos de política): fica fora do pacote do webpack (é ESM + WASM)
    serverComponentsExternalPackages: ['mupdf', '@resvg/resvg-js'],
    outputFileTracingIncludes: {
      '/api/fila-processar': ['./node_modules/mupdf/**/*', './lib/fontes/**/*', './node_modules/@resvg/**/*'],
      '/api/central/fabrica': ['./lib/fontes/**/*', './node_modules/@resvg/**/*'],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) config.externals = [...(config.externals || []), { mupdf: 'import mupdf', '@resvg/resvg-js': 'commonjs @resvg/resvg-js' }];
    return config;
  },
};

module.exports = nextConfig;
