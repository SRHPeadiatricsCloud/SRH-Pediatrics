import type { Severity } from "@/lib/calc-types";

export type BloodGasSample = "ABG" | "VBG";

export type BloodGasInput = {
  sampleType: BloodGasSample;
  ph: number | null;
  pco2: number | null;
  hco3: number | null;
  baseExcess: number | null;
  sodium: number | null;
  chloride: number | null;
  albumin: number | null;
  lactate: number | null;
  po2: number | null;
  fio2: number | null;
};

export type BloodGasMetric = {
  label: string;
  value: string;
  tone: Severity | "neutral";
};

export type BloodGasAnalysis = {
  ready: boolean;
  severity: Severity;
  headline: string;
  acidBaseState: string;
  primary: string;
  compensation: string;
  gapSummary?: string;
  oxygenationSummary?: string;
  sampleNote?: string;
  additionalFindings: string[];
  cautions: string[];
  metrics: BloodGasMetric[];
};

const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const fmt = (value: number | null | undefined, digits = 1): string => (
  value == null || Number.isNaN(value) ? "—" : `${round(value, digits)}`
);

const within = (value: number, target: number, tolerance: number): boolean =>
  Math.abs(value - target) <= tolerance;

function effectiveValues(input: BloodGasInput) {
  const sampleNote = input.sampleType === "VBG"
    ? "VBG interpreted with a standard venous-to-arterial approximation for pH (+0.03) and pCO₂ (−5 mmHg). Oxygenation is not graded from venous pO₂."
    : undefined;

  return {
    effectivePh: input.sampleType === "VBG" && input.ph != null ? input.ph + 0.03 : input.ph,
    effectivePco2: input.sampleType === "VBG" && input.pco2 != null ? Math.max(0, input.pco2 - 5) : input.pco2,
    sampleNote,
  };
}

function classifySeverity(input: BloodGasInput, headline: string, pfRatio?: number | null): Severity {
  const ph = input.ph;
  const lactate = input.lactate;
  if (ph != null && (ph < 7.2 || ph > 7.6)) return "crit";
  if (headline.includes("Mixed metabolic acidosis and respiratory acidosis")) return "crit";
  if (lactate != null && lactate >= 4) return "crit";
  if (pfRatio != null && pfRatio < 200) return "crit";
  if (ph != null && (ph < 7.3 || ph > 7.5)) return "warn";
  if (headline !== "Acid-base status within reference range") return "warn";
  if (lactate != null && lactate > 2) return "warn";
  return "good";
}

function analyzeRespiratoryAcidosis(pco2: number, hco3: number): { primary: string; compensation: string } {
  const delta = pco2 - 40;
  const acuteExpected = 24 + delta / 10;
  const chronicExpected = 24 + 3.5 * (delta / 10);

  if (hco3 < acuteExpected - 2) {
    return {
      primary: "Respiratory acidosis with concomitant metabolic acidosis",
      compensation: `HCO₃⁻ ${fmt(hco3)} is lower than expected for acute respiratory acidosis (expected ≈ ${fmt(acuteExpected)}).`,
    };
  }
  if (hco3 > chronicExpected + 2) {
    return {
      primary: "Respiratory acidosis with concomitant metabolic alkalosis",
      compensation: `HCO₃⁻ ${fmt(hco3)} is higher than expected even for chronic respiratory acidosis (chronic expected ≈ ${fmt(chronicExpected)}).`,
    };
  }
  if (within(hco3, acuteExpected, 2) && !within(hco3, chronicExpected, 2.5)) {
    return {
      primary: "Acute respiratory acidosis",
      compensation: `Appropriate acute metabolic compensation: expected HCO₃⁻ ≈ ${fmt(acuteExpected)} mmol/L per +10 mmHg rise in pCO₂.`,
    };
  }
  if (within(hco3, chronicExpected, 2.5) && !within(hco3, acuteExpected, 2)) {
    return {
      primary: "Chronic respiratory acidosis",
      compensation: `Appropriate chronic renal compensation: expected HCO₃⁻ ≈ ${fmt(chronicExpected)} mmol/L per +10 mmHg rise in pCO₂.`,
    };
  }
  return {
    primary: "Respiratory acidosis with partial / evolving metabolic compensation",
    compensation: `Observed HCO₃⁻ ${fmt(hco3)} lies between acute (${fmt(acuteExpected)}) and chronic (${fmt(chronicExpected)}) compensation ranges.`,
  };
}

function analyzeRespiratoryAlkalosis(pco2: number, hco3: number): { primary: string; compensation: string } {
  const delta = 40 - pco2;
  const acuteExpected = 24 - 2 * (delta / 10);
  const chronicExpected = 24 - 5 * (delta / 10);

  if (hco3 > acuteExpected + 2) {
    return {
      primary: "Respiratory alkalosis with concomitant metabolic alkalosis",
      compensation: `HCO₃⁻ ${fmt(hco3)} is higher than expected for respiratory alkalosis (acute expected ≈ ${fmt(acuteExpected)}).`,
    };
  }
  if (hco3 < chronicExpected - 2) {
    return {
      primary: "Respiratory alkalosis with concomitant metabolic acidosis",
      compensation: `HCO₃⁻ ${fmt(hco3)} is lower than expected even for chronic respiratory alkalosis (chronic expected ≈ ${fmt(chronicExpected)}).`,
    };
  }
  if (within(hco3, acuteExpected, 2) && !within(hco3, chronicExpected, 2)) {
    return {
      primary: "Acute respiratory alkalosis",
      compensation: `Appropriate acute metabolic compensation: expected HCO₃⁻ ≈ ${fmt(acuteExpected)} mmol/L per 10 mmHg fall in pCO₂.`,
    };
  }
  if (within(hco3, chronicExpected, 2) && !within(hco3, acuteExpected, 2)) {
    return {
      primary: "Chronic respiratory alkalosis",
      compensation: `Appropriate chronic renal compensation: expected HCO₃⁻ ≈ ${fmt(chronicExpected)} mmol/L per 10 mmHg fall in pCO₂.`,
    };
  }
  return {
    primary: "Respiratory alkalosis with partial / evolving metabolic compensation",
    compensation: `Observed HCO₃⁻ ${fmt(hco3)} lies between acute (${fmt(acuteExpected)}) and chronic (${fmt(chronicExpected)}) compensation ranges.`,
  };
}

function analyzeMetabolicAcidosis(pco2: number, hco3: number): { primary: string; compensation: string } {
  const expected = 1.5 * hco3 + 8;
  if (pco2 > expected + 2) {
    return {
      primary: "Metabolic acidosis with superimposed respiratory acidosis",
      compensation: `Winter's formula expected pCO₂ ≈ ${fmt(expected)} ±2 mmHg, but observed effective pCO₂ is ${fmt(pco2)}.`,
    };
  }
  if (pco2 < expected - 2) {
    return {
      primary: "Metabolic acidosis with superimposed respiratory alkalosis",
      compensation: `Winter's formula expected pCO₂ ≈ ${fmt(expected)} ±2 mmHg, but observed effective pCO₂ is ${fmt(pco2)}.`,
    };
  }
  return {
    primary: "Metabolic acidosis",
    compensation: `Appropriate respiratory compensation by Winter's formula: expected pCO₂ ≈ ${fmt(expected)} ±2 mmHg.`,
  };
}

function analyzeMetabolicAlkalosis(pco2: number, hco3: number): { primary: string; compensation: string } {
  const expected = 40 + 0.7 * (hco3 - 24);
  if (pco2 > expected + 5) {
    return {
      primary: "Metabolic alkalosis with superimposed respiratory acidosis",
      compensation: `Expected compensatory pCO₂ ≈ ${fmt(expected)} ±5 mmHg, but observed effective pCO₂ is ${fmt(pco2)}.`,
    };
  }
  if (pco2 < expected - 5) {
    return {
      primary: "Metabolic alkalosis with superimposed respiratory alkalosis",
      compensation: `Expected compensatory pCO₂ ≈ ${fmt(expected)} ±5 mmHg, but observed effective pCO₂ is ${fmt(pco2)}.`,
    };
  }
  return {
    primary: "Metabolic alkalosis",
    compensation: `Appropriate respiratory compensation: expected pCO₂ ≈ ${fmt(expected)} ±5 mmHg.`,
  };
}

function gapAnalysis(input: BloodGasInput): { summary?: string; metrics: BloodGasMetric[]; additionalFindings: string[] } {
  const metrics: BloodGasMetric[] = [];
  const additionalFindings: string[] = [];
  if (input.sodium == null || input.chloride == null || input.hco3 == null) {
    return { metrics, additionalFindings };
  }

  const ag = input.sodium - input.chloride - input.hco3;
  const correctedAg = input.albumin == null ? null : ag + 2.5 * (4 - input.albumin);
  metrics.push({
    label: "Anion gap",
    value: correctedAg == null ? `${fmt(ag)} mmol/L` : `${fmt(ag)} mmol/L (corrected ${fmt(correctedAg)})`,
    tone: correctedAg != null ? (correctedAg > 16 ? "warn" : correctedAg > 12 ? "info" : "good") : (ag > 12 ? "warn" : "good"),
  });

  if (input.hco3 < 22) {
    const effectiveAg = correctedAg ?? ag;
    if (effectiveAg > 12) {
      let summary = `High anion gap metabolic acidosis pattern (corrected AG ${fmt(effectiveAg)} mmol/L).`;
      const deltaDenominator = 24 - input.hco3;
      if (deltaDenominator > 0) {
        const deltaRatio = (effectiveAg - 12) / deltaDenominator;
        metrics.push({
          label: "Delta ratio",
          value: `${fmt(deltaRatio, 2)}`,
          tone: deltaRatio < 0.8 || deltaRatio > 2 ? "warn" : "good",
        });
        if (deltaRatio < 0.4) additionalFindings.push("Very low delta ratio suggests prominent normal anion gap acidosis in addition to any elevated-gap process.");
        else if (deltaRatio < 0.8) additionalFindings.push("Delta ratio 0.4–0.8 suggests combined high anion gap and normal anion gap metabolic acidosis.");
        else if (deltaRatio <= 2) additionalFindings.push("Delta ratio 0.8–2.0 is most consistent with a predominant high anion gap metabolic acidosis.");
        else additionalFindings.push("Delta ratio > 2 suggests concomitant metabolic alkalosis or pre-existing chronic respiratory acidosis.");
      }
      return { summary, metrics, additionalFindings };
    }
    return {
      summary: "Normal anion gap (hyperchloremic) metabolic acidosis pattern.",
      metrics,
      additionalFindings,
    };
  }

  if ((correctedAg ?? ag) > 12) {
    return {
      summary: `Elevated anion gap is present (effective AG ${fmt(correctedAg ?? ag)} mmol/L) even without overt low HCO₃⁻.`,
      metrics,
      additionalFindings,
    };
  }

  return { metrics, additionalFindings };
}

function oxygenationAnalysis(input: BloodGasInput): { summary?: string; metrics: BloodGasMetric[]; pfRatio: number | null } {
  const metrics: BloodGasMetric[] = [];
  if (input.sampleType !== "ABG") return { metrics, pfRatio: null };

  if (input.po2 != null && input.fio2 != null && input.fio2 > 0) {
    const pfRatio = input.po2 / (input.fio2 / 100);
    let summary = "Oxygenation preserved.";
    let tone: Severity = "good";
    if (pfRatio < 100) {
      summary = `Severe oxygenation impairment (P/F ratio ${fmt(pfRatio)}).`;
      tone = "crit";
    } else if (pfRatio < 200) {
      summary = `Moderate oxygenation impairment (P/F ratio ${fmt(pfRatio)}).`;
      tone = "crit";
    } else if (pfRatio < 300) {
      summary = `Mild oxygenation impairment (P/F ratio ${fmt(pfRatio)}).`;
      tone = "warn";
    }
    metrics.push({ label: "P/F ratio", value: `${fmt(pfRatio)}`, tone });
    return { summary, metrics, pfRatio };
  }

  if (input.po2 != null) {
    let summary = "PaO₂ within a typical room-air arterial range.";
    let tone: Severity = "good";
    if (input.po2 < 60) {
      summary = `Marked hypoxemia (PaO₂ ${fmt(input.po2)} mmHg).`;
      tone = "crit";
    } else if (input.po2 < 80) {
      summary = `Mild hypoxemia (PaO₂ ${fmt(input.po2)} mmHg).`;
      tone = "warn";
    }
    metrics.push({ label: "PaO₂", value: `${fmt(input.po2)} mmHg`, tone });
    return { summary, metrics, pfRatio: null };
  }

  return { metrics, pfRatio: null };
}

export function analyzeBloodGas(input: BloodGasInput): BloodGasAnalysis {
  const { effectivePh, effectivePco2, sampleNote } = effectiveValues(input);
  const metrics: BloodGasMetric[] = [];
  const additionalFindings: string[] = [];
  const cautions: string[] = [];

  if (effectivePh == null || effectivePco2 == null || input.hco3 == null) {
    return {
      ready: false,
      severity: "info",
      headline: "Enter pH, pCO₂ and HCO₃⁻ to start the auto-interpretation",
      acidBaseState: "Core blood-gas values are incomplete.",
      primary: "Awaiting essential inputs",
      compensation: "Add pH, pCO₂ and HCO₃⁻ for a full acid-base interpretation.",
      sampleNote,
      additionalFindings,
      cautions,
      metrics,
    };
  }

  const acidemia = effectivePh < 7.35;
  const alkalemia = effectivePh > 7.45;
  const lowHco3 = input.hco3 < 22;
  const highHco3 = input.hco3 > 26;
  const highPco2 = effectivePco2 > 45;
  const lowPco2 = effectivePco2 < 35;

  let acidBaseState = "Near-normal pH.";
  if (acidemia) acidBaseState = `Acidemia (effective pH ${fmt(effectivePh, 2)}).`;
  if (alkalemia) acidBaseState = `Alkalemia (effective pH ${fmt(effectivePh, 2)}).`;

  let primary = "Acid-base status within reference range";
  let compensation = "No primary acid-base disorder identified from the entered values.";

  if (acidemia) {
    if (lowHco3 && highPco2) {
      primary = "Mixed metabolic acidosis and respiratory acidosis";
      compensation = "pH is low with both low HCO₃⁻ and elevated effective pCO₂, so compensation alone does not explain the pattern.";
    } else if (lowHco3) {
      const analysis = analyzeMetabolicAcidosis(effectivePco2, input.hco3);
      primary = analysis.primary;
      compensation = analysis.compensation;
    } else if (highPco2) {
      const analysis = analyzeRespiratoryAcidosis(effectivePco2, input.hco3);
      primary = analysis.primary;
      compensation = analysis.compensation;
    } else {
      primary = "Acidemia with atypical / indeterminate pattern";
      compensation = "The pH is low but the entered pCO₂ and HCO₃⁻ do not fit a standard single-process disorder.";
    }
  } else if (alkalemia) {
    if (highHco3 && lowPco2) {
      primary = "Mixed metabolic alkalosis and respiratory alkalosis";
      compensation = "pH is high with both elevated HCO₃⁻ and low effective pCO₂, which is not explained by simple compensation.";
    } else if (highHco3) {
      const analysis = analyzeMetabolicAlkalosis(effectivePco2, input.hco3);
      primary = analysis.primary;
      compensation = analysis.compensation;
    } else if (lowPco2) {
      const analysis = analyzeRespiratoryAlkalosis(effectivePco2, input.hco3);
      primary = analysis.primary;
      compensation = analysis.compensation;
    } else {
      primary = "Alkalemia with atypical / indeterminate pattern";
      compensation = "The pH is high but the entered pCO₂ and HCO₃⁻ do not fit a standard single-process disorder.";
    }
  } else {
    if (lowHco3 && highPco2) {
      primary = "Mixed metabolic acidosis and respiratory acidosis with near-normal pH";
      compensation = "Opposing acidifying processes can normalize pH transiently; this is not a simple compensated disorder.";
    } else if (highHco3 && lowPco2) {
      primary = "Mixed metabolic alkalosis and respiratory alkalosis with near-normal pH";
      compensation = "Opposing alkalinizing processes can normalize pH transiently; this is not a simple compensated disorder.";
    } else if (lowHco3 && lowPco2) {
      const analysis = analyzeMetabolicAcidosis(effectivePco2, input.hco3);
      primary = analysis.primary.includes("superimposed") ? analysis.primary : "Compensated metabolic acidosis";
      compensation = analysis.compensation;
    } else if (highHco3 && highPco2) {
      const metabolic = analyzeMetabolicAlkalosis(effectivePco2, input.hco3);
      const respiratory = analyzeRespiratoryAcidosis(effectivePco2, input.hco3);
      if (respiratory.primary === "Chronic respiratory acidosis") {
        primary = "Compensated chronic respiratory acidosis";
        compensation = respiratory.compensation;
      } else if (metabolic.primary === "Metabolic alkalosis") {
        primary = "Compensated metabolic alkalosis";
        compensation = metabolic.compensation;
      } else {
        primary = "Mixed metabolic alkalosis and respiratory acidosis";
        compensation = `${metabolic.compensation} ${respiratory.compensation}`;
      }
    } else if (highPco2) {
      const analysis = analyzeRespiratoryAcidosis(effectivePco2, input.hco3);
      primary = analysis.primary.startsWith("Acute") || analysis.primary.startsWith("Chronic")
        ? `Compensated ${analysis.primary.toLowerCase()}`
        : analysis.primary;
      compensation = analysis.compensation;
    } else if (lowPco2) {
      const analysis = analyzeRespiratoryAlkalosis(effectivePco2, input.hco3);
      primary = analysis.primary.startsWith("Acute") || analysis.primary.startsWith("Chronic")
        ? `Compensated ${analysis.primary.toLowerCase()}`
        : analysis.primary;
      compensation = analysis.compensation;
    } else if (input.baseExcess != null && input.baseExcess <= -3) {
      primary = "Possible compensated metabolic acidosis";
      compensation = `Base excess ${fmt(input.baseExcess)} supports a metabolic acid load despite near-normal pH.`;
    } else if (input.baseExcess != null && input.baseExcess >= 3) {
      primary = "Possible compensated metabolic alkalosis";
      compensation = `Base excess ${fmt(input.baseExcess)} supports metabolic alkalosis despite near-normal pH.`;
    }
  }

  metrics.push({ label: "Sample", value: input.sampleType, tone: "neutral" });
  metrics.push({ label: "pH", value: fmt(input.ph, 2), tone: input.ph == null ? "neutral" : input.ph < 7.2 || input.ph > 7.6 ? "crit" : input.ph < 7.35 || input.ph > 7.45 ? "warn" : "good" });
  metrics.push({ label: `${input.sampleType === "VBG" ? "Estimated arterial pCO₂" : "pCO₂"}`, value: `${fmt(effectivePco2)} mmHg`, tone: highPco2 || lowPco2 ? "warn" : "good" });
  metrics.push({ label: "HCO₃⁻", value: `${fmt(input.hco3)} mmol/L`, tone: lowHco3 || highHco3 ? "warn" : "good" });
  if (input.baseExcess != null) metrics.push({ label: "Base excess", value: `${fmt(input.baseExcess)} mmol/L`, tone: input.baseExcess <= -5 || input.baseExcess >= 5 ? "warn" : "good" });

  const gap = gapAnalysis(input);
  const oxygenation = oxygenationAnalysis(input);
  metrics.push(...gap.metrics, ...oxygenation.metrics);

  if (input.lactate != null) {
    metrics.push({
      label: "Lactate",
      value: `${fmt(input.lactate)} mmol/L`,
      tone: input.lactate >= 4 ? "crit" : input.lactate > 2 ? "warn" : "good",
    });
    if (input.lactate >= 4) additionalFindings.push("Marked hyperlactatemia is present.");
    else if (input.lactate > 2) additionalFindings.push("Lactate is elevated above the usual reference range.");
  }

  additionalFindings.push(...gap.additionalFindings);

  if (input.sampleType === "VBG" && input.po2 != null) {
    cautions.push("Venous pO₂ is not used to grade oxygenation severity; rely on SpO₂ or ABG PaO₂ for oxygenation assessment.");
  }
  if (input.fio2 != null && (input.fio2 < 21 || input.fio2 > 100)) {
    cautions.push("FiO₂ is usually entered as a percentage between 21 and 100.");
  }
  if (input.albumin != null && input.albumin <= 0) {
    cautions.push("Albumin should be entered in g/dL when using corrected anion gap.");
  }

  const severity = classifySeverity(input, primary, oxygenation.pfRatio);

  return {
    ready: true,
    severity,
    headline: primary,
    acidBaseState,
    primary,
    compensation,
    gapSummary: gap.summary,
    oxygenationSummary: oxygenation.summary,
    sampleNote,
    additionalFindings,
    cautions,
    metrics,
  };
}
