"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-4">
      <div className="pixel-panel p-4">
        <p className="font-pixel text-[10px]">SOMETHING BROKE</p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="pixel-btn pixel-btn-primary"
      >
        Try again
      </button>
    </main>
  );
}
