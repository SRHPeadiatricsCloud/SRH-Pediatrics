"use client";

import { useEffect, useState } from "react";
import { DialWithOther, NumField, Section, Stepper } from "@/components/ui";
import { WeightInput } from "@/components/weight-input";
import { UnitBedDial } from "@/components/unit-ui";
import type { UnitKey } from "@/lib/units";
import { unitOf } from "@/lib/units";

const CONSULTANTS = [
  "Dr. Siddhartha",
  "Dr. Sujamariam",
  "Dr. Shobi Anandhi",
  "Dr. Devaprasath",
  "Dr. Indira Devi",
  "Dr. Krishna Sameera",
];

const INSURANCE_TYPES = ["Self-pay / cash", "Insurance", "Scheme (Govt / CMCHIS)", "Corporate / TPA"];
const SEX = ["Male", "Female", "Ambiguous"];
const BLOOD = ["O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−", "Unknown"];
const ISOLATION = ["none", "contact", "droplet", "protective", "airborne"];

export type AdmissionFields = {
  uhid: string;
  babyName: string;
  motherName: string;
  bed: string;
  unit: string;
  sex: string;
  gestWeeks: number;
  gestDays: number;
  birthWeight: number;
  currentWeight: number;
  birthHc?: number;
  birthLength?: number;
  deliveryMode: string;
  apgar1: number;
  apgar5: number;
  bloodGroup: string;
  motherBloodGroup?: string;
  inborn: boolean;
  isolation: string;
  consultant: string;
  insurance: string;
  insuranceName: string;
  acuity: string;
};

export function AdmissionEdit({
  baby,
  user,
  onSave,
}: {
  baby: AdmissionFields;
  user: string;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const unit = (baby.unit || "nicu") as UnitKey;
  const u = unitOf(unit);
  const isNicu = unit === "nicu";
  const isPostnatal = unit === "postnatal";
  const isNeo = isNicu || isPostnatal;

  const [open, setOpen] = useState(false);
  const [f, setF] = useState(baby);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setF(baby), [baby]);

  const set = <K extends keyof AdmissionFields>(k: K) => (v: AdmissionFields[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    await onSave({
      uhid: f.uhid,
      babyName: f.babyName,
      motherName: f.motherName,
      bed: f.bed,
      sex: f.sex,
      gestWeeks: f.gestWeeks,
      gestDays: f.gestDays,
      birthWeight: f.birthWeight,
      currentWeight: f.currentWeight,
      deliveryMode: f.deliveryMode,
      apgar1: f.apgar1,
      apgar5: f.apgar5,
      bloodGroup: f.bloodGroup,
      motherBloodGroup: f.motherBloodGroup ?? "Unknown",
      inborn: f.inborn,
      isolation: f.isolation,
      consultant: f.consultant,
      insurance: f.insurance,
      insuranceName: f.insuranceName,
      acuity: f.acuity,
      logEvent: {
        kind: "admission-edit",
        text: `Admission details updated by ${user || "staff"}`,
        author: user || "Team",
      },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Section
      title="Admission details"
      sub={`Editable anytime · ${u.short} record`}
      right={
        <div className="flex gap-1.5">
          <button className="btn-ghost !py-1 text-[11px]" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "✎ Edit admission"}
          </button>
          {open && (
            <button className="btn-primary !py-1 text-[11px]" disabled={saving} onClick={save}>
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
            </button>
          )}
        </div>
      }
    >
      {!open && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs md:grid-cols-3">
          <Row k="UHID" v={f.uhid} />
          <Row k="Name" v={f.babyName} />
          <Row k={isPostnatal ? "Mother" : isNicu ? "Mother" : "Guardian"} v={f.motherName || "—"} />
          <Row k="Bed" v={f.bed} />
          <Row k="Sex" v={f.sex} />
          <Row k="Blood group (baby)" v={f.bloodGroup} />
          {(baby.unit === "nicu" || baby.unit === "postnatal") && (
            <Row k="Mother's blood group" v={f.motherBloodGroup || "Unknown"} />
          )}
          {isNicu && <Row k="Gestation" v={`${f.gestWeeks}+${f.gestDays} wk`} />}
          {isNicu && <Row k="Birth weight" v={`${f.birthWeight} g`} />}
          {isNicu && <Row k="Apgar" v={`${f.apgar1} / ${f.apgar5}`} />}
          {isNicu && <Row k="Inborn" v={f.inborn ? "Inborn" : "Outborn"} />}
          {isPostnatal && <Row k="Baby weight" v={`${f.birthWeight / 1000} kg`} />}
          {!isNeo && <Row k="Age" v={`${f.gestWeeks} yr`} />}
          {!isNeo && <Row k="Weight" v={`${f.currentWeight / 1000} kg`} />}
          {f.birthHc ? <Row k="Head circumference" v={`${f.birthHc} cm`} /> : null}
          {f.birthLength ? <Row k="Length / height" v={`${f.birthLength} cm`} /> : null}
          <Row k="Consultant" v={f.consultant || "—"} />
          <Row k="Insurance" v={f.insurance ? `${f.insurance}${f.insuranceName ? ` · ${f.insuranceName}` : ""}` : "—"} />
          <Row k="Isolation" v={f.isolation} />
        </dl>
      )}

      {open && (
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <div className="lbl mb-1">UHID</div>
              <input className="inp" value={f.uhid} onChange={(e) => set("uhid")(e.target.value)} />
            </div>
            <div>
              <div className="lbl mb-1">Display name</div>
              <input className="inp" value={f.babyName} onChange={(e) => set("babyName")(e.target.value)} />
            </div>
            <div>
              <div className="lbl mb-1">{isNicu || isPostnatal ? "Mother's name" : "Guardian / parent name"}</div>
              <input className="inp" value={f.motherName} onChange={(e) => set("motherName")(e.target.value)} />
            </div>
            <div>
              <div className="lbl mb-1">Sex</div>
              <DialWithOther options={SEX} value={f.sex} onChange={(v: string) => v && set("sex")(v)} otherPlaceholder="Other…" />
            </div>
          </div>

          <div>
            <div className="lbl mb-1">Bed</div>
            <UnitBedDial unit={unit} value={f.bed} onChange={(v) => set("bed")(v)} />
          </div>

          {isNicu && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Stepper label="Gestation weeks" value={f.gestWeeks} onChange={(n) => set("gestWeeks")(n)} min={22} max={43} />
              <Stepper label="Gestation days" value={f.gestDays} onChange={(n) => set("gestDays")(n)} min={0} max={6} />
              <WeightInput label="Birth weight" valueGrams={f.birthWeight} onChangeGrams={(g) => set("birthWeight")(g)} neonatal />
              <WeightInput label="Current weight" valueGrams={f.currentWeight} onChangeGrams={(g) => set("currentWeight")(g)} neonatal />
              <Stepper label="Apgar 1 min" value={f.apgar1} onChange={(n) => set("apgar1")(n)} min={0} max={10} />
              <Stepper label="Apgar 5 min" value={f.apgar5} onChange={(n) => set("apgar5")(n)} min={0} max={10} />
            </div>
          )}

          {isPostnatal && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Stepper label="Baby gestation (wk)" value={f.gestWeeks} onChange={(n) => set("gestWeeks")(n)} min={28} max={43} />
              <WeightInput
                label="Baby weight"
                valueGrams={f.birthWeight}
                onChangeGrams={(g) => setF((p) => ({ ...p, birthWeight: g, currentWeight: g }))}
                neonatal
              />
              <Stepper label="Postnatal day" value={f.apgar1} onChange={(n) => set("apgar1")(n)} min={0} max={14} />
            </div>
          )}

          {!isNeo && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Stepper label="Age (years)" value={f.gestWeeks} onChange={(n) => set("gestWeeks")(n)} min={0} max={18} />
              <WeightInput
                label="Weight"
                valueGrams={f.currentWeight}
                onChangeGrams={(g) => setF((p) => ({ ...p, birthWeight: g, currentWeight: g }))}
                neonatal={false}
              />
            </div>
          )}

          <div className="lbl mb-1">{baby.unit === "postnatal" ? "Baby blood group" : "Blood group (baby)"}</div>
          <DialWithOther options={BLOOD} value={f.bloodGroup} onChange={(v: string) => v && set("bloodGroup")(v)} otherPlaceholder="Other blood group…" />
          {(baby.unit === "nicu" || baby.unit === "postnatal") && (
            <>
              <div className="lbl mt-3 mb-1">Mother&apos;s blood group</div>
              <DialWithOther
                options={BLOOD}
                value={f.motherBloodGroup ?? "Unknown"}
                onChange={(v: string) => v && set("motherBloodGroup")(v)}
                otherPlaceholder="Mother's blood group…"
              />
            </>
          )}

          {isNicu && (
            <>
              <div className="lbl mt-3 mb-1">Inborn / outborn</div>
              <DialWithOther
                options={["Inborn", "Outborn"]}
                value={f.inborn ? "Inborn" : "Outborn"}
                onChange={(v: string) => set("inborn")(v === "Inborn")}
              />
            </>
          )}

          <div className="lbl mt-3 mb-1">Isolation</div>
          <DialWithOther options={ISOLATION} value={f.isolation} onChange={(v: string) => v && set("isolation")(v)} tone="rose" otherPlaceholder="Other precaution…" />

          <div className="lbl mt-3 mb-1">Insurance / billing</div>
          <DialWithOther options={INSURANCE_TYPES} value={f.insurance} onChange={(v: string) => set("insurance")(v)} otherPlaceholder="Other payer…" />
          {f.insurance && f.insurance !== "Self-pay / cash" && (
            <input
              className="inp mt-1"
              value={f.insuranceName}
              onChange={(e) => set("insuranceName")(e.target.value)}
              placeholder="Insurer / scheme name"
            />
          )}

          <div className="lbl mt-3 mb-1">Primary Consultant</div>
          <DialWithOther options={CONSULTANTS} value={f.consultant} onChange={(v: string) => set("consultant")(v)} otherPlaceholder="Type consultant name…" />

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-ghost" onClick={() => { setF(baby); setOpen(false); }}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save admission details"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className="text-slate-100">{v}</dd>
    </div>
  );
}
