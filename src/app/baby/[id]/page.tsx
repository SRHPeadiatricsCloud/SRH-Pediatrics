"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeleteConfirmModal } from "@/components/backup-ui";
import {
  Chip,
  ChipGroup,
  NumField,
  Section,
  Stepper,
  TopBar,
  api,
  usePoll,
  useTempUnit,
  useUser,
} from "@/components/ui";
import {
  ACTION_PRESETS,
  ACUITY_META,
  CARE_BUNDLE,
  CONTINGENCY_PRESETS,
  DISCHARGE_CRITERIA,
  DRUGS,
  FEED_ROUTE,
  FEED_TYPE,
  ILLNESS,
  LAB_PANELS,
  LINES,
  PROBLEM_CATALOG,
  RESP_FIELDS,
  RESP_MODES,
  SHIFTS,
  SURFACTANT,
  SYSTEMS,
  type SystemKey,
} from "@/lib/catalog";
import { ActionChecklist } from "@/components/action-list";
import { AdmissionEdit } from "@/components/admission-edit";
import { DailyProgressTab } from "@/components/daily-progress";
import {
  CareTab,
  CourseTab,
  DrugsTab,
  FluidsTab,
  GrowthTab,
  HandoverTab,
  LabsTab,
  ProblemsTab,
  RespTab,
  TimelineTab,
  VitalsTab,
} from "@/components/baby-tabs";
import { ConsolidatedImpression } from "@/components/interpret-ui";
import type { Clinical } from "@/lib/clinical";
import {
  calcNutrition,
  correctedGA,
  dayOfLife,
  fmtBP,
  fmtTime,
  gainGPerKgDay,
  hoursOfLife,
  pctOfBirth,
  relTime,
  tempIn,
  tempOut,
  weightChangePct,
} from "@/lib/clinical";

type Detail = {
  baby: {
    id: number;
    uhid: string;
    babyName: string;
    motherName: string;
    bed: string;
    sex: string;
    dob: string;
    gestWeeks: number;
    gestDays: number;
    birthWeight: number;
    currentWeight: number;
    birthLength: number;
    birthHc: number;
    deliveryMode: string;
    apgar1: number;
    apgar5: number;
    bloodGroup: string;
    motherBloodGroup: string;
    inborn: boolean;
    acuity: string;
    status: string;
    isolation: string;
    consultant: string;
    clinical: Clinical;
    updatedAt: string;
    unit: string;
    subspecialty: string;
    insurance: string;
    insuranceName: string;
  };
  problems: {
    id: number;
    system: string;
    label: string;
    status: string;
    onsetAt: string;
    resolvedAt: string | null;
  }[];
  vitals: Record<string, number | string | null>[];
  events: { id: number; kind: string; text: string; author: string; at: string }[];
  tasks: {
    id: number;
    text: string;
    priority: string;
    done: boolean;
    doneAt: string | null;
    doneBy: string;
  }[];
  handovers: {
    id: number;
    shift: string;
    fromStaff: string;
    toStaff: string;
    illness: string;
    summary: string;
    actions: (string | Record<string, unknown>)[];
    contingency: string[];
    synthesis: string;
    acknowledgedBy: string;
    createdAt: string;
  }[];
};

const TABS = [
  "Overview",
  "Vitals",
  "Respiratory",
  "Fluids & feeds",
  "Growth & weight",
  "Daily progress",
  "Problems",
  "Drugs & lines",
  "Labs",
  "Care & discharge",
  "Course & discharge summary",
  "Handover",
  "Timeline",
] as const;

export default function BabyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, reload } = usePoll<Detail>(`/api/babies/${id}`, 4000);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const { name, role, signedIn } = useUser();
  const [consultant, setConsultant] = useState<string | undefined>(undefined);
  const [insurance, setInsurance] = useState<string | undefined>(undefined);
  const [insuranceName, setInsuranceName] = useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (consultant === undefined && data?.baby) setConsultant(data.baby.consultant);
    if (insurance === undefined && data?.baby) setInsurance(data.baby.insurance);
    if (insuranceName === undefined && data?.baby) setInsuranceName(data.baby.insuranceName);
  }, [consultant, insurance, insuranceName, data?.baby]);

  if (!data?.baby)
    return (
      <main className="min-h-screen">
        <TopBar />
        <div className="p-10 text-center text-slate-400">Loading baby record…</div>
      </main>
    );

  const b = data.baby;
  const meta = ACUITY_META[b.acuity] ?? ACUITY_META.stable;
  const patch = async (body: Record<string, unknown>) => {
    const result = await api(`/api/babies/${id}`, "PATCH", body);
    reload();
    return result;
  };

  return (
    <main className="min-h-screen pb-24">
      <TopBar live onRefresh={reload} />
      <div className="mx-auto max-w-[1500px] px-4 py-4">
        {/* header */}
        <div className="card mb-4 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black text-white">{b.babyName}</h1>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{b.bed}</span>
                {b.insurance && (
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      b.insurance === "Self-pay / cash"
                        ? "bg-white/10 text-slate-300"
                        : "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    }`}
                  >
                    {b.insurance === "Self-pay / cash" ? "💰 Cash" : `🛡️ ${b.insuranceName || b.insurance}`}
                  </span>
                )}
                {b.isolation !== "none" && (
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-200">
                    {b.isolation} isolation
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {b.unit === "nicu" ? (
                  <>
                    {b.uhid} · {b.sex} · {b.gestWeeks}+{b.gestDays} wk {b.inborn ? "inborn" : "outborn"} ·{" "}
                    {b.deliveryMode} · Apgar {b.apgar1}/{b.apgar5} · BG {b.bloodGroup} · Mother: {b.motherName}
                  </>
                ) : b.unit === "postnatal" ? (
                  <>
                    {b.uhid} · {b.sex} · BG {b.bloodGroup} · {b.deliveryMode} · Mother: {b.motherName}
                  </>
                ) : (
                  <>
                    {b.uhid} · {b.sex} · BG {b.bloodGroup} · {b.deliveryMode} · Guardian: {b.motherName}
                  </>
                )}
              </p>
              <p className="mt-1 text-[11px] text-cyan-300">
                {b.unit === "nicu" ? (
                  <>
                    DOL {dayOfLife(b.dob)} ({hoursOfLife(b.dob)} h) · CGA{" "}
                    {correctedGA(b.dob, b.gestWeeks, b.gestDays)} · BW {b.birthWeight} g → {b.currentWeight} g (
                    {weightChangePct(b.birthWeight, b.currentWeight)}%)
                  </>
                ) : b.unit === "postnatal" ? (
                  <>Postnatal day {b.apgar1} · Baby {b.currentWeight / 1000} kg</>
                ) : (
                  <>Age {b.gestWeeks} yr · Weight {b.currentWeight / 1000} kg</>
                )}{" "}
                · Consultant {b.consultant || "—"}
              </p>
            </div>
            <div className="flex w-full flex-col items-end gap-2 sm:w-72">
              <div className="w-full">
                <div className="lbl mb-1">Primary Consultant</div>
                <div className="flex gap-1.5">
                  <input
                    className="inp text-xs"
                    placeholder="Dr. …"
                    value={consultant}
                    onChange={(e) => setConsultant(e.target.value)}
                  />
                  <button
                    className="btn-ghost text-xs"
                    onClick={() =>
                      patch({
                        consultant,
                        logEvent: { kind: "consultant", text: `Primary consultant: ${consultant || "—"}`, author: name },
                      })
                    }
                  >
                    Save
                  </button>
                </div>
              </div>
              <div
                className={`flex w-full items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-semibold ${
                  signedIn
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : "border-amber-400/40 bg-amber-400/10 text-amber-200"
                }`}
                title={signedIn ? "Entries are signed with your verified name" : "Sign in (top-right) to sign entries"}
              >
                <span aria-hidden>{signedIn ? "✍️" : "🔒"}</span>
                <span className="truncate">{signedIn ? `${name}${role ? ` · ${role}` : ""}` : "View-only — sign in to edit"}</span>
              </div>
              <div className="w-full">
                <div className="lbl mb-1">Insurance</div>
                <div className="flex gap-1.5">
                  <div className="flex flex-1 gap-1">
                    {["Self-pay", "Insurance", "Scheme", "Corporate"].map((o) => {
                      const active = insurance === o;
                      return (
                        <button
                          key={o}
                          onClick={() => {
                            setInsurance(o);
                            patch({ insurance: o, insuranceName: o === "Self-pay" ? "" : insuranceName ?? "", logEvent: { kind: "insurance", text: `Insurance set to ${o}`, author: name } });
                          }}
                          className={`chip !px-2 !py-1 text-[10px] ${active ? "chip-on" : "chip-off"}`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {insurance && insurance !== "Self-pay" && (
                  <input
                    className="inp mt-1 w-full text-xs"
                    placeholder="Insurer / scheme name"
                    value={insuranceName ?? ""}
                    onChange={(e) => setInsuranceName(e.target.value)}
                    onBlur={(e) => patch({ insuranceName: e.target.value, logEvent: { kind: "insurance", text: `Insurance details updated`, author: name } })}
                  />
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <ChipGroup
                  options={ILLNESS}
                  value={b.acuity}
                  onChange={(v: string) =>
                    v && patch({ acuity: v, logEvent: { text: `Acuity set to ${v}`, author: name } })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* tabs */}
        <div className="no-print mb-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`chip ${tab === t ? "chip-on" : "chip-off"}`}
            >
              {t}
            </button>
          ))}
          <Link href="/handover" className="btn-ghost ml-auto text-xs">
            Print unit sheet
          </Link>
          <button className="btn-ghost text-xs text-rose-300" onClick={() => setConfirmDelete(true)}>
            🗑 Delete card
          </button>
        </div>

        {confirmDelete && (
          <DeleteConfirmModal
            baby={{ id: b.id, babyName: b.babyName, uhid: b.uhid, bed: b.bed, motherName: b.motherName }}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              setConfirmDelete(false);
              await api(`/api/babies/${id}`, "DELETE");
              window.dispatchEvent(new CustomEvent("neo:deleted", { detail: { id: b.id, name: b.babyName } }));
              router.push("/");
            }}
          />
        )}

        {tab === "Overview" && <Overview d={data} patch={patch} user={name} />}
        {tab === "Vitals" && <VitalsTab d={data} id={id} reload={reload} user={name} patch={patch} />}
        {tab === "Respiratory" && <RespTab d={data} patch={patch} user={name} />}
        {tab === "Fluids & feeds" && <FluidsTab d={data} patch={patch} user={name} role={role} />}
        {tab === "Growth & weight" && (
          <GrowthTab d={data} patch={patch} user={name} reload={reload} />
        )}
        {tab === "Daily progress" && <DailyProgressTab baby={b} patch={patch} user={name} />}
        {tab === "Problems" && <ProblemsTab d={data} id={id} reload={reload} user={name} />}
        {tab === "Drugs & lines" && <DrugsTab d={data} patch={patch} />}
        {tab === "Labs" && <LabsTab d={data} patch={patch} />}
        {tab === "Care & discharge" && <CareTab d={data} patch={patch} />}
        {tab === "Course & discharge summary" && (
          <CourseTab d={data} id={id} reload={reload} user={name} patch={patch} />
        )}
        {tab === "Handover" && <HandoverTab d={data} id={id} reload={reload} user={name} />}
        {tab === "Timeline" && <TimelineTab d={data} id={id} reload={reload} user={name} />}
      </div>
    </main>
  );
}

/* ------------------------------- OVERVIEW ------------------------------- */
function Overview({
  d,
  patch,
  user,
}: {
  d: Detail;
  patch: (body: Record<string, unknown>) => Promise<void>;
  user: string;
}) {
  const c = d.baby.clinical ?? {};
  const v = d.vitals[0] ?? {};
  const { unit } = useTempUnit();
  const b = d.baby;
  const babyLite = {
    unit: b.unit,
    dob: b.dob,
    gestWeeks: b.gestWeeks,
    gestDays: b.gestDays,
    birthWeight: b.birthWeight,
    currentWeight: b.currentWeight,
  };
  const growthSeries = [...(c.growth ?? [])].sort((x, y) => +new Date(x.at) - +new Date(y.at));
  const growthVel =
    growthSeries.length >= 2
      ? (() => {
          const a = growthSeries[growthSeries.length - 2];
          const z = growthSeries[growthSeries.length - 1];
          const days = Math.max(0.5, (+new Date(z.at) - +new Date(a.at)) / 86400000);
          return gainGPerKgDay(a.weight, z.weight, days);
        })()
      : null;
  const minCumPct = growthSeries.length
    ? Math.min(...growthSeries.map((g) => ((g.weight - b.birthWeight) / b.birthWeight) * 100))
    : 0;
  const regained = growthSeries.some((g) => g.weight >= b.birthWeight) || b.currentWeight >= b.birthWeight;
  const pao2Num = (() => {
    const raw = (c.labs ?? {})["pO2"] ?? (c.labs ?? {})["PaO2"];
    const n = raw == null ? null : Number(String(raw).replace(/[^0-9.]/g, ""));
    return n != null && Number.isFinite(n) ? n : null;
  })();
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="lg:col-span-3">
        <AdmissionEdit
          baby={{
            uhid: b.uhid,
            babyName: b.babyName,
            motherName: b.motherName,
            bed: b.bed,
            unit: b.unit,
            sex: b.sex,
            gestWeeks: b.gestWeeks,
            gestDays: b.gestDays,
            birthWeight: b.birthWeight,
            currentWeight: b.currentWeight,
            deliveryMode: b.deliveryMode,
            apgar1: b.apgar1,
            apgar5: b.apgar5,
            bloodGroup: b.bloodGroup,
            motherBloodGroup: b.motherBloodGroup,
            inborn: b.inborn,
            isolation: b.isolation,
            consultant: b.consultant,
            insurance: b.insurance,
            insuranceName: b.insuranceName,
            acuity: b.acuity,
            birthHc: (c.growth ?? []).filter((g) => g.hc).at(-1)?.hc,
            birthLength: (c.growth ?? []).filter((g) => g.length).at(-1)?.length,
          }}
          user={user}
          onSave={patch}
        />
      </div>
      <div className="lg:col-span-3">
        <ConsolidatedImpression
          baby={babyLite}
          vitals={v}
          labs={c.labs ?? null}
          growth={{ velocity: growthVel, lossPct: minCumPct, regained }}
          resp={{
            map: (v.map as number | null) ?? null,
            fio2: c.resp?.settings?.fio2 ?? null,
            pao2: pao2Num,
            silverman: c.resp?.silverman ?? null,
          }}
        />
      </div>
      <Section title="Latest observations" sub={`Recorded ${relTime(v.recordedAt as string)}`}>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["HR", v.hr, "/min"],
            ["RR", v.rr, "/min"],
            ["SpO₂", v.spo2, "%"],
            ["Temp", tempOut(v.temp as number | null, unit), `°${unit}`],
            ["BP sbp/dbp (map)", fmtBP(v.sbp as number | null, v.dbp as number | null, v.map as number | null), ""],
            ["CRT", v.crt, "s"],
            ["RBS", v.rbs, "mg/dL"],
            ["FiO₂", v.fio2, "%"],
            ["UO", v.urineMlKgHr, "ml/kg/h"],
          ].map(([l, val, u]) => (
            <div key={String(l)} className="rounded-xl border border-white/10 bg-slate-900/50 p-2">
              <div className="lbl">{String(l)}</div>
              <div className="text-lg font-bold tabular-nums text-white">{val ?? "—"}</div>
              <div className="text-[9px] text-slate-500">{String(u)}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Support & nutrition">
        <dl className="space-y-1.5 text-xs text-slate-300">
          <Row k="Consultant" v={d.baby.consultant || "not assigned"} />
          {c.triage && (
            <Row
              k="Admission triage"
              v={`${c.triage.label} · ${c.triage.scale} ${c.triage.score} · ${c.triage.band.toUpperCase()}`}
            />
          )}
          <Row
            k="Growth"
            v={`${d.baby.birthWeight} g → ${d.baby.currentWeight} g (${weightChangePct(d.baby.birthWeight, d.baby.currentWeight)}%) · velocity ${
              (() => {
                const g = [...(c.growth ?? [])].sort((a, b2) => +new Date(a.at) - +new Date(b2.at));
                if (g.length < 2) return "—";
                const days = Math.max(1, (+new Date(g.at(-1)!.at) - +new Date(g.at(-2)!.at)) / 86400000);
                return `${gainGPerKgDay(g.at(-2)!.weight, g.at(-1)!.weight, days) ?? "—"} g/kg/day`;
              })()
            }`}
          />
          <Row k="Respiratory" v={`${c.resp?.mode ?? "—"} · FiO₂ ${c.resp?.settings?.fio2 ?? 21}%`} />
          <Row
            k="Settings"
            v={Object.entries(c.resp?.settings ?? {})
              .map(([k2, val]) => `${k2.toUpperCase()} ${val}`)
              .join(" · ") || "—"}
          />
          <Row k="Surfactant" v={c.resp?.surfactant ?? "—"} />
          <Row k="ETT" v={c.resp?.ettSize ? `${c.resp.ettSize} mm at ${c.resp.ettDepth ?? "?"}` : "—"} />
          <Row k="Total fluids" v={`${c.fluids?.totalMlKgDay ?? "—"} ml/kg/day (GIR ${c.fluids?.gir ?? "—"})`} />
          <Row k="Feeds" v={`${c.fluids?.feedType ?? "—"} · ${c.fluids?.feedVol ?? "—"} ml ${c.fluids?.feedFreq ?? ""} via ${c.fluids?.feedRoute ?? "—"}`} />
          <Row k="TPN" v={c.fluids?.tpn ? `AA ${c.fluids.aminoAcid ?? "—"} g/kg · Lipid ${c.fluids.lipid ?? "—"} g/kg` : "No"} />
          <Row
            k="Energy (auto)"
            v={`${calcNutrition(c).totalKcal} kcal/kg/day · protein ${calcNutrition(c).totalProtein} g/kg/day`}
          />
          <Row k="Lines" v={(c.lines ?? []).map((l) => `${l.name} D${l.day}`).join(", ") || "None"} />
          <Row k="Drugs" v={(c.drugs ?? []).map((x) => `${x.name}${x.ofDays ? ` D${x.day}/${x.ofDays}` : x.dose ? ` (${x.dose})` : ""}`).join(", ") || "None"} />
        </dl>
      </Section>

      <Section title="Active problem list" sub={`${d.problems.filter((p) => p.status !== "resolved").length} active`}>
        <div className="flex flex-wrap gap-1">
          {d.problems
            .filter((p) => p.status !== "resolved")
            .map((p) => (
              <span
                key={p.id}
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
                  p.status === "watch"
                    ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                    : "border-rose-400/30 bg-rose-400/10 text-rose-200"
                }`}
              >
                {p.label}
              </span>
            ))}
          {d.problems.length === 0 && <span className="text-xs text-slate-400">None added</span>}
        </div>
        <div className="lbl mt-4 mb-1">Plan</div>
        <p className="text-xs text-slate-300">{d.baby.clinical?.plan || "No plan documented."}</p>
        <div className="lbl mt-4 mb-1">Actions</div>
        <ActionChecklist
          tasks={d.tasks}
          onToggle={async (taskId, done) => {
            await api(`/api/babies/${d.baby.id}/tasks`, "PATCH", { id: taskId, done, doneBy: user });
          }}
          onSchedule={async (taskId, iso) => {
            await api(`/api/babies/${d.baby.id}/tasks`, "PATCH", { id: taskId, scheduledAt: iso });
          }}
        />
      </Section>

      <Section title="Recent handovers" sub="I-PASS records">
        <div className="space-y-2">
          {d.handovers.slice(0, 4).map((h) => (
            <div key={h.id} className="rounded-xl border border-white/10 bg-slate-900/40 p-2 text-xs">
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>
                  {h.shift} · {h.fromStaff} → {h.toStaff || "—"}
                </span>
                <span>{fmtTime(h.createdAt)}</span>
              </div>
              <div className="lbl mt-1">Patient summary</div>
              <p className="text-slate-200">{h.summary}</p>
              {h.actions?.length > 0 && (
                <div className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-1.5">
                  <div className="lbl mb-0.5 text-emerald-300">Action list</div>
                  <ol className="space-y-0.5 text-[11px] text-slate-200">
                    {h.actions.map((raw, index) => {
                      const a = typeof raw === "string" ? { text: raw } : (raw as Record<string, unknown>);
                      const text = String(a.text ?? "").trim();
                      if (!text) return null;
                      const sched = a.scheduledAt ? String(a.scheduledAt) : null;
                      const task = d.tasks.find((t) => t.text.trim().toLowerCase() === text.toLowerCase());
                      return (
                        <li key={`${text}-${index}`} className="flex flex-wrap items-center gap-1.5">
                          <span className="font-black text-emerald-300">{index + 1}.</span>
                          <span className={task?.done ? "text-slate-400 line-through" : ""}>{text}</span>
                          {sched && (
                            <span className="rounded border border-cyan-400/40 bg-cyan-400/10 px-1 py-px text-[9px] font-bold text-cyan-200">
                              due {fmtTime(sched)}
                            </span>
                          )}
                          {(() => {
                            const prio = String(a.priority ?? "");
                            if (!prio || prio === "today") return null;
                            return (
                              <span className="rounded border border-amber-400/40 bg-amber-500/15 px-1 py-px text-[9px] font-bold text-amber-200">
                                {prio.toUpperCase()}
                              </span>
                            );
                          })()}
                          {task?.done && task.doneAt && (
                            <span className="text-[9px] text-emerald-300">
                              ✓ {fmtTime(task.doneAt)}
                              {task.doneBy ? ` · ${task.doneBy}` : ""}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          ))}
          {d.handovers.length === 0 && <p className="text-xs text-slate-400">No handover yet.</p>}
        </div>
      </Section>

      <Section title="Vitals trend (last readings)">
        <Trend rows={d.vitals} />
      </Section>

      <Section title="Timeline (latest)">
        <ul className="space-y-1.5 text-xs">
          {d.events.slice(0, 10).map((e) => (
            <li key={e.id} className="flex gap-2">
              <span className="shrink-0 text-[10px] text-slate-500">{fmtTime(e.at)}</span>
              <span className="text-slate-200">{e.text}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">{k}</dt>
      <dd className="flex-1 text-slate-200">{v}</dd>
    </div>
  );
}

function Trend({ rows }: { rows: Record<string, number | string | null>[] }) {
  const series = rows.slice(0, 12).reverse();
  const keys: [string, string][] = [
    ["hr", "HR"],
    ["spo2", "SpO₂"],
    ["rr", "RR"],
  ];
  return (
    <div className="space-y-3">
      {keys.map(([k, label]) => {
        const vals = series.map((r) => Number(r[k] ?? 0));
        const max = Math.max(...vals, 1);
        return (
          <div key={k}>
            <div className="lbl mb-1">
              {label} · latest {vals[vals.length - 1] || "—"}
            </div>
            <div className="flex h-10 items-end gap-1">
              {vals.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-cyan-500/30 to-cyan-300/80"
                  style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
                  title={String(v)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

