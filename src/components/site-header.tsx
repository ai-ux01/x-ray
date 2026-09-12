import Link from "next/link";
import { ScanLine } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <ScanLine className="size-5" />
          </span>
          <span className="tracking-tight">
            WebsiteX<span className="text-primary">-Ray</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <Link href="/#how-it-works" className="transition-colors hover:text-foreground">
            How it works
          </Link>
          <Link href="/#capabilities" className="transition-colors hover:text-foreground">
            Capabilities
          </Link>
          <Link href="/#pricing" className="transition-colors hover:text-foreground">
            Pricing
          </Link>
          <Link href="/dashboard" className="transition-colors hover:text-foreground">
            Dashboard
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="#analyze">Analyze Website</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
