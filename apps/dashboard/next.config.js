/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // .eslintrc.json exists now, and CI runs `next lint` as its own explicit
    // step (see .github/workflows/ci.yml) — kept `true` anyway so a lint
    // warning can never silently fail the *build* step too; the two are
    // deliberately separate signals (does it compile vs. does it pass style
    // rules), not one gate.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
