import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMyProfile, saveMyProfile } from "@/lib/travel.api";
import { ChipGroup } from "@/components/ChipGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  ACCOMMODATIONS,
  ACTIVITIES,
  AGE_RANGES,
  BUDGET_LEVELS,
  CLIMATE_PREFERENCES,
  DRINKING,
  FOOD_PREFERENCES,
  GENDERS,
  GENDER_COMPOSITIONS,
  GROUP_SIZES,
  INTERESTS,
  PACES,
  SMOKING,
  TRAVEL_STYLES,
} from "@/lib/travel-options";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Travel preferences — DIRECT" },
      {
        name: "description",
        content: "Set how you travel so DIRECT can match you with compatible travelers and groups.",
      },
      { property: "og:title", content: "Travel preferences — DIRECT" },
      {
        property: "og:description",
        content: "Your style, pace, budget and interests drive every match DIRECT suggests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

type Form = {
  display_name: string;
  home_city: string;
  home_state: string;
  bio: string;
  age_range: string;
  gender: string;
  travel_style: string;
  pace: string;
  budget_level: string;
  group_size: string;
  gender_composition: string;
  accommodation: string;
  food_preference: string;
  climate_preference: string;
  hotel_budget_per_night: string;
  smoking: string;
  drinking: string;
  early_riser: boolean;
  interests: string[];
  activities: string[];
};

const EMPTY: Form = {
  display_name: "",
  home_city: "",
  home_state: "",
  bio: "",
  age_range: "",
  gender: "",
  travel_style: "",
  pace: "",
  budget_level: "",
  group_size: "",
  gender_composition: "",
  accommodation: "",
  food_preference: "",
  climate_preference: "",
  hotel_budget_per_night: "",
  smoking: "",
  drinking: "",
  early_riser: false,
  interests: [],
  activities: [],
};

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [destinationText, setDestinationText] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-profile"],
    queryFn: getMyProfile,
  });

  useEffect(() => {
    if (!data) return;
    const p = data.profile;
    const pref = data.preferences;
    setForm({
      display_name: p?.display_name ?? "",
      home_city: p?.home_city ?? "",
      home_state: p?.home_state ?? "",
      bio: p?.bio ?? "",
      age_range: p?.age_range ?? "",
      gender: p?.gender ?? "",
      travel_style: pref?.travel_style ?? "",
      pace: pref?.pace ?? "",
      budget_level: pref?.budget_level ?? "",
      group_size: pref?.group_size ?? "",
      gender_composition: pref?.gender_composition ?? "",
      accommodation: pref?.accommodation ?? "",
      food_preference: pref?.food_preference ?? "",
      climate_preference: pref?.climate_preference ?? "",
      hotel_budget_per_night:
        pref?.hotel_budget_per_night === null || pref?.hotel_budget_per_night === undefined
          ? ""
          : String(pref.hotel_budget_per_night),
      smoking: pref?.smoking ?? "",
      drinking: pref?.drinking ?? "",
      early_riser: pref?.early_riser ?? false,
      interests: pref?.interests ?? [],
      activities: pref?.activities ?? [],
    });
    setDestinationText((pref?.dream_destinations ?? []).join(", "));
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      saveMyProfile({
        data: {
          profile: {
            display_name: form.display_name.trim() || "Traveler",
            home_city: form.home_city || null,
            home_state: form.home_state || null,
            bio: form.bio || null,
            age_range: form.age_range || null,
            gender: form.gender || null,
          },
          preferences: {
            travel_style: form.travel_style || null,
            pace: form.pace || null,
            budget_level: form.budget_level || null,
            group_size: form.group_size || null,
            gender_composition: form.gender_composition || null,
            accommodation: form.accommodation || null,
            food_preference: form.food_preference || null,
            climate_preference: form.climate_preference || null,
            hotel_budget_per_night: form.hotel_budget_per_night
              ? Number(form.hotel_budget_per_night)
              : null,
            smoking: form.smoking || null,
            drinking: form.drinking || null,
            early_riser: form.early_riser,
            interests: form.interests,
            activities: form.activities,
            dream_destinations: destinationText
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          },
        },
      }),
    onSuccess: () => {
      toast.success("Preferences saved");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      navigate({ to: "/discover" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save."),
  });
  const nightlyBudget = form.hotel_budget_per_night ? Number(form.hotel_budget_per_night) : null;
  const validNightlyBudget =
    nightlyBudget === null ||
    (Number.isSafeInteger(nightlyBudget) && nightlyBudget >= 1 && nightlyBudget <= 1_000_000);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div role="alert" className="surface-card p-6">
          <h1 className="text-xl">Could not load your preferences</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your saved profile has not been changed. Try loading it again.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow">Your travel identity</p>
      <h1 className="mt-2 text-3xl">Preferences</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
        The more of this you fill in, the sharper your matches and group itineraries get. Only your
        display name, home area, bio and travel preferences are visible to other travelers.
      </p>

      <div className="mt-8 space-y-6">
        <section className="surface-card p-6">
          <h2 className="text-xl">About you</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="home_city">Home city</Label>
              <Input
                id="home_city"
                value={form.home_city}
                onChange={(e) => setForm({ ...form, home_city: e.target.value })}
                placeholder="Denver"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="home_state">State</Label>
              <Input
                id="home_state"
                value={form.home_state}
                onChange={(e) => setForm({ ...form, home_state: e.target.value })}
                placeholder="Colorado"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bio">Short bio</Label>
              <Textarea
                id="bio"
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="What kind of trips you love, and what you are looking for in a group."
              />
            </div>
          </div>
          <div className="mt-5 space-y-4">
            <Field label="Age range">
              <ChipGroup
                options={AGE_RANGES}
                value={form.age_range}
                onChange={(v) => setForm({ ...form, age_range: v as string })}
              />
            </Field>
            <Field label="Gender (optional)">
              <ChipGroup
                options={GENDERS}
                value={form.gender}
                onChange={(v) => setForm({ ...form, gender: v as string })}
              />
            </Field>
          </div>
        </section>

        <section className="surface-card space-y-5 p-6">
          <h2 className="text-xl">How you travel</h2>
          <Field label="Travel style">
            <ChipGroup
              options={TRAVEL_STYLES}
              value={form.travel_style}
              onChange={(v) => setForm({ ...form, travel_style: v as string })}
            />
          </Field>
          <Field label="Preferred pace">
            <ChipGroup
              options={PACES}
              value={form.pace}
              onChange={(v) => setForm({ ...form, pace: v as string })}
            />
          </Field>
          <Field label="Budget level">
            <ChipGroup
              options={BUDGET_LEVELS}
              value={form.budget_level}
              onChange={(v) => setForm({ ...form, budget_level: v as string })}
            />
          </Field>
          <Field label="Preferred group size">
            <ChipGroup
              options={GROUP_SIZES}
              value={form.group_size}
              onChange={(v) => setForm({ ...form, group_size: v as string })}
            />
          </Field>
          <Field label="Group composition">
            <ChipGroup
              options={GENDER_COMPOSITIONS}
              value={form.gender_composition}
              onChange={(v) => setForm({ ...form, gender_composition: v as string })}
            />
          </Field>
          <Field label="Where you like to stay">
            <ChipGroup
              options={ACCOMMODATIONS}
              value={form.accommodation}
              onChange={(v) => setForm({ ...form, accommodation: v as string })}
            />
          </Field>
          <div className="space-y-1.5">
            <Label htmlFor="hotel-budget-per-night">
              Preferred hotel budget per room, per night (₹)
            </Label>
            <Input
              id="hotel-budget-per-night"
              type="number"
              inputMode="numeric"
              min={1}
              max={1_000_000}
              step={500}
              value={form.hotel_budget_per_night}
              onChange={(event) => setForm({ ...form, hotel_budget_per_night: event.target.value })}
              placeholder="e.g. 3500"
              aria-invalid={!validNightlyBudget}
            />
            <p className="text-xs text-muted-foreground">
              Optional nightly target for a room. Destination estimates will be compared with it;
              actual hotel rates vary by date and availability.
            </p>
            {!validNightlyBudget ? (
              <p role="alert" className="text-xs text-destructive">
                Enter a whole-rupee amount between ₹1 and ₹10,00,000.
              </p>
            ) : null}
          </div>
          <Field label="Food">
            <ChipGroup
              options={FOOD_PREFERENCES}
              value={form.food_preference}
              onChange={(v) => setForm({ ...form, food_preference: v as string })}
            />
          </Field>
          <Field label="Climate you enjoy">
            <ChipGroup
              options={CLIMATE_PREFERENCES}
              value={form.climate_preference}
              onChange={(v) => setForm({ ...form, climate_preference: v as string })}
            />
          </Field>
        </section>

        <section className="surface-card space-y-5 p-6">
          <h2 className="text-xl">Interests and habits</h2>
          <Field label="Interests">
            <ChipGroup
              multi
              options={INTERESTS}
              value={form.interests}
              onChange={(v) => setForm({ ...form, interests: v as string[] })}
            />
          </Field>
          <Field label="Activities you want on the plan">
            <ChipGroup
              multi
              options={ACTIVITIES}
              value={form.activities}
              onChange={(v) => setForm({ ...form, activities: v as string[] })}
            />
          </Field>
          <Field label="Smoking">
            <ChipGroup
              options={SMOKING}
              value={form.smoking}
              onChange={(v) => setForm({ ...form, smoking: v as string })}
            />
          </Field>
          <Field label="Drinking">
            <ChipGroup
              options={DRINKING}
              value={form.drinking}
              onChange={(v) => setForm({ ...form, drinking: v as string })}
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Early riser</p>
              <p className="text-xs text-muted-foreground">
                Helps match you with groups that keep similar hours.
              </p>
            </div>
            <Switch
              checked={form.early_riser}
              onCheckedChange={(checked) => setForm({ ...form, early_riser: checked })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dreams">Dream destinations</Label>
            <Input
              id="dreams"
              value={destinationText}
              onChange={(e) => setDestinationText(e.target.value)}
              placeholder="Zion, Big Sur, New Orleans"
            />
            <p className="text-xs text-muted-foreground">Separate with commas.</p>
          </div>
        </section>

        <div className="flex justify-end gap-3 pb-4">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !validNightlyBudget}
            size="lg"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save preferences
          </Button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {children}
    </div>
  );
}
