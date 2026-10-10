/* ============================================================
   csv.mjs — a strict CSV reader for spreadsheet exports
   (scripts/import-csv.mjs). Zero dependencies.

   RFC 4180, as Google Sheets writes it:
   - fields are separated by commas, records by CRLF or LF (a lone CR
     too);
   - a field may be quoted ("…"); inside quotes a doubled quote ("")
     is one quote, and commas, CR and LF are part of the field (a
     bio can run over several lines);
   - a byte-order mark at the start is dropped, and a line break at
     the very end of the file ends the last record (it does not start
     an empty one).

   Fail-closed: a quote inside an unquoted field, text after a closing
   quote, or a quote left open at the end of the file throws, naming
   the line, rather than guessing what the sheet meant. Cells come
   back exactly as written: nothing is trimmed or normalized.
   ============================================================ */

/**
 * Every record of `text` as an array of cells (strings, verbatim).
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  if (!s) return rows;
  const n = s.length;
  const breaks = (c) => c === "," || c === "\r" || c === "\n";
  let row = [];
  let line = 1;
  let i = 0;
  for (;;) {
    // The start of a field.
    let cell = "";
    if (s[i] === '"') {
      const opened = line;
      i++;
      for (;;) {
        if (i >= n) throw new Error(`CSV line ${opened}: a quoted field is never closed`);
        const c = s[i];
        if (c === '"') {
          if (s[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        if (c === "\n") line++;
        cell += c;
        i++;
      }
      if (i < n && !breaks(s[i])) throw new Error(`CSV line ${line}: text after a closing quote`);
    } else {
      while (i < n && !breaks(s[i])) {
        if (s[i] === '"') throw new Error(`CSV line ${line}: a quote inside an unquoted field`);
        cell += s[i];
        i++;
      }
    }
    row.push(cell);
    if (i >= n) {
      rows.push(row);
      return rows;
    }
    if (s[i] === ",") {
      // The next field (an empty one when the comma ends the file).
      i++;
      continue;
    }
    // A line break ends the record; one at the very end of the file ends the last record.
    i += s[i] === "\r" && s[i + 1] === "\n" ? 2 : 1;
    line++;
    rows.push(row);
    row = [];
    if (i >= n) return rows;
  }
}

/**
 * The records after the header as objects keyed by the header's names. Throws when the header
 * repeats a name or a record has a different number of cells than the header.
 * @param {string[][]} rows
 * @returns {{ header: string[], records: Record<string, string>[] }}
 */
export function recordsOf(rows) {
  const [header, ...body] = rows;
  if (!header) throw new Error("CSV: no header row");
  if (new Set(header).size !== header.length) throw new Error(`CSV: the header repeats a column name: ${header.join(", ")}`);
  const records = body.map((r, k) => {
    if (r.length !== header.length) throw new Error(`CSV record ${k + 1} (line ${k + 2} or later): ${r.length} cells, but the header has ${header.length}`);
    return Object.fromEntries(header.map((h, j) => [h, r[j]]));
  });
  return { header, records };
}
