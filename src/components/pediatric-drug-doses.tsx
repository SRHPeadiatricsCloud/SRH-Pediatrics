"use client";

import { Info, Search, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  calculatePediatricDose,
  getPediatricDrug,
  PEDIATRIC_DRUG_GROUPS,
  PEDIATRIC_DRUGS,
  type PediatricDrug,
  type PediatricDrugGroup,
} from "@/lib/pediatric-dosing";

function NumericField({ label, value, onChange, unit, min, max, step = 1, hint }: { label: string; value: string; onChange: (value: string) => void; unit: string; min: number; max: number; step?: number; hint?: string }) {
  return <label className="dose-field"><span>{label}</span><div><input type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter" /><b>{unit}</b></div><small>{hint ?? `${min}–${max}`}</small></label>;
}

function PediatricReferenceTable({ drug }: { drug: PediatricDrug }) {
  return <div className="dose-reference-table-wrap"><table className="dose-reference-table"><caption>{drug.name} · paediatric chart reference</caption><thead><tr><th>Condition / age</th><th>Dose and schedule</th></tr></thead><tbody>{drug.regimens.map((row) => <tr key={`${row.condition}-${row.regimen}`}><th>{row.condition}</th><td>{row.regimen}</td></tr>)}</tbody></table></div>;
}

export function PediatricDrugDoses() {
  const [group, setGroup] = useState<PediatricDrugGroup>("Antimicrobials");
  const [drugId, setDrugId] = useState("acyclovir");
  const [drugQuery, setDrugQuery] = useState("");
  const [medicineOpen, setMedicineOpen] = useState(true);
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
  const selectedRow = drug.regimens[regimenIndex] ?? drug.regimens[0];

  const selectMedicine = (id: string) => {
    const next = getPediatricDrug(id);
    setDrugId(id);
    setRegimenIndex(0);
    setStrength(next.defaultStrength?.toString() ?? "");
    setDrugQuery("");
    setMedicineOpen(false);
  };
  const changeGroup = (next: PediatricDrugGroup) => {
    const first = PEDIATRIC_DRUGS.find((item) => item.group === next);
    setGroup(next);
    setDrugQuery("");
    if (first) {
      setDrugId(first.id);
      setRegimenIndex(0);
      setStrength(first.defaultStrength?.toString() ?? "");
    }
  };
  const clearPatient = () => {
    setWeight("");
    setAge("");
    setHeight("");
    setStrength(drug.defaultStrength?.toString() ?? "");
  };

  return <div className="dose-workspace pediatric-dose-workspace">
    <section className="dose-hero dose-hero-innovative"><div><span className="dose-kicker">Paediatric dose navigator · chart 2025</span><h1>Drugs &amp; doses, made clear</h1><p>Choose a medicine once, then keep the calculator and live bedside result in the same view. No page-hopping is needed.</p></div><div className="dose-hero-badge"><ShieldAlert size={15} /><span><b>Check before giving</b><small>Indication · age · maximum · concentration</small></span></div></section>

    <div className="dose-current-bar"><div className="dose-current-drug"><span className="dose-current-icon">{drug.name.slice(0, 1)}</span><div><small>Current medicine</small><b>{drug.name}</b><em>{selectedRow.condition}</em></div></div><button type="button" className="dose-change-button" onClick={() => setMedicineOpen(true)}><Search size={14} /> Change medicine</button></div>

    <div className="dose-desk-grid">
      <section className="dose-card dose-calculator-shell">
        <div className="dose-calculator-title"><div><span>Bedside calculator</span><h2>Enter details and review the result below</h2></div><span className={result ? "dose-status ready" : "dose-status"}>{result ? "Ready to review" : "Awaiting weight and age"}</span></div>
        <div className="dose-section-label"><b>1</b><span><strong>Choose the matching chart row</strong><small>Indication and age determine the correct regimen.</small></span></div>
        <label className="dose-select-field dose-row-select"><span>Clinical indication / age row</span><select value={regimenIndex} onChange={(event) => setRegimenIndex(Number(event.target.value))}>{drug.regimens.map((item, index) => <option value={index} key={`${item.condition}-${index}`}>{item.condition} — {item.regimen}</option>)}</select><small>Do not use the first row automatically. Confirm indication, age and route.</small></label>
        <div className="dose-row-preview"><div><small>Selected chart regimen</small><b>{selectedRow.regimen}</b></div><span>{selectedRow.rule ? "Calculable" : "Manual verification"}</span></div>

        <div className="dose-section-label dose-section-label-spaced"><b>2</b><span><strong>Enter patient details</strong><small>Use current dosing weight and the exact product concentration.</small></span></div>
        <div className="dose-input-grid dose-patient-grid"><NumericField label="Current weight" value={weight} onChange={setWeight} unit="kg" min={0.4} max={200} step={0.01} hint="Required · current dosing weight" /><NumericField label="Age" value={age} onChange={setAge} unit="years" min={0} max={18} step={0.1} hint="Required · use 0.5 for 6 months" /><NumericField label="Height" value={height} onChange={setHeight} unit="cm" min={30} max={220} step={0.1} hint="Only for mg/m² rows" /></div>
        <label className="dose-strength-field"><span>Product strength / concentration <em>optional for volume</em></span><div><input type="number" inputMode="decimal" min={0} step="any" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="Read from product label" /><b>{drug.strengthUnit ?? "product-specific"}</b></div><small>Enter the exact vial, ampoule or bottle strength. Never assume the chart concentration.</small></label>
        <div className="dose-calculator-actions"><button type="button" className="dose-clear" onClick={clearPatient}>Clear patient details</button><span><Info size={14} /> Calculation updates as you type</span></div>

        <details className="dose-reference-drawer dose-reference-inline"><summary>Chart reference <span>{drug.regimens.length} rows</span></summary><PediatricReferenceTable drug={drug} /></details>
      </section>

      <aside className="dose-result-sticky">
        <section className={`dose-live-card ${result ? "has-result" : ""}`}><div className="dose-live-heading"><span>Live bedside result</span><span className={result ? "dose-live-status ready" : "dose-live-status"}>{result ? "Ready to review" : "Waiting"}</span></div><h2>{drug.name}</h2><p className="dose-live-row">{selectedRow.condition}</p>{result ? <><div className="dose-live-amount"><small>Patient-specific amount</small><strong>{result.calculatedAmount ?? result.dose}</strong><span>{result.dose}</span></div><div className="dose-live-facts"><div><small>How often</small><b>{result.frequency}</b></div><div><small>Route</small><b>{result.route ?? "Per protocol"}</b></div></div>{result.volume && <div className="dose-live-volume"><span>Draw up using entered strength</span><b>{result.volume}</b></div>}</> : <div className="dose-live-empty"><Info size={19} /><p>Enter current weight and age to see the patient-specific amount here.</p></div>}<div className="dose-live-safety"><ShieldAlert size={14} /><span>{result?.caution ?? "Verify indication, age band, maximum dose and product concentration."}</span></div></section>
        <section className="dose-safety-checklist"><h3>Before administration</h3><p>Use this short check every time:</p><ul><li><CheckIcon /> Indication and age band match</li><li><CheckIcon /> Renal/hepatic function reviewed</li><li><CheckIcon /> Maximum dose and route confirmed</li><li><CheckIcon /> Product concentration independently checked</li></ul></section>
      </aside>
    </div>

    {medicineOpen && <div className="dose-medicine-overlay" role="dialog" aria-modal="true" aria-labelledby="medicine-picker-title"><button type="button" className="dose-overlay-backdrop" aria-label="Close medicine picker" onClick={() => setMedicineOpen(false)} /><section className="dose-medicine-modal"><div className="dose-medicine-modal-heading"><div><span>Medicine picker</span><h2 id="medicine-picker-title">What are you giving?</h2><p>Search here instead of scrolling through the dose calculator.</p></div><button type="button" className="dose-modal-close" aria-label="Close medicine picker" onClick={() => setMedicineOpen(false)}><X size={18} /></button></div><div className="dose-picker-grid"><label className="dose-select-field"><span>Medicine category</span><select value={group} onChange={(event) => changeGroup(event.target.value as PediatricDrugGroup)}>{PEDIATRIC_DRUG_GROUPS.map((item) => <option value={item} key={item}>{item} · {PEDIATRIC_DRUGS.filter((drugItem) => drugItem.group === item).length}</option>)}</select></label><label className="dose-search-field"><span>Search medicine</span><div><Search size={16} aria-hidden="true" /><input autoFocus type="search" value={drugQuery} onChange={(event) => setDrugQuery(event.target.value)} placeholder="e.g. paracetamol" aria-label="Search paediatric medicines" /></div><small>{filteredDrugs.length} result{filteredDrugs.length === 1 ? "" : "s"}</small></label></div><div className="dose-medicine-list dose-medicine-modal-list">{filteredDrugs.length > 0 ? filteredDrugs.map((item) => <button type="button" key={item.id} className={item.id === drugId ? "active" : ""} onClick={() => selectMedicine(item.id)}><b>{item.name}</b><small>{item.regimens.length} chart row{item.regimens.length === 1 ? "" : "s"} · {item.group}</small></button>) : <p className="dose-empty-search">No match. Try another medicine name or category.</p>}</div><div className="dose-modal-tip"><Search size={14} /><span>Tip: use the category first, then type the first few letters of the medicine.</span></div></section></div>}
  </div>;
}

function CheckIcon() {
  return <span className="dose-check-icon" aria-hidden="true">✓</span>;
}
