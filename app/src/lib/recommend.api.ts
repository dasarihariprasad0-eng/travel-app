import { apiRequest } from "./api";

export type Recommendation = {
  destination: string;
  region: string;
  why: string;
  top_places?: {
    name: string;
    category: string;
    why_visit: string;
  }[];
  best_for: string[];
  estimated_total_per_person?: string;
  cost_breakdown?: {
    hotel_room_per_night_inr: { min: number; max: number } | null;
    transport_per_person_inr: { min: number; max: number } | null;
    food_per_day_per_person_inr: { min: number; max: number } | null;
    local_transport_per_day_per_person_inr: { min: number; max: number } | null;
    activities_per_day_per_person_inr: { min: number; max: number } | null;
    fees_per_person_inr: { min: number; max: number } | null;
    assumptions: string[];
  } | null;
  trip_plan?: {
    day: number;
    title: string;
    stay_area: string;
    hotel_suggestion: string;
    estimated_room_rate_per_night: string;
    nearby_food: {
      place_or_cuisine: string;
      estimated_meal_price_per_person: string;
    }[];
    activities: string[];
    estimated_daily_spend_per_person: string;
  }[];
  budget_fit: string;
  timing_note: string;
  sample_activities: string[];
  watch_out: string;
};

export async function recommendDestinations({
  data,
}: {
  data: {
    interests: string;
    budget: string;
    timing: string;
    groupSize?: string;
    budgetAmount?: number | null;
    hotelBudgetPerNight?: number | null;
    nights: number;
    travelers: number;
    roomShare: number;
    preferredDestinations: string[];
  };
}): Promise<{
  recommendations: Recommendation[];
  budget_amount: number | null;
  sources: { title: string; url: string }[];
}> {
  return apiRequest("/ideas", {
    method: "POST",
    body: {
      interests: data.interests,
      budget: data.budget,
      timing: data.timing,
      group_size: data.groupSize,
      budget_amount: data.budgetAmount,
      hotel_budget_per_night: data.hotelBudgetPerNight,
      nights: data.nights,
      travelers: data.travelers,
      room_share: data.roomShare,
      preferred_destinations: data.preferredDestinations,
    },
  });
}
