import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/** Where the Next server reaches the API. The browser only ever calls /api on this origin. */
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4200';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server for the production Docker image (NEXT_OUTPUT=standalone).
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: resolve(process.cwd(), '../..') }
    : {}),
  poweredByHeader: false,
  devIndicators: false,
  // Dev only: lets a phone on the same Wi-Fi open the app by the laptop's address.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  agentRules: false,
  experimental: {
    // Uploads pass through this server to the API; the largest is a 60 MB site video.
    proxyClientMaxBodySize: '64mb',
  },
  // The design system's web components ship as TypeScript source.
  transpilePackages: ['@oneohm/design-system'],
  async rewrites() {
    // Proxying keeps the session cookie first-party (same origin as the app).
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
