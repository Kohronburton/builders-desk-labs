import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

function databaseEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("Database URL must include a database name");
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
    ...(url.searchParams.get("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode")! } : {})
  };
}

function withDatabase(databaseUrl: string, database: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.toString();
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe generated database identifier");
  return `"${value}"`;
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function counts(databaseUrl: string): Promise<Record<string, number>> {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const result = await client.query<{ name: string; count: string }>(`
      SELECT 'orders' AS name, count(*)::text AS count FROM app.orders
      UNION ALL SELECT 'jobs', count(*)::text FROM app.jobs
      UNION ALL SELECT 'segments', count(*)::text FROM app.script_segments
      UNION ALL SELECT 'assets', count(*)::text FROM app.uploaded_assets
      UNION ALL SELECT 'audits', count(*)::text FROM app.audit_events
      UNION ALL SELECT 'migrations', count(*)::text FROM app.schema_migrations
    `);
    return Object.fromEntries(result.rows.map((row) => [row.name, Number(row.count)]));
  } finally {
    await client.end();
  }
}

async function verifyProprietaryBoundary(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  const role = `mayne_recovery_runtime_${randomBytes(4).toString("hex")}`;
  try {
    await client.query(`CREATE ROLE ${quoteIdentifier(role)} NOLOGIN`);
    await client.query(`GRANT USAGE ON SCHEMA app TO ${quoteIdentifier(role)}`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA app TO ${quoteIdentifier(role)}`);
    await client.query(`REVOKE ALL ON SCHEMA internal FROM ${quoteIdentifier(role)}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA internal FROM ${quoteIdentifier(role)}`);
    await client.query(`SET ROLE ${quoteIdentifier(role)}`);
    await client.query("SELECT count(*) FROM app.operator_job_view");
    let denied = false;
    try {
      await client.query("SELECT count(*) FROM internal.proprietary_content");
    } catch (error: unknown) {
      denied = typeof error === "object" && error !== null && "code" in error && error.code === "42501";
    }
    if (!denied) throw new Error("Recovered runtime role was not denied proprietary data");
    await client.query("RESET ROLE");
  } finally {
    try { await client.query("RESET ROLE"); } catch {}
    try { await client.query(`DROP OWNED BY ${quoteIdentifier(role)}`); } catch {}
    try { await client.query(`DROP ROLE ${quoteIdentifier(role)}`); } catch {}
    await client.end();
  }
}

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required");
if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_RECOVERY_SMOKE !== "true") {
  throw new Error("Recovery smoke refuses NODE_ENV=production without explicit override");
}

const source = new URL(sourceUrl);
const sourceDb = decodeURIComponent(source.pathname.replace(/^\//, ""));
if (!sourceDb) throw new Error("DATABASE_URL must include a database name");
const adminUrl = process.env.RECOVERY_ADMIN_URL ?? withDatabase(sourceUrl, "postgres");
const targetDb = `mayne_recovery_ci_${randomBytes(6).toString("hex")}`;
const targetUrl = withDatabase(sourceUrl, targetDb);
const working = await mkdtemp(join(tmpdir(), "mayne-recovery-"));
const dumpFile = join(working, "app-internal.dump");
const checksumFile = `${dumpFile}.sha256`;

const admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
await admin.connect();
let targetCreated = false;

try {
  const sourceCounts = await counts(sourceUrl);

  await run("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--schema=app",
    "--schema=internal",
    "--file", dumpFile
  ], databaseEnv(sourceUrl));

  const dumpBytes = await readFile(dumpFile);
  if (dumpBytes.byteLength === 0) throw new Error("Recovery dump is empty");
  const checksum = createHash("sha256").update(dumpBytes).digest("hex");
  await writeFile(checksumFile, `${checksum}\n`, "utf8");
  const verified = createHash("sha256").update(await readFile(dumpFile)).digest("hex");
  if (verified !== (await readFile(checksumFile, "utf8")).trim()) throw new Error("Recovery dump checksum mismatch");

  await admin.query(`CREATE DATABASE ${quoteIdentifier(targetDb)} TEMPLATE template0`);
  targetCreated = true;

  await run("pg_restore", [
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    dumpFile
  ], databaseEnv(targetUrl));

  const restoredCounts = await counts(targetUrl);
  for (const [name, count] of Object.entries(sourceCounts)) {
    if (restoredCounts[name] !== count) {
      throw new Error(`Recovery count mismatch for ${name}: source=${count} restored=${restoredCounts[name]}`);
    }
  }

  const target = new Client({ connectionString: targetUrl, connectionTimeoutMillis: 5000 });
  await target.connect();
  try {
    await target.query("SELECT 1 FROM app.operator_job_view LIMIT 1");
    await target.query("SELECT 1 FROM internal.proprietary_content LIMIT 1");
  } finally {
    await target.end();
  }

  await verifyProprietaryBoundary(targetUrl);
  console.log(JSON.stringify({
    recovery: "passed",
    sourceDatabase: sourceDb,
    restoredDatabase: targetDb,
    schemas: ["app", "internal"],
    checksumSha256: checksum,
    counts: sourceCounts,
    proprietaryBoundary: "denied-to-runtime-role"
  }, null, 2));
} finally {
  if (targetCreated) {
    try {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()`,
        [targetDb]
      );
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(targetDb)}`);
    } catch (error) {
      console.error("recovery cleanup warning", error instanceof Error ? error.message : "unknown error");
    }
  }
  await admin.end();
  await rm(working, { recursive: true, force: true });
}
