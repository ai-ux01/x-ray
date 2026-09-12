"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { STAGE_STEPS, stepState } from "@/lib/audit/stages";
import { cn } from "@/lib/utils";

interface AuditStatus {
  id: string;
  url: string;
  status: string;
  stage: string;
  progress: number;
  overallScore: number | null;
  errorMessage: string | null;
}

export function LiveProgress({ initial }: { initial: AuditStatus }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<AuditStatus>(initial);

  React.useEffect(() => {
    if (status.status === "COMPLETED" || status.status === "FAILED") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/audits/${status.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as AuditStatus;
        setStatus(next);
        if (next.status === "COMPLETED") {
          clearInterval(interval);
          router.push(`/audit/${next.id}/report`);
        }
      } catch {
        // Transient network error — keep polling.
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [status.id, status.status, router]);

  if (status.status === "FAILED") {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 size-10 text-poor" />
        <h2 className="text-xl font-semibold">We couldn&apos;t finish this analysis</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {status.errorMessage ??
            "Something went wrong while analyzing this website. Please try again."}
        </p>
        <Button className="mt-6" onClick={() => router.push("/")}>
          Try another website
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-xl p-8">
      <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Analyzing website…
      </div>
      <p className="mb-6 truncate font-mono text-sm">{status.url}</p>

      <Progress value={status.progress} className="mb-8" />

      <ul className="space-y-3">
        {STAGE_STEPS.map((step) => {
          const state = stepState(step.stage, status.stage, status.status);
          return (
            <li key={step.stage} className="flex items-center gap-3 text-sm">
              {state === "done" ? (
                <CheckCircle2 className="size-5 text-excellent" />
              ) : state === "active" ? (
                <Loader2 className="size-5 animate-spin text-primary" />
              ) : (
                <Circle className="size-5 text-muted-foreground/40" />
              )}
              <span
                className={cn(
                  state === "pending" && "text-muted-foreground/60",
                  state === "active" && "font-medium",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        You can safely leave this page — your report will be here when you return.
      </p>
    </Card>
  );
}
