BEGIN;

ALTER TABLE app.uploaded_assets
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN last_error_code text,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN lease_until timestamptz,
  ADD COLUMN worker_id text;

CREATE INDEX assets_worker_claim_idx
  ON app.uploaded_assets(ingestion_status, next_attempt_at, created_at)
  WHERE deleted_at IS NULL;

COMMIT;
