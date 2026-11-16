export type FontCatalogEntry = {
  "font-family": string;
  "css-base-url": string;
  variants: {
    "font-weight": number;
    "font-style"?: string;
    variant: string;
  }[];
};

export type PsdFontMatch = {
  matches: FontCatalogEntry[];
  unmatched: string[];
};

function normalizeFontName(name: string): string {
  return name.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function fontNameCandidates(name: string): Set<string> {
  const normalized = normalizeFontName(name);
  const candidates = new Set([normalized]);
  const withoutStyle = normalized.replace(
    /(bolditalic|italic|oblique|extralight|ultralight|semibold|demibold|extrabold|bold|medium|regular|light|thin|black|heavy|book|roman)(mt)?$/,
    "",
  );

  if (withoutStyle) {
    candidates.add(withoutStyle);
  }

  const withoutPostScriptSuffix = normalized.replace(/(mt|ps)$/, "");
  if (withoutPostScriptSuffix) {
    candidates.add(withoutPostScriptSuffix);
  }

  return candidates;
}

export function matchPsdFontsToCatalog(
  psdFonts: string[],
  catalog: FontCatalogEntry[],
): PsdFontMatch {
  const matches: FontCatalogEntry[] = [];
  const unmatched: string[] = [];
  const matchedFamilies = new Set<string>();

  for (const psdFont of new Set(
    psdFonts.map((font) => font.trim()).filter(Boolean),
  )) {
    const candidates = fontNameCandidates(psdFont);
    const match = catalog.find((font) =>
      candidates.has(normalizeFontName(font["font-family"])),
    );

    if (!match) {
      unmatched.push(psdFont);
      continue;
    }

    const familyKey = normalizeFontName(match["font-family"]);
    if (!matchedFamilies.has(familyKey)) {
      matchedFamilies.add(familyKey);
      matches.push(match);
    }
  }

  return { matches, unmatched };
}
