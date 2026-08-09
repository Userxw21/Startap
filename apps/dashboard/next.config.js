/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // No ESLint config exists in this app yet (package.json's "lint" script
    // is a placeholder for later) — without this, `next build` either tries
    // to interactively scaffold one (hangs in non-interactive CI) or fails
    // outright, depending on the Next.js version. Revisit once real lint
    // config + a dedicated CI step for it are actually set up.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
