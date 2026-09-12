"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ViewerMarker {
  index: number;
  relX: number;
  relY: number;
  relW?: number | null;
  relH?: number | null;
  label: string;
  severity: string;
}

interface ScreenshotViewerProps {
  viewport: string;
  label: string;
  src: string;
  markers: ViewerMarker[];
  /** Constrain the image column (e.g. mobile is narrower). */
  className?: string;
}

/**
 * Displays a screenshot with an optional numbered "Show Issues" overlay.
 * Coordinates are relative (0..1) so markers render correctly at any displayed
 * size. The toggle is hidden when there are no markers (Req 4.5).
 */
export function ScreenshotViewer({
  viewport,
  label,
  src,
  markers,
  className,
}: ScreenshotViewerProps) {
  const [show, setShow] = React.useState(true);
  const hasMarkers = markers.length > 0;

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {hasMarkers && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={show}
            onClick={() => setShow((s) => !s)}
          >
            {show ? (
              <>
                <EyeOff className="size-3.5" /> Hide issues
              </>
            ) : (
              <>
                <Eye className="size-3.5" /> Show issues ({markers.length})
              </>
            )}
          </Button>
        )}
      </figcaption>

      <div className="relative overflow-hidden rounded-lg border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${label} screenshot of the analyzed website`}
          className="block w-full"
        />
        {hasMarkers && show && (
          <IssueOverlay markers={markers} viewport={viewport} />
        )}
      </div>
    </figure>
  );
}

/**
 * Absolutely-positioned numbered marker buttons. Each is focusable and exposes
 * its explanation via aria-label + a tooltip revealed on hover/focus (Req 4.3,
 * 4.4). Numbers are conveyed as text, never color alone.
 */
function IssueOverlay({
  markers,
  viewport,
}: {
  markers: ViewerMarker[];
  viewport: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      role="group"
      aria-label={`Visual issues for the ${viewport} view`}
    >
      {markers.map((m) => (
        <div
          key={m.index}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${m.relX * 100}%`, top: `${m.relY * 100}%` }}
        >
          <button
            type="button"
            aria-label={`Issue ${m.index}: ${m.label}`}
            className="group relative flex size-6 items-center justify-center rounded-full border-2 border-white bg-poor text-[11px] font-bold text-white shadow-md outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary"
          >
            {m.index}
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-max max-w-[200px] -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-normal text-background group-hover:block group-focus-within:block"
            >
              {m.label}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
