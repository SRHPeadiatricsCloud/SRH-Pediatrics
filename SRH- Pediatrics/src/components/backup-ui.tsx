"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/ui";
import {
  deleteBackup,
  downloadJson,
  isUnitData,
  listBackups,
  snapshotUnit,
  type BabySnapshot,
  type BackupEntry,
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
    const run = () => snapshotUnit("scheduled");
    const t = window.setTimeout(run, 2500);
    const i = window.setInterval(run, 5 * 60 * 1000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);
  return null;
}

export function BackupVault({ onRestored }: { onRestored?: () => void }) {
  const [rows, setRows] = useState<BackupEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | string | null>(null);

  const load = async () => setRows(await listBackups());
  useEffect(() => {
    load();
    window.addEventListener("neo:backups", load);
    return () => window.removeEventListener("neo:backups", load);
  }, []);

  const restoreSnap = async (snap: BabySnapshot, asCopy = false) => {
    // Migrate older-schema snapshots up to the current schema before restoring.
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
      // Migrate the whole store, then restore each baby snapshot from it.
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
      await restoreSnap(entry.data, asCopy);
    }
    setBusy(null);
    onRestored?.();
    window.dispatchEvent(new Event("neo:board-reload"));
  };

  return (
    <section className="card mt-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-black text-white">Local backups</h3>
        <span className="inline-flex items-center gap-1 rounded bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300">
          schema v{BACKUP_SCHEMA_VERSION} · app {APP_VERSION}
        </span>
        <span className="text-[10px] text-slate-400">
          Auto-saved before every edit + every 5 min. Versioned &amp; self-migrating — old backups keep working after
          app upgrades.
        </span>
        <button className="btn-ghost ml-auto !py-1 text-[11px]" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : `Show (${rows.length})`}
        </button>
        <button
          className="btn-ghost !py-1 text-[11px]"
          onClick={async () => {
            await snapshotUnit("manual");
            load();
          }}
        >
          Backup now
        </button>
      </div>
      {open && (
        <div className="mt-3 max-h-72 space-y-1.5 overflow-auto">
          {rows.length === 0 && <p className="text-xs text-slate-400">No local backups yet — they appear after the first edit.</p>}
          {rows.map((r) => (
            <div key={r.id ?? r.at} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-900/40 px-2 py-1.5 text-[11px]">
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-bold uppercase text-cyan-300">{r.reason}</span>
              <span className="min-w-0 flex-1 truncate text-slate-200">{r.label}</span>
              <span className="text-slate-500">{fmtTime(r.at)}</span>
              <button
                className="btn-ghost !px-2 !py-0.5"
                disabled={busy === r.id}
                onClick={() => restoreEntry(r, false)}
              >
                {busy === r.id ? "…" : "Restore"}
              </button>
              <button className="btn-ghost !px-2 !py-0.5" onClick={() => restoreEntry(r, true)}>
                Copy
              </button>
              <button
                className="btn-ghost !px-2 !py-0.5"
                title="Download a versioned backup that future app versions can read"
                onClick={() =>
                  downloadJson(`srh-backup-v${BACKUP_SCHEMA_VERSION}-${r.at.slice(0, 19)}.json`, wrapBackup(r.data))
                }
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
