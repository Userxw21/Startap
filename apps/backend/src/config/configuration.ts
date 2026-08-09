export default () => ({
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
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
