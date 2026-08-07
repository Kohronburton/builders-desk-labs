import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
await client.connect();
const role = `mayne_runtime_test_${randomBytes(5).toString("hex")}`;
let proprietaryId: string | null = null;
let roleCreated = false;

try {
  const required = [
    "webhook_attempts", "customers", "orders", "scripts", "jobs", "script_segments",
    "uploaded_assets", "audit_events", "users", "operator_sessions", "schema_migrations"
  ];
  const tables = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='app'`
  );
  const found = new Set(tables.rows.map((row) => row.table_name));
  for (const table of required) {
    if (!found.has(table)) throw new Error(`Missing required table: app.${table}`);
  }

  const internal = await client.query<{ id: string }>(
    `INSERT INTO internal.proprietary_content(content_type,content)
     VALUES ('ci-boundary-probe','{"secret":"must-not-be-readable"}'::jsonb)
     RETURNING id`
  );
  proprietaryId = internal.rows[0]!.id;

  await client.query(`CREATE ROLE ${role} NOLOGIN`);
  roleCreated = true;
  const here = dirname(fileURLToPath(import.meta.url));
  const grants = (await readFile(join(here, "..", "docs", "runtime-grants.sql"), "utf8"))
    .replaceAll("PLACEHOLDER_RUNTIME_DB_ROLE", role);
  await client.query(grants);

  await client.query(`SET ROLE ${role}`);
  await client.query("SELECT count(*) FROM app.operator_job_view");

  let denied = false;
  try {
    await client.query("SELECT count(*) FROM internal.proprietary_content");
  } catch (error: unknown) {
    denied = typeof error === "object" && error !== null && "code" in error && error.code === "42501";
  }
  if (!denied) throw new Error("Runtime role was not denied proprietary schema access");
  await client.query("RESET ROLE");

  console.log("database smoke: schema present, safe view readable, proprietary boundary denied");
} finally {
  try { await client.query("RESET ROLE"); } catch {}
  if (proprietaryId) {
    try { await client.query("DELETE FROM internal.proprietary_content WHERE id=$1", [proprietaryId]); } catch {}
  }
  if (roleCreated) {
    try { await client.query(`DROP OWNED BY ${role}`); } catch {}
    try { await client.query(`DROP ROLE ${role}`); } catch {}
  }
  await client.end();
}
