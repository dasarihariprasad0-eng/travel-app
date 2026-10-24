export const TRAVEL_STYLES = [
  "Backpacker",
  "Comfort explorer",
  "Luxury",
  "Road tripper",
  "Camper",
  "City hopper",
] as const;

export const PACES = ["Slow and restful", "Balanced", "Packed days", "Dawn-to-dusk"] as const;

export const BUDGET_LEVELS = [
  "Shoestring (₹)",
  "Moderate (₹₹)",
  "Comfortable (₹₹₹)",
  "Premium (₹₹₹₹)",
] as const;

export const GROUP_SIZES = ["2-3 people", "4-6 people", "7-10 people", "10+ people"] as const;

export const GENDER_COMPOSITIONS = [
  "No preference",
  "Women only",
  "Men only",
  "Mixed group",
] as const;

export const ACCOMMODATIONS = [
  "Hostel",
  "Budget hotel",
  "Boutique hotel",
  "Vacation rental",
  "Campground",
  "Glamping",
] as const;

export const FOOD_PREFERENCES = [
  "Anything goes",
  "Vegetarian",
  "Vegan",
  "Halal",
  "Kosher",
  "Gluten-free",
] as const;

export const CLIMATE_PREFERENCES = [
  "Cool and crisp",
  "Mild and dry",
  "Warm and sunny",
  "Hot",
  "Snowy",
] as const;

export const INTERESTS = [
  "Hiking",
  "National parks",
  "Photography",
  "Food and markets",
  "Live music",
  "Museums",
  "Wildlife",
  "Beaches",
  "Road trips",
  "History",
  "Nightlife",
  "Wellness",
  "Skiing",
  "Surfing",
  "Cycling",
  "Stargazing",
] as const;

export const ACTIVITIES = [
  "Day hikes",
  "Multi-day treks",
  "Kayaking",
  "Climbing",
  "Scenic drives",
  "Brewery tours",
  "Cooking classes",
  "Fishing",
  "Snorkeling",
  "Yoga",
  "Bike tours",
  "Camping",
] as const;

export const SMOKING = ["Non-smoker", "Smoker", "No preference"] as const;
export const DRINKING = ["No alcohol", "Social drinker", "Loves nightlife"] as const;
export const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export const GENDERS = ["Woman", "Man", "Non-binary", "Prefer not to say"] as const;

export const TRIP_STATUSES = ["planning", "confirmed", "in_progress", "completed"] as const;

export function weatherLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return "Forecast pending";
  if (code === 0) return "Clear sky";
  if (code <= 2) return "Mostly sunny";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}
