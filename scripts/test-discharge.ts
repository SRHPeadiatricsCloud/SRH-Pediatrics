/**
 * Discharge register & MRD archive — grouping, dating and export selection.
 *
 * The archive groups by LOCAL calendar day. The unit runs on IST (+05:30), so a
 * discharge signed after 18:30 IST falls on the next UTC date; slicing an ISO
 * string would file it a day late and the "same day" batch would miss it.
 * Pinning TZ here makes that regression detectable on any machine.
 *
 * Run with: npx tsx scripts/test-discharge.ts
 */
process.env.TZ = "Asia/Kolkata";

import assert from "node:assert/strict";
import type { DischargeOutcome } from "../src/lib/clinical";
import {
  buildDischargeRecord,
  dayOf,
  dischargeDay,
  dischargeOf,
  fileSlug,
  formatDayLabel,
  formatMonthLabel,
  groupByDay,
  groupByMonth,
  isDischarged,
  isoDay,
  lengthOfStayDays,
  monthKey,
  monthOf,
  parseIdList,
  type Archivable,
} from "../src/lib/discharge";

const mk = (
  id: number,
  uhid: string,
  babyName: string,
  status: string,
  at?: string,
  extra: Partial<Archivable> = {},
): Archivable => ({
  id,
  uhid,
  babyName,
  status,
  dob: extra.dob ?? null,
  updatedAt: extra.updatedAt ?? null,
  clinical: at ? { dischargeRecord: { at, date: isoDay(at), outcome: "discharged", summary: "", signedBy: "SN Kavita" } } : undefined,
  ...extra,
});

/* --- 1. Local-day dating -------------------------------------------------- */
// The same instant is 19:00 on the 19th in UTC and 00:30 on the 20th in IST.
const eveningUtc = "2026-09-19T19:00:00.000Z";
assert.equal(isoDay(eveningUtc), "2026-09-20", "an evening IST discharge must file under the IST day");
assert.notEqual(isoDay(eveningUtc), eveningUtc.slice(0, 10), "must not be a UTC slice of the ISO string");
assert.equal(isoDay(new Date(2026, 8, 19, 0, 0)), "2026-09-19", "start of local day");
assert.equal(isoDay(new Date(2026, 8, 19, 23, 59)), "2026-09-19", "end of local day");
assert.equal(isoDay(new Date(2026, 0, 5, 12, 0)), "2026-01-05", "zero-padded month and day");
assert.equal(isoDay("not a date"), "", "unparseable input yields no day");

assert.equal(monthKey("2026-09-20"), "2026-09");
assert.equal(monthKey("2026-01-01"), "2026-01");
assert.equal(monthKey("garbage"), "");
assert.equal(monthKey(""), "");

/* --- 2. Labels ------------------------------------------------------------ */
assert.equal(formatDayLabel("2026-09-19"), "Sat, 19 Sep 2026");
assert.equal(formatDayLabel("2026-09-20"), "Sun, 20 Sep 2026");
assert.equal(formatMonthLabel("2026-09"), "September 2026");
assert.equal(formatMonthLabel("2026-12"), "December 2026");
assert.equal(formatDayLabel(""), "Undated");
assert.equal(formatMonthLabel(""), "Undated");

/* --- 3. isDischarged / dischargeOf --------------------------------------- */
assert.equal(isDischarged(mk(1, "U1", "A", "discharged")), true);
assert.equal(isDischarged(mk(2, "U2", "B", "transferred")), true);
assert.equal(isDischarged(mk(3, "U3", "C", "death")), true);
assert.equal(isDischarged(mk(4, "U4", "D", "active")), false, "active babies stay on the live board");
assert.equal(isDischarged(mk(5, "U5", "E", "deleted")), false, "deleted is not a discharge");
assert.equal(dischargeOf(mk(6, "U6", "F", "active")), null);
assert.equal(dischargeOf(mk(7, "U7", "G", "discharged", eveningUtc))?.signedBy, "SN Kavita");

/* --- 4. Day grouping ------------------------------------------------------ */
const rows: Archivable[] = [
  mk(1, "NICU-10", "Older", "discharged", "2026-09-18T04:00:00.000Z"),
  mk(2, "NICU-2", "SecondSameDay", "discharged", "2026-09-20T05:00:00.000Z"),
  mk(3, "NICU-1", "FirstSameDay", "discharged", "2026-09-20T09:00:00.000Z"),
  mk(4, "NICU-3", "StillIn", "active"),
  mk(5, "NICU-4", "Deleted", "deleted"),
  mk(6, "NICU-5", "LastMonth", "transferred", "2026-08-30T05:00:00.000Z"),
];
const days = groupByDay(rows);
assert.deepEqual(
  days.map((d) => d.day),
  ["2026-09-20", "2026-09-18", "2026-08-30"],
  "newest local day first; active and deleted excluded",
);
assert.deepEqual(
  days[0].babies.map((b) => b.uhid),
  ["NICU-1", "NICU-2"],
  "same-day babies sort by UHID, numeric-aware, so a printed batch is stable",
);
assert.equal(days[0].babies.length, 2, "both babies that left on the 20th are in one day batch");

/* --- 5. Month grouping ---------------------------------------------------- */
const months = groupByMonth(rows);
assert.deepEqual(
  months.map((m) => m.month),
  ["2026-09", "2026-08"],
  "newest month first",
);
assert.equal(months[0].babies.length, 3, "September holds three discharges");
assert.equal(months[0].days.length, 2, "September spans two days");
assert.deepEqual(months[0].names, ["FirstSameDay", "SecondSameDay", "Older"], "names follow discharge order");
assert.equal(months[1].babies.length, 1);
assert.equal(monthOf(rows, "2026-08")?.babies[0].babyName, "LastMonth");
assert.equal(monthOf(rows, "1999-01"), null, "an unknown month is null, not a crash");
assert.deepEqual(
  dayOf(rows, "2026-09-20").map((b) => b.id),
  [3, 2],
  "dayOf matches the day grouping order",
);
assert.deepEqual(dayOf(rows, "2026-01-01"), [], "an empty day is an empty list");

/* --- 6. Undated discharges are kept, not dropped -------------------------- */
const undated = groupByDay([
  mk(1, "NICU-9", "NoDate", "discharged"),
  mk(2, "NICU-8", "Dated", "discharged", "2026-09-20T05:00:00.000Z"),
]);
assert.equal(undated.at(-1)?.day, "", "an undated group sorts last under an empty key");
assert.equal(undated.at(-1)?.babies[0].babyName, "NoDate");
assert.equal(undated.length, 2);
// A record with no date but a timestamp still files under that timestamp's day.
const fromAt = mk(7, "NICU-7", "FromAt", "discharged");
fromAt.clinical = { dischargeRecord: { at: "2026-09-20T05:00:00.000Z", date: "", outcome: "discharged", summary: "", signedBy: "X" } };
assert.equal(dischargeDay(fromAt), "2026-09-20", "falls back to the record timestamp");
const fromUpdated = mk(8, "NICU-8", "FromUpdated", "discharged", undefined, { updatedAt: "2026-09-19T05:00:00.000Z" });
assert.equal(dischargeDay(fromUpdated), "2026-09-19", "then to updatedAt");
assert.equal(dischargeDay(mk(9, "NICU-9", "Nothing", "discharged")), "", "then to nothing");

/* --- 7. Length of stay ---------------------------------------------------- */
const los = mk(10, "NICU-10", "Los", "discharged", "2026-09-20T00:00:00.000Z", { dob: "2026-09-10T00:00:00.000Z" });
assert.equal(lengthOfStayDays(los), 10);
assert.equal(lengthOfStayDays(mk(11, "NICU-11", "NoDob", "discharged", "2026-09-20T00:00:00.000Z")), null);
assert.equal(
  lengthOfStayDays(mk(12, "NICU-12", "Negative", "discharged", "2026-09-01T00:00:00.000Z", { dob: "2026-09-10T00:00:00.000Z" })),
  null,
  "a discharge before birth is not a negative stay",
);

/* --- 8. Building a record ------------------------------------------------- */
const at = new Date(2026, 8, 20, 16, 30);
const built = buildDischargeRecord({ outcome: "transferred", summary: "  sent out  ", signedBy: " Dr. Rao ", at });
assert.equal(built.outcome, "transferred");
assert.equal(built.date, "2026-09-20", "the stored date is the local day of the signed time");
assert.equal(built.summary, "sent out", "summary is trimmed");
assert.equal(built.signedBy, "Dr. Rao", "signatory is trimmed");
assert.equal(built.at, at.toISOString());
assert.equal(buildDischargeRecord({ outcome: "nonsense" as DischargeOutcome, at }).outcome, "discharged", "unknown outcome falls back safely");
assert.equal(buildDischargeRecord({ at }).signedBy, "");
const defaults = buildDischargeRecord({ at });
assert.equal(defaults.date, isoDay(at));

/* --- 9. Export selection -------------------------------------------------- */
assert.deepEqual(parseIdList("3,1,3,x,-2, 7"), [3, 1, 7], "de-duplicated, order kept, junk rejected");
assert.deepEqual(parseIdList("12"), [12]);
assert.deepEqual(parseIdList(""), []);
assert.deepEqual(parseIdList(null), []);
assert.deepEqual(parseIdList("0,1.5,2"), [2], "only positive integers");

/* --- 10. Filenames -------------------------------------------------------- */
assert.equal(fileSlug("Baby of Lakshmi"), "Baby-of-Lakshmi");
assert.equal(fileSlug("  Ravi / Kumar  "), "Ravi-Kumar");
assert.equal(fileSlug(""), "baby");

console.log("Discharge archive tests passed (local-day grouping, monthly roll-up, export selection)");
