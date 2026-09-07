import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans, Sora } from "next/font/google";
import "./globals.css";
import { LockBanner, SaveToast } from "@/components/ui";

const displayFont = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
import { APP_VERSION, BACKUP_SCHEMA_VERSION } from "@/lib/backup-schema";
import { PwaEngine } from "@/components/pwa";
import { BackupEngine, UndoBar } from "@/components/backup-ui";

export const metadata: Metadata = {
  title: "Sri Ramakrishna Hospital · Department of Pediatrics — Clinical Handover Suite",
  description:
    "Real-time cloud handover engine for Sri Ramakrishna Hospital, Department of Pediatrics — NICU, PICU, Step-down, Postnatal and Paediatric wards. AAP / NNF India / IAP aligned, tap-first data entry on iOS, Android and Windows.",
  manifest: "/manifest.webmanifest",
  applicationName: "SRH Pediatrics",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SRH Pediatrics",
  },
  icons: {
    icon: [{ url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#070c16",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const themeBootstrap = `(function(){try{var t=localStorage.getItem("neo_theme");if(t==="light"){document.documentElement.classList.add("light")}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${displayFont.variable} ${bodyFont.variable} text-slate-100 antialiased`}>
        <LockBanner />
        {children}
        <footer className="no-print border-t border-white/5 py-5 text-center">
          <div className="mb-2 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/hospital-logo.svg" alt="" width={36} height={36} className="h-9 w-9 opacity-90" />
          </div>
          <p className="text-[11px] text-slate-500">
            Sri Ramakrishna Hospital · Department of Pediatrics
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Realtime Monitoring and Clinical Handover Suite
          </p>
          <p className="mt-1 text-[10px] text-slate-600">
            Designed &amp; developed by{" "}
            <span className="font-semibold text-slate-400">Dr. Suseender Durairaj</span> · Realtime cloud sync ·
            iOS · Android · Windows
          </p>
          <p className="mt-1 text-[9px] text-slate-600">
            Install as an app — iOS: Share → Add to Home Screen · Android: Install app · Windows: install from the
            browser bar · Use the 🔗 Share link button to invite your team
          </p>
          <p className="mt-1 text-[9px] text-slate-600">
            v{APP_VERSION} · backup schema v{BACKUP_SCHEMA_VERSION} — backups are versioned and forward-compatible.
          </p>
        </footer>
        <SaveToast />
        <UndoBar />
        <BackupEngine />
        <PwaEngine />
      </body>
    </html>
  );
}
