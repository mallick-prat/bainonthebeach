import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { StatusChoice } from "@/components/beach-ui/StatusChoice";

export default async function StatusPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/guest");
  const profile = await getProfile(user.id).catch(() => null);
  if (!profile?.characterConfig) redirect("/create-character");
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-4">
      <h1 className="font-pixel text-center text-sm leading-relaxed text-pxyellow">
        SO. ARE YOU ON THE BEACH?
      </h1>
      <StatusChoice />
      <p className="text-sm text-pxwhite/70">Stays set until you change it.</p>
    </main>
  );
}
