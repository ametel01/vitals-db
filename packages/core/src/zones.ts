// Ordered HR zones covering the full bpm range. Z2 = 115–125 is pinned by
// spec §4.1 and the existing `z2_ratio` contract; the surrounding zones
// partition the rest of the range with contiguous integer bounds so every
// HealthKit-sourced bpm sample falls in exactly one zone when evaluated with
// inclusive SQL `BETWEEN`.
export const HR_ZONES = {
  Z1: { min: 0, max: 114 },
  Z2: { min: 115, max: 125 },
  Z3: { min: 126, max: 140 },
  Z4: { min: 141, max: 155 },
  Z5: { min: 156, max: 1000 },
} as const;

export const HR_ZONE_ORDER = ["Z1", "Z2", "Z3", "Z4", "Z5"] as const;

export type HRZoneName = (typeof HR_ZONE_ORDER)[number];
export type HRZoneBounds = (typeof HR_ZONES)[HRZoneName];
