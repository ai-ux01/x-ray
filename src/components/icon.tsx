import * as Lucide from "lucide-react";
import type { LucideProps } from "lucide-react";

// Resolves a lucide-react icon by name. Falls back to a neutral dot so the
// UI never crashes on an unknown icon key.
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = (Lucide as unknown as Record<string, React.ComponentType<LucideProps>>)[
    name
  ];
  const Fallback = Lucide.Circle;
  const Resolved = Cmp ?? Fallback;
  return <Resolved {...props} />;
}
