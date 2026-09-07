import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Keymaster List — registered staff. The employee code (stored as a SHA-256
 * hash) is the password used to sign in; anyone not signed in is view-only.
 */
export const keymasters = pgTable(
  "keymasters",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** SHA-256 hash of the employee code (the code itself is never stored). */
    codeHash: text("code_hash").notNull(),
    role: text("role").notNull().default("Consultant"),
    unit: text("unit").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default("bootstrap"),
  },
  (t) => [index("keymasters_name_idx").on(t.name)],
);

export const babies = pgTable(
  "babies",
  {
    id: serial("id").primaryKey(),
    uhid: text("uhid").notNull(),
    babyName: text("baby_name").notNull(),
    motherName: text("mother_name").notNull().default(""),
    bed: text("bed").notNull().default(""),
    /** Which unit owns this record: nicu | picu | stepdown | postnatal | paeds */
    unit: text("unit").notNull().default("nicu"),
    /** Sub-specialty ICU when relevant: picu | ccu | cvicu | licu (PICU family only) */
    subspecialty: text("subspecialty").notNull().default(""),
    /** Insurance billing category: "" = none captured | "cash" | "insurance" | "scheme" */
    insurance: text("insurance").notNull().default(""),
    /** Free-text payer name when insurance is not a plain scheme (optional). */
    insuranceName: text("insurance_name").notNull().default(""),
    sex: text("sex").notNull().default("Male"),
    dob: timestamp("dob", { withTimezone: true }).notNull().defaultNow(),
    gestWeeks: integer("gest_weeks").notNull().default(37),
    gestDays: integer("gest_days").notNull().default(0),
    birthWeight: integer("birth_weight").notNull().default(2500),
    currentWeight: integer("current_weight").notNull().default(2500),
    birthLength: integer("birth_length").notNull().default(0),
    birthHc: integer("birth_hc").notNull().default(0),
    deliveryMode: text("delivery_mode").notNull().default("LSCS"),
    apgar1: integer("apgar1").notNull().default(8),
    apgar5: integer("apgar5").notNull().default(9),
    bloodGroup: text("blood_group").notNull().default("Unknown"),
    /** Mother's blood group — captured in NICU & Postnatal for iso-immunisation risk & maternal transfusion. */
    motherBloodGroup: text("mother_blood_group").notNull().default("Unknown"),
    inborn: boolean("inborn").notNull().default(true),
    acuity: text("acuity").notNull().default("stable"), // critical | guarded | stable | ready
    status: text("status").notNull().default("active"), // active | discharged | transferred | death
    isolation: text("isolation").notNull().default("none"),
    consultant: text("consultant").notNull().default(""),
    // Everything else lives here so the UI can grow without migrations.
    clinical: jsonb("clinical").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("babies_status_idx").on(t.status)],
);

export const problems = pgTable(
  "problems",
  {
    id: serial("id").primaryKey(),
    babyId: integer("baby_id").notNull(),
    system: text("system").notNull(),
    label: text("label").notNull(),
    detail: text("detail").notNull().default(""),
    status: text("status").notNull().default("active"), // active | watch | resolved
    onsetAt: timestamp("onset_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("problems_baby_idx").on(t.babyId)],
);

export const vitals = pgTable(
  "vitals",
  {
    id: serial("id").primaryKey(),
    babyId: integer("baby_id").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    recordedBy: text("recorded_by").notNull().default("Nurse"),
    hr: integer("hr"),
    rr: integer("rr"),
    spo2: integer("spo2"),
    spo2Post: integer("spo2_post"),
    temp: real("temp"),
    sbp: integer("sbp"),
    dbp: integer("dbp"),
    map: integer("map"),
    crt: integer("crt"),
    rbs: integer("rbs"),
    fio2: integer("fio2"),
    painScore: integer("pain_score"),
    /** Exact neonatal pain scale used and raw total (e.g. PIPP-R 14/21). */
    painScale: text("pain_scale").notNull().default("NIPS"),
    painRaw: real("pain_raw"),
    urineMlKgHr: real("urine_ml_kg_hr"),
    notes: text("notes").notNull().default(""),
  },
  (t) => [index("vitals_baby_idx").on(t.babyId, t.recordedAt)],
);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    babyId: integer("baby_id").notNull(),
    kind: text("kind").notNull().default("note"),
    text: text("text").notNull(),
    author: text("author").notNull().default("System"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_baby_idx").on(t.babyId, t.at)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    babyId: integer("baby_id").notNull(),
    text: text("text").notNull(),
    priority: text("priority").notNull().default("routine"), // now | today | routine
    done: boolean("done").notNull().default(false),
    /** When the action was marked completed (null while open). */
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** Who marked it completed. */
    doneBy: text("done_by").notNull().default(""),
    /** Manually entered due date/time for the action (never auto-filled). */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    /** Extra free-text detail for the action. */
    note: text("note").notNull().default(""),
    owner: text("owner").notNull().default("Team"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("tasks_baby_idx").on(t.babyId)],
);

export const learningItems = pgTable(
  "learning_items",
  {
    id: serial("id").primaryKey(),
    /** YYYY-MM-DD */
    day: text("day").notNull(),
    time: text("time").notNull().default(""), // e.g. "08:00"
    title: text("title").notNull(),
    kind: text("kind").notNull().default("class"), // class | seminar | journal | grand round | skills lab | webinar
    presenter: text("presenter").notNull().default(""),
    venue: text("venue").notNull().default(""),
    audience: text("audience").notNull().default(""),
    notes: text("notes").notNull().default(""),
    link: text("link").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("learning_day_idx").on(t.day)],
);

export const recentUpdates = pgTable(
  "recent_updates",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    source: text("source").notNull().default(""),
    url: text("url").notNull().default(""),
    summary: text("summary").notNull().default(""),
    tags: text("tags").notNull().default(""), // comma separated
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    pinnedBy: text("pinned_by").notNull().default(""), // if manually pinned/curated
  },
  (t) => [index("recent_updates_fetched_idx").on(t.fetchedAt)],
);

export const roster = pgTable(
  "roster",
  {
    id: serial("id").primaryKey(),
    /** YYYY-MM — one monthly duty roster */
    month: text("month").notNull().unique(),
    /** { "01": { nicu: "...", picu: "...", ... }, ... } */
    data: jsonb("data").notNull().default({}),
    source: text("source").notNull().default("manual"),
    updatedBy: text("updated_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("roster_month_idx").on(t.month)],
);

export const oncall = pgTable(
  "oncall",
  {
    id: serial("id").primaryKey(),
    /** YYYY-MM-DD — one duty roster per day */
    day: text("day").notNull().unique(),
    fields: jsonb("fields").notNull().default({}),
    updatedBy: text("updated_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("oncall_day_idx").on(t.day)],
);

export const handovers = pgTable(
  "handovers",
  {
    id: serial("id").primaryKey(),
    babyId: integer("baby_id").notNull(),
    shift: text("shift").notNull().default("Morning"),
    fromStaff: text("from_staff").notNull().default(""),
    toStaff: text("to_staff").notNull().default(""),
    illness: text("illness").notNull().default("stable"),
    summary: text("summary").notNull().default(""),
    actions: jsonb("actions").notNull().default([]),
    contingency: jsonb("contingency").notNull().default([]),
    synthesis: text("synthesis").notNull().default(""),
    snapshot: jsonb("snapshot").notNull().default({}),
    acknowledgedBy: text("acknowledged_by").notNull().default(""),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("handovers_baby_idx").on(t.babyId, t.createdAt)],
);

export type Baby = typeof babies.$inferSelect;
export type Problem = typeof problems.$inferSelect;
export type Vital = typeof vitals.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Handover = typeof handovers.$inferSelect;
