import type { Config } from 'tailwindcss';

/**
 * Minimal, deliberately restrained palette per the original design
 * principles (§14 of the architecture discussion): technology/precision,
 * not a "colorful startup" look. Status is never color-only anywhere in
 * this app — see StatusPill, which pairs color with an icon and label.
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f7f8',
          100: '#eeeef0',
          200: '#d8d9dd',
          300: '#b3b5bd',
          500: '#6b6e79',
          700: '#3a3d47',
          900: '#15161b',
        },
        accent: {
          500: '#2f6fed',
          600: '#2559c2',
        },
        good: '#1a8a5f',
        warn: '#b8860b',
        bad: '#c23a3a',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
