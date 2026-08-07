import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function pgEnv(databaseUrl: string): NodeJS.ProcessEnv {
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

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}`)));
  });
}

const databaseUrl = process.env.BACKUP_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("BACKUP_DATABASE_URL or DATABASE_URL is required");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve(process.env.BACKUP_FILE ?? `backups/paid-orders-${stamp}.dump`);
await mkdir(dirname(output), { recursive: true });
await run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", output], pgEnv(databaseUrl));

const bytes = await readFile(output);
const checksum = createHash("sha256").update(bytes).digest("hex");
await writeFile(`${output}.sha256`, `${checksum}  ${output.split(/[\\/]/).pop()}\n`, "utf8");
console.log(`backup created: ${output}`);
console.log(`sha256: ${checksum}`);
