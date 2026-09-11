"use client";

import { Info, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { calculatePediatricDose, getPediatricDrug, PEDIATRIC_DRUG_GROUPS, PEDIATRIC_DRUGS, type PediatricDrug, type PediatricDrugGroup } from "@/lib/pediatric-dosing";

function NumericField({ label, value, onChange, unit, min, max, step = 1, hint }: { label: string; value: string; onChange: (value: string) => void; unit: string; min: number; max: number; step?: number; hint?: string }) {
  return <label className="dose-field"><span>{label}</span><div><input type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter" /><b>{unit}</b></div><small>{hint ?? `${min}–${max}`}</small></label>;
}

function PediatricReferenceTable({ drug }: { drug: PediatricDrug }) {
  return <div className="dose-reference-table-wrap"><table className="dose-reference-table"><caption>{drug.name} · paediatric dose chart</caption><thead><tr><th>Condition / age</th><th>Dose</th></tr></thead><tbody>{drug.regimens.map((row) => <tr key={`${row.condition}-${row.regimen}`}><th>{row.condition}</th><td>{row.regimen}</td></tr>)}</tbody></table></div>;
}

export function PediatricDrugDoses() {
  const [group, setGroup] = useState<PediatricDrugGroup>("Antimicrobials");
  const [drugId, setDrugId] = useState("acyclovir");
  const [regimenIndex, setRegimenIndex] = useState(0);
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [strength, setStrength] = useState("");
  const drug = getPediatricDrug(drugId);
  const visibleDrugs = PEDIATRIC_DRUGS.filter((item) => item.group === group);
  const weightKg = Number(weight);
  const ageYears = Number(age);
  const heightCm = Number(height);
  const strengthValue = Number(strength);
  const canCalculate = weightKg > 0 && age !== "";
  const result = useMemo(() => canCalculate ? calculatePediatricDose(drug, { weightKg, ageYears, heightCm: heightCm > 0 ? heightCm : undefined, strength: strengthValue > 0 ? strengthValue : undefined }, regimenIndex) : null, [canCalculate, drug, heightCm, regimenIndex, strengthValue, weightKg, ageYears]);

  const chooseDrug = (id: string) => { const next = getPediatricDrug(id); setDrugId(id); setRegimenIndex(0); setStrength(next.defaultStrength?.toString() ?? ""); };
  const chooseGroup = (next: PediatricDrugGroup) => { setGroup(next); const first = PEDIATRIC_DRUGS.find((item) => item.group === next); if (first) chooseDrug(first.id); };
  const clear = () => { setWeight(""); setAge(""); setHeight(""); setStrength(drug.defaultStrength?.toString() ?? ""); };

  return <div className="dose-workspace">
    <section className="dose-hero"><div><span className="dose-kicker">Department of Clinical Pharmacy · Paediatric doses 2025</span><h1>Paediatric drugs &amp; doses</h1><p>Digitised from the supplied Department of Clinical Pharmacy 2025 dose sheets. Select the clinical indication/age row, enter weight and formulation strength, and calculate the patient-specific amount and draw-up volume.</p></div><span className="dose-safety"><ShieldAlert size={15} /> Verify before prescribing</span></section>
    <div className="dose-group-tabs" role="tablist" aria-label="Paediatric drug groups">{PEDIATRIC_DRUG_GROUPS.map((item) => <button type="button" role="tab" aria-selected={group === item} className={group === item ? "active" : ""} key={item} onClick={() => chooseGroup(item)}>{item}<small>{PEDIATRIC_DRUGS.filter((drugItem) => drugItem.group === item).length} entries</small></button>)}</div>
    <div className="dose-main-grid">
      <section className="dose-card dose-input-card"><div className="dose-card-heading"><div><span>1 · Medicine and regimen</span><h2>Choose a chart entry</h2></div></div><label className="dose-select-field"><span>Drug</span><select value={drugId} onChange={(event) => chooseDrug(event.target.value)}>{visibleDrugs.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><small>{drug.group} · all indication-specific rows remain visible below</small></label><label className="dose-select-field"><span>Clinical indication / age row</span><select value={regimenIndex} onChange={(event) => setRegimenIndex(Number(event.target.value))}>{drug.regimens.map((item, index) => <option value={index} key={`${item.condition}-${index}`}>{item.condition} — {item.regimen}</option>)}</select><small>Select the row that matches the patient; do not use the default row blindly.</small></label>
        <div className="dose-card-heading dose-subheading"><div><span>2 · Patient parameters</span><h2>Weight-based and body-surface-area dosing</h2></div></div><div className="dose-input-grid"><NumericField label="Current weight" value={weight} onChange={setWeight} unit="kg" min={0.4} max={200} step={0.01} hint="Current dosing weight" /><NumericField label="Age" value={age} onChange={setAge} unit="years" min={0} max={18} step={0.1} hint="Used for age rows" /><NumericField label="Height" value={height} onChange={setHeight} unit="cm" min={30} max={220} step={0.1} hint="Required for mg/m² rows" /></div>
        <div className="dose-card-heading dose-subheading"><div><span>3 · Available formulation</span><h2>Calculate volume to administer</h2></div></div><label className="dose-strength-field"><span>Available strength / concentration {drug.strengthUnit ? `(${drug.strengthUnit})` : ""}</span><div><input type="number" inputMode="decimal" min={0} step="any" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder={drug.defaultStrength ? String(drug.defaultStrength) : "Enter product strength"} /><b>{drug.strengthUnit ?? "product-specific"}</b></div><small>{drug.defaultStrength ? `Default reference strength: ${drug.defaultStrength} ${drug.strengthUnit}; change this to match the product label.` : "Enter exact product strength; volume is not estimated without it."}</small></label><button type="button" className="dose-clear" onClick={clear}>Clear patient inputs</button>
      </section>
      <section className="dose-card dose-result-card"><div className="dose-card-heading"><div><span>4 · Auto-calculated result</span><h2>{drug.name}</h2></div><span className={result ? "dose-status ready" : "dose-status"}>{result ? "Ready" : "Awaiting inputs"}</span></div>{result ? <><div className="dose-result-banner"><div><small>Calculated dose</small><strong>{result.calculatedAmount ?? result.dose}</strong><span>{result.dose}</span></div><div><small>Frequency</small><strong>{result.frequency}</strong><span>{result.route ?? "Route per protocol"}</span></div></div>{result.volume && <div className="dose-volume"><span>Volume using entered strength</span><b>{result.volume}</b></div>}<dl className="dose-result-list"><div><dt>Selected row</dt><dd>{result.rule}</dd></div><div><dt>Chart regimen</dt><dd>{result.dose} · {result.frequency}</dd></div><div><dt>Safety check</dt><dd>{result.caution}</dd></div></dl></> : <div className="dose-awaiting"><Info size={22} /><p>Enter weight and age, then select the indication-specific row. Height is additionally required for body-surface-area dosing.</p></div>}<div className="dose-divider" /><PediatricReferenceTable drug={drug} /></section>
    </div>
    <section className="dose-catalog"><div className="dose-card-heading"><div><span>Quick reference</span><h2>All digitised paediatric entries</h2></div><small>{PEDIATRIC_DRUGS.length} medicines</small></div><div className="dose-catalog-grid">{PEDIATRIC_DRUGS.map((item) => <button type="button" className={`dose-catalog-item ${item.id === drugId ? "active" : ""}`} key={item.id} onClick={() => { setGroup(item.group); chooseDrug(item.id); }}><b>{item.name}</b><small>{item.regimens[0]?.regimen}</small></button>)}</div></section>
    <div className="dose-disclaimer"><ShieldAlert size={17} /><p><b>Clinical safety:</b> These entries are a transcription and calculation aid based on the supplied Department of Clinical Pharmacy 2025 images. They are not an independent prescribing protocol. Confirm indication, age/weight band, renal/hepatic function, allergy status, maximum dose, dilution, route, interactions, local antimicrobial policy and current pharmacy guidance. Complex condition-specific rows, mg/m² dosing and emergency medicines require senior clinician/pharmacist verification.</p></div>
  </div>;
}
