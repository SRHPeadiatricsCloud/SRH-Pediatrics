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
  hash?: string;
  size?: number;
};

export type BackupSettings = {
  enabled: boolean;
  intervalMinutes: number;
  smartBackup: boolean;
  dedup: boolean;
  maxPerBaby: number;
  maxUnit: number;
  retentionMode: "tiered" | "simple";
};

const DB_NAME = "srh-nicu-backup";
const STORE = "snapshots";
const LS_KEY = "srh_nicu_backups_fallback";
const SETTINGS_KEY = "srh_backup_settings";
const HASH_KEY = "srh_backup_last_hashes";

export const DEFAULT_SETTINGS: BackupSettings = {
  enabled: true,
  intervalMinutes: 15,
  smartBackup: true,
  dedup: true,
  maxPerBaby: 24,
  maxUnit: 20,
  retentionMode: "tiered",
};

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
    localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-60)));
  } catch {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-20)));
    } catch {}
  }
}

function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function computeHash(data: unknown): string {
  try {
    const s = JSON.stringify(data, (_k, v) => {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const sorted: Record<string, unknown> = {};
        Object.keys(v as object)
          .sort()
          .forEach((kk) => {
            sorted[kk] = (v as Record<string, unknown>)[kk];
          });
        return sorted;
      }
      return v;
    });
    return cyrb53(s);
  } catch {
    return Date.now().toString(36);
  }
}

type HashMap = Record<string, string>;
function getHashMap(): HashMap {
  try {
    return JSON.parse(localStorage.getItem(HASH_KEY) || "{}");
  } catch {
    return {};
  }
}
function setHashMap(map: HashMap) {
  try {
    localStorage.setItem(HASH_KEY, JSON.stringify(map));
  } catch {}
}
function hashKeyFor(babyId: number | null): string {
  return babyId == null ? "unit" : `baby:${babyId}`;
}

export function getBackupSettings(): BackupSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BackupSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveBackupSettings(s: Partial<BackupSettings>) {
  const cur = getBackupSettings();
  const next = { ...cur, ...s };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("neo:backup-settings"));
  return next;
}

function tieredPruneForGroup(rows: BackupEntry[], maxKeep: number): BackupEntry[] {
  if (rows.length <= maxKeep) return rows;
  const preDelete = rows.filter((r) => r.reason === "pre-delete");
  const others = rows.filter((r) => r.reason !== "pre-delete").sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const now = Date.now();
  const kept: BackupEntry[] = [...preDelete.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, Math.min(10, maxKeep))];

  const usedHour = new Set<number>();
  const usedDay = new Set<number>();
  const usedWeek = new Set<number>();

  for (const r of kept) {
    const t = +new Date(r.at);
    usedHour.add(Math.floor(t / 3_600_000));
    usedDay.add(Math.floor(t / 86_400_000));
    usedWeek.add(Math.floor(t / (7 * 86_400_000)));
  }

  for (const r of others) {
    if (kept.length >= maxKeep) break;
    const t = +new Date(r.at);
    const ageHours = (now - t) / 3_600_000;

    if (kept.filter((x) => x.reason !== "pre-delete").length < 6) {
      kept.push(r);
      usedHour.add(Math.floor(t / 3_600_000));
      usedDay.add(Math.floor(t / 86_400_000));
      usedWeek.add(Math.floor(t / (7 * 86_400_000)));
      continue;
    }

    if (ageHours < 24) {
      const hk = Math.floor(t / 3_600_000);
      if (!usedHour.has(hk)) {
        kept.push(r);
        usedHour.add(hk);
      }
    } else if (ageHours < 168) {
      const dk = Math.floor(t / 86_400_000);
      if (!usedDay.has(dk)) {
        kept.push(r);
        usedDay.add(dk);
      }
    } else {
      const wk = Math.floor(t / (7 * 86_400_000));
      if (!usedWeek.has(wk)) {
        kept.push(r);
        usedWeek.add(wk);
      }
    }
  }

  if (kept.length < maxKeep) {
    for (const r of others) {
      if (kept.length >= maxKeep) break;
      if (!kept.find((k) => k.id === r.id && k.at === r.at)) kept.push(r);
    }
  }

  return kept.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}

function pruneList(rows: BackupEntry[]): BackupEntry[] {
  const settings = typeof window !== "undefined" ? getBackupSettings() : DEFAULT_SETTINGS;
  const maxUnit = settings.maxUnit;
  const maxPerBaby = settings.maxPerBaby;

  if (settings.retentionMode === "simple") {
    const unit = rows.filter((r) => r.babyId == null).sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, maxUnit);
    const byBaby = new Map<number, BackupEntry[]>();
    for (const r of rows.filter((x) => x.babyId != null)) {
      const list = byBaby.get(r.babyId!) ?? [];
      list.push(r);
      byBaby.set(r.babyId!, list);
    }
    const kept: BackupEntry[] = [...unit];
    for (const list of byBaby.values()) {
      kept.push(...list.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, maxPerBaby));
    }
    return kept;
  }

  const unitRows = rows.filter((r) => r.babyId == null);
  const byBaby = new Map<number, BackupEntry[]>();
  for (const r of rows.filter((x) => x.babyId != null)) {
    const list = byBaby.get(r.babyId!) ?? [];
    list.push(r);
    byBaby.set(r.babyId!, list);
  }

  const kept: BackupEntry[] = [...tieredPruneForGroup(unitRows, maxUnit)];
  for (const list of byBaby.values()) {
    kept.push(...tieredPruneForGroup(list, maxPerBaby));
  }
  return kept;
}

async function pruneDb(db: IDBDatabase) {
  const all = await new Promise<BackupEntry[]>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as BackupEntry[]) ?? []);
    req.onerror = () => resolve([]);
  });
  const keep = new Set(pruneList(all).map((r) => r.id));
  const drop = all.filter((r) => !keep.has(r.id));
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

export async function saveBackup(entry: Omit<BackupEntry, "id" | "at"> & { at?: string }): Promise<boolean> {
  const settings = typeof window !== "undefined" ? getBackupSettings() : DEFAULT_SETTINGS;
  if (!settings.enabled && entry.reason === "scheduled") return false;

  const hash = computeHash(entry.data);
  const key = hashKeyFor(entry.babyId);

  if (settings.dedup && entry.reason === "scheduled") {
    const map = getHashMap();
    if (map[key] === hash) {
      return false;
    }
    map[key] = hash;
    setHashMap(map);
  } else if (entry.reason !== "scheduled") {
    const map = getHashMap();
    map[key] = hash;
    setHashMap(map);
  }

  const size = (() => {
    try {
      return JSON.stringify(entry.data).length;
    } catch {
      return 0;
    }
  })();

  const row: BackupEntry = { ...entry, at: entry.at ?? new Date().toISOString(), hash, size };
  const db = await openDb();
  if (!db) {
    const all = lsRead();
    all.push({ ...row, id: Date.now() });
    lsWrite(pruneList(all));
    notify();
    return true;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  await pruneDb(db);
  notify();
  return true;
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

export async function getStorageEstimate(): Promise<{ usage: number; quota: number; count: number; totalSize: number }> {
  let usage = 0,
    quota = 0;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      usage = est.usage ?? 0;
      quota = est.quota ?? 0;
    }
  } catch {}
  const rows = await listBackups();
  const totalSize = rows.reduce((s, r) => s + (r.size ?? 0), 0);
  return { usage, quota, count: rows.length, totalSize };
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

export async function snapshotUnit(reason: BackupEntry["reason"]): Promise<boolean> {
  try {
    const r = await fetch("/api/backup", { cache: "no-store" });
    if (!r.ok) return false;
    const j = (await r.json()) as { babies?: BabySnapshot[] };
    const babies = j.babies ?? [];
    const saved = await saveBackup({
      reason,
      babyId: null,
      label: `Unit snapshot · ${babies.length} babies`,
      data: { babies },
    });
    return saved;
  } catch {
    return false;
  }
}

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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
