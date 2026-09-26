/** Tiny wrapper around SheetJS so the exporter stays readable. */
import type * as XlsxNS from "xlsx";

export function downloadXlsx(XLSX: typeof XlsxNS, wb: XlsxNS.WorkBook, filename: string): void {
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
