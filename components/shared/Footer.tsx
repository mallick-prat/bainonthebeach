import Link from "next/link";
import { footerNote } from "@/lib/env";

export function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 p-4 text-[11px] text-pxwhite/60">
      <span>{footerNote()}</span>
      <Link href="/credits" className="underline hover:text-pxwhite">
        Credits
      </Link>
      <Link href="/privacy" className="underline hover:text-pxwhite">
        Privacy
      </Link>
      <Link href="/login" className="underline hover:text-pxwhite">
        Sign in
      </Link>
    </footer>
  );
}
