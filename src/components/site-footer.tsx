import Link from "next/link";
import { ScanLine } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="container flex flex-col items-center justify-between gap-4 py-10 text-sm text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <ScanLine className="size-4 text-primary" />
          <span>
            WebsiteX-Ray — © {new Date().getFullYear()}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="#how-it-works" className="hover:text-foreground">How it works</Link>
          <Link href="#pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/sample-report" className="hover:text-foreground">Sample report</Link>
        </div>
      </div>
    </footer>
  );
}
