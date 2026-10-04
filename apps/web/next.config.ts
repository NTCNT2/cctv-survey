import type { NextConfig } from 'next';
import path from 'node:path';

/**
 * Where the NestJS API listens. Server-side only (no NEXT_PUBLIC_ prefix): the
 * browser never talks to the API directly. It calls same-origin `/api/*`, and
 * Next.js forwards those requests here, so the API can stay on loopback and
 * the HttpOnly session cookie works without CORS.
 *
 * Rewrites are fixed at build time, so set this before `next build`.
 */
const apiOrigin = new URL(
  process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000',
).origin;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets the e2e script build into its own folder without touching `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Container image (infra/docker/web.Dockerfile): a self-contained server.
  // Traced from the monorepo root so packages/shared is included.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(), microphone=()',
          },
        ],
      },
      {
        // Google checks the Maps key's HTTP-referrer restriction, which needs a
        // Referer on requests to Google: send the origin only (never the path)
        // and only from the survey map. Later entries win for the same header.
        source: '/projects/:id/map',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
