import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ArrowDownUp,
  Globe2,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  LogOut,
  Map,
  MapPin,
  Menu,
  Plane,
  PlaneTakeoff,
  Search,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import heroImage from "@/assets/hero-alpine.jpg";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { apiRequest, notifyAuthChange } from "@/lib/api";
import { listMyTrips, type TripCard } from "@/lib/travel.api";
import { researchFlights } from "@/lib/flight-research.api";

const EMPTY_TRIPS: TripCard[] = [];

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — DIRECT" },
      { name: "description", content: "Your group trips, travel plans, and activity at a glance." },
      { property: "og:title", content: "Dashboard — DIRECT" },
      { property: "og:description", content: "Your group trips and travel plans at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { profile } = useRouteContext({ from: "/_authenticated" });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-trips"],
    queryFn: listMyTrips,
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [flightOrigin, setFlightOrigin] = useState(profile?.home_city ?? "");
  const [flightDestination, setFlightDestination] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const flightResearch = useMutation({
    mutationFn: () =>
      researchFlights({
        origin: flightOrigin.trim(),
        destination: flightDestination.trim(),
        departureDate: flightDate || null,
      }),
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trips = data ?? EMPTY_TRIPS;
  const stats = useMemo(() => getTripStats(trips), [trips]);
  const chartData = useMemo(() => getChartData(trips), [trips]);
  async function signOut() {
    await queryClient.cancelQueries();
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      queryClient.clear();
      notifyAuthChange();
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  return (
    <div className="crystal-dashboard">
      <aside className={`crystal-sidebar${mobileNavOpen ? " is-open" : ""}`}>
        <div className="crystal-brand">
          <span className="crystal-brand-mark">
            <PlaneTakeoff size={20} strokeWidth={2.1} />
          </span>
          <span>
            direct<span className="crystal-brand-period">.</span>
          </span>
          <button
            className="crystal-mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="crystal-workspace">
          <span className="crystal-workspace-icon">D</span>
          <span className="crystal-workspace-name">My journeys</span>
          <ChevronDown size={14} />
        </div>

        <p className="crystal-nav-label">Workspace</p>
        <nav className="crystal-nav" aria-label="Main navigation">
          <Link to="/dashboard" className="crystal-nav-link is-active">
            <LayoutDashboard size={17} />
            <span>Overview</span>
            <span className="crystal-nav-indicator" />
          </Link>
          <Link to="/discover" className="crystal-nav-link">
            <Users size={17} />
            <span>Travelers</span>
          </Link>
          <Link to="/trips" className="crystal-nav-link">
            <Map size={17} />
            <span>Group trips</span>
          </Link>
          <Link to="/ideas" className="crystal-nav-link">
            <Lightbulb size={17} />
            <span>Explore ideas</span>
          </Link>
        </nav>

        <p className="crystal-nav-label crystal-nav-label-spaced">Personal</p>
        <nav className="crystal-nav" aria-label="Personal navigation">
          <Link to="/profile" className="crystal-nav-link">
            <Globe2 size={17} />
            <span>Travel preferences</span>
          </Link>
        </nav>

        <div className="crystal-sidebar-spacer" />
        <div className="crystal-sidebar-tip">
          <span className="crystal-tip-icon">
            <Lightbulb size={17} />
          </span>
          <p>Good trips start with good company.</p>
          <Link to="/discover">
            Find your people <ArrowRight size={13} />
          </Link>
        </div>
        <div className="crystal-sidebar-footer">
          <span className="crystal-avatar">
            {(profile?.display_name || "T").slice(0, 1).toUpperCase()}
          </span>
          <div className="crystal-user-meta">
            <strong>{profile?.display_name || "Traveler"}</strong>
            <span>{profile?.home_city || "Travel enthusiast"}</span>
          </div>
          <button
            className="crystal-signout"
            type="button"
            onClick={() => void signOut()}
            title="Sign out and switch accounts"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {mobileNavOpen ? (
        <button
          className="crystal-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <main className="crystal-main">
        <header className="crystal-topbar">
          <button
            className="crystal-mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="crystal-breadcrumb">
            <span>Workspace</span>
            <span className="crystal-breadcrumb-slash">/</span>
            <strong>Overview</strong>
          </div>
          <div className="crystal-topbar-actions">
            <Link to="/trips" className="crystal-search-link">
              <Search size={16} />
              <span>Find a trip</span>
              <kbd>↵</kbd>
            </Link>
            <span className="crystal-topbar-divider" />
            <span className="crystal-date">
              <CalendarDays size={15} /> {formatToday()}
            </span>
            <span className="crystal-avatar crystal-avatar-small">
              {(profile?.display_name || "T").slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>

        <div className="crystal-content">
          <section
            className="crystal-hero"
            style={{ backgroundImage: `url("${heroImage}")` }}
            aria-label="Plan a peaceful escape"
          >
            <div className="crystal-hero-copy">
              <p className="crystal-eyebrow">A SLOWER WAY TO SEE THE WORLD</p>
              <h1>Find your somewhere.</h1>
              <p>Thoughtful journeys, beautiful places, and room to breathe.</p>
            </div>
            <form
              className="crystal-flight-widget"
              aria-label="Search flight prices"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  flightOrigin.trim().length >= 2 &&
                  flightDestination.trim().length >= 2 &&
                  !flightResearch.isPending
                ) {
                  flightResearch.mutate();
                }
              }}
            >
              <label>
                <span>FROM</span>
                <input
                  aria-label="Departure city"
                  name="origin"
                  placeholder="Your city"
                  value={flightOrigin}
                  onChange={(event) => setFlightOrigin(event.target.value)}
                  required
                />
              </label>
              <span className="crystal-flight-swap" aria-hidden="true">
                <ArrowDownUp size={15} />
              </span>
              <label>
                <span>TO</span>
                <input
                  aria-label="Destination"
                  name="destination"
                  placeholder="Where to?"
                  value={flightDestination}
                  onChange={(event) => setFlightDestination(event.target.value)}
                  required
                />
              </label>
              <label className="crystal-flight-date">
                <span>WHEN</span>
                <input
                  aria-label="Departure date"
                  name="date"
                  type="date"
                  value={flightDate}
                  onChange={(event) => setFlightDate(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="crystal-flight-submit"
                disabled={
                  flightOrigin.trim().length < 2 ||
                  flightDestination.trim().length < 2 ||
                  flightResearch.isPending
                }
              >
                {flightResearch.isPending ? (
                  <Loader2 size={16} className="crystal-spin" />
                ) : (
                  <Search size={16} />
                )}
                <span>{flightResearch.isPending ? "Analyzing fares…" : "Analyze fares"}</span>
              </button>
            </form>
            <p className="crystal-flight-note">
              We’ll research external flight information and summarize the sources here.
            </p>
            <Link to="/trips" className="crystal-hero-trip-link">
              Planning with friends? Create a group trip <ArrowRight size={14} />
            </Link>
          </section>

          {flightResearch.isError ? (
            <section className="crystal-flight-research is-error" role="alert">
              <h2>Flight research is unavailable</h2>
              <p>
                {flightResearch.error instanceof Error
                  ? flightResearch.error.message
                  : "We could not analyze flight information right now."}
              </p>
            </section>
          ) : null}
          {flightResearch.data ? (
            <section className="crystal-flight-research" aria-live="polite">
              <div className="crystal-flight-research-heading">
                <div>
                  <p className="crystal-panel-kicker">EXTERNAL FLIGHT RESEARCH</p>
                  <h2>
                    {flightOrigin.trim()} <ArrowRight size={15} /> {flightDestination.trim()}
                  </h2>
                  {flightDate ? <p>Travel date: {flightDate}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => flightResearch.reset()}
                  aria-label="Dismiss flight research"
                >
                  <X size={17} />
                </button>
              </div>
              <p className="crystal-flight-summary">{flightResearch.data.summary}</p>
              {flightResearch.data.sources.length ? (
                <div className="crystal-flight-sources">
                  {flightResearch.data.sources.map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                      <strong>{source.title}</strong>
                      {source.excerpt ? <span>{source.excerpt}</span> : null}
                      <small>View source</small>
                    </a>
                  ))}
                </div>
              ) : null}
              <p className="crystal-flight-disclaimer">
                Research summaries are not live fare quotes. Confirm the final fare, baggage rules,
                availability, and fees directly with each provider.
              </p>
            </section>
          ) : null}

          {isError ? (
            <div className="crystal-error" role="alert">
              <span>We couldn’t load your trips just now.</span>
              <button onClick={() => void refetch()}>
                Try again <ArrowRight size={14} />
              </button>
            </div>
          ) : null}

          <section className="crystal-stats" aria-label="Travel metrics">
            <MetricCard
              label="Your group trips"
              value={isLoading ? "—" : String(stats.tripCount)}
              detail={
                stats.tripCount === 1
                  ? "One journey in your collection"
                  : "Journeys in your collection"
              }
              icon={<Plane size={18} />}
              highlight={
                stats.upcomingCount ? `${stats.upcomingCount} upcoming` : "Ready when you are"
              }
            />
            <MetricCard
              label="Travel companions"
              value={isLoading ? "—" : String(stats.travelerCount)}
              detail="People across your groups"
              icon={<Users size={18} />}
              highlight="Better together"
            />
            <MetricCard
              label="Places on your map"
              value={isLoading ? "—" : String(stats.destinationCount)}
              detail="Unique destinations across trips"
              icon={<MapPin size={18} />}
              highlight={stats.destinationCount ? "Keep exploring" : "A world to discover"}
            />
          </section>

          <section className="crystal-panel crystal-chart-panel">
            <div className="crystal-panel-heading">
              <div>
                <p className="crystal-panel-kicker">YOUR TRAVEL PULSE</p>
                <h2>Journeys through the year</h2>
              </div>
              <span className="crystal-chart-legend">
                <i /> Trips planned
              </span>
            </div>
            {isLoading ? (
              <div className="crystal-chart-loading">
                <Loader2 size={20} className="crystal-spin" /> Gathering your journeys…
              </div>
            ) : (
              <>
                <div className="crystal-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 10, right: 10, left: -18, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="crystal-area-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#81927b" stopOpacity={0.24} />
                          <stop offset="100%" stopColor="#81927b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#817d72", fontSize: 11 }}
                        dy={10}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#817d72", fontSize: 11 }}
                        width={34}
                      />
                      <Tooltip
                        content={<TripChartTooltip />}
                        cursor={{ stroke: "rgba(129,146,123,0.28)" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="trips"
                        name="Trips planned"
                        stroke="#81927b"
                        strokeWidth={2.5}
                        fill="url(#crystal-area-fill)"
                        activeDot={{ r: 5, stroke: "#f8f5ed", strokeWidth: 3, fill: "#81927b" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {!trips.length ? (
                  <p className="crystal-chart-empty">Your trip activity will take shape here.</p>
                ) : null}
              </>
            )}
          </section>

          <section className="crystal-panel crystal-activity-panel">
            <div className="crystal-panel-heading crystal-activity-heading">
              <div>
                <p className="crystal-panel-kicker">TRIP ACTIVITY</p>
                <h2>Your trips</h2>
              </div>
              <Link to="/trips" className="crystal-text-link">
                View all trips <ArrowRight size={15} />
              </Link>
            </div>

            {isLoading ? (
              <div className="crystal-activity-loading">
                <Loader2 size={19} className="crystal-spin" /> Loading your travel plans…
              </div>
            ) : trips.length ? (
              <div className="crystal-table-wrap">
                <table className="crystal-table">
                  <thead>
                    <tr>
                      <th>TRIP</th>
                      <th>DESTINATION</th>
                      <th>DATES</th>
                      <th>TRAVELERS</th>
                      <th>STATUS</th>
                      <th>
                        <span className="sr-only">Open trip</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.slice(0, 5).map((trip) => (
                      <TripRow key={trip.id} trip={trip} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="crystal-empty-state">
                <span className="crystal-empty-icon">
                  <Map size={19} />
                </span>
                <div>
                  <strong>Your next great story starts here.</strong>
                  <p>You haven’t joined or created a group trip yet.</p>
                </div>
                <Link to="/trips" className="crystal-empty-link">
                  Explore trips <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </section>

          <footer className="crystal-footer">
            <span>Made for the journeys that bring us closer.</span>
            <Link to="/ideas">
              Find a little inspiration <ArrowUpRight size={13} />
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  highlight: string;
}) {
  return (
    <article className="crystal-panel crystal-metric-card">
      <div className="crystal-metric-top">
        <span>{label}</span>
        <span className="crystal-metric-icon">{icon}</span>
      </div>
      <div className="crystal-metric-value">{value}</div>
      <div className="crystal-metric-bottom">
        <span>{detail}</span>
        <span className="crystal-metric-trend">
          <i />
          {highlight}
        </span>
      </div>
    </article>
  );
}

function TripRow({ trip }: { trip: TripCard }) {
  const status = trip.status.toLowerCase();
  const isComplete = status === "completed" || status === "complete";
  const isActive = status === "open" || status === "active" || status === "planning";

  return (
    <tr>
      <td>
        <span className="crystal-trip-title">{trip.title}</span>
        <span className="crystal-trip-owner">
          {trip.isOwner ? "Organized by you" : "Joined trip"}
        </span>
      </td>
      <td>
        <span className="crystal-trip-destination">
          <MapPin size={14} />
          {trip.destination}
        </span>
      </td>
      <td>
        <span className="crystal-trip-dates">
          {formatDateRange(trip.start_date, trip.end_date)}
        </span>
      </td>
      <td>
        <span className="crystal-traveler-count">
          <Users size={14} />
          {trip.memberCount}/{trip.max_travelers}
        </span>
      </td>
      <td>
        <span
          className={`crystal-status${isComplete ? " is-complete" : isActive ? " is-active" : ""}`}
        >
          <i />
          {capitalize(trip.status)}
        </span>
      </td>
      <td>
        <Link
          to="/trips"
          search={{ trip: trip.id }}
          className="crystal-row-link"
          aria-label={`Open ${trip.title}`}
        >
          <ArrowUpRight size={16} />
        </Link>
      </td>
    </tr>
  );
}

function TripChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="crystal-tooltip">
      <span>{label}</span>
      <strong>
        {payload[0].value} {payload[0].value === 1 ? "trip" : "trips"}
      </strong>
    </div>
  );
}

function getTripStats(trips: TripCard[]) {
  const destinations = new Set(
    trips.map((trip) => trip.destination.trim().toLocaleLowerCase()).filter(Boolean),
  );
  return {
    tripCount: trips.length,
    upcomingCount: trips.filter((trip) => {
      const status = trip.status.toLowerCase();
      return (
        new Date(`${trip.start_date}T00:00:00`).getTime() >= startOfToday() &&
        status !== "completed" &&
        status !== "cancelled"
      );
    }).length,
    travelerCount: trips.reduce((total, trip) => total + trip.memberCount, 0),
    destinationCount: destinations.size,
  };
}

function getChartData(trips: TripCard[]) {
  const now = new Date();
  const currentMonth = now.getFullYear() * 12 + now.getMonth();
  const tripMonths = trips
    .map((trip) => new Date(`${trip.start_date}T00:00:00`))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => date.getFullYear() * 12 + date.getMonth());
  const firstMonth = Math.min(currentMonth - 5, ...tripMonths);
  const lastMonth = Math.max(currentMonth + 1, ...tripMonths);
  const months = Array.from({ length: lastMonth - firstMonth + 1 }, (_, index) => {
    const monthIndex = firstMonth + index;
    const date = new Date(Math.floor(monthIndex / 12), monthIndex % 12, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(date),
      trips: 0,
    };
  });

  for (const trip of trips) {
    const date = new Date(`${trip.start_date}T00:00:00`);
    const month = months.find(
      (entry) =>
        entry.key === `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
    if (month) month.trips += 1;
  }
  return months;
}

function formatDateRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const sameMonth =
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear();
  const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  const startLabel = dateFormatter.format(startDate);
  if (sameMonth) {
    return `${startLabel}–${endDate.getDate()}, ${endDate.getFullYear()}`;
  }
  const endLabel = dateFormatter.format(endDate);
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  return startYear === endYear
    ? `${startLabel} – ${endLabel}, ${endYear}`
    : `${startLabel}, ${startYear} – ${endLabel}, ${endYear}`;
}

function formatToday() {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(
    new Date(),
  );
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function capitalize(value: string) {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}
