import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { TravelPageBanner } from "@/components/TravelPageBanner";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    try {
      return await apiRequest<{
        userId: string;
        profile: { display_name: string; home_city: string | null } | null;
        preferences: unknown;
      }>("/me");
    } catch {
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isDashboard = pathname === "/dashboard";
  const page =
    pathname === "/discover"
      ? "discover"
      : pathname === "/ideas"
        ? "ideas"
        : pathname === "/profile"
          ? "profile"
          : pathname === "/trips" || pathname.startsWith("/trips/")
            ? "trips"
            : null;

  return (
    <div className={`authenticated-shell${isDashboard ? " is-dashboard" : ""}`}>
      {isDashboard ? null : <AppHeader />}
      <div className="authenticated-main">
        {page ? <TravelPageBanner page={page} /> : null}
        <Outlet />
      </div>
    </div>
  );
}
