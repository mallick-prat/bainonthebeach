import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-6 p-6">
      <h1 className="font-pixel text-lg text-pxyellow">PRIVACY</h1>
      <div className="pixel-panel space-y-3 p-4 text-sm">
        <p>Other signed-in people can see:</p>
        <ul className="list-square space-y-1 pl-5">
          <li>Your display name</li>
          <li>Your office, if you picked one</li>
          <li>Your character</li>
          <li>Whether you are on the beach, and since when</li>
        </ul>
        <p>
          Nobody sees your email, your sign-in method, or anything else. Your email
          is used only to sign you in and to check the domain allowlist.
        </p>
        <p>
          To delete your profile and account, ask an admin. Deletion removes the
          auth user and the profile row (see the README for the exact steps).
        </p>
      </div>
      <Link href="/" className="pixel-btn pixel-btn-dark w-fit">
        Back
      </Link>
    </main>
  );
}
