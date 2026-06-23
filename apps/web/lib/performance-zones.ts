export type Zone2Tone = "success" | "warning" | "danger" | "neutral";

export interface Zone2Status {
  label: string;
  tone: Zone2Tone;
}

export function zone2Status(ratio: number | null): Zone2Status {
  if (ratio === null || !Number.isFinite(ratio)) {
    return { label: "No data", tone: "neutral" };
  }

  if (ratio >= 0.5) {
    return { label: "High Z2", tone: "success" };
  }

  if (ratio >= 0.25) {
    return { label: "Mixed Z2", tone: "warning" };
  }

  return { label: "Low Z2", tone: "danger" };
}
