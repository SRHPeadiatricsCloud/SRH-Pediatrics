/**
 * Versioned backup envelope + forward/backward-compatible migration.
 *
 * Every export (and every stored snapshot) is wrapped in an envelope that
 * records the schema version and app version that produced it. When a future
 * build imports an older backup, `migrateBackup()` walks the payload from its
 * recorded version up to the current schema, filling in defaults for any new
 * fields, so old patient data keeps working across upgrades.
 */

export const BACKUP_SCHEMA_VERSION = 2;
export const APP_VERSION = "2.0.0";

export type BackupEnvelope = {
  kind: "srh-nicu-backup";
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  payload: unknown;
};

export function isEnvelope(x: unknown): x is BackupEnvelope {
  return (
    !!x &&
    typeof x === "object" &&
    (x as BackupEnvelope).kind === "srh-nicu-backup" &&
    typeof (x as BackupEnvelope).schemaVersion === "number"
  );
}

export function wrapBackup(payload: unknown): BackupEnvelope {
  return {
    kind: "srh-nicu-backup",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    payload,
  };
}

/* ---------- field-level defaults for each collection ---------- */

function normBaby(b: Record<string, unknown>): Record<string, unknown> {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...b,
    id: Number(b.id ?? 0),
    uhid: String(b.uhid ?? ""),
    babyName: String(b.babyName ?? "Baby"),
    motherName: String(b.motherName ?? ""),
    bed: String(b.bed ?? ""),
    unit: String(b.unit ?? "nicu"),
    subspecialty: String(b.subspecialty ?? ""),
    insurance: String(b.insurance ?? ""),
    insuranceName: String(b.insuranceName ?? ""),
    sex: String(b.sex ?? "Male"),
    dob: String(b.dob ?? new Date().toISOString()),
    gestWeeks: Number(b.gestWeeks ?? 37),
    gestDays: Number(b.gestDays ?? 0),
    birthWeight: Number(b.birthWeight ?? 2500),
    currentWeight: Number(b.currentWeight ?? b.birthWeight ?? 2500),
    deliveryMode: String(b.deliveryMode ?? ""),
    apgar1: Number(b.apgar1 ?? 0),
    apgar5: Number(b.apgar5 ?? 0),
    bloodGroup: String(b.bloodGroup ?? "Unknown"),
    motherBloodGroup: String(b.motherBloodGroup ?? "Unknown"),
    inborn: Boolean(b.inborn ?? true),
    acuity: String(b.acuity ?? "stable"),
    status: String(b.status ?? "active"),
    isolation: String(b.isolation ?? "none"),
    consultant: String(b.consultant ?? ""),
    clinical: (b.clinical as Record<string, unknown>) ?? {},
  };
}

function normTask(t: Record<string, unknown>): Record<string, unknown> {
  return {
    ...t,
    id: Number(t.id ?? 0),
    babyId: Number(t.babyId ?? 0),
    text: String(t.text ?? ""),
    priority: String(t.priority ?? "today"),
    done: Boolean(t.done ?? false),
    // v2 additions — old backups simply omit these
    doneAt: t.done && t.doneAt ? String(t.doneAt) : null,
    doneBy: String(t.doneBy ?? ""),
    owner: String(t.owner ?? "Team"),
    createdAt: String(t.createdAt ?? new Date().toISOString()),
  };
}

function normVital(v: Record<string, unknown>): Record<string, unknown> {
  return {
    ...v,
    id: Number(v.id ?? 0),
    babyId: Number(v.babyId ?? 0),
    recordedAt: String(v.recordedAt ?? new Date().toISOString()),
    painScale: String(v.painScale ?? "NIPS"),
    painRaw: v.painRaw ?? v.painScore ?? null,
  };
}

function normProblem(p: Record<string, unknown>): Record<string, unknown> {
  return {
    ...p,
    id: Number(p.id ?? 0),
    babyId: Number(p.babyId ?? 0),
    system: String(p.system ?? "Other"),
    label: String(p.label ?? ""),
    status: String(p.status ?? "active"),
    onsetAt: String(p.onsetAt ?? new Date().toISOString()),
    resolvedAt: p.resolvedAt ? String(p.resolvedAt) : null,
  };
}

function normHandover(h: Record<string, unknown>): Record<string, unknown> {
  return {
    ...h,
    id: Number(h.id ?? 0),
    babyId: Number(h.babyId ?? 0),
    actions: Array.isArray(h.actions) ? h.actions : [],
    contingency: Array.isArray(h.contingency) ? h.contingency : [],
    summary: String(h.summary ?? ""),
    synthesis: String(h.synthesis ?? ""),
    createdAt: String(h.createdAt ?? new Date().toISOString()),
  };
}

function normEvent(e: Record<string, unknown>): Record<string, unknown> {
  return {
    ...e,
    id: Number(e.id ?? 0),
    babyId: Number(e.babyId ?? 0),
    kind: String(e.kind ?? "note"),
    text: String(e.text ?? ""),
    author: String(e.author ?? ""),
    at: String(e.at ?? new Date().toISOString()),
  };
}

/** Normalise a whole-store payload (v0 raw or any version) to current schema. */
export function migrateStore(payload: unknown): Record<string, unknown> {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    babies: (Array.isArray(p.babies) ? p.babies : []).map((b) => normBaby(b as Record<string, unknown>)),
    problems: (Array.isArray(p.problems) ? p.problems : []).map((x) => normProblem(x as Record<string, unknown>)),
    vitals: (Array.isArray(p.vitals) ? p.vitals : []).map((x) => normVital(x as Record<string, unknown>)),
    events: (Array.isArray(p.events) ? p.events : []).map((x) => normEvent(x as Record<string, unknown>)),
    tasks: (Array.isArray(p.tasks) ? p.tasks : []).map((x) => normTask(x as Record<string, unknown>)),
    handovers: (Array.isArray(p.handovers) ? p.handovers : []).map((x) => normHandover(x as Record<string, unknown>)),
    oncall: Array.isArray(p.oncall) ? p.oncall : [],
    roster: Array.isArray(p.roster) ? p.roster : [],
    meta: (p.meta as Record<string, unknown>) ?? { updatedAt: new Date().toISOString() },
  };
}

/** Normalise a single-baby snapshot payload to current schema. */
export function migrateBaby(payload: unknown): Record<string, unknown> {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    baby: normBaby((p.baby ?? {}) as Record<string, unknown>),
    problems: (Array.isArray(p.problems) ? p.problems : []).map((x) => normProblem(x as Record<string, unknown>)),
    vitals: (Array.isArray(p.vitals) ? p.vitals : []).map((x) => normVital(x as Record<string, unknown>)),
    events: (Array.isArray(p.events) ? p.events : []).map((x) => normEvent(x as Record<string, unknown>)),
    tasks: (Array.isArray(p.tasks) ? p.tasks : []).map((x) => normTask(x as Record<string, unknown>)),
    handovers: (Array.isArray(p.handovers) ? p.handovers : []).map((x) => normHandover(x as Record<string, unknown>)),
  };
}

/**
 * Accept ANY input (envelope of any version, raw v0 store, or raw baby) and
 * return { store?, baby?, fromVersion } fully migrated to the current schema.
 */
export function migrateBackup(input: unknown): {
  store?: Record<string, unknown>;
  baby?: Record<string, unknown>;
  fromVersion: number;
} {
  const fromVersion = isEnvelope(input) ? input.schemaVersion : 0;
  const payload = isEnvelope(input) ? input.payload : input;
  const p = (payload ?? {}) as Record<string, unknown>;
  if (Array.isArray(p.babies) || (p.babies === undefined && p.baby === undefined && p.meta)) {
    return { store: migrateStore(payload), fromVersion };
  }
  if (p.baby) {
    return { baby: migrateBaby(payload), fromVersion };
  }
  // unknown shape — treat as empty store
  return { store: migrateStore({}), fromVersion };
}
