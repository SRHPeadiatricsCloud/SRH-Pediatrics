"use client";

import { Calculator, Info, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { getNicuDrug, NICU_DRUG_GROUPS, NICU_DRUGS, type NicuDrug, type NicuDrugGroup } from "@/lib/nicu-dosing";

function NumericField({ label, value, onChange, unit, min, max, step = 1, hint }: { label: string; value: string; onChange: (value: string) => void; unit: string; min: number; max: number; step?: number; hint?: string }) {
  return <label className="dose-field"><span>{label}</span><div><input type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Enter" /><b>{unit}</b></div><small>{hint ?? `${min}–${max}`}</small></label>;
}

function DrugReferenceTable({ drug }: { drug: NicuDrug }) {
  return <div className="dose-reference-table-wrap"><table className="dose-reference-table"><caption>{drug.name} · supplied NICU chart</caption><thead><tr><th>Condition</th><th>Digitised dose and interval</th></tr></thead><tbody>{drug.referenceRows.map((row) => <tr key={`${row.condition}-${row.regimen}`}><th>{row.condition}</th><td>{row.regimen}</td></tr>)}</tbody></table></div>;
}

export function NicuDrugDoses() {
  const [group, setGroup] = useState<NicuDrugGroup>("Antibiotics");
  const [drugId, setDrugId] = useState("ampicillin");
  const [weight, setWeight] = useState("");
  const [ga, setGa] = useState("");
  const [pna, setPna] = useState("");
  const [pma, setPma] = useState("");
  const [strength, setStrength] = useState("");

  const drug = getNicuDrug(drugId);
  const visibleDrugs = NICU_DRUGS.filter((item) => item.group === group);
  const selectedWeight = Number(weight);
  const selectedGa = Number(ga);
  const selectedPna = Number(pna);
  const selectedPma = Number(pma);
  const selectedStrength = Number(strength);
  const derivedPma = selectedGa > 0 && selectedPna >= 0 ? selectedGa + selectedPna / 7 : 0;
  const effectivePma = selectedPma > 0 ? selectedPma : derivedPma;
  const canCalculate = selectedWeight > 0 && selectedGa > 0 && selectedPna >= 0;
  const result = useMemo(() => canCalculate ? drug.calculate({ drugId, weightKg: selectedWeight, gestationalAgeWeeks: selectedGa, postnatalAgeDays: selectedPna, postmenstrualAgeWeeks: effectivePma, strength: selectedStrength > 0 ? selectedStrength : undefined }) : null, [canCalculate, drug, drugId, effectivePma, selectedGa, selectedPna, selectedStrength, selectedWeight]);

  const selectGroup = (next: NicuDrugGroup) => {
    setGroup(next);
    const first = NICU_DRUGS.find((item) => item.group === next);
    if (first) { setDrugId(first.id); setStrength(first.defaultStrength?.toString() ?? ""); }
  };
  const selectDrug = (id: string) => {
    setDrugId(id);
    const next = getNicuDrug(id);
    setStrength(next.defaultStrength?.toString() ?? "");
  };
  const clear = () => { setWeight(""); setGa(""); setPna(""); setPma(""); setStrength(drug.defaultStrength?.toString() ?? ""); };

  return <div className="dose-workspace">
    <section className="dose-hero"><div><span className="dose-kicker">NICU formulary · digitised from supplied chart</span><h1>Drugs &amp; doses</h1><p>Select a medicine, enter the infant&apos;s current weight and timing, then enter the available concentration. The calculator returns the weight-based amount and, where a strength is supplied, the volume to draw up.</p></div><span className="dose-safety"><ShieldAlert size={15} /> Verify before prescribing</span></section>

    <div className="dose-group-tabs" role="tablist" aria-label="Drug groups">{NICU_DRUG_GROUPS.map((item) => <button type="button" role="tab" aria-selected={group === item} className={group === item ? "active" : ""} key={item} onClick={() => selectGroup(item)}>{item}<small>{NICU_DRUGS.filter((drugItem) => drugItem.group === item).length} entries</small></button>)}</div>

    <div className="dose-main-grid">
      <section className="dose-card dose-input-card"><div className="dose-card-heading"><div><span>1 · Medicine</span><h2>Choose a chart entry</h2></div><Calculator size={17} /></div><label className="dose-select-field"><span>Drug</span><select value={drugId} onChange={(event) => selectDrug(event.target.value)}>{visibleDrugs.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><small>{drug.group} · reference rows are shown below the result</small></label>
        <div className="dose-card-heading dose-subheading"><div><span>2 · Infant parameters</span><h2>Required for age/weight dosing</h2></div></div><div className="dose-input-grid"><NumericField label="Current weight" value={weight} onChange={setWeight} unit="kg" min={0.2} max={30} step={0.01} hint="Use current dosing weight" /><NumericField label="Gestational age at birth" value={ga} onChange={setGa} unit="weeks" min={22} max={44} hint="Completed weeks" /><NumericField label="Postnatal age" value={pna} onChange={setPna} unit="days" min={0} max={365} hint="Day of life" /><NumericField label="Postmenstrual age" value={pma} onChange={setPma} unit="weeks" min={22} max={60} step={0.1} hint={derivedPma ? `Derived PMA: ${derivedPma.toFixed(1)} wk` : "Optional override for PMA-based rows"} /></div>
        <div className="dose-card-heading dose-subheading"><div><span>3 · Available formulation</span><h2>Calculate volume to administer</h2></div></div><label className="dose-strength-field"><span>Available strength / concentration {drug.strengthUnit ? `(${drug.strengthUnit})` : ""}</span><div><input type="number" inputMode="decimal" min={0} step="any" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder={drug.defaultStrength ? String(drug.defaultStrength) : "Enter product strength"} /><b>{drug.strengthUnit ?? "product-specific"}</b></div><small>{drug.defaultStrength ? `Chart image lists ${drug.defaultStrength} ${drug.strengthUnit}; change this if your vial/syrup differs.` : "Enter the exact reconstituted concentration from the product label; volume is not estimated without it."}</small></label><button type="button" className="dose-clear" onClick={clear}>Clear patient inputs</button>
      </section>

      <section className="dose-card dose-result-card"><div className="dose-card-heading"><div><span>4 · Auto-calculated result</span><h2>{drug.name}</h2></div><span className={result ? "dose-status ready" : "dose-status"}>{result ? "Ready" : "Awaiting inputs"}</span></div>{result ? <><div className="dose-result-banner"><div><small>Calculated dose</small><strong>{result.calculatedAmount ?? result.dose}</strong><span>{result.dose}</span></div><div><small>Frequency</small><strong>{result.frequency}</strong><span>{result.route ?? "Route per protocol"}</span></div></div>{result.volume && <div className="dose-volume"><span>Volume using entered strength</span><b>{result.volume}</b></div>}<dl className="dose-result-list"><div><dt>Selection rule</dt><dd>{result.rule}</dd></div><div><dt>Chart regimen</dt><dd>{result.dose} · {result.frequency}</dd></div>{result.caution && <div><dt>Safety check</dt><dd>{result.caution}</dd></div>}</dl></> : <div className="dose-awaiting"><Info size={22} /><p>Enter weight, gestational age and postnatal age. The timing variables are kept visible because the same medicine can require different intervals in a premature infant.</p></div>}
        <div className="dose-divider" /><DrugReferenceTable drug={drug} /></section>
    </div>

    <section className="dose-catalog"><div className="dose-card-heading"><div><span>Quick reference</span><h2>All digitised entries from the supplied pages</h2></div><small>{NICU_DRUGS.length} dose entries</small></div><div className="dose-catalog-grid">{NICU_DRUGS.map((item) => <button type="button" className={`dose-catalog-item ${item.id === drugId ? "active" : ""}`} key={item.id} onClick={() => { setGroup(item.group); selectDrug(item.id); }}><b>{item.name}</b><small>{item.referenceRows[0]?.regimen}</small></button>)}</div></section>

    <div className="dose-disclaimer"><ShieldAlert size={17} /><p><b>Clinical safety:</b> This is a transcription and calculation aid based on the supplied NICU dose chart, not an independent prescribing protocol. Confirm drug indication, current weight, gestational/postmenstrual age, renal/hepatic function, allergy status, dilution, route, maximum dose, therapeutic drug monitoring and local antimicrobial policy. Aminoglycosides and vancomycin require particular attention to levels and renal function. A second clinician/pharmacist should verify high-risk doses before administration.</p></div>
  </div>;
}
