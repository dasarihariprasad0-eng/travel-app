import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, PlaneTakeoff } from "lucide-react";
import { toast } from "sonner";
import heroImage from "@/assets/hero-alpine.jpg";
import { apiRequest, notifyAuthChange, type AuthSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Search = { mode?: "signup" | "signin" };
type ResetStep = "request" | "verify" | "new-password";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): Search =>
    search["mode"] === "signup" ? { mode: "signup" } : {},
  head: () => ({
    meta: [
      { title: "Sign in — DIRECT" },
      {
        name: "description",
        content: "Sign in to DIRECT to match with compatible travelers and plan group trips.",
      },
      { property: "og:title", content: "Sign in — DIRECT" },
      { property: "og:description", content: "Access your DIRECT travel profile and group trips." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetStep, setResetStep] = useState<ResetStep | null>(null);
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void apiRequest("/me")
      .then(() => {
        if (active) navigate({ to: "/dashboard", replace: true });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (resetStep === "request") {
        const result = await apiRequest<{ message: string }>("/auth/forgot-password", {
          method: "POST",
          auth: false,
          body: { email },
        });
        toast.success(result.message);
        setResetStep("verify");
        return;
      }
      if (resetStep === "verify") {
        const result = await apiRequest<{ reset_token: string }>("/auth/verify-reset-code", {
          method: "POST",
          auth: false,
          body: { email, code },
        });
        setResetToken(result.reset_token);
        setResetStep("new-password");
        return;
      }
      if (resetStep === "new-password") {
        await apiRequest("/auth/reset-password", {
          method: "POST",
          auth: false,
          body: { email, reset_token: resetToken, password: newPassword },
        });
        toast.success("Password updated. Sign in with your new password.");
        setResetStep(null);
        setPassword("");
        setNewPassword("");
        setCode("");
        setResetToken("");
        return;
      }
      if (isSignUp) {
        await apiRequest<AuthSession>("/auth/signup", {
          method: "POST",
          auth: false,
          body: { email, password, display_name: displayName || email.split("@")[0] },
        });
        notifyAuthChange();
        navigate({ to: "/profile", replace: true });
      } else {
        await apiRequest<AuthSession>("/auth/login", {
          method: "POST",
          auth: false,
          body: { email, password },
        });
        notifyAuthChange();
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <Link to="/" className="flex items-center gap-2">
          <PlaneTakeoff className="h-5 w-5 text-primary" strokeWidth={2.2} />
          <span className="font-display text-lg tracking-tight">DIRECT</span>
        </Link>
      </div>

      <main className="auth-main flex flex-1 items-center justify-center px-4 py-10">
        <div className="auth-travel-layout">
          <section className="auth-travel-image">
            <img
              src={heroImage}
              alt="Travelers hiking a ridge trail above an alpine lake at sunrise"
            />
            <div className="auth-travel-image-veil" />
            <div className="auth-travel-image-copy">
              <p className="eyebrow">Go further, together</p>
              <h2>Find your kind of journey.</h2>
            </div>
          </section>
          <div className="surface-card auth-form-card w-full max-w-md p-7">
            <p className="eyebrow">
              {resetStep ? "Account recovery" : isSignUp ? "New traveler" : "Welcome back"}
            </p>
            <h1 className="mt-2 text-2xl">
              {resetStep === "request"
                ? "Reset your password"
                : resetStep === "verify"
                  ? "Check your email"
                  : resetStep === "new-password"
                    ? "Choose a new password"
                    : isSignUp
                      ? "Create your DIRECT account"
                      : "Sign in to DIRECT"}
            </h1>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {resetStep !== null ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      readOnly={resetStep !== "request"}
                    />
                  </div>
                  {resetStep === "verify" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-code">Six-digit verification code</Label>
                      <Input
                        id="reset-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      />
                      <p className="text-sm text-muted-foreground">
                        If an account exists, a code has been sent. It expires in 10 minutes.
                      </p>
                    </div>
                  )}
                  {resetStep === "new-password" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        required
                        minLength={8}
                        maxLength={128}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {isSignUp && (
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Display name</Label>
                      <Input
                        id="name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="How your group sees you"
                        autoComplete="name"
                        required
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                    />
                  </div>
                </>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {resetStep === "request"
                  ? "Send verification code"
                  : resetStep === "verify"
                    ? "Verify code"
                    : resetStep === "new-password"
                      ? "Update password"
                      : isSignUp
                        ? "Create account"
                        : "Sign in"}
              </Button>
            </form>

            {resetStep === null ? (
              <>
                {!isSignUp && (
                  <p className="mt-4 text-center text-sm">
                    <button
                      type="button"
                      className="text-foreground underline underline-offset-4"
                      onClick={() => setResetStep("request")}
                    >
                      Forgot password?
                    </button>
                  </p>
                )}
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  {isSignUp ? "Already have an account?" : "New to DIRECT?"}{" "}
                  <button
                    type="button"
                    className="text-foreground underline underline-offset-4"
                    onClick={() => setIsSignUp((v) => !v)}
                  >
                    {isSignUp ? "Sign in" : "Create one"}
                  </button>
                </p>
              </>
            ) : (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  className="text-foreground underline underline-offset-4"
                  onClick={() => {
                    setResetStep(null);
                    setCode("");
                    setResetToken("");
                    setNewPassword("");
                  }}
                >
                  Back to sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
