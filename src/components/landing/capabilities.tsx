import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/scoring";
import { Icon } from "@/components/icon";
import { Card } from "@/components/ui/card";

const TRUST_ITEMS = [
  "Performance",
  "SEO",
  "Accessibility",
  "UX",
  "Conversion",
  "AI Analysis",
];

export function Capabilities() {
  return (
    <section id="capabilities" className="container py-20">
      <div className="mb-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-muted-foreground">
        {TRUST_ITEMS.map((t) => (
          <span key={t} className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" /> {t}
          </span>
        ))}
      </div>

      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          One report. Fourteen dimensions of insight.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Measured technical data and AI interpretation, side by side. We always
          show the evidence behind every recommendation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORY_ORDER.map((key) => {
          const meta = CATEGORY_META[key];
          return (
            <Card
              key={key}
              className="group p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-transform group-hover:scale-105">
                <Icon name={meta.icon} className="size-5" />
              </div>
              <h3 className="font-semibold">{meta.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
