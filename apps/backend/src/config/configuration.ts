export default () => ({
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  // Comma-separated allowed origins (e.g. "https://app.example.com"). No
  // default — see main.ts, which refuses to boot in production without this
  // set explicitly rather than silently falling back to wide-open CORS.
  corsOrigins: process.env.CORS_ORIGIN?.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME,
    // Owner credentials — DDL rights, bypasses RLS. Only data-source.ts (the
    // migration CLI) should ever use these; runtime app code uses appUsername.
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    // Restricted role the running app actually connects as — see docker/init-db.sql
    // and the note in EnableRowLevelSecurity migration on why this split exists.
    appUsername: process.env.DB_APP_USERNAME,
    appPassword: process.env.DB_APP_PASSWORD,
    // Most managed Postgres providers (Render, Railway, Supabase, Neon, RDS)
    // require TLS and reject a plain connection outright. rejectUnauthorized
    // is false because these providers commonly present certs not chained to
    // a CA Node trusts by default — acceptable since the connection is still
    // encrypted, just not verifying the server's cert chain.
    ssl: process.env.DB_SSL === 'true',
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  i18n: {
    defaultLocale: process.env.DEFAULT_LOCALE ?? 'uz',
  },
});
