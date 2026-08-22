import Link from "next/link";

export default function CreditsPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-6 p-6">
      <h1 className="font-pixel text-lg text-pxyellow">CREDITS</h1>
      <div className="pixel-panel space-y-3 p-4 text-sm">
        <p>
          All pixel art, the world, the characters, the cursor, and the music
          are original and drawn or generated in code for this site.
        </p>
        <ul className="list-square space-y-1 pl-5">
          <li>
            Press Start 2P by CodeMan38, SIL Open Font License 1.1, via Google
            Fonts.
          </li>
          <li>JetBrains Mono by JetBrains, SIL Open Font License 1.1.</li>
        </ul>
        <p>
          Full provenance:{" "}
          <span className="font-mono">public/assets/ATTRIBUTION.md</span>
        </p>
      </div>
      <Link href="/" className="pixel-btn pixel-btn-dark w-fit">
        Back
      </Link>
    </main>
  );
}
