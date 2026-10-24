import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, CloudSun, Loader2, MapPin, Send, Users } from "lucide-react";
import { toast } from "sonner";
import {
  askAssistant,
  createTrip,
  generateItinerary,
  getAssistantThread,
  getTrip,
  joinTrip,
  listTrips,
  toggleProgress,
  type TripCard,
} from "@/lib/travel.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookingOptions } from "@/components/BookingOptions";

type Search = { trip?: string };

export const Route = createFileRoute("/_authenticated/trips")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search["trip"] === "string" ? { trip: search["trip"] } : {},
  head: () => ({
    meta: [
      { title: "Group trips — DIRECT" },
      {
        name: "description",
        content: "Browse open group trips or start one for compatible travelers.",
      },
      { property: "og:title", content: "Group trips — DIRECT" },
      { property: "og:description", content: "Find a group trip or organize your own." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TripsPage,
});

function TripsPage() {
  const { trip: selectedTrip } = Route.useSearch();
  return selectedTrip ? <TripDetail tripId={selectedTrip} /> : <TripsList />;
}

function TripsList() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    title: "",
    destination: "",
    start_date: "",
    end_date: "",
    max_travelers: 6,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["trips", search],
    queryFn: () => listTrips({ data: { search } }),
  });

  const createMut = useMutation({
    mutationFn: () => createTrip({ data: { ...form, visibility: "public" } }),
    onSuccess: () => {
      toast.success("Trip created");
      setForm({ title: "", destination: "", start_date: "", end_date: "", max_travelers: 6 });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["my-trips"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create trip."),
  });
  const valid =
    form.title.trim().length >= 3 &&
    form.destination.trim().length >= 2 &&
    Boolean(form.start_date && form.end_date) &&
    form.end_date >= form.start_date;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="eyebrow">Group trips</p>
      <h1 className="mt-2 text-3xl">Find or start a group trip</h1>

      <form
        className="surface-card mt-8 grid gap-3 p-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) createMut.mutate();
        }}
      >
        <Input
          aria-label="Trip title"
          placeholder="Trip title"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          minLength={3}
          maxLength={120}
          required
        />
        <Input
          aria-label="Destination"
          placeholder="Destination (e.g. Moab, Utah)"
          value={form.destination}
          onChange={(event) => setForm({ ...form, destination: event.target.value })}
          minLength={2}
          maxLength={120}
          required
        />
        <Input
          type="date"
          aria-label="Start date"
          value={form.start_date}
          onChange={(event) => setForm({ ...form, start_date: event.target.value })}
          required
        />
        <Input
          type="date"
          aria-label="End date"
          value={form.end_date}
          min={form.start_date || undefined}
          onChange={(event) => setForm({ ...form, end_date: event.target.value })}
          required
        />
        <Input
          type="number"
          min={2}
          max={20}
          aria-label="Maximum travelers"
          value={form.max_travelers}
          onChange={(event) => setForm({ ...form, max_travelers: Number(event.target.value) || 2 })}
        />
        <Button type="submit" disabled={!valid || createMut.isPending}>
          {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Start trip
        </Button>
        {form.end_date && form.start_date && form.end_date < form.start_date && (
          <p role="alert" className="text-sm text-destructive md:col-span-2">
            The end date must be on or after the start date.
          </p>
        )}
      </form>

      <Input
        className="mt-8"
        aria-label="Search trips by destination"
        placeholder="Search by destination"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {isLoading ? (
        <Loader2
          aria-label="Loading trips"
          className="mt-8 h-5 w-5 animate-spin text-muted-foreground"
        />
      ) : isError ? (
        <div role="alert" className="surface-card mt-6 p-5">
          <p className="text-sm text-destructive">Could not load group trips.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {(data ?? []).map((trip) => (
            <TripCardView key={trip.id} trip={trip} />
          ))}
          {data?.length === 0 && (
            <p className="surface-card p-5 text-sm text-muted-foreground md:col-span-2">
              No trips match this destination yet. Try another search or start a group trip.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function TripCardView({ trip }: { trip: TripCard }) {
  const qc = useQueryClient();
  const joinMut = useMutation({
    mutationFn: () => joinTrip({ data: { tripId: trip.id } }),
    onSuccess: () => {
      toast.success("You joined the trip");
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["my-trips"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not join trip."),
  });

  return (
    <article className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">{trip.title}</h2>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {trip.destination}
          </p>
        </div>
        <Badge variant="secondary">{trip.status.replaceAll("_", " ")}</Badge>
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="h-3 w-3" /> {trip.memberCount}/{trip.max_travelers} travelers
        <span aria-hidden="true">·</span> {trip.start_date} → {trip.end_date}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/trips" search={{ trip: trip.id }}>
            View trip plan
          </Link>
        </Button>
        {!trip.isMember && (
          <Button
            size="sm"
            disabled={joinMut.isPending || trip.memberCount >= trip.max_travelers}
            onClick={() => joinMut.mutate()}
          >
            {joinMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {trip.memberCount >= trip.max_travelers ? "Group full" : "Join trip"}
          </Button>
        )}
      </div>
    </article>
  );
}

function TripDetail({ tripId }: { tripId: string }) {
  const { profile } = useRouteContext({ from: "/_authenticated" });
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const detail = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => getTrip({ data: { tripId } }),
  });
  const thread = useQuery({
    queryKey: ["assistant-thread", tripId],
    queryFn: () => getAssistantThread({ data: { tripId } }),
    enabled: Boolean(detail.data?.isMember && detail.data?.itinerary),
  });

  const generateMut = useMutation({
    mutationFn: () => generateItinerary({ data: { tripId } }),
    onSuccess: () => {
      toast.success("Suggested trip schedule is ready");
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["assistant-thread", tripId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not build schedule."),
  });
  const progressMut = useMutation({
    mutationFn: (data: { dayId: string; itemIndex: number; done: boolean }) =>
      toggleProgress({ data: { tripId, ...data } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update progress."),
  });
  const joinMut = useMutation({
    mutationFn: () => joinTrip({ data: { tripId } }),
    onSuccess: () => {
      toast.success("You joined the trip");
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["my-trips"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not join trip."),
  });
  const askMut = useMutation({
    mutationFn: (content: string) => askAssistant({ data: { tripId, message: content } }),
    onSuccess: () => {
      setMessage("");
      qc.invalidateQueries({ queryKey: ["assistant-thread", tripId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Travel AI is unavailable."),
  });

  if (detail.isLoading) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center px-4">
        <Loader2 aria-label="Loading trip" className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div role="alert" className="surface-card p-6">
          <h1 className="text-xl">Could not load this trip</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The trip may have been removed, or you may not have permission to view it.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/trips">Back to group trips</Link>
          </Button>
        </div>
      </main>
    );
  }

  const data = detail.data;
  const allItems = data.days.reduce((sum, day) => sum + day.items.length, 0);
  const myDone = data.progress.filter((item) => item.user_id === data.userId && item.done).length;
  const percent = allItems ? Math.round((myDone / allItems) * 100) : 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to="/trips">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> All group trips
        </Link>
      </Button>

      <header className="surface-card mt-3 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{data.trip.country || "Group trip"}</p>
            <h1 className="mt-2 text-3xl">{data.trip.title}</h1>
            <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {data.trip.destination}
            </p>
          </div>
          <Badge variant="secondary">{data.trip.status.replaceAll("_", " ")}</Badge>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span>
            {data.trip.start_date} → {data.trip.end_date}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" /> {data.members.length}/{data.trip.max_travelers} travelers
          </span>
          {data.trip.budget_level && <span>Budget: {data.trip.budget_level}</span>}
        </div>
        {data.trip.description && (
          <p className="mt-4 text-sm leading-relaxed">{data.trip.description}</p>
        )}
        {!data.isMember && (
          <Button
            className="mt-5"
            onClick={() => joinMut.mutate()}
            disabled={joinMut.isPending || data.members.length >= data.trip.max_travelers}
          >
            {joinMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {data.members.length >= data.trip.max_travelers ? "Group full" : "Join this trip"}
          </Button>
        )}
      </header>

      <BookingOptions
        destination={data.trip.destination}
        origin={profile?.home_city ?? null}
        startDate={data.trip.start_date}
        endDate={data.trip.end_date}
        travelers={Math.max(data.members.length, 1)}
        rooms={Math.ceil(Math.max(data.members.length, 1) / 2)}
      />

      <section className="mt-6 grid gap-5 md:grid-cols-[1fr_18rem]">
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Day-by-day plan</p>
              <h2 className="mt-1 text-2xl">
                {data.itinerary ? "Suggested schedule" : "Plan this trip"}
              </h2>
            </div>
            {data.isMember && (
              <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>
                {generateMut.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building schedule…
                  </>
                ) : data.itinerary ? (
                  "Regenerate suggestion"
                ) : (
                  "Generate schedule"
                )}
              </Button>
            )}
          </div>

          {data.itinerary ? (
            <div className="space-y-4">
              <article className="surface-card p-5">
                <p className="text-sm leading-relaxed">{data.itinerary.summary}</p>
                {data.itinerary.weather_overview && (
                  <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
                    <CloudSun className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{data.itinerary.weather_overview}</span>
                  </p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  AI-generated suggestion · Verify weather, hours, permits, and costs before travel.
                </p>
              </article>

              {data.days.map((day) => (
                <section key={day.id} className="surface-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="eyebrow">
                        Day {day.day_number}
                        {day.day_date ? ` · ${formatDate(day.day_date)}` : ""}
                      </p>
                      <h3 className="mt-1 text-xl">{day.title}</h3>
                    </div>
                    {day.weather_summary && <Badge variant="outline">{day.weather_summary}</Badge>}
                  </div>
                  {day.weather_temp_high !== null && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Weather source summary · high {day.weather_temp_high}°C · low{" "}
                      {day.weather_temp_low ?? "—"}°C
                    </p>
                  )}
                  <ol className="mt-5 space-y-4 border-l border-border pl-4">
                    {day.items.map((item, index) => {
                      const isDone = data.progress.some(
                        (entry) =>
                          entry.user_id === data.userId &&
                          entry.day_id === day.id &&
                          entry.item_index === index &&
                          entry.done,
                      );
                      return (
                        <li key={`${day.id}-${index}`} className="relative">
                          <span className="absolute -left-[1.33rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-primary">{item.time}</p>
                              <h4
                                className={`mt-1 font-medium ${isDone ? "text-muted-foreground line-through" : ""}`}
                              >
                                {item.title}
                              </h4>
                              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                {item.description}
                              </p>
                              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                                {item.location && <span>{item.location}</span>}
                                {item.cost_estimate && <span>{item.cost_estimate} · estimate</span>}
                                {item.indoor && <span>Indoors</span>}
                              </p>
                            </div>
                            {data.isMember && (
                              <Button
                                size="sm"
                                variant={isDone ? "secondary" : "outline"}
                                onClick={() =>
                                  progressMut.mutate({
                                    dayId: day.id,
                                    itemIndex: index,
                                    done: !isDone,
                                  })
                                }
                                disabled={progressMut.isPending}
                                aria-label={`${isDone ? "Mark incomplete" : "Mark complete"}: ${item.title}`}
                              >
                                <Check className="mr-1.5 h-4 w-4" />
                                {isDone ? "Done" : "Complete"}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <div className="surface-card p-6">
              <p className="text-sm text-muted-foreground">
                Create a suggested day-by-day schedule for your group. AI planning requires a
                server-side Gemini or Groq key.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <section className="surface-card p-5">
            <p className="eyebrow">Your progress</p>
            <p className="mt-2 font-display text-3xl">{percent}%</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {myDone} of {allItems} activities marked complete
            </p>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label="Personal trip progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </section>

          <section className="surface-card p-5">
            <p className="eyebrow">Travel group</p>
            <ul className="mt-3 space-y-2">
              {data.members.map((member) => (
                <li key={member.user_id} className="flex items-center gap-2 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs">
                    {(member.profile?.display_name ?? "T").slice(0, 1).toUpperCase()}
                  </span>
                  <span>{member.profile?.display_name ?? "Traveler"}</span>
                  {member.role === "organizer" && <Badge variant="outline">Organizer</Badge>}
                </li>
              ))}
            </ul>
          </section>

          {data.isMember && data.itinerary && (
            <section className="surface-card p-5">
              <p className="eyebrow">Travel AI</p>
              <h2 className="mt-1 text-lg">Ask about your trip</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                AI suggestions can be wrong. Check official sources for safety-critical details.
              </p>
              <div className="mt-4 max-h-72 space-y-3 overflow-y-auto" aria-live="polite">
                {thread.data?.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-lg p-3 text-sm ${entry.role === "assistant" ? "bg-secondary" : "border border-border"}`}
                  >
                    <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                      {entry.role === "assistant" ? "Travel AI" : "You"}
                    </p>
                    <p className="whitespace-pre-wrap">{entry.content}</p>
                  </div>
                ))}
                {thread.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    Could not load the assistant conversation.
                  </p>
                )}
              </div>
              <form
                className="mt-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const trimmed = message.trim();
                  if (trimmed) askMut.mutate(trimmed);
                }}
              >
                <Textarea
                  aria-label="Ask Travel AI about this trip"
                  placeholder="What should we do if it rains?"
                  rows={3}
                  maxLength={2000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={!message.trim() || askMut.isPending}
                >
                  {askMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send question
                </Button>
              </form>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}

function formatDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(parsed);
}
