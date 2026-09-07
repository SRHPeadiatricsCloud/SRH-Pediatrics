"use client";

import { Section, TopBar } from "@/components/ui";
import { UnitSwitcher } from "@/components/unit-ui";
import {
  dextroseConcForGir,
  fentonBand,
  girFromDextrose,
  interpretBilirubin,
  maintenanceFluidsMlPerDay,
} from "@/lib/interpret";
import { useState } from "react";
import { unitOf, type UnitKey } from "@/lib/units";
import { UNIT_CATALOGS } from "@/lib/units-catalog";
import { UNIT_REFERENCE } from "@/lib/unit-reference";

export default function ReferencePage() {
  const [unit, setUnit] = useState<UnitKey>("nicu");
  const u = unitOf(unit);
  const ref = UNIT_REFERENCE[unit];
  const unitCatalog = UNIT_CATALOGS[unit];
  const totalDx = unitCatalog
    ? Object.values(unitCatalog).reduce((n, list) => n + list.length, 0)
    : 0;

  return (
    <main className="min-h-screen pb-20">
      <TopBar />
      <div className="mx-auto max-w-[1400px] px-4 py-5">
        <div className="card mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-lg text-cyan-300">
              {u.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black tracking-tight text-white">
                {ref.headline} — Parameters &amp; standards
              </h1>
              <p className="text-[11px] text-slate-400">{ref.intro}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="lbl">Unit</span>
              <UnitSwitcher active={unit} onChange={(x) => x !== "all" && setUnit(x)} />
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Section
            title="Continuously / routinely monitored"
            sub={`${u.short} nursing observation chart`}
          >
            <ul className="grid grid-cols-1 gap-1 text-xs text-slate-300 md:grid-cols-2">
              {ref.monitored.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </Section>

          <Section title="Physiological targets used on the board">
            <ul className="space-y-1 text-xs text-slate-300">
              {ref.targets.map((t) => (
                <li key={t}>• {t}</li>
              ))}
            </ul>
          </Section>

          <Section title="Investigations tracked" sub={`${u.short} lab panels`}>
            <div className="space-y-2 text-xs">
              {ref.labs.map((p) => (
                <div key={p.label}>
                  <span className="font-semibold text-cyan-300">{p.label}: </span>
                  <span className="text-slate-300">{p.fields.join(", ")}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title={`${u.short} formulary`} sub="Common medication groups used in this unit">
            <div className="space-y-2 text-xs">
              {Object.entries(ref.drugs).map(([g, list]) => (
                <div key={g}>
                  <span className="font-semibold text-amber-300">{g}: </span>
                  <span className="text-slate-300">{list.join(", ")}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Lines, tubes & devices">
            <p className="text-xs text-slate-300">{ref.lines.join(" · ")}</p>
          </Section>

          <Section title="Care bundle & discharge readiness">
            <div className="lbl mb-1">Care bundle</div>
            <p className="text-xs text-slate-300">{ref.care.join(" · ")}</p>
            <div className="lbl mt-3 mb-1">Discharge criteria</div>
            <p className="text-xs text-slate-300">{ref.discharge.join(" · ")}</p>
          </Section>
        </div>

        <CalcHub />

        {unitCatalog && (
          <Section
            title={`${u.short} diagnosis catalogue`}
            sub={`${totalDx} conditions across ${Object.keys(unitCatalog).length} categories`}
          >
            <div className="max-h-96 space-y-3 overflow-auto">
              {Object.entries(unitCatalog).map(([sysName, list]) => (
                <div key={sysName}>
                  <span className="font-semibold text-cyan-300">{sysName}</span>{" "}
                  <span className="text-[10px] uppercase text-slate-500">{list.length}</span>
                  <p className="text-[11px] text-slate-300">{list.join(" · ")}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </main>
  );
}

/* --------------------------- calculators hub --------------------------- */
function CalcHub() {
  const [weight, setWeight] = useState(3.2);
  const [ageY, setAgeY] = useState(0);
  const [ga, setGa] = useState(36);
  const [dol, setDol] = useState(3);
  const [dex, setDex] = useState(10);
  const [rate, setRate] = useState(80);
  const [tsb, setTsb] = useState(12);
  const [hours, setHours] = useState(48);
  const [bw, setBw] = useState(2500);

  const neonate = ageY === 0;
  const maint = maintenanceFluidsMlPerDay(weight);
  const gir = girFromDextrose(dex, rate);
  const d10 = dextroseConcForGir(6, rate);
  const pma = ga + dol / 7;
  const fenton = fentonBand(ga, bw);
  const bili = interpretBilirubin(tsb, hours, ga)[0];
  const sbpThr = neonate ? 60 : ageY < 1 ? 70 : ageY < 10 ? 70 + 2 * ageY : 90;

  return (
    <Section
      title="Calculators & provisional interpretation"
      sub="Bedside auto-calculation — maintenance fluids, GIR, corrected age, bilirubin & growth centile"
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="lbl mb-2">Inputs</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Num label="Weight (kg)" v={weight} set={setWeight} step={0.1} />
            <Num label="Age (yr; 0=neonate)" v={ageY} set={setAgeY} step={1} />
            <Num label="Gestation (wk)" v={ga} set={setGa} step={1} />
            <Num label="Day of life" v={dol} set={setDol} step={1} />
            <Num label="Dextrose %" v={dex} set={setDex} step={0.5} />
            <Num label="IV ml/kg/day" v={rate} set={setRate} step={5} />
            <Num label="TSB (mg/dL)" v={tsb} set={setTsb} step={0.5} />
            <Num label="Age (hours)" v={hours} set={setHours} step={6} />
            <Num label="Birth wt (g)" v={bw} set={setBw} step={50} />
          </div>
        </div>
        <div className="space-y-2">
          <Out label="Maintenance fluid (Holliday–Segar)" value={`${maint} ml/day ≈ ${Math.round(maint / weight)} ml/kg/day`} />
          <Out label="GIR at current dextrose/rate" value={`${gir} mg/kg/min`} note={gir < 4 ? "low — increase dextrose" : gir > 12 ? "high — needs central line" : "within safe range"} />
          <Out label="Dextrose % needed for GIR 6" value={`${d10}% at ${rate} ml/kg/day`} />
          <Out label="Corrected gestational age" value={neonate ? `${pma.toFixed(1)} wk PMA` : `${ageY} yr`} />
          <Out label="PALS hypotension threshold (SBP)" value={`< ${sbpThr} mmHg`} />
          <Out label="Bilirubin (approx phototherapy line)" value={`${bili?.note ?? "—"}`} note={bili?.label} />
          <Out label="Fenton growth (approx)" value={fenton ?? "—"} note={`${ga} wk · BW ${bw} g`} />
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Provisional decision-support only. Bilirubin and centile values are approximations — confirm against the unit
        nomogram / Fenton charts before acting.
      </p>
    </Section>
  );
}

function Num({ label, v, set, step }: { label: string; v: number; set: (n: number) => void; step: number }) {
  return (
    <label className="rounded-lg border border-white/10 bg-slate-900/40 p-2">
      <span className="lbl mb-1 block">{label}</span>
      <input
        type="number"
        step={step}
        className="inp !py-1 text-center text-sm font-bold"
        value={v}
        onChange={(e) => set(Number(e.target.value) || 0)}
      />
    </label>
  );
}

function Out({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/5 px-3 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-right text-sm font-black tabular-nums text-cyan-200">
        {value}
        {note && <span className="ml-1 text-[10px] font-normal text-slate-400">· {note}</span>}
      </span>
    </div>
  );
}
