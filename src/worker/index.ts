// Background worker entry point.
//
// Run with: `npm run worker`
// Consumes queued audit jobs and executes the pipeline asynchronously so the
// web tier never blocks on a full audit.

import { getQueue } from "@/lib/queue";
import { runAuditPipeline } from "@/lib/engine/pipeline";
import { env, validateEnv } from "@/lib/env";

async function main() {
  const problems = validateEnv();
  if (problems.length) {
    for (const p of problems) console.warn(`[worker] config warning: ${p}`);
    // DATABASE_URL is fatal — nothing works without it.
    if (!env.databaseUrl) {
      console.error("[worker] DATABASE_URL is required. Exiting.");
      process.exit(1);
    }
  }

  const queue = getQueue();
  console.log("[worker] WebsiteX-Ray worker started. Waiting for audit jobs…");

  queue.process(async (job) => {
    console.log(`[worker] processing audit ${job.auditId} (${job.url})`);
    await runAuditPipeline(job.auditId);
    console.log(`[worker] finished audit ${job.auditId}`);
  });
}

main().catch((err) => {
  console.error("[worker] fatal error", err);
  process.exit(1);
});
