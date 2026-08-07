import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Client } from "pg";

function pgEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("Restore URL must include a database name");
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

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function assertDisposableEmptyTarget(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const schemas = await client.query<{ schema_name: string }>(
      `SELECT schema_name
       FROM information_schema.schemata
       WHERE schema_name IN ('app','internal')`
    );
    const userTables = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM information_schema.tables
       WHERE table_schema NOT IN ('pg_catalog','information_schema')`
    );
    if (schemas.rowCount || Number(userTables.rows[0]!.count) > 0) {
      throw new Error("Restore refused: target database is not empty/disposable");
    }
  } finally {
    await client.end();
  }
}

const restoreUrl = process.env.RESTORE_DATABASE_URL;
const backupFile = process.env.BACKUP_FILE ? resolve(process.env.BACKUP_FILE) : null;
if (!restoreUrl || !backupFile) throw new Error("RESTORE_DATABASE_URL and BACKUP_FILE are required");
const restoreDatabase = decodeURIComponent(new URL(restoreUrl).pathname.replace(/^\//, ""));
const safeName = /(?:^|[_-])(restore|test|ci)(?:[_-]|$)/i.test(restoreDatabase);
if (!safeName && process.env.ALLOW_NON_TEST_RESTORE !== "true") {
  throw new Error(`Restore refused: database name '${restoreDatabase}' does not look disposable. Use a restore/test/ci database.`);
}

const backupBytes = await readFile(backupFile);
const checksum = createHash("sha256").update(backupBytes).digest("hex");
const checksumFile = `${backupFile}.sha256`;
try {
  const expectedText = await readFile(checksumFile, "utf8");
  const expected = expectedText.trim().split(/\s+/)[0];
  if (expected && expected !== checksum) throw new Error("Backup checksum verification failed");
} catch (error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
    throw new Error(`Missing checksum file: ${checksumFile}`);
  }
  throw error;
}

await assertDisposableEmptyTarget(restoreUrl);
await run("pg_restore", ["--no-owner", "--no-acl", "--exit-on-error", backupFile], pgEnv(restoreUrl));

const client = new Client({ connectionString: restoreUrl, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  const migrations = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM app.schema_migrations");
  const jobs = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM app.jobs");
  await client.query("SELECT 1 FROM app.operator_job_view LIMIT 1");
  await client.query("SELECT 1 FROM internal.proprietary_content LIMIT 1");
  console.log(`restore verified: ${basename(backupFile)} sha256=${checksum}`);
  console.log(`migrations=${migrations.rows[0]!.count} jobs=${jobs.rows[0]!.count}`);
} finally {
  await client.end();
}
