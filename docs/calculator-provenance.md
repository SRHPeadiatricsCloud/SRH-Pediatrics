# Calculator provenance and clinical-safety notes

Updated 11 September 2026 for release 2.0.032. These references support the calculator-tab corrections; they do not replace local protocols, specialist review, or bedside examination.

## Downes score

- Downes JJ, Vidyasagar D, Boggs TR Jr, Morrow GM. *Respiratory distress syndrome of newborn infants. I. New clinical scoring system with acid-base and blood-gas correlations.* Clinical Pediatrics. 1970;9(6):325–331.
- Recent peer-reviewed evidence describes the five 0–2 domains, the 0–10 total, and the commonly used threshold of 4 for respiratory-support decisions: [Nature / Journal of Perinatology, 2024](https://www.nature.com/articles/s41372-024-02086-z).
- The app uses 0 = no distress, 1–4 = mild, 5–7 = moderate, and 8–10 = severe/impending failure as a bedside interpretation. Thresholds vary by population and protocol, so the result explicitly requires serial clinical assessment, SpO₂/FiO₂ and blood-gas correlation.

## Retinopathy of prematurity

- The app follows the Type 1 treatment pattern in the AAP/AAO policy statement: Zone I any stage with plus, Zone I stage 3 without plus, and Zone II stage 2 or 3 with plus. The statement also defines plus disease using posterior-vessel dilation and tortuosity and emphasizes prompt treatment: [AAP Pediatrics policy statement](https://publications.aap.org/pediatrics/article/142/6/e20183061/37478/Screening-Examination-of-Premature-Infants-for).
- Classification terminology is aligned with the third International Classification of ROP (ICROP3, 2021). Stage 4–5 results are presented as retinal-detachment emergencies requiring vitreoretinal referral rather than being incorrectly labelled as routine laser/anti-VEGF output.
- Pre-plus is kept distinct from plus. The visual guide is schematic only and never substitutes for a dilated retinal examination.

## New Ballard score

- Scoring domains and the conversion grid come from the official score sheet: [New Ballard Score sheet](https://www.ballardscore.com/files/BallardScore_scoresheet.pdf).
- The score has six neuromuscular and six physical findings. Genitalia are selected using the sex-appropriate row rather than adding male and female rows together. The official grid runs from score −10 = 20 weeks to score 50 = 44 weeks; the computer estimate uses the equivalent `floor(24 + 0.4 × score)` and reports completed weeks to avoid false precision.
- The examination remains a clinical estimate and should be correlated with reliable early ultrasound or menstrual dating. NCBI background: [Ballard and Dubowitz assessments](https://www.ncbi.nlm.nih.gov/books/NBK613281/).

## Paediatric burns and Parkland calculation

- The graphical estimator uses age-specific Lund–Browder values from the University of South Alabama pediatric chart: [Infant/Pediatric Lund and Browder chart](https://www.southalabama.edu/colleges/com/departments/surgery/resources/burn-initial/lund-and-browder-pediatric.pdf).
- It distinguishes age bands from birth through adulthood, includes the head/neck, trunk, arms, legs, feet, buttocks and genitalia, and supports full-region selection. Partial areas still require clinician estimation or the patient-palm method.
- The calculator offers 3 ml/kg/%TBSA modified paediatric Parkland and 4 ml/kg/%TBSA classic Parkland. It gives half in the first 8 hours from injury, half over the next 16 hours, adds paediatric maintenance separately, and reminds the user to subtract fluid already given and count only partial/full-thickness burns. Fluid is a starting estimate and must be titrated by a burn team.
- ABA referral guidance remains relevant for transfer decisions: [American Burn Association referral guidelines](https://www.ameriburn.org/burn-care-team/resources/guidelines-for-burn-patient-referral).

## Neonatal ponderal index

- The implementation is `100 × birth weight (g) / length³ (cm)`, avoiding the previous metre/centimetre unit mismatch that produced values around 20,000–30,000. Formula evidence: [PubMed 9491856](https://pubmed.ncbi.nlm.nih.gov/9491856/).
- The displayed 2.2–3.0 band is labelled only as a commonly used screening band. Ponderal index is proportionality screening, not a diagnosis, and should be compared with gestational-age/sex-specific references because there is no universal cutoff for every population or gestation.
