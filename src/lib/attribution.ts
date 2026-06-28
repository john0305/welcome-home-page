// Helpers for the performance attribution UI. All percentage formatters
// guard against division-by-zero and surface a "New data" sentinel for
// pre=0 baselines so we never show misleading numbers.
export const NEW_DATA = "New data" as const;

export function formatPct(value: number | null | undefined): string {
  if (value == null) return NEW_DATA;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

export function formatDelta(value: number | null | undefined, unit = ""): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString()}${unit}`;
}

export type Confidence = "low" | "medium" | "high";

export function confidenceFor(opts: {
  windowDays: number;
  isSufficient: boolean;
  preViews: number;
}): Confidence {
  if (!opts.isSufficient) return "low";
  if (opts.windowDays >= 30 && opts.preViews >= 100) return "high";
  if (opts.windowDays >= 14 && opts.preViews >= 20) return "medium";
  return "low";
}

export function daysUntilWindow(optimizedAt: string, windowDays: number): number {
  const target = new Date(optimizedAt).getTime() + windowDays * 86400000;
  return Math.max(0, Math.ceil((target - Date.now()) / 86400000));
}
