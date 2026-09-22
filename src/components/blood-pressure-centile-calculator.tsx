"use client";

import { ExternalLink, Info, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import {
  calculateNeonatalBp,
  calculatePediatricBp,
  calculatePmaBp,
  NEONATAL_PMA_BP_CENTILES,
  type AapSex,
  type BpClassification,
  type BpMode,
  type BpResult,
  type BpThresholds,
  type NeonatalDay,
} from "@/lib/bpCentiles";

const MODES: { key: BpMode; label: string; detail: string }[] = [
  { key: "pma", label: "NICU PCA / PMA", detail: "26–44 wk postconceptional" },
  { key: "preterm", label: "Preterm (GA/PNA)", detail: "32–36 wk at birth" },
  { key: "neonate", label: "Term (GA/PNA)", detail: "37–40 wk at birth" },
  { key: "pediatrics", label: "Pediatrics", detail: "1–17 completed y" },
];

const CLASS_STYLE: Record<BpClassification["category"], string> = {
  belowReference: "bp-level-low",
  normal: "bp-level-normal",
  elevated: "bp-level-elevated",
  stage1: "bp-level-stage1",
  stage2: "bp-level-stage2",
};

function NumericInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  hint?: string;
}) {
  return (
    <label className="bp-field" htmlFor={id}>
      <span>{label}</span>
      <div className="bp-input-wrap"><input id={id} type="number" inputMode="decimal" value={value} min={min} max={max} step={step} placeholder="Enter" onChange={(event) => onChange(event.target.value)} /><b>{unit}</b></div>
      <small>{hint ?? `${min}–${max}`}</small>
    </label>
  );
}

function formatValue(value: number | null): string {
  return value == null ? "Not reported" : `${value} mmHg`;
}


function PmaReferenceTable({ pma }: { pma: number }) {
  const row = NEONATAL_PMA_BP_CENTILES[pma];
  if (!row) return null;
  return (
    <div className="bp-table-wrap">
      <table className="bp-threshold-table">
        <caption>NICU Blood Pressure Reference (PCA {pma} Weeks)</caption>
        <thead>
          <tr>
            <th>Percentile</th>
            <th>SBP (mmHg)</th>
            <th>DBP (mmHg)</th>
            <th>MAP (mmHg)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">50th Percentile <small>Median</small></th>
            <td>{row.p50.sbp}</td>
            <td>{row.p50.dbp}</td>
            <td>{row.p50.map}</td>
          </tr>
          <tr>
            <th scope="row">95th Percentile <small>Hypertension threshold</small></th>
            <td>{row.p95.sbp}</td>
            <td>{row.p95.dbp}</td>
            <td>{row.p95.map}</td>
          </tr>
          <tr>
            <th scope="row">99th Percentile <small>Severe elevation</small></th>
            <td>{row.p99.sbp}</td>
            <td>{row.p99.dbp}</td>
            <td>{row.p99.map}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ThresholdTable({ thresholds, neonatal }: { thresholds: { sbp: BpThresholds; dbp: BpThresholds }; neonatal: boolean }) {
  const rows: { label: string; key: keyof BpThresholds; note?: string }[] = [
    { label: "5th centile", key: "p5", note: neonatal ? "status-wide" : "not in AAP table" },
    { label: "50th centile", key: "p50" },
    { label: "90th centile", key: "p90" },
    { label: "95th centile", key: "p95" },
    { label: "95th + 12 mmHg", key: "p95Plus12", note: neonatal ? "not a neonatal standard" : "AAP stage 2 boundary" },
  ];
  return (
    <div className="bp-table-wrap">
      <table className="bp-threshold-table">
        <caption>{neonatal ? "Reference centiles (Indian neonatal study)" : "AAP 2017 reference centiles"}</caption>
        <thead><tr><th>Reference</th><th>SBP</th><th>DBP</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.label}><th scope="row">{row.label}{row.note && <small>{row.note}</small>}</th><td>{formatValue(thresholds.sbp[row.key])}</td><td>{formatValue(thresholds.dbp[row.key])}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ClassificationCard({ label, classification, observed }: { label: string; classification: BpClassification; observed: number }) {
  return <div className={`bp-classification-card ${CLASS_STYLE[classification.category]}`}><div><span>{label}</span><b>{classification.label}</b></div><strong>{observed} <small>mmHg</small></strong><p>{classification.note}</p></div>;
}

function EvidencePanel({ mode }: { mode: BpMode }) {
  return (
    <details className="bp-evidence quiet" aria-labelledby="bp-evidence-heading">
      <summary id="bp-evidence-heading"><Info size={16} /> Evidence &amp; provenance</summary>
      <div className="bp-source-grid">
        <div className="bp-source-card"><b>NICU Reference Chart</b><span>Postconceptional Age 26–44 wk (50th, 95th, 99th centiles for SBP, DBP, MAP)</span></div>
        <a href="https://publications.aap.org/pediatrics/article/140/3/e20171904/38358/Clinical-Practice-Guideline-for-Screening-and" target="_blank" rel="noopener noreferrer"><b>AAP 2017</b><span>Tables 4–5, normal-weight children</span><ExternalLink size={12} /></a>
        <a href="https://www.indianpediatrics.net/aug2015/aug-669-673.htm" target="_blank" rel="noopener noreferrer"><b>IAP context / Indian Pediatrics neonatal data</b><span>Samanta et al. 2015, Indian neonates</span><ExternalLink size={12} /></a>
        <a href="https://indianpediatrics.net/nov2015/939.pdf" target="_blank" rel="noopener noreferrer"><b>Indian paediatric comparison</b><span>Narang et al. 2015, Indian schoolchildren</span><ExternalLink size={12} /></a>
        <a href="https://www.nccwebsite.org/content/documents/courses/Neonatal%20BP%20standards-1.pdf" target="_blank" rel="noopener noreferrer"><b>NNF / neonatal standards context</b><span>No universal NNF centile table is claimed</span><ExternalLink size={12} /></a>
        <div className="bp-source-card"><b>Standard textbook context</b><span>Serial measurements and perfusion correlation</span></div>
      </div>
      <p className="bp-evidence-note">BP is a trend and perfusion marker, not a stand-alone diagnosis. {mode === "pediatrics" ? "AAP classification here; local IAP guidance may differ." : "Reference comparison only — not a treatment threshold."}</p>
    </details>
  );
}

export function BloodPressureCentileCalculator() {
  const [mode, setMode] = useState<BpMode>("pma");
  const [sex, setSex] = useState<AapSex>("male");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [gestation, setGestation] = useState("");
  const [postnatalDay, setPostnatalDay] = useState<NeonatalDay>(4);
  const [sbp, setSbp] = useState("");
  const [dbp, setDbp] = useState("");

  const result = useMemo<BpResult | null>(() => {
    const systolic = Number(sbp);
    const diastolic = Number(dbp);
    if (!sbp || !dbp || !Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
    try {
      if (mode === "pma") {
        if (!gestation) return null;
        return calculatePmaBp({ pmaWeeks: Number(gestation), sbp: systolic, dbp: diastolic });
      }
      if (mode === "pediatrics") {
        if (!age || !height) return null;
        return calculatePediatricBp({ sex, ageYears: Number(age), heightCm: Number(height), sbp: systolic, dbp: diastolic });
      }
      if (!gestation) return null;
      return calculateNeonatalBp({ mode, sex, gestationalAgeWeeks: Number(gestation), postnatalDay, sbp: systolic, dbp: diastolic });
    } catch {
      return null;
    }
  }, [age, dbp, gestation, height, mode, postnatalDay, sbp, sex]);

  const validation = useMemo(() => {
    const messages: string[] = [];
    if (mode === "pediatrics") {
      if (age && (!Number.isInteger(Number(age)) || Number(age) < 1 || Number(age) > 17)) messages.push("AAP age is a completed year from 1–17.");
      if (height && (Number(height) < 70 || Number(height) > 200)) messages.push("Height must be 70–200 cm.");
    } else if (mode === "pma") {
      if (gestation && (!Number.isInteger(Number(gestation)) || Number(gestation) < 26 || Number(gestation) > 44)) {
        messages.push("Postconceptional age must be 26–44 weeks (even weeks: 26, 28... 44).");
      }
    } else {
      const min = mode === "preterm" ? 32 : 37;
      const max = mode === "preterm" ? 36 : 40;
      if (gestation && (!Number.isInteger(Number(gestation)) || Number(gestation) < min || Number(gestation) > max)) messages.push(`${mode === "preterm" ? "Preterm" : "Term"} gestation must be ${min}–${max} weeks.`);
    }
    const sbpMax = mode === "pediatrics" ? 220 : 160;
    const dbpMax = mode === "pediatrics" ? 140 : 120;
    const sbpMin = mode === "pediatrics" ? 40 : 20;
    const dbpMin = mode === "pediatrics" ? 20 : 10;
    if (sbp && (Number(sbp) < sbpMin || Number(sbp) > sbpMax)) messages.push(`SBP must be ${sbpMin}–${sbpMax} mmHg for this mode.`);
    if (dbp && (Number(dbp) < dbpMin || Number(dbp) > dbpMax)) messages.push(`DBP must be ${dbpMin}–${dbpMax} mmHg for this mode.`);
    return messages;
  }, [age, dbp, gestation, height, mode, sbp]);

  const reset = () => { setAge(""); setHeight(""); setGestation(""); setSbp(""); setDbp(""); setPostnatalDay(4); };
  const neonatal = mode !== "pediatrics";
  const thresholdResult = result?.thresholds;
  const resultHeading = result
    ? result.mode === "pma"
      ? `NICU Reference Chart at ${result.pmaWeeks} weeks Postconceptional Age`
      : result.mode === "pediatrics"
        ? `AAP reference at ${result.ageYears} y, ${result.heightCm} cm`
        : `${result.mode === "preterm" ? "Preterm" : "Term neonate"} reference at ${result.gestationalAgeWeeks} wk, PNA day ${result.postnatalDay}`
    : "";
  const resultTiming = result
    ? result.mode === "pma"
      ? `Reference values mapped to PCA ${result.pmaWeeks} weeks (50th, 95th, 99th percentiles for SBP, DBP, MAP).`
      : result.mode === "pediatrics"
        ? `Measured height was mapped to the nearest AAP height column: ${result.heightPercentile}th height percentile (${result.heightReferenceCm} cm reference).`
        : `PMA approximately ${result.postmenstrualAgeWeeks} weeks, derived from birth gestation plus postnatal age.`
    : "";

  return (
    <div className="bp-calculator-panel">
      <div className="bp-intro"><div><span className="bp-kicker">Mode-specific blood pressure centiles</span><h3>Reference population</h3><p>SBP and DBP are classified independently.</p></div><span className="bp-safety-chip"><ShieldAlert size={14} /> Not a diagnosis</span></div>

      <div className="bp-mode-switch" role="tablist" aria-label="Blood pressure reference mode">
        {MODES.map((item) => <button type="button" key={item.key} role="tab" aria-selected={mode === item.key} className={mode === item.key ? "active" : ""} onClick={() => { setMode(item.key); reset(); }}><b>{item.label}</b><small>{item.detail}</small></button>)}
      </div>

      <div className="bp-input-section">
        <div className="bp-section-heading"><div><span>1 · Patient and timing</span><h4>{neonatal ? "Gestation and age" : "Sex, age and height"}</h4></div></div>
        <div className="bp-input-grid">
          <fieldset className="bp-fieldset"><legend>Sex</legend><div className="bp-sex-buttons"><button type="button" className={sex === "male" ? "active" : ""} onClick={() => setSex("male")}>Male</button><button type="button" className={sex === "female" ? "active" : ""} onClick={() => setSex("female")}>Female</button></div><small>{neonatal ? "No significant sex difference in the source" : "Sex-specific AAP table"}</small></fieldset>
          {mode === "pma" ? (
            <div className="sm:col-span-2">
              <label className="bp-field" htmlFor="bp-pma-select">
                <span>Postconceptional Age (weeks)</span>
                <div className="bp-input-wrap">
                  <select
                    id="bp-pma-select"
                    value={gestation}
                    onChange={(e) => setGestation(e.target.value)}
                  >
                    <option value="">Select PMA</option>
                    {[44, 42, 40, 38, 36, 34, 32, 30, 28, 26].map((w) => (
                      <option key={w} value={w}>{w} weeks</option>
                    ))}
                  </select>
                  <b>PCA</b>
                </div>
                <small>NICU reference chart: 26 to 44 weeks</small>
              </label>
            </div>
          ) : mode === "pediatrics" ? (
            <><NumericInput id="bp-age" label="Age (completed years)" value={age} onChange={setAge} min={1} max={17} unit="years" hint="AAP tables: 1–17" /><NumericInput id="bp-height" label="Measured height" value={height} onChange={setHeight} min={70} max={200} step={0.1} unit="cm" hint="Nearest AAP height column is selected" /></>
          ) : (
            <><NumericInput id="bp-ga" label="Gestational age at birth" value={gestation} onChange={setGestation} min={mode === "preterm" ? 32 : 37} max={mode === "preterm" ? 36 : 40} unit="weeks" hint={mode === "preterm" ? "Reference: 32–36 wk" : "Reference: 37–40 wk"} /><label className="bp-field" htmlFor="bp-pna"><span>Postnatal day</span><div className="bp-input-wrap"><select id="bp-pna" value={postnatalDay} onChange={(event) => setPostnatalDay(Number(event.target.value) as NeonatalDay)}><option value={4}>Day 4</option><option value={7}>Day 7</option><option value={14}>Day 14</option></select><b>PNA</b></div><small>Days 4, 7 and 14 only</small></label></>
          )}
        </div>
        <div className="bp-section-heading bp-measure-heading"><div><span>2 · Measured blood pressure</span><h4>Measured BP</h4></div></div>
        <div className="bp-input-grid bp-measure-grid"><NumericInput id="bp-sbp" label="Systolic BP" value={sbp} onChange={setSbp} min={neonatal ? 20 : 40} max={neonatal ? 160 : 220} unit="mmHg" hint="Measured SBP" /><NumericInput id="bp-dbp" label="Diastolic BP" value={dbp} onChange={setDbp} min={neonatal ? 10 : 20} max={neonatal ? 120 : 140} unit="mmHg" hint="Measured DBP" /><button type="button" className="bp-reset" onClick={reset} disabled={!age && !height && !gestation && !sbp && !dbp}>Clear entries</button></div>
        {validation.length > 0 && <div className="bp-validation" role="alert">{validation.map((message) => <span key={message}>{message}</span>)}</div>}
      </div>

      {result && thresholdResult ? <section className="bp-results" aria-live="polite"><div className="bp-results-heading"><div><span>3 · Thresholds and interpretation</span><h4>{resultHeading}</h4></div><span className={`bp-overall-badge ${CLASS_STYLE[result.classification.overall.category]}`}>Highest category: {result.classification.overall.label}</span></div><div className="bp-observed-grid"><ClassificationCard label="Systolic" classification={result.classification.sbp} observed={Number(sbp)} /><ClassificationCard label="Diastolic" classification={result.classification.dbp} observed={Number(dbp)} /></div>{result.mode === "pma" ? <PmaReferenceTable pma={result.pmaWeeks} /> : <ThresholdTable thresholds={thresholdResult} neonatal={neonatal} />}<div className="bp-result-notes"><p><b>Reference timing:</b> {resultTiming}</p><p><b>Interpretation:</b> {result.sourceNote}</p></div></section> : <div className="bp-empty-result"><Info size={17} /><span>Enter the patient details and both BP values.</span></div>}
      {mode === "pma" && !result && (
        <section className="bp-results mt-4">
          <div className="bp-results-heading">
            <div>
              <span>Reference Table</span>
              <h4>NICU Blood Pressure Chart (PCA 26–44 Weeks)</h4>
            </div>
          </div>
          <div className="bp-table-wrap">
            <table className="bp-threshold-table">
              <caption>Full NICU Reference: 50th, 95th &amp; 99th Centiles</caption>
              <thead>
                <tr>
                  <th>PCA Age</th>
                  <th>50th (SBP/DBP/MAP)</th>
                  <th>95th (SBP/DBP/MAP)</th>
                  <th className="text-rose-400 font-bold">99th (SBP/DBP/MAP)</th>
                </tr>
              </thead>
              <tbody>
                {[44, 42, 40, 38, 36, 34, 32, 30, 28, 26].map((w) => {
                  const r = NEONATAL_PMA_BP_CENTILES[w];
                  return (
                    <tr key={w} className={gestation && Number(gestation) === w ? "bg-cyan-500/15 font-bold" : ""}>
                      <th scope="row">{w} Weeks</th>
                      <td>{r.p50.sbp} / {r.p50.dbp} (MAP {r.p50.map})</td>
                      <td>{r.p95.sbp} / {r.p95.dbp} (MAP {r.p95.map})</td>
                      <td className="text-rose-300 font-semibold">{r.p99.sbp} / {r.p99.dbp} (MAP {r.p99.map})</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <details className="bp-limitations quiet"><summary><ShieldAlert size={16} /> Measurement and safety</summary><p>Use an appropriate cuff, repeat an unexpectedly high or low value, and correlate with perfusion, symptoms, illness and treatment. Neonatal values are population references from a selected study—not universally diagnostic “normal BP”; hypotension/hypertension decisions require clinical correlation and local protocol. The bedside rule “MAP ≈ gestational age” is not used as a centile substitute.</p></details>
      <EvidencePanel mode={mode} />
    </div>
  );
}
