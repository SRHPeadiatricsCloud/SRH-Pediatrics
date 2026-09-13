# SRH Pediatrics NICU — Fluids, TPN & Nutrition Module

## Purpose

This document is the implementation contract for the Level 3B NICU nutrition workflow. It describes the component boundaries, visual hierarchy, state model, calculation flow, validation gates, realtime behavior, and testable acceptance criteria. The module uses the existing baby record and clinical JSON fields; it does not create a second patient or prescription store. Fluid restriction controls and restriction-specific gating are intentionally omitted; the module shows target interpretation, warnings, and formulas without a restriction flag.

## 1. Component architecture

```text
BabyRecordPage
└── BabyTabs
    └── FluidsTab
        ├── NutritionBabyHeader
        │   ├── identity / record ID / GA / postnatal day
        │   ├── current weight + confirmed dosing weight
        │   ├── nutrition day + last update
        │   ├── realtime updated-by indicator
        ├── NutritionViewRouter
        │   ├── TodayPlanView              default, read-only
        │   │   ├── NutritionEmptyState
        │   │   ├── NutritionPlainSummary
        │   │   ├── HeroMetricCard × 3
        │   │   ├── SharePlanAction
        │   │   └── Start/UpdatePlanAction
        │   ├── NutritionWizardView        draft-only until review
        │   │   ├── WizardProgress
        │   │   ├── WizardStepWeightMode
        │   │   ├── WizardStepTotalFluids
        │   │   ├── WizardStepEnteralIvSplit
        │   │   ├── WizardStepComposition
        │   │   ├── WizardStepFrequency
        │   │   ├── WizardReview
        │   │   └── WizardHelpDrawer
        │   └── AdvancedNutritionView       remembered opt-in view
        │       ├── HeroMetricGrid
        │       ├── BedsidePlanSummary
        │       ├── DosingWeightEditor
        │       ├── FixedTargetEditor
        │       ├── AdvanceDailyEditor
        │       ├── FluidAllocationBar
        │       ├── FeedVolumeCard
        │       ├── FeedTimeline
        │       ├── FluidBalancePanel
        │       ├── NutritionDetail
        │       ├── ElectrolyteGrid
        │       ├── PrescriptionDetails
        │       │   ├── FluidRestrictionSettings
        │       │   ├── BaseMilkPicker
        │       │   ├── FortifierEditor × N
        │       │   ├── FrequencyEditor
        │       │   ├── Hold/PauseControls
        │       │   ├── RoundingSettings
        │       │   └── TargetSettings
        │       └── AuditHistory
        └── FormulaSheet
```

### Existing integration points

- `src/components/baby-tabs.tsx` owns the bedside UI, wizard draft, view routing, role-gated controls, formulas, timeline, and audit presentation.
- `src/lib/clinical.ts` owns `calculateFluidPlan`, `fluidTargetForDay`, `calcNutrition`, milk composition, fortifier contributions, GIR inputs, and clinically meaningful precision.
- `src/components/ui.tsx` owns shared numeric fields, steppers, session identity, employee-code headers, autosave helpers, and save notifications.
- `src/app/baby/[id]/page.tsx` owns baby linkage, polling/realtime refresh, and PATCH propagation.
- `src/app/api/babies/[id]/route.ts` owns server-side validation, employee-code authentication, RBAC, optimistic stale-write protection, and event insertion.
- `src/db/schema.ts` remains unchanged for baby linkage and event field names. Nutrition extensions live inside the existing clinical JSON object.

## 2. View wireframes

### Today’s Plan — mobile

```text
┌──────────────────────────────────┐
│ Baby name · MRN · GA · DOL       │
│ Current 1.42 kg · Dosing 1.42 kg │
│ Nutrition day 3 · Updated 14:30  │
├──────────────────────────────────┤
│ 180 ml/kg/day total               │
│ 136 kcal/kg/day · GIR 6.2        │
│ Next feed: 25 ml EBM + HMF       │
│ at 14:30 · q2.5h                  │
├──────────────────────────────────┤
│ Total fluids     Energy     GIR   │
│ 180              136        6.2  │
│ 255.6 ml/day     193 kcal/d 8.8  │
│ ✓ In target       ⚠ Review       ✓│
│  formula · trend · status         │
├──────────────────────────────────┤
│ Share plan   Switch to advanced   │
│              Update plan          │
└──────────────────────────────────┘
```

If `planExists` is false, the metric region is replaced by:

```text
No nutrition plan started yet for Baby of Anjali Sharma
Start with a confirmed dosing weight...
[ Start plan ]
```

No zero, NaN, blank, or placeholder hero metrics are rendered for an uninitialized plan.

### Guided wizard — mobile

```text
┌──────────────────────────────────┐
│ Nutrition plan wizard             │
│ Step 3 of 5 · draft only          │
│ ████████████░░░░░░░░              │
├──────────────────────────────────┤
│ Enteral / IV split                │
│ Plain-language clinical explainer │
│                                  │
│ Enteral share 40% · IV 60%       │
│ ─────────●────────────            │
│                                  │
│ Total       Enteral     IV/TPN    │
│ 180         72          108       │
│                                  │
│ Dextrose 5–30%  Amino acid  Lipid │
│                                  │
│ Need help?              Back Next │
└──────────────────────────────────┘
```

The review screen uses the same two navigation controls: `Back` and `Save plan`. `Save plan` is disabled until every blocking check passes.

### Advanced clinician view — desktop

```text
┌─ patient header / live sync / restriction badge ───────────────┐
│ Hero: Total fluids | Energy | GIR                               │
│ Bedside summary + Check My Plan                                 │
│ Dosing weight / fixed or advance-daily mode                     │
│ Today's feed: ideal, practical draw-up, frequency, timeline      │
│ Composition: base milk + independent fortifiers                  │
│ Nutrition: kcal, protein, MCT, fortifier contributions            │
│ IV/TPN: volume, dextrose, amino acid, lipid, GIR                 │
│ Electrolytes: Na | K | Ca | PO4                                  │
│ Fluid balance: intake vs output / net                            │
│ Advance controls: per-day or per-feed / review / apply           │
│ Audit history                                                     │
└─────────────────────────────────────────────────────────────────┘
```

## 3. State model

The following fields remain inside the existing `clinical.fluids` JSON object. Existing names are retained. Optional fields are additive.

```ts
type FluidState = {
  totalMlKgDay?: number;
  enteralMlKgDay?: number;
  ivMlKgDay?: number;
  feedType?: string;
  feedRoute?: string;
  feedFreq?: string;
  feedVol?: number;
  idealFeedVolumeMl?: number;
  practicalFeedVolumeMl?: number;
  aminoAcid?: number;
  lipid?: number;
  dextrosePct?: number;
  gir?: number;
  ivHeld?: boolean;
  feedsHeld?: boolean;
  dosingWeightKg?: number;
  dosingWeightAt?: string;
  dosingWeightConfirmedAt?: string;
  fluidDriver?: "total" | "enteral" | "iv";
  practicalIncrementMl?: number;
  electrolyteUnit?: "mEq/kg/day" | "mmol/kg/day";
  electrolytes?: { na?: number; k?: number; ca?: number; po4?: number };
  targets?: {
    fluids?: [number, number];
    energy?: [number, number];
    protein?: [number, number];
    gir?: [number, number];
    maximumEnteralMlKgDay?: number;
  };
  fortifiers?: FluidFortifier[];
  feedsGiven?: FeedOutcome[];
  outputs?: FluidOutput[];
  plan?: {
    mode?: "fixed" | "daily";
    startDate?: string;
    day?: number;
    holdToday?: boolean;
    enteral?: DailyFluidPlan;
    iv?: DailyFluidPlan;
  };
};
```

Wizard state is UI-only and is never persisted independently:

```ts
type NutritionView = "today" | "wizard" | "advanced";
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6; // 6 is review

{
  moduleView: NutritionView;
  wizardStep: WizardStep;
  wizardBaseline: FluidState | null;
  targetChangePending: string;
  conflict: string;
  formula: { title: string; text: string } | null;
}
```

A wizard baseline is restored when the user discards. The wizard uses the same `FluidState` object as the advanced editor, so it cannot create a parallel plan.

## 4. Calculation and safety flow

### Resolution order

```text
clinical.fluids + confirmed dosing weight
        │
        ├── calculateFluidPlan()
        │     ├── fixed: use stored total/enteral/IV
        │     └── daily: start + (day − 1) × 24h change, bounded by min/max
        │
        ├── reconciliation
        │     └── enteral + IV/TPN must equal total
        │
        ├── exact feed volume
        │     └── enteral ml/day ÷ feeds/day
        │
        ├── practical display rounding only
        │     ├── <1.5 kg: nearest 0.1 ml
        │     └── ≥1.5 kg: nearest 1 ml
        │
        └── calcNutrition()
              ├── base milk kcal/protein
              ├── independent fortifier kcal/protein
              ├── separate MCT contribution
              ├── IV dextrose / amino acid / lipid
              └── energy, protein, GIR, and absolute values
```

### Formula examples

- Absolute fluid: `ml/kg/day × confirmed kg = ml/day`.
- Exact feed: `enteral ml/day ÷ feeds/day = ideal ml/feed`.
- GIR: `(dextrose % × 10 × IV ml/kg/day) ÷ 1440 = mg/kg/min`.
- Absolute GIR: `GIR mg/kg/min × confirmed kg = mg/min`.
- Fortifier energy density: `(kcal/unit × independent amount × phase) ÷ reference volume ml`.
- Fortifier protein follows the same independent amount/phase/reference-volume calculation.
- mEq/mmol display conversion: Na/K valence 1; Ca/PO4 valence 2. Stored unit is respected and formulas expose the factor.

### Blocking validation gates

```text
weightConfirmed
  && noConflict
  && noTargetConfirmationPending
  && noFluidMismatch
  && noNegativeOrNonNumericFluid
  && noInvalidDextrose
  && noInvalidFortifier
  && noUnconfirmedDilutionGap
  && planLimitsValid
  && electrolytesValidWhenIVRunning
  && requiredFeedVolumeExists
  && targetChangesConfirmed
```

No save or advance action is allowed when any gate is false. Server-side validation repeats the high-risk checks rather than trusting hidden or disabled UI controls.

## 5. Guided flow logic

1. **Open**: capture `wizardBaseline`; enter draft mode; do not run fluid autosave.
2. **Step 1**: require a confirmed 0.3–6 kg dosing weight; select Fixed Target or Advance Daily.
3. **Step 2**: enter a positive total fluid target and show the DOL-based suggested range plus ml/day.
4. **Step 3**: set the split with the slider; dependent volume follows Total. Reveal IV/TPN fields only when IV/TPN is greater than zero.
5. **Step 4**: choose exactly one base milk and add zero or more independent fortifiers. A dilution gap requires explicit confirmation.
6. **Step 5**: choose a common frequency or a 30-minute custom interval. Show exact and practical feed volumes.
7. **Review**: show all choices, formulas, warnings, and status. `Save plan` calls the existing PATCH path once.
8. **Success**: return to Today’s Plan and update the expected server version.
9. **Conflict/failure**: remain in the wizard, preserve draft values, show the error, and do not claim that the plan was applied.

## 6. Advanced flow logic

- Fixed Target edits use the last-edited field as the driver. Editing Total scales the two components proportionally; editing Enteral or IV recalculates the other component.
- Advance Daily stores a forward-only plan day and preserves already-given feed outcomes.
- Feed frequency changes store `previousFeedFreq` and `frequencyChangedAt`. Historical feed rows remain unchanged; future projection uses the new interval.
- Feed logging stores `plannedVolumeMl` separately from actual `volumeMl` and records `given`, `held`, `refused`, or `emesis`.
- Advance controls require explicit `per-day` or `per-feed` selection, validate the maximum enteral target, show current → proposed → new values, then disable Apply immediately while saving.
- Target changes create a pending confirmation state before autosave can commit them; fluid targets are interpreted against the configured range without a restriction mode.

## 7. Status language

Every status uses text plus an icon and color:

| State | Display language |
|---|---|
| Missing | `⚠ Add dextrose % to calculate GIR` |
| Held | `⏸ IV/TPN held — GIR suspended` |
| Enteral hold | `⏸ Feeds on hold — enteral calories paused` |
| Not started | `○ Enteral feeds not yet started` |
| Active | `✓ Calculated` |
| Warning | `⚠ Needs attention` |
| Critical | `✕ Cannot apply` |
| Informational | `ⓘ Review formula` |

A metric with missing inputs renders the state message rather than a numeric zero.

## 8. Realtime, permissions, and audit

### PATCH path

```text
UI action
  → api() adds employee name, employee code, and role headers
  → PATCH /api/babies/[id]
  → editorOfChecked()
  → server fluid validation
  → role gate
  → expectedUpdatedAt comparison
  → merge existing clinical object without renaming fields
  → append event with kind/text/author
  → realtime/poll response updates open records
```

- Nurses can view plans and log feeds/output outcomes only.
- Residents, consultants, registrars, dietitian-equivalent, and admin roles can alter targets, TPN, composition, restrictions, and advances.
- A stale `expectedUpdatedAt` returns HTTP 409. The local draft is not overwritten; the UI shows the newer author/time and offers review/reload.
- Audit text includes the action, prior signature, new signature, timestamp, display identity, and employee-code verification where supported by the existing model.

## 9. Test matrix

### View and wizard

- No-plan empty state contains no hero zeros.
- Update Plan opens Step 1 with the latest recorded weight and timestamp.
- Back preserves draft values; discard restores the baseline.
- Wizard does not PATCH before Save plan.
- Save plan returns to Today’s Plan only after a successful response.
- Advanced view is remembered per user and reads the same plan values.

### Clinical safety

- `1420` kg is rejected with a 1.42 kg hint.
- Weight below 0.3 kg or above 6 kg is rejected.
- Dextrose below 5% or above 30% is rejected.
- Negative volumes, electrolytes, fortifier amounts, and output values are rejected with explanatory text.
- Enteral + IV mismatch blocks save and apply.
- Fortifier phase outside 0–1.5 and invalid min/max relationships block save.
- Changing feed volume never silently scales a fortifier.
- Ideal feed value is used downstream; practical draw-up is display-only.

### Realtime and RBAC

- Nurse cannot modify targets, TPN, fortifiers, restrictions, or advances.
- Nurse can log given/held/refused/emesis feeds and output observations.
- Credentialed role can apply advanced changes.
- Concurrent stale save returns 409 and cannot overwrite the newer plan.
- Event log contains old/new signatures and actor identity.

### Build checks

```bash
npx tsc --noEmit
npx eslint src/components/baby-tabs.tsx src/lib/clinical.ts src/components/ui.tsx 'src/app/api/babies/[id]/route.ts'
git diff --check
npm run build
```
