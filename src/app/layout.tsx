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
      <body>
        <head>
          {(process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview") && (
            // eslint-disable-next-line @next/next/no-sync-scripts
            <script
              data-recording-token="oxdbsvyDG6TTTYt8E82inbMbUntcUwu8E9uCk6Pd"
              data-is-production-environment="false"
              src="https://snippet.meticulous.ai/v1/meticulous.js"
            />
          )}
        </head>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
