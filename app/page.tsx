import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { LandingPreview } from "@/components/landing/LandingPreview";
import { Footer } from "@/components/shared/Footer";

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) {
    const profile = await getProfile(user.id).catch(() => null);
    redirect(profile?.characterConfig ? "/beach" : "/create-character");
  }
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/ui/bain-logo.png"
          alt=""
          width={40}
          height={40}
          className="border-2 border-pxwhite/40 bg-pxwhite"
        />
        <h1 className="font-pixel text-center text-xl leading-relaxed text-pxyellow sm:text-2xl">
          BAIN ON THE BEACH
        </h1>
      </div>
      <LandingPreview />
      <Link href="/auth/guest" className="pixel-btn pixel-btn-primary">
        Enter the beach
      </Link>
      <Footer />
    </main>
  );
}
