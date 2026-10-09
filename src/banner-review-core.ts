import * as fs from "fs";
import * as path from "path";

export type Severity = "error" | "warning" | "info";

export type Finding = {
  severity: Severity;
  rule: string;
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
  source?: "rules" | "ai";
};

export type BannerFile = {
  path: string;
  content: string;
};

export type BannerAsset = {
  path: string;
  bytes: number;
};

const TEXT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".js",
  ".css",
  ".json",
  ".svg",
]);
const SKIPPED_FOLDERS = new Set(["node_modules", ".git"]);
const SEVERITIES = new Set<Severity>(["error", "warning", "info"]);

export function collectBanner(srcPath: string): {
  files: BannerFile[];
  assets: BannerAsset[];
} {
  const files: BannerFile[] = [];
  const assets: BannerAsset[] = [];

  const walk = (folder: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const fullPath = path.join(folder, entry.name);

      if (entry.isDirectory()) {
        if (!SKIPPED_FOLDERS.has(entry.name)) {
          walk(fullPath);
        }
        continue;
      }

      const relativePath = path
        .relative(srcPath, fullPath)
        .split(path.sep)
        .join("/");

      if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push({
          path: relativePath,
          content: fs.readFileSync(fullPath, "utf8"),
        });
      } else {
        assets.push({ path: relativePath, bytes: fs.statSync(fullPath).size });
      }
    }
  };

  walk(srcPath);

  files.sort((a, b) => a.path.localeCompare(b.path));
  assets.sort((a, b) => a.path.localeCompare(b.path));

  return { files, assets };
}

// Shrinks the largest files until everything fits the model's input budget.
export function fitToBudget(
  files: BannerFile[],
  maxChars: number,
): BannerFile[] {
  const result = files.map((file) => ({ ...file }));
  const total = () =>
    result.reduce((sum, file) => sum + file.content.length, 0);

  for (let i = 0; i < 50 && total() > maxChars; i++) {
    const largest = result.reduce((a, b) =>
      a.content.length >= b.content.length ? a : b,
    );

    if (largest.content.length < 2000) {
      break;
    }

    const kept = Math.floor(largest.content.length / 2);

    largest.content =
      largest.content.slice(0, kept) +
      "\n/* ...truncated to fit the review budget... */\n";
  }

  return result;
}

function numberLines(content: string): string {
  return content
    .split("\n")
    .map((line, index) => `${index + 1}| ${line}`)
    .join("\n");
}

export function buildInstructions(
  rules: string,
  alreadyReported: Finding[] = [],
): string {
  const reported = alreadyReported.length
    ? [
        "",
        "ALREADY REPORTED by automated checks (do not repeat these):",
        ...alreadyReported.map(
          (finding) =>
            `- ${finding.rule} ${finding.file}${finding.line ? `:${finding.line}` : ""}`,
        ),
      ]
    : [];

  return [
    "You are a code reviewer for HTML5 display banners.",
    "Review the banner files you are given against the rules below, and report only violations of those rules.",
    "",
    "Output format:",
    "Respond with ONLY a JSON array, no prose and no markdown fences. Each item has:",
    '  "severity": "error" | "warning" | "info"  (use the severity defined by the rule)',
    '  "rule": the rule ID, for example "CLK-001"',
    '  "file": the file path exactly as given',
    '  "line": the 1-based line number from the numbered listing (omit if it applies to the whole file)',
    '  "message": what is wrong, in one or two sentences',
    '  "suggestion": a short fix (optional)',
    "If there are no violations, respond with [].",
    "",
    "Only report what you can point to in the files. Never invent files, lines or rules. Report each distinct problem once.",
    ...reported,
    "",
    "RULES",
    "=====",
    rules.trim(),
  ].join("\n");
}

export function buildFilesMessage(
  files: BannerFile[],
  assets: BannerAsset[],
): string {
  const assetLines = assets.length
    ? assets.map((asset) => `- ${asset.path}: ${asset.bytes} bytes`).join("\n")
    : "(none)";

  const totalBytes =
    assets.reduce((sum, asset) => sum + asset.bytes, 0) +
    files.reduce(
      (sum, file) => sum + Buffer.byteLength(file.content, "utf8"),
      0,
    );

  return [
    `ASSET INVENTORY (non-text files)`,
    assetLines,
    "",
    `TOTAL SIZE OF ALL FILES: ${totalBytes} bytes`,
    "",
    "FILES",
    ...files.map(
      (file) => `\n===== ${file.path} =====\n${numberLines(file.content)}`,
    ),
  ].join("\n");
}

export function parseFindings(text: string): Finding[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start === -1 || end <= start) {
    throw new Error("The reviewer did not return a JSON list.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("The reviewer returned JSON that could not be read.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("The reviewer did not return a JSON list.");
  }

  const findings: Finding[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const { severity, rule, file, line, message, suggestion } = item as Record<
      string,
      unknown
    >;

    if (typeof message !== "string" || !message.trim()) {
      continue;
    }

    findings.push({
      severity: SEVERITIES.has(severity as Severity)
        ? (severity as Severity)
        : "warning",
      source: "ai",
      rule: typeof rule === "string" && rule.trim() ? rule.trim() : "OTHER",
      file: typeof file === "string" ? file : "",
      ...(Number.isInteger(line) && (line as number) > 0
        ? { line: line as number }
        : {}),
      message: message.trim(),
      ...(typeof suggestion === "string" && suggestion.trim()
        ? { suggestion: suggestion.trim() }
        : {}),
    });
  }

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
