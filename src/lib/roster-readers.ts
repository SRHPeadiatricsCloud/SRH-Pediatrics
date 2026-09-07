/**
 * Client-side readers for roster imports.
 *  - .xls / .xlsx  → SheetJS (fully offline)
 *  - .doc / .docx  → mammoth (fully offline)
 *  - .pdf          → pdf.js (worker from CDN, pinned to installed version)
 *  - images        → tesseract.js OCR (CDN worker/core; graceful failure)
 */

export type ReadResult = {
  text?: string;
  rows?: (string | number)[][];
  imagePreview?: string;
};

export async function readSpreadsheet(file: File): Promise<ReadResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const rows: (string | number)[][] = [];
  const textLines: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const sheetRows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, raw: false, defval: "" });
    rows.push(...sheetRows);
    for (const r of sheetRows) textLines.push(r.map((c) => String(c ?? "")).join("  "));
  }
  return { rows, text: textLines.join("\n") };
}

export async function readWord(file: File): Promise<ReadResult> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return { text: res.value };
}

export async function readPdf(file: File, onProgress?: (pct: number) => void): Promise<ReadResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = "";
    for (const item of content.items as { str?: string; transform?: number[] }[]) {
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        lines.push(line);
        line = "";
      }
      line += (item.str ?? "") + " ";
      lastY = y;
    }
    if (line) lines.push(line);
    onProgress?.(Math.round((p / doc.numPages) * 100));
  }
  return { text: lines.join("\n") };
}

export async function readImage(file: File, onProgress?: (pct: number, stage?: string) => void): Promise<ReadResult> {
  const preview = URL.createObjectURL(file);
  onProgress?.(5, "loading OCR engine…");
  const tess = await import("tesseract.js");
  const worker = await tess.createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text") onProgress?.(Math.round((m.progress ?? 0) * 100), "reading text…");
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return { text: data.text, imagePreview: preview };
  } finally {
    await worker.terminate();
  }
}

export function fileKind(name: string): "sheet" | "word" | "pdf" | "image" | "unknown" {
  const n = name.toLowerCase();
  if (/\.(xlsx?|xlsm|csv|ods)$/.test(n)) return "sheet";
  if (/\.(docx?|rtf)$/.test(n)) return "word";
  if (/\.pdf$/.test(n)) return "pdf";
  if (/\.(png|jpe?g|webp|bmp|gif)$/.test(n)) return "image";
  return "unknown";
}
