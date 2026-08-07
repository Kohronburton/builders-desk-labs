import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
await client.connect();

try {
  await client.query("CREATE SCHEMA IF NOT EXISTS app");
  await client.query(`CREATE TABLE IF NOT EXISTS app.schema_migrations (
    version text PRIMARY KEY,
    checksum_sha256 text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationDir = join(here, "..", "db", "migrations");
  const files = (await readdir(migrationDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();

  for (const file of files) {
    const raw = await readFile(join(migrationDir, file), "utf8");
    const checksum = createHash("sha256").update(raw).digest("hex");
    const existing = await client.query<{ checksum_sha256: string }>("SELECT checksum_sha256 FROM app.schema_migrations WHERE version=$1", [file]);
    if (existing.rowCount) {
      if (existing.rows[0]!.checksum_sha256 !== checksum) throw new Error(`Applied migration changed on disk: ${file}`);
      console.log(`skip ${file}`);
      continue;
    }

    const sql = raw.replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO app.schema_migrations(version,checksum_sha256) VALUES ($1,$2)", [file, checksum]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
