// Self-only WhatsApp connection status. Never exposes anyone else's data
// and never the full phone number.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getSelfWhatsApp } from "@/lib/data/whatsapp";

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = await getSelfWhatsApp(user.id);
  return NextResponse.json(status, {
    headers: { "cache-control": "no-store" },
  });
}
