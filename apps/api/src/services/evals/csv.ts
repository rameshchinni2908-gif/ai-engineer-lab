/**
 * Minimal, dependency-free RFC4180-ish CSV parser/stringifier. Pure
 * functions, unit-tested for round-trip safety with commas, quotes,
 * embedded newlines, and unicode in fields.
 */

/** Parses CSV text into rows of string cells. Handles quoted fields with
 * doubled-quote escaping, embedded commas/newlines inside quotes, and both
 * \n and \r\n line endings. A trailing newline produces no extra empty row. */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = content.length;

  function pushField(): void {
    row.push(field);
    field = "";
  }
  function pushRow(): void {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // Lookahead for \r\n; otherwise treat lone \r as a row terminator too.
      if (content[i + 1] === "\n") i++;
      pushRow();
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Flush the final field/row if the content didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

/** Quotes a field only when needed (contains comma, quote, newline, or leading/trailing whitespace). */
function quoteField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serializes rows of string cells to CSV text (CRLF line endings, per RFC4180). */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(quoteField).join(",")).join("\r\n");
}
