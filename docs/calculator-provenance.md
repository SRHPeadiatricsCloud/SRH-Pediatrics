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

## Blood-pressure centile calculator

The calculator has three explicit workflows and does not merge neonatal and paediatric ranges:

- **Paediatrics (1–17 completed years):** AAP 2017 Clinical Practice Guideline Tables 4–5, derived from normal-weight children, with sex, age and measured height. The implementation stores the published height columns (5th, 10th, 25th, 50th, 75th, 90th and 95th height percentiles) and the published 50th, 90th and 95th BP values. The measured height is mapped to the nearest published height column; it is not silently interpolated. The 95th + 12 mmHg threshold is calculated exactly as specified by AAP. AAP 2017 does **not** publish a 5th BP centile in Tables 4–5, so that requested row is shown as “not reported” rather than being invented. For ages 13–17, the result shows the centile rows but classifies using the AAP fixed adolescent thresholds (120/80, 130/80 and 140/90). SBP and DBP are classified independently, and the higher category is reported.
- **Preterm:** Indian term/preterm neonatal normative data from Samanta et al., *Indian Pediatrics* 2015;52:669–673. The supported source population is 32–36 weeks’ gestation at birth and postnatal days 4, 7 and 14. Gestational-age-specific 10th, 50th, 90th and 95th SBP/DBP values are shown; the 5th centile is the study’s status-wide preterm value for the selected day.
- **Neonate / term newborn:** The same Indian study, for 37–40 weeks’ gestation at birth and postnatal days 4, 7 and 14. Sex remains a required record field, but the study reported no significant male/female difference. The term 5th centile is status-wide for the selected day, while 50th/90th/95th are gestational-age-specific. No neonatal “95th +12” or universal stage-2 boundary is asserted.

Sources visible in the workflow:

- [AAP 2017 pediatric BP guideline](https://publications.aap.org/pediatrics/article/140/3/e20171904/38358/Clinical-Practice-Guideline-for-Screening-and)
- [Samanta et al. Normative Blood Pressure Data for Indian Neonates](https://www.indianpediatrics.net/aug2015/aug-669-673.htm)
- [Narang et al. Indian school-child oscillometric centiles](https://indianpediatrics.net/nov2015/939.pdf) — useful Indian comparison, not the height-specific AAP source
- [Neonatal Blood Pressure Standards: What Is “Normal”?](https://www.nccwebsite.org/content/documents/courses/Neonatal%20BP%20standards-1.pdf) — standard neonatal reference review highlighting gestation, postnatal age, birth weight, illness, sex and measurement effects
- NNF / IAP neonatal guidance is presented as clinical context; this implementation does not label a secondary table as an NNF-published universal centile standard because a definitive NNF table was not verified.

Safety wording is intentional: neonatal measurements are population references from a selected, stable Indian study and are not universally diagnostic. Use the correct cuff and limb, repeat unexpected values, and correlate SBP/DBP with perfusion, symptoms, illness, treatment and local protocol. The bedside MAP ≈ gestational-age rule is not used as a substitute for centile data.
