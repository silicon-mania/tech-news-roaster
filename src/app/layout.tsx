import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const poppins = localFont({
  src: "../../public/fonts/poppins-regular.ttf",
  variable: "--font-poppins",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Auto-News",
  description: "Single-page workspace for source tweet draft generation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${poppins.variable}`}>
      <head>
        {(process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview") && (
          // Meticulous front-end test recorder. Deliberately a raw, synchronous
          // <script> in the real <head> (a child of <html>, never inside <body>):
          // it must run before any app code to instrument Math.random/Date, and
          // next/script's `beforeInteractive` strategy drops custom data-*
          // attributes in the App Router (vercel/next.js#49830), which would
          // silently break the recording token.
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script
            data-recording-token="oxdbsvyDG6TTTYt8E82inbMbUntcUwu8E9uCk6Pd"
            data-is-production-environment="false"
            src="https://snippet.meticulous.ai/v1/meticulous.js"
          />
        )}
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
