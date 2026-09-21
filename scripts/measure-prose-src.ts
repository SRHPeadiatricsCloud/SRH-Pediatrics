/**
 * Counts the prose this app renders, straight from the source AST.
 *
 * Walks every .tsx under src/ with the TypeScript compiler and collects the
 * text a user can actually read:
 *   · JsxText nodes ("between the tags")
 *   · string literals passed to descriptive props (sub, subtitle, hint, note,
 *     title, label, placeholder, summary) and to <p>/<span>/<div>/<b>/<em>/<small>
 *
 * Reports words, and how many of them sit in a run of >= MIN words.
 *
 * Run: npx tsx scripts/measure-prose-src.ts [minWords]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const MIN = Number(process.argv[2] ?? 12);
const ROOT = "src";

const DESCRIPTIVE_PROPS = new Set([
  "sub",
  "subtitle",
  "hint",
  "note",
  "title",
  "label",
  "placeholder",
  "summary",
  "aria-label",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Strip JSX entity escapes and collapse whitespace the way the browser does. */
function clean(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Hit = { file: string; words: number };

const hits: Hit[] = [];

for (const file of walk(ROOT).sort()) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const push = (raw: string) => {
    const t = clean(raw);
    const words = t ? t.split(" ").length : 0;
    if (words > 0) hits.push({ file, words });
  };

  const visit = (node: ts.Node) => {
    // plain text between tags
    if (ts.isJsxText(node)) push(node.text);

    // descriptive props
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf);
      if (DESCRIPTIVE_PROPS.has(name)) push(node.initializer.text);
    }

    // string literal children of an expression container: <p>{"..."}</p>
    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) {
      push(node.expression.text);
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Aggregate. A "run" is one contiguous piece of text the eye has to read.
let words = 0;
let longRuns = 0;
let longWords = 0;
const perFile = new Map<string, { w: number; r: number }>();

for (const hit of hits) {
  words += hit.words;
  const f = perFile.get(hit.file) ?? { w: 0, r: 0 };
  f.w += hit.words;
  if (hit.words >= MIN) {
    longRuns += 1;
    longWords += hit.words;
    f.r += 1;
  }
  perFile.set(hit.file, f);
}

const top = [...perFile.entries()].sort((a, b) => b[1].w - a[1].w).slice(0, 12);
for (const [file, v] of top) {
  console.log(`${relative(process.cwd(), file).padEnd(52)} ${String(v.w).padStart(5)} words · ${v.r} long`);
}

console.log(
  `\nrendered prose: ${words} words in ${hits.length} text nodes · ` +
    `runs of >=${MIN} words: ${longRuns} holding ${longWords} words`,
);
