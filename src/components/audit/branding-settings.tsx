"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Palette, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface BrandingValues {
  whiteLabel: boolean;
  agencyName: string | null;
  agencyLogo: string | null;
  agencyWebsite: string | null;
  agencyContact: string | null;
  customCta: string | null;
}

interface Props {
  auditId: string;
  initial: BrandingValues;
}

export function BrandingSettings({ auditId, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<BrandingValues>(initial);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function set<K extends keyof BrandingValues>(key: K, val: BrandingValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
    setSaved(false);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/audits/${auditId}/branding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { branding?: BrandingValues; error?: string };
      if (!res.ok) {
        setError(data.error ?? "We couldn't save the branding.");
        return;
      }
      if (data.branding) setValues(data.branding);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Palette className="size-4" />
        Agency &amp; white-label branding
        <span className="text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <Card className="mt-3 p-6">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.whiteLabel}
              onChange={(e) => set("whiteLabel", e.target.checked)}
              className="size-4 accent-primary"
            />
            Enable white-label (replace WebsiteX-Ray branding on this report and
            its PDF)
          </label>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Agency name">
              <Input
                value={values.agencyName ?? ""}
                onChange={(e) => set("agencyName", e.target.value)}
                placeholder="Acme Digital"
              />
            </Field>
            <Field label="Logo URL">
              <Input
                value={values.agencyLogo ?? ""}
                onChange={(e) => set("agencyLogo", e.target.value)}
                placeholder="https://acme.com/logo.png"
              />
            </Field>
            <Field label="Website">
              <Input
                value={values.agencyWebsite ?? ""}
                onChange={(e) => set("agencyWebsite", e.target.value)}
                placeholder="https://acme.com"
              />
            </Field>
            <Field label="Contact">
              <Input
                value={values.agencyContact ?? ""}
                onChange={(e) => set("agencyContact", e.target.value)}
                placeholder="hello@acme.com"
              />
            </Field>
            <Field label="Custom call-to-action" className="sm:col-span-2">
              <Input
                value={values.customCta ?? ""}
                onChange={(e) => set("customCta", e.target.value)}
                placeholder="Book a strategy call with Acme Digital"
              />
            </Field>
          </div>

          {error && <p className="mt-4 text-sm text-poor">{error}</p>}

          <div className="mt-5 flex items-center gap-3">
            <Button onClick={onSave} disabled={saving} size="sm">
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : saved ? (
                <>
                  <Check className="size-4" /> Saved
                </>
              ) : (
                "Save branding"
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              Changes apply to this report and its downloadable PDF.
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
