"use client";

export type BabySnapshot = {
  baby: Record<string, unknown>;
  problems: Record<string, unknown>[];
  vitals: Record<string, unknown>[];
  events: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  handovers: Record<string, unknown>[];
};

export type BackupEntry = {
  id?: number;
  at: string;
  reason: "pre-edit" | "pre-delete" | "scheduled" | "manual";
  babyId: number | null;
  label: string;
  data: BabySnapshot | { babies: BabySnapshot[] };
};

const DB_NAME = "srh-nicu-backup";
const STORE = "snapshots";
const MAX_PER_BABY = 16;
const MAX_UNIT = 10;
const LS_KEY = "srh_nicu_backups_fallback";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
          s.createIndex("babyId", "babyId", { unique: false });
          s.createIndex("at", "at", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function lsRead(): BackupEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]") as BackupEntry[];
  } catch {
    return [];
  }
}

function lsWrite(rows: BackupEntry[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-40)));
  } catch {
    /* quota — drop oldest */
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-12)));
    } catch {
      /* ignore */
    }
  }
}

export async function saveBackup(entry: Omit<BackupEntry, "id" | "at"> & { at?: string }): Promise<void> {
  const row: BackupEntry = { ...entry, at: entry.at ?? new Date().toISOString() };
  const db = await openDb();
  if (!db) {
    const all = lsRead();
    all.push({ ...row, id: Date.now() });
    lsWrite(pruneList(all));
    notify();
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  await pruneDb(db, row.babyId);
  notify();
}

export async function listBackups(): Promise<BackupEntry[]> {
  const db = await openDb();
  if (!db) {
    return lsRead().sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }
  const rows = await new Promise<BackupEntry[]>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as BackupEntry[]) ?? []);
    req.onerror = () => resolve([]);
  });
  return rows.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}

export async function getBackup(id: number): Promise<BackupEntry | null> {
  const all = await listBackups();
  return all.find((b) => b.id === id) ?? null;
}

export async function deleteBackup(id: number): Promise<void> {
  const db = await openDb();
  if (!db) {
    lsWrite(lsRead().filter((b) => b.id !== id));
    notify();
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  notify();
}

function pruneList(rows: BackupEntry[]): BackupEntry[] {
  const unit = rows.filter((r) => r.babyId == null).sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, MAX_UNIT);
  const byBaby = new Map<number, BackupEntry[]>();
  for (const r of rows.filter((x) => x.babyId != null)) {
    const list = byBaby.get(r.babyId!) ?? [];
    list.push(r);
    byBaby.set(r.babyId!, list);
  }
  const kept: BackupEntry[] = [...unit];
  for (const list of byBaby.values()) {
    kept.push(...list.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, MAX_PER_BABY));
  }
  return kept;
}

async function pruneDb(db: IDBDatabase, babyId: number | null) {
  const all = await new Promise<BackupEntry[]>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as BackupEntry[]) ?? []);
    req.onerror = () => resolve([]);
  });
  const keep = new Set(pruneList(all).map((r) => r.id));
  const drop = all.filter((r) => r.babyId === babyId && !keep.has(r.id));
  if (!drop.length) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    for (const r of drop) if (r.id != null) tx.objectStore(STORE).delete(r.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("neo:backups"));
}

export async function snapshotBabyFromApi(id: number, reason: BackupEntry["reason"]): Promise<BabySnapshot | null> {
  try {
    const r = await fetch(`/api/babies/${id}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as BabySnapshot & { baby?: { id: number; babyName?: string } };
    if (!j?.baby) return null;
    await saveBackup({
      reason,
      babyId: Number(j.baby.id),
      label: String(j.baby.babyName ?? `Baby #${id}`),
      data: {
        baby: j.baby as Record<string, unknown>,
        problems: j.problems ?? [],
        vitals: j.vitals ?? [],
        events: j.events ?? [],
        tasks: j.tasks ?? [],
        handovers: j.handovers ?? [],
      },
    });
    return j;
  } catch {
    return null;
  }
}

export async function snapshotUnit(reason: BackupEntry["reason"]): Promise<void> {
  try {
    const r = await fetch("/api/backup", { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as { babies?: BabySnapshot[] };
    const babies = j.babies ?? [];
    await saveBackup({
      reason,
      babyId: null,
      label: `Unit snapshot · ${babies.length} babies`,
      data: { babies },
    });
  } catch {
    /* ignore */
  }
}

/** Take a local snapshot of the baby (or whole unit) immediately before a mutating request. */
export async function capturePreEditBackup(url: string, method: string): Promise<void> {
  if (method === "GET") return;
  if (url.includes("/api/backup") || url.includes("/restore") || url.includes("/api/health")) return;
  const babyMatch = url.match(/\/api\/babies\/(\d+)/);
  if (babyMatch) {
    await snapshotBabyFromApi(Number(babyMatch[1]), method === "DELETE" ? "pre-delete" : "pre-edit");
    return;
  }
  if (url.includes("/api/seed") || (url.includes("/api/board") && method === "DELETE")) {
    await snapshotUnit("pre-edit");
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function isUnitData(data: BackupEntry["data"]): data is { babies: BabySnapshot[] } {
  return data != null && typeof data === "object" && "babies" in data && Array.isArray((data as { babies: unknown }).babies);
}
