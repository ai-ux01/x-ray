// Generates a SQLite dev schema from the canonical PostgreSQL schema.
// This keeps `prisma/schema.prisma` as the single production source of truth
// while enabling zero-install local development on SQLite.
//
// Usage: node scripts/gen-sqlite-schema.mjs   (run via `npm run db:dev:sync`)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "prisma", "schema.prisma");
const out = path.join(root, "prisma", "schema.sqlite.prisma");

const content = readFileSync(src, "utf8").replace(
  /provider\s*=\s*"postgresql"/,
  'provider = "sqlite"',
);

const banner =
  "// AUTO-GENERATED from schema.prisma for local SQLite development.\n" +
  "// Do not edit by hand. Run `npm run db:dev:sync` to regenerate.\n\n";

writeFileSync(out, banner + content);
console.log("Generated prisma/schema.sqlite.prisma (SQLite dev schema).");
