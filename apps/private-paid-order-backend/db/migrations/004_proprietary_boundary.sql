BEGIN;

-- Defense in depth: no implicit/public access to proprietary server-side data.
REVOKE ALL ON SCHEMA internal FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA internal FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA internal FROM PUBLIC;

-- Future proprietary tables/sequences created by this migration owner inherit the same default deny.
ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA internal REVOKE ALL ON SEQUENCES FROM PUBLIC;

COMMENT ON SCHEMA internal IS 'Default-deny proprietary server-side data. Production runtime DB credentials must not own this schema or receive USAGE on it.';

COMMIT;
