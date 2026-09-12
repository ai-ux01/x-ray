// Production start wrapper.
//
// 1. If DATABASE_URL is present, run `prisma db push` to ensure the schema
//    exists (idempotent). This lets a fresh managed database get its tables
//    without any shell access.
// 2. Always start the Next.js server afterward — even if the schema push
//    fails — so the container stays up and /api/health can report the exact
//    problem instead of crash-looping the whole service.

import { spawnSync, spawn } from "node:child_process";

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: "inherit" });
}

if (!process.env.DATABASE_URL) {
  console.error(
    "[start] DATABASE_URL is not set. Skipping schema push. The app will start " +
      "but the database is unavailable — set DATABASE_URL on the service. " +
      "Check /api/health for status.",
  );
} else {
  console.log("[start] Ensuring database schema (prisma db push)…");
  const res = run("npx", [
    "prisma",
    "db",
    "push",
    "--schema",
    "prisma/schema.prisma",
    "--skip-generate",
    "--accept-data-loss",
  ]);
  if (res.status !== 0) {
    console.error(
      "[start] prisma db push failed. Starting the server anyway so /api/health " +
        "can report the issue.",
    );
  } else {
    console.log("[start] Schema is in sync.");
  }
}

console.log("[start] Starting Next.js server…");
const server = spawn("npx", ["next", "start"], { stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));
