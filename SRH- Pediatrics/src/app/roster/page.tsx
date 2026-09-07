"use client";

import {
  Baby,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HeartPulse,
  Loader2,
  Pencil,
  Printer,
  Save,
  School,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar, api, useLocked, useUser } from "@/components/ui";
import {
  ROLE_KEYS,
  ROLE_META,
  daysInMonth,
  monthLabel,
  parseRosterText,
  parseSheetRows,
  type RoleKey,
  type RosterData,
  type RosterDay,
} from "@/lib/roster-parse";
import { fileKind, readImage, readPdf, readSpreadsheet, readWord } from "@/lib/roster-readers";

const ROLE_ICON: Record<RoleKey, typeof Baby> = {
  nicu: Baby,
  picu: HeartPulse,
  delPreterm: CalendarClock,
  delTerm: CalendarCheck,
  peds: Stethoscope,
  sr: ShieldCheck,
  pgSenior: GraduationCap,
  pgJunior: School,
};

const ROLE_TINT: Record<RoleKey, string> = {
  nicu: "text-cyan-300 border-cyan-400/30 bg-cyan-400/10",
  picu: "text-rose-300 border-rose-400/30 bg-rose-400/10",
  delPreterm: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  delTerm: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
  peds: "text-sky-300 border-sky-400/30 bg-sky-400/10",
  sr: "text-violet-300 border-violet-400/30 bg-violet-400/10",
  pgSenior: "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-400/10",
  pgJunior: "text-indigo-300 border-indigo-400/30 bg-indigo-400/10",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function RosterPage() {
  const locked = useLocked();
  const { name } = useUser();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<RosterData>({});
  const [meta, setMeta] = useState<{ updatedBy: string; updatedAt: string; source: string } | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  // import state
  const [busy, setBusy] = useState<null | { stage: string; pct: number }>(null);
  const [preview, setPreview] = useState<RosterData | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // day editor
  const [editDay, setEditDay] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<RosterDay>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await fetch(`/api/roster?month=${month}`, { cache: "no-store" });
      const j = await r.json();
      if (!alive) return;
      setData((j.row?.data as RosterData) ?? {});
      setMeta(
        j.row ? { updatedBy: j.row.updatedBy, updatedAt: j.row.updatedAt, source: j.row.source } : null,
      );
    })();
    return () => {
      alive = false;
    };
  }, [month, loadKey]);

  const total = daysInMonth(month);
  const firstOffset = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const dow = new Date(y, m - 1, 1).getDay(); // 0=Sun
    return (dow + 6) % 7; // Mon=0
  }, [month]);
  const todayKey = currentMonth() === month ? String(new Date().getDate()).padStart(2, "0") : null;

  const persist = useCallback(
    async (next: RosterData, source: string) => {
      await api("/api/roster", "POST", { month, data: next, source });
      setLoadKey((k) => k + 1);
    },
    [month],
  );

  const handleFile = async (file: File) => {
    setImportError("");
    setPreview(null);
    setUnmatched([]);
    setImagePreview(null);
    const kind = fileKind(file.name);
    if (kind === "unknown") {
      setImportError("Unsupported file. Use .xls .xlsx .csv .doc .docx .pdf or an image.");
      return;
    }
    try {
      setBusy({ stage: `reading ${file.name}…`, pct: 8 });
      let text = "";
      let rows: (string | number)[][] | undefined;
      if (kind === "sheet") {
        const r = await readSpreadsheet(file);
        rows = r.rows;
        text = r.text ?? "";
      } else if (kind === "word") {
        setBusy({ stage: "extracting document text…", pct: 35 });
        text = (await readWord(file)).text ?? "";
      } else if (kind === "pdf") {
        text = (await readPdf(file, (pct) => setBusy({ stage: `reading PDF page…`, pct: 10 + pct * 0.7 }))).text ?? "";
      } else {
        const r = await readImage(file, (pct, stage) => setBusy({ stage: stage ?? "OCR…", pct }));
        text = r.text ?? "";
        setImagePreview(r.imagePreview ?? null);
      }
      setBusy({ stage: "mapping names to duties…", pct: 95 });
      const parsed = rows?.length ? parseSheetRows(rows) : parseRosterText(text, month);
      // merge: spreadsheet parse may miss keyword-free lines → also run text parse
      if (rows?.length) {
        const t = parseRosterText(text, month);
        for (const [day, fields] of Object.entries(t.data)) {
          parsed.data[day] = { ...fields, ...parsed.data[day] };
        }
        parsed.unmatched = [...new Set([...parsed.unmatched, ...t.unmatched])];
      }
      const count = Object.keys(parsed.data).length;
      if (!count) {
        setImportError(
          "No dated duty lines found. Expected lines like “01/09/2026  NICU: Dr. X  PICU: Dr. Y” or a sheet with a Day column. You can still add days manually below.",
        );
      }
      setPreview(parsed.data);
      setUnmatched(parsed.unmatched.slice(0, 8));
      setSourceName(file.name);
    } catch (e) {
      setImportError(
        `Could not read this file (${(e as Error).message.slice(0, 90)}). PDF/image parsing needs internet for the worker; .xls/.xlsx/.docx work offline. You can type the roster manually.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const savePreview = async () => {
    if (!preview) return;
    setSaving(true);
    await persist({ ...data, ...preview }, `import: ${sourceName}`);
    setPreview(null);
    setSaving(false);
  };

  const openEditor = (dayKey: string) => {
    setEditDay(dayKey);
    setEditFields({ ...(data[dayKey] ?? {}) });
  };

  const saveDay = async () => {
    if (!editDay) return;
    setSaving(true);
    const clean: RosterDay = {};
    for (const k of ROLE_KEYS) {
      const v = (editFields[k] ?? "").trim();
      if (v) clean[k] = v;
    }
    await persist({ ...data, [editDay]: clean }, meta?.source ?? "manual");
    setSaving(false);
    setEditDay(null);
  };

  const clearDay = async () => {
    if (!editDay) return;
    setSaving(true);
    await persist({ ...data, [editDay]: {} }, meta?.source ?? "manual");
    setSaving(false);
    setEditDay(null);
  };

  const filledDays = Object.values(data).filter((d) => Object.values(d).some((v) => (v ?? "").trim())).length;

  return (
    <main className="min-h-screen pb-20">
      <TopBar />
      <div className="mx-auto max-w-[1400px] px-4 py-5">
        {/* header */}
        <div className="card mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300">
              <CalendarDays size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black tracking-tight text-white">Monthly Duty Roster</h1>
              <p className="text-[11px] text-slate-400">
                Department of Pediatrics · import from XLS / DOC / PDF / image, or type day by day ·{" "}
                {filledDays}/{total} days filled
                {meta?.updatedBy ? ` · saved by ${meta.updatedBy} (${meta.source})` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button className="btn-ghost !px-2.5" onClick={() => setMonth(shiftMonth(month, -1))} title="Previous month">
                <ChevronLeft size={15} />
              </button>
              <input
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                className="inp !w-auto !py-1.5 text-sm font-bold"
              />
              <button className="btn-ghost !px-2.5" onClick={() => setMonth(shiftMonth(month, 1))} title="Next month">
                <ChevronRight size={15} />
              </button>
              <button className="btn-ghost" onClick={() => window.print()}>
                <Printer size={14} /> Print month
              </button>
              <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xls,.xlsx,.xlsm,.csv,.ods,.doc,.docx,.rtf,.pdf,.png,.jpg,.jpeg,.webp,.bmp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* month label strip */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
            <span className="text-lg font-black uppercase tracking-widest text-fuchsia-300">{monthLabel(month)}</span>
            <span className="text-[11px] text-slate-500">tap any day to edit · tap Import to load a roster file</span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {ROLE_KEYS.map((k) => {
                const Icon = ROLE_ICON[k];
                return (
                  <span
                    key={k}
                    title={ROLE_META[k].label}
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${ROLE_TINT[k]}`}
                  >
                    <Icon size={10} /> {ROLE_META[k].short}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* import progress */}
        {busy && (
          <div className="card mb-4 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
              <Loader2 size={15} className="animate-spin" /> {busy.stage}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 transition-all duration-300"
                style={{ width: `${busy.pct}%` }}
              />
            </div>
          </div>
        )}
        {importError && (
          <div className="card mb-4 border-rose-400/40 p-3 text-xs text-rose-200">{importError}</div>
        )}

        {/* import preview */}
        {preview && Object.keys(preview).length > 0 && (
          <div className="card mb-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-black text-white">
                Parsed from <span className="text-cyan-300">{sourceName}</span> — review &amp; correct, then save
              </h2>
              <div className="ml-auto flex gap-1.5">
                <button className="btn-ghost" onClick={() => setPreview(null)}>
                  <X size={13} /> Discard
                </button>
                <button className="btn-primary" disabled={saving} onClick={savePreview}>
                  <Save size={13} /> Save {Object.keys(preview).length} days to cloud
                </button>
              </div>
            </div>
            {imagePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="imported roster" className="mt-3 max-h-56 rounded-xl border border-white/10" />
            )}
            <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-slate-900/95 text-slate-400">
                  <tr>
                    <th className="p-1.5">Day</th>
                    {ROLE_KEYS.map((k) => (
                      <th key={k} className="p-1.5">
                        {ROLE_META[k].short}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(preview)
                    .sort()
                    .map((day) => (
                      <tr key={day} className="border-t border-white/5">
                        <td className="p-1.5 font-black text-white">{day}</td>
                        {ROLE_KEYS.map((k) => (
                          <td key={k} className="p-1">
                            <input
                              className="inp !px-1.5 !py-1 text-[11px]"
                              value={preview[day]?.[k] ?? ""}
                              onChange={(e) =>
                                setPreview((p) => ({ ...p!, [day]: { ...p![day], [k]: e.target.value } }))
                              }
                            />
                          </td>
                        ))}
                        <td className="p-1">
                          <button
                            className="text-rose-300"
                            title="Remove day"
                            onClick={() =>
                              setPreview((p) => {
                                const n = { ...p! };
                                delete n[day];
                                return n;
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {unmatched.length > 0 && (
              <p className="mt-2 text-[10px] text-amber-200/90">
                Lines not auto-mapped (add manually if needed): {unmatched.join(" · ")}
              </p>
            )}
          </div>
        )}

        {/* calendar */}
        <div className="print-black card overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.03]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstOffset }).map((_, i) => (
              <div key={`pad-${i}`} className="min-h-[104px] border-b border-r border-white/5 bg-white/[0.015]" />
            ))}
            {Array.from({ length: total }).map((_, i) => {
              const dayKey = String(i + 1).padStart(2, "0");
              const entry = data[dayKey] ?? {};
              const filled = ROLE_KEYS.filter((k) => (entry[k] ?? "").trim());
              const isToday = dayKey === todayKey;
              return (
                <button
                  key={dayKey}
                  onClick={() => !locked && openEditor(dayKey)}
                  disabled={locked}
                  title={locked ? "View-only — sign in to edit" : `Edit duty for day ${i + 1}`}
                  className={`group relative min-h-[104px] border-b border-r border-white/5 p-1.5 text-left align-top transition hover:bg-cyan-400/[0.06] ${
                    isToday ? "bg-cyan-400/[0.08] ring-1 ring-inset ring-cyan-400/50" : ""
                  } ${locked ? "cursor-default" : "cursor-pointer"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-black tabular-nums ${isToday ? "text-cyan-300" : "text-slate-200"}`}>
                      {i + 1}
                    </span>
                    {!locked && (
                      <span className="opacity-0 transition group-hover:opacity-100">
                        <Pencil size={11} className="text-cyan-300" />
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {filled.slice(0, 4).map((k) => {
                      const Icon = ROLE_ICON[k];
                      return (
                        <div key={k} className="flex items-center gap-1 truncate" title={`${ROLE_META[k].label}: ${entry[k]}`}>
                          <Icon size={9} className={`shrink-0 ${ROLE_TINT[k].split(" ")[0]}`} />
                          <span className="truncate text-[9px] font-semibold text-slate-300">{entry[k]}</span>
                        </div>
                      );
                    })}
                    {filled.length > 4 && (
                      <div className="text-[9px] font-bold text-slate-500">+{filled.length - 4} more…</div>
                    )}
                    {filled.length === 0 && (
                      <div className="text-[9px] text-slate-600">{locked ? "—" : "+ add duty"}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {locked && (
          <p className="mt-3 text-center text-[11px] text-amber-200/90">
            🔒 View-only — sign your name in “Signed as” to edit or import the roster.
          </p>
        )}
      </div>

      {/* day editor modal */}
      {editDay && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-2xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-white">
                Duty for {monthLabel(month)} — day {Number(editDay)}
              </h2>
              <button className="btn-ghost !px-2 !py-1" onClick={() => setEditDay(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {ROLE_KEYS.map((k) => {
                const Icon = ROLE_ICON[k];
                return (
                  <label key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                    <span className={`mb-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${ROLE_TINT[k]}`}>
                      <Icon size={10} /> {ROLE_META[k].label}
                    </span>
                    <input
                      className="inp !py-1.5 text-xs font-semibold"
                      value={editFields[k] ?? ""}
                      placeholder="Type name…"
                      onChange={(e) => setEditFields((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex justify-between gap-2">
              <button className="btn-ghost text-rose-300" disabled={saving} onClick={clearDay}>
                <Trash2 size={13} /> Clear day
              </button>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => setEditDay(null)}>
                  Cancel
                </button>
                <button className="btn-primary" disabled={saving} onClick={saveDay}>
                  <Save size={13} /> {saving ? "Saving…" : "Save day"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
