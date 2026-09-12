import { Link2, ScanSearch, BrainCircuit, ListChecks } from "lucide-react";

const STEPS = [
  {
    icon: Link2,
    title: "Enter your URL",
    body: "Paste any public website address. No signup needed for your first audit.",
  },
  {
    icon: ScanSearch,
    title: "WebsiteX-Ray crawls the site",
    body: "We render the page in a real browser, capture screenshots, and extract structured data.",
  },
  {
    icon: BrainCircuit,
    title: "AI analyzes the results",
    body: "Measured metrics are interpreted by AI — never fabricated. Evidence is always shown.",
  },
  {
    icon: ListChecks,
    title: "Get your score & priorities",
    body: "A clear health score plus a prioritized, actionable improvement plan.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-border/60 bg-secondary/30">
      <div className="container py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mt-3 text-muted-foreground">
            From URL to actionable report in a few minutes.
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <step.icon className="size-5" />
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
