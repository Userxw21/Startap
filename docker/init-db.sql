-- Runs once, automatically, the first time the courier_postgres container's
-- data volume is created (standard postgres image behavior for anything
-- mounted into /docker-entrypoint-initdb.d/).
--
-- Why this exists: Row-Level Security policies (see the backend's
-- EnableRowLevelSecurity migration) are silently bypassed by Postgres
-- superusers and by the owner of the table. The POSTGRES_USER configured
-- in docker-compose.yml ("courier") is the cluster bootstrap role, which
-- Postgres always creates as a superuser — so if the application connected
-- as "courier", every RLS policy in this system would be a no-op. This
-- script creates a second, ordinary (non-superuser, non-owner) role that
-- the *running application* connects as. Migrations still run as "courier"
-- (it needs DDL rights); only the app's request-serving connection uses
-- the restricted role, which is what actually makes RLS enforce anything.
--
-- Dev-only plaintext password, consistent with the existing dev password
-- for the "courier" role in docker-compose.yml. Production uses a real
-- secret manager (see original architecture §10) — never this value.
CREATE ROLE courier_app WITH LOGIN PASSWORD 'courier_app_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT CONNECT ON DATABASE courier_platform TO courier_app;
GRANT USAGE ON SCHEMA public TO courier_app;

-- Applies automatically to every table the migration runner ("courier")
-- creates from now on, so a new migration never needs a matching GRANT.
ALTER DEFAULT PRIVILEGES FOR ROLE courier IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO courier_app;

ALTER DEFAULT PRIVILEGES FOR ROLE courier IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO courier_app;
