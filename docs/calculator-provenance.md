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
- The score has six neuromuscular and six physical findings. Genitalia are selected using the sex-appropriate row rather than adding male and female rows together. The official grid runs from score −10 = 20 weeks to score 50 = 44 weeks. Intermediate scores use the official completed-week convention: interpolate between the grid points and round down (for example, 27 = 34 weeks and 28 = 35 weeks), rather than applying a linear formula that implies false precision. See the [official Ballard conversion guidance](https://www.ballardscore.com/CatalogView/FAQ).
- The examination remains a clinical estimate and should be correlated with reliable early ultrasound or menstrual dating. NCBI background: [Ballard and Dubowitz assessments](https://www.ncbi.nlm.nih.gov/books/NBK613281/).

## Paediatric burns and Parkland calculation

- The graphical estimator uses age-specific Lund–Browder values from the University of South Alabama pediatric chart: [Infant/Pediatric Lund and Browder chart](https://www.southalabama.edu/colleges/com/departments/surgery/resources/burn-initial/lund-and-browder-pediatric.pdf).
- It distinguishes age bands from birth through adulthood, includes the head/neck, trunk, arms, legs, feet, buttocks and genitalia, and supports full-region selection. Partial areas still require clinician estimation or the patient-palm method.
- The calculator offers 3 ml/kg/%TBSA modified paediatric Parkland and 4 ml/kg/%TBSA classic Parkland. It gives half in the first 8 hours from injury, half over the next 16 hours, adds paediatric maintenance separately, and reminds the user to subtract fluid already given and count only partial/full-thickness burns. Fluid is a starting estimate and must be titrated by a burn team.
- ABA referral guidance remains relevant for transfer decisions: [American Burn Association referral guidelines](https://www.ameriburn.org/burn-care-team/resources/guidelines-for-burn-patient-referral).

## Neonatal ponderal index

- The implementation is `100 × birth weight (g) / length³ (cm)`, avoiding the previous metre/centimetre unit mismatch that produced values around 20,000–30,000. Formula evidence: [PubMed 9491856](https://pubmed.ncbi.nlm.nih.gov/9491856/).
- The displayed 2.2–3.0 band is labelled only as a commonly used screening band. Ponderal index is proportionality screening, not a diagnosis, and should be compared with gestational-age/sex-specific references because there is no universal cutoff for every population or gestation.

## Clinical calculator UX review

Reviewed 11 September 2026 against representative point-of-care tools and human-factors guidance. This was a targeted review of authoritative and widely used resources, not a claim that every calculator on the internet was exhaustively audited.

- [MDCalc](https://www.mdcalc.com/calc/43/creatinine-clearance-cockcroft-gault-equation) separates instructions, required versus optional inputs, the result, next steps, evidence, creator context, and pitfalls. SRH now keeps the result visually prominent while retaining the citation and safety context in the same workflow.
- [PediTools AAP 2022 bilirubin](https://peditools.org/bili2022/) demonstrates newborn-centric plots, multiple measurements for trend review, rate-of-rise, post-discharge follow-up, and explicit TcB-to-TSB confirmation flags. These are the design targets for future bilirubin iterations; local phototherapy charts remain visibly separate from the AAP tool.
- [PediTools usability redesign notes](https://www.incidentalfindings.org/posts/2022-09-04_improving-bili-2022-usability/) support showing the patient-specific gestational-age curve and multiple action thresholds together rather than forcing bedside users to switch between plots.
- [Calculate by QxMD](https://play.google.com/store/apps/details?id=com.qxmd.calculate&hl=en) emphasizes specialty discovery, question-flow entry, SI/conventional units, and linked references. SRH adopts the useful parts—search, clinical-area navigation, saved tools, recent tools, guided entry, and source links—without requiring an account or hiding the calculation behind advertising.
- [AHRQ Electronic Health Record Usability: Interface Design Considerations](https://digital.ahrq.gov/sites/default/files/docs/citation/09-10-0091-2-EF.pdf) and [NIST Technical Basis for User Interface Design of Health IT](https://nvlpubs.nist.gov/nistpubs/gcr/2015/NIST.GCR.15-996.pdf) reinforce task-focused layouts, readable information hierarchy, error prevention, and evaluation against clinical cognitive workload. The calculator workflow now validates numeric ranges before enabling interpretation, gives field-level errors, supports keyboard search, and keeps privacy behavior intact.

These UX sources inform presentation only. They do not override the primary clinical source or local policy for any calculator. Where a threshold, score, reference population, or management recommendation varies, the interface must expose that limitation rather than silently choosing a universal rule.
