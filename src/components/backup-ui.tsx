"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/ui";
import {
  DEFAULT_SETTINGS,
  deleteBackup,
  downloadJson,
  formatBytes,
  getBackupSettings,
  getStorageEstimate,
  isUnitData,
  listBackups,
  saveBackupSettings,
  snapshotUnit,
  type BabySnapshot,
  type BackupEntry,
  type BackupSettings,
} from "@/lib/backup";
import { fmtTime } from "@/lib/clinical";
import {
  APP_VERSION,
  BACKUP_SCHEMA_VERSION,
  migrateBaby,
  migrateStore,
  wrapBackup,
} from "@/lib/backup-schema";

export type DeletableBaby = {
  id: number;
  babyName: string;
  uhid: string;
  bed: string;
  motherName?: string;
};

export function DeleteConfirmModal({
  baby,
  onCancel,
  onConfirm,
}: {
  baby: DeletableBaby;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toUpperCase() === "YES";
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-5">
        <h2 className="text-base font-black text-rose-200">Delete this baby card?</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          <strong className="text-white">{baby.babyName}</strong> · {baby.uhid} · {baby.bed}
          {baby.motherName ? ` · Mother: ${baby.motherName}` : ""}
        </p>
        <p className="mt-2 text-[11px] text-amber-200">
          The card leaves the unit board but is <b>not erased immediately</b>. You will get a 60-second Undo, then it
          stays in Recently deleted. A local backup is saved on this device before the delete.
        </p>
        <label className="lbl mt-4 mb-1 block">Type YES to confirm delete</label>
        <input
          autoFocus
          className="inp"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="YES"
          onKeyDown={(e) => e.key === "Enter" && ok && onConfirm()}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn border border-rose-400/50 bg-rose-500 text-white hover:bg-rose-400 disabled:opacity-40"
            disabled={!ok}
            onClick={onConfirm}
          >
            Delete card
          </button>
        </div>
      </div>
    </div>
  );
}

export function UndoBar() {
  const [item, setItem] = useState<{ id: number; name: string; until: number } | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const onDel = (e: Event) => {
      const d = (e as CustomEvent<{ id: number; name: string }>).detail;
      if (!d?.id) return;
      setItem({ id: d.id, name: d.name, until: Date.now() + 60_000 });
    };
    window.addEventListener("neo:deleted", onDel);
    return () => window.removeEventListener("neo:deleted", onDel);
  }, []);

  useEffect(() => {
    if (!item) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((item.until - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) setItem(null);
    }, 250);
    return () => clearInterval(t);
  }, [item]);

  if (!item || left <= 0) return null;

  const undo = async () => {
    await api(`/api/babies/restore`, "POST", {
      mode: "reactivate",
      snapshot: { baby: { id: item.id } },
      author: localStorage.getItem("neo_user") || "Team",
    });
    setItem(null);
    window.dispatchEvent(new Event("neo:board-reload"));
    window.dispatchEvent(new CustomEvent("neo:saved", { detail: "Card restored ✓" }));
  };

  return (
    <div className="no-print fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-400/40 bg-slate-950/95 px-4 py-2 text-xs font-semibold text-amber-100 shadow-xl backdrop-blur">
      <span>
        Removed <b className="text-white">{item.name}</b> · Undo {left}s
      </span>
      <button className="btn-primary !rounded-full !px-3 !py-1 text-[11px]" onClick={undo}>
        Undo
      </button>
    </div>
  );
}

export function BackupEngine() {
  useEffect(() => {
    let intervalId: number | null = null;
    let timeoutId: number | null = null;
    let lastRun = 0;

    const getSettings = () => {
      try {
        return getBackupSettings();
      } catch {
        return DEFAULT_SETTINGS;
      }
    };

    const run = async (reason: BackupEntry["reason"] = "scheduled", force = false) => {
      const s = getSettings();
      if (!s.enabled && reason === "scheduled") return;
      const now = Date.now();
      if (!force && reason === "scheduled" && now - lastRun < 60_000) return;
      lastRun = now;
      await snapshotUnit(reason);
    };

    const schedule = () => {
      const s = getSettings();
      if (intervalId) window.clearInterval(intervalId);
      intervalId = window.setInterval(() => run("scheduled"), s.intervalMinutes * 60_000);
    };

    timeoutId = window.setTimeout(() => run("scheduled", true), 3000);
    schedule();

    const onSettings = () => schedule();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        const s = getSettings();
        if (s.smartBackup) run("scheduled");
      }
    };
    const onBeforeUnload = () => {
      const s = getSettings();
      if (s.smartBackup) {
        try {
          snapshotUnit("scheduled");
        } catch {}
      }
    };
    const onSaved = () => {
      const s = getSettings();
      if (s.smartBackup) {
        window.setTimeout(() => run("scheduled"), 5000);
      }
    };

    window.addEventListener("neo:backup-settings", onSettings);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("neo:saved", onSaved as EventListener);
    window.addEventListener("neo:board-reload", onSaved as EventListener);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("neo:backup-settings", onSettings);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("neo:saved", onSaved as EventListener);
      window.removeEventListener("neo:board-reload", onSaved as EventListener);
    };
  }, []);
  return null;
}

export function BackupVault({ onRestored }: { onRestored?: () => void }) {
  const [rows, setRows] = useState<BackupEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | string | null>(null);
  const [settings, setSettings] = useState<BackupSettings>(DEFAULT_SETTINGS);
  const [est, setEst] = useState<{ usage: number; quota: number; count: number; totalSize: number }>({
    usage: 0,
    quota: 0,
    count: 0,
    totalSize: 0,
  });
  const [showSettings, setShowSettings] = useState(false);

  const load = async () => {
    setRows(await listBackups());
    setEst(await getStorageEstimate());
    try {
      setSettings(getBackupSettings());
    } catch {}
  };
  useEffect(() => {
    load();
    window.addEventListener("neo:backups", load);
    window.addEventListener("neo:backup-settings", load);
    return () => {
      window.removeEventListener("neo:backups", load);
      window.removeEventListener("neo:backup-settings", load);
    };
  }, []);

  const restoreSnap = async (snap: BabySnapshot, asCopy = false) => {
    const migrated = migrateBaby(snap);
    const id = Number((migrated.baby as { id?: number })?.id ?? 0);
    setBusy(id || "x");
    await api("/api/babies/restore", "POST", {
      mode: asCopy ? "new" : "reactivate",
      asCopy,
      snapshot: migrated,
      author: localStorage.getItem("neo_user") || "Team",
    });
    setBusy(null);
    onRestored?.();
    window.dispatchEvent(new Event("neo:board-reload"));
  };

  const restoreEntry = async (entry: BackupEntry, asCopy = false) => {
    setBusy(entry.id ?? "x");
    if (isUnitData(entry.data)) {
      const store = migrateStore(entry.data);
      const babies = (store.babies as Record<string, unknown>[]) ?? [];
      const problems = (store.problems as Record<string, unknown>[]) ?? [];
      const vitals = (store.vitals as Record<string, unknown>[]) ?? [];
      const events = (store.events as Record<string, unknown>[]) ?? [];
      const tasks = (store.tasks as Record<string, unknown>[]) ?? [];
      const handovers = (store.handovers as Record<string, unknown>[]) ?? [];
      for (const baby of babies) {
        const bid = Number(baby.id);
        await api("/api/babies/restore", "POST", {
          mode: asCopy ? "new" : "reactivate",
          asCopy,
          snapshot: {
            baby,
            problems: problems.filter((x) => Number(x.babyId) === bid),
            vitals: vitals.filter((x) => Number(x.babyId) === bid),
            events: events.filter((x) => Number(x.babyId) === bid),
            tasks: tasks.filter((x) => Number(x.babyId) === bid),
            handovers: handovers.filter((x) => Number(x.babyId) === bid),
          },
          author: localStorage.getItem("neo_user") || "Team",
        });
      }
    } else {
      await restoreSnap(entry.data as BabySnapshot, asCopy);
    }
    setBusy(null);
    onRestored?.();
    window.dispatchEvent(new Event("neo:board-reload"));
  };

  const updateSetting = (patch: Partial<BackupSettings>) => {
    const next = saveBackupSettings(patch);
    setSettings(next);
  };

  return (
    <section className="card mt-4 px-3 py-2">
      {/* One slim line by default — this is infrastructure, not clinical content,
          so it should sit quietly under the board until someone needs it. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="font-bold text-slate-300">Local backups</span>
        <span className="text-slate-500">
          {est.count} snapshot{est.count === 1 ? "" : "s"} · {formatBytes(est.totalSize)}
        </span>
        <span className="hidden text-slate-500 sm:inline">
          · {formatBytes(est.usage)} of {formatBytes(est.quota)}
        </span>
        {settings.dedup && <span className="hidden text-slate-500 md:inline">· dedup on</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            className="btn-ghost !px-2 !py-0.5 text-[10px]"
            title="Backup strategy and retention settings"
            onClick={() => setShowSettings((v) => !v)}
          >
            {showSettings ? "Hide settings" : "⚙️ Settings"}
          </button>
          <button className="btn-ghost !px-2 !py-0.5 text-[10px]" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : `Show (${rows.length})`}
          </button>
          <button
            className="btn-ghost !px-2 !py-0.5 text-[10px]"
            onClick={async () => {
              await snapshotUnit("manual");
              load();
            }}
          >
            Backup now
          </button>
        </div>
      </div>

      {showSettings && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] leading-relaxed text-slate-500">
            <span className="inline-flex items-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-bold text-slate-400">
              schema v{BACKUP_SCHEMA_VERSION} · app {APP_VERSION}
            </span>
            <span>
              Unchanged data is skipped, snapshots trigger on tab hide / close and 5 s after a save, and retention is
              tiered — last 6 frequent, then hourly for 24 h, then daily for 7 days, then weekly. Pre-delete snapshots
              are always kept.
            </span>
          </div>
          <div className="mt-3 grid gap-3 rounded-xl border border-white/10 bg-slate-900/40 p-3 sm:grid-cols-2">
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-slate-300">Enable auto backup</span>
              <input type="checkbox" checked={settings.enabled} onChange={(e) => updateSetting({ enabled: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-slate-300">Smart backup (on change / tab hide / close)</span>
              <input type="checkbox" checked={settings.smartBackup} onChange={(e) => updateSetting({ smartBackup: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-slate-300">Deduplicate — skip if unchanged</span>
              <input type="checkbox" checked={settings.dedup} onChange={(e) => updateSetting({ dedup: e.target.checked })} />
            </label>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-slate-300">Interval (minutes)</span>
              <select
                className="inp !w-24 !py-1 text-[11px]"
                value={settings.intervalMinutes}
                onChange={(e) => updateSetting({ intervalMinutes: Number(e.target.value) })}
              >
                <option value={5}>5 min (old — eats space)</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min (recommended)</option>
                <option value={30}>30 min (saves more)</option>
                <option value={60}>60 min (minimal)</option>
              </select>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-slate-300">Retention mode</span>
              <select
                className="inp !w-32 !py-1 text-[11px]"
                value={settings.retentionMode}
                onChange={(e) => updateSetting({ retentionMode: e.target.value as BackupSettings["retentionMode"] })}
              >
                <option value="tiered">Tiered (smart — saves space)</option>
                <option value="simple">Simple (keep last N)</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-slate-300">Max per baby</span>
              <input
                type="number"
                min={5}
                max={100}
                className="inp !w-24 !py-1 text-[11px]"
                value={settings.maxPerBaby}
                onChange={(e) => updateSetting({ maxPerBaby: Math.max(5, Math.min(100, Number(e.target.value) || 24)) })}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-slate-300">Max unit snapshots</span>
              <input
                type="number"
                min={5}
                max={50}
                className="inp !w-24 !py-1 text-[11px]"
                value={settings.maxUnit}
                onChange={(e) => updateSetting({ maxUnit: Math.max(5, Math.min(50, Number(e.target.value) || 20)) })}
              />
            </div>
            <p className="text-[10px] text-slate-500">
              Tip: Keep tiered + 15 min + dedup ON for best space saving without losing data. Pre-edit and pre-delete are always kept.
            </p>
          </div>
          </div>
        </>
      )}

      {open && (
        <div className="mt-3 max-h-80 space-y-1.5 overflow-auto">
          {rows.length === 0 && <p className="text-xs text-slate-400">No local backups yet — they appear after the first edit.</p>}
          {rows.map((r) => (
            <div key={r.id ?? r.at} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-900/40 px-2 py-1.5 text-[11px]">
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-bold uppercase text-cyan-300">{r.reason}</span>
              <span className="min-w-0 flex-1 truncate text-slate-200">{r.label}</span>
              <span className="text-[10px] text-slate-500">{r.size ? formatBytes(r.size) : ""}</span>
              <span className="text-slate-500">{fmtTime(r.at)}</span>
              <button className="btn-ghost !px-2 !py-0.5" disabled={busy === r.id} onClick={() => restoreEntry(r, false)}>
                {busy === r.id ? "…" : "Restore"}
              </button>
              <button className="btn-ghost !px-2 !py-0.5" onClick={() => restoreEntry(r, true)}>
                Copy
              </button>
              <button
                className="btn-ghost !px-2 !py-0.5"
                title="Download a versioned backup that future app versions can read"
                onClick={() => downloadJson(`srh-backup-v${BACKUP_SCHEMA_VERSION}-${r.at.slice(0, 19)}.json`, wrapBackup(r.data))}
              >
                JSON
              </button>
              <button className="text-rose-300" onClick={() => r.id != null && deleteBackup(r.id).then(load)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
