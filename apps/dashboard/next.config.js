const createNextIntlPlugin = require('next-intl/plugin');

// Points next-intl at the request-config file it needs to resolve
// locale/messages during SSR — including for 'use client' pages, which
// Next.js still server-renders first. Discovered only once this app was
// actually run and clicked through in a browser for the first time
// (src/lib/i18n.ts's getTranslator/NextIntlClientProvider-props approach
// worked for `next build`'s static generation pass but not real request
// rendering, which is what surfaced this).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a minimal self-contained server bundle (.next/standalone) —
  // used by the Dockerfile so the deployed image doesn't need to ship the
  // full node_modules tree. No effect on `next dev`.
  output: 'standalone',
  eslint: {
    // .eslintrc.json exists now, and CI runs `next lint` as its own explicit
    // step (see .github/workflows/ci.yml) — kept `true` anyway so a lint
    // warning can never silently fail the *build* step too; the two are
    // deliberately separate signals (does it compile vs. does it pass style
    // rules), not one gate.
    ignoreDuringBuilds: true,
  },
};

module.exports = withNextIntl(nextConfig);
