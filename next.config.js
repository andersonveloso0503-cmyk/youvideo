/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // necessário no Next 14 para rodar o instrumentation.js (desvio "Tudo na fal")
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
