import { apiRequest } from "./api";

export type FlightResearch = {
  summary: string;
  sources: Array<{
    title: string;
    url: string;
    excerpt: string;
  }>;
};

export function researchFlights({
  origin,
  destination,
  departureDate,
}: {
  origin: string;
  destination: string;
  departureDate: string | null;
}): Promise<FlightResearch> {
  return apiRequest("/flight-research", {
    method: "POST",
    body: {
      origin,
      destination,
      departure_date: departureDate,
    },
  });
}
