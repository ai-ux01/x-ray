// White-label / agency branding (Phase 11).
//
// Branding lives on the audit's Report row. When white-label is enabled, the
// web report and PDF replace WebsiteX-Ray branding with the agency's, and can
// add a custom call-to-action. All fields are optional; disabling white-label
// reverts to default branding without deleting the saved values.

import { prisma } from "@/lib/prisma";

export interface Branding {
  whiteLabel: boolean;
  agencyName: string | null;
  agencyLogo: string | null;
  agencyWebsite: string | null;
  agencyContact: string | null;
  customCta: string | null;
}

export const DEFAULT_BRANDING: Branding = {
  whiteLabel: false,
  agencyName: null,
  agencyLogo: null,
  agencyWebsite: null,
  agencyContact: null,
  customCta: null,
};

export interface BrandingInput {
  whiteLabel?: boolean;
  agencyName?: string | null;
  agencyLogo?: string | null;
  agencyWebsite?: string | null;
  agencyContact?: string | null;
  customCta?: string | null;
}

function clean(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Returns the branding for an audit, or defaults when no Report row exists. */
export async function getBranding(auditId: string): Promise<Branding> {
  const report = await prisma.report.findUnique({ where: { auditId } });
  if (!report) return DEFAULT_BRANDING;
  return {
    whiteLabel: report.whiteLabel,
    agencyName: report.agencyName,
    agencyLogo: report.agencyLogo,
    agencyWebsite: report.agencyWebsite,
    agencyContact: report.agencyContact,
    customCta: report.customCta,
  };
}

/** Upserts branding on the audit's Report row (preserves pdfUrl). */
export async function updateBranding(
  auditId: string,
  input: BrandingInput,
): Promise<Branding> {
  const data = {
    whiteLabel: input.whiteLabel ?? false,
    agencyName: clean(input.agencyName, 120),
    agencyLogo: clean(input.agencyLogo, 2048),
    agencyWebsite: clean(input.agencyWebsite, 2048),
    agencyContact: clean(input.agencyContact, 200),
    customCta: clean(input.customCta, 400),
  };

  // Clear any cached PDF so the next download reflects the new branding.
  const report = await prisma.report.upsert({
    where: { auditId },
    create: { auditId, ...data },
    update: { ...data, pdfUrl: null },
  });

  return {
    whiteLabel: report.whiteLabel,
    agencyName: report.agencyName,
    agencyLogo: report.agencyLogo,
    agencyWebsite: report.agencyWebsite,
    agencyContact: report.agencyContact,
    customCta: report.customCta,
  };
}
