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

## 3.1.2

Feeds & fluids audited end to end. The arithmetic was already correct — what was
missing was that an incomplete or wrong input still produced a confident number.
Every silent assumption in the calculation now announces itself.

### Fixed

- **Unrecognised feed type** was quietly priced as EBM (0.67 kcal/ml, 0.011 g
  protein/ml). It now says so and names the density actually used. Same for feeds
  recorded with no feed type at all.
- **Double counting**: a feed type already priced as fortified milk (`EBM + HMF`)
  with a fortifier sachet recorded on top added the fortifier energy twice, with
  no warning. It is now flagged.
- **Dextrose % with no IV volume** silently dropped the dextrose energy — GIR came
  out as 0 and nothing explained why.
- **Volumes above the 250 ml/kg/day cap** were clamped without a word, so a typed
  300 became 250 and the GIR was quietly derived from 250.
- **A fortifier on continuous or on-demand feeds** with no "times per day" was
  credited to 1 dose/day — roughly a tenth of the real intake — with no warning.
- **A fortifier with no enteral volume** claimed the volume was "capped" when
  there was none; it now says there is nothing to count against.
- **A fortifier with no weight on record** was credited to the whole enteral
  volume; that is an upper bound and is now labelled as one.
- **The feed plan's own findings** (total above the TFI target, TFI or increase
  clamped, no frequency to split the day) only appeared inside the feed tab. They
  now travel with the calculation, so the discharge sheet, print archive and
  daily progress show them too.
- **Per-feed volume never resolved** for any caller that passed a weight, because
  `calcNutrition` called the plan resolver without one.
- **A manual GIR that contradicts dextrose % × IV** by 1 mg/kg/min or more, and
  **a stale manual energy** more than 5 kcal/kg/day from what the inputs
  calculate, are now both flagged.
- **A stored total that disagrees with enteral + IV** is reconciled out loud.
- **The enteral volume field** looked editable while the feed plan was driving it:
  typing was discarded on screen but still written to the chart. It is now locked
  with the reason shown, and the saved record stores the volume the calculation
  actually used.
- **`Total ~ 0 ml/day`** was shown for a baby with no weight; it now says the
  weight is missing.

Verified by `scripts/test-fluids-reliability.ts` (37 checks) — all 14 new guards
are absent on the previous calculator — plus a rendered `FluidsTab` test and the
unchanged arithmetic invariants (reference case still 147.5 kcal/kg/day,
4.65 g/kg/day protein).

---

## 3.1.1

Existing feature rewritten with corrected product data, so the patch segment moves.

### Fixed

- **LHMF is Lactodex HMF** (Raptakos Brett), not a generic "low-mineral" fortifier.
  The catalogue entry now carries the pack-label values: **3.37 kcal and 0.27 g
  protein per 1 g sachet**, one sachet reconstituted in **25 ml** of human milk
  (was 4.3 kcal / 0.33 g, borrowed from the Nutricia class of sachet).
- **MMF is NeoLact MMF Plus**, the human-milk-derived fortifier: **3.89 kcal and
  0.27 g protein per 1 g sachet**, one sachet in 25 ml (was also 4.3 / 0.33).
- **PreNAN HMF sachet added** as its own product — 4 kcal and 0.3 g protein per
  1 g sachet. PreNAN FM 85 stays in the list, relabelled as powder and marked as
  a preterm follow-up formula rather than an HMF sachet, because its 4.35 kcal/g
  is a feed density, not a fortifier density.
- Per-baby overrides (`fortifierKcalPerUnit` / `fortifierProteinPerUnit`) still win
  over the catalogue, so any chart already carrying its own values is untouched.

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
