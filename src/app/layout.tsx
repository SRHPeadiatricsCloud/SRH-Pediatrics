import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import "./globals.css";
import { LockBanner, SaveToast } from "@/components/ui";
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
    icon: [{ url: "/icons/icon-512.png?v=2.0.029", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icons/icon-512.png?v=2.0.029", sizes: "512x512", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#070c16",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

const themeBootstrap = `(function(){try{var t=localStorage.getItem("neo_theme");if(t==="light"){document.documentElement.classList.add("light")}var f=parseFloat(localStorage.getItem("srh_font_scale"));if(isFinite(f)){f=Math.min(1.7,Math.max(0.85,f));document.documentElement.style.fontSize=(f*100)+"%"}}catch(e){}})();`;

const fontVars: CSSProperties = {
  ["--font-display" as string]: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  ["--font-body" as string]: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body style={fontVars} className="text-slate-100 antialiased">
        <LockBanner />
        {children}
        <footer className="no-print border-t border-white/5 py-5 text-center">
          <div className="mb-2 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/hospital-logo.png?v=2.0.029"
              alt="Sri Ramakrishna Multi-Speciality Hospital — Dept. Of Pediatrics"
              width={320}
              height={220}
              className="h-20 w-auto rounded-xl bg-white p-1 opacity-100 shadow-sm"
            />
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
            V.{APP_VERSION} · backup schema v{BACKUP_SCHEMA_VERSION} — backups are versioned and forward-compatible.
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
