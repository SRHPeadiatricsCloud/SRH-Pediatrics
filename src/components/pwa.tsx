"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Registers the service worker, exposes an Install button and an online/offline pill. */
export function PwaEngine() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [offline, setOffline] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const cleanupFns: Array<() => void> = [];

    if ("serviceWorker" in navigator) {
      // Had a worker already? Only then is a swap worth reloading for.
      const hadController = Boolean(navigator.serviceWorker.controller);
      const RELOADED = "srh-sw-reloaded";

      const onControllerChange = () => {
        if (!hadController) return; // first ever install — nothing to flush
        if (sessionStorage.getItem(RELOADED)) return; // reload at most once per session
        sessionStorage.setItem(RELOADED, "1");
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

      // updateViaCache:"none" => the browser never serves /sw.js from its HTTP
      // cache, so a new deploy's worker is detected on the next visit.
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          // Activate a waiting worker immediately instead of waiting for every
          // tab to be closed.
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                worker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });

          // Re-check for a new worker on tab focus and periodically; cheap, and
          // it means staff do not have to hard-refresh to get a new build.
          const check = () => reg.update().catch(() => undefined);
          const onVisible = () => {
            if (document.visibilityState === "visible") check();
          };
          document.addEventListener("visibilitychange", onVisible);
          const timer = window.setInterval(check, 30 * 60 * 1000);
          check();

          cleanupFns.push(() => {
            document.removeEventListener("visibilitychange", onVisible);
            window.clearInterval(timer);
          });
        })
        .catch(() => undefined);

      cleanupFns.push(() =>
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange),
      );
    }
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    setOffline(!navigator.onLine);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    const on = () => setOffline(false);
    const off = () => setOffline(true);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      cleanupFns.forEach((fn) => fn());
    };
  }, []);

  return (
    <>
      {offline && (
        <div className="no-print fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-1.5 text-[11px] font-bold text-amber-200 backdrop-blur">
          ⚠️ Offline — showing last synced data. Entries will send when back online.
        </div>
      )}
      {deferred && !installed && !standalone && (
        <button
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          }}
          className="no-print fixed bottom-4 right-4 z-50 rounded-full border border-cyan-400/50 bg-cyan-500 px-4 py-2 text-xs font-black text-slate-950 shadow-lg transition hover:bg-cyan-400 active:scale-95"
        >
          ⬇️ Install NICU app
        </button>
      )}
    </>
  );
}
