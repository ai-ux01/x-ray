import { getScoreState } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const STATE_STROKE: Record<string, string> = {
  excellent: "stroke-excellent",
  good: "stroke-good",
  warning: "stroke-warning",
  poor: "stroke-poor",
  critical: "stroke-critical",
};

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}

/**
 * Circular score gauge. Accessibility: the numeric score and text status are
 * always present, never color-only.
 */
export function ScoreRing({
  score,
  size = 160,
  strokeWidth = 10,
  showLabel = true,
  className,
}: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const state = getScoreState(clamped);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      role="img"
      aria-label={`Score ${clamped} out of 100 — ${state.label}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-secondary"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("fill-none transition-all duration-1000 ease-out", STATE_STROKE[state.state])}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">{clamped}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      )}
    </div>
  );
}
