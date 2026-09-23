/**
 * Print legibility guard.
 *
 * The dark theme paints text with near-white colours and re-declares several
 * utility classes with !important at specificity (0,2,1). Against white paper
 * that prints as blank, which is exactly the bug this file exists to catch:
 * it resolves the cascade for every !important `color` declaration and fails
 * if any winner is too faint to read, or if a dark surface survives.
 *
 * Needs a build first. Run with:
 *   npm run build && node scripts/test-print-css.mjs [path/to/built.css]
 */
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const findCss = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "cache") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findCss(p); if (r) return r; }
    else if (e.name.endsWith(".css")) return p;
  }
  return null;
};

const target = process.argv[2] ?? findCss(".next");
if (!target) {
  console.error("No built CSS found — run `npm run build` first.");
  process.exit(1);
}

const root = postcss.parse(fs.readFileSync(target, "utf8"), { from: target });
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { ok ? pass++ : (fail++, console.log("FAIL:", name, extra)); };

const hex2rgb = (h) => { h = h.replace("#", ""); if (h.length === 3) h = [...h].map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const norm = (v) => (v === "#fff" ? "#ffffff" : v);
const WHITE = [255, 255, 255];

// CSS specificity: [ids, classes/attrs/pseudo-classes, elements]
function spec(sel) {
  const s = sel.replace(/::[\w-]+/g, "\u0001").replace(/\\./g, "\u0002");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const b = (s.match(/\.[\w\u0002-]+/g) || []).length
    + (s.match(/\[[^\]]*\]/g) || []).length
    + (s.match(/:(?!:)[\w-]+(\([^)]*\))?/g) || []).length;
  const c = (s.replace(/[#.:\[[^\]]*\][\w-]*/g, " ").match(/\b[a-z][\w-]*\b/gi) || []).length;
  return [ids, b, c];
}
const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);

const tokens = {};
root.walkDecls(/^--/, (d) => { if (/^#[0-9a-f]{3,6}$/i.test(d.value)) tokens[d.prop] = norm(d.value); });

/* ---- 1. the print block exists and nothing colour-related follows it ---- */
let printNode = null;
root.walkAtRules("media", (at) => { if (/print/.test(at.params)) printNode = at; });
t("a @media print block exists", !!printNode);
const printRules = [];
printNode?.walkRules((r) => printRules.push(r));

const nodes = [...root.nodes];
const after = [];
for (let i = nodes.indexOf(printNode) + 1; i < nodes.length; i++) {
  let hit = null;
  nodes[i].walkDecls?.((d) => { if (/^(color|background|background-color)$/.test(d.prop)) hit = d.prop; });
  if (hit) after.push(`${nodes[i].type} ${nodes[i].name ?? nodes[i].selector ?? ""} -> ${hit}`);
}
t("no colour/background rule comes after the print block (it must win the cascade)", after.length === 0, after.join(" | "));

/* ---- 2. resolve the cascade winner for every !important text colour ---- */
const per = new Map();
let order = 0;
root.walkRules((rule) => {
  for (const n of rule.nodes) {
    if (n.type !== "decl" || n.prop !== "color" || !n.important) continue;
    for (const sel of rule.selectors) {
      const key = sel.trim();
      if (!per.has(key)) per.set(key, []);
      per.get(key).push({ spec: spec(key), order: order++, value: n.value });
    }
  }
});
const winners = [];
for (const [key, list] of per) {
  let best = list[0];
  for (const c of list) if (cmp(c.spec, best.spec) >= 0) best = c;
  let v = best.value.trim();
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  if (m) v = tokens[m[1]] ?? v;
  winners.push({ sel: key, value: norm(v), resolvable: /^#[0-9a-f]{3,6}$/i.test(v) });
}
t("there are !important colour rules to audit", winners.length > 0, String(winners.length));

const faint = winners.filter((w) => w.resolvable && contrast(hex2rgb(w.value), WHITE) < 4.5);
t("every WINNING !important text colour is >= 4.5:1 on white (nothing prints invisible)",
  faint.length === 0,
  faint.map((w) => `${w.sel} { ${w.value} = ${contrast(hex2rgb(w.value), WHITE).toFixed(2)}:1 }`).join(" | "));

const opaque = winners.filter((w) => !w.resolvable);
t("no unresolvable winning colour",
  opaque.every((w) => /currentColor|gradient|transparent|inherit/.test(w.value)),
  opaque.map((w) => `${w.sel} -> ${w.value}`).join(" | "));

/* ---- 3. structural requirements inside the print block ---- */
const star = printRules.find((r) => r.selector.startsWith("*"));
const starColor = star?.nodes.find((n) => n.prop === "color");
t("universal ink baseline with !important", starColor?.important === true && starColor?.value === "#0f172a", starColor?.value);
t("print-color-adjust: exact (webkit + standard)",
  (star?.nodes.filter((n) => /print-color-adjust/.test(n.prop)).length ?? 0) === 2);

const tokenRule = printRules.find((r) => /html:not\(\.light\)/.test(r.selector) && /:root/.test(r.selector));
const tv = Object.fromEntries((tokenRule?.nodes ?? []).filter((n) => n.type === "decl").map((n) => [n.prop, norm(n.value)]));
t("print block redefines tokens for :root AND html:not(.light)", !!tokenRule);
for (const k of ["--text", "--text-2", "--text-3", "--text-4", "--p-t1", "--p-t2", "--p-t3", "--p-t4"]) {
  const ratio = tv[k] ? contrast(hex2rgb(tv[k]), WHITE) : 0;
  t(`token ${k} -> ${tv[k] ?? "MISSING"} (${ratio.toFixed(1)}:1)`, !!tv[k] && ratio >= 4.5);
}
t("color-scheme forced to light", tv["color-scheme"] === "light", tv["color-scheme"]);
for (const k of ["--bg", "--p-bg", "--p-bg2", "--card", "--card-solid"]) {
  t(`token ${k} is white in print`, tv[k] === "#ffffff", tv[k]);
}
const bodyBg = printRules.flatMap((r) => r.nodes).find((n) => n.prop === "background" && n.parent.selector.includes("body"));
t("body background forced white in print", norm(bodyBg?.value) === "#ffffff" && bodyBg?.important, bodyBg?.value);

const darkBg = [];
for (const r of printRules) for (const n of r.nodes) {
  if (/^background(-color)?$/.test(n.prop) && /^#[0-9a-f]{3,6}$/i.test(n.value) && lum(hex2rgb(norm(n.value))) < 0.4) {
    darkBg.push(`${r.selector.replace(/\s+/g, " ")} { ${n.value} }`);
  }
}
t("no dark background declared inside @media print", darkBg.length === 0, darkBg.join(" | "));

/* ---- 4. clinical colour coding must survive, not flatten to greyscale ---- */
const hues = new Set(winners.filter((w) => w.resolvable).map((w) => w.value).filter((h) => {
  const [r, g, b] = hex2rgb(h);
  return Math.max(r, g, b) - Math.min(r, g, b) > 40;
}));
t("clinical accent colours retained in print (not greyscale)", hues.size >= 4, [...hues].join(", "));

const ratios = winners.filter((w) => w.resolvable).map((w) => contrast(hex2rgb(w.value), WHITE));
const worst = Math.min(...ratios);
console.log(`\n${target}`);
console.log(`${winners.length} winning text colours · worst contrast ${worst.toFixed(2)}:1 · accents ${[...hues].join(", ")}`);
console.log(`print CSS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
