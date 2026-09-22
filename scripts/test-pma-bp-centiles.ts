/**
 * Neonatal Blood Pressure Centiles by Postconceptional Age (PMA / PCA 26-44 weeks).
 *
 * Verifies exact lookup values against the NICU Reference Chart:
 * 50th, 95th, 99th percentiles for SBP, DBP, MAP across all 10 PMA age rows.
 *
 * Run with: npx tsx scripts/test-pma-bp-centiles.ts
 */
import assert from "node:assert/strict";
import {
  NEONATAL_PMA_BP_CENTILES,
  calculatePmaBp,
  nearestPmaWeeks,
} from "../src/lib/bpCentiles";

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

// 1. Verify exact chart entries
const expectedRows: [number, [number, number, number], [number, number, number], [number, number, number]][] = [
  // PMA, [SBP_50, DBP_50, MAP_50], [SBP_95, DBP_95, MAP_95], [SBP_99, DBP_99, MAP_99]
  [44, [88, 50, 63], [105, 68, 80], [110, 73, 85]],
  [42, [85, 50, 62], [98, 65, 76], [102, 70, 81]],
  [40, [80, 50, 60], [95, 65, 75], [100, 70, 80]],
  [38, [77, 50, 59], [92, 65, 74], [97, 70, 79]],
  [36, [72, 50, 57], [87, 65, 72], [92, 70, 71]],
  [34, [70, 40, 50], [85, 55, 65], [90, 60, 70]],
  [32, [68, 40, 48], [83, 55, 62], [88, 60, 69]],
  [30, [65, 40, 48], [80, 55, 65], [85, 60, 68]],
  [28, [60, 38, 45], [75, 50, 58], [80, 54, 63]],
  [26, [55, 30, 38], [72, 50, 57], [77, 56, 63]],
];

for (const [pma, p50, p95, p99] of expectedRows) {
  const row = NEONATAL_PMA_BP_CENTILES[pma];
  ok(row, `row exists for PMA ${pma}`);
  assert.deepEqual([row.p50.sbp, row.p50.dbp, row.p50.map], p50, `PMA ${pma} 50th centile`);
  assert.deepEqual([row.p95.sbp, row.p95.dbp, row.p95.map], p95, `PMA ${pma} 95th centile`);
  assert.deepEqual([row.p99.sbp, row.p99.dbp, row.p99.map], p99, `PMA ${pma} 99th centile`);
}

// 2. Test nearest PMA helper
assert.equal(nearestPmaWeeks(26), 26);
assert.equal(nearestPmaWeeks(27), 26);
assert.equal(nearestPmaWeeks(29), 28);
assert.equal(nearestPmaWeeks(35), 34);
assert.equal(nearestPmaWeeks(43), 42);
assert.equal(nearestPmaWeeks(45), 44);
checks += 6;

// 3. Test calculation and classification logic
const normalBaby = calculatePmaBp({ pmaWeeks: 32, sbp: 70, dbp: 45, map: 52 });
ok(normalBaby.classification.sbp.category === "normal", "SBP 70 at 32 wk is normal (<95th: 83)");
ok(normalBaby.classification.dbp.category === "normal", "DBP 45 at 32 wk is normal (<95th: 55)");
ok(normalBaby.classification.overall.category === "normal", "Overall normal");

const elevatedBaby = calculatePmaBp({ pmaWeeks: 32, sbp: 84, dbp: 50, map: 61 });
ok(elevatedBaby.classification.sbp.category === "stage1", "SBP 84 at 32 wk is between 95th and 99th (83-88)");
ok(elevatedBaby.classification.overall.category === "stage1", "Overall stage 1");

const severeBaby = calculatePmaBp({ pmaWeeks: 32, sbp: 90, dbp: 62, map: 71 });
ok(severeBaby.classification.sbp.category === "stage2", "SBP 90 at 32 wk is >=99th (88)");
ok(severeBaby.classification.overall.category === "stage2", "Overall stage 2");

console.log(`NICU PMA BP centiles tests passed (${checks} checks)`);
