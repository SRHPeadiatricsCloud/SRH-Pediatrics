"use client";

import { Check, Info, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Stepper } from "@/components/ui";
import {
  calculatePediatricDose,
  getPediatricDrug,
  PEDIATRIC_DRUG_GROUPS,
  PEDIATRIC_DRUGS,
  type PediatricDrug,
  type PediatricDrugGroup,
} from "@/lib/pediatric-dosing";

type MobileView = "library" | "calculator";

function PediatricReferenceTable({ drug }: { drug: PediatricDrug }) {
  return <div className="dose-reference-table-wrap"><table className="dose-reference-table"><caption>{drug.name} · paediatric chart reference</caption><thead><tr><th>Condition / age</th><th>Dose and schedule</th></tr></thead><tbody>{drug.regimens.map((row) => <tr key={`${row.condition}-${row.regimen}`}><th>{row.condition}</th><td>{row.regimen}</td></tr>)}</tbody></table></div>;
}

export function PediatricDrugDoses() {
  const [group, setGroup] = useState<PediatricDrugGroup>("Antimicrobials");
  const [drugId, setDrugId] = useState("acyclovir");
  const [drugQuery, setDrugQuery] = useState("");
  const [mobileView, setMobileView] = useState<MobileView>("library");
  const [regimenIndex, setRegimenIndex] = useState(0);
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
  const [ageYears, setAgeYears] = useState<number | undefined>(undefined);
  const [heightCm, setHeightCm] = useState<number | undefined>(undefined);
  const [strength, setStrength] = useState("");

  const drug = getPediatricDrug(drugId);
  const visibleDrugs = PEDIATRIC_DRUGS.filter((item) => item.group === group);
  const filteredDrugs = visibleDrugs.filter((item) => item.name.toLowerCase().includes(drugQuery.trim().toLowerCase()));
  const strengthValue = Number(strength);
  const canCalculate = Boolean(weightKg && weightKg > 0 && ageYears !== undefined);
  const result = useMemo(
    () => canCalculate ? calculatePediatricDose(drug, { weightKg: weightKg ?? 0, ageYears: ageYears ?? 0, heightCm: heightCm && heightCm > 0 ? heightCm : undefined, strength: strengthValue > 0 ? strengthValue : undefined }, regimenIndex) : null,
    [ageYears, canCalculate, drug, heightCm, regimenIndex, strengthValue, weightKg],
  );
  const selectedRow = drug.regimens[regimenIndex] ?? drug.regimens[0];

  const selectMedicine = (id: string) => {
    const next = getPediatricDrug(id);
    setDrugId(id);
    setRegimenIndex(0);
    setStrength(next.defaultStrength?.toString() ?? "");
    setDrugQuery("");
    setMobileView("calculator");
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
    setWeightKg(undefined);
    setAgeYears(undefined);
    setHeightCm(undefined);
    setStrength(drug.defaultStrength?.toString() ?? "");
  };

  return <div className="dose-workspace pediatric-dose-workspace dose-redesign">
    <section className="dose-hero dose-hero-innovative dose-redesign-hero"><div><span className="dose-kicker">Paediatric dose navigator · chart 2025</span><h1>A simpler dose desk</h1><p>Pick a medicine on the left, enter the child&apos;s details on the right, and review the answer without leaving the screen.</p></div><div className="dose-hero-badge"><ShieldAlert size={15} /><span><b>Always verify before giving</b><small>Indication · age · maximum · concentration</small></span></div></section>

    <div className="dose-mobile-tabs" role="tablist" aria-label="Dose desk sections"><button type="button" role="tab" aria-selected={mobileView === "library"} className={mobileView === "library" ? "active" : ""} onClick={() => setMobileView("library")}><Search size={15} /> <span>1. Choose medicine</span><small>{drug.name}</small></button><button type="button" role="tab" aria-selected={mobileView === "calculator"} className={mobileView === "calculator" ? "active" : ""} onClick={() => setMobileView("calculator")}><Check size={15} /> <span>2. Calculate dose</span><small>{result ? "Ready to review" : "Enter details"}</small></button></div>

    <div className="dose-redesign-layout">
      <aside className={`dose-library-panel ${mobileView === "library" ? "mobile-visible" : ""}`}>
        <div className="dose-redesign-panel-heading"><div><span>Medicine library</span><h2>What are you giving?</h2></div><b>{PEDIATRIC_DRUGS.length}</b></div>
        <label className="dose-select-field dose-redesign-control"><span>Category</span><select value={group} onChange={(event) => changeGroup(event.target.value as PediatricDrugGroup)}>{PEDIATRIC_DRUG_GROUPS.map((item) => <option value={item} key={item}>{item} · {PEDIATRIC_DRUGS.filter((drugItem) => drugItem.group === item).length}</option>)}</select></label>
        <label className="dose-search-field dose-redesign-control"><span>Search medicine</span><div><Search size={16} aria-hidden="true" /><input type="search" value={drugQuery} onChange={(event) => setDrugQuery(event.target.value)} placeholder="Type a medicine name" aria-label="Search paediatric medicines" /></div><small>{filteredDrugs.length} result{filteredDrugs.length === 1 ? "" : "s"}</small></label>
        <div className="dose-library-list" aria-label="Medicines in selected category">{filteredDrugs.length > 0 ? filteredDrugs.map((item) => <button type="button" key={item.id} className={item.id === drugId ? "active" : ""} onClick={() => selectMedicine(item.id)}><span><b>{item.name}</b><small>{item.regimens.length} chart row{item.regimens.length === 1 ? "" : "s"}</small></span><em>{item.id === drugId ? <Check size={15} /> : ""}</em></button>) : <p className="dose-empty-search">No match. Try another name or category.</p>}</div>
        <div className="dose-library-tip"><Info size={14} /><span>Choose a medicine to open its dose rows and calculator.</span></div>
      </aside>

      <main className={`dose-calculator-panel ${mobileView === "calculator" ? "mobile-visible" : ""}`}>
        <div className="dose-calculator-top"><div><span> dose calculator</span><h2>{drug.name}</h2><p>{selectedRow.condition}</p></div><button type="button" className="dose-change-link" onClick={() => setMobileView("library")}><Search size={14} /> Change</button></div>
        <section className="dose-redesign-card"><div className="dose-redesign-card-title"><span>1</span><div><h3>Choose the chart row</h3><p>Match the indication and age band before entering measurements.</p></div></div><label className="dose-select-field dose-row-select"><span>Clinical indication / age row</span><select value={regimenIndex} onChange={(event) => setRegimenIndex(Number(event.target.value))}>{drug.regimens.map((item, index) => <option value={index} key={`${item.condition}-${index}`}>{item.condition} — {item.regimen}</option>)}</select><small>Never use the first row automatically. Confirm route and maximum dose.</small></label><div className="dose-row-preview"><div><small>Selected chart regimen</small><b>{selectedRow.regimen}</b></div><span>{selectedRow.rule ? "Calculable" : "Manual verification"}</span></div></section>
        <section className="dose-redesign-card"><div className="dose-redesign-card-title"><span>2</span><div><h3>Enter patient details</h3><p>Current dosing weight is required. Height is used only for mg/m² rows.</p></div></div><div className="dose-slider-grid dose-redesign-inputs"><Stepper label="Current weight" value={weightKg} onChange={setWeightKg} min={0.4} max={200} step={0.1} unit="kg" decimals={1} /><Stepper label="Age" value={ageYears} onChange={setAgeYears} min={0} max={18} step={0.1} unit="years" decimals={1} /><Stepper label="Height" value={heightCm} onChange={setHeightCm} min={30} max={220} step={0.5} unit="cm" decimals={1} /></div><label className="dose-strength-field"><span>Product strength <em>optional: calculates volume</em></span><div><input type="number" inputMode="decimal" min={0} step="any" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="Read from product label" /><b>{drug.strengthUnit ?? "product-specific"}</b></div><small>Use the exact vial, ampoule or bottle concentration. Do not assume the chart strength.</small></label><button type="button" className="dose-clear dose-redesign-clear" onClick={clearPatient}>Clear patient details</button></section>

        <section className={`dose-redesign-result ${result ? "ready" : ""}`}><div className="dose-result-heading"><div><span>3 · Live result</span><h3>{result ? "Review before administration" : "Your patient-specific dose will appear here"}</h3></div><b>{result ? <><Check size={13} /> Ready</> : "Waiting"}</b></div>{result ? <><div className="dose-redesign-result-main"><small>Patient-specific amount</small><strong>{result.calculatedAmount ?? result.dose}</strong><span>{result.dose}</span></div><div className="dose-redesign-result-facts"><div><small>How often</small><b>{result.frequency}</b></div><div><small>Route</small><b>{result.route ?? "Per protocol"}</b></div>{result.volume && <div><small>Draw up</small><b>{result.volume}</b></div>}</div></> : <div className="dose-result-placeholder"><Info size={18} /><p>Enter current weight and age. The calculation updates immediately as you type.</p></div>}<div className="dose-redesign-safety"><ShieldAlert size={14} /><span>{result?.caution ?? "Verify indication, age band, renal/hepatic function, maximum dose and product concentration."}</span></div></section>

        <details className="dose-reference-drawer dose-redesign-reference" open><summary>Chart reference <span>{drug.regimens.length} rows · {drug.name}</span></summary><PediatricReferenceTable drug={drug} /></details>
      </main>
    </div>
  </div>;
}
