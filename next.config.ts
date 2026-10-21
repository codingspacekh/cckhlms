import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // The dev-tools badge (bottom left, development only) added an invisible 46px block under every page, so
  // pages scrolled a little further than their content. Errors still show in the dev overlay.
  devIndicators: false,
  experimental: { authInterrupts: true }, // forbidden() → real 403 pages
  // The certificate PDF reads its fonts from disk (src/modules/certificates/template.tsx).
  outputFileTracingIncludes: {
    '/api/certificates/*': [
      './node_modules/@fontsource/noto-sans/files/noto-sans-{latin,latin-ext,vietnamese}-{400,700}-normal.woff',
      './node_modules/@fontsource/noto-sans-khmer/files/noto-sans-khmer-khmer-{400,700}-normal.woff',
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          // M7 (ZAP baseline): a window this site opens, or that opens it, can't reach it, and other sites can't load
          // its responses. (No COEP: the LMS needs no cross-origin isolation, and the preview frame is another site.)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};
export default config;
