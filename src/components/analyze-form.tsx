"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AnalyzeForm({ className }: { className?: string }) {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      // Parse defensively: the server always returns JSON, but guard anyway so
      // we never surface a misleading "check your connection" for a real HTTP
      // response.
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          data?.error ??
            `Something went wrong (HTTP ${res.status}). Please try again.`,
        );
        return;
      }
      if (!data?.auditId) {
        setError("The server response was unexpected. Please try again.");
        return;
      }
      router.push(`/audit/${data.auditId}`);
    } catch {
      // Only genuine network failures land here now.
      setError("We couldn't reach the server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={cn("w-full", className)} noValidate>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-2 shadow-xl shadow-primary/5 backdrop-blur sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://yourwebsite.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            aria-label="Website URL"
            aria-invalid={!!error}
            className="h-12 border-0 bg-transparent pl-11 text-base shadow-none focus-visible:ring-0"
          />
        </div>
        <Button type="submit" size="lg" disabled={loading} className="sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Starting…
            </>
          ) : (
            <>
              Analyze Website <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 pl-1 text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="mt-2 pl-1 text-xs text-muted-foreground">
        No signup required for your first audit. We analyze public pages only.
      </p>
    </form>
  );
}
