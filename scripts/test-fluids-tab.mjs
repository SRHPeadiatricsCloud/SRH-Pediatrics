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
  "FocusEvent", "MouseEvent", "localStorage", "requestAnimationFrame", "cancelAnimationFrame",
]) {
  globalThis[key] = window[key];
}
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
    await Promise.resolve();
  });
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

/* --- 1. a day-6 VLBW baby: layout, and what Apply + Save really write ------ */
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
  ok(/Today's prescription/.test(t), "the prescription card is rendered");
  ok(/Running now/.test(t), "the running-now summary is rendered");
  ok(/Apply today's plan/.test(t), "the one-click apply button is rendered");
  ok(/Copy the values only/.test(t), "the copy-without-plan button is rendered");
  ok(
    /1 \u00b7 Enteral feeds/.test(t) && /2 \u00b7 IV fluids/.test(t) && /3 \u00b7 Fortification/.test(t),
    "the inputs are grouped in prescription order",
  );
  ok(/How these numbers are worked out/.test(t), "the audit trail is behind a disclosure");
  ok(/18 ml per feed/.test(t), `per-feed volume is worked out (got ${(t.match(/\S+ ml per feed/) ?? ["none"])[0]})`);
  ok(/30 short/.test(t), "the gap to target is a number, not an adjective");
  ok(/Start fortification as suggested/.test(t), "fortification is offered past 100 ml/kg/day");
  ok(/Targets sized to this baby/.test(t), "the target basis is quoted");

  click(byText(el, "button", "Apply today's plan"), "apply");
  ok(/unsaved changes on this tab/.test(text(el)), "applying marks the tab dirty");
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
    f?.tfiMlKgDay === undefined && f?.totalMlKgDay === 160,
    `the plan is not armed at 150/160, the total is written directly (tfi ${f?.tfiMlKgDay}, total ${f?.totalMlKgDay})`,
  );
  ok(f?.kcal > 100 && f?.kcal < 250, `energy is computed (${f?.kcal})`);
  ok(f?.feedVol === 22.5, `per-feed volume saved as 150 x 1.2 / 8 (got ${f?.feedVol})`);
}

/* --- 2. a day-1 ELBW baby: trophic feeds, and no plan hijack -------------- */
{
  const { el, saved } = await render(
    {},
    { currentWeight: 600, birthWeight: 600, gestWeeks: 25, dob: new Date(Date.now() - 6 * 3600000).toISOString() },
  );
  ok(/Nothing recorded yet/.test(text(el)), "an empty chart says what to do");
  click(byText(el, "button", "Apply today's plan"), "apply");
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

/* --- 3. the feed plan locks the enteral field, and can be released -------- */
{
  const { el } = await render(
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
  ok(all(el, "input[readonly]").length >= 1, `the enteral field is locked (${all(el, "input[readonly]").length} read-only inputs)`);
  ok(/set by the feed plan/i.test(text(el)), "the lock says why");
  ok(/Turn the plan off/.test(text(el)), "the plan can be released");
  click(byText(el, "button", "Turn the plan off"), "turn the plan off");
  ok(all(el, "input[readonly]").length === 0, "releasing the plan unlocks the field");
  ok(/150 ml\/kg\/d/.test(text(el)), "the volume is kept when the plan is released");
}

/* --- 4. the feed-due clock ------------------------------------------------ */
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
  ok(/next feed due in/.test(text(onTime.el)), "an on-time feed shows the countdown");
  ok(!/feed is late/.test(text(onTime.el)), "an on-time feed is not flagged");
}

/* --- 5. held feeds and residuals ask for a review ------------------------- */
{
  const held = await render({ enteralMlKgDay: 100, feedsHeldToday: 2, residualMl: 3 }, { currentWeight: 1500 });
  ok(/review for feed intolerance/.test(text(held.el)), "a held feed prompts a review");
  const clean = await render({ enteralMlKgDay: 100 }, { currentWeight: 1500 });
  ok(!/review for feed intolerance/.test(text(clean.el)), "no prompt when nothing is held");
}

/* --- 6. no weight: say so instead of dosing anyway ------------------------ */
{
  const { el } = await render({ enteralMlKgDay: 100 }, { currentWeight: 0 });
  ok(/No weight on record/.test(text(el)), "a missing weight is called out");
  ok(/Growth/.test(text(el)), "the banner says where to fix it");
}

/* --- 7. copying the values must not arm the plan -------------------------- */
{
  const { el, saved } = await render({}, { currentWeight: 1200 });
  click(byText(el, "button", "Copy the values only"), "copy the values only");
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(
    f?.feedPlan === undefined && f?.tfiMlKgDay === undefined,
    `the plan is left alone (feedPlan ${f?.feedPlan}, tfi ${f?.tfiMlKgDay})`,
  );
  ok(f?.enteralMlKgDay > 0, `but the suggested volumes are copied (got ${f?.enteralMlKgDay})`);
  ok(f?.ivMlKgDay > 0, `and the IV that covers the gap (got ${f?.ivMlKgDay})`);
}

rmSync(work, { recursive: true, force: true });
console.log(
  fail
    ? `Fluids tab redesign tests: ${pass} passed, ${fail} failed`
    : `Fluids tab redesign tests passed (${pass} checks)`,
);
// jsdom keeps a rAF loop alive, so the process will not exit on its own.
process.exit(fail ? 1 : 0);
