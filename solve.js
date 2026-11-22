// FastCSV — a fast drop-in for csv-reader 1.0.0.
//
// Reads one CSV input {text, header} and answers exactly what csv-reader
// 1.0.0 answers: {columns, rows, errors}. Same broken-row policy, same
// error records, same order — only the scanning is different: instead of
// walking one character at a time, every field jumps straight to its next
// delimiter with indexOf, and quoted stretches are sliced whole, with
// line-break normalisation applied only to stretches that hold one.
//
// Policy (csv-reader 1.0.0):
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, each CRLF or lone CR inside it read
//     as LF; what follows its closing quote, up to the next comma or line
//     break, is appended as it stands (quote_junk, when the field ends);
//     a quote that never closes is a literal character, and the text after
//     it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on, row its record's index in rows (null for the header), in
//     the order met.

const COMMA = 0;
const BREAK = 1;
const DONE = 2;

const QUOTE = 34;
const COMMA_CH = 44;
const CR = 13;
const LF = 10;

export function run(input) {
  const text = String(input.text);
  const useHeader = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const total = text.length;
  let cursor = total > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let lineNo = 1;
  let startLine = 1;
  let startRow = null;

  function pushError(code) {
    errors.push({ code, line: startLine, row: startRow });
  }

  // Slice text[a..b) with every CRLF and lone CR inside it read as one LF.
  // Counts the line breaks into lineNo. Plain stretches (no CR/LF at all)
  // come back untouched.
  function takeStretch(a, b) {
    if (a >= b) return '';
    const seg = text.slice(a, b);
    if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) return seg;
    const parts = seg.split(/\r\n|\r|\n/);
    lineNo += parts.length - 1;
    return parts.join('\n');
  }

  // One native scan for the next field delimiter, instead of three
  // separate indexOf passes over the same stretch.
  const DELIM = /[,\r\n]/g;

  // Scan an unquoted field starting at cursor, appending onto `seed`.
  // Returns [value, ended, added]: the field, how it ended, and how many
  // characters were kept during this scan (a dropped stray CR adds none).
  function scanPlain(seed) {
    let value = seed;
    let added = 0;
    for (;;) {
      DELIM.lastIndex = cursor;
      const m = DELIM.exec(text);
      const cut = m ? m.index : -1;
      const kind = m ? (m[0] === ',' ? 0 : m[0] === '\n' ? 1 : 2) : 0;
      if (cut === -1) {
        value += text.slice(cursor);
        added += total - cursor;
        cursor = total;
        return [value, DONE, added];
      }
      value += text.slice(cursor, cut);
      added += cut - cursor;
      if (kind === 0) {
        cursor = cut + 1;
        return [value, COMMA, added];
      }
      if (kind === 1) {
        cursor = cut + 1;
        lineNo += 1;
        return [value, BREAK, added];
      }
      if (text.charCodeAt(cut + 1) === LF) {
        cursor = cut + 2;
        lineNo += 1;
        return [value, BREAK, added];
      }
      pushError('stray_cr');
      cursor = cut + 1;
    }
  }

  // Scan a quoted field whose opening quote is at cursor.
  // Returns [value, ended, added] in the same shape as scanPlain.
  function scanQuoted() {
    const open = cursor;
    const openLine = lineNo;
    let value = '';
    let scanFrom = cursor + 1;
    let closedAt = -1;
    for (;;) {
      const q = text.indexOf('"', scanFrom);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === QUOTE) {
        value += takeStretch(scanFrom, q);
        value += '"';
        scanFrom = q + 2;
        continue;
      }
      value += takeStretch(scanFrom, q);
      closedAt = q;
      break;
    }
    if (closedAt === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      cursor = open + 1;
      lineNo = openLine;
      pushError('unterminated_quote');
      return scanPlain('"');
    }
    cursor = closedAt + 1;
    if (cursor >= total) return [value, DONE, 0];
    const c = text.charCodeAt(cursor);
    if (c === COMMA_CH) {
      cursor += 1;
      return [value, COMMA, 0];
    }
    if (c === LF) {
      cursor += 1;
      lineNo += 1;
      return [value, BREAK, 0];
    }
    if (c === CR && text.charCodeAt(cursor + 1) === LF) {
      cursor += 2;
      lineNo += 1;
      return [value, BREAK, 0];
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = scanPlain(value);
    if (junk[2] > 0) pushError('quote_junk');
    return junk;
  }

  for (;;) {
    // Lines left with no characters are no records.
    while (cursor < total) {
      const c = text.charCodeAt(cursor);
      if (c === LF) {
        cursor += 1;
        lineNo += 1;
      } else if (c === CR && text.charCodeAt(cursor + 1) === LF) {
        cursor += 2;
        lineNo += 1;
      } else {
        break;
      }
    }
    if (cursor >= total) break;

    startLine = lineNo;
    startRow = useHeader && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let wasQuoted = false;
    do {
      wasQuoted = text.charCodeAt(cursor) === QUOTE;
      const out = wasQuoted ? scanQuoted() : scanPlain('');
      fields.push(out[0]);
      ended = out[1];
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !wasQuoted) continue;

    if (width < 0) width = fields.length;
    if (useHeader && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: startLine, row: startRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: startLine, row: startRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: useHeader ? (columns ?? []) : null, rows, errors };
}
