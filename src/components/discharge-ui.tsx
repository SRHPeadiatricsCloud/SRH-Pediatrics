"use client";

/**
 * Marking a baby as discharged.
 *
 * This writes the existing `babies.status` column (discharged | transferred |
 * death) plus a signed `clinical.dischargeRecord`, so no migration is needed
 * and the baby drops off the live board the same way the schema already
 * intends. A local backup is captured by `api()` before the write.
 */
import { useState } from "react";
import { api, getUserName } from "@/components/ui";
import { buildDischargeRecord, OUTCOME_LABEL } from "@/lib/discharge";
import { DISCHARGE_OUTCOMES, type DischargeOutcome, type DischargeRecord } from "@/lib/clinical";

export type DischargeableBaby = {
  id: number;
  babyName: string;
  uhid: string;
  bed: string;
  motherName?: string;
  unit?: string;
  currentWeight?: number;
};

/** `datetime-local` wants a naive local string — never toISOString(), which is UTC. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const OUTCOME_HINT: Record<DischargeOutcome, string> = {
  discharged: "Going home. The record is filed under the discharge archive.",
  transferred: "Moved to another unit or hospital. Still archived and exportable.",
  death: "Recorded as a death. Archived with the same retention rules.",
};

export function DischargeModal({
  baby,
  onCancel,
  onDone,
}: {
  baby: DischargeableBaby;
  onCancel: () => void;
  onDone: (rec: DischargeRecord) => void;
}) {
  const [outcome, setOutcome] = useState<DischargeOutcome>("discharged");
  const [when, setWhen] = useState(() => toLocalInputValue(new Date()));
  const [summary, setSummary] = useState("");
  const [signedBy, setSignedBy] = useState(() => getUserName() || "");
  const [weight, setWeight] = useState(() => String(baby.currentWeight ?? ""));
  const [bed, setBed] = useState(baby.bed ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ok = signedBy.trim().length > 0 && when.length > 0;

  const save = async () => {
    if (!ok || saving) return;
    setSaving(true);
    setError("");
    const at = new Date(when);
    if (Number.isNaN(at.getTime())) {
      setError("That date could not be read.");
      setSaving(false);
      return;
    }
    const rec = buildDischargeRecord({
      outcome,
      summary,
      signedBy,
      at,
      weightAtDischarge: weight.trim() ? Number(weight) : undefined,
      bedAtDischarge: bed.trim(),
      unitAtDischarge: baby.unit,
    });
    const res = await api(`/api/babies/${baby.id}`, "PATCH", {
      status: rec.outcome,
      clinical: { dischargeRecord: rec },
      logEvent: {
        kind: "discharge",
        text: `${OUTCOME_LABEL[rec.outcome]} · signed by ${rec.signedBy}${rec.summary ? ` · ${rec.summary}` : ""}`,
        author: rec.signedBy,
      },
    });
    setSaving(false);
    if (res && (res as { error?: string }).error) {
      setError(String((res as { error?: string }).error));
      return;
    }
    onDone(rec);
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="card max-h-[92vh] w-full max-w-lg overflow-y-auto p-5">
        <h2 className="text-base font-black text-cyan-200">Mark as discharged</h2>
        <p className="mt-1 text-xs text-slate-300">
          <strong className="text-white">{baby.babyName}</strong> · {baby.uhid} · {baby.bed}
          {baby.motherName ? ` · Mother: ${baby.motherName}` : ""}
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          Moves to the discharge register; still exportable as a PDF for MRD.
        </p>

        <label className="lbl mt-4 mb-1 block">Outcome</label>
        <div className="flex flex-wrap gap-1.5">
          {DISCHARGE_OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={`chip ${outcome === o ? "chip-on" : "chip-off"}`}
            >
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">{OUTCOME_HINT[outcome]}</p>

        <label className="lbl mt-4 mb-1 block">Date &amp; time of discharge</label>
        <input className="inp" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="lbl mb-1 block">Weight at discharge (g)</label>
            <input
              className="inp"
              inputMode="numeric"
              value={weight}
              onChange={(e) => setWeight(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <div>
            <label className="lbl mb-1 block">Bed</label>
            <input className="inp" value={bed} onChange={(e) => setBed(e.target.value)} />
          </div>
        </div>

        <label className="lbl mt-3 mb-1 block">Discharge summary / condition at discharge</label>
        <textarea
          className="inp min-h-[84px]"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Stable, afebrile, feeding well orally. Review in OPD on …"
        />

        <label className="lbl mt-3 mb-1 block">Signed by</label>
        <input className="inp" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Your name" />

        {error && <p className="mt-3 text-[11px] text-rose-300">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!ok || saving}>
            {saving ? "Saving…" : "Confirm discharge"}
          </button>
        </div>
      </div>
    </div>
  );
}
