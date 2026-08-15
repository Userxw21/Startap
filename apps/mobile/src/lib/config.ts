/**
 * Expo inlines env vars prefixed EXPO_PUBLIC_ into the bundle at build time
 * (there's no server/client split like Next.js — a mobile app is all
 * "client"). Falls back to localhost:3000 for local dev against the same
 * backend the dashboard uses.
 */
export const BACKEND_API_URL = process.env.EXPO_PUBLIC_BACKEND_API_URL ?? 'http://localhost:3000/api/v1';
