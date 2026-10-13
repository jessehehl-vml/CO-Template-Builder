export type FontLink = {
  family: string;
  variant: string;
  fontUrl: string;
};

const BLOCK =
  /<!-- CO-EXTENSION-FONTS:START -->[\s\S]*?<!-- CO-EXTENSION-FONTS:END -->/;

export function fontLinkTag(font: FontLink): string {
  return `  <link rel="stylesheet" type="text/css" media="all" href="${font.fontUrl}?v=${font.variant}">`;
}

export function fontBlock(fonts: FontLink[]): string {
  return `<!-- CO-EXTENSION-FONTS:START -->
${fonts.map(fontLinkTag).join("\n")}
  <!-- CO-EXTENSION-FONTS:END -->`;
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Rewrites the --fontN variables in styles.css to match the selected fonts.
export function updateFontVariables(css: string, fonts: FontLink[]): string {
  const declaration = /^[ \t]*--font\d+\s*:[^;\n]*;[ \t]*\n?/gm;
  const lines = fonts
    .filter((font) => font.family?.trim())
    .map((font, index) => `  --font${index + 1}: "${font.family}";\n`)
    .join("");

  const first = new RegExp(declaration.source, "m").exec(css);

  if (first) {
    return (
      css.slice(0, first.index) +
      lines +
      css.slice(first.index).replace(declaration, "")
    );
  }

  const root = /:root\s*\{[ \t]*\n/.exec(css);

  if (!root || !lines) {
    return css;
  }

  const at = root.index + root[0].length;

  return css.slice(0, at) + lines + css.slice(at);
}

// Rewrites the font links in index.html; only call it when fonts were edited.
export function updateFontLinks(
  html: string,
  fonts: FontLink[],
  previous: FontLink[] = [],
): string {
  if (BLOCK.test(html)) {
    return html.replace(BLOCK, () => fontBlock(fonts));
  }

  // Older projects have unmarked links, which would otherwise be duplicated.
  let result = html;

  for (const font of previous) {
    const link = new RegExp(
      `^[ \\t]*<link\\b[^>]*href="${escapeRegExp(font.fontUrl)}\\?v=${escapeRegExp(font.variant)}"[^>]*>[ \\t]*\\n?`,
      "gm",
    );

    result = result.replace(link, "");
  }

  return result.replace(/<\/head>/i, () => `  ${fontBlock(fonts)}\n</head>`);
}
