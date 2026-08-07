BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE app.webhook_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  source_ip inet,
  key_id text,
  nonce_hash text,
  idempotency_key text,
  payload_hash text NOT NULL,
  external_order_id text,
  signature_status text NOT NULL DEFAULT 'not_checked',
  timestamp_status text NOT NULL DEFAULT 'not_checked',
  replay_status text NOT NULL DEFAULT 'not_checked',
  validation_status text NOT NULL DEFAULT 'not_checked',
  final_status text NOT NULL,
  http_response_code integer,
  failure_code text,
  failure_details jsonb,
  processing_duration_ms integer,
  safe_headers jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX webhook_attempts_received_at_idx ON app.webhook_attempts(received_at DESC);
CREATE INDEX webhook_attempts_order_idx ON app.webhook_attempts(external_order_id);

CREATE TABLE app.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_customer_id text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  email_normalized text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_email_idx ON app.customers(email_normalized);

CREATE TABLE app.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES app.customers(id),
  external_order_id text NOT NULL UNIQUE,
  payment_reference text NOT NULL UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  event_id text NOT NULL UNIQUE,
  schema_version text NOT NULL,
  currency char(3) NOT NULL,
  subtotal_amount integer NOT NULL CHECK (subtotal_amount >= 0),
  tax_amount integer NOT NULL CHECK (tax_amount >= 0),
  total_amount integer NOT NULL CHECK (total_amount >= 0),
  payment_status text NOT NULL CHECK (payment_status = 'paid'),
  paid_at timestamptz NOT NULL,
  source_payload_hash text NOT NULL,
  intake_status text NOT NULL DEFAULT 'accepted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (subtotal_amount + tax_amount = total_amount)
);

CREATE TABLE app.order_selections (
  order_id uuid PRIMARY KEY REFERENCES app.orders(id) ON DELETE CASCADE,
  package_code text NOT NULL,
  people_count integer NOT NULL CHECK (people_count > 0),
  product_branch text NOT NULL,
  template_code text NOT NULL,
  performance_style_code text NOT NULL,
  voice_option_code text NOT NULL,
  customer_notes text
);

CREATE TABLE app.order_consents (
  order_id uuid PRIMARY KEY REFERENCES app.orders(id) ON DELETE CASCADE,
  terms_accepted boolean NOT NULL CHECK (terms_accepted),
  media_processing_accepted boolean NOT NULL CHECK (media_processing_accepted),
  voice_processing_accepted boolean NOT NULL,
  accepted_at timestamptz NOT NULL,
  terms_version text NOT NULL
);

CREATE TABLE app.scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES app.orders(id) ON DELETE CASCADE,
  original_text text NOT NULL,
  normalized_text text NOT NULL,
  speaker_mode text NOT NULL,
  declared_word_count integer NOT NULL CHECK (declared_word_count >= 0),
  calculated_word_count integer NOT NULL CHECK (calculated_word_count >= 0),
  declared_segment_count integer NOT NULL CHECK (declared_segment_count > 0),
  calculated_segment_count integer NOT NULL CHECK (calculated_segment_count > 0),
  segmentation_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_job_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL UNIQUE REFERENCES app.orders(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'RECEIVED',
  priority integer NOT NULL DEFAULT 0,
  assigned_operator_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX jobs_status_created_idx ON app.jobs(status, created_at DESC);

CREATE TABLE app.script_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES app.scripts(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES app.jobs(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  speaker_code text,
  segment_text text NOT NULL,
  word_count integer NOT NULL CHECK (word_count >= 0),
  character_count integer NOT NULL CHECK (character_count >= 0),
  checksum_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'READY',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(script_id, sequence)
);

CREATE TABLE app.uploaded_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES app.orders(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES app.jobs(id) ON DELETE CASCADE,
  external_asset_id text NOT NULL,
  asset_type text NOT NULL,
  original_file_name text NOT NULL,
  declared_content_type text NOT NULL,
  detected_content_type text,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  source_url_encrypted text,
  storage_bucket text,
  storage_key text,
  checksum_sha256 text,
  ingestion_status text NOT NULL DEFAULT 'PENDING',
  sensitivity_class text NOT NULL DEFAULT 'CUSTOMER_SENSITIVE',
  retention_policy_days integer CHECK (retention_policy_days IN (30, 60, 90)),
  delete_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ingested_at timestamptz,
  deleted_at timestamptz,
  UNIQUE(order_id, external_asset_id)
);
CREATE INDEX assets_ingestion_idx ON app.uploaded_assets(ingestion_status, created_at);
CREATE INDEX assets_retention_idx ON app.uploaded_assets(delete_after) WHERE deleted_at IS NULL;

CREATE TABLE app.job_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES app.jobs(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  changed_by_type text NOT NULL,
  changed_by_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_history_job_idx ON app.job_status_history(job_id, created_at);

CREATE TABLE app.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  request_id text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_resource_idx ON app.audit_events(resource_type, resource_id, created_at);

CREATE TABLE app.catalogue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('package','template','style','voice','product_branch')),
  code text NOT NULL,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  public_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  private_mapping_ref text,
  version integer NOT NULL DEFAULT 1,
  UNIQUE(kind, code, version)
);

CREATE TABLE internal.proprietary_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES app.jobs(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  content jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE VIEW app.operator_job_view AS
SELECT
  j.id AS job_id,
  j.public_job_number,
  j.status,
  j.created_at,
  j.updated_at,
  o.external_order_id,
  o.currency,
  o.total_amount,
  o.paid_at,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  s.package_code,
  s.people_count,
  s.product_branch,
  s.template_code,
  s.performance_style_code,
  s.voice_option_code,
  s.customer_notes
FROM app.jobs j
JOIN app.orders o ON o.id = j.order_id
JOIN app.customers c ON c.id = o.customer_id
JOIN app.order_selections s ON s.order_id = o.id;

COMMENT ON SCHEMA internal IS 'Server-side proprietary content. Never expose through public or operator APIs.';
COMMENT ON VIEW app.operator_job_view IS 'Allow-listed projection for operator job lists. Contains no internal.proprietary_content.';

COMMIT;
