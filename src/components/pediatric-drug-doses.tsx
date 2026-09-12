"use client";

import { Check, Info, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Stepper } from "@/components/ui";
import {
  calculatePediatricDose,
  getPediatricDrug,
  PEDIATRIC_DRUG_GROUPS,
  PEDIATRIC_DRUGS,
  type PediatricDrug,
  type PediatricDrugGroup,
} from "@/lib/pediatric-dosing";

function PediatricReferenceTable({ drug }: { drug: PediatricDrug }) {
  return <div className="dose-reference-table-wrap"><table className="dose-reference-table"><caption>{drug.name} · paediatric chart reference</caption><thead><tr><th>Condition / age</th><th>Dose and schedule</th></tr></thead><tbody>{drug.regimens.map((row) => <tr key={`${row.condition}-${row.regimen}`}><th>{row.condition}</th><td>{row.regimen}</td></tr>)}</tbody></table></div>;
}

export function PediatricDrugDoses() {
  const [group, setGroup] = useState<PediatricDrugGroup>("Antimicrobials");
  const [drugId, setDrugId] = useState("acyclovir");
  const [drugQuery, setDrugQuery] = useState("");
  const [regimenIndex, setRegimenIndex] = useState(0);
  const [weightKg, setWeightKg] = useState<number | undefined>();
  const [ageYears, setAgeYears] = useState<number | undefined>();
  const [heightCm, setHeightCm] = useState<number | undefined>();
  const [strength, setStrength] = useState("");

  const drug = getPediatricDrug(drugId);
  const categoryDrugs = PEDIATRIC_DRUGS.filter((item) => item.group === group);
  const matches = categoryDrugs.filter((item) => item.name.toLowerCase().includes(drugQuery.trim().toLowerCase()));
  const medicineOptions = matches.some((item) => item.id === drugId) ? matches : [drug, ...matches];
  const strengthValue = Number(strength);
  const canCalculate = Boolean(weightKg && weightKg > 0 && ageYears !== undefined);
  const result = canCalculate
    ? calculatePediatricDose(drug, { weightKg: weightKg ?? 0, ageYears: ageYears ?? 0, heightCm: heightCm && heightCm > 0 ? heightCm : undefined, strength: strengthValue > 0 ? strengthValue : undefined }, regimenIndex)
    : null;
  const selectedRow = drug.regimens[regimenIndex] ?? drug.regimens[0];

  const chooseGroup = (next: PediatricDrugGroup) => {
    const first = PEDIATRIC_DRUGS.find((item) => item.group === next);
    setGroup(next);
    setDrugQuery("");
    if (first) {
      setDrugId(first.id);
      setRegimenIndex(0);
      setStrength(first.defaultStrength?.toString() ?? "");
    }
  };
  const chooseDrug = (id: string) => {
    const next = getPediatricDrug(id);
    setDrugId(id);
    setRegimenIndex(0);
    setStrength(next.defaultStrength?.toString() ?? "");
  };
  const clearPatient = () => {
    setWeightKg(undefined);
    setAgeYears(undefined);
    setHeightCm(undefined);
    setStrength(drug.defaultStrength?.toString() ?? "");
  };

  return <div className="dose-workspace dose-simple">
    <section className="dose-hero dose-simple-hero"><div><span className="dose-kicker">Paediatric dose navigator · chart 2025</span><h1>Drugs &amp; doses</h1><p>Choose the medicine, enter the child&apos;s details, and review the answer. Everything is in one calm, mobile-friendly flow.</p></div><div className="dose-hero-badge"><ShieldAlert size={15} /><span><b>Verify before giving</b><small>Indication · age · maximum · concentration</small></span></div></section>

    <section className="dose-simple-card dose-simple-medicine"><div className="dose-simple-heading"><div><span>1 · Medicine</span><h2>What are you giving?</h2><p>Search and select one medicine. The calculator stays below it.</p></div><b className="dose-simple-count">{PEDIATRIC_DRUGS.length}</b></div><div className="dose-simple-medicine-controls"><label className="dose-select-field"><span>Category</span><select value={group} onChange={(event) => chooseGroup(event.target.value as PediatricDrugGroup)}>{PEDIATRIC_DRUG_GROUPS.map((item) => <option value={item} key={item}>{item} · {PEDIATRIC_DRUGS.filter((drugItem) => drugItem.group === item).length}</option>)}</select></label><label className="dose-search-field"><span>Search medicine</span><div><Search size={16} aria-hidden="true" /><input type="search" value={drugQuery} onChange={(event) => setDrugQuery(event.target.value)} placeholder="Type a medicine name" aria-label="Search paediatric medicines" /></div></label></div><label className="dose-select-field dose-simple-medicine-select"><span>Medicine</span><select value={drugId} onChange={(event) => chooseDrug(event.target.value)}>{medicineOptions.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.regimens.length} chart row{item.regimens.length === 1 ? "" : "s"}</option>)}</select><small>{matches.length} medicine{matches.length === 1 ? "" : "s"} in this category match the search.</small></label><div className="dose-simple-selected"><span>{drug.name.slice(0, 1)}</span><div><small>Selected medicine</small><b>{drug.name}</b></div><Check size={16} /></div></section>

    <section className="dose-simple-card dose-simple-calculator"><div className="dose-simple-heading"><div><span>2 · Calculator</span><h2>{drug.name}</h2><p>Select the matching chart row, then use the admission-style sliders.</p></div><span className={result ? "dose-status ready" : "dose-status"}>{result ? "Ready to review" : "Enter details"}</span></div><div className="dose-simple-row"><label className="dose-select-field"><span>Clinical indication / age row</span><select value={regimenIndex} onChange={(event) => setRegimenIndex(Number(event.target.value))}>{drug.regimens.map((item, index) => <option value={index} key={`${item.condition}-${index}`}>{item.condition} — {item.regimen}</option>)}</select><small>Choose the row that matches the child. Confirm route and maximum dose.</small></label><div className="dose-simple-row-preview"><small>Selected chart regimen</small><b>{selectedRow.regimen}</b><span>{selectedRow.rule ? "Calculable" : "Manual verification"}</span></div></div><div className="dose-simple-input-heading"><b>Patient details</b><small>Tap the slider, use − / +, or type directly into the value.</small></div><div className="dose-simple-slider-grid"><Stepper label="Current weight" value={weightKg} onChange={setWeightKg} min={0.4} max={200} step={0.1} unit="kg" decimals={1} /><Stepper label="Age" value={ageYears} onChange={setAgeYears} min={0} max={18} step={0.1} unit="years" decimals={1} /><Stepper label="Height" value={heightCm} onChange={setHeightCm} min={30} max={220} step={0.5} unit="cm" decimals={1} /></div><label className="dose-strength-field dose-simple-strength"><span>Product strength <em>optional · calculates volume</em></span><div><input type="number" inputMode="decimal" min={0} step="any" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="Read exact strength from label" /><b>{drug.strengthUnit ?? "product-specific"}</b></div><small>Concentration is intentionally typed from the product label; do not estimate it with a slider.</small></label><button type="button" className="dose-clear dose-simple-clear" onClick={clearPatient}>Clear patient details</button></section>

    <section className={`dose-simple-result ${result ? "ready" : ""}`}><div className="dose-simple-result-heading"><div><span>3 · Live result</span><h2>{result ? "Review before administration" : "Your calculated dose appears here"}</h2></div><b>{result ? <><Check size={13} /> Ready</> : "Waiting"}</b></div>{result ? <><div className="dose-simple-result-main"><small>Patient-specific amount</small><strong>{result.calculatedAmount ?? result.dose}</strong><span>{result.dose}</span></div><div className="dose-simple-result-facts"><div><small>How often</small><b>{result.frequency}</b></div><div><small>Route</small><b>{result.route ?? "Per protocol"}</b></div>{result.volume && <div><small>Draw up</small><b>{result.volume}</b></div>}</div></> : <div className="dose-simple-placeholder"><Info size={18} /><p>Enter current weight and age. The result updates immediately as you type.</p></div>}<div className="dose-simple-safety"><ShieldAlert size={14} /><span>{result?.caution ?? "Verify indication, age band, renal/hepatic function, maximum dose and product concentration."}</span></div></section>

    <details className="dose-reference-drawer dose-simple-reference" open><summary>Chart reference <span>{drug.regimens.length} rows · {drug.name}</span></summary><PediatricReferenceTable drug={drug} /></details>
  </div>;
}
