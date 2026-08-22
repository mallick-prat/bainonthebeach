"use client";

import { useState, useTransition } from "react";
import { setBeachStatusAction, type ActionResult } from "@/app/actions";

export function StatusChoice() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (join: boolean) => {
    setError(null);
    startTransition(async () => {
      const res: ActionResult | void = await setBeachStatusAction(join, true);
      if (res && !res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <button
        className="pixel-btn pixel-btn-primary"
        disabled={pending}
        onClick={() => choose(true)}
      >
        I&apos;m on the beach
      </button>
      <button
        className="pixel-btn pixel-btn-dark"
        disabled={pending}
        onClick={() => choose(false)}
      >
        Not today
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-center text-sm text-pxred">
        {error}
      </p>
    </div>
  );
}
