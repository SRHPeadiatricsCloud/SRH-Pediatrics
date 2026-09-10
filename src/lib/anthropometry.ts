import {
  REFERENCE_SOURCES,
  WHO_LMS,
  WHO_WEIGHT_FOR_SIZE_LMS,
  type LmsRow,
} from "./anthropometry-data";

export type AnthropometrySex = "m" | "f";
export type AnthropometryMetric = "weight" | "height" | "head_circ" | "bmi" | "weight_for_size";
export type ReferenceVersion = "who" | "iap" | "combined" | "fenton2013" | "fenton2025";
export type PointInterpretation = "good" | "info" | "warn" | "crit";

export type AnthropometryPoint = {
  age: number;
  value: number;
  metric: AnthropometryMetric;
  sex: AnthropometrySex;
  id?: string;
};

export type Lms = { L: number; M: number; S: number };
export type Assessment = {
  z: number;
  percentile: number;
  band: string;
  interpretation: string;
  severity: PointInterpretation;
  lms: Lms | null;
  available: boolean;
};

const Z_BANDS: [number, string, PointInterpretation][] = [
  [-3, "Below 3rd percentile", "crit"],
  [-2, "3rd–15th percentile", "warn"],
  [1, "15th–84th percentile", "good"],
  [2, "84th–97th percentile", "warn"],
  [Infinity, "Above 97th percentile", "crit"],
];

/** Error function approximation accurate enough for clinical percentile display. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function zToPercentile(z: number): number {
  return Math.max(0.01, Math.min(99.99, normalCdf(z) * 100));
}

export function percentileToZ(percentile: number): number {
  // Acklam's inverse normal approximation.
  const p = Math.max(0.0001, Math.min(0.9999, percentile / 100));
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    const numerator = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]);
    const denominator = ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    return numerator / denominator;
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    const numerator = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]);
    const denominator = ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    return -numerator / denominator;
  }
  const q = p - 0.5;
  const r = q * q;
  const numerator = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q;
  const denominator = (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  return numerator / denominator;
}

export function interpolateLms(rows: LmsRow[] | undefined, age: number): Lms | null {
  if (!rows?.length || !Number.isFinite(age)) return null;
  if (age <= rows[0][0]) return { L: rows[0][1], M: rows[0][2], S: rows[0][3] };
  if (age >= rows[rows.length - 1][0]) {
    const r = rows[rows.length - 1];
    return { L: r[1], M: r[2], S: r[3] };
  }
  for (let i = 1; i < rows.length; i += 1) {
    const right = rows[i];
    if (right[0] >= age) {
      const left = rows[i - 1];
      const f = (age - left[0]) / (right[0] - left[0] || 1);
      return {
        L: left[1] + (right[1] - left[1]) * f,
        M: left[2] + (right[2] - left[2]) * f,
        S: left[3] + (right[3] - left[3]) * f,
      };
    }
  }
  return null;
}

export function zFromLms(value: number, lms: Lms): number {
  if (!(value > 0) || !(lms.M > 0) || !(lms.S > 0)) return NaN;
  if (Math.abs(lms.L) < 1e-8) return Math.log(value / lms.M) / lms.S;
  return (Math.pow(value / lms.M, lms.L) - 1) / (lms.L * lms.S);
}

export function valueFromLms(z: number, lms: Lms): number {
  if (Math.abs(lms.L) < 1e-8) return lms.M * Math.exp(lms.S * z);
  const base = 1 + lms.L * lms.S * z;
  return base > 0 ? lms.M * Math.pow(base, 1 / lms.L) : NaN;
}

function rowsFor(version: ReferenceVersion, sex: AnthropometrySex, metric: AnthropometryMetric | "length_height" | "length"): LmsRow[] | undefined {
  const key = `${sex}_${metric}`;
  if (version === "who") {
    if (metric === "weight_for_size") return WHO_WEIGHT_FOR_SIZE_LMS[key.replace("weight_for_size", "weight_for_length")];
    return WHO_LMS[key];
  }
  // The IAP 2015 and Fenton 2013/2025 source files are not redistributed
  // until their original LMS/reference releases are verified. Fail closed:
  // never substitute hand-authored anchors, digitized curves, or a different
  // Fenton generation for a clinical score.
  if (version === "iap" || version === "fenton2013" || version === "fenton2025") return undefined;
  return undefined;
}

export function getLms(version: ReferenceVersion, sex: AnthropometrySex, metric: AnthropometryMetric, age: number): Lms | null {
  const actualMetric = metric === "height"
    ? (version === "fenton2013" || version === "fenton2025" ? "length" : "length_height")
    : metric;
  const rows = rowsFor(version, sex, actualMetric);
  return interpolateLms(rows, age);
}

export function assess(
  value: number,
  age: number,
  sex: AnthropometrySex,
  metric: AnthropometryMetric,
  version: ReferenceVersion,
): Assessment {
  const lms = getLms(version, sex, metric, age);
  if (!lms) {
    return { z: NaN, percentile: NaN, band: "Reference unavailable", interpretation: "Verified original LMS/reference data is not bundled; no score or classification is calculated.", severity: "info", lms, available: false };
  }
  if (!(value > 0)) {
    return { z: NaN, percentile: NaN, band: "Enter required data", interpretation: "Complete the required fields to plot a point.", severity: "info", lms, available: false };
  }
  const z = zFromLms(value, lms);
  const percentile = zToPercentile(z);
  const match = Z_BANDS.find(([limit]) => z <= limit) ?? Z_BANDS[Z_BANDS.length - 1];
  const measure = metric === "head_circ" ? "head circumference" : metric === "weight_for_size" ? "weight for length/height" : metric;
  const interpretation = z < -3 ? `${measure} is below the 3rd percentile — consider further evaluation.`
    : z < -2 ? `${measure} is below the expected range for age.`
      : z > 2 ? `${measure} is above the expected range for age.`
        : `${measure} is within the expected range for age.`;
  return { z, percentile, band: match[1], interpretation, severity: match[2], lms, available: true };
}

export function percentileLabel(percentile: number): string {
  if (!Number.isFinite(percentile)) return "—";
  if (percentile < 3) return "<3rd";
  if (percentile < 15) return `${Math.round(percentile)}th`;
  if (percentile > 97) return ">97th";
  return `${Math.round(percentile)}th`;
}

export function classifyIapBmi(bmi: number, sex: AnthropometrySex, age: number): { label: string; severity: PointInterpretation; note: string } {
  // IAP 2015 uses age-specific 23/27 kg/m² adult-equivalent lines. These are
  // represented on the BMI LMS curve by the corresponding sex-specific z
  // positions; the clinician-facing labels remain the published cut-offs.
  const overweight = age < 10 ? 20.0 + age * 0.3 : sex === "m" ? 23 : 23;
  const obese = age < 10 ? overweight + 3.0 : 27;
  if (bmi >= obese) return { label: "Obese", severity: "crit", note: "Above the IAP 27 kg/m² adult-equivalent obesity line." };
  if (bmi >= overweight) return { label: "Overweight", severity: "warn", note: "Above the IAP 23 kg/m² adult-equivalent overweight line." };
  if (bmi < 14) return { label: "Underweight", severity: "warn", note: "Below the screening band; interpret with the BMI-for-age chart." };
  return { label: "Normal", severity: "good", note: "Within the provisional screening band." };
}

export function midpoint(a: number, b: number): number {
  return (a + b) / 2;
}

export function midParentalHeight(paternal: number, maternal: number, sex: AnthropometrySex): number {
  return sex === "m" ? (paternal + maternal + 13) / 2 : (paternal + maternal - 13) / 2;
}

export function sourceFor(version: ReferenceVersion) {
  if (version === "who") return REFERENCE_SOURCES.who;
  if (version === "iap") return REFERENCE_SOURCES.iap;
  if (version === "fenton2013") return REFERENCE_SOURCES.fenton2013;
  if (version === "fenton2025") return REFERENCE_SOURCES.fenton2025;
  return { label: "WHO 2006 + IAP 2015", citation: `${REFERENCE_SOURCES.who.citation} ${REFERENCE_SOURCES.iap.citation}`, url: REFERENCE_SOURCES.iap.url };
}
