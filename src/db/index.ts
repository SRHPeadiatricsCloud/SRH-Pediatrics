import { drizzle } from "drizzle-orm/node-postgres";
import { newDb } from "pg-mem";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();

function createMemoryPool() {
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  mem.public.registerFunction({
    name: "version",
    implementation: () => "PostgreSQL 16.0 (pg-mem fallback)",
  });

  mem.public.none(`
    CREATE TABLE IF NOT EXISTS keymasters (
      id serial PRIMARY KEY,
      name text NOT NULL,
      code_hash text NOT NULL,
      role text NOT NULL DEFAULT 'Consultant',
      unit text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by text NOT NULL DEFAULT 'bootstrap'
    );
    CREATE INDEX IF NOT EXISTS keymasters_name_idx ON keymasters (name);

    CREATE TABLE IF NOT EXISTS babies (
      id serial PRIMARY KEY,
      uhid text NOT NULL,
      baby_name text NOT NULL,
      mother_name text NOT NULL DEFAULT '',
      bed text NOT NULL DEFAULT '',
      unit text NOT NULL DEFAULT 'nicu',
      subspecialty text NOT NULL DEFAULT '',
      insurance text NOT NULL DEFAULT '',
      insurance_name text NOT NULL DEFAULT '',
      sex text NOT NULL DEFAULT 'Male',
      dob timestamptz NOT NULL DEFAULT now(),
      gest_weeks integer NOT NULL DEFAULT 37,
      gest_days integer NOT NULL DEFAULT 0,
      birth_weight integer NOT NULL DEFAULT 2500,
      current_weight integer NOT NULL DEFAULT 2500,
      birth_length integer NOT NULL DEFAULT 0,
      birth_hc integer NOT NULL DEFAULT 0,
      delivery_mode text NOT NULL DEFAULT 'LSCS',
      apgar1 integer NOT NULL DEFAULT 8,
      apgar5 integer NOT NULL DEFAULT 9,
      blood_group text NOT NULL DEFAULT 'Unknown',
      mother_blood_group text NOT NULL DEFAULT 'Unknown',
      inborn boolean NOT NULL DEFAULT true,
      acuity text NOT NULL DEFAULT 'stable',
      status text NOT NULL DEFAULT 'active',
      isolation text NOT NULL DEFAULT 'none',
      consultant text NOT NULL DEFAULT '',
      clinical jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS babies_status_idx ON babies (status);

    CREATE TABLE IF NOT EXISTS problems (
      id serial PRIMARY KEY,
      baby_id integer NOT NULL,
      system text NOT NULL,
      label text NOT NULL,
      detail text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'active',
      onset_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS problems_baby_idx ON problems (baby_id);

    CREATE TABLE IF NOT EXISTS vitals (
      id serial PRIMARY KEY,
      baby_id integer NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      recorded_by text NOT NULL DEFAULT 'Nurse',
      hr integer,
      rr integer,
      spo2 integer,
      spo2_post integer,
      temp real,
      sbp integer,
      dbp integer,
      map integer,
      crt integer,
      rbs integer,
      fio2 integer,
      pain_score integer,
      pain_scale text NOT NULL DEFAULT 'NIPS',
      pain_raw real,
      urine_ml_kg_hr real,
      notes text NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS vitals_baby_idx ON vitals (baby_id, recorded_at);

    CREATE TABLE IF NOT EXISTS events (
      id serial PRIMARY KEY,
      baby_id integer NOT NULL,
      kind text NOT NULL DEFAULT 'note',
      text text NOT NULL,
      author text NOT NULL DEFAULT 'System',
      at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS events_baby_idx ON events (baby_id, at);

    CREATE TABLE IF NOT EXISTS tasks (
      id serial PRIMARY KEY,
      baby_id integer NOT NULL,
      text text NOT NULL,
      priority text NOT NULL DEFAULT 'routine',
      done boolean NOT NULL DEFAULT false,
      done_at timestamptz,
      done_by text NOT NULL DEFAULT '',
      scheduled_at timestamptz,
      note text NOT NULL DEFAULT '',
      owner text NOT NULL DEFAULT 'Team',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tasks_baby_idx ON tasks (baby_id);

    CREATE TABLE IF NOT EXISTS learning_items (
      id serial PRIMARY KEY,
      day text NOT NULL,
      time text NOT NULL DEFAULT '',
      title text NOT NULL,
      kind text NOT NULL DEFAULT 'class',
      presenter text NOT NULL DEFAULT '',
      venue text NOT NULL DEFAULT '',
      audience text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      link text NOT NULL DEFAULT '',
      created_by text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS learning_day_idx ON learning_items (day);

    CREATE TABLE IF NOT EXISTS recent_updates (
      id serial PRIMARY KEY,
      title text NOT NULL,
      source text NOT NULL DEFAULT '',
      url text NOT NULL DEFAULT '',
      summary text NOT NULL DEFAULT '',
      tags text NOT NULL DEFAULT '',
      published_at timestamptz,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      pinned_by text NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS recent_updates_fetched_idx ON recent_updates (fetched_at);

    CREATE TABLE IF NOT EXISTS roster (
      id serial PRIMARY KEY,
      month text NOT NULL UNIQUE,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      source text NOT NULL DEFAULT 'manual',
      updated_by text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS roster_month_idx ON roster (month);

    CREATE TABLE IF NOT EXISTS oncall (
      id serial PRIMARY KEY,
      day text NOT NULL UNIQUE,
      fields jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_by text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS oncall_day_idx ON oncall (day);

    CREATE TABLE IF NOT EXISTS handovers (
      id serial PRIMARY KEY,
      baby_id integer NOT NULL,
      shift text NOT NULL DEFAULT 'Morning',
      from_staff text NOT NULL DEFAULT '',
      to_staff text NOT NULL DEFAULT '',
      illness text NOT NULL DEFAULT 'stable',
      summary text NOT NULL DEFAULT '',
      actions jsonb NOT NULL DEFAULT '[]'::jsonb,
      contingency jsonb NOT NULL DEFAULT '[]'::jsonb,
      synthesis text NOT NULL DEFAULT '',
      snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      acknowledged_by text NOT NULL DEFAULT '',
      acknowledged_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS handovers_baby_idx ON handovers (baby_id, created_at);
  `);

  const { Pool: BasePool } = mem.adapters.createPg();
  const basePool = new BasePool();
  const baseQuery = basePool.query.bind(basePool);

  /**
   * pg-mem mishandles multi-row INSERTs when rows mix explicit values and
   * `default` for NOT NULL columns with defaults (it resolves `default` to
   * NULL for rows after the first). Split such statements into one INSERT
   * per row and merge the results.
   */
  function splitMultiRowInsert(text: string, values: unknown[]) {
    const m = /^(\s*insert\s+into\s[\s\S]*?\bvalues\s*)/i.exec(text);
    if (!m) return null;
    const prefix = m[1];
    let i = m[0].length;
    const tuples: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "'") inString = text[i + 1] === "'" ? (i++, true) : false;
        continue;
      }
      if (ch === "'") { inString = true; continue; }
      if (ch === "(") { if (depth === 0) start = i; depth++; continue; }
      if (ch === ")") {
        depth--;
        if (depth === 0) tuples.push(text.slice(start, i + 1));
        continue;
      }
      if (depth === 0 && !/[\s,]/.test(ch)) break;
    }
    if (tuples.length < 2) return null;
    const suffix = text.slice(i);
    const rows = tuples.map((tuple) => {
      const params: unknown[] = [];
      const sqlTuple = tuple.replace(/\$(\d+)/g, (_all, n: string) => {
        params.push(values[Number(n) - 1]);
        return `$${params.length}`;
      });
      return { sql: `${prefix}${sqlTuple}${suffix}`, params };
    });
    return rows;
  }

  basePool.query = async (...args: unknown[]) => {
    const first = args[0] as string | { text?: string; rowMode?: string } | undefined;
    const text = typeof first === "string" ? first : (first?.text ?? "");

    if (/^\s*truncate\s+table\s+/i.test(text) && text.includes(",")) {
      const restartIdentity = /restart\s+identity/i.test(text);
      const tables = text
        .replace(/^\s*truncate\s+table\s+/i, "")
        .replace(/restart\s+identity/gi, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      let lastResult: unknown = { rows: [], rowCount: 0, command: "TRUNCATE", fields: [] };
      for (const table of tables) {
        lastResult = await baseQuery(`TRUNCATE TABLE ${table}${restartIdentity ? " RESTART IDENTITY" : ""}`);
      }
      return lastResult;
    }

    if (/^\s*insert\s+into\s/i.test(text) && /\bdefault\b/i.test(text)) {
      const values =
        typeof first === "object" && first
          ? ((first as { values?: unknown[] }).values ?? (args[1] as unknown[] | undefined) ?? [])
          : ((args[1] as unknown[] | undefined) ?? []);
      const split = splitMultiRowInsert(text, values);
      if (split) {
        const merged: { rows: unknown[]; rowCount: number; command: string; fields: unknown[] } = {
          rows: [],
          rowCount: 0,
          command: "INSERT",
          fields: [],
        };
        for (const row of split) {
          const result = await baseQuery(row.sql, row.params);
          merged.rows.push(...(result.rows ?? []));
          merged.rowCount += result.rowCount ?? 0;
          if (Array.isArray(result.fields) && result.fields.length) merged.fields = result.fields;
        }
        if (typeof first === "object" && first && first.rowMode === "array") {
          const fields = merged.fields as { name: string }[];
          merged.rows = (merged.rows as Record<string, unknown>[]).map((row) => {
            const names = fields.length > 0 ? fields.map((f) => f.name) : Object.keys(row);
            return names.map((name) => row[name]);
          });
        }
        return merged;
      }
    }

    if (typeof first === "object" && first) {
      const config = { ...first, types: undefined };
      if (first.rowMode === "array") {
        const result = await baseQuery({ ...config, rowMode: undefined }, ...(args.slice(1) as [unknown?]));
        const fields = Array.isArray(result.fields) ? result.fields : [];
        // pg-mem often reports an empty `fields` array; fall back to the row's
        // own keys (insertion order matches the SELECT/RETURNING column order)
        // so drizzle's array-row mapping receives real values instead of [].
        const rows = (result.rows ?? []).map((row: Record<string, unknown>) => {
          const names: string[] =
            fields.length > 0 ? fields.map((f: { name: string }) => f.name) : Object.keys(row);
          return names.map((name: string) => row[name]);
        });
        const effectiveFields =
          fields.length > 0
            ? fields
            : Object.keys((result.rows ?? [])[0] ?? {}).map((name) => ({ name }));
        return {
          ...result,
          rows,
          fields: effectiveFields,
        };
      }
      return baseQuery(config, ...(args.slice(1) as [unknown?]));
    }

    return baseQuery(...(args as [unknown]));
  };

  return basePool as Pool;
}

function createPool() {
  if (databaseUrl) {
    return new Pool({ connectionString: databaseUrl });
  }

  return createMemoryPool();
}

const globalForDb = globalThis as typeof globalThis & {
  __srhPediatricsPool?: Pool;
};

export const pool = globalForDb.__srhPediatricsPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__srhPediatricsPool = pool;
}

export const db = drizzle(pool);
