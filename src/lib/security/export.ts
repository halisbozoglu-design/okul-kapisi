/** Basit dışa aktarım yardımcıları (ek bağımlılık olmadan CSV/Excel-uyumlu + yazdırma). */

export interface ExportColumn<T> {
  key: string;
  title: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsv(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function downloadCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const header = columns.map((c) => escapeCsv(c.title)).join(';');
  const body = rows.map((r) => columns.map((c) => escapeCsv(c.value(r))).join(';')).join('\n');
  // BOM: Excel'de Türkçe karakterler için gerekli
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printTable<T>(title: string, columns: ExportColumn<T>[], rows: T[]) {
  const win = window.open('', '_blank');
  if (!win) return;
  const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>body{font-family:system-ui,sans-serif;padding:16px}h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f3f4f6}</style></head><body>
  <h1>${esc(title)}</h1><table><thead><tr>${columns.map((c) => `<th>${esc(c.title)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(c.value(r))}</td>`).join('')}</tr>`).join('')}</tbody></table>
  </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

/** PDF çıktısı, tarayıcının "PDF olarak kaydet" yazdırma akışı üzerinden alınır. */
export const exportToPdf = printTable;
