import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, MapPin, UserPlus, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { findMatches, listConnections, respondConnection, sendConnection } from "@/lib/travel.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({
    meta: [
      { title: "Compatible travelers — DIRECT" },
      {
        name: "description",
        content:
          "See travelers ranked by how well their style, pace, budget and interests match yours.",
      },
      { property: "og:title", content: "Compatible travelers — DIRECT" },
      {
        property: "og:description",
        content: "Compatibility scores with the reasons behind every match.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const queryClient = useQueryClient();
  const [minScore, setMinScore] = useState(0);
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["matches"],
    queryFn: findMatches,
  });
  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: listConnections,
  });

  const connectMutation = useMutation({
    mutationFn: (toUser: string) => sendConnection({ data: { toUser } }),
    onSuccess: () => {
      toast.success("Connection request sent");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: () => toast.error("Could not send that request."),
  });

  const respondMutation = useMutation({
    mutationFn: (input: { id: string; status: "accepted" | "declined" }) =>
      respondConnection({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: () => toast.error("Could not update that request."),
  });

  const incoming = (connections ?? []).filter((c) => !c.outgoing && c.status === "pending");

  const filtered = useMemo(() => {
    const matches = data?.matches ?? [];
    return matches.filter((m) => {
      if (m.score < minScore) return false;
      if (!search) return true;
      const haystack = [
        m.profile.display_name,
        m.profile.home_city,
        m.profile.home_state,
        ...(m.preferences.interests ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [data, minScore, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="eyebrow">Traveler matching</p>
      <h1 className="mt-2 text-3xl">Travelers who fit how you travel</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Scores compare your style, pace, budget, stays, climate, interests, activities and daily
        habits. Every card shows what drove the number.
      </p>

      {isError && (
        <div role="alert" className="surface-card mt-6 p-5">
          <p className="text-sm text-destructive">Could not load traveler matches.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      )}

      {incoming.length > 0 && (
        <section className="surface-card mt-8 p-5">
          <h2 className="text-lg">Connection requests</h2>
          <div className="mt-4 space-y-3">
            {incoming.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3"
              >
                <span className="text-sm font-medium">{c.other?.display_name ?? "A traveler"}</span>
                <span className="text-sm text-muted-foreground">wants to connect</span>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => respondMutation.mutate({ id: c.id, status: "accepted" })}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respondMutation.mutate({ id: c.id, status: "declined" })}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1">
          <Input
            placeholder="Search by name, city or interest"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {[0, 50, 70, 85].map((v) => (
            <Button
              key={v}
              size="sm"
              variant={minScore === v ? "default" : "outline"}
              onClick={() => setMinScore(v)}
            >
              {v === 0 ? "All" : `${v}%+`}
            </Button>
          ))}
        </div>
      </div>

      {!data?.ready && (
        <div className="surface-card mt-6 p-6">
          <h2 className="text-lg">Set your preferences first</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Matching needs your travel style, pace and interests before it can rank anyone.
          </p>
          <Button asChild className="mt-4">
            <Link to="/profile">Fill in preferences</Link>
          </Button>
        </div>
      )}

      {data?.ready && filtered.length === 0 && (
        <div className="surface-card mt-6 p-6">
          <h2 className="text-lg">No travelers to show yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            As more people complete their profiles they will appear here, ranked against yours. In
            the meantime you can start a group trip and let travelers find you.
          </p>
          <Button asChild className="mt-4">
            <Link to="/trips">Start a group trip</Link>
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {filtered.map((match) => (
          <article key={match.profile.id} className="surface-card p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary font-display text-base text-secondary-foreground">
                {match.profile.display_name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg">{match.profile.display_name}</h2>
                {(match.profile.home_city || match.profile.home_state) && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {[match.profile.home_city, match.profile.home_state].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <div className="ml-auto text-right">
                <p className="font-display text-2xl leading-none text-primary">{match.score}%</p>
                <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  match
                </p>
              </div>
            </div>

            {match.profile.bio && (
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{match.profile.bio}</p>
            )}

            <div className="mt-4 space-y-2">
              {match.breakdown
                .slice()
                .sort((a, b) => b.score - a.score)
                .slice(0, 4)
                .map((b) => (
                  <div key={b.label} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{b.label}</span>
                    <Progress value={b.score} className="h-1.5 flex-1" />
                    <span className="w-28 shrink-0 truncate text-right text-xs text-muted-foreground">
                      {b.detail}
                    </span>
                  </div>
                ))}
            </div>

            {match.sharedInterests.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {match.sharedInterests.slice(0, 5).map((interest) => (
                  <Badge key={interest} variant="secondary">
                    {interest}
                  </Badge>
                ))}
              </div>
            )}

            <div className="mt-5">
              {match.connection ? (
                <Button variant="outline" size="sm" disabled className="w-full">
                  {match.connection.status === "accepted" ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4" /> Connected
                    </>
                  ) : match.connection.status === "declined" ? (
                    "Not connected"
                  ) : (
                    <>
                      <Clock className="mr-1.5 h-4 w-4" />
                      {match.connection.outgoing ? "Request sent" : "Awaiting your reply"}
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="w-full"
                  disabled={connectMutation.isPending}
                  onClick={() => connectMutation.mutate(match.profile.id)}
                >
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Send connection request
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
