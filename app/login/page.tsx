import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { isDemoMode } from "@/lib/env";
import { LoginForm } from "@/components/auth/LoginForm";
import { Footer } from "@/components/shared/Footer";

const ERRORS: Record<string, string> = {
  domain: "That email is not on the list for this beach.",
  expired: "That link is spent. Send a new one.",
  cancelled: "Sign in cancelled.",
  config: "Auth is not configured yet.",
  provider: "Sign in failed. Try again.",
  missing: "Sign in failed. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user) {
    const profile = await getProfile(user.id).catch(() => null);
    redirect(profile?.characterConfig ? "/beach" : "/create-character");
  }
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : null;
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/ui/bain-logo.png"
          alt=""
          width={32}
          height={32}
          className="border-2 border-pxwhite/40 bg-pxwhite"
        />
        <h1 className="font-pixel text-center text-lg text-pxyellow">
          BAIN ON THE BEACH
        </h1>
      </div>
      <LoginForm
        demo={isDemoMode()}
        initialError={errorKey ? (ERRORS[errorKey] ?? ERRORS.provider!) : null}
      />
      <Footer />
    </main>
  );
}
