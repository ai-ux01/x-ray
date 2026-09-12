import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AnalyzeForm } from "@/components/analyze-form";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section id="analyze" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="pointer-events-none absolute inset-0 bg-grid" />

      <div className="container relative flex flex-col items-center py-24 text-center md:py-32">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur animate-in">
          <Sparkles className="size-3.5 text-primary" />
          AI-powered website intelligence
        </div>

        <h1 className="max-w-4xl text-balance text-4xl font-bold tracking-tight animate-in sm:text-5xl md:text-6xl">
          Know Exactly What&apos;s{" "}
          <span className="text-gradient">Holding Your Website Back.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground animate-in">
          AI-powered website auditing for performance, UX, SEO, accessibility,
          conversion and technical quality.
        </p>

        <div className="mt-10 w-full max-w-2xl animate-in">
          <AnalyzeForm />
        </div>

        <div className="mt-4 flex items-center gap-3 animate-in">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sample-report">View Sample Report</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
