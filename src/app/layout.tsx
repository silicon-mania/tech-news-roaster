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
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
