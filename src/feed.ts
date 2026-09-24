export type ParsedFeed = {
  columns: string[];
  rows: Record<string, string>[];
};

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];

  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];

    if (char === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && csvText[i + 1] === "\n") {
        i++;
      }

      row.push(field);
      field = "";

      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);

    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

export function parseFeed(csvText: string): ParsedFeed {
  const rows = parseCsvRows(csvText);

  if (rows.length === 0) {
    throw new Error("The feed is empty.");
  }

  const columns = rows[0].map((column) => column.trim());

  if (columns.length === 0) {
    throw new Error("The feed does not contain any columns.");
  }

  const dataRows = rows.slice(1).map((row) => {
    const record: Record<string, string> = {};

    columns.forEach((column, index) => {
      record[column] = row[index] ?? "";
    });

    return record;
  });

  return {
    columns,
    rows: dataRows,
  };
}
