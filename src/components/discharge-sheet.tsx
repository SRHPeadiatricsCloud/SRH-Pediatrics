"use client";

/**
 * The printable discharge record — the document that goes to MRD.
 *
 * Deliberately a separate, print-first layout rather than a reuse of the baby
 * sheet: the baby page interleaves its tab controls with the clinical content,
 * and this record needs a signature block, an explicit outcome and a stable
 * order that never depends on which tab was open.
 */
import { DISCHARGE_CRITERIA } from "@/lib/catalog";
import { calcNutrition, correctedGA, dayOfLife, weightChangePct } from "@/lib/clinical";
import type { DischargeRecord } from "@/lib/clinical";
import type { Detail } from "@/lib/types";
import { OUTCOME_LABEL, lengthOfStayDays } from "@/lib/discharge";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "19 Sep 2026, 14:32" in local time — never UTC, the unit runs on IST. */
function fmtStamp(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 border-b border-slate-400/20 py-1 text-[11px] last:border-0">
      <dt className="w-40 shrink-0 font-semibold text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium text-white">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card mb-3 p-3">
      <h3 className="mb-2 border-b border-cyan-400/30 pb-1 text-[12px] font-black tracking-wide text-cyan-200">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DischargeSheet({
  d,
  record,
  index,
  total,
}: {
  d: Detail;
  /** Falls back to the record stored on the chart. */
  record?: DischargeRecord | null;
  /** Position in a batch, for the "3 of 12" print header. */
  index?: number;
  total?: number;
}) {
  const b = d.baby;
  const c = b.clinical ?? {};
  const rec = record ?? c.dischargeRecord ?? null;
  // Sized to the age the baby reached, so the sheet quotes the right targets.
  const nutrition = calcNutrition(c, b.currentWeight, { dol: dayOfLife(b.dob) });
  const los = lengthOfStayDays({
    id: b.id,
    babyName: b.babyName,
    uhid: b.uhid,
    status: b.status,
    dob: b.dob,
    updatedAt: b.updatedAt,
    clinical: c,
  });
  const wtChange = weightChangePct(b.birthWeight, b.currentWeight);
  const criteria = c.discharge ?? [];
  const drugs = c.drugs ?? [];
  const labs = c.labs ?? {};
  const labEntries = Object.entries(labs).filter(([, v]) => v !== "" && v != null);
  const handovers = (d.handovers ?? []).slice(0, 4);
  const events = (d.events ?? []).slice(0, 24);
  const problems = d.problems ?? [];
  const outcomeLabel = rec ? (OUTCOME_LABEL[rec.outcome] ?? rec.outcome) : "Not recorded";

  return (
    <article className="print-sheet mx-auto max-w-[900px]">
      {/* masthead */}
      <header className="mb-3 border-b-2 border-cyan-400/40 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-black text-white">{b.babyName}</h1>
            <p className="text-[11px] text-slate-400">
              UHID {b.uhid} · {b.sex} · {b.unit?.toUpperCase()}
              {b.subspecialty ? ` / ${b.subspecialty.toUpperCase()}` : ""}
              {b.bed ? ` · Bed ${b.bed}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-black tracking-wide text-cyan-200">DISCHARGE RECORD</p>
            <p className="text-[10px] text-slate-400">
              {fmtStamp(rec?.at ?? b.updatedAt)}
              {typeof index === "number" && typeof total === "number" && total > 1
                ? ` · Record ${index + 1} of ${total}`
                : ""}
            </p>
          </div>
        </div>
      </header>

      <Block title="Discharge">
        <dl>
          <Row label="Outcome" value={outcomeLabel} />
          <Row label="Date & time" value={fmtStamp(rec?.at)} />
          <Row label="Length of stay" value={los === null ? "—" : `${los} day${los === 1 ? "" : "s"}`} />
          <Row label="Weight at discharge" value={rec?.weightAtDischarge ? `${rec.weightAtDischarge} g` : `${b.currentWeight} g`} />
          <Row label="Bed at discharge" value={rec?.bedAtDischarge || b.bed || "—"} />
          <Row label="Signed by" value={rec?.signedBy || "—"} />
          <Row
            label="Discharge summary"
            value={rec?.summary ? <span className="whitespace-pre-line">{rec.summary}</span> : "—"}
          />
        </dl>
      </Block>

      <Block title="Identification & birth details">
        <dl>
          <Row label="Mother" value={b.motherName || "—"} />
          <Row label="Date of birth" value={`${fmtDate(b.dob)} · ${b.gestWeeks}+${b.gestDays} weeks`} />
          <Row label="Corrected GA at discharge" value={correctedGA(b.dob, b.gestWeeks, b.gestDays)} />
          <Row label="Delivery" value={`${b.deliveryMode} · ${b.inborn ? "Inborn" : "Outborn"}`} />
          <Row label="Apgar" value={`${b.apgar1} (1 min) / ${b.apgar5} (5 min)`} />
          <Row label="Birth weight" value={`${b.birthWeight} g`} />
          <Row
            label="Weight at discharge"
            value={`${b.currentWeight} g (${wtChange >= 0 ? "+" : ""}${wtChange.toFixed(1)}% of birth)`}
          />
          {(b.birthLength > 0 || b.birthHc > 0) && (
            <Row
              label="Birth length / HC"
              value={`${b.birthLength ? `${b.birthLength} cm` : "—"} / ${b.birthHc ? `${b.birthHc} cm` : "—"}`}
            />
          )}
          <Row label="Blood group" value={`Baby ${b.bloodGroup} · Mother ${b.motherBloodGroup}`} />
          <Row label="Consultant" value={b.consultant || "—"} />
          <Row
            label="Payment category"
            value={b.insurance ? `${b.insurance}${b.insuranceName ? ` — ${b.insuranceName}` : ""}` : "—"}
          />
        </dl>
      </Block>

      {criteria.length > 0 && (
        <Block title="Discharge readiness criteria met">
          <ul className="grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2">
            {DISCHARGE_CRITERIA.map((criterion) => {
              const met = criteria.includes(criterion);
              return (
                <li key={criterion} className="flex items-start gap-1.5">
                  <span className={met ? "font-black text-emerald-300" : "text-slate-500"}>{met ? "✓" : "·"}</span>
                  <span className={met ? "text-white" : "text-slate-500 line-through"}>{criterion}</span>
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      <Block title={`Problem list — ${problems.length} recorded`}>
        {problems.length === 0 ? (
          <p className="text-[11px] text-slate-400">None recorded.</p>
        ) : (
          <ul className="space-y-1">
            {problems.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-2 text-[11px]">
                <span className="rounded border border-cyan-400/30 px-1.5 py-0.5 text-[9px] font-bold text-cyan-200">
                  {p.system}
                </span>
                <span className="font-semibold text-white">{p.label}</span>
                <span
                  className={`text-[10px] font-bold ${
                    p.status === "resolved" ? "text-emerald-300" : p.status === "watch" ? "text-amber-300" : "text-rose-300"
                  }`}
                >
                  {p.status}
                </span>
                {p.detail && <span className="text-slate-400">— {p.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Nutrition at discharge">
        <dl>
          <Row
            label="Total intake"
            value={`${nutrition.totalKcal.toFixed(1)} kcal/kg/day · ${nutrition.totalProtein.toFixed(2)} g protein/kg/day`}
          />
          <Row
            label="Enteral"
            value={`${nutrition.enteralMl} ml/kg/day${c.fluids?.feedType ? ` · ${c.fluids.feedType}` : ""}${
              c.fluids?.feedRoute ? ` · ${c.fluids.feedRoute}` : ""
            }`}
          />
          <Row label="IV fluids" value={`${nutrition.ivMl} ml/kg/day`} />
          <Row label="Total fluids" value={`${nutrition.totalFluids} ml/kg/day`} />
          {nutrition.girSource !== "none" && (
            <Row label="GIR" value={`${nutrition.gir.toFixed(1)} mg/kg/min`} />
          )}
          {nutrition.aaG > 0 && <Row label="Amino acids" value={`${nutrition.aaG} g/kg/day`} />}
          {nutrition.lipidG > 0 && <Row label="Lipid" value={`${nutrition.lipidG} g/kg/day`} />}
          {nutrition.fortified && (
            <Row
              label="Fortification"
              value={`${c.fluids?.fortificationName ?? "Fortifier"} · ${c.fluids?.fortificationAmount ?? 0} sachet(s)/${
                c.fluids?.fortificationFeedVolumeMl ?? 100
              } ml`}
            />
          )}
        </dl>
      </Block>

      {drugs.length > 0 && (
        <Block title="Medications">
          <ul className="space-y-1">
            {drugs.map((drug, i) => (
              <li key={`${drug.name}-${i}`} className="flex flex-wrap gap-2 text-[11px]">
                <span className="font-semibold text-white">{drug.name}</span>
                {drug.dose && <span className="text-slate-300">{drug.dose}</span>}
                {drug.day != null && (
                  <span className="text-slate-400">
                    day {drug.day}
                    {drug.ofDays ? `/${drug.ofDays}` : ""}
                  </span>
                )}
                {drug.source && <span className="text-slate-500">({drug.source})</span>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {labEntries.length > 0 && (
        <Block title="Investigations on record">
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {labEntries.map(([k, v]) => (
              <Row key={k} label={k} value={String(v)} />
            ))}
          </dl>
        </Block>
      )}

      {handovers.length > 0 && (
        <Block title="Recent handover summaries">
          <ul className="space-y-1.5">
            {handovers.map((h) => (
              <li key={h.id} className="text-[11px]">
                <span className="font-bold text-white">
                  {h.shift} · {fmtStamp(h.createdAt)}
                </span>
                <span className="text-slate-400">
                  {" "}
                  · {h.fromStaff} → {h.toStaff}
                </span>
                {h.summary && <p className="whitespace-pre-line text-slate-300">{h.summary}</p>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {events.length > 0 && (
        <Block title="Course timeline">
          <ul className="space-y-0.5">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2 text-[10px]">
                <span className="w-28 shrink-0 tabular-nums text-slate-500">{fmtStamp(e.at)}</span>
                <span className="min-w-0 flex-1 text-slate-300">{e.text}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* signature block */}
      <footer className="mt-4 grid grid-cols-3 gap-6 border-t-2 border-slate-400/40 pt-8 text-[10px]">
        {["Prepared by", "Consultant", "Received by (MRD)"].map((role) => (
          <div key={role}>
            <div className="mb-1 h-8 border-b border-slate-400/60" />
            <p className="font-bold text-slate-400">{role}</p>
            <p className="text-slate-500">Date: ______________</p>
          </div>
        ))}
      </footer>
    </article>
  );
}
