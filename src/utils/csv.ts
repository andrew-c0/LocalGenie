export type CsvValue = string | number | boolean | null | undefined;

/** One CSV field: quoted when it holds a comma, a quote or a line break; blank for a missing value. */
function field(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV text with a header row. Lines end with CRLF. The byte order mark lets Excel read UTF-8 names
 * correctly.
 */
export function buildCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(field).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
