import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    highlight: false,
    features: ["1 audit / month", "All 10 analysis categories", "AI recommendations"],
    cta: "Start free",
  },
  {
    name: "Starter",
    price: "$29",
    cadence: "/month",
    highlight: false,
    features: ["10 audits / month", "Full report dashboard", "Action plans", "Email support"],
    cta: "Choose Starter",
  },
  {
    name: "Professional",
    price: "$99",
    cadence: "/month",
    highlight: true,
    features: [
      "100 audits / month",
      "Competitor analysis",
      "Page-by-page insights",
      "Priority processing",
    ],
    cta: "Choose Professional",
  },
  {
    name: "Agency",
    price: "$199",
    cadence: "/month",
    highlight: false,
    features: [
      "Large / unlimited audits",
      "White-label PDF reports",
      "Client management",
      "Branded client audits",
    ],
    cta: "Talk to us",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="container py-20">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">Simple, scalable pricing</h2>
        <p className="mt-3 text-muted-foreground">
          Start free. Upgrade when you need more audits, competitor analysis, or
          white-label reports.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <Card
            key={plan.name}
            className={cn(
              "relative flex flex-col p-6",
              plan.highlight && "border-primary/50 shadow-xl shadow-primary/10",
            )}
          >
            {plan.highlight && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                Most popular
              </Badge>
            )}
            <h3 className="font-semibold">{plan.name}</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold">{plan.price}</span>
              <span className="text-sm text-muted-foreground">{plan.cadence}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              variant={plan.highlight ? "default" : "outline"}
              className="mt-6 w-full"
            >
              {plan.cta}
            </Button>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Pricing-ready architecture. Payment integration is not enabled yet.
      </p>
    </section>
  );
}
