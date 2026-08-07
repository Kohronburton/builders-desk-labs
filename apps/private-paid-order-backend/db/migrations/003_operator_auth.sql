BEGIN;

CREATE TABLE app.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','OPERATOR')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.operator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  csrf_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operator_sessions_user_idx ON app.operator_sessions(user_id, expires_at DESC);
CREATE INDEX operator_sessions_expiry_idx ON app.operator_sessions(expires_at) WHERE revoked_at IS NULL;

CREATE OR REPLACE VIEW app.operator_job_view AS
SELECT
  j.id AS job_id,
  j.public_job_number,
  j.status,
  j.priority,
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
  sel.package_code,
  sel.people_count,
  sel.product_branch,
  sel.template_code,
  sel.performance_style_code,
  sel.voice_option_code,
  sel.customer_notes,
  sc.original_text AS script_text,
  sc.declared_word_count,
  sc.calculated_word_count,
  sc.declared_segment_count,
  sc.calculated_segment_count,
  sc.segmentation_version
FROM app.jobs j
JOIN app.orders o ON o.id = j.order_id
JOIN app.customers c ON c.id = o.customer_id
JOIN app.order_selections sel ON sel.order_id = o.id
JOIN app.scripts sc ON sc.order_id = o.id;

COMMENT ON VIEW app.operator_job_view IS 'Explicit operator allow-list. Never join internal.proprietary_content or secret-bearing tables.';

COMMIT;
