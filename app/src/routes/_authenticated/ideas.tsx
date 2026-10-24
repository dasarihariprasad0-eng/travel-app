import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BedDouble, ExternalLink, Loader2, MapPin, Sparkles, Tag } from "lucide-react";
import { BookingOptions } from "@/components/BookingOptions";
import { recommendDestinations } from "@/lib/recommend.api";
import type { Recommendation } from "@/lib/recommend.api";
import { getMyProfile } from "@/lib/travel.api";
import { BUDGET_LEVELS, GROUP_SIZES } from "@/lib/travel-options";
import { getCheckoutDate } from "@/lib/travel-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChipGroup } from "@/components/ChipGroup";

const EMPTY_RECOMMENDATIONS: Recommendation[] = [];

export const Route = createFileRoute("/_authenticated/ideas")({
  head: () => ({
    meta: [
      { title: "Destination ideas — DIRECT" },
      {
        name: "description",
        content: "Describe your interests, budget and timing to get AI destination picks.",
      },
      { property: "og:title", content: "Destination ideas — DIRECT" },
      {
        property: "og:description",
        content: "Personalized, realistic destination recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IdeasPage,
});

function IdeasPage() {
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: getMyProfile });
  const [interests, setInterests] = useState("");
  const [budget, setBudget] = useState<string>(BUDGET_LEVELS[1]);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [timing, setTiming] = useState("");
  const [startDate, setStartDate] = useState("");
  const [groupSize, setGroupSize] = useState("");
  const [hotelBudgetPerNight, setHotelBudgetPerNight] = useState("");
  const [nights, setNights] = useState("4");
  const [travelers, setTravelers] = useState("4");
  const [roomShare, setRoomShare] = useState("2");
  const [placeCategory, setPlaceCategory] = useState("All");

  useEffect(() => {
    const savedBudget = profile.data?.preferences?.hotel_budget_per_night;
    if (savedBudget && !hotelBudgetPerNight) {
      setHotelBudgetPerNight(String(savedBudget));
    }
  }, [profile.data?.preferences?.hotel_budget_per_night, hotelBudgetPerNight]);

  const mutation = useMutation({
    mutationFn: () =>
      recommendDestinations({
        data: {
          interests,
          budget,
          timing,
          groupSize,
          budgetAmount: budgetAmount ? Number(budgetAmount) : null,
          hotelBudgetPerNight: hotelBudgetPerNight ? Number(hotelBudgetPerNight) : null,
          nights: Number(nights),
          travelers: Number(travelers),
          roomShare: Number(roomShare),
          preferredDestinations: profile.data?.preferences?.dream_destinations ?? [],
        },
      }),
  });

  const amount = budgetAmount ? Number(budgetAmount) : null;
  const validAmount =
    amount === null || (Number.isSafeInteger(amount) && amount >= 1 && amount <= 10_000_000);
  const nightlyAmount = hotelBudgetPerNight ? Number(hotelBudgetPerNight) : null;
  const validNightlyAmount =
    nightlyAmount === null ||
    (Number.isSafeInteger(nightlyAmount) && nightlyAmount >= 1 && nightlyAmount <= 1_000_000);
  const nightsCount = Number(nights);
  const travelerCount = Number(travelers);
  const roomOccupancy = Number(roomShare);
  const checkoutDate = getCheckoutDate(startDate, nightsCount);
  const bookingStartDate = checkoutDate ? startDate : null;
  const validTripSize =
    Number.isInteger(nightsCount) &&
    nightsCount >= 1 &&
    nightsCount <= 30 &&
    Number.isInteger(travelerCount) &&
    travelerCount >= 1 &&
    travelerCount <= 20 &&
    Number.isInteger(roomOccupancy) &&
    roomOccupancy >= 1 &&
    roomOccupancy <= Math.min(travelerCount, 8);
  const canSubmit =
    interests.trim().length >= 3 &&
    timing.trim().length >= 2 &&
    validAmount &&
    validNightlyAmount &&
    validTripSize &&
    !mutation.isPending;
  const recommendations = mutation.data?.recommendations ?? EMPTY_RECOMMENDATIONS;
  const placeCategories = useMemo(
    () => [
      "All",
      ...new Set(
        recommendations.flatMap((recommendation) =>
          getTopPlaces(recommendation).map((place) => place.category),
        ),
      ),
    ],
    [recommendations],
  );
  const bestValueDestination = useMemo(() => {
    const estimates = recommendations
      .map((recommendation) => ({
        destination: recommendation.destination,
        estimate: getTripCostEstimate(recommendation, nightsCount, travelerCount, roomOccupancy),
      }))
      .filter(
        (item): item is { destination: string; estimate: EstimateRange } => item.estimate !== null,
      )
      .sort((a, b) => a.estimate.min - b.estimate.min);
    return estimates[0]?.destination ?? null;
  }, [recommendations, nightsCount, travelerCount, roomOccupancy]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="eyebrow">Destination ideas</p>
      <h1 className="mt-2 text-3xl">Where should your group go?</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Tell us what you love, what you want to spend and when you can travel. Suggestions are a
        starting point — check prices and conditions before booking.
      </p>
      <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
        Your interests, budget, timing, and group size are sent to Google Gemini to generate
        suggestions. On its free tier, Google may use submitted content to improve its products;
        don&apos;t include sensitive personal information.
      </p>
      {profile.isError ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Saved preferences couldn’t be loaded. You can still enter your trip details below.
        </p>
      ) : null}

      <form
        className="surface-card mt-8 space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <div>
          <label className="text-sm font-medium" htmlFor="interests">
            Interests
          </label>
          <Textarea
            id="interests"
            className="mt-1.5"
            placeholder="Hiking, local food, stargazing, a bit of nightlife…"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
          />
        </div>
        <div>
          <p className="text-sm font-medium">Budget level (used when no amount is entered)</p>
          <div className="mt-1.5">
            <ChipGroup
              options={BUDGET_LEVELS}
              value={budget}
              onChange={(v) => setBudget(v as string)}
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="budget-amount">
            Maximum total budget per traveler (₹, whole trip)
          </label>
          <Input
            id="budget-amount"
            className="mt-1.5 max-w-sm"
            type="number"
            inputMode="numeric"
            min={1}
            max={10_000_000}
            step={1}
            placeholder="e.g. 15000"
            value={budgetAmount}
            onChange={(event) => setBudgetAmount(event.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Enter an amount to prioritize recommendations within that trip total, or leave it blank
            to use the budget level above.
          </p>
          {!validAmount && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              Enter a whole-rupee amount between ₹1 and ₹1,00,00,000.
            </p>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium" htmlFor="timing">
              Timing
            </label>
            <Input
              id="timing"
              className="mt-1.5"
              placeholder="e.g. 5 days in mid-October"
              value={timing}
              onChange={(e) => setTiming(e.target.value)}
            />
          </div>
          <div>
            <p className="text-sm font-medium">Group size (optional)</p>
            <div className="mt-1.5">
              <ChipGroup
                options={GROUP_SIZES}
                value={groupSize}
                onChange={(v) => setGroupSize(v as string)}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="trip-start-date">
              Trip start date (optional)
            </label>
            <Input
              id="trip-start-date"
              className="mt-1.5"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Used to prefill hotel and travel searches.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-sm font-medium" htmlFor="trip-nights">
              Nights
            </label>
            <Input
              id="trip-nights"
              className="mt-1.5"
              type="number"
              min={1}
              max={30}
              step={1}
              value={nights}
              onChange={(event) => setNights(event.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="traveler-count">
              Travelers
            </label>
            <Input
              id="traveler-count"
              className="mt-1.5"
              type="number"
              min={1}
              max={20}
              step={1}
              value={travelers}
              onChange={(event) => setTravelers(event.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="room-share">
              People per room
            </label>
            <Input
              id="room-share"
              className="mt-1.5"
              type="number"
              min={1}
              max={Math.min(travelerCount || 1, 8)}
              step={1}
              value={roomShare}
              onChange={(event) => setRoomShare(event.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="hotel-nightly-target">
              Hotel target / room / night (₹)
            </label>
            <Input
              id="hotel-nightly-target"
              className="mt-1.5"
              type="number"
              min={1}
              max={1_000_000}
              step={1}
              placeholder="Optional"
              value={hotelBudgetPerNight}
              onChange={(event) => setHotelBudgetPerNight(event.target.value)}
            />
          </div>
        </div>
        {!validTripSize ? (
          <p role="alert" className="text-xs text-destructive">
            Enter 1–30 nights, 1–20 travelers, and a room-sharing count no greater than the group
            size.
          </p>
        ) : null}
        {!validNightlyAmount ? (
          <p role="alert" className="text-xs text-destructive">
            Enter a whole-rupee hotel target between ₹1 and ₹10,00,000.
          </p>
        ) : null}
        {profile.data?.preferences?.dream_destinations?.length ? (
          <p className="text-xs text-muted-foreground">
            We’ll prioritize your saved dream destinations:{" "}
            <strong>{profile.data.preferences.dream_destinations.join(", ")}</strong>
          </p>
        ) : null}
        <Button type="submit" disabled={!canSubmit}>
          {mutation.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {mutation.isPending ? "Thinking through options…" : "Get recommendations"}
        </Button>
        {mutation.isError && (
          <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
        )}
      </form>

      {mutation.data && (
        <>
          {mutation.data.budget_amount !== null && (
            <p className="mt-6 rounded-lg border border-border bg-secondary/60 px-4 py-3 text-sm">
              Recommendations are tailored to a maximum of{" "}
              <strong>
                ₹{mutation.data.budget_amount.toLocaleString("en-IN")} per traveler for the whole
                trip
              </strong>
              .
            </p>
          )}
          <section className="mt-8" aria-label="Recommended destinations">
            <div className="mb-4">
              <p className="eyebrow">Picked for your trip</p>
              <h2 className="mt-1 text-2xl">Places worth discovering</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Explore the highlights in each destination, then compare the trip details.
              </p>
            </div>
            {placeCategories.length > 1 ? (
              <div className="destination-category-filter" aria-label="Filter places by category">
                {placeCategories.map((category) => (
                  <Button
                    key={category}
                    type="button"
                    size="sm"
                    variant={placeCategory === category ? "default" : "outline"}
                    onClick={() => setPlaceCategory(category)}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            ) : null}
            <div className="grid gap-5">
              {recommendations.map((r, index) => {
                const allPlaces = getTopPlaces(r);
                const topPlaces =
                  placeCategory === "All"
                    ? allPlaces
                    : allPlaces.filter((place) => place.category === placeCategory);
                if (placeCategory !== "All" && !topPlaces.length) return null;
                const estimate = getTripCostEstimate(r, nightsCount, travelerCount, roomOccupancy);
                return (
                  <article key={r.destination} className="surface-card destination-result-card">
                    <div
                      className={`destination-image destination-image-${index % 4}`}
                      role="img"
                      aria-label={`Scenic travel view for ${r.destination}`}
                    >
                      <span className="destination-image-location">
                        <MapPin size={14} /> {r.region}
                      </span>
                      {bestValueDestination === r.destination ? (
                        <span className="destination-image-deal">
                          <Tag size={13} /> Lowest estimated trip
                        </span>
                      ) : null}
                    </div>
                    <header className="destination-result-heading">
                      <div>
                        <p className="eyebrow">DESTINATION {String(index + 1).padStart(2, "0")}</p>
                        <h3 className="mt-1 text-2xl">{r.destination}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{r.region}</p>
                      </div>
                      <div className="destination-match-tags">
                        {r.best_for.map((b) => (
                          <Badge key={b} variant="secondary">
                            {b}
                          </Badge>
                        ))}
                      </div>
                    </header>
                    <p className="mt-3 text-sm">{r.why}</p>
                    <div className="destination-price-highlight">
                      <div>
                        <p className="eyebrow">ESTIMATED TRIP COST · PER TRAVELER</p>
                        <strong>
                          {estimate ? formatInrRange(estimate) : "Not enough sourced prices"}
                        </strong>
                        <span>For {nightsCount} nights · estimate, not a live quote</span>
                      </div>
                      <span aria-hidden="true">₹</span>
                    </div>
                    <section className="destination-places-section">
                      <div className="destination-section-heading">
                        <div>
                          <p className="eyebrow">
                            {r.top_places?.length ? "LOCAL FAVORITES" : "TRIP HIGHLIGHTS"}
                          </p>
                          <h4>
                            {r.top_places?.length ? "Best places to visit" : "Things to explore"}
                          </h4>
                        </div>
                        <span>{topPlaces.length} highlights</span>
                      </div>
                      {topPlaces.length ? (
                        <div className="destination-places-grid">
                          {topPlaces.map((place, placeIndex) => (
                            <a
                              className="destination-place-card"
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${r.destination}`)}`}
                              key={`${place.name}-${placeIndex}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <span className="destination-place-index">
                                {String(placeIndex + 1).padStart(2, "0")}
                              </span>
                              <span className="destination-place-copy">
                                <span className="destination-place-category">{place.category}</span>
                                <strong>{place.name}</strong>
                                <span>{place.why_visit}</span>
                              </span>
                              <ExternalLink size={15} aria-hidden="true" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No place highlights were returned for this destination.
                        </p>
                      )}
                    </section>
                    <dl className="mt-4 space-y-2 text-sm">
                      {r.estimated_total_per_person && (
                        <div>
                          <dt className="eyebrow">Estimated trip total per traveler</dt>
                          <dd className="text-muted-foreground">{r.estimated_total_per_person}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="eyebrow">Budget fit</dt>
                        <dd className="text-muted-foreground">{r.budget_fit}</dd>
                      </div>
                      <div>
                        <dt className="eyebrow">Timing</dt>
                        <dd className="text-muted-foreground">{r.timing_note}</dd>
                      </div>
                      <div>
                        <dt className="eyebrow">Try</dt>
                        <dd className="text-muted-foreground">{r.sample_activities.join(" · ")}</dd>
                      </div>
                      <div>
                        <dt className="eyebrow">Watch out</dt>
                        <dd className="text-muted-foreground">{r.watch_out}</dd>
                      </div>
                    </dl>
                    <CostBreakdown
                      recommendation={r}
                      nights={nightsCount}
                      travelers={travelerCount}
                      roomShare={roomOccupancy}
                    />
                    <BookingOptions
                      destination={r.destination}
                      origin={profile.data?.profile?.home_city ?? null}
                      startDate={bookingStartDate}
                      endDate={checkoutDate}
                      travelers={travelerCount}
                      rooms={Math.ceil(travelerCount / roomOccupancy)}
                    />
                    {r.trip_plan?.length ? (
                      <section className="mt-5 border-t border-border pt-4">
                        <h3 className="text-base font-medium">Day-by-day trip plan</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Prices are estimates, not live quotes. Hotel rates are per room per night;
                          food and daily spend are per traveler. Daily spend includes an estimated
                          shared-room cost.
                        </p>
                        <div className="mt-3 space-y-3">
                          {r.trip_plan.map((day) => (
                            <div
                              key={`${r.destination}-${day.day}`}
                              className="rounded-lg border border-border p-3"
                            >
                              <h4 className="font-medium">
                                Day {day.day}: {day.title}
                              </h4>
                              <p className="mt-2 text-sm">
                                <span className="font-medium">Stay:</span> {day.hotel_suggestion}{" "}
                                <span className="text-muted-foreground">({day.stay_area})</span>
                              </p>
                              <p className="mt-1 text-sm">
                                <span className="font-medium">Room per night:</span>{" "}
                                {day.estimated_room_rate_per_night}
                              </p>
                              <div className="mt-2 text-sm">
                                <span className="font-medium">Nearby food:</span>
                                <ul className="ml-5 mt-1 list-disc text-muted-foreground">
                                  {day.nearby_food.map((food) => (
                                    <li
                                      key={`${food.place_or_cuisine}-${food.estimated_meal_price_per_person}`}
                                    >
                                      {food.place_or_cuisine} —{" "}
                                      {food.estimated_meal_price_per_person} per person
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <p className="mt-2 text-sm">
                                <span className="font-medium">Activities:</span>{" "}
                                {day.activities.join(" · ")}
                              </p>
                              <p className="mt-1 text-sm">
                                <span className="font-medium">
                                  Estimated daily spend per traveler:
                                </span>{" "}
                                {day.estimated_daily_spend_per_person}
                              </p>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : (
                      <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
                        A day-by-day plan was not returned for this suggestion. Try generating ideas
                        again for sourced hotel and food estimates.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
          {mutation.data.sources.length > 0 && (
            <section className="surface-card mt-6 p-5">
              <h2 className="text-lg font-medium">Research sources</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {mutation.data.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      className="text-primary underline underline-offset-2"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function getTopPlaces(recommendation: Recommendation) {
  if (recommendation.top_places?.length) {
    const places = recommendation.top_places.filter(
      (place) => place.name.trim() && place.category.trim() && place.why_visit.trim(),
    );
    if (places.length) return places;
  }

  const highlights = [
    ...(recommendation.trip_plan ?? []).flatMap((day) => day.activities),
    ...recommendation.sample_activities,
  ];
  return [...new Set(highlights.map((highlight) => highlight.trim()).filter(Boolean))]
    .slice(0, 4)
    .map((name) => ({
      name,
      category: "Suggested experience",
      why_visit: `A trip highlight to consider in ${recommendation.destination}.`,
    }));
}

function getTripCostEstimate(
  recommendation: Recommendation,
  nights: number,
  travelers: number,
  roomShare: number,
): EstimateRange | null {
  const cost = recommendation.cost_breakdown;
  if (!cost || travelers < 1 || roomShare < 1) return null;

  const roomCount = Math.ceil(travelers / roomShare);
  const hotel = scaleRange(cost.hotel_room_per_night_inr, (roomCount * nights) / travelers);
  const transport = cost.transport_per_person_inr;
  const food = scaleRange(cost.food_per_day_per_person_inr, nights);
  const localTransport = scaleRange(cost.local_transport_per_day_per_person_inr, nights);
  const activities = scaleRange(cost.activities_per_day_per_person_inr, nights);
  const fees = cost.fees_per_person_inr;
  const ranges = [hotel, transport, food, localTransport, activities, fees];
  if (ranges.some((range) => !range)) return null;

  return ranges.reduce<EstimateRange>(
    (total, range) => ({
      min: total.min + (range?.min ?? 0),
      max: total.max + (range?.max ?? 0),
    }),
    { min: 0, max: 0 },
  );
}

type EstimateRange = { min: number; max: number };

function CostBreakdown({
  recommendation,
  nights,
  travelers,
  roomShare,
}: {
  recommendation: Recommendation;
  nights: number;
  travelers: number;
  roomShare: number;
}) {
  const cost = recommendation.cost_breakdown;
  if (!cost) return null;

  const roomCount = Math.ceil(travelers / roomShare);
  const hotelPerNight = cost.hotel_room_per_night_inr;
  const hotelGroupTotal = scaleRange(hotelPerNight, roomCount * nights);
  const hotelPerPerson = hotelGroupTotal
    ? {
        min: Math.round(hotelGroupTotal.min / travelers),
        max: Math.round(hotelGroupTotal.max / travelers),
      }
    : null;
  const entries = [
    {
      label: `Hotel · ${nights} nights`,
      range: hotelPerPerson,
      groupRange: hotelGroupTotal,
    },
    {
      label: "Transport · round trip",
      range: cost.transport_per_person_inr,
      groupRange: scaleRange(cost.transport_per_person_inr, travelers),
    },
    {
      label: `Food · ${nights} days`,
      range: scaleRange(cost.food_per_day_per_person_inr, nights),
      groupRange: scaleRange(cost.food_per_day_per_person_inr, nights * travelers),
    },
    {
      label: `Local transport · ${nights} days`,
      range: scaleRange(cost.local_transport_per_day_per_person_inr, nights),
      groupRange: scaleRange(cost.local_transport_per_day_per_person_inr, nights * travelers),
    },
    {
      label: `Activities · ${nights} days`,
      range: scaleRange(cost.activities_per_day_per_person_inr, nights),
      groupRange: scaleRange(cost.activities_per_day_per_person_inr, nights * travelers),
    },
    {
      label: "Fees and taxes",
      range: cost.fees_per_person_inr,
      groupRange: scaleRange(cost.fees_per_person_inr, travelers),
    },
  ];
  const allCostsAvailable = entries.every((entry) => entry.range !== null);
  const totalGroup = allCostsAvailable
    ? entries.reduce(
        (total, entry) => ({
          min: total.min + (entry.groupRange?.min ?? 0),
          max: total.max + (entry.groupRange?.max ?? 0),
        }),
        { min: 0, max: 0 },
      )
    : null;
  const roundedPerPerson = totalGroup
    ? {
        min: Math.round(totalGroup.min / travelers),
        max: Math.round(totalGroup.max / travelers),
      }
    : null;

  return (
    <section
      className="cost-estimate-panel"
      aria-label={`Estimated cost for ${recommendation.destination}`}
    >
      <div className="cost-estimate-heading">
        <div>
          <p className="eyebrow">ESTIMATED COST · INR</p>
          <h3>Plan your budget</h3>
        </div>
        <span className="cost-estimate-badge">Research-based estimate</span>
      </div>
      {hotelPerNight ? (
        <div className="hotel-nightly-highlight">
          <BedDouble size={16} />
          <span>Hotel / room / night</span>
          <strong>{formatInrRange(hotelPerNight)}</strong>
        </div>
      ) : (
        <p className="cost-estimate-unavailable">
          No supported nightly hotel rate was found for these dates and preferences.
        </p>
      )}
      <dl className="cost-estimate-lines">
        {entries.map((entry) => (
          <div key={entry.label}>
            <dt>{entry.label}</dt>
            <dd>{entry.range ? formatInrRange(entry.range) : "Not reliably sourced"}</dd>
          </div>
        ))}
      </dl>
      <div className="cost-estimate-totals">
        <div>
          <span>Estimated per traveler</span>
          <strong>
            {roundedPerPerson ? formatInrRange(roundedPerPerson) : "Incomplete estimate"}
          </strong>
        </div>
        <div>
          <span>Estimated group · {travelers} travelers</span>
          <strong>{totalGroup ? formatInrRange(totalGroup) : "Incomplete estimate"}</strong>
        </div>
      </div>
      {cost.assumptions.length ? (
        <ul className="cost-estimate-assumptions">
          {cost.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      ) : null}
      <p className="cost-estimate-disclaimer">
        Estimates are not live quotes. Actual prices vary by exact dates, availability, room choice,
        and booking conditions. Totals appear only when every line item has a sourced range.
      </p>
    </section>
  );
}

function scaleRange(range: EstimateRange | null, multiplier: number): EstimateRange | null {
  if (!range) return null;
  return {
    min: Math.round(range.min * multiplier),
    max: Math.round(range.max * multiplier),
  };
}

function formatInrRange(range: EstimateRange): string {
  const format = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  return range.min === range.max
    ? format(range.min)
    : `${format(range.min)} – ${format(range.max)}`;
}
