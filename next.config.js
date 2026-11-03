/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // necessário no Next 14 para rodar o instrumentation.js (desvio "Tudo na fal")
    instrumentationHook: true,
    // mupdf (desenha a 1ª página do PDF dos documentos de política): fica fora do pacote do webpack (é ESM + WASM)
    serverComponentsExternalPackages: ['mupdf'],
    outputFileTracingIncludes: { '/api/fila-processar': ['./node_modules/mupdf/**/*'] },
  },
  webpack: (config, { isServer }) => {
    if (isServer) config.externals = [...(config.externals || []), { mupdf: 'import mupdf' }];
    return config;
  },
};

module.exports = nextConfig;
