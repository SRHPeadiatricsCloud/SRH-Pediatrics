# Fenton LMS extracts

These CSV files are the source rows used by the bundled Fenton workflows:

- `fenton-2013-lms.csv` — Fenton 2013 second-generation exact-age calculator rows
- `fenton-2025-lms.csv` — Fenton 2025 third-generation exact-age calculator rows

The rows were extracted from the official University of Calgary calculator workbooks, not digitized from chart images:

- [Fenton 2013 calculator downloads](https://ucalgary.ca/resource/preterm-growth-chart/calculators-apps)
- [Fenton 2025 calculator downloads](https://ucalgary.ca/resource/preterm-growth-chart/calculators-apps)
- [Fenton 2013 workbook URL](https://ucalgary.ca/live-uc-ucalgary-site/sites/default/files/teams/418/clinical-exact-age-calculator-fenton-2013-growth-chart-v7.xlsx)
- [Fenton 2025 workbook URL](https://ucalgary.ca/live-uc-ucalgary-site/sites/default/files/teams/418/2025%20Fenton%20Growth%20Chart%20Clinical%20Calculator%20v1.1.xlsx)

The extracts are preserved in the same `chart, age, age_units, gender, measure,
measure_units, L, M, S` format used by the public source extraction. The
runtime TypeScript table converts only the weight median from grams to kilograms
to match the calculator input unit; L and S are unchanged.

The upstream extraction reference is
`OpenDataArchive/raw-data@3d8322712b40bf61d3fb8297d2fdd33ae6b5a556`.
No patient data is present.
