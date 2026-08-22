"use client";

import { useActionState, useEffect, useState } from "react";
import { demoSignInAction, type ActionResult } from "@/app/actions";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { track } from "@/lib/observability/analytics";

type Phase = "start" | "sent" | "verifying";

export function LoginForm({
  demo,
  initialError,
}: {
  demo: boolean;
  initialError: string | null;
}) {
  const [demoState, demoAction, demoPending] = useActionState<
    ActionResult | null,
    FormData
  >(demoSignInAction, null);
  const [phase, setPhase] = useState<Phase>("start");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  // Only show the Google button when the provider is actually enabled.
  useEffect(() => {
    if (demo) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const controller = new AbortController();
    fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((cfg) => setGoogleEnabled(Boolean(cfg?.external?.google)))
      .catch(() => {});
    return () => controller.abort();
  }, [demo]);

  if (demo) {
    return (
      <form
        action={demoAction}
        className="pixel-panel flex w-full max-w-sm flex-col gap-3 p-4"
      >
        <label className="text-sm" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="pixel-input"
          placeholder="bill@williambain.com"
        />
        <button className="pixel-btn pixel-btn-primary" disabled={demoPending}>
          {demoPending ? "Entering..." : "Enter the beach"}
        </button>
        {demoState && !demoState.ok && (
          <p role="alert" className="text-sm text-pxred">
            {demoState.error}
          </p>
        )}
      </form>
    );
  }

  const cookiesBlocked =
    typeof navigator !== "undefined" && navigator.cookieEnabled === false;

  const signInGoogle = async () => {
    setError(null);
    const supabase = getSupabaseBrowser();
    if (!supabase) return setError("Auth is not configured yet.");
    track("login_started");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) setError("Google sign in failed. Try the email option.");
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setBusy(false);
      return setError("Auth is not configured yet.");
    }
    track("login_started");
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    setBusy(false);
    if (err) {
      setError(
        err.status === 429
          ? "Email limit hit. Try Google, or wait an hour."
          : "Could not send. Check the address.",
      );
      return;
    }
    setPhase("sent");
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setBusy(false);
      return setError("Auth is not configured yet.");
    }
    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (err) {
      setError("That code did not work. Check it or send a new one.");
      return;
    }
    window.location.assign("/auth/callback");
  };

  return (
    <div className="pixel-panel flex w-full max-w-sm flex-col gap-3 p-4">
      {cookiesBlocked && (
        <p role="alert" className="text-sm text-pxred">
          Cookies are blocked. Sign in needs them.
        </p>
      )}
      {googleEnabled && (
        <>
          <button
            type="button"
            onClick={signInGoogle}
            className="pixel-btn pixel-btn-secondary"
          >
            Continue with Google
          </button>
          <div
            className="my-1 border-t-2 border-dashed border-night/30"
            aria-hidden
          />
        </>
      )}
      {phase === "start" ? (
        <form onSubmit={sendEmail} className="flex flex-col gap-3">
          <label className="text-sm" htmlFor="email">
            Or email a code
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="pixel-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="bill@williambain.com"
          />
          <button className="pixel-btn pixel-btn-primary" disabled={busy}>
            {busy ? "Sending..." : "Send link + code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <p className="text-sm">Sent. Open the link, or type the code:</p>
          <label className="sr-only" htmlFor="otp">
            Code from the email
          </label>
          <input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className="pixel-input font-pixel tracking-[0.3em]"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
          />
          <button className="pixel-btn pixel-btn-primary" disabled={busy}>
            {busy ? "Checking..." : "Verify"}
          </button>
          <button
            type="button"
            className="text-left text-sm underline"
            onClick={() => {
              setPhase("start");
              setCode("");
            }}
          >
            Different email
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-pxred">
          {error}
        </p>
      )}
    </div>
  );
}
