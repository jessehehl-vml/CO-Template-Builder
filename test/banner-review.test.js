const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildFilesMessage,
  buildInstructions,
  collectBanner,
  fitToBudget,
  parseFindings,
} = require("../dist/banner-review-core.js");

test("parseFindings reads a JSON list wrapped in a code fence", () => {
  const findings = parseFindings(
    '```json\n[{"severity":"warning","rule":"CON-001","file":"index.html","line":4,"message":"Hard-coded text."}]\n```',
  );

  assert.deepEqual(findings, [
    {
      severity: "warning",
      rule: "CON-001",
      file: "index.html",
      line: 4,
      message: "Hard-coded text.",
      source: "ai",
    },
  ]);
});

test("parseFindings sorts by severity and drops unusable items", () => {
  const findings = parseFindings(
    JSON.stringify([
      { severity: "info", rule: "JS-003", file: "script.js", message: "Log." },
      {
        severity: "error",
        rule: "CLK-001",
        file: "script.js",
        message: "Open.",
      },
      { severity: "error", rule: "X", file: "script.js" },
      "not an object",
    ]),
  );

  assert.deepEqual(
    findings.map((finding) => finding.rule),
    ["CLK-001", "JS-003"],
  );
});

test("parseFindings falls back for unknown severity and rule", () => {
  const [finding] = parseFindings(
    '[{"severity":"fatal","file":"a.js","line":-2,"message":"Bad."}]',
  );

  assert.equal(finding.severity, "warning");
  assert.equal(finding.rule, "OTHER");
  assert.equal("line" in finding, false);
});

test("parseFindings rejects text without a JSON list", () => {
  assert.throws(() => parseFindings("Looks fine to me."), /JSON list/);
  assert.throws(() => parseFindings("[not json]"), /could not be read/);
});

test("collectBanner separates text files from assets", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "co-banner-"));
  fs.mkdirSync(path.join(src, "dimensions"));
  fs.writeFileSync(path.join(src, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(src, "dimensions", "300x250.css"), "body{}");
  fs.writeFileSync(path.join(src, "logo.png"), Buffer.alloc(10));

  const { files, assets } = collectBanner(src);

  assert.deepEqual(
    files.map((file) => file.path),
    ["dimensions/300x250.css", "index.html"],
  );
  assert.deepEqual(assets, [{ path: "logo.png", bytes: 10 }]);
});

test("fitToBudget shrinks the largest file until the budget is met", () => {
  const files = [
    { path: "small.js", content: "x".repeat(1000) },
    { path: "big.js", content: "y".repeat(20000) },
  ];

  const fitted = fitToBudget(files, 8000);
  const total = fitted.reduce((sum, file) => sum + file.content.length, 0);

  assert.ok(total <= 8000 + 100);
  assert.equal(fitted[0].content.length, 1000);
  assert.match(fitted[1].content, /truncated/);
});

test("prompts carry the rules, numbered lines and the asset inventory", () => {
  const instructions = buildInstructions("### CLK-001 (error) Clicks");
  const message = buildFilesMessage(
    [{ path: "script.js", content: "a\nb" }],
    [{ path: "logo.png", bytes: 2048 }],
  );

  assert.match(instructions, /CLK-001/);
  assert.match(message, /1\| a\n2\| b/);
  assert.match(message, /logo\.png: 2048 bytes/);
});
