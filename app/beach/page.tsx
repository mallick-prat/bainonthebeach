import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getBeachSnapshot, getProfile } from "@/lib/data/profiles";
import { BeachClient } from "@/components/beach-ui/BeachClient";

export default async function BeachPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/guest");
  const profile = await getProfile(user.id).catch(() => null);
  if (!profile?.characterConfig) redirect("/create-character");
  let snapshot;
  try {
    snapshot = await getBeachSnapshot(user.id);
  } catch {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-4">
        <div className="pixel-panel p-4">
          <p className="text-sm">The island did not load.</p>
        </div>
        <a href="/beach" className="pixel-btn pixel-btn-primary">
          Retry
        </a>
      </main>
    );
  }
  return <BeachClient initial={snapshot} selfId={user.id} />;
}
