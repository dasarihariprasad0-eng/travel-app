import { apiRequest } from "./api";
import type { PreferenceRow } from "./matching";

type DataInput<T> = { data: T };

export type ItineraryItem = {
  time: string;
  title: string;
  description: string;
  location?: string;
  indoor?: boolean;
  cost_estimate?: string;
};

export type ProfileBundle = {
  profile: {
    id: string;
    display_name: string;
    home_city: string | null;
    home_state: string | null;
    bio: string | null;
    age_range: string | null;
    gender: string | null;
  } | null;
  preferences: PreferenceRow | null;
  userId: string;
};

export async function getMyProfile(): Promise<ProfileBundle> {
  return apiRequest("/me");
}

export async function saveMyProfile({
  data,
}: DataInput<{
  profile: Record<string, unknown>;
  preferences: Omit<PreferenceRow, "user_id">;
}>): Promise<{ ok: boolean }> {
  return apiRequest("/me", { method: "PUT", body: data });
}

export async function findMatches(): Promise<{
  ready: boolean;
  matches: Array<{
    profile: {
      id: string;
      display_name: string;
      home_city: string | null;
      home_state: string | null;
      bio: string | null;
    };
    preferences: PreferenceRow;
    score: number;
    breakdown: Array<{ label: string; score: number; detail: string }>;
    sharedInterests: string[];
    sharedDestinations: string[];
    connection: { id: string; status: string; outgoing: boolean } | null;
  }>;
}> {
  return apiRequest("/matches");
}

export async function sendConnection({ data }: DataInput<{ toUser: string; message?: string }>) {
  return apiRequest("/connections", { method: "POST", body: data });
}

export async function respondConnection({
  data,
}: DataInput<{ id: string; status: "accepted" | "declined" }>) {
  return apiRequest(`/connections/${encodeURIComponent(data.id)}/respond`, {
    method: "POST",
    body: { status: data.status },
  });
}

export async function listConnections(): Promise<
  Array<{
    id: string;
    status: string;
    message: string | null;
    created_at: string;
    outgoing: boolean;
    other: {
      id: string;
      display_name: string;
      home_city: string | null;
      home_state: string | null;
    } | null;
  }>
> {
  return apiRequest("/connections");
}

export type TripCard = {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  max_travelers: number;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  status: string;
};

export type TripDetail = {
  trip: TripCard & {
    owner_id: string;
    description: string | null;
    budget_level: string | null;
    travel_style: string | null;
    country: string;
  };
  isMember: boolean;
  isOwner: boolean;
  members: Array<{
    user_id: string;
    role: string;
    profile: { display_name: string } | null;
  }>;
  itinerary: {
    id: string;
    summary: string | null;
    weather_overview: string | null;
    packing_notes: string[];
    model: string | null;
  } | null;
  days: Array<{
    id: string;
    day_number: number;
    day_date: string | null;
    title: string;
    weather_summary: string | null;
    weather_temp_high: number | null;
    weather_temp_low: number | null;
    items: ItineraryItem[];
  }>;
  progress: Array<{ day_id: string; user_id: string; item_index: number; done: boolean }>;
  userId: string;
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export async function listTrips({ data }: DataInput<{ search?: string }>): Promise<TripCard[]> {
  const query = data.search ? `?search=${encodeURIComponent(data.search)}` : "";
  return apiRequest(`/trips${query}`);
}

export async function listMyTrips(): Promise<TripCard[]> {
  return apiRequest("/trips/mine");
}

export async function createTrip({
  data,
}: DataInput<{
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  max_travelers: number;
  visibility: "public" | "private";
}>): Promise<TripCard> {
  return apiRequest("/trips", { method: "POST", body: data });
}

export async function joinTrip({ data }: DataInput<{ tripId: string }>) {
  return apiRequest(`/trips/${encodeURIComponent(data.tripId)}/join`, { method: "POST" });
}

export async function leaveTrip({ data }: DataInput<{ tripId: string }>) {
  return apiRequest(`/trips/${encodeURIComponent(data.tripId)}/leave`, { method: "POST" });
}

export async function updateTripStatus({ data }: DataInput<{ tripId: string; status: string }>) {
  return apiRequest(`/trips/${encodeURIComponent(data.tripId)}/status`, {
    method: "POST",
    body: { status: data.status },
  });
}

export async function getTrip({ data }: DataInput<{ tripId: string }>): Promise<TripDetail> {
  return apiRequest<TripDetail>(`/trips/${encodeURIComponent(data.tripId)}`);
}

export async function generateItinerary({
  data,
}: DataInput<{ tripId: string }>): Promise<{ ok: boolean; itineraryId: string }> {
  return apiRequest(`/trips/${encodeURIComponent(data.tripId)}/itinerary`, { method: "POST" });
}

export async function toggleProgress({
  data,
}: DataInput<{ tripId: string; dayId: string; itemIndex: number; done: boolean }>) {
  return apiRequest(`/trips/${encodeURIComponent(data.tripId)}/progress`, {
    method: "POST",
    body: { dayId: data.dayId, itemIndex: data.itemIndex, done: data.done },
  });
}

export async function getAssistantThread({
  data,
}: DataInput<{ tripId: string }>): Promise<AssistantMessage[]> {
  return apiRequest<AssistantMessage[]>(`/trips/${encodeURIComponent(data.tripId)}/assistant`);
}

export async function askAssistant({
  data,
}: DataInput<{ tripId: string; message: string }>): Promise<{ answer: string }> {
  return apiRequest(`/trips/${encodeURIComponent(data.tripId)}/assistant`, {
    method: "POST",
    body: { message: data.message },
  });
}
