"use client";

import { useState, useTransition } from "react";
import { adminWhatsAppCommandAction } from "./actions";

export function AdminActions() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (command: string) => {
    setMessage(null);
    startTransition(async () => {
      const res = await adminWhatsAppCommandAction(command);
      setMessage(res.ok ? "Queued for the worker." : res.error);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pixel-btn pixel-btn-secondary pixel-btn-sm"
          disabled={pending}
          onClick={() => run("reconcile")}
        >
          Reconcile group
        </button>
        <button
          type="button"
          className="pixel-btn pixel-btn-secondary pixel-btn-sm"
          disabled={pending}
          onClick={() => run("retry_failed")}
        >
          Retry failed jobs
        </button>
        <button
          type="button"
          className="pixel-btn pixel-btn-dark pixel-btn-sm"
          disabled={pending}
          onClick={() => run("disconnect_account")}
        >
          Disconnect account
        </button>
        <a
          href="/admin/whatsapp"
          className="pixel-btn pixel-btn-dark pixel-btn-sm"
        >
          Refresh
        </a>
      </div>
      <p role="status" aria-live="polite" className="min-h-4 font-mono text-xs">
        {message}
      </p>
    </div>
  );
}
