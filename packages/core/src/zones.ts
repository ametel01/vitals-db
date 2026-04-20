export const HR_ZONES = {
  Z2: { min: 115, max: 125 },
} as const;

export type HRZoneName = keyof typeof HR_ZONES;
export type HRZoneBounds = (typeof HR_ZONES)[HRZoneName];
