/**
 * The Feeds & fluids tab, rendered in a DOM.
 *
 * The pure arithmetic behind this tab is covered by test-feed-guide.ts and
 * test-fluids-reliability.ts. What those cannot see is whether the redesign
 * actually reaches the screen: the pathway strip, the one-click prescription,
 * the "running now" summary, the fields the feed plan locks, the feed-due
 * clock, and what the Save button really writes. Those are asserted here
 * against the real component, not a copy of it.
 *
 * Needs jsdom and esbuild (both devDependencies). The component is bundled to
 * CJS from scripts/fixtures/fluids-tab-entry.tsx with React marked external so
 * the component and the renderer share one React instance.
 *
 * Run with: node scripts/test-fluids-tab.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
// Inside the repo, and inside .next (already gitignored): the bundle `require`s
// React, and Node resolves that by walking up from the bundle's own directory,
// so a bundle in /tmp cannot find node_modules.
const work = path.join(ROOT, ".next", "fluids-tab-test");
mkdirSync(work, { recursive: true });
const bundle = path.join(work, "bundle.cjs");

try {
  execFileSync(
    path.join(ROOT, "node_modules/.bin/esbuild"),
    [
      path.join(ROOT, "scripts/fixtures/fluids-tab-entry.tsx"),
      "--bundle", "--format=cjs", "--platform=node", "--jsx=automatic",
      "--loader:.css=empty",
      "--external:react", "--external:react-dom", "--external:react/jsx-runtime",
      `--alias:@=${path.join(ROOT, "src")}`,
      `--outfile=${bundle}`,
    ],
    { stdio: "pipe" },
  );
} catch (err) {
  console.error("esbuild could not bundle the tab under test:");
  console.error(err.stderr?.toString() ?? err.message);
  process.exit(1);
}

const { JSDOM } = await import("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
for (const key of [
  "window", "document", "HTMLElement", "HTMLInputElement", "HTMLSelectElement",
  "HTMLButtonElement", "HTMLTextAreaElement", "Element", "Node", "Event",
  "FocusEvent", "MouseEvent", "CustomEvent", "localStorage", "requestAnimationFrame", "cancelAnimationFrame",
]) {
  globalThis[key] = window[key];
}
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// api() will not send a write without a signed-in editor, so sign one in.
window.localStorage.setItem("neo_session", JSON.stringify({ name: "Dr Test", code: "1234", role: "Consultant", unit: "nicu" }));

// The tab fetches the unit protocol on mount. Serve it from the test so the
// layered figures can be exercised without a database.
const unitStore = { protocol: undefined };
const unitRequests = [];
globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  if (target.startsWith("/api/unit-protocol")) {
    if (init.method === "POST") {
      const body = JSON.parse(init.body ?? "{}");
      unitRequests.push(body);
      unitStore.protocol = body.protocol ?? {};
      return { ok: true, status: 200, json: async () => ({ unit: body.unit, row: { protocol: unitStore.protocol } }) };
    }
    return { ok: true, status: 200, json: async () => ({ unit: "nicu", row: unitStore.protocol ? { protocol: unitStore.protocol } : null }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { FluidsTab } = await import(pathToFileURL(bundle).href);

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.log("  FAIL:", msg);
  }
};
const text = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const all = (root, sel) => [...root.querySelectorAll(sel)];
const byText = (root, sel, t) => all(root, sel).find((el) => text(el).toLowerCase().includes(t.toLowerCase()));
const byExact = (root, sel, t) => all(root, sel).find((el) => text(el).toLowerCase() === t.toLowerCase());
const click = (el, what) => {
  if (!el) throw new Error(`element not found to click: ${what}`);
  act(() => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
};
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const setNativeValue = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  setter.call(el, value);
};
/** A plain controlled input: one event is enough. */
const setNative = (el, value, what) => {
  if (!el) throw new Error(`input not found: ${what}`);
  act(() => {
    setNativeValue(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};
/**
 * NumField keeps a local draft while editing and commits on blur, so the two
 * events go in separate act() calls: batching them would let the blur handler
 * see the pre-edit draft and commit nothing.
 */
const typeInto = (el, value, what) => {
  if (!el) throw new Error(`input not found: ${what}`);
  act(() => {
    setNativeValue(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  act(() => {
    el.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
  });
};
/** The input belonging to a NumField with this label. */
const fieldInput = (root, label) => {
  const lbl = all(root, "div.lbl").find((d) => text(d).toLowerCase().startsWith(label.toLowerCase()));
  return lbl?.parentElement?.querySelector("input");
};
/** The input belonging to a unit-protocol row with this label. */
const protocolInput = (root, label) => {
  const row = all(root, "label").find((l) => text(l).toLowerCase().startsWith(label.toLowerCase()));
  return row?.querySelector("input");
};

function detail(fluids, over = {}) {
  return {
    baby: {
      id: 1, uhid: "U1", babyName: "Test", motherName: "M", bed: "B1", sex: "M",
      dob: over.dob ?? new Date(Date.now() - 5 * 86400000).toISOString(),
      gestWeeks: over.gestWeeks ?? 28, gestDays: 0,
      birthWeight: over.birthWeight ?? 1000, currentWeight: over.currentWeight ?? 1000,
      birthLength: 38, birthHc: 26, deliveryMode: "NVD", apgar1: 7, apgar5: 8,
      bloodGroup: "O+", motherBloodGroup: "O+", inborn: true, acuity: "sick",
      status: "admitted", isolation: "none", consultant: "Dr", unit: "nicu",
      subspecialty: "", insurance: "", insuranceName: "",
      clinical: { fluids }, updatedAt: new Date().toISOString(),
    },
    problems: [], vitals: [], events: [], tasks: [], handovers: [], labs: [],
  };
}

async function render(fluids, over = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const saved = [];
  await act(async () => {
    root.render(
      React.createElement(FluidsTab, {
        d: detail(fluids, over),
        patch: async (b) => {
          saved.push(b);
        },
      }),
    );
  });
  return { el: container, saved };
}

/* --- 1. a day-6 VLBW baby: the streamlined layout ------------------------ */
{
  const { el, saved } = await render(
    {
      enteralMlKgDay: 120,
      ivMlKgDay: 0,
      feedType: "Expressed breast milk (EBM)",
      feedFreq: "3 hourly",
      feedRoute: "Oral",
    },
    { currentWeight: 1200, birthWeight: 1100 },
  );
  const t = text(el);
  ok(/Today/.test(t), "the order is the first thing on the tab");
  ok(/Total today/.test(t), "the day's total is on the same card");
  ok(/Use the guideline/.test(t), "one button takes the whole guideline");
  ok(!/Apply today's plan/.test(t) && !/Copy the values only/.test(t), "the old apply buttons are gone");
  ok(!/guideline 150 → use/.test(t), "and there is no per-field adopt link cluttering the grid");
  ok(/Feeds/.test(t) && /IV fluids/.test(t) && /Parenteral nutrition/.test(t), "the inputs are grouped the way an order is written");
  ok(/Feed details & tolerance/.test(t) && /Fortification/.test(t) && /Protocol figures/.test(t),
     "the long tail sits behind disclosures");
  ok(!/How these numbers are worked out/.test(t), "the worked-out panel is gone");
  ok(!/Formulas: GIR/.test(t), "and its formula paragraph with it");
  ok(/Override the calculated energy/.test(t), "the energy override survives, collapsed");
  const dailyButtons = all(el, "button").filter((b) => !b.closest("details"));
  ok(dailyButtons.length <= 20, `the daily surface is quiet (${dailyButtons.length} buttons outside the disclosures)`);
  ok(/18 ml × 8 feeds/.test(t), `the day is split into feeds (${(t.match(/\d+ ml × \d+ feeds/) ?? ["none"])[0]})`);
  ok(/feeds 150/.test(t), "the guideline figures are one sentence");
  ok(/30 short|40 short/.test(t), "the gap to target is a number");

  click(byText(el, "button", "Use the guideline"), "use the guideline");
  ok(/unsaved changes on this tab/.test(text(el)), "taking the guideline marks the tab dirty");
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(!!f, "save wrote a payload");
  ok(f?.enteralMlKgDay === 150, `feeds advance 120 -> 150 (got ${f?.enteralMlKgDay})`);
  ok(f?.feedIncrementMlKgDay === 10, `the step-up is capped at full feeds (got ${f?.feedIncrementMlKgDay})`);
  ok(f?.lipid === 0, `IV lipid stops at full feeds (got ${f?.lipid})`);
  ok(f?.aminoAcid > 0 && f?.aminoAcid <= 4.5, `IV amino acids fill the protein gap (got ${f?.aminoAcid})`);
  ok(f?.dextrosePct === 25, `a 10 ml/kg/day IV cannot carry more than D25 (got ${f?.dextrosePct})`);
  ok(
    f?.fortifierProductId === "lhmf" && f?.fortificationAmount === 1 && f?.fortificationDosesPerDay === 8,
    `fortifier is 1 sachet in 8 feeds (got ${f?.fortifierProductId}/${f?.fortificationAmount}/${f?.fortificationDosesPerDay})`,
  );
  ok(
    f?.feedPlan === undefined && f?.tfiMlKgDay === undefined && f?.totalMlKgDay === 160,
    `the plan is not armed and the total is written directly (plan ${f?.feedPlan}, tfi ${f?.tfiMlKgDay}, total ${f?.totalMlKgDay})`,
  );
  ok(f?.feedVol === 22.5, `per-feed volume saved as 150 x 1.2 / 8 (got ${f?.feedVol})`);
  ok(f?.feedType === "Expressed breast milk (EBM)", `the recorded feed type is kept (got ${f?.feedType})`);
}

/* --- 2. a day-1 ELBW baby: trophic feeds, and no plan hijack ------------- */
{
  const { el, saved } = await render(
    {},
    { currentWeight: 600, birthWeight: 600, gestWeeks: 25, dob: new Date(Date.now() - 6 * 3600000).toISOString() },
  );
  ok(/Nothing recorded yet/.test(text(el)), "an empty chart says what to do");
  click(byText(el, "button", "Use the guideline"), "use the guideline");
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(f?.enteralMlKgDay === 10, `trophic feeds start at 10 ml/kg/day (got ${f?.enteralMlKgDay})`);
  ok(f?.ivMlKgDay === 100, `the IV carries the rest of the fluid (got ${f?.ivMlKgDay})`);
  ok(f?.totalMlKgDay === 110, `day-1 fluid target for <=750 g (got ${f?.totalMlKgDay})`);
  ok(f?.tfiMlKgDay === undefined, `no TFI target - the plan must not drive day-1 feeds (got ${f?.tfiMlKgDay})`);
  ok(f?.aminoAcid === 2.5, `ELBW amino acids start at 2.5 g/kg/day (got ${f?.aminoAcid})`);
  ok(f?.lipid === 1, `lipid starts at 1 g/kg/day (got ${f?.lipid})`);
  ok(f?.feedFreq === "2 hourly", `2-hourly below 1250 g (got ${f?.feedFreq})`);
  ok(f?.dextrosePct === 6, `D6 for 100 ml/kg/day at the ELBW GIR (got ${f?.dextrosePct})`);
  ok(f?.fortifierProductId === undefined, `no fortifier at 10 ml/kg/day (got ${f?.fortifierProductId})`);
}

/* --- 3. nothing is locked, and editing beats the feed plan --------------- */
{
  const { el, saved } = await render(
    {
      feedPlan: "increasing",
      tfiMlKgDay: 150,
      feedIncrementMlKgDay: 20,
      increaseAppliesTo: "tomorrow-target",
      ivMlKgDay: 0,
      feedFreq: "3 hourly",
    },
    { currentWeight: 1500, birthWeight: 1400 },
  );
  ok(all(el, "input[readonly]").length === 0, `no field on the tab is read-only (${all(el, "input[readonly]").length} found)`);
  ok(/set by the feed plan/.test(text(el)), "the plan still says it is driving the volume");
  ok(/Turn the plan off/.test(text(el)), "the plan can be released by hand");

  // Typing a feed volume takes the volume over instead of being discarded.
  typeInto(fieldInput(el, "Feeds ml/kg/day"), "140", "feeds ml/kg/day");
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(f?.enteralMlKgDay === 140, `the typed volume is what is saved (got ${f?.enteralMlKgDay})`);
  ok(f?.feedPlan === undefined && f?.tfiMlKgDay === undefined, `the plan is released, not silently re-applied (plan ${f?.feedPlan}, tfi ${f?.tfiMlKgDay})`);
  ok(f?.feedVol === 26.25, `the per-feed volume follows (140 x 1.5 / 8, got ${f?.feedVol})`);
}

/* --- 4. every field can be typed into, and the guideline is one tap ------ */
{
  const { el, saved } = await render({ feedFreq: "3 hourly" }, { currentWeight: 1200 });
  typeInto(fieldInput(el, "Feeds ml/kg/day"), "95", "feeds");
  typeInto(fieldInput(el, "IV ml/kg/day"), "65", "IV");
  typeInto(fieldInput(el, "Dextrose %"), "12.5", "dextrose");
  typeInto(fieldInput(el, "Amino acids g/kg/day"), "3.2", "amino acids");
  typeInto(fieldInput(el, "Lipid g/kg/day"), "2.5", "lipid");
  typeInto(fieldInput(el, "Per feed ml"), "14", "per feed");
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(f?.ivMlKgDay === 65, `IV is what was typed (got ${f?.ivMlKgDay})`);
  ok(f?.dextrosePct === 12.5, `dextrose is what was typed (got ${f?.dextrosePct})`);
  ok(f?.aminoAcid === 3.2, `amino acids are what was typed (got ${f?.aminoAcid})`);
  ok(f?.lipid === 2.5, `lipid is what was typed (got ${f?.lipid})`);
  ok(f?.feedVol === 14, `the per-feed volume is what was typed (got ${f?.feedVol})`);
  ok(f?.enteralMlKgDay === 93.33, `and it converts back to ml/kg/day (14 x 8 / 1.2, got ${f?.enteralMlKgDay})`);
  ok(f?.gir === 5.64, `GIR is derived from what was typed (12.5 x 65 x 10 / 1440, got ${f?.gir})`);

  // The GIR field in the IV group still accepts a manual figure, and says so.
  const ovr = await render({ feedFreq: "3 hourly", enteralMlKgDay: 95, ivMlKgDay: 65, dextrosePct: 12.5 }, { currentWeight: 1200 });
  const girField = fieldInput(ovr.el, "GIR mg/kg/min");
  typeInto(girField, "9.5", "manual GIR");
  ok(/GIR mg\/kg\/min — manual/.test(text(ovr.el)), "a typed GIR is marked manual");
  click(byExact(ovr.el, "button", "Save feeds & fluids"), "save the override");
  await flush();
  const o = ovr.saved[0]?.clinical?.fluids;
  ok(o?.gir === 9.5, `the manual GIR is what is stored (got ${o?.gir})`);
  ok(o?.girManual === true, `and it is flagged manual so the chart is not silently re-derived (got ${o?.girManual})`);

  // Editing one field leaves the rest of the chart alone.
  const fresh = await render({ feedFreq: "3 hourly", enteralMlKgDay: 95, ivMlKgDay: 65 }, { currentWeight: 1200 });
  typeInto(fieldInput(fresh.el, "Feeds ml/kg/day"), "125", "feeds");
  click(byExact(fresh.el, "button", "Save feeds & fluids"), "save");
  await flush();
  const g = fresh.saved[0]?.clinical?.fluids;
  ok(g?.enteralMlKgDay === 125, `the edited field is saved (got ${g?.enteralMlKgDay})`);
  ok(g?.ivMlKgDay === 65, `and the rest of the chart is left alone (got ${g?.ivMlKgDay})`);
}

/* --- 5. the unit's own protocol figures drive the suggestion ------------- */
{
  const { el, saved } = await render({ enteralMlKgDay: 120, feedFreq: "3 hourly" }, { currentWeight: 1200 });
  ok(/feeds 150/.test(text(el)), "the published advance gives 150");
  ok(!/unit protocol/.test(text(el)), "no protocol is in use yet");

  setNative(protocolInput(el, "Daily advance"), "10", "daily advance");
  ok(/feeds 130/.test(text(el)), `the suggestion follows the unit's advance of 10 (got ${(text(el).match(/feeds \d+/) ?? ["none"])[0]})`);
  ok(/Using your unit's protocol figures/.test(text(el)), "the tab says whose numbers these are");
  ok(/unit protocol/.test(text(el)), "the target basis says the protocol is applied");

  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  ok(saved[0]?.clinical?.fluids?.protocol?.increment === 10, `the protocol is saved on the chart (got ${JSON.stringify(saved[0]?.clinical?.fluids?.protocol)})`);

  click(byText(el, "button", "Clear this baby's figures"), "clear this baby's figures");
  ok(/feeds 150/.test(text(el)), "clearing the protocol restores the published figures");
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  ok(saved[1]?.clinical?.fluids?.protocol === undefined, `the protocol is cleared (got ${JSON.stringify(saved[1]?.clinical?.fluids?.protocol)})`);
}

/* --- 6. a protocol loaded from the chart changes the targets ------------- */
{
  const { el } = await render(
    { enteralMlKgDay: 120, feedFreq: "3 hourly", protocol: { proteinMin: 4, proteinMax: 5, fullFeeds: 180 } },
    { currentWeight: 1200 },
  );
  const t = text(el);
  ok(/using your figures/.test(t), "the disclosure says the protocol is in use");
  ok(/target 4–5/.test(t), `the protein target follows the protocol (${(t.match(/target [\d.]+–[\d.]+/g) ?? []).join(", ")})`);
  ok(/feeds 150/.test(t), `full feeds of 180 still advances to 150 (${(t.match(/feeds \d+/) ?? ["none"])[0]})`);
}

/* --- 7. the feed-due clock ---------------------------------------------- */
{
  const late = await render(
    { enteralMlKgDay: 100, feedFreq: "3 hourly", lastFeedAt: new Date(Date.now() - 4 * 3600000).toISOString() },
    { currentWeight: 1500 },
  );
  ok(/feed is late/.test(text(late.el)), "a feed past its interval is flagged");
  ok(/since it was due/.test(text(late.el)), "how late it is, is stated");
  const onTime = await render(
    { enteralMlKgDay: 100, feedFreq: "3 hourly", lastFeedAt: new Date().toISOString() },
    { currentWeight: 1500 },
  );
  ok(/next feed in/.test(text(onTime.el)), "an on-time feed shows the countdown");
  ok(!/feed is late/.test(text(onTime.el)), "an on-time feed is not flagged");
}

/* --- 8. held feeds, and no weight --------------------------------------- */
{
  const held = await render({ enteralMlKgDay: 100, feedsHeldToday: 2, residualMl: 3 }, { currentWeight: 1500 });
  ok(/review for feed intolerance/.test(text(held.el)), "a held feed prompts a review");
  const clean = await render({ enteralMlKgDay: 100 }, { currentWeight: 1500 });
  ok(!/review for feed intolerance/.test(text(clean.el)), "no prompt when nothing is held");
  const noWeight = await render({ enteralMlKgDay: 100 }, { currentWeight: 0 });
  ok(/No weight on record/.test(text(noWeight.el)), "a missing weight is called out");
  ok(/Growth/.test(text(noWeight.el)), "the banner says where to fix it");
}

/* --- 9. the derived total is a readout, not a box you can type into ------ */
{
  const { el } = await render({ enteralMlKgDay: 100, ivMlKgDay: 50 }, { currentWeight: 1500 });
  ok(!fieldInput(el, "Total fluids ml/kg/day"), "the total is not an editable field");
  ok(/Total today 150 ml\/kg\/day ≈ 225 ml/.test(text(el)), `the total is stated once, in ml/day too (${(text(el).match(/Total today [^·]*/) ?? ["none"])[0]})`);
  // A legacy chart that recorded only a total must not lose it.
  const legacy = await render({ totalMlKgDay: 140 }, { currentWeight: 1500 });
  ok(/Total today 140 ml\/kg\/day ≈ 210 ml/.test(text(legacy.el)), `a recorded total with no split is still shown (${(text(legacy.el).match(/Total today [^·]*/) ?? ["none"])[0]})`);
}

/* --- 10. the unit's protocol, and this baby's beating it ---------------- */
{
  unitStore.protocol = { increment: 10 };
  unitRequests.length = 0;
  const { el, saved } = await render({ enteralMlKgDay: 120, feedFreq: "3 hourly" }, { currentWeight: 1200 });
  await flush();
  ok(/feeds 130/.test(text(el)), `the unit's advance of 10 drives the suggestion (${(text(el).match(/feeds \d+/) ?? ["none"])[0]})`);
  ok(/Whole unit/.test(text(el)), "the editor offers a whole-unit scope");
  ok(/unit 10/.test(text(el)), "each row says what a cleared box falls back to");

  // This baby's own figure beats the unit's.
  setNative(protocolInput(el, "Daily advance"), "20", "daily advance");
  ok(/feeds 140/.test(text(el)), `this baby's 20 beats the unit's 10 (${(text(el).match(/feeds \d+/) ?? ["none"])[0]})`);
  ok(/this baby — published 30/.test(text(el)), "and the row says the figure is now this baby's own");

  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  ok(saved[0]?.clinical?.fluids?.protocol?.increment === 20, `the baby's figure is saved on the chart (got ${JSON.stringify(saved[0]?.clinical?.fluids?.protocol)})`);

  // Clearing this baby's figure falls back to the unit's, not to published.
  click(byText(el, "button", "Clear this baby's figures"), "clear this baby's figures");
  ok(/feeds 130/.test(text(el)), `clearing falls back to the unit's figure (${(text(el).match(/feeds \d+/) ?? ["none"])[0]})`);

  click(byText(el, "button", "Whole unit"), "whole unit scope");
  ok(/saved for every baby in NICU/.test(text(el)), "the unit scope reports that its figures are saved");
  unitStore.protocol = undefined;
}

/* --- 11. editing in the unit scope saves for the whole unit ------------- */
{
  unitStore.protocol = undefined;
  unitRequests.length = 0;
  const { el, saved } = await render({ enteralMlKgDay: 120, feedFreq: "3 hourly" }, { currentWeight: 1200 });
  await flush();
  ok(/feeds 150/.test(text(el)), "with no unit figures the published advance applies");
  click(byText(el, "button", "Whole unit"), "whole unit scope");
  ok(/unsaved — applies to every baby in this unit once saved/.test(text(el)) || /no unit figures saved/.test(text(el)),
     "the unit scope says what saving will do");
  setNative(protocolInput(el, "Daily advance"), "15", "daily advance");
  click(byText(el, "button", "Save for the whole NICU"), "save for the whole unit");
  await flush();
  ok(unitRequests.length === 1, `one request was sent (${unitRequests.length})`);
  ok(unitRequests[0]?.unit === "nicu" && unitRequests[0]?.protocol?.increment === 15,
     `it carries the unit and the figure (got ${JSON.stringify(unitRequests[0])})`);
  // The chart itself is untouched by a unit-level save.
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  ok(saved[0]?.clinical?.fluids?.protocol === undefined, `a unit save does not write to the chart (got ${JSON.stringify(saved[0]?.clinical?.fluids?.protocol)})`);
}

rmSync(work, { recursive: true, force: true });
console.log(
  fail
    ? `Fluids tab redesign tests: ${pass} passed, ${fail} failed`
    : `Fluids tab redesign tests passed (${pass} checks)`,
);
// jsdom keeps a rAF loop alive, so the process will not exit on its own.
process.exit(fail ? 1 : 0);
