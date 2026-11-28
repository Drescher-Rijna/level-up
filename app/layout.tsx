import type { Metadata } from "next";
import { Archivo, DM_Sans } from "next/font/google";
import { Footprints } from "lucide-react";
import "./globals.css";

const displayFont = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Skate Training",
  description: "Plan complete skate practice cycles, log sessions and progress trick by trick.",
  applicationName: "Skate Training",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Skate Training",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: "#111311",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#0b0c0e] text-white">
        {children}
        <div className="progression-landscape-notice" role="status">
          <Footprints size={24} aria-hidden="true" />
          <strong>Portrait mode required</strong>
          <span>Rotate your device back to portrait to continue.</span>
        </div>
      </body>
    </html>
  );
}
