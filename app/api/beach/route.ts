// Authoritative beach snapshot for the signed-in user. Used on load, on
// realtime reconnect, and as the low-frequency fallback poll.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getBeachSnapshot } from "@/lib/data/profiles";

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const snapshot = await getBeachSnapshot(user.id);
    return NextResponse.json(snapshot, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
