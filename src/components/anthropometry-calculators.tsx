"use client";

import { ExternalLink, Plus, RotateCcw, Ruler, Sparkles, Stethoscope, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  assess,
  classifyIapBmi,
  getLms,
  midParentalHeight,
  percentileLabel,
  percentileToZ,
  sourceFor,
  type AnthropometryMetric,
  type AnthropometryPoint,
  type AnthropometrySex,
  type Assessment,
  type ReferenceVersion,
  valueFromLms,
} from "@/lib/anthropometry";

const TONE: Record<string, string> = {
  good: "border-emerald-400/35 bg-emerald-400/10 text-emerald-100",
  info: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  crit: "border-rose-400/45 bg-rose-500/15 text-rose-100",
};

const CARD_DEFS = [
  { id: "who", title: "WHO Growth Charts (0–5 years)", subtitle: "Weight, length/height, head circumference, weight-for-length/height and BMI", citation: "WHO Child Growth Standards, 2006" },
  { id: "iap", title: "IAP 2015 Growth Charts (5–18 years)", subtitle: "Height, weight and BMI with 23 / 27 kg/m² adult-equivalent cut-offs", citation: "Indian Pediatr. 2015;52:47–55" },
  { id: "combined", title: "Combined WHO–IAP Height & Weight Chart (0–18 years)", subtitle: "A single continuous view across the WHO/IAP transition", citation: "WHO 2006 + IAP 2015" },
  { id: "mph", title: "Mid-Parental Height (MPH) Calculator", subtitle: "Target height and provisional percentile on the combined chart", citation: "Mid-parental height clinical method" },
  { id: "bmi-quick", title: "BMI Quick Screening Tool (8–18 years)", subtitle: "Enter height and weight; no BMI field or separate calculation button", citation: "IAP 2015 BMI quick-screen approach" },
  { id: "fenton2013", title: "Fenton 2013 Preterm Growth Chart", subtitle: "Weight, length and head circumference · 22–50 weeks PMA", citation: "Fenton & Kim. BMC Pediatr. 2013;13:59" },
  { id: "fenton2025", title: "Fenton 2025 Third-Generation Preterm Chart", subtitle: "Separate 2025 reference · 22–50 weeks corrected age", citation: "Fenton, Elmrayed & Alshaikh. PPE. 2025" },
] as const;

type CardId = typeof CARD_DEFS[number]["id"];

type CardProps = {
  id: CardId;
  title: string;
  subtitle: string;
  citation: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

export function AnthropometrySection({ query = "" }: { query?: string }) {
  const needle = query.trim().toLowerCase();
  const visible = CARD_DEFS.filter((c) => !needle || `${c.title} ${c.subtitle} ${c.citation} anthropometry growth fenton who iap bmi`.toLowerCase().includes(needle));
  if (!visible.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black text-cyan-300"><Ruler size={15} /> Anthropometry</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">Live pediatric growth assessment from birth to 18 years, including separate NICU/preterm references. All plotted interpretations are provisional and are not a diagnosis.</p>
        </div>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1 text-[10px] font-bold text-cyan-200">{visible.length} tools · live plot</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {visible.map((card) => (
          <AnthroCard key={card.id} {...card} defaultOpen={card.id === "who"}>
            {card.id === "who" && <WhoTool />}
            {card.id === "iap" && <IapTool />}
            {card.id === "combined" && <CombinedTool />}
            {card.id === "mph" && <MphTool />}
            {card.id === "bmi-quick" && <BmiQuickTool />}
            {card.id === "fenton2013" && <FentonTool version="fenton2013" />}
            {card.id === "fenton2025" && <FentonTool version="fenton2025" />}
          </AnthroCard>
        ))}
      </div>
    </section>
  );
}

function AnthroCard({ title, subtitle, citation, children, defaultOpen = false }: CardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <article className="card overflow-hidden">
      <button type="button" className="flex min-h-[78px] w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${open ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/5 text-slate-400"}`}><Ruler size={17} /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-black text-white">{title}</span><span className="mt-1 block text-[11px] leading-snug text-slate-400">{subtitle}</span></span>
        <span className="hidden shrink-0 text-[10px] font-bold text-slate-500 sm:block">{open ? "Collapse" : "Open"}</span>
      </button>
      {open && <div className="border-t border-white/10 px-3 pb-4 pt-3 sm:px-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/5 px-3 py-2"><span className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-200"><Sparkles size={13} /> Live LMS chart · auto-plots when data is available</span><span className="text-[10px] text-slate-400">{citation}</span></div>{children}</div>}
    </article>
  );
}

function Field({ label, value, onChange, unit, min, max, step = 1, placeholder }: { label: string; value: number | string; onChange: (v: number) => void; unit?: string; min?: number; max?: number; step?: number; placeholder?: string }) {
  return <label className="block rounded-xl border border-cyan-400/10 bg-slate-950/35 p-2.5"><span className="lbl mb-1 block">{label}</span><div className="flex items-center gap-1.5"><input className="inp !min-h-[38px] !border-cyan-400/10 !bg-slate-950/70 !py-1.5 text-sm font-bold" type="number" inputMode="decimal" value={value} min={min} max={max} step={step} placeholder={placeholder} onChange={(e) => onChange(Number(e.target.value))} />{unit && <span className="shrink-0 text-[10px] text-slate-500">{unit}</span>}</div></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <label className="block rounded-xl border border-cyan-400/10 bg-slate-950/35 p-2.5"><span className="lbl mb-1 block">{label}</span><select className="inp !min-h-[38px] !border-cyan-400/10 !bg-slate-950/70 !py-1.5 text-sm font-semibold" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}

function ActionButton({ children, onClick, tone = "ghost" }: { children: React.ReactNode; onClick: () => void; tone?: "ghost" | "primary" }) {
  return <button type="button" className={tone === "primary" ? "btn-primary !px-3 !py-1.5 text-xs" : "btn-ghost !px-3 !py-1.5 text-xs"} onClick={onClick}>{children}</button>;
}

function ToolShell({ children, source, note }: { children: React.ReactNode; source: ReferenceVersion; note?: string }) {
  const src = sourceFor(source);
  const unavailable = source === "iap" || source === "fenton2013" || source === "fenton2025";
  return <div className="space-y-3"><div className="text-xs leading-relaxed text-slate-400">{note ?? "Enter the required values. The point and provisional interpretation update immediately."}</div>{unavailable && <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100"><b>Unavailable-data safeguard:</b> the original {src.label} LMS/reference release is not bundled yet. This tool stays visible for workflow review but will not calculate or classify from approximate, traced, or substituted data.</div>}{children}<SourceFooter source={source} src={src} /></div>;
}

function SourceFooter({ source, src }: { source: ReferenceVersion; src: ReturnType<typeof sourceFor> }) {
  return <div className="flex flex-wrap items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-slate-400"><Stethoscope size={12} className="mt-0.5 shrink-0 text-cyan-300" /><span className="min-w-0 flex-1"><b className="text-slate-200">Reference active: {src.label}</b><br />{src.citation}{source === "fenton2025" && <><br /><b className="text-amber-200">Fenton 2025 is not interchangeable with Fenton 2013.</b></>}</span><a href={src.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-cyan-300 hover:text-cyan-100"><ExternalLink size={11} /> Source</a></div>;
}

function AssessmentBox({ result, unit = "" }: { result: Assessment; unit?: string }) {
  if (!result.available) return <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">{result.interpretation}</div>;
  return <div className={`rounded-xl border p-3 ${TONE[result.severity]}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-75">Provisional interpretation</div><div className="mt-0.5 text-sm font-black">{result.interpretation}</div></div><div className="text-right"><div className="text-lg font-black tabular-nums">z {result.z.toFixed(2)}</div><div className="text-[11px] font-bold">{percentileLabel(result.percentile)} percentile</div></div></div><div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold"><span className="rounded-full border border-current/20 bg-black/10 px-2 py-1">{result.band}</span><span className="rounded-full border border-current/20 bg-black/10 px-2 py-1">{result.lms ? `L ${result.lms.L.toFixed(3)} · M ${result.lms.M.toFixed(2)}${unit ? ` ${unit}` : ""} · S ${result.lms.S.toFixed(3)}` : "LMS unavailable"}</span></div><div className="mt-2 text-[10px] opacity-80">Provisional decision support only — not a diagnosis.</div></div>;
}

function HologramChart({ version, metric, sex, age, value, points = [], minAge = 0, maxAge, ageUnit, label, convertAge = (x: number) => x, convertPointAge = (x: number) => x }: { version: ReferenceVersion; metric: AnthropometryMetric; sex: AnthropometrySex; age: number; value: number; points?: AnthropometryPoint[]; minAge?: number; maxAge: number; ageUnit: string; label: string; convertAge?: (x: number) => number; convertPointAge?: (x: number) => number }) {
  const width = 820;
  const height = 330;
  const pad = { l: 52, r: 22, t: 18, b: 42 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const span = Math.max(0.001, maxAge - minAge);
  const currentAge = Math.max(minAge, Math.min(maxAge, Number.isFinite(age) ? age : minAge));
  const x = (v: number) => pad.l + ((Math.max(minAge, Math.min(maxAge, v)) - minAge) / span) * innerW;
  const lmsAt = (xAge: number, z: number) => { const lms = getLms(version, sex, metric, convertAge(xAge)); return lms ? valueFromLms(z, lms) : NaN; };
  const currentLms = getLms(version, sex, metric, convertAge(currentAge));
  const curveValues = [lmsAt(currentAge, -2), lmsAt(currentAge, 0), lmsAt(currentAge, 2)].filter(Number.isFinite) as number[];
  const allValues = [...curveValues, value || 0, ...points.map((p) => p.value)].filter((n) => n > 0);
  const minY = allValues.length ? Math.max(0, Math.min(...allValues) * 0.72) : 0;
  const maxY = allValues.length ? Math.max(...allValues) * 1.18 : 10;
  const y = (v: number) => pad.t + innerH - ((Math.max(minY, Math.min(maxY, v)) - minY) / Math.max(0.001, maxY - minY)) * innerH;
  const pathFor = (z: number) => Array.from({ length: 41 }, (_, i) => { const a = minAge + (span * i) / 40; const v = lmsAt(a, z); return Number.isFinite(v) ? `${i === 0 ? "M" : "L"}${x(a).toFixed(1)},${y(v).toFixed(1)}` : ""; }).join(" ");
  const currentPoint = value > 0 && currentLms ? { cx: x(currentAge), cy: y(value) } : null;
  return <div className="anthro-hologram overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-2 shadow-[0_0_55px_rgba(34,211,238,0.08)]"><div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1"><div><div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-200">{label}</div><div className="text-[10px] text-slate-500">Glow curves = −2 SD · median · +2 SD</div></div><span className="rounded-full border border-cyan-400/15 bg-cyan-400/5 px-2 py-1 text-[10px] text-cyan-100">{ageUnit} axis · pan/scroll</span></div><div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] w-full" role="img" aria-label={`${label} holographic growth chart`}><defs><linearGradient id={`grid-${version}-${metric}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity=".09" /><stop offset=".5" stopColor="#6366f1" stopOpacity=".04" /><stop offset="1" stopColor="#f59e0b" stopOpacity=".09" /></linearGradient><filter id={`blur-${version}-${metric}`}><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs><rect width={width} height={height} rx="12" fill={`url(#grid-${version}-${metric})`} /><rect x={pad.l} y={pad.t} width={innerW} height={innerH} fill="rgba(2,6,23,.52)" />{[0, .25, .5, .75, 1].map((f) => <line key={`h-${f}`} x1={pad.l} x2={width - pad.r} y1={pad.t + innerH * f} y2={pad.t + innerH * f} stroke="rgba(103,232,249,.12)" />)}{[0, .25, .5, .75, 1].map((f) => <line key={`v-${f}`} y1={pad.t} y2={height - pad.b} x1={pad.l + innerW * f} x2={pad.l + innerW * f} stroke="rgba(103,232,249,.10)" />)}<path d={pathFor(-2)} fill="none" stroke="#38bdf8" strokeWidth="3" opacity=".85" filter={`url(#blur-${version}-${metric})`} /><path d={pathFor(0)} fill="none" stroke="#c084fc" strokeWidth="3.5" filter={`url(#blur-${version}-${metric})`} /><path d={pathFor(2)} fill="none" stroke="#fbbf24" strokeWidth="3" opacity=".9" filter={`url(#blur-${version}-${metric})`} />{points.map((p) => <circle key={p.id ?? `${p.age}-${p.value}`} cx={x(convertPointAge(p.age))} cy={y(p.value)} r="4" fill="#fb7185" stroke="#fff" strokeWidth="1.5" />)}{currentPoint && <><line x1={currentPoint.cx} x2={currentPoint.cx} y1={pad.t} y2={height - pad.b} stroke="#fff" strokeOpacity=".28" strokeDasharray="4 4" /><circle cx={currentPoint.cx} cy={currentPoint.cy} r="9" fill="#22d3ee" opacity=".22" filter={`url(#blur-${version}-${metric})`} /><circle cx={currentPoint.cx} cy={currentPoint.cy} r="5" fill="#fff" stroke="#0f172a" strokeWidth="2" /></>}<text x={pad.l} y={height - 12} fill="#94a3b8" fontSize="10">{minAge}</text><text x={width - pad.r} y={height - 12} textAnchor="end" fill="#94a3b8" fontSize="10">{maxAge}</text><text x={width / 2} y={height - 11} textAnchor="middle" fill="#cbd5e1" fontSize="11">Age ({ageUnit})</text><text x="14" y={height / 2} textAnchor="middle" fill="#cbd5e1" fontSize="11" transform={`rotate(-90 14 ${height / 2})`}>{label}</text><text x={pad.l + 5} y={pad.t + 13} fill="#64748b" fontSize="10">{minY.toFixed(1)}</text><text x={pad.l + 5} y={pad.t + 25} fill="#64748b" fontSize="10">to {maxY.toFixed(1)}</text></svg></div><div className="mt-1 flex flex-wrap gap-2 px-2 text-[10px] text-slate-400"><span className="text-sky-300">● −2 SD</span><span className="text-violet-300">● median</span><span className="text-amber-300">● +2 SD</span><span className="text-rose-300">● measurements</span></div></div>;
}

function PointHistory({ points, onDelete }: { points: AnthropometryPoint[]; onDelete: (id: string) => void }) {
  if (!points.length) return null;
  return <div className="flex flex-wrap gap-1.5">{points.map((p, i) => <span key={p.id ?? i} className="inline-flex items-center gap-1 rounded-full border border-rose-400/20 bg-rose-400/5 px-2 py-1 text-[10px] text-rose-100">{p.age} · {p.value}<button type="button" aria-label="Remove measurement" onClick={() => onDelete(p.id ?? "")}><Trash2 size={10} /></button></span>)}</div>;
}

function WhoTool() {
  const [metric, setMetric] = useState<AnthropometryMetric>("weight");
  const [sex, setSex] = useState<AnthropometrySex>("m");
  const [age, setAge] = useState(1);
  const [value, setValue] = useState(10);
  const [size, setSize] = useState(75);
  const [points, setPoints] = useState<AnthropometryPoint[]>([]);
  const referenceAxis = metric === "weight_for_size" ? size : age * 12;
  const result = useMemo(() => assess(value, referenceAxis, sex, metric, "who"), [metric, referenceAxis, sex, value]);
  const unit = metric === "weight" ? "kg" : metric === "bmi" ? "kg/m²" : metric === "head_circ" ? "cm" : metric === "weight_for_size" ? "kg" : "cm";
  const metricLabel = metric === "weight" ? "Weight-for-age" : metric === "height" ? "Length/height-for-age" : metric === "head_circ" ? "Head circumference-for-age" : metric === "weight_for_size" ? "Weight-for-length/height" : "BMI-for-age";
  return <ToolShell source="who" note="WHO MGRS reference is valid from birth through 60 months. Choose the indicator, then enter the measurement; the point updates without a calculate button."><div className="grid gap-2 sm:grid-cols-2"><Select label="Indicator" value={metric} onChange={(v) => setMetric(v as AnthropometryMetric)} options={[{ value: "weight", label: "Weight-for-age" }, { value: "height", label: "Length/height-for-age" }, { value: "head_circ", label: "Head circumference-for-age" }, { value: "weight_for_size", label: "Weight-for-length/height" }, { value: "bmi", label: "BMI-for-age" }]} /><Select label="Sex" value={sex} onChange={(v) => setSex(v as AnthropometrySex)} options={[{ value: "m", label: "Boy" }, { value: "f", label: "Girl" }]} /><Field label="Age" value={age} onChange={setAge} unit="years" min={0} max={5} step={0.01} />{metric === "weight_for_size" && <Field label="Length / height" value={size} onChange={setSize} unit="cm" min={45} max={110} step={0.1} />}<Field label={metricLabel} value={value} onChange={setValue} unit={unit} min={0} step={0.01} /></div>{metric !== "weight_for_size" && <div className="flex flex-wrap gap-2"><ActionButton tone="primary" onClick={() => setPoints((p) => [...p, { id: crypto.randomUUID(), age, value, metric, sex }])}><Plus size={13} /> Add time point</ActionButton><ActionButton onClick={() => setPoints([])}><RotateCcw size={13} /> Clear trajectory</ActionButton></div>}{metric !== "weight_for_size" && <PointHistory points={points} onDelete={(id) => setPoints((p) => p.filter((x) => x.id !== id))} />}<AssessmentBox result={result} unit={unit} /><HologramChart version="who" metric={metric} sex={sex} age={referenceAxis} value={value} points={metric === "weight_for_size" ? [] : points.map((p) => ({ ...p, age: p.age * 12 }))} minAge={metric === "weight_for_size" ? 45 : 0} maxAge={metric === "weight_for_size" ? 110 : 60} ageUnit={metric === "weight_for_size" ? "cm" : "months"} label={metricLabel} /></ToolShell>;
}

function IapTool() {
  const [metric, setMetric] = useState<AnthropometryMetric>("height");
  const [sex, setSex] = useState<AnthropometrySex>("m");
  const [age, setAge] = useState(10);
  const [value, setValue] = useState(135);
  const result = useMemo(() => assess(value, age, sex, metric, "iap"), [age, metric, sex, value]);
  const unit = metric === "bmi" ? "kg/m²" : "cm";
  return <ToolShell source="iap" note="IAP 2015 covers Indian children aged 5–18 years. BMI classification keeps the published 23 and 27 kg/m² adult-equivalent lines visible."><div className="grid gap-2 sm:grid-cols-2"><Select label="Indicator" value={metric} onChange={(v) => setMetric(v as AnthropometryMetric)} options={[{ value: "height", label: "Height-for-age" }, { value: "weight", label: "Weight-for-age" }, { value: "bmi", label: "BMI-for-age" }]} /><Select label="Sex" value={sex} onChange={(v) => setSex(v as AnthropometrySex)} options={[{ value: "m", label: "Boy" }, { value: "f", label: "Girl" }]} /><Field label="Age" value={age} onChange={setAge} unit="years" min={5} max={18} step={0.1} /><Field label={metric === "height" ? "Height" : metric === "weight" ? "Weight" : "BMI"} value={value} onChange={setValue} unit={unit} min={0} step={0.1} /></div><AssessmentBox result={result} unit={unit} /><HologramChart version="iap" metric={metric} sex={sex} age={age} value={value} maxAge={18} ageUnit="years" label={metric === "height" ? "Height (cm)" : metric === "weight" ? "Weight (kg)" : "BMI (kg/m²)"} /></ToolShell>;
}

function CombinedTool() {
  const [metric, setMetric] = useState<AnthropometryMetric>("height");
  const [sex, setSex] = useState<AnthropometrySex>("m");
  const [age, setAge] = useState(8);
  const [value, setValue] = useState(125);
  const version: ReferenceVersion = age < 5 ? "who" : "iap";
  const internalAge = age < 5 ? age * 12 : age;
  const result = useMemo(() => assess(value, internalAge, sex, metric, version), [age, metric, sex, value, version]);
  return <ToolShell source="combined" note="The chart switches reference at 5 years: WHO MGRS for 0–<5 years and IAP 2015 for 5–18 years. The active standard is shown in the result footer."><div className="grid gap-2 sm:grid-cols-2"><Select label="Indicator" value={metric} onChange={(v) => setMetric(v as AnthropometryMetric)} options={[{ value: "height", label: "Height-for-age" }, { value: "weight", label: "Weight-for-age" }]} /><Select label="Sex" value={sex} onChange={(v) => setSex(v as AnthropometrySex)} options={[{ value: "m", label: "Boy" }, { value: "f", label: "Girl" }]} /><Field label="Age" value={age} onChange={setAge} unit="years" min={0} max={18} step={0.01} /><Field label={metric === "height" ? "Height" : "Weight"} value={value} onChange={setValue} unit={metric === "height" ? "cm" : "kg"} min={0} step={0.1} /></div><div className="rounded-xl border border-violet-400/20 bg-violet-400/5 px-3 py-2 text-xs text-violet-100">Active standard: <b>{version === "who" ? "WHO 2006 MGRS" : "IAP 2015"}</b> · no LMS values are combined or averaged.</div><AssessmentBox result={result} unit={metric === "height" ? "cm" : "kg"} /><HologramChart version={version} metric={metric} sex={sex} age={age} value={value} maxAge={18} ageUnit="years" label={metric === "height" ? "Height (cm)" : "Weight (kg)"} convertAge={(x) => version === "who" ? x * 12 : x} /></ToolShell>;
}

function MphTool() {
  const [father, setFather] = useState(175);
  const [mother, setMother] = useState(160);
  const [sex, setSex] = useState<AnthropometrySex>("m");
  const [age, setAge] = useState(10);
  const mph = midParentalHeight(father, mother, sex);
  const version: ReferenceVersion = age < 5 ? "who" : "iap";
  const result = useMemo(() => assess(mph, age < 5 ? age * 12 : age, sex, "height", version), [age, mph, sex, version]);
  return <ToolShell source="combined" note="Mid-parental height is a target-height estimate. The percentile is plotted against the combined WHO–IAP height reference; it is not a diagnosis of adult height potential."><div className="grid gap-2 sm:grid-cols-2"><Field label="Paternal height" value={father} onChange={setFather} unit="cm" min={100} max={230} /><Field label="Maternal height" value={mother} onChange={setMother} unit="cm" min={100} max={230} /><Select label="Sex of child" value={sex} onChange={(v) => setSex(v as AnthropometrySex)} options={[{ value: "m", label: "Boy · +13 cm" }, { value: "f", label: "Girl · −13 cm" }]} /><Field label="Plot age" value={age} onChange={setAge} unit="years" min={0} max={18} step={0.1} /></div><div className="rounded-xl border border-violet-400/30 bg-violet-400/10 p-3"><div className="text-[10px] font-black uppercase tracking-wide text-violet-200">Mid-parental height target</div><div className="mt-1 text-2xl font-black text-white">{mph.toFixed(1)} cm</div><div className="mt-1 text-xs text-violet-100">Formula: ({father} + {mother} {sex === "m" ? "+ 13" : "− 13"}) ÷ 2</div></div><AssessmentBox result={result} unit="cm" /><HologramChart version={version} metric="height" sex={sex} age={age} value={mph} maxAge={18} ageUnit="years" label="Target height (cm)" convertAge={(x) => version === "who" ? x * 12 : x} /></ToolShell>;
}

function BmiQuickTool() {
  const [sex, setSex] = useState<AnthropometrySex>("m");
  const [age, setAge] = useState(12);
  const [height, setHeight] = useState(150);
  const [weight, setWeight] = useState(45);
  const bmi = height > 0 ? weight / Math.pow(height / 100, 2) : 0;
  const result = useMemo(() => assess(bmi, age, sex, "bmi", "iap"), [age, bmi, sex]);
  const classification = result.available ? classifyIapBmi(bmi, sex, age) : { label: "Unavailable", severity: "info" as const, note: "The verified IAP LMS/reference dataset is not bundled." };
  return <ToolShell source="iap" note="Quick screening uses only height and weight entry. BMI is calculated internally and compared with the IAP 2015 age/sex reference; the child never needs to enter a BMI value."><div className="grid gap-2 sm:grid-cols-2"><Select label="Sex" value={sex} onChange={(v) => setSex(v as AnthropometrySex)} options={[{ value: "m", label: "Boy" }, { value: "f", label: "Girl" }]} /><Field label="Age" value={age} onChange={setAge} unit="years" min={8} max={18} step={0.1} /><Field label="Height" value={height} onChange={setHeight} unit="cm" min={80} max={220} step={0.1} /><Field label="Weight" value={weight} onChange={setWeight} unit="kg" min={5} max={150} step={0.1} /></div><div className="grid gap-2 sm:grid-cols-3"><div className="rounded-xl border border-slate-400/20 bg-slate-900/40 p-3"><div className="lbl">Screening result</div><div className="text-xl font-black text-white">{classification.label}</div></div><div className="rounded-xl border border-orange-400/35 bg-orange-400/10 p-3 text-orange-100"><div className="lbl">Overweight</div><div className="text-sm font-black">Orange · IAP 23 line</div></div><div className="rounded-xl border border-rose-400/40 bg-rose-500/15 p-3 text-rose-100"><div className="lbl">Obese</div><div className="text-sm font-black">Red · IAP 27 line</div></div></div><AssessmentBox result={result} unit="kg/m²" /></ToolShell>;
}

function FentonTool({ version }: { version: "fenton2013" | "fenton2025" }) {
  const [metric, setMetric] = useState<AnthropometryMetric>("weight");
  const [sex, setSex] = useState<AnthropometrySex>("m");
  const [age, setAge] = useState(32);
  const [value, setValue] = useState(metric === "weight" ? 1.8 : metric === "height" ? 43 : 29);
  const [showBirth, setShowBirth] = useState(false);
  const result = useMemo(() => assess(value, age, sex, metric, version), [age, metric, sex, value, version]);
  const unit = metric === "weight" ? "kg" : "cm";
  return <ToolShell source={version} note={version === "fenton2013" ? "Fenton 2013 second-generation monitoring chart. Enter PMA from 22 to 50 weeks; sex-specific curves stay separate from Fenton 2025." : "Fenton 2025 third-generation workflow. Enter corrected age from 22 to 50 weeks; verified original reference data is required before scoring."}><div className="grid gap-2 sm:grid-cols-2"><Select label="Measure" value={metric} onChange={(v) => { setMetric(v as AnthropometryMetric); setValue(v === "weight" ? 1.8 : v === "height" ? 43 : 29); }} options={[{ value: "weight", label: "Weight" }, { value: "height", label: "Length" }, { value: "head_circ", label: "Head circumference" }]} /><Select label="Sex" value={sex} onChange={(v) => setSex(v as AnthropometrySex)} options={[{ value: "m", label: "Boy" }, { value: "f", label: "Girl" }]} /><Field label="Gestational / corrected age" value={age} onChange={setAge} unit="weeks PMA" min={22} max={50} step={1 / 7} /><Field label={metric === "weight" ? "Weight" : metric === "height" ? "Length" : "Head circumference"} value={value} onChange={setValue} unit={unit} min={0} step={0.1} /></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${version === "fenton2013" ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-violet-400/30 bg-violet-400/10 text-violet-100"}`}>{version === "fenton2013" ? "FENTON 2013" : "FENTON 2025 · THIRD GENERATION"}</span>{version === "fenton2025" && <ActionButton tone="primary" onClick={() => setShowBirth((v) => !v)}><Ruler size={13} /> {showBirth ? "Hide" : "Open"} size-at-birth tool</ActionButton>}</div>{version === "fenton2025" && showBirth && <BirthSizeTool sex={sex} />}{<AssessmentBox result={result} unit={unit} />}<HologramChart version={version} metric={metric} sex={sex} age={age} value={value} maxAge={50} ageUnit="weeks PMA" label={metric === "weight" ? "Weight (kg)" : metric === "height" ? "Length (cm)" : "Head circumference (cm)"} /></ToolShell>;
}

function BirthSizeTool({ sex }: { sex: AnthropometrySex }) {
  const [age, setAge] = useState(32);
  const [value, setValue] = useState(1.8);
  const [metric, setMetric] = useState<AnthropometryMetric>("weight");
  const result = useMemo(() => assess(value, age, sex, metric, "fenton2025"), [age, metric, sex, value]);
  return <div className="rounded-2xl border border-violet-400/25 bg-violet-400/5 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-black text-violet-100"><Ruler size={14} /> Fenton 2025 Size-at-Birth Calculator · 22–42 weeks</div><div className="grid gap-2 sm:grid-cols-3"><Field label="Birth gestation" value={age} onChange={setAge} unit="weeks" min={22} max={42} step={1 / 7} /><Select label="Measure" value={metric} onChange={(v) => setMetric(v as AnthropometryMetric)} options={[{ value: "weight", label: "Birth weight" }, { value: "height", label: "Birth length" }, { value: "head_circ", label: "Birth head circumference" }]} /><Field label="Value" value={value} onChange={setValue} unit={metric === "weight" ? "kg" : "cm"} min={0} step={0.1} /></div><AssessmentBox result={result} unit={metric === "weight" ? "kg" : "cm"} /><div className="mt-2 text-[10px] text-violet-100/75">This birth-size tool is separate from corrected-age growth monitoring and uses no Fenton 2013 output.</div></div>;
}
