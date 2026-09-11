"use client";

import { Info, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
  calculatePediatricDose,
  getPediatricDrug,
  PEDIATRIC_DRUG_GROUPS,
  PEDIATRIC_DRUGS,
  type PediatricDrug,
  type PediatricDrugGroup,
} from "@/lib/pediatric-dosing";

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
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter"
        />
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
        <thead>
          <tr>
            <th>Condition / age</th>
            <th>Dose and schedule</th>
          </tr>
        </thead>
        <tbody>
          {drug.regimens.map((row) => (
            <tr key={`${row.condition}-${row.regimen}`}>
              <th>{row.condition}</th>
              <td>{row.regimen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PediatricDrugDoses() {
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
  const filteredDrugs = useMemo(() => {
    const query = drugQuery.trim().toLowerCase();
    if (!query) return visibleDrugs;
    return visibleDrugs.filter((item) => item.name.toLowerCase().includes(query));
  }, [drugQuery, visibleDrugs]);

  const weightKg = Number(weight);
  const ageYears = Number(age);
  const heightCm = Number(height);
  const strengthValue = Number(strength);
  const canCalculate = weightKg > 0 && age !== "";
  const result = useMemo(
    () => canCalculate
      ? calculatePediatricDose(
          drug,
          {
            weightKg,
            ageYears,
            heightCm: heightCm > 0 ? heightCm : undefined,
            strength: strengthValue > 0 ? strengthValue : undefined,
          },
          regimenIndex,
        )
      : null,
    [ageYears, canCalculate, drug, heightCm, regimenIndex, strengthValue, weightKg],
  );

  const chooseDrug = (id: string) => {
    const next = getPediatricDrug(id);
    setDrugId(id);
    setRegimenIndex(0);
    setStrength(next.defaultStrength?.toString() ?? "");
  };

  const chooseGroup = (next: PediatricDrugGroup) => {
    const first = PEDIATRIC_DRUGS.find((item) => item.group === next);
    setGroup(next);
    setDrugQuery("");
    if (first) chooseDrug(first.id);
  };

  const clear = () => {
    setWeight("");
    setAge("");
    setHeight("");
    setStrength(drug.defaultStrength?.toString() ?? "");
  };

  return (
    <div className="dose-workspace pediatric-dose-workspace">
      <section className="dose-hero">
        <div>
          <span className="dose-kicker">Paediatric dose chart · 2025</span>
          <h1>Find a dose in three steps</h1>
          <p>
            Choose the medicine, choose the matching chart row, then enter the child&apos;s
            measurements. The chart stays visible beside the calculation so you can check
            the source row before use.
          </p>
        </div>
        <span className="dose-safety"><ShieldAlert size={15} /> Clinician verification required</span>
      </section>

      <ol className="dose-howto" aria-label="How to use the paediatric dose tool">
        <li><b>1</b><span><strong>Choose medicine</strong><small>Search within a category</small></span></li>
        <li><b>2</b><span><strong>Choose chart row</strong><small>Match indication and age</small></span></li>
        <li><b>3</b><span><strong>Enter patient details</strong><small>Review dose and volume</small></span></li>
      </ol>

      <section className="dose-card dose-picker-card">
        <div className="dose-card-heading">
          <div>
            <span>Step 1 · Medicine</span>
            <h2>What are you giving?</h2>
          </div>
          <small>{PEDIATRIC_DRUGS.length} medicines in the chart</small>
        </div>
        <div className="dose-picker-grid">
          <label className="dose-select-field">
            <span>Medicine category</span>
            <select value={group} onChange={(event) => chooseGroup(event.target.value as PediatricDrugGroup)}>
              {PEDIATRIC_DRUG_GROUPS.map((item) => (
                <option value={item} key={item}>
                  {item} ({PEDIATRIC_DRUGS.filter((drugItem) => drugItem.group === item).length})
                </option>
              ))}
            </select>
            <small>Use the category to narrow the list.</small>
          </label>
          <label className="dose-search-field">
            <span>Search medicine</span>
            <div>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={drugQuery}
                onChange={(event) => setDrugQuery(event.target.value)}
                placeholder="Type a medicine name"
                aria-label="Search paediatric medicines"
              />
            </div>
            <small>{filteredDrugs.length} result{filteredDrugs.length === 1 ? "" : "s"} in this category</small>
          </label>
        </div>
        <div className="dose-medicine-list" aria-label="Medicines in selected category">
          {filteredDrugs.length > 0 ? filteredDrugs.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === drugId ? "active" : ""}
              aria-pressed={item.id === drugId}
              onClick={() => chooseDrug(item.id)}
            >
              <b>{item.name}</b>
              <small>{item.regimens.length} chart row{item.regimens.length === 1 ? "" : "s"}</small>
            </button>
          )) : <p className="dose-empty-search">No medicine matches that search. Try another name or category.</p>}
        </div>
      </section>

      <div className="dose-main-grid">
        <section className="dose-card dose-input-card">
          <div className="dose-card-heading">
            <div>
              <span>Step 2 · Chart row</span>
              <h2>{drug.name}</h2>
            </div>
          </div>
          <label className="dose-select-field">
            <span>Clinical indication / age row</span>
            <select value={regimenIndex} onChange={(event) => setRegimenIndex(Number(event.target.value))}>
              {drug.regimens.map((item, index) => (
                <option value={index} key={`${item.condition}-${index}`}>
                  {item.condition} — {item.regimen}
                </option>
              ))}
            </select>
            <small>Choose the row that matches the child. Do not use the first row automatically.</small>
          </label>

          <div className="dose-card-heading dose-subheading">
            <div>
              <span>Step 3 · Patient details</span>
              <h2>Enter only what the calculation needs</h2>
            </div>
          </div>
          <div className="dose-input-grid">
            <NumericField label="Current weight" value={weight} onChange={setWeight} unit="kg" min={0.4} max={200} step={0.01} hint="Required · current dosing weight" />
            <NumericField label="Age" value={age} onChange={setAge} unit="years" min={0} max={18} step={0.1} hint="Required · use 0.5 for 6 months" />
            <NumericField label="Height" value={height} onChange={setHeight} unit="cm" min={30} max={220} step={0.1} hint="Only needed for mg/m² rows" />
          </div>

          <div className="dose-card-heading dose-subheading">
            <div>
              <span>Optional · Product strength</span>
              <h2>Get a volume to draw up</h2>
            </div>
          </div>
          <label className="dose-strength-field">
            <span>Available strength / concentration {drug.strengthUnit ? `(${drug.strengthUnit})` : ""}</span>
            <div>
              <input type="number" inputMode="decimal" min={0} step="any" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="Enter product strength" />
              <b>{drug.strengthUnit ?? "product-specific"}</b>
            </div>
            <small>Read the exact concentration from the vial, ampoule or bottle. Never assume the chart strength is the product strength.</small>
          </label>
          <button type="button" className="dose-clear" onClick={clear}>Clear patient details</button>
        </section>

        <section className="dose-card dose-result-card">
          <div className="dose-card-heading">
            <div>
              <span>Review · Calculation</span>
              <h2>{drug.name}</h2>
            </div>
            <span className={result ? "dose-status ready" : "dose-status"}>{result ? "Ready to review" : "Needs weight and age"}</span>
          </div>
          {result ? (
            <>
              <div className="dose-result-banner">
                <div>
                  <small>Patient amount</small>
                  <strong>{result.calculatedAmount ?? result.dose}</strong>
                  <span>{result.dose}</span>
                </div>
                <div>
                  <small>Timing and route</small>
                  <strong>{result.frequency}</strong>
                  <span>{result.route ?? "Route per protocol"}</span>
                </div>
              </div>
              {result.volume && <div className="dose-volume"><span>Using entered product strength</span><b>{result.volume}</b></div>}
              <dl className="dose-result-list">
                <div><dt>Matched row</dt><dd>{result.rule}</dd></div>
                <div><dt>Safety check</dt><dd>{result.caution}</dd></div>
              </dl>
            </>
          ) : (
            <div className="dose-awaiting">
              <Info size={22} />
              <p>Enter the child&apos;s current weight and age to calculate. Height is needed only when the selected row uses body surface area.</p>
            </div>
          )}
          <div className="dose-divider" />
          <PediatricReferenceTable drug={drug} />
        </section>
      </div>

      <details className="dose-catalog">
        <summary><span><b>Browse the complete paediatric chart</b><small>Open only when you need another medicine or to scan all entries</small></span><strong>{PEDIATRIC_DRUGS.length} medicines</strong></summary>
        <div className="dose-catalog-grid">
          {PEDIATRIC_DRUGS.map((item) => (
            <button type="button" className={`dose-catalog-item ${item.id === drugId ? "active" : ""}`} key={item.id} onClick={() => { setGroup(item.group); setDrugQuery(""); chooseDrug(item.id); }}>
              <b>{item.name}</b>
              <small>{item.group} · {item.regimens[0]?.regimen}</small>
            </button>
          ))}
        </div>
      </details>

      <div className="dose-disclaimer">
        <ShieldAlert size={17} />
        <p><b>Clinical safety:</b> These entries are a transcription and calculation aid from the supplied Department of Clinical Pharmacy 2025 images, not an independent prescribing protocol. Confirm indication, age/weight band, renal/hepatic function, allergy status, maximum dose, dilution, route, interactions, local antimicrobial policy and current pharmacy guidance. Complex indication-specific rows, emergency medicines and high-risk doses require senior clinician/pharmacist verification before administration.</p>
      </div>
    </div>
  );
}
