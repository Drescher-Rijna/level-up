import type { Metadata } from "next";
import { Archivo, DM_Sans } from "next/font/google";
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
  title: "Skate / Progress",
  description: "A five-year skateboarding progression and motor-learning companion.",
  applicationName: "Skate / Progress",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Skate / Progress",
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
      <body className="min-h-full bg-[#0b0c0e] text-white">{children}</body>
    </html>
  );
}
