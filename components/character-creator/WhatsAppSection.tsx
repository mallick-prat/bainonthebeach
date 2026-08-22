"use client";

// WHATSAPP NUMBER control: compact country dropdown (USA/Canada/Mexico or
// Other for any international number), consent, verification, connection
// state, disconnect. The full number is only ever shown to the user
// themselves while typing; afterwards only the last four digits.

import { useMemo, useState, useTransition } from "react";
import { AsYouType, isValidPhoneNumber } from "libphonenumber-js/max";
import type { SelfWhatsApp } from "@/lib/data/types";
import { CONSENT_COPY } from "@/lib/whatsapp/membership";
import {
  disconnectWhatsAppAction,
  savePhoneAction,
  verifyPhoneCodeAction,
  type ActionResult,
} from "@/app/actions";

type Phase = "idle" | "code";

const STATE_LABEL: Record<string, string> = {
  member: "WHATSAPP CONNECTED",
  not_member: "WHATSAPP CONNECTED",
  queued: "SYNCING",
  syncing: "SYNCING",
  invite_required: "INVITE REQUIRED",
  failed: "SYNC FAILED",
  verification_pending: "VERIFY NUMBER",
  not_connected: "VERIFY NUMBER",
};

const COUNTRIES = [
  { key: "US", flag: "\u{1F1FA}\u{1F1F8}", label: "USA", prefix: "+1" },
  { key: "CA", flag: "\u{1F1E8}\u{1F1E6}", label: "Canada", prefix: "+1" },
  { key: "MX", flag: "\u{1F1F2}\u{1F1FD}", label: "Mexico", prefix: "+52" },
  { key: "OTHER", flag: "\u{1F30D}", label: "Other", prefix: "" },
] as const;

type CountryKey = (typeof COUNTRIES)[number]["key"];

export function WhatsAppSection({
  initial,
  demo,
  hasProfile,
}: {
  initial: SelfWhatsApp;
  demo: boolean;
  hasProfile: boolean;
}) {
  const [wa, setWa] = useState<SelfWhatsApp>(initial);
  const [phase, setPhase] = useState<Phase>(
    initial.connected && !initial.verified ? "code" : "idle",
  );
  const [country, setCountry] = useState<CountryKey>("US");
  const [national, setNational] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = COUNTRIES.find((c) => c.key === country)!;

  const fullNumber = useMemo(() => {
    const raw = national.trim();
    if (country === "OTHER") {
      return raw.startsWith("+") ? raw.replace(/[\s().-]/g, "") : "";
    }
    const digits = raw.replace(/\D/g, "");
    return digits ? `${selected.prefix}${digits}` : "";
  }, [country, national, selected.prefix]);

  const looksValid = fullNumber !== "" && isValidPhoneNumber(fullNumber);

  const onNationalChange = (value: string) => {
    if (country === "OTHER") {
      setNational(value);
      return;
    }
    // Format while typing for the fixed-country options.
    const digits = value.replace(/\D/g, "");
    const typer = new AsYouType(country === "MX" ? "MX" : "US");
    setNational(typer.input(digits));
  };

  const refresh = async () => {
    try {
      const res = await fetch("/api/whatsapp/me", { cache: "no-store" });
      if (res.ok) setWa((await res.json()) as SelfWhatsApp);
    } catch {
      // transient; state refreshes on next action
    }
  };

  const run = (fn: () => Promise<ActionResult>, after?: () => void) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else after?.();
      await refresh();
    });
  };

  const sendCode = () =>
    run(
      () => savePhoneAction({ phone: fullNumber, consent }),
      () => {
        setPhase("code");
        setNotice(
          demo ? "Demo mode: the code is 424242." : "Code sent on WhatsApp.",
        );
      },
    );

  const verify = () =>
    run(
      () => verifyPhoneCodeAction(code),
      () => {
        setPhase("idle");
        setNotice("Verified.");
      },
    );

  const disconnect = () =>
    run(
      () => disconnectWhatsAppAction(),
      () => {
        setPhase("idle");
        setNational("");
        setConsent(false);
        setCode("");
      },
    );

  const connectedAndVerified = wa.connected && wa.verified;

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-pixel text-[9px] text-night/70">
        WHATSAPP NUMBER
      </span>
      <p className="font-mono text-xs text-night/60">
        Used to add you to the Bain on the Beach WhatsApp group when you are on
        the beach.
      </p>

      {!hasProfile ? (
        <p className="font-mono text-xs text-night/50">
          Save your character first.
        </p>
      ) : connectedAndVerified ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-pixel bg-pxgreen px-2 py-1 text-[8px] text-pxwhite">
            {STATE_LABEL[wa.membershipState] ?? "WHATSAPP CONNECTED"}
          </span>
          <span className="font-mono text-sm">
            {wa.countryCode ? `${wa.countryCode} ` : ""}... {wa.lastFour}
          </span>
          <button
            type="button"
            className="pixel-btn pixel-btn-ghost pixel-btn-sm"
            disabled={pending}
            onClick={disconnect}
          >
            Disconnect WhatsApp
          </button>
        </div>
      ) : phase === "code" ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="wa-code"
            className="font-mono text-[11px] uppercase text-night/60"
          >
            Code from WhatsApp
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="wa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="pixel-input font-pixel max-w-40 tracking-[0.3em]"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              type="button"
              className="pixel-btn pixel-btn-primary pixel-btn-sm"
              disabled={pending || code.trim().length !== 6}
              onClick={verify}
            >
              Verify
            </button>
            <button
              type="button"
              className="pixel-btn pixel-btn-ghost pixel-btn-sm"
              disabled={pending}
              onClick={() => {
                setPhase("idle");
                setCode("");
              }}
            >
              Different number
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_3fr] gap-2">
            <label className="sr-only" htmlFor="wa-country">
              Country
            </label>
            <select
              id="wa-country"
              className="pixel-input"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value as CountryKey);
                setNational("");
              }}
            >
              {COUNTRIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.flag} {c.label}
                  {c.prefix ? ` (${c.prefix})` : ""}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="wa-phone">
              Phone number
            </label>
            <input
              id="wa-phone"
              type="tel"
              autoComplete="tel"
              className="pixel-input"
              placeholder={
                country === "OTHER" ? "+49 30 901820" : "(617) 555-8331"
              }
              value={national}
              onChange={(e) => onNationalChange(e.target.value)}
            />
          </div>
          {country === "OTHER" && (
            <p className="font-mono text-xs text-night/50">
              Any country. Start with the country code, like +49.
            </p>
          )}
          <label className="flex items-start gap-2 font-mono text-xs">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#b41313]"
            />
            <span>{CONSENT_COPY}</span>
          </label>
          <button
            type="button"
            className="pixel-btn pixel-btn-secondary pixel-btn-sm self-start"
            disabled={pending || !looksValid || !consent}
            onClick={sendCode}
          >
            Send code
          </button>
        </div>
      )}

      <p role="status" aria-live="polite" className="min-h-4 font-mono text-xs">
        {error ? <span className="text-pxred">{error}</span> : notice}
      </p>
    </div>
  );
}
