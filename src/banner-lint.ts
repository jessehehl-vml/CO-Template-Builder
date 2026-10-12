import * as path from "path";
import type { BannerAsset, BannerFile, Finding } from "./banner-review-core";

// Defaults for PERF-001 in qa/rules.md; change both together.
export const MAX_ASSET_BYTES = 200 * 1024;
export const MAX_TOTAL_BYTES = 1024 * 1024;

const ALLOWED_HOSTS = [
  "cdnjs.cloudflare.com",
  "creative-libraries.lemonpi.io",
  "www.w3.org",
  "cdn.jsdelivr.net",
];

// Allowed, but a fixed asset from here is worth a second look.
const NOTICE_HOSTS = ["assets.lemonpi.io"];

type Draft = Omit<Finding, "source">;

function blankOut(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

// Keeps line numbers intact by replacing comments with spaces.
function stripCodeComments(source: string, lineComments: boolean): string {
  let out = "";
  let quote = "";
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (quote) {
      out += ch;

      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }

      if (ch === quote || (ch === "\n" && quote !== "`")) {
        quote = "";
      }

      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blankOut(source.slice(i, stop));
      i = stop;
      continue;
    }

    if (lineComments && ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function stripHtmlComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, blankOut);
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function fontHosts(files: BannerFile[]): string[] {
  const index = files.find((file) => file.path === "index.html");
  const hosts: string[] = [];

  for (const tag of index?.content.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']stylesheet["']/i.test(tag)) {
      continue;
    }

    const href = /href\s*=\s*["'](https?:\/\/[^"']+)["']/i.exec(tag)?.[1];

    if (href) {
      try {
        hosts.push(new URL(href).hostname);
      } catch {
        // An unparsable link is reported by the URL scan.
      }
    }
  }

  return hosts;
}

export function lintBanner(
  files: BannerFile[],
  assets: BannerAsset[],
  sizes: string[] = [],
): Finding[] {
  const findings: Finding[] = [];
  const allowedHosts = new Set([...ALLOWED_HOSTS, ...fontHosts(files)]);

  const report = (draft: Draft) => findings.push({ ...draft, source: "rules" });

  const scan = (
    file: BannerFile,
    text: string,
    pattern: RegExp,
    build: (match: RegExpExecArray) => Omit<Draft, "file" | "line"> | null,
  ) => {
    for (const match of text.matchAll(pattern)) {
      const draft = build(match as RegExpExecArray);

      if (draft) {
        report({
          ...draft,
          file: file.path,
          line: lineOf(text, match.index ?? 0),
        });
      }
    }
  };

  const checkUrls = (file: BannerFile, text: string) => {
    scan(file, text, /https?:\/\/[^\s"'`()<>\\]+/g, (match) => {
      let url: URL;

      try {
        url = new URL(match[0]);
      } catch {
        return null;
      }

      if (url.protocol === "http:" && url.hostname !== "www.w3.org") {
        return {
          severity: "error",
          rule: "NET-001",
          message: `${url.hostname} is requested over HTTP.`,
          suggestion: "Use HTTPS.",
        };
      }

      if (NOTICE_HOSTS.includes(url.hostname)) {
        // Fonts are shared assets, not per-variant content.
        if (
          /\/font\//i.test(url.pathname) ||
          /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname)
        ) {
          return null;
        }

        return {
          severity: "warning",
          rule: "NET-001",
          message: `A fixed asset is loaded from ${url.hostname}.`,
          suggestion:
            "If it should change per variant, take it from the feed. If it is meant to be fixed, you can ignore this.",
        };
      }

      if (!allowedHosts.has(url.hostname)) {
        return {
          severity: "error",
          rule: "NET-001",
          message: `${url.hostname} is not an approved host.`,
          suggestion: "Remove the request or add the host to the allowlist.",
        };
      }

      return null;
    });
  };

  const allJs = files
    .filter(
      (file) =>
        path.extname(file.path).toLowerCase() === ".js" &&
        !file.path.includes(".min."),
    )
    .map((file) => stripCodeComments(file.content, true))
    .join("\n");

  for (const file of files) {
    if (file.path.includes(".min.")) {
      continue;
    }

    const extension = path.extname(file.path).toLowerCase();

    if (extension === ".js") {
      const text = stripCodeComments(file.content, true);
      const originalLines = file.content.split("\n");

      scan(
        file,
        text,
        /\bwindow\.open\s*\(|\blocation\.(?:href\s*=(?!=)|assign\s*\(|replace\s*\()/g,
        () => ({
          severity: "error",
          rule: "CLK-001",
          message: "Navigates directly instead of using Creative.click.",
          suggestion: 'Call Creative.click("placeholderName") instead.',
        }),
      );

      scan(
        file,
        text,
        /\bfetch\s*\(|\bnew\s+XMLHttpRequest\s*\(|\bnew\s+WebSocket\s*\(|\$\.(?:ajax|get|getJSON|post)\s*\(/g,
        () => ({
          severity: "error",
          rule: "NET-001",
          message: "Makes a network request from the banner.",
          suggestion: "Take data from the content object instead.",
        }),
      );

      scan(
        file,
        text,
        /\brepeat\s*:\s*(?:-1|Infinity)\b|\bsetInterval\s*\(/g,
        () => ({
          severity: "warning",
          rule: "ANI-002",
          message: "The animation can loop without end.",
          suggestion: "Give it a finite repeat count.",
        }),
      );

      scan(
        file,
        text,
        /\beval\s*\(|\bnew\s+Function\s*\(|\bdocument\.write(?:ln)?\s*\(/g,
        () => ({
          severity: "error",
          rule: "JS-001",
          message: "Uses eval, new Function or document.write.",
        }),
      );

      scan(file, text, /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g, () => ({
        severity: "warning",
        rule: "JS-002",
        message: "An empty catch block swallows errors.",
      }));

      scan(file, text, /\bconsole\.log\s*\(|\bdebugger\b/g, (match) => {
        const line = lineOf(text, match.index ?? 0);

        // The template's own log line is expected.
        if (originalLines[line - 1]?.includes("[Creative] initCreative")) {
          return null;
        }

        return {
          severity: "info",
          rule: "JS-003",
          message: "Debug statement left in the code.",
        };
      });

      checkUrls(file, text);

      if (file.path !== "Creative.js") {
        checkImageWaits(file, text, report);
        checkClickCalls(file, text, allJs, report);
      }
    } else if (extension === ".css") {
      const text = stripCodeComments(file.content, false);

      checkUrls(file, text);
      checkLayout(file, text, report);
    } else if (extension === ".html" || extension === ".htm") {
      const text = stripHtmlComments(file.content);

      scan(
        file,
        text,
        /<a\b[^>]*\bhref\s*=\s*["']https?:\/\/[^"']*["']/gi,
        () => ({
          severity: "error",
          rule: "CLK-001",
          message: "A link has a hard-coded URL.",
          suggestion: 'Call Creative.click("placeholderName") instead.',
        }),
      );

      scan(
        file,
        text,
        /\bonclick\s*=\s*["'][^"']*(?:window\.open|location\.)/gi,
        () => ({
          severity: "error",
          rule: "CLK-001",
          message: "An inline click handler navigates directly.",
          suggestion: 'Call Creative.click("placeholderName") instead.',
        }),
      );

      checkUrls(file, text);
    }
  }

  checkContract(files, report);
  checkSelectors(files, report);
  checkLibraries(files, report);
  checkDimensionFiles(files, sizes, report);

  for (const asset of assets) {
    if (asset.bytes > MAX_ASSET_BYTES) {
      report({
        severity: "warning",
        rule: "PERF-001",
        file: asset.path,
        message: `${asset.path} is ${Math.round(asset.bytes / 1024)} KB (limit ${Math.round(MAX_ASSET_BYTES / 1024)} KB).`,
        suggestion: "Compress or resize the asset.",
      });
    }
  }

  const total =
    assets.reduce((sum, asset) => sum + asset.bytes, 0) +
    files.reduce(
      (sum, file) => sum + Buffer.byteLength(file.content, "utf8"),
      0,
    );

  if (total > MAX_TOTAL_BYTES) {
    report({
      severity: "warning",
      rule: "PERF-001",
      file: "",
      message: `All files together are ${Math.round(total / 1024)} KB (limit ${Math.round(MAX_TOTAL_BYTES / 1024)} KB).`,
    });
  }

  return sortFindings(findings);
}

export function sortFindings(findings: Finding[]): Finding[] {
  const order = { error: 0, warning: 1, info: 2 } as const;

  return [...findings].sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
}

// Tags the feed may use in text values, which the banner inserts with .html().
const ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "br",
  "span",
  "sup",
  "sub",
  "small",
]);

const DANGEROUS_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "style",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "svg",
  "math",
  "template",
]);

function markupProblems(text: string): [string, "error" | "warning"][] {
  if (!text.includes("<")) {
    return [];
  }

  const problems = new Map<string, "error" | "warning">();

  for (const match of text.matchAll(/<\s*\/?\s*([a-zA-Z][\w-]*)/g)) {
    const tag = match[1].toLowerCase();

    if (DANGEROUS_TAGS.has(tag)) {
      problems.set(`a <${tag}> tag`, "error");
    } else if (!ALLOWED_TAGS.has(tag)) {
      problems.set(`a <${tag}> tag, which is not an allowed tag`, "warning");
    }
  }

  if (/<[^>]*\bon[a-z]+\s*=/i.test(text)) {
    problems.set("an inline event handler", "error");
  }

  if (
    /(?:javascript|vbscript)\s*:|data\s*:\s*text\/html|\bsrcdoc\s*=/i.test(text)
  ) {
    problems.set("a script or document URL", "error");
  }

  if (/\bstyle\s*=\s*["'][^"']*(?:url\s*\(|expression\s*\()/i.test(text)) {
    problems.set("a style attribute that loads a resource", "warning");
  }

  return [...problems];
}

// Checks the feed values themselves, since the code inserts them as HTML.
export function lintContent(content: unknown): Finding[] {
  const variants = (content as { variants?: unknown } | null)?.variants;

  if (!Array.isArray(variants)) {
    return [];
  }

  const groups = new Map<
    string,
    {
      name: string;
      reason: string;
      severity: "error" | "warning";
      ids: string[];
    }
  >();

  const check = (id: string, name: string, type: unknown, value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          for (const [field, entry] of Object.entries(item)) {
            const cell = entry as { type?: unknown; value?: unknown } | null;

            check(id, `${name}.${field}`, cell?.type, cell?.value);
          }
        }
      }

      return;
    }

    if (typeof value !== "string" || type !== "text") {
      return;
    }

    for (const [reason, severity] of markupProblems(value)) {
      const key = `${name}|${reason}`;
      const group = groups.get(key) ?? { name, reason, severity, ids: [] };

      if (!group.ids.includes(id)) {
        group.ids.push(id);
      }

      groups.set(key, group);
    }
  };

  for (const variant of variants) {
    const id = String(variant?.contentId ?? variant?.variantId ?? "?");

    for (const dimension of variant?.dimensions ?? []) {
      for (const placeholder of dimension?.placeholders ?? []) {
        check(
          id,
          String(placeholder?.name),
          placeholder?.type,
          placeholder?.value,
        );
      }
    }
  }

  return [...groups.values()].map((group) => ({
    severity: group.severity,
    rule: "HTML-001",
    file: "settings/content.json",
    message: `Placeholder "${group.name}" contains ${group.reason} in ${group.ids.length} variant${group.ids.length === 1 ? "" : "s"}, for example "${group.ids[0]}".`,
    suggestion:
      "Remove it from the feed, or add the tag to ALLOWED_TAGS if it is intended.",
    source: "rules" as const,
  }));
}

// Block ranges of functions, to tell which function a position belongs to.
function functionRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const pattern =
    /\bfunction\b[^({]*\([^)]*\)\s*\{|(?:\([^)]*\)|[\w$]+)\s*=>\s*\{/g;

  for (const match of text.matchAll(pattern)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;

    for (let i = open; i < text.length; i++) {
      if (text[i] === "{") {
        depth++;
      } else if (text[i] === "}" && --depth === 0) {
        ranges.push({ start: open, end: i });
        break;
      }
    }
  }

  return ranges;
}

function scopeOf(ranges: { start: number; end: number }[], index: number) {
  const inside = ranges.filter(
    (range) => range.start < index && index < range.end,
  );

  return (
    inside.sort((a, b) => a.end - a.start - (b.end - b.start))[0]?.start ?? -1
  );
}

const NOT_VARIABLES = new Set([
  "undefined",
  "null",
  "true",
  "false",
  "this",
  "window",
  "document",
]);

// Loose on purpose: a name counts as declared if it is declared anywhere.
// Parameters only count within their own file, since they never leak out of it.
function isDeclared(allCode: string, ownCode: string, name: string): boolean {
  const id = name.replace(/\$/g, "\\$");
  const word = new RegExp(`(?<![\\w$])${id}(?![\\w$])`);

  if (
    new RegExp(
      `(?<![\\w$])(?:const|let|var|function|class)\\s+${id}(?![\\w$])`,
    ).test(allCode) ||
    new RegExp(
      `(?<![\\w$])(?:const|let|var)\\s*[\\[{][^=;]*(?<![\\w$])${id}(?![\\w$])`,
    ).test(allCode) ||
    new RegExp(`(?<![\\w$.])${id}\\s*=(?![=>])`).test(allCode)
  ) {
    return true;
  }

  const parameterLists = ownCode.matchAll(
    /function\s*[\w$]*\s*\(([^)]*)\)|\(([^()]*)\)\s*=>|(?<![\w$.])([\w$]+)\s*=>|catch\s*\(([^)]*)\)/g,
  );

  for (const match of parameterLists) {
    if (word.test(match[1] ?? match[2] ?? match[3] ?? match[4] ?? "")) {
      return true;
    }
  }

  return false;
}

// A click that throws means the click-out is broken, so the creative cannot go live.
function checkClickCalls(
  file: BannerFile,
  text: string,
  allCode: string,
  report: (draft: Draft) => void,
) {
  for (const match of text.matchAll(
    /\bCreative\.click\s*\(\s*([A-Za-z_$][\w$]*)\s*[,)]/g,
  )) {
    const name = match[1];

    if (NOT_VARIABLES.has(name) || isDeclared(allCode, text, name)) {
      continue;
    }

    report({
      severity: "error",
      rule: "CLK-002",
      file: file.path,
      line: lineOf(text, match.index ?? 0),
      message: `Creative.click(${name}) uses "${name}", which is not declared, so clicking throws a ReferenceError and the click-out fails.`,
      suggestion: `Pass the exact name of the click placeholder as a string, for example Creative.click("clickUrl").`,
    });
  }

  for (const match of text.matchAll(
    /\bCreative\.click\s*\(\s*([A-Za-z_$][\w$.]*\.value)\s*[,)]/g,
  )) {
    report({
      severity: "error",
      rule: "CLK-002",
      file: file.path,
      line: lineOf(text, match.index ?? 0),
      message: `Creative.click(${match[1]}) passes the value of a placeholder. The click event needs the placeholder name, so the click-out fails (about:blank).`,
      suggestion: `Pass the exact name of the click placeholder as a string, for example Creative.click("clickUrl").`,
    });
  }
}

// GSAP writes the transform of animated elements, so a CSS translate can clash.
function checkLayout(
  file: BannerFile,
  text: string,
  report: (draft: Draft) => void,
) {
  for (const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].trim().replace(/\s+/g, " ");
    const body = block[2];
    const bodyStart = (block.index ?? 0) + block[1].length + 1;

    // Keyframe steps animate on purpose.
    if (/^(?:from|to|[\d.]+%)$/i.test(selector)) {
      continue;
    }

    for (const declaration of body.matchAll(
      /(?:^|;)\s*(transform|translate)\s*:\s*([^;]*)/gi,
    )) {
      const property = declaration[1].toLowerCase();
      const value = declaration[2];

      if (
        (property === "transform" &&
          /translate[XY3d]*\s*\([^)]*%/i.test(value)) ||
        (property === "translate" && value.includes("%"))
      ) {
        report({
          severity: "warning",
          rule: "CSS-003",
          file: file.path,
          line: lineOf(text, bodyStart + (declaration.index ?? 0)),
          message: `${selector} is positioned with a percentage translate, which can clash with GSAP animating its transform.`,
          suggestion: "Center with display: flex on the parent instead.",
        });
      }
    }
  }
}

// An image whose src is set in script must be registered after the src is set,
// because an <img> without a src counts as already loaded.
function checkImageWaits(
  file: BannerFile,
  text: string,
  report: (draft: Draft) => void,
) {
  const assignments: { key: string; isSelector: boolean; index: number }[] = [];

  for (const match of text.matchAll(
    /\$\(\s*(["'])([^"']+)\1\s*\)\s*\.(?:attr|prop)\(\s*["']src["']/g,
  )) {
    assignments.push({
      key: match[2],
      isSelector: true,
      index: match.index ?? 0,
    });
  }

  for (const match of text.matchAll(
    /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\.(?:attr|prop)\(\s*["']src["']|(?<![\w$.])([A-Za-z_$][\w$]*)\s*\.setAttribute\(\s*["']src["']|(?<![\w$.])([A-Za-z_$][\w$]*)\.src\s*=(?!=)/g,
  )) {
    assignments.push({
      key: match[1] ?? match[2] ?? match[3],
      isSelector: false,
      index: match.index ?? 0,
    });
  }

  const waits = [
    ...text.matchAll(/Creative\.addWait\s*\(([^;]*?)\)\s*(?:;|\n|$)/g),
  ].map((match) => ({
    argument: match[1],
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));

  // addWait takes several elements, so back-to-back calls can be one call.
  let runStart = 0;

  for (let i = 1; i <= waits.length; i++) {
    const joined =
      i < waits.length &&
      text.slice(waits[i - 1].end, waits[i].index).trim() === "";

    if (joined) {
      continue;
    }

    if (i - runStart > 1) {
      report({
        severity: "info",
        rule: "ANI-001",
        file: file.path,
        line: lineOf(text, waits[runStart].index),
        message: `${i - runStart} Creative.addWait calls follow each other.`,
        suggestion: `Combine them: Creative.addWait(${waits
          .slice(runStart, i)
          .map((wait) => wait.argument.trim())
          .join(", ")}).`,
      });
    }

    runStart = i;
  }

  const covers = (
    wait: { argument: string },
    key: string,
    isSelector: boolean,
  ) =>
    isSelector
      ? wait.argument.includes(key)
      : new RegExp(`(?<![\\w$])${key.replace(/\$/g, "\\$")}(?![\\w$])`).test(
          wait.argument,
        );

  const ranges = functionRanges(text);
  const reported = new Set<string>();

  for (const { key, isSelector, index } of assignments.sort(
    (a, b) => a.index - b.index,
  )) {
    if (reported.has(key)) {
      continue;
    }

    const matching = waits.filter((wait) => covers(wait, key, isSelector));

    if (matching.some((wait) => wait.index > index)) {
      continue;
    }

    // Registered earlier in a different function: the call order isn't visible here.
    const scope = scopeOf(ranges, index);
    const early = matching.filter(
      (wait) => scopeOf(ranges, wait.index) === scope,
    );

    if (matching.length > 0 && early.length === 0) {
      continue;
    }

    reported.add(key);

    const target = isSelector ? `$("${key}")` : key;

    report({
      severity: "error",
      rule: "ANI-001",
      file: file.path,
      line: lineOf(text, index),
      message:
        matching.length > 0
          ? `${target} is registered with Creative.addWait before its src is set, so the wait ends early.`
          : `The image ${target} gets its src from script but is not registered with Creative.addWait.`,
      suggestion: `Call Creative.addWait(${target}) right after setting the src, before Creative.awaitAll().`,
    });
  }
}

function checkContract(files: BannerFile[], report: (draft: Draft) => void) {
  const creative = files.find((file) => file.path === "Creative.js");
  const script = files.find((file) => file.path === "script.js");

  if (!creative) {
    report({
      severity: "error",
      rule: "CRE-001",
      file: "Creative.js",
      message: "Creative.js is missing.",
    });
  } else if (
    !/window\.Creative\s*=/.test(stripCodeComments(creative.content, true))
  ) {
    report({
      severity: "error",
      rule: "CRE-001",
      file: "Creative.js",
      message: "window.Creative is no longer defined.",
    });
  }

  if (!script) {
    report({
      severity: "error",
      rule: "CRE-001",
      file: "script.js",
      message: "script.js is missing.",
    });
    return;
  }

  const text = stripCodeComments(script.content, true);
  const starts = [...text.matchAll(/\bCreative\.start\s*\(\s*\)/g)];

  if (starts.length !== 1) {
    report({
      severity: "error",
      rule: "CRE-001",
      file: "script.js",
      ...(starts.length > 1
        ? { line: lineOf(text, starts[1].index ?? 0) }
        : {}),
      message:
        starts.length === 0
          ? "Creative.start() is never called."
          : "Creative.start() is called more than once.",
    });
  }

  if (
    !/function\s+initCreative\b|\b(?:const|let|var)\s+initCreative\b|\binitCreative\s*=/.test(
      text,
    )
  ) {
    report({
      severity: "error",
      rule: "CRE-001",
      file: "script.js",
      message: "initCreative(content) is not defined.",
    });
  }

  const play = text.search(/\.play\s*\(/);
  const wait = text.search(/\bawaitAll\s*\(/);

  if (play !== -1 && (wait === -1 || play < wait)) {
    report({
      severity: "error",
      rule: "ANI-001",
      file: "script.js",
      line: lineOf(text, play),
      message: "The timeline plays before Creative.awaitAll() has finished.",
      suggestion: "await Creative.awaitAll() before calling play().",
    });
  }

  checkPreviewTimelines(creative, script, text, report);
}

// Block body of a named function, or null when it is not found.
function functionBody(text: string, name: string): string | null {
  const match = new RegExp(`\\bfunction\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(
    text,
  );

  if (!match) {
    return null;
  }

  const open = match.index + match[0].length - 1;
  let depth = 0;

  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") {
      depth++;
    } else if (text[i] === "}" && --depth === 0) {
      return text.slice(open + 1, i);
    }
  }

  return null;
}

// QA mode seeks mainTimeline to "frameN-preview", which sits at the
// "preview-ready" label of each frame timeline.
function checkPreviewTimelines(
  creative: BannerFile | undefined,
  script: BannerFile,
  text: string,
  report: (draft: Draft) => void,
) {
  const problem = (
    severity: "error" | "warning",
    file: string,
    message: string,
    suggestion: string,
    line?: number,
  ) =>
    report({
      severity,
      rule: "ANI-003",
      file,
      message,
      suggestion,
      ...(line ? { line } : {}),
    });

  const creativeCode = creative
    ? stripCodeComments(creative.content, true)
    : "";

  if (creative) {
    if (
      !creativeCode.includes("preview-pause") ||
      !/\.setupPreviewControls\s*\(/.test(creativeCode)
    ) {
      problem(
        "error",
        "Creative.js",
        "Creative.js does not handle preview-pause, so QA mode cannot pause on a frame.",
        "Restore setupPreviewControls() from the template and call it in Creative.start().",
      );
    }

    if (!creativeCode.includes("creative-ready")) {
      problem(
        "error",
        "Creative.js",
        "Creative.js never sends creative-ready, so QA mode never asks the banner to pause.",
        "Restore notifyReady() from the template and call it after initCreative.",
      );
    }
  }

  if (!/\b(?:const|let|var)\s+mainTimeline\b/.test(text)) {
    problem(
      "error",
      "script.js",
      "mainTimeline is not declared, so QA mode has no timeline to pause.",
      "Declare const mainTimeline = gsap.timeline({ paused: true }).",
    );
  }

  // The template's markers are still in place, so there is nothing to check yet.
  if (script.content.includes("/* FRAME_TIMELINES */")) {
    return;
  }

  const declared = [...text.matchAll(/\bframe(\d+)Timeline\b/g)].map((match) =>
    Number(match[1]),
  );
  const configured = Number(/\bframes\s*:\s*(\d+)/.exec(creativeCode)?.[1]);
  const highest = Math.max(0, ...declared);
  const count =
    Number.isInteger(configured) && configured > 0 ? configured : highest;

  if (highest > count) {
    problem(
      "error",
      "Creative.js",
      `Creative.frames is ${count}, but script.js uses frame${highest}Timeline.`,
      "Make Creative.frames match the number of frames, or QA mode shows too few.",
    );
  }

  for (let n = 1; n <= count; n++) {
    const label = new RegExp(
      `addLabel\\(\\s*["'\`]frame${n}-preview["'\`]\\s*(,)?`,
    ).exec(text);

    if (!label) {
      problem(
        "error",
        "script.js",
        `The label "frame${n}-preview" is never added to mainTimeline.`,
        `Add mainTimeline.addLabel("frame${n}-preview", frame${n}Start + frame${n}Timeline.labels["preview-ready"]).`,
      );
    } else if (!label[1]) {
      problem(
        "warning",
        "script.js",
        `The label "frame${n}-preview" has no position, so it lands at the end of whatever is on mainTimeline.`,
        `Position it at frame${n}Timeline.labels["preview-ready"] plus the frame's start time.`,
        lineOf(text, label.index),
      );
    }

    if (
      !new RegExp(`\\bmainTimeline\\s*\\.add\\(\\s*frame${n}Timeline\\b`).test(
        text,
      )
    ) {
      problem(
        "error",
        "script.js",
        `frame${n}Timeline is never added to mainTimeline, so it never plays or seeks.`,
        `Call mainTimeline.add(frame${n}Timeline).`,
      );
    }

    const body = functionBody(text, `createFrame${n}Animation`) ?? text;

    if (!/["'`]preview-ready["'`]/.test(body)) {
      problem(
        "error",
        "script.js",
        `Frame ${n} has no "preview-ready" label, so QA mode cannot find its end state.`,
        `Add .addLabel("preview-ready") to frame${n}Timeline once the frame is fully shown.`,
      );
    }
  }
}

const SELECTOR_CALLS = [
  /\$\(\s*(["'])([^"'\n]*?)\1\s*[,)]/g,
  /\b(?:querySelector(?:All)?|closest|find)\(\s*(["'])([^"'\n]*?)\1\s*\)/g,
  /\.(?:to|from|fromTo|set)\(\s*(["'])([^"'\n]*?)\1\s*,/g,
  /\bgsap\.utils\.toArray\(\s*(["'])([^"'\n]*?)\1\s*[,)]/g,
];

function selectorTokens(selector: string): string[] {
  const cleaned = selector.replace(
    /\[[^\]]*\]|\([^)]*\)|"[^"]*"|'[^']*'/g,
    " ",
  );

  return cleaned.match(/[.#][A-Za-z_-][\w-]*/g) ?? [];
}

// Classes and ids that exist in the markup or are created by the script.
function knownSelectors(htmlText: string, scripts: string[]): Set<string> {
  const known = new Set<string>();
  const addClasses = (list: string) =>
    list
      .split(/\s+/)
      .filter(Boolean)
      .forEach((name) => known.add(`.${name}`));

  for (const match of htmlText.matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi)) {
    addClasses(match[1]);
  }

  for (const match of htmlText.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
    known.add(`#${match[1].trim()}`);
  }

  for (const script of scripts) {
    const classLists = [
      /\bclass\s*[=:]\s*\\?["']([^"'\\]+)/g,
      /\bclassName\s*=\s*["']([^"']+)/g,
      /\.(?:addClass|removeClass|toggleClass)\(\s*["']([^"']+)["']/g,
      /\.attr\(\s*["']class["']\s*,\s*["']([^"']+)["']/g,
      /\b(?:lines|words|chars)Class\s*:\s*["']([^"']+)["']/g,
    ];

    for (const pattern of classLists) {
      for (const match of script.matchAll(pattern)) {
        addClasses(match[1]);
      }
    }

    for (const match of script.matchAll(/\bclassList\.\w+\(([^)]*)\)/g)) {
      for (const name of match[1].matchAll(/["']([^"']+)["']/g)) {
        addClasses(name[1]);
      }
    }

    for (const match of script.matchAll(
      /\bid\s*[=:]\s*\\?["']([^"'\\]+)|\.attr\(\s*["']id["']\s*,\s*["']([^"']+)["']/g,
    )) {
      known.add(`#${(match[1] ?? match[2]).trim()}`);
    }
  }

  return known;
}

// A selector that matches nothing fails silently: GSAP only logs a warning.
function checkSelectors(files: BannerFile[], report: (draft: Draft) => void) {
  const htmlText = files
    .filter((file) => /\.html?$/i.test(file.path))
    .map((file) => stripHtmlComments(file.content))
    .join("\n");

  if (!htmlText.trim()) {
    return;
  }

  const scripts = files
    .filter(
      (file) =>
        path.extname(file.path).toLowerCase() === ".js" &&
        !file.path.includes(".min.") &&
        file.path !== "Creative.js",
    )
    .map((file) => ({
      path: file.path,
      text: stripCodeComments(file.content, true),
    }));

  const known = knownSelectors(
    htmlText,
    scripts.map((script) => script.text),
  );

  for (const script of scripts) {
    const reported = new Set<string>();

    for (const pattern of SELECTOR_CALLS) {
      for (const match of script.text.matchAll(pattern)) {
        const selector = match[2];

        if (selector.trimStart().startsWith("<") || selector.includes("${")) {
          continue;
        }

        for (const token of selectorTokens(selector)) {
          if (known.has(token) || reported.has(token)) {
            continue;
          }

          reported.add(token);
          report({
            severity: "warning",
            rule: "SEL-001",
            file: script.path,
            line: lineOf(script.text, match.index ?? 0),
            message: `The selector "${selector}" uses ${token}, which is not in index.html or created by the script, so it matches nothing.`,
            suggestion:
              "Check the spelling against the markup, or remove the line if the element is gone.",
          });
        }
      }
    }
  }
}

const GSAP_PLUGINS = [
  "SplitText",
  "ScrollTrigger",
  "ScrollToPlugin",
  "Draggable",
  "MorphSVGPlugin",
  "DrawSVGPlugin",
  "CustomEase",
  "MotionPathPlugin",
  "TextPlugin",
  "Flip",
  "InertiaPlugin",
  "ScrambleTextPlugin",
];

// Duplicate or mismatched library tags, and plugins used but never loaded.
function checkLibraries(files: BannerFile[], report: (draft: Draft) => void) {
  const index = files.find((file) => file.path === "index.html");

  if (!index) {
    return;
  }

  const html = stripHtmlComments(index.content);
  const sources = [
    ...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi),
  ].map((match) => match[1]);

  const problem = (severity: "error" | "warning", message: string) =>
    report({
      severity,
      rule: "LIB-001",
      file: "index.html",
      message,
    });

  const countOf = (pattern: RegExp) =>
    sources.filter((source) => pattern.test(source)).length;

  if (countOf(/jquery(?:[-.]\d[\d.]*)?(?:\.min)?\.js/i) > 1) {
    problem("warning", "jQuery is loaded more than once.");
  }

  if (countOf(/(?:^|\/)gsap(?:\.min)?\.js(?:\?|$)/i) > 1) {
    problem("warning", "GSAP is loaded more than once.");
  }

  const gsapNames = new RegExp(
    `gsap|${GSAP_PLUGINS.join("|")}|TweenMax|TweenLite`,
    "i",
  );
  const versions = new Set(
    sources
      .filter((source) => gsapNames.test(source))
      .map((source) => /\/(\d+\.\d+\.\d+)\//.exec(source)?.[1])
      .filter((version): version is string => Boolean(version)),
  );

  if (versions.size > 1) {
    problem(
      "warning",
      `GSAP files are loaded in different versions (${[...versions].join(", ")}).`,
    );
  }

  const code = files
    .filter(
      (file) =>
        path.extname(file.path).toLowerCase() === ".js" &&
        !file.path.includes(".min.") &&
        file.path !== "Creative.js",
    )
    .map((file) => stripCodeComments(file.content, true))
    .join("\n");

  const loadsAll = sources.some((source) =>
    /gsap[-.]?all|\/all(?:\.min)?\.js/i.test(source),
  );

  for (const plugin of GSAP_PLUGINS) {
    const used = new RegExp(
      `\\bnew\\s+${plugin}\\s*\\(|\\b${plugin}\\.create\\s*\\(|registerPlugin\\([^)]*\\b${plugin}\\b`,
    ).test(code);

    if (
      used &&
      !loadsAll &&
      !sources.some((source) =>
        source.toLowerCase().includes(plugin.toLowerCase()),
      )
    ) {
      problem(
        "warning",
        `${plugin} is used in the script but no ${plugin} file is loaded in index.html.`,
      );
    }
  }
}

// Responsive banners get per-size rules in dimensions/WxH.css.
function checkDimensionFiles(
  files: BannerFile[],
  sizes: string[],
  report: (draft: Draft) => void,
) {
  if (sizes.length === 0) {
    return;
  }

  const present = new Set(
    files
      .map((file) => /^dimensions\/(\d+x\d+)\.css$/i.exec(file.path)?.[1])
      .filter((size): size is string => Boolean(size)),
  );

  if (sizes.length > 1) {
    for (const size of sizes.filter((size) => !present.has(size))) {
      report({
        severity: "warning",
        rule: "DIM-001",
        file: `dimensions/${size}.css`,
        message: `There is no stylesheet for the size ${size}.`,
        suggestion:
          "Add dimensions/WxH.css, or ignore this if the size needs no rules of its own.",
      });
    }
  }

  for (const size of [...present].filter((size) => !sizes.includes(size))) {
    report({
      severity: "info",
      rule: "DIM-001",
      file: `dimensions/${size}.css`,
      message: `dimensions/${size}.css belongs to a size that is not selected for this banner.`,
    });
  }
}
