import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const allowedMaturity = new Set([
  "concept",
  "prototype",
  "demo",
  "production-candidate",
  "production-ready",
  "archived"
]);

const appsDir = new URL("../apps/", import.meta.url);
const appNames = await readdir(appsDir);
const failures = [];
let checked = 0;

for (const appName of appNames) {
  const manifestPath = join(appsDir.pathname, appName, "module.manifest.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    checked += 1;
    for (const key of ["id", "name", "version", "maturity", "description"]) {
      if (typeof manifest[key] !== "string" || manifest[key].trim() === "") failures.push(`${appName}: invalid ${key}`);
    }
    for (const key of ["capabilities", "foundation", "owns"]) {
      if (!Array.isArray(manifest[key]) || manifest[key].some((value) => typeof value !== "string" || value.trim() === "")) {
        failures.push(`${appName}: invalid ${key}`);
      }
    }
    if (!allowedMaturity.has(manifest.maturity)) failures.push(`${appName}: unsupported maturity ${manifest.maturity}`);
    if (manifest.maturity === "production-ready" && JSON.stringify(manifest).includes("PLACEHOLDER")) {
      failures.push(`${appName}: production-ready manifest contains PLACEHOLDER`);
    }
  } catch (error) {
    failures.push(`${appName}: missing or unreadable module.manifest.json (${error.message})`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Validated ${checked} Mayne module manifest(s).`);
