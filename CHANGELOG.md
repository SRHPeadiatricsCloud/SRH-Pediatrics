# Changelog

## Versioning scheme

Every release bumps `APP_VERSION` in `src/lib/backup-schema.ts`, which is shown in
the shell footer and written into every backup envelope.

| Segment | Bump it when |
| --- | --- |
| **MAJOR** (`x.0.0`) | A major update — a breaking change to stored data or to a clinical workflow |
| **MINOR** (`3.x.0`) | New features are added |
| **PATCH** (`3.0.x`) | Existing features are rewritten or fixed |

Rules:

- Bump on **every** release; never ship a change without one.
- Add a new entry at the top. Never edit a released entry — correct it in a later release.
- Keep the date and the short, honest description of what actually changed.

---

## 3.1.0

New features, so the minor segment moves.

### Added

- **Fortifier product catalogue** — PreNAN FM 85, MMF, LHMF, Neocate Infant and
  Similac NeoSure, each with its own per-unit energy and protein taken from the
  manufacturer data, its dose unit and its nominal mix volume.
- **Fractional sachet dosing** — 1/4, 1/2 and 1 sachet for MMF and LHMF.
- **Gram dosing** — 0.5 g to 1.5 g for Neocate and NeoSure.
- **Times per day** — how many feeds the fortifier is actually given in, which
  scales the uplift instead of crediting it to the whole day's enteral volume.
- **Hypernatraemia correction** calculator — free water deficit and a safe rate
  of fall.
- **Potassium correction** calculator — deficit, maximum rate and the maximum
  safe concentration for peripheral and central access.
- **FENa / FEUrea** calculator with separate neonatal and paediatric cut-offs.
- **Paediatric DKA** calculator — deficit, maintenance, insulin range, corrected
  sodium, effective osmolality and cerebral-oedema warnings.
- **BP centiles extended** to 24 weeks gestation and to 18 years.
- `CHANGELOG.md` and the versioning scheme above.

### Changed

- **Vitals and growth are one tab.** Weight is recorded during the observation
  round, so having growth on a separate tab meant entering it twice.
- **`calcNutrition` now takes the current weight.** Without it a fortifier dose
  cannot be converted into an absolute daily amount.

### Fixed

- **Duplicate observation-log entries.** An observation round is typed field by
  field and auto-saved as the nurse goes, which wrote a separate row per edit,
  so one round appeared several times. Edits by the same recorder within the
  merge window now update that row instead.
- **Fortifier uplift overstated.** The recorded amount was being credited to the
  whole day's enteral volume rather than to the feeds it was given in.
- Per-ml fortifier concentration was rounded to 3 decimals, which discarded most
  of a small uplift; it is now carried at 5.
- **Potassium correction mislabelled its rate** as mmol/kg/h when it was
  mmol/h, and a floating-point rounding error asked for 151 ml instead of 150.

### Notes

- Below 32 weeks gestation there is no gestational-age blood-pressure centile
  table. Those weeks report published **observed ranges** and the
  MAP ≈ gestational-age-in-weeks rule, and are labelled as ranges everywhere.
  Percentiles were deliberately not extrapolated into a range that was never
  measured.

---

## 3.0.x — earlier work (pre-changelog)

Releases before this file existed were not individually recorded. Notable work
on the 3.0 line:

- Feed plan with static and increasing schedules, and IV calories counted
  correctly alongside enteral feeds.
- Energy and protein broken down by source, including human-milk fortification,
  IV amino acids and lipid.
- Discharge workflow: mark as discharged, a discharge register, and PDF export
  per baby, per day or per month for MRD retention.
- Print output made legible — the dark theme was printing pale text on white
  paper.
- Local backup card reduced to a single line.
