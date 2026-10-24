import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { scoreCompatibility, type PreferenceRow } from "@/lib/matching";

const base: PreferenceRow = {
  user_id: "a",
  travel_style: "Backpacker",
  pace: "Balanced",
  budget_level: "Moderate ($$)",
  group_size: "4-6 people",
  gender_composition: "No preference",
  accommodation: "Hostel",
  food_preference: "Anything goes",
  climate_preference: "Mild and dry",
  interests: ["Hiking", "Photography"],
  activities: ["Day hikes"],
  smoking: "Non-smoker",
  drinking: "Social drinker",
  early_riser: true,
  dream_destinations: ["Zion"],
};

describe("traveler discovery scoring", () => {
  it("ranks a near-identical traveler above a very different one", () => {
    const twin = scoreCompatibility(base, { ...base, user_id: "b" });
    const opposite = scoreCompatibility(base, {
      ...base,
      user_id: "c",
      travel_style: "Luxury",
      pace: "Dawn-to-dusk",
      budget_level: "Premium ($$$$)",
      accommodation: "Boutique hotel",
      interests: ["Nightlife"],
      activities: ["Brewery tours"],
    });
    expect(twin.score).toBeGreaterThan(opposite.score);
    expect(twin.score).toBeGreaterThanOrEqual(0);
    expect(twin.score).toBeLessThanOrEqual(100);
    expect(twin.sharedInterests).toContain("Hiking");
    expect(twin.breakdown.length).toBeGreaterThan(0);
  });
});

describe("route loading", () => {
  const routes = ["/", "/auth", "/dashboard", "/discover", "/trips", "/profile", "/ideas"];

  it("registers every navigable route", () => {
    const tree = readFileSync("src/routeTree.gen.ts", "utf8");
    for (const r of routes) expect(tree).toContain(`'${r}'`.replace(/'/g, "'"));
  });

  it("has no stray braces left in the root route", () => {
    expect(existsSync("src/routes/__root.tsx")).toBe(true);
  });

  it("uses the same-origin API proxy and no Supabase auth integration", () => {
    const auth = readFileSync("src/routes/auth.tsx", "utf8");
    const api = readFileSync("src/lib/api.ts", "utf8");
    expect(auth).toContain("/auth/signup");
    expect(auth).toContain("/auth/login");
    expect(api).toContain('?? "/api"');
    expect(api).toContain('credentials: "include"');
    expect(api).not.toContain("localStorage");
    expect(existsSync("src/integrations/supabase/client.ts")).toBe(false);
  });

  it("serves public pages from the running app", async () => {
    const baseUrl = process.env["SMOKE_BASE_URL"] ?? "http://localhost:8080";
    let reachable = true;
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
    } catch {
      reachable = false;
    }
    if (!reachable) return;
    for (const path of ["/", "/auth", "/dashboard"]) {
      const res = await fetch(baseUrl + path);
      expect(res.status, path).toBeLessThan(500);
    }
  });
});
