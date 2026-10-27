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
import type { ReactNode } from "react";
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
    try {
      await queryClient.cancelQueries();
      await apiRequest<void>("/auth/logout", { method: "POST" });

      // Remove cached data belonging to the signed-in user.
      queryClient.clear();
      notifyAuthChange();
      await navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  return (
    <div className="crystal-dashboard">
      <aside className={`crystal-sidebar${mobileNavOpen ? " is-open" : ""}`}>
        <div className="crystal-brand">
