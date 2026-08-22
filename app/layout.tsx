import type { Metadata, Viewport } from "next";
import { Press_Start_2P, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bain on the Beach",
  description:
    "A tiny shared pixel island. Say you are on the beach and your tiny self wanders around with everyone else.",
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pressStart.variable} ${jetbrains.variable}`}>
      <body className="min-h-[100dvh] flex flex-col overflow-x-hidden [padding:env(safe-area-inset-top)_env(safe-area-inset-right)_env(safe-area-inset-bottom)_env(safe-area-inset-left)]">
        {children}
      </body>
    </html>
  );
}
