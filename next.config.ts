import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // The dev-tools badge (bottom left, development only) added an invisible 46px block under every page, so
  // pages scrolled a little further than their content. Errors still show in the dev overlay.
  devIndicators: false,
  experimental: { authInterrupts: true }, // forbidden() → real 403 pages
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
};
export default config;
