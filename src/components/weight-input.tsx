"use client";

import { useState } from "react";
import { NumField } from "@/components/ui";

/**
 * Standard weight limits by clinical context.
 *
 *   Neonate grams:   250 – 6000 g  (slider)
 *   Neonate kg:      0.25 – 6.0 kg (auto-converted)
 *   Paediatric kg:   1 – 80 kg     (slider)
 *   Paediatric g:    1000 – 80000  (auto-converted)
 *
 * Anything outside slider range requires the manual-override toggle.
 */

type WeightProps = {
  /** Label shown above the field. */
  label: string;
  /** Current value in GRAMS (always stored in grams throughout the app). */
  valueGrams: number | undefined | null;
  /** Called with the new value in GRAMS. */
  onChangeGrams: (grams: number) => void;
  /** If true the default display is grams (NICU); otherwise kg. */
  neonatal?: boolean;
  /** Optional extra CSS class on the wrapper. */
  className?: string;
};

const NEO_G = { min: 250, max: 6000, step: 5 };
const NEO_KG = { min: 0.25, max: 6, step: 0.01 };
const PAED_KG = { min: 1, max: 80, step: 0.5 };
const PAED_G = { min: 1000, max: 80000, step: 50 };

export function WeightInput({
  label,
  valueGrams,
  onChangeGrams,
  neonatal = true,
  className,
}: WeightProps) {
  const [useKg, setUseKg] = useState(!neonatal);
  const [manual, setManual] = useState(false);

  const displayKg = useKg;
  const grams = valueGrams ?? 0;
  const displayVal = displayKg ? grams / 1000 : grams;

  const limits = (() => {
    if (manual) {
      // Manual override: very wide range, user types exactly.
      return displayKg
        ? { min: 0.01, max: 300, step: 0.01, decimals: 2 }
        : { min: 1, max: 300000, step: 1, decimals: 0 };
    }
    if (neonatal) {
      return displayKg
        ? { ...NEO_KG, decimals: 2 }
        : { ...NEO_G, decimals: 0 };
    }
    return displayKg
      ? { ...PAED_KG, decimals: 1 }
      : { ...PAED_G, decimals: 0 };
  })();

  const unitLabel = displayKg ? "kg" : "g";
  const outOfRange =
    !manual &&
    grams > 0 &&
    (displayKg
      ? grams / 1000 < limits.min || grams / 1000 > limits.max
      : grams < limits.min || grams > limits.max);

  return (
    <div className={className}>
      <NumField
        label={`${label} (${unitLabel})`}
        value={displayVal || undefined}
        onChange={(n) => {
          const g = displayKg ? Math.round(n * 1000) : Math.round(n);
          onChangeGrams(Math.max(0, g));
        }}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        decimals={limits.decimals}
        placeholder={`enter ${unitLabel}`}
      />
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
        <label className="inline-flex cursor-pointer items-center gap-1 text-slate-400">
          <input
            type="checkbox"
            checked={useKg}
            onChange={() => setUseKg((v) => !v)}
            className="accent-cyan-400"
          />
          {useKg ? "Show in kg" : "Show in grams"}
          <span className="text-slate-500">·</span>
          <span className="text-slate-300">
            {displayKg
              ? `${(grams / 1000).toFixed(2)} kg = ${grams} g`
              : `${grams} g = ${(grams / 1000).toFixed(2)} kg`}
          </span>
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1 text-slate-400">
          <input
            type="checkbox"
            checked={manual}
            onChange={() => setManual((v) => !v)}
            className="accent-amber-400"
          />
          Manual override
        </label>
        {outOfRange && (
          <span className="font-semibold text-amber-300">
            ⚠ Outside standard range — enable manual override to keep this value.
          </span>
        )}
      </div>
    </div>
  );
}
