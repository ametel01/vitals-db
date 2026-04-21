export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatNumber(value: number, fractionDigits = 1): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatPercent(ratio: number, fractionDigits = 1): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

export function formatPercentValue(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatPace(secondsPerKilometer: number | null): string {
  if (
    secondsPerKilometer === null ||
    !Number.isFinite(secondsPerKilometer) ||
    secondsPerKilometer <= 0
  ) {
    return "—";
  }
  const totalSeconds = Math.round(secondsPerKilometer);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

export function formatIsoDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function formatIsoDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatTimeOfDay(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function formatSleepConsistencyMinutes(seconds: number): string {
  return `${formatNumber(seconds / 60, 1)} min`;
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function windowStartIso(daysInclusive: number): string {
  return daysAgoIso(Math.max(daysInclusive - 1, 0));
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function chartDataKey(prefix: string, data: unknown): string {
  return `${prefix}:${JSON.stringify(data)}`;
}
