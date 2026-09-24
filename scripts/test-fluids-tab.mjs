/**
 * The Feeds & fluids tab, rendered in a DOM.
 *
 * The pure arithmetic behind this tab is covered by test-feed-guide.ts and
 * test-fluids-reliability.ts. What those cannot see is whether the
 * novice-first redesign actually reaches the screen: the "today in one line"
 * sentence, the four numbered steps, the per-feed ↔ ml/kg/day sync, the pump
 * rate ↔ IV sync, the typed advance step, the tolerance gate, the legacy
 * feed-plan migration, and what the Save button really writes. Those are
 * asserted here against the real component, not a copy of it.
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
/** A native select: value + change event. */
const setSelect = (el, value, what) => {
  if (!el) throw new Error(`select not found: ${what}`);
  act(() => {
    setNativeValue(el, value);
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
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
/** The select belonging to a labelled field with this label. */
const fieldSelect = (root, label) => {
  const lbl = all(root, "span.lbl").find((d) => text(d).toLowerCase().startsWith(label.toLowerCase()));
  return lbl?.parentElement?.querySelector("select");
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

/* --- 1. the novice-first layout, and the day read in one line ------------ */
{
  const { el } = await render(
    {
      feedPlan: "increasing",
      increaseAppliesTo: "iv-today",
      ivMlKgDay: 20,
      tfiMlKgDay: 150,
      feedIncrementMlKgDay: 20,
      dextrosePct: 10,
      feedType: "Preterm formula",
      feedRoute: "OG tube",
      feedFreq: "3 hourly",
    },
    { currentWeight: 1500, birthWeight: 1400 },
  );
  const t = text(el);
  ok(/Today in one line/.test(t), "the one-line card is the first thing on the tab");
  ok(
    /24\.4 ml every 3 h of Preterm formula by OG tube \(130 ml\/kg\/day\) \+ IV 1\.3 ml\/h of D10% \(20 ml\/kg\/day\) = 150 ml\/kg\/day — exactly the TFI target/.test(t),
    `the whole prescription is one plain sentence (got: ${(t.match(/= 150 ml\/kg\/day — [^.]*\./) ?? ["no sentence found"])[0]})`,
  );
  ok(/Fluids 150 ml\/kg\/d · OK \(aim 150–160\)/.test(t), "the fluids pill carries its target band");
  ok(/Energy 109\.5 kcal\/kg\/d · low \(aim 110–135\)/.test(t), "the energy pill says low against its band");
  ok(/Protein 3\.33 g\/kg\/d · low \(aim 3\.5–4\.5\)/.test(t), "the protein pill says low against its band");
  ok(/1Feeds/.test(t) && /2IV fluids/.test(t) && /3Check the total/.test(t) && /4Tomorrow: advance the feeds/.test(t),
     "the four numbered steps are all there");
  ok(!/Static/.test(t) && !/Increasing/.test(t), "no feed-plan machinery (Static/Increasing) anywhere");
  ok(!/increase applies to/i.test(t), "no 'increase applies to'");
  ok(!/Feed details & tolerance/.test(t), "the old drawer is gone");
  ok(!/Stabilise/.test(t) && !/Wean IV/.test(t) && !/Oral \/ discharge/.test(t), "the phase rail is gone");
  ok((t.match(/TFI target ml\/kg\/day/g) ?? []).length === 1, `exactly one TFI target box (got ${(t.match(/TFI target ml\/kg\/day/g) ?? []).length})`);
  ok(/Use the guideline/.test(t), "one button takes the whole guideline");
  ok(/Save feeds & fluids/.test(t) && /Discard changes/.test(t), "the footer keeps Save/Discard");
  ok(/unsaved changes on this tab|no unsaved changes/.test(t), "the footer says what is unsaved");
}

/* --- 2. pump rate ↔ IV ml/kg/day, and the GIR in words -------------------- */
{
  const { el } = await render({ dextrosePct: 10, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  typeInto(fieldInput(el, "Pump rate ml/hour"), "5", "pump rate");
  ok(fieldInput(el, "IV ml/kg/day").value === "80", `5 ml/h at 1.5 kg is 80 ml/kg/day (got ${fieldInput(el, "IV ml/kg/day").value})`);
  ok(/Sugar delivery \(GIR\) 5\.56 mg\/kg\/min — usual range 4–8/.test(text(el)), "the GIR reads in words at the usual range");
  typeInto(fieldInput(el, "IV ml/kg/day"), "96", "IV ml/kg/day");
  ok(fieldInput(el, "Pump rate ml/hour").value === "6", `and 96 ml/kg/day is 6 ml/h (got ${fieldInput(el, "Pump rate ml/hour").value})`);
  ok(/Sugar delivery \(GIR\) 6\.67 mg\/kg\/min — usual range 4–8/.test(text(el)), "the GIR follows the IV volume");
}

/* --- 3. per feed ↔ Feeds ml/kg/day through interval × weight -------------- */
{
  const { el } = await render({ feedFreq: "3 hourly" }, { currentWeight: 1500 });
  typeInto(fieldInput(el, "Per feed ml"), "3", "per feed");
  ok(fieldInput(el, "Feeds ml/kg/day").value === "16", `3 ml × 8 feeds at 1.5 kg is 16 ml/kg/day (got ${fieldInput(el, "Feeds ml/kg/day").value})`);
  ok(/3 ml × 8 feeds ≈ 24 ml a day/.test(text(el)), "the day is split into feeds");

  // Changing the interval re-splits the same daily volume.
  const iv = await render({ enteralMlKgDay: 96, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  ok(fieldInput(iv.el, "Per feed ml").value === "18", "96 ml/kg/day at 3-hourly is 18 ml per feed");
  setSelect(fieldSelect(iv.el, "How often"), "2 hourly", "how often");
  ok(fieldInput(iv.el, "Per feed ml").value === "12", `the same 96 ml/kg/day at 2-hourly is 12 ml per feed (got ${fieldInput(iv.el, "Per feed ml").value})`);
  ok(fieldInput(iv.el, "Feeds ml/kg/day").value === "96", "the ml/kg/day figure is untouched by the re-split");
  ok(/12 ml × 12 feeds ≈ 144 ml a day/.test(text(iv.el)), "the day is re-split into 12 feeds");

  // The reverse direction saves back to ml/kg/day.
  const pf = await render({ feedFreq: "3 hourly" }, { currentWeight: 1200 });
  typeInto(fieldInput(pf.el, "Per feed ml"), "14", "per feed");
  click(byExact(pf.el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = pf.saved[0]?.clinical?.fluids;
  ok(f?.enteralMlKgDay === 93.33, `per-feed 14 × 8 / 1.2 kg saves 93.33 ml/kg/day (got ${f?.enteralMlKgDay})`);
  ok(f?.feedVol === 14, `the typed per-feed volume is saved (got ${f?.feedVol})`);
}

/* --- 4. the typed advance step, preview, and the IV wean ------------------ */
{
  const { el, saved } = await render({ enteralMlKgDay: 80, ivMlKgDay: 70, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  ok(/\+ Advance feeds \(\+30 ml\/kg\/d\)/.test(text(el)), "the default step is the guideline band's increment (30 for 1001–1500 g)");
  typeInto(fieldInput(el, "Advance by ml/kg/day"), "25", "advance by");
  ok(/\+ Advance feeds \(\+25 ml\/kg\/d\)/.test(text(el)), "the typed step is what the button shows");
  const t = text(el);
  ok(/15 → 19\.7 ml\/feed \(80 → 105 ml\/kg\/day\)/.test(t), `the feeds preview shows both units (got ${(t.match(/1[0-9]\.[0-9] ml\/feed[^)]*\)/) ?? ["no preview"])[0]})`);
  ok(/4\.4 → 2\.8 ml\/h \(70 → 45 ml\/kg\/day\)/.test(t), "the IV preview shows the wean in ml/h");
  ok(/150 → 150 ml\/kg\/day/.test(t), "the total preview keeps the intake flat");
  click(byText(el, "button", "Advance feeds"), "advance the feeds");
  ok(fieldInput(el, "Feeds ml/kg/day").value === "105", `feeds step 80 → 105 (got ${fieldInput(el, "Feeds ml/kg/day").value})`);
  ok(fieldInput(el, "IV ml/kg/day").value === "45", `IV weans 70 → 45 (got ${fieldInput(el, "IV ml/kg/day").value})`);
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(f?.enteralMlKgDay === 105 && f?.ivMlKgDay === 45, `the applied advance is saved 105 + 45 (got ${f?.enteralMlKgDay} + ${f?.ivMlKgDay})`);
  ok(f?.totalMlKgDay === 150, `the total is written in step (got ${f?.totalMlKgDay})`);
  ok(f?.feedIncrementMlKgDay === 25, `the typed step is stored (got ${f?.feedIncrementMlKgDay})`);
  ok(f?.feedPlan === undefined, "a save never arms a feed plan");

  // The ml/feed unit of the same step, through interval × weight.
  const mf = await render({ enteralMlKgDay: 80, ivMlKgDay: 70, feedFreq: "3 hourly", feedIncrementMlKgDay: 25, feedAdvanceStepUnit: "mlfeed" }, { currentWeight: 1500 });
  ok(fieldInput(mf.el, "Advance by ml/feed").value === "4.69", `25 ml/kg/day shows as 4.69 ml/feed at 1.5 kg (got ${fieldInput(mf.el, "Advance by ml/feed").value})`);
  typeInto(fieldInput(mf.el, "Advance by ml/feed"), "2", "advance by ml/feed");
  ok(fieldInput(mf.el, "Advance by ml/feed").value === "2", "the per-feed step is editable");
  click(byExact(mf.el, "button", "Save feeds & fluids"), "save the per-feed step");
  await flush();
  const g = mf.saved[0]?.clinical?.fluids;
  ok(g?.feedIncrementMlKgDay === 10.67, `2 ml/feed × 8 / 1.5 kg stores 10.67 ml/kg/day (got ${g?.feedIncrementMlKgDay})`);
  ok(g?.feedAdvanceStepUnit === "mlfeed", "and the unit it was typed in is stored (got " + g?.feedAdvanceStepUnit + ")");
}

/* --- 5. the tolerance gate on the advance button -------------------------- */
{
  const held = await render({ enteralMlKgDay: 100, feedsHeldToday: 2, residualMl: 3, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  ok(/Check tolerance & advance/.test(text(held.el)), "a held feed turns the button amber");
  ok(/review for feed intolerance before the next increase/.test(text(held.el)), "and says to review intolerance first");
  const clean = await render({ enteralMlKgDay: 100, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  ok(/\+ Advance feeds \(\+30 ml\/kg\/d\)/.test(text(clean.el)), "no held feeds, no gate");
  const small = await render({ enteralMlKgDay: 100, residualMl: 1, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  ok(!/Check tolerance & advance/.test(text(small.el)), "a 1 ml residual does not trip the gate");
  const cap = await render({ enteralMlKgDay: 245, ivMlKgDay: 10, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  ok(/Capped at the 250 ml\/kg\/day maximum/.test(text(cap.el)), "the 250 cap is called out");
  const full = await render({ enteralMlKgDay: 155, ivMlKgDay: 0, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  ok(/Already at full feeds for 1001–1500 g \(155 ml\/kg\/day\)/.test(text(full.el)), "full feeds for the band is called out");
}

/* --- 6. legacy charts: the plan's volume moves into the boxes once -------- */
{
  const { el, saved } = await render(
    { feedPlan: "increasing", tfiMlKgDay: 150, feedIncrementMlKgDay: 20, ivMlKgDay: 0, feedFreq: "3 hourly" },
    { currentWeight: 1500, birthWeight: 1400 },
  );
  ok(fieldInput(el, "Feeds ml/kg/day").value === "150", `the plan's derived volume opens in the Feeds box (got ${fieldInput(el, "Feeds ml/kg/day").value})`);
  ok(fieldInput(el, "IV ml/kg/day").value === "0", "the IV box carries what was running");
  ok(fieldInput(el, "TFI target ml/kg/day").value === "150", "the TFI survives as a plain target");
  ok(all(el, "input[readonly]").length === 0, "nothing is read-only after the migration");
  ok(/\+ Advance feeds \(\+20 ml\/kg\/d\)/.test(text(el)), "the legacy increment is tomorrow's default step");
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(f?.feedPlan === undefined, `the plan is dropped on save (got ${f?.feedPlan})`);
  ok(f?.increaseAppliesTo === undefined, "and so is 'increase applies to'");
  ok(f?.tfiMlKgDay === 150, `the TFI target is kept (got ${f?.tfiMlKgDay})`);
  ok(f?.enteralMlKgDay === 150, `the migrated volume is saved (got ${f?.enteralMlKgDay})`);
  ok(f?.totalMlKgDay === 150, `the total is written in step (got ${f?.totalMlKgDay})`);

  // A static legacy plan with IV running alongside.
  const st = await render({ feedPlan: "static", tfiMlKgDay: 160, ivMlKgDay: 30, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  ok(fieldInput(st.el, "Feeds ml/kg/day").value === "130", `static plan 160 TFI − 30 IV opens as 130 feeds (got ${fieldInput(st.el, "Feeds ml/kg/day").value})`);
  click(byExact(st.el, "button", "Save feeds & fluids"), "save the static legacy");
  await flush();
  const g = st.saved[0]?.clinical?.fluids;
  ok(g?.feedPlan === undefined && g?.tfiMlKgDay === 160 && g?.enteralMlKgDay === 130 && g?.ivMlKgDay === 30,
     `the static legacy saves cleanly (got ${g?.feedPlan} / ${g?.tfiMlKgDay} / ${g?.enteralMlKgDay} / ${g?.ivMlKgDay})`);
}

/* --- 7. "Use the guideline" on a day-1 microprem -------------------------- */
{
  const { el, saved } = await render(
    {},
    { currentWeight: 600, birthWeight: 600, gestWeeks: 25, dob: new Date(Date.now() - 6 * 3600000).toISOString() },
  );
  ok(/Nothing recorded yet/.test(text(el)), "an empty chart says what to do");
  ok(/No feeds or IV recorded yet — no TFI target set yet/.test(text(el)), "the one line is honest about the empty chart");
  click(byText(el, "button", "Use the guideline"), "use the guideline");
  ok(/unsaved changes on this tab/.test(text(el)), "taking the guideline marks the tab dirty");
  ok(/0\.5 ml every 2 h of EBM by the usual route \(10 ml\/kg\/day\) \+ IV 2\.5 ml\/h of D6% \(100 ml\/kg\/day\) = 110 ml\/kg\/day — exactly the TFI target/.test(text(el)),
     "the one line now reads the whole day-1 prescription");
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(f?.enteralMlKgDay === 10, `trophic feeds start at 10 ml/kg/day (got ${f?.enteralMlKgDay})`);
  ok(f?.ivMlKgDay === 100, `the IV carries the rest of the fluid (got ${f?.ivMlKgDay})`);
  ok(f?.totalMlKgDay === 110, `day-1 total for ≤750 g is 110 (got ${f?.totalMlKgDay})`);
  ok(f?.tfiMlKgDay === 110, `the TFI target is the guideline's fluid target (got ${f?.tfiMlKgDay})`);
  ok(f?.feedPlan === undefined, "and no feed plan is armed by the guideline");
  ok(f?.feedFreq === "2 hourly" && f?.dextrosePct === 6 && f?.aminoAcid === 2.5 && f?.lipid === 1,
     `the rest of the day-1 prescription is in (got ${f?.feedFreq} / D${f?.dextrosePct}% / AA ${f?.aminoAcid} / lipid ${f?.lipid})`);
  ok(f?.fortifierProductId === undefined, `no fortifier at 10 ml/kg/day (got ${f?.fortifierProductId})`);
}

/* --- 8. the TFI box, the split bar, and the guidance line ------------------ */
{
  const { el } = await render({ enteralMlKgDay: 120, ivMlKgDay: 0, feedFreq: "3 hourly" }, { currentWeight: 1500 });
  ok(/Total today 120 ml\/kg\/day ≈ 180 ml/.test(text(el)), "the total is stated in ml/kg/day and ml");
  ok(/no TFI target set yet/.test(text(el)), "no target yet says so");
  click(byText(el, "button", "use the guideline's"), "adopt the guideline's target");
  ok(fieldInput(el, "TFI target ml/kg/day").value === "160", `one tap takes the guideline's target (got ${fieldInput(el, "TFI target ml/kg/day").value})`);
  ok(/40 short of the TFI target/.test(text(el)), "the split bar verdict names the gap");
  ok(/To reach 160: add 40 ml\/kg\/day to the IV \(≈ \+2\.5 ml\/h\) or to the feeds/.test(text(el)), "the guidance line says how to close the gap");

  const over = await render({ enteralMlKgDay: 140, ivMlKgDay: 30, tfiMlKgDay: 150 }, { currentWeight: 1500 });
  ok(/Total today 170 ml\/kg\/day ≈ 255 ml/.test(text(over.el)), "an over target is stated");
  ok(/20 OVER the TFI target/.test(text(over.el)), "the verdict names the overshoot");
  ok(/Over target by 20 — bring the IV down by ≈ 1\.3 ml\/h/.test(text(over.el)), "the guidance says how to come back down");
}

/* --- 9. the sentence's edge cases: NPO, no IV, total-only, empty ---------- */
{
  const npo = await render({ feedType: "NPO / Nil per oral", ivMlKgDay: 60, dextrosePct: 10 }, { currentWeight: 3000 });
  ok(/Nil by mouth, IV 7\.5 ml\/h of D10% \(60 ml\/kg\/day\) = 60 ml\/kg\/day — no TFI target set yet/.test(text(npo.el)),
     `an NPO baby still gets a full sentence (got: ${(text(npo.el).match(/Nil by mouth[^.]*\./) ?? ["none"])[0]})`);
  const npoOnly = await render({ feedType: "NPO / Nil per oral" }, { currentWeight: 3000 });
  ok(/Nil by mouth, no IV fluids = 0 ml\/kg\/day — no TFI target set yet/.test(text(npoOnly.el)), "NPO with no IV says so plainly");
  const totalOnly = await render({ totalMlKgDay: 140 }, { currentWeight: 1500 });
  ok(/Total today 140 ml\/kg\/day ≈ 210 ml/.test(text(totalOnly.el)), "a legacy total-only chart keeps its total");
  ok(/Total on file 140 ml\/kg\/day, but no feeds or IV split yet/.test(text(totalOnly.el)), "and asks for the split");
  const nothing = await render({}, { currentWeight: 1500 });
  ok(/No feeds or IV recorded yet — no TFI target set yet/.test(text(nothing.el)), "an empty chart reads empty");
}

/* --- 10. the feed-due pill ------------------------------------------------- */
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

/* --- 11. the unit's own protocol figures drive the suggestion -------------- */
{
  const { el, saved } = await render({ enteralMlKgDay: 120, feedFreq: "3 hourly" }, { currentWeight: 1200 });
  await flush();
  ok(/feeds 150/.test(text(el)), "the published advance gives 150");
  ok(!/unit protocol/.test(text(el)), "no protocol is in use yet");

  setNative(protocolInput(el, "Daily advance"), "10", "daily advance");
  ok(/feeds 130/.test(text(el)), `the suggestion follows this baby's advance of 10 (got ${(text(el).match(/feeds \d+/) ?? ["none"])[0]})`);
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

/* --- 12. a protocol loaded from the chart changes the targets -------------- */
{
  const { el } = await render(
    { enteralMlKgDay: 120, feedFreq: "3 hourly", protocol: { proteinMin: 4, proteinMax: 5, fullFeeds: 180 } },
    { currentWeight: 1200 },
  );
  const t = text(el);
  ok(/using your figures/.test(t), "the editor says the protocol is in use");
  ok(/target 4–5/.test(t), `the protein target follows the protocol (${(t.match(/target [\d.]+–[\d.]+/g) ?? []).join(", ")})`);
  ok(/feeds 150/.test(t), `full feeds of 180 still advances to 150 (${(t.match(/feeds \d+/) ?? ["none"])[0]})`);
}

/* --- 13. the unit's protocol, and this baby's beating it ------------------- */
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

/* --- 14. editing in the unit scope saves for the whole unit ---------------- */
{
  unitStore.protocol = undefined;
  unitRequests.length = 0;
  const { el, saved } = await render({ enteralMlKgDay: 120, feedFreq: "3 hourly" }, { currentWeight: 1200 });
  await flush();
  ok(/feeds 150/.test(text(el)), "with no unit figures the published advance applies");
  click(byText(el, "button", "Whole unit"), "whole unit scope");
  ok(/no unit figures saved/.test(text(el)), "the unit scope says what saving will do");
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

/* --- 15. the Advanced section: manual GIR, energy override, the why -------- */
{
  const { el, saved } = await render(
    { enteralMlKgDay: 95, ivMlKgDay: 65, dextrosePct: 12.5, feedFreq: "3 hourly" },
    { currentWeight: 1200 },
  );
  ok(/Sugar delivery \(GIR\) 5\.64 mg\/kg\/min — usual range 4–8/.test(text(el)), "the GIR is derived and read in words");
  typeInto(fieldInput(el, "GIR mg/kg/min"), "9.5", "manual GIR");
  ok(/GIR mg\/kg\/min — manual/.test(text(el)), "a typed GIR is marked manual");
  ok(/Sugar delivery \(GIR\) 9\.5 mg\/kg\/min — above the usual 4–8/.test(text(el)), "the readout follows the manual GIR");
  typeInto(fieldInput(el, "Energy kcal/kg/d"), "120", "energy override");
  ok(/Energy is overridden — the calculated figure is/.test(text(el)), "the energy override says what it overrode");
  click(byExact(el, "button", "Save feeds & fluids"), "save the overrides");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(f?.gir === 9.5 && f?.girManual === true, `the manual GIR is stored and flagged (got ${f?.gir} / ${f?.girManual})`);
  ok(f?.kcal === 120 && f?.kcalManual === true, `the manual energy is stored and flagged (got ${f?.kcal} / ${f?.kcalManual})`);
  ok(f?.feedVol !== undefined, `the derived per-feed volume is saved (got ${f?.feedVol})`);

  // The guideline sentence and its reasoning sit in the Advanced section.
  const t = text(el);
  ok(/Guideline for 1001–1500 g on day 6: feeds \d+ · IV \d+ · TFI \d+/.test(t), "the one-line guideline sentence is there");
  ok(/— why\?/.test(t), "…and it can be asked why");
  ok(/Against the targets/.test(t) && /Override the calculated energy/.test(t), "the target bars and the energy override survive");
  ok(/Advanced — TPN, fortifier, protocol figures & why the guideline says what it says/.test(t), "the Advanced disclosure keeps everything that is not day-to-day");
  click(byText(el, "button", "recalculate from dextrose %"), "recalculate the GIR");
  ok(!/GIR mg\/kg\/min — manual/.test(text(el)), "the GIR goes back to automatic");

  // The GIR readout's other bands.
  const low = await render({ ivMlKgDay: 100, dextrosePct: 5 }, { currentWeight: 1500 });
  ok(/Sugar delivery \(GIR\) 3\.47 mg\/kg\/min — LOW, below the usual 4–8/.test(text(low.el)), "a low GIR is called out in words");
  const high = await render({ ivMlKgDay: 200, dextrosePct: 20 }, { currentWeight: 1500 });
  ok(/Sugar delivery \(GIR\) 27\.78 mg\/kg\/min — very high, above 12: needs a central line/.test(text(high.el)), "a very high GIR is called out");
  const noIv = await render({ enteralMlKgDay: 100 }, { currentWeight: 1500 });
  ok(/No IV running — nothing to calculate/.test(text(noIv.el)), "no IV, no GIR pretence");
}

/* --- 16. a missing weight is called out ------------------------------------ */
{
  const noWeight = await render({ enteralMlKgDay: 100 }, { currentWeight: 0 });
  ok(/No weight on record/.test(text(noWeight.el)), "a missing weight is called out");
  ok(/Growth/.test(text(noWeight.el)), "the banner says where to fix it");
}

/* --- 17. the "What milk" / "How given" selects save what was picked -------- */
{
  const { el, saved } = await render({ feedFreq: "3 hourly", enteralMlKgDay: 80 }, { currentWeight: 1500 });
  setSelect(fieldSelect(el, "What milk"), "Expressed breast milk (EBM)", "what milk");
  setSelect(fieldSelect(el, "How given"), "OG tube", "how given");
  ok(/15 ml every 3 h of EBM by OG tube \(80 ml\/kg\/day\)/.test(text(el)),
     `the one line picks up the milk and the route (got: ${(text(el).match(/15 ml every[^.]*\./) ?? ["none"])[0]})`);
  click(byExact(el, "button", "Save feeds & fluids"), "save");
  await flush();
  const f = saved[0]?.clinical?.fluids;
  ok(f?.feedType === "Expressed breast milk (EBM)" && f?.feedRoute === "OG tube", `the picks are saved (got ${f?.feedType} / ${f?.feedRoute})`);
}

rmSync(work, { recursive: true, force: true });
console.log(
  fail
    ? `Fluids tab redesign tests: ${pass} passed, ${fail} failed`
    : `Fluids tab redesign tests passed (${pass} checks)`,
);
// jsdom keeps a rAF loop alive, so the process will not exit on its own.
process.exit(fail ? 1 : 0);
