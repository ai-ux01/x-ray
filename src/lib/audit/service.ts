// Audit creation service (Phase 1).
//
// Validates the URL, upserts the Website, creates a QUEUED Audit, and enqueues
// the background job. The pipeline itself is implemented in later phases; the
// contract here (async, job-based) is stable.

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getQueue } from "@/lib/queue";
import { validateUrlSyntax } from "@/lib/security/url-guard";
import { runAuditPipeline } from "@/lib/engine/pipeline";

// In dev without Redis, there is no separate worker process. Register an
// in-process consumer once so audits actually run. With Redis, run
// `npm run worker` instead (and this block is skipped).
let processorRegistered = false;
function ensureInProcessWorker() {
  if (env.redisUrl || processorRegistered) return;
  processorRegistered = true;
  getQueue().process(async (job) => {
    await runAuditPipeline(job.auditId);
  });
}

export interface CreateAuditInput {
  url: string;
  userId?: string;
}

export interface CreateAuditResult {
  ok: boolean;
  auditId?: string;
  error?: string;
}

export async function createAudit(input: CreateAuditInput): Promise<CreateAuditResult> {
  const validation = validateUrlSyntax(input.url);
  if (!validation.ok || !validation.url) {
    return { ok: false, error: validation.error ?? "Invalid URL." };
  }

  const url = validation.normalized!;
  const host = validation.url.hostname.toLowerCase();

  const website = await prisma.website.create({
    data: { url, host, userId: input.userId ?? null },
  });

  const audit = await prisma.audit.create({
    data: {
      url,
      websiteId: website.id,
      userId: input.userId ?? null,
      status: "QUEUED",
      stage: "CREATED",
      progress: 0,
    },
  });

  ensureInProcessWorker();
  await getQueue().enqueue({ auditId: audit.id, url });

  return { ok: true, auditId: audit.id };
}

export interface AuditListItem {
  id: string;
  url: string;
  host: string;
  status: string;
  stage: string;
  progress: number;
  overallScore: number | null;
  issueCount: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AuditListStats {
  total: number;
  completed: number;
  running: number;
  failed: number;
  averageScore: number | null;
}

export interface AuditListResult {
  audits: AuditListItem[];
  stats: AuditListStats;
}

/**
 * Lists recent audits for the dashboard. Anonymous audits (no auth yet) are
 * included; when auth lands this can filter by userId. Bounded to keep the
 * dashboard fast.
 */
export async function listAudits(limit = 50): Promise<AuditListResult> {
  const audits = await prisma.audit.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      website: { select: { host: true } },
      _count: { select: { issues: true } },
    },
  });

  const items: AuditListItem[] = audits.map((a) => ({
    id: a.id,
    url: a.url,
    host: a.website?.host ?? new URL(a.url).hostname,
    status: a.status,
    stage: a.stage,
    progress: a.progress,
    overallScore: a.overallScore,
    issueCount: a._count.issues,
    createdAt: a.createdAt,
    completedAt: a.completedAt,
  }));

  const completed = items.filter((a) => a.status === "COMPLETED");
  const scored = completed.filter((a) => a.overallScore != null);
  const averageScore = scored.length
    ? Math.round(
        scored.reduce((sum, a) => sum + (a.overallScore ?? 0), 0) / scored.length,
      )
    : null;

  return {
    audits: items,
    stats: {
      total: items.length,
      completed: completed.length,
      running: items.filter((a) => a.status === "RUNNING" || a.status === "QUEUED").length,
      failed: items.filter((a) => a.status === "FAILED").length,
      averageScore,
    },
  };
}

export async function getAuditStatus(auditId: string) {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: { website: true },
  });
  if (!audit) return null;
  return {
    id: audit.id,
    url: audit.url,
    status: audit.status,
    stage: audit.stage,
    progress: audit.progress,
    overallScore: audit.overallScore,
    errorMessage: audit.errorMessage,
    createdAt: audit.createdAt,
    completedAt: audit.completedAt,
  };
}
