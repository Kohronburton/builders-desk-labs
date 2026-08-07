import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });

const external = [
  "@aws-sdk/*",
  "@fastify/*",
  "fastify",
  "file-type",
  "ioredis",
  "pg",
  "zod"
];

await build({
  entryPoints: {
    server: "src/server.ts",
    worker: "src/worker.ts"
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "bundle",
  external,
  sourcemap: true,
  minify: false,
  legalComments: "none",
  logLevel: "info"
});
