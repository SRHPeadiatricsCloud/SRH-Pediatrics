"use client";

import { Check, ChevronRight, Info, Pencil, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
  calculatePediatricDose,
  getPediatricDrug,
  PEDIATRIC_DRUG_GROUPS,
  PEDIATRIC_DRUGS,
  type PediatricDrug,
  type PediatricDrugGroup,
} from "@/lib/pediatric-dosing";

type DoseStep = 1 | 2 | 3;

function NumericField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  min: number;
  max: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="dose-field">
      <span>{label}</span>
      <div>
        <input type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter" />
        <b>{unit}</b>
      </div>
      <small>{hint ?? `${min}–${max}`}</small>
    </label>
  );
}

function PediatricReferenceTable({ drug }: { drug: PediatricDrug }) {
  return (
    <div className="dose-reference-table-wrap">
      <table className="dose-reference-table">
        <caption>{drug.name} · paediatric chart reference</caption>
        <thead><tr><th>Condition / age</th><th>Dose and schedule</th></tr></thead>
        <tbody>{drug.regimens.map((row) => <tr key={`${row.condition}-${row.regimen}`}><th>{row.condition}</th><td>{row.regimen}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function StepButton({ step, activeStep, complete, disabled, title, subtitle, onClick }: { step: DoseStep; activeStep: DoseStep; complete: boolean; disabled?: boolean; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" className={`dose-progress-step ${activeStep === step ? "active" : ""} ${complete ? "complete" : ""}`} disabled={disabled} onClick={onClick}>
      <b>{complete ? <Check size={14} /> : step}</b>
      <span><strong>{title}</strong><small>{subtitle}</small></span>
    </button>
  );
}

export function PediatricDrugDoses() {
  const [step, setStep] = useState<DoseStep>(1);
  const [group, setGroup] = useState<PediatricDrugGroup>("Antimicrobials");
  const [drugId, setDrugId] = useState("acyclovir");
  const [drugQuery, setDrugQuery] = useState("");
  const [regimenIndex, setRegimenIndex] = useState(0);
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [strength, setStrength] = useState("");

  const drug = getPediatricDrug(drugId);
  const visibleDrugs = PEDIATRIC_DRUGS.filter((item) => item.group === group);
  const filteredDrugs = visibleDrugs.filter((item) => item.name.toLowerCase().includes(drugQuery.trim().toLowerCase()));
  const weightKg = Number(weight);
  const ageYears = Number(age);
  const heightCm = Number(height);
  const strengthValue = Number(strength);
  const canCalculate = weightKg > 0 && age !== "";
  const result = useMemo(
    () => canCalculate ? calculatePediatricDose(drug, { weightKg, ageYears, heightCm: heightCm > 0 ? heightCm : undefined, strength: strengthValue > 0 ? strengthValue : undefined }, regimenIndex) : null,
    [ageYears, canCalculate, drug, heightCm, regimenIndex, strengthValue, weightKg],
  );

  const chooseDrug = (id: string) => {
    const next = getPediatricDrug(id);
    setDrugId(id);
    setRegimenIndex(0);
    setStrength(next.defaultStrength?.toString() ?? "");
    setDrugQuery("");
    setStep(2);
  };
  const chooseGroup = (next: PediatricDrugGroup) => {
    const first = PEDIATRIC_DRUGS.find((item) => item.group === next);
    setGroup(next);
    setDrugQuery("");
    setStep(1);
    if (first) {
      setDrugId(first.id);
      setRegimenIndex(0);
      setStrength(first.defaultStrength?.toString() ?? "");
    }
  };
  const clear = () => {
    setWeight("");
    setAge("");
    setHeight("");
    setStrength(drug.defaultStrength?.toString() ?? "");
    setStep(3);
  };
  const selectedRow = drug.regimens[regimenIndex] ?? drug.regimens[0];

  return (
    <div className="dose-workspace pediatric-dose-workspace">
      <section className="dose-hero dose-hero-innovative">
        <div>
          <span className="dose-kicker">Paediatric dose navigator · chart 2025</span>
          <h1>Drugs &amp; doses, made clear</h1>
          <p>Follow the three steps. The selected chart row and the patient-specific calculation stay together, so you do not have to remember where you are.</p>
        </div>
        <div className="dose-hero-badge"><ShieldAlert size={15} /><span><b>Check before giving</b><small>Indication · age · maximum · concentration</small></span></div>
      </section>

      <nav className="dose-progress" aria-label="Paediatric dose steps">
        <StepButton step={1} activeStep={step} complete={step > 1} title="Medicine" subtitle={drug.name} onClick={() => setStep(1)} />
        <ChevronRight className="dose-progress-arrow" size={18} aria-hidden="true" />
        <StepButton step={2} activeStep={step} complete={step > 2} title="Chart row" subtitle={selectedRow.condition} onClick={() => setStep(2)} />
        <ChevronRight className="dose-progress-arrow" size={18} aria-hidden="true" />
        <StepButton step={3} activeStep={step} complete={Boolean(result)} disabled={!canCalculate && step < 3} title="Patient & result" subtitle={result ? "Ready to review" : "Weight and age required"} onClick={() => setStep(3)} />
      </nav>

      <div className="dose-navigator-layout">
        <main className="dose-wizard-panel">
          {step === 1 && <section className="dose-card dose-step-panel">
            <div className="dose-step-heading"><div><span>Step 1 of 3</span><h2>Which medicine?</h2><p>Start typing or choose a category. You will then choose the matching indication row.</p></div><div className="dose-step-number">1</div></div>
            <div className="dose-picker-grid">
              <label className="dose-select-field">
                <span>Medicine category</span>
                <select value={group} onChange={(event) => chooseGroup(event.target.value as PediatricDrugGroup)}>{PEDIATRIC_DRUG_GROUPS.map((item) => <option value={item} key={item}>{item} · {PEDIATRIC_DRUGS.filter((drugItem) => drugItem.group === item).length}</option>)}</select>
                <small>Categories keep the search list short.</small>
              </label>
              <label className="dose-search-field">
                <span>Search medicine</span>
                <div><Search size={16} aria-hidden="true" /><input type="search" value={drugQuery} onChange={(event) => setDrugQuery(event.target.value)} placeholder="e.g. paracetamol" aria-label="Search paediatric medicines" /></div>
                <small>{filteredDrugs.length} medicine{filteredDrugs.length === 1 ? "" : "s"} in this category</small>
              </label>
            </div>
            <div className="dose-medicine-list" aria-label="Medicines in selected category">
              {filteredDrugs.length > 0 ? filteredDrugs.map((item) => <button type="button" key={item.id} className={item.id === drugId ? "active" : ""} onClick={() => chooseDrug(item.id)}><b>{item.name}</b><small>{item.regimens.length} chart row{item.regimens.length === 1 ? "" : "s"}</small></button>) : <p className="dose-empty-search">No match. Try a different medicine name or category.</p>}
            </div>
            <div className="dose-next-row"><span>Selected: <b>{drug.name}</b></span><button type="button" className="dose-next-button" onClick={() => setStep(2)}>Continue to chart row <ChevronRight size={16} /></button></div>
          </section>}

          {step === 2 && <section className="dose-card dose-step-panel">
            <div className="dose-step-heading"><div><span>Step 2 of 3</span><h2>Match the chart row</h2><p>Choose the indication and age band that actually applies to this child.</p></div><div className="dose-step-number">2</div></div>
            <div className="dose-selected-medicine"><span className="dose-selected-mark">{drug.name.slice(0, 1)}</span><div><small>Selected medicine</small><b>{drug.name}</b></div><button type="button" onClick={() => setStep(1)}><Pencil size={14} /> Change</button></div>
            <label className="dose-select-field dose-row-select">
              <span>Clinical indication / age row</span>
              <select value={regimenIndex} onChange={(event) => setRegimenIndex(Number(event.target.value))}>{drug.regimens.map((item, index) => <option value={index} key={`${item.condition}-${index}`}>{item.condition} — {item.regimen}</option>)}</select>
              <small>Never use the first row automatically. Match the indication, age and route.</small>
            </label>
            <div className="dose-row-preview"><div><small>Selected chart dose</small><b>{selectedRow.regimen}</b></div><span>{selectedRow.rule ? "Calculable" : "Manual verification"}</span></div>
            <div className="dose-next-row"><button type="button" className="dose-back-button" onClick={() => setStep(1)}>Back</button><button type="button" className="dose-next-button" onClick={() => setStep(3)}>Continue to patient details <ChevronRight size={16} /></button></div>
          </section>}

          {step === 3 && <section className="dose-card dose-step-panel">
            <div className="dose-step-heading"><div><span>Step 3 of 3</span><h2>Calculate for this child</h2><p>Use current dosing weight and the exact product concentration at the bedside.</p></div><div className="dose-step-number">3</div></div>
            <div className="dose-selected-medicine"><span className="dose-selected-mark">{drug.name.slice(0, 1)}</span><div><small>{selectedRow.condition}</small><b>{drug.name}</b></div><button type="button" onClick={() => setStep(2)}><Pencil size={14} /> Change row</button></div>
            <div className="dose-input-grid dose-patient-grid">
              <NumericField label="Current weight" value={weight} onChange={setWeight} unit="kg" min={0.4} max={200} step={0.01} hint="Required · current dosing weight" />
              <NumericField label="Age" value={age} onChange={setAge} unit="years" min={0} max={18} step={0.1} hint="Required · use 0.5 for 6 months" />
              <NumericField label="Height" value={height} onChange={setHeight} unit="cm" min={30} max={220} step={0.1} hint="Only for mg/m² rows" />
            </div>
            <label className="dose-strength-field"><span>Product strength / concentration <em>optional for volume</em></span><div><input type="number" inputMode="decimal" min={0} step="any" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="Read from product label" /><b>{drug.strengthUnit ?? "product-specific"}</b></div><small>Enter the exact vial, ampoule or bottle strength. Do not assume a chart concentration.</small></label>
            <div className="dose-next-row"><button type="button" className="dose-back-button" onClick={() => setStep(2)}>Back</button><button type="button" className="dose-clear" onClick={clear}>Clear patient details</button></div>
          </section>}
        </main>

        <aside className="dose-live-rail">
          <section className={`dose-live-card ${result ? "has-result" : ""}`}>
            <div className="dose-live-heading"><span>Live bedside view</span><span className={result ? "dose-live-status ready" : "dose-live-status"}>{result ? <><Check size={12} /> Ready</> : "Waiting for details"}</span></div>
            <h2>{drug.name}</h2>
            <p className="dose-live-row">{selectedRow.condition}</p>
            {result ? <>
              <div className="dose-live-amount"><small>Give this amount</small><strong>{result.calculatedAmount ?? result.dose}</strong><span>{result.dose}</span></div>
              <div className="dose-live-facts"><div><small>How often</small><b>{result.frequency}</b></div><div><small>Route</small><b>{result.route ?? "Per protocol"}</b></div></div>
              {result.volume && <div className="dose-live-volume"><span>Draw up</span><b>{result.volume}</b></div>}
            </> : <div className="dose-live-empty"><Info size={19} /><p>{step === 1 ? "Choose the medicine to begin." : "Enter weight and age to see the patient-specific amount."}</p></div>}
            <div className="dose-live-safety"><ShieldAlert size={14} /><span>{result?.caution ?? "Verify indication, age band, maximum dose and product concentration."}</span></div>
          </section>
          <details className="dose-reference-drawer" open>
            <summary>Chart reference <span>{drug.regimens.length} rows</span></summary>
            <PediatricReferenceTable drug={drug} />
          </details>
        </aside>
      </div>

      <details className="dose-catalog"><summary><span><b>Browse the complete paediatric chart</b><small>Open when you need another medicine or want to scan all entries</small></span><strong>{PEDIATRIC_DRUGS.length} medicines</strong></summary><div className="dose-catalog-grid">{PEDIATRIC_DRUGS.map((item) => <button type="button" className={`dose-catalog-item ${item.id === drugId ? "active" : ""}`} key={item.id} onClick={() => { setGroup(item.group); chooseDrug(item.id); }}>{item.name}<small>{item.group} · {item.regimens[0]?.regimen}</small></button>)}</div></details>

      <div className="dose-disclaimer"><ShieldAlert size={17} /><p><b>Clinical safety:</b> These entries are a transcription and calculation aid from the supplied Department of Clinical Pharmacy 2025 images, not an independent prescribing protocol. Confirm indication, age/weight band, renal/hepatic function, allergy status, maximum dose, dilution, route, interactions, local antimicrobial policy and current pharmacy guidance. Complex indication-specific rows, emergency medicines and high-risk doses require senior clinician/pharmacist verification before administration.</p></div>
    </div>
  );
}
