import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getProfile } from "@/lib/data/profiles";
import { getSelfWhatsApp } from "@/lib/data/whatsapp";
import { isDemoMode } from "@/lib/env";
import { DEFAULT_CHARACTER } from "@/lib/validation/character";
import { CharacterCreator } from "@/components/character-creator/CharacterCreator";

export default async function CreateCharacterPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id).catch(() => null);
  const whatsapp = await getSelfWhatsApp(user.id);
  const initialName =
    profile?.displayName ||
    user.providerName ||
    user.email?.split("@")[0] ||
    "";
  return (
    <main className="min-h-[100dvh]">
      <CharacterCreator
        initialName={initialName}
        initialConfig={profile?.characterConfig ?? DEFAULT_CHARACTER}
        firstTime={!profile?.characterConfig}
        initialWhatsApp={whatsapp}
        demo={isDemoMode()}
      />
    </main>
  );
}
