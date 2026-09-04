# Description Priority Calibration Report: Batch 1

> Private workflow material. Batch 1 contains 24 deliberately selected calibration records. It is NOT a random or statistically representative sample. Percentages describe this calibration batch only. Human reason codes were assigned during the same human review and are descriptive rationale, not independent validation features. No result in this report constitutes historical evidence. No scoring change is authorized by this report.

## 1. Overall calibration summary

Batch 1 records: 24.

Current Human Review catalog: reviewed 24, unreviewed 48.

Classification: good-candidate 14, structured-only 2, supporting-or-duplicate 0, low-value 7, uncertain 1.

Batch 1 humanPriority: high 9, medium 6, low 9.

Records outside the fixed Batch 1 set are excluded from Batch 1 percentage denominators.

## 2. Tier calibration

### Tier A

Reviewed: 7

Classification: good 5, structured 1, supporting 0, low 1, uncertain 0.

Human priority: high 3, medium 2, low 2.

Good-candidate rate: 5 / 7 = 71.4%. Low-human-priority rate: 2 / 7 = 28.6%.

### Tier B

Reviewed: 7

Classification: good 6, structured 1, supporting 0, low 0, uncertain 0.

Human priority: high 5, medium 1, low 1.

Good-candidate rate: 6 / 7 = 85.7%. Low-human-priority rate: 1 / 7 = 14.3%.

### Tier C

Reviewed: 6

Classification: good 3, structured 0, supporting 0, low 2, uncertain 1.

Human priority: high 1, medium 3, low 2.

Good-candidate rate: 3 / 6 = 50.0%. Low-human-priority rate: 2 / 6 = 33.3%.

### Tier D

Reviewed: 4

Classification: good 0, structured 0, supporting 0, low 4, uncertain 0.

Human priority: high 0, medium 0, low 4.

Good-candidate rate: 0 / 4 = 0.0%. Low-human-priority rate: 4 / 4 = 100%.

These deliberately selected records are not an unbiased precision sample. The observed Batch 1 facts do not establish that Tier B is globally better than Tier A. Batch 1 did not show a simple monotonic relationship where all A judgments were stronger than all B judgments.

## 3. Bracketed-name diagnostic

For this diagnostic only, bracketed means `sourceName.startsWith("（")`.

Bracketed: 8; classification good 0, structured 1, supporting 0, low 7, uncertain 0; humanPriority high 0, medium 0, low 8. Bracketed good-candidate: 0 / 8 = 0%. Bracketed low-priority: 8 / 8 = 100%.

Non-bracketed: 16; classification good 14, structured 1, supporting 0, low 0, uncertain 1; humanPriority high 9, medium 6, low 1. Non-bracketed good-candidate: 14 / 16 = 87.5%.

This is a strong Batch-1 calibration signal that bracketed labels may need a downward WORKFLOW PRIORITY adjustment. It does not show that bracketed labels are historically worthless, should be deleted or hidden from source data, are duplicates, or that every future bracketed record must be low-value. This concerns Description Priority triage only and is separate from the runtime progressive-reveal rule introduced in PR #80.

## 4. Low-information and generic-name diagnostic

`low-information-name`: 9 reviewed records; all 9 have humanPriority low and none is good-candidate.

`generic-name`: 4 reviewed records; all 4 have humanPriority low and none is good-candidate.

These are same-review rationale correlations, not independent validation. They are Batch 1 rationale patterns worth comparing against records outside the fixed Batch 1 set.

## 5. needs-evidence diagnostic

`needs-evidence`: 4 records: 3 good-candidate and 1 uncertain; all have humanPriority medium. It must not become a negative-value penalty by itself. It indicates that research or evidence work remains necessary while a candidate may still be valuable.

## 6. historically-recognizable diagnostic

`historically-recognizable`: 9 records; all 9 are good-candidate with humanPriority high. This is human-review rationale, not an independently validated automatic feature, and is not converted into a scoring rule here.

## 7. noMultiMemberSourceRelation analysis

The frozen Priority reason `no-multi-member-source-relation` appears on 24 / 24 Batch 1 records and 72 / 72 frozen candidates. Within the frozen 72-candidate sample this feature has no variance. Therefore Batch 1 CANNOT determine whether the +10 weight is useful, harmful, or neutral, and does not support removing it. The feature may still have affected WHICH records entered the frozen 72 from the larger source population. Evaluation requires a later counterfactual analysis against the pre-selection or full candidate universe and is out of scope.

## 8. Tier A higher-tier mismatch

A higher-tier mismatch means a Tier A calibration record not classified good-candidate; it is not a statement of historical truth. Batch 1 has 2 / 7 = 28.6%: one structured-only and one low-value, both humanPriority low.

- sourceIndex 4685: （御行松） (structured-only, low)
- sourceIndex 5263: （石碑） (low-value, low)

Their frozen Tier A values remain unchanged.

## 9. Tier C lower-tier good-candidate

C lower-tier good-candidate: 3 / 6 = 50%.

- sourceIndex 144: 五番町 (good-candidate, medium)
- sourceIndex 116: 一橋殿 (good-candidate, high)
- sourceIndex 5814: 筆学所　文淵堂 (good-candidate, medium)

These are candidates for later Priority-model analysis, not automatic promotions of these or other Tier C records.

## 10. Tier D diagnostic

Batch 1 Tier D has 4 / 4 low-value and 4 / 4 humanPriority low; all four source names are （坂道）. This is consistent with current D treatment for this specific supplemental pattern and is not generalized to every future Tier D record.

## 11. Sampling limitation

Frozen 72 was constructed as 9 categories x 8 candidates before global interpretation. Batch 1 was then deliberately selected for calibration contrast. This is not random sampling; tier percentages are not population precision or recall estimates; category prevalence is artificial; confidence intervals and statistical-significance claims would be misleading and are not calculated.

## 12. Conclusions: evidence strength

### STRONG BATCH-1 SIGNALS

- Bracketed names correlate strongly with low review priority in Batch 1.
- Low-information-name cases in this batch are consistently low.
- Current D handling fits the four reviewed supplemental （坂道） records.
- Some C records are clearly useful explanation candidates.

### PROVISIONAL / NEEDS MORE REVIEW

- A versus B relative calibration.
- Generic-name handling beyond the reviewed examples.
- Category-specific weighting.
- Whether named houses or person-linked records deserve promotion.

### NOT IDENTIFIABLE FROM BATCH 1

- Usefulness of the `noMultiMemberSourceRelation` +10 weight.
- Global accuracy, precision, or recall of Priority v1.
- Correct final numerical Priority v2 weights.

## 13. Further Human Review recommendation

Complete the remaining 48 unreviewed catalog records under the SAME frozen Priority v1 before changing scoring weights; changing v1 now would contaminate comparison between algorithm prediction and human judgment. Useful contrast families in records outside Batch 1 include repeated generic names such as 植木屋, repeated generic facilities such as 腰掛, Tier A 寺社, B water or geographic names, C 町村字, and C 屋敷地. This is review planning only; no classification or humanPriority is assigned automatically.
