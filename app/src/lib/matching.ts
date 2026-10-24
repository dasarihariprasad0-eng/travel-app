export type PreferenceRow = {
  user_id: string;
  travel_style: string | null;
  pace: string | null;
  budget_level: string | null;
  group_size: string | null;
  gender_composition: string | null;
  accommodation: string | null;
  food_preference: string | null;
  climate_preference: string | null;
  hotel_budget_per_night: number | null;
  interests: string[] | null;
  activities: string[] | null;
  smoking: string | null;
  drinking: string | null;
  early_riser: boolean | null;
  dream_destinations: string[] | null;
};

export type MatchBreakdown = { label: string; score: number; detail: string };

export type ScoredMatch = {
  score: number;
  breakdown: MatchBreakdown[];
  sharedInterests: string[];
  sharedDestinations: string[];
};

const WEIGHTS = {
  style: 14,
  pace: 12,
  budget: 14,
  groupSize: 8,
  accommodation: 8,
  climate: 8,
  interests: 20,
  activities: 10,
  habits: 6,
};

function overlap(a: string[] | null, b: string[] | null): string[] {
  if (!a?.length || !b?.length) return [];
  const setB = new Set(b.map((v) => v.toLowerCase()));
  return a.filter((v) => setB.has(v.toLowerCase()));
}

function jaccardish(a: string[] | null, b: string[] | null): number {
  if (!a?.length || !b?.length) return 0.35;
  const shared = overlap(a, b).length;
  const union = new Set([...a, ...b].map((v) => v.toLowerCase())).size;
  return union === 0 ? 0.35 : shared / union;
}

function exact(a: string | null, b: string | null, neutral = 0.4): number {
  if (!a || !b) return neutral;
  return a === b ? 1 : 0.15;
}

/** Budget levels are ordered, so "adjacent" is a partial match, not a miss. */
function ordered(a: string | null, b: string | null, scale: readonly string[]): number {
  if (!a || !b) return 0.4;
  const ia = scale.indexOf(a);
  const ib = scale.indexOf(b);
  if (ia < 0 || ib < 0) return 0.4;
  const distance = Math.abs(ia - ib);
  if (distance === 0) return 1;
  if (distance === 1) return 0.6;
  return 0.15;
}

const BUDGET_SCALE = [
  ["Shoestring (₹)", "Shoestring ($)"],
  ["Moderate (₹₹)", "Moderate ($$)"],
  ["Comfortable (₹₹₹)", "Comfortable ($$$)"],
  ["Premium (₹₹₹₹)", "Premium ($$$$)"],
] as const;
const PACE_SCALE = ["Slow and restful", "Balanced", "Packed days", "Dawn-to-dusk"] as const;
const SIZE_SCALE = ["2-3 people", "4-6 people", "7-10 people", "10+ people"] as const;

function orderedBudget(a: string | null, b: string | null): number {
  if (!a || !b) return 0.4;
  const ia = BUDGET_SCALE.findIndex((tier) => tier.some((value) => value === a));
  const ib = BUDGET_SCALE.findIndex((tier) => tier.some((value) => value === b));
  if (ia < 0 || ib < 0) return 0.4;
  const distance = Math.abs(ia - ib);
  if (distance === 0) return 1;
  if (distance === 1) return 0.6;
  return 0.15;
}

export function scoreCompatibility(me: PreferenceRow, other: PreferenceRow): ScoredMatch {
  const interestsScore = jaccardish(me.interests, other.interests);
  const activitiesScore = jaccardish(me.activities, other.activities);
  const habitsScore =
    (exact(me.smoking, other.smoking, 0.5) +
      exact(me.drinking, other.drinking, 0.5) +
      (me.early_riser === null || other.early_riser === null
        ? 0.5
        : me.early_riser === other.early_riser
          ? 1
          : 0.3)) /
    3;

  const parts: Array<{ key: keyof typeof WEIGHTS; label: string; value: number; detail: string }> =
    [
      {
        key: "style",
        label: "Travel style",
        value: exact(me.travel_style, other.travel_style),
        detail: other.travel_style ?? "Not set",
      },
      {
        key: "pace",
        label: "Trip pace",
        value: ordered(me.pace, other.pace, PACE_SCALE),
        detail: other.pace ?? "Not set",
      },
      {
        key: "budget",
        label: "Budget",
        value: orderedBudget(me.budget_level, other.budget_level),
        detail: other.budget_level ?? "Not set",
      },
      {
        key: "groupSize",
        label: "Group size",
        value: ordered(me.group_size, other.group_size, SIZE_SCALE),
        detail: other.group_size ?? "Not set",
      },
      {
        key: "accommodation",
        label: "Stays",
        value: exact(me.accommodation, other.accommodation),
        detail: other.accommodation ?? "Not set",
      },
      {
        key: "climate",
        label: "Climate",
        value: exact(me.climate_preference, other.climate_preference),
        detail: other.climate_preference ?? "Not set",
      },
      {
        key: "interests",
        label: "Interests",
        value: interestsScore,
        detail: `${overlap(me.interests, other.interests).length} shared`,
      },
      {
        key: "activities",
        label: "Activities",
        value: activitiesScore,
        detail: `${overlap(me.activities, other.activities).length} shared`,
      },
      {
        key: "habits",
        label: "Daily habits",
        value: habitsScore,
        detail: "Sleep, smoking, drinking",
      },
    ];

  const total = parts.reduce((sum, p) => sum + p.value * WEIGHTS[p.key], 0);
  const max = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

  return {
    score: Math.round((total / max) * 100),
    breakdown: parts.map((p) => ({
      label: p.label,
      score: Math.round(p.value * 100),
      detail: p.detail,
    })),
    sharedInterests: overlap(me.interests, other.interests),
    sharedDestinations: overlap(me.dream_destinations, other.dream_destinations),
  };
}
