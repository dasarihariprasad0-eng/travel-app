import { createFileRoute, Link } from "@tanstack/react-router";
import { PlaneTakeoff, CloudSun, Users, Sparkles, MapPinned, ShieldCheck } from "lucide-react";
import heroImage from "@/assets/hero-alpine.jpg";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DIRECT — Travel with people who travel like you" },
      {
        name: "description",
        content:
          "DIRECT matches you with compatible travelers by style, pace, budget and interests, then builds a weather-aware group itinerary you can follow day by day.",
      },
      { property: "og:title", content: "DIRECT — Travel with people who travel like you" },
      {
        property: "og:description",
        content:
          "Traveler matching, group trip planning, weather-aware AI itineraries and trip tracking in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STEPS = [
  {
    icon: Users,
    title: "Match on mindset, not just maps",
    body: "Tell DIRECT how you travel — pace, budget, stays, food, habits, interests — and see compatibility scores with real reasons behind them.",
  },
  {
    icon: MapPinned,
    title: "Form the group, pick the place",
    body: "Start a group trip or join one that fits. Every group shows size limits, dates, budget level and who is already in.",
  },
  {
    icon: CloudSun,
    title: "Weather-aware day plans",
    body: "Itineraries are generated against the real forecast for your dates, with indoor swaps when the weather turns.",
  },
  {
    icon: Sparkles,
    title: "Ask your travel assistant",
    body: "Chat about the destination and your own itinerary, with answers grounded in the plan your group is actually following.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
          <div className="flex items-center gap-2">
            <PlaneTakeoff className="h-5 w-5 text-primary" strokeWidth={2.2} />
            <span className="font-display text-lg tracking-tight">DIRECT</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Get started
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative">
        <img
          src={heroImage}
          alt="A small group hiking a ridge trail above an alpine lake at sunrise"
          width={1920}
          height={1088}
          className="h-[78vh] min-h-[520px] w-full object-cover"
        />
        <div className="hero-veil absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-4 pb-14">
            <p className="eyebrow">Group travel, India</p>
            <h1 className="mt-3 max-w-3xl text-4xl leading-[1.05] sm:text-6xl">
              Travel with people who travel like you.
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              DIRECT finds compatible travelers, forms your group, and turns the trip into a
              weather-aware day-by-day plan you can actually follow.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Create your travel profile
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/trips">Browse group trips</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 max-w-2xl text-3xl sm:text-4xl">
          From a preference profile to a plan your whole group agrees on.
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {STEPS.map((step) => (
            <article key={step.title} className="surface-card p-6">
              <step.icon className="h-5 w-5 text-primary" strokeWidth={2.2} />
              <h3 className="mt-4 text-xl">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="surface-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <ShieldCheck className="h-6 w-6 shrink-0 text-primary" strokeWidth={2.2} />
          <div>
            <h3 className="text-lg">You stay in control of what you share</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Your preferences drive matching, connection requests are always yours to accept or
              decline, and private trips stay visible only to their group. No internet-connected
              service can promise absolute security, so we keep what we collect minimal and
              purposeful.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-display text-base text-foreground">DIRECT</span>
          <span>
            Live weather by OpenWeather. Web research by Tavily. AI planning by Gemini and Travel
            Companion by Groq. Verify critical travel details before you travel.
          </span>
        </div>
      </footer>
    </div>
  );
}
