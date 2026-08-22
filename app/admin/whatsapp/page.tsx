// Protected WhatsApp administration. Authorization is enforced server-side
// by the whatsapp_admin_status() SQL function (whatsapp_admins table), not
// by hiding links. The QR is short-lived, uncached, and never logged.

import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getSessionUser } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { AdminActions } from "./actions-ui";

export const dynamic = "force-dynamic";

interface AdminStatus {
  connectionState: string;
  connectedAccountName: string | null;
  lastConnectedAt: string | null;
  groupLinked: boolean;
  memberCount: number | null;
  lastReconciledAt: string | null;
  pendingJobs: number;
  failedJobs: number;
  qr: string | null;
}

const STATE_LABEL: Record<string, string> = {
  disconnected: "DISCONNECTED",
  waiting_for_qr: "WAITING FOR QR",
  creating_group: "CONNECTING",
  connected: "CONNECTED",
  reconnecting: "RECONNECTING",
  action_required: "ACTION REQUIRED",
};

export default async function WhatsAppAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (isDemoMode()) {
    return (
      <Shell>
        <p className="font-mono text-sm">
          Demo mode. WhatsApp administration needs a configured Supabase project
          and the worker (see whatsapp-worker/README.md).
        </p>
      </Shell>
    );
  }

  const supabase = await createSupabaseServer();
  const { data, error } = (await supabase!.rpc("whatsapp_admin_status")) as {
    data: AdminStatus | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    return (
      <Shell>
        <p className="font-mono text-sm text-pxred">
          Not authorized. Admins are listed in the whatsapp_admins table.
        </p>
      </Shell>
    );
  }

  const qrDataUrl = data.qr
    ? await QRCode.toDataURL(data.qr, { margin: 1, width: 240 })
    : null;

  return (
    <Shell>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm">
        <dt className="text-pxwhite/60">Connection</dt>
        <dd className="font-pixel text-[10px]">
          {STATE_LABEL[data.connectionState] ??
            data.connectionState.toUpperCase()}
        </dd>
        <dt className="text-pxwhite/60">Account</dt>
        <dd>{data.connectedAccountName ?? "-"}</dd>
        <dt className="text-pxwhite/60">Last connected</dt>
        <dd>{data.lastConnectedAt ?? "-"}</dd>
        <dt className="text-pxwhite/60">Group</dt>
        <dd>{data.groupLinked ? "linked" : "not created yet"}</dd>
        <dt className="text-pxwhite/60">Members</dt>
        <dd>{data.memberCount ?? "-"}</dd>
        <dt className="text-pxwhite/60">Last reconciled</dt>
        <dd>{data.lastReconciledAt ?? "-"}</dd>
        <dt className="text-pxwhite/60">Pending jobs</dt>
        <dd>{data.pendingJobs}</dd>
        <dt className="text-pxwhite/60">Failed jobs</dt>
        <dd>{data.failedJobs}</dd>
      </dl>

      {qrDataUrl && (
        <div className="pixel-panel self-start p-3">
          <p className="font-pixel mb-2 text-[9px]">
            SCAN WITH THE DEDICATED ACCOUNT
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="WhatsApp pairing QR code"
            width={240}
            height={240}
          />
          <p className="mt-2 font-mono text-xs text-night/60">
            Expires within a minute. Reload for a fresh one.
          </p>
        </div>
      )}

      <AdminActions />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-4 p-4">
      <h1 className="font-pixel text-sm text-pxyellow">WHATSAPP ADMIN</h1>
      {children}
    </main>
  );
}
