export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field.trim());
      field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

export function parseCsvRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header?.length) throw new Error("CSV needs a header row.");
  const headers = header.map((value) => value.trim());
  if (headers.some((value) => !value)) throw new Error("CSV headers cannot be empty.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique.");
  return rows.map((values) =>
    Object.fromEntries(headers.map((key, index) => [key, values[index] ?? ""])),
  );
}
