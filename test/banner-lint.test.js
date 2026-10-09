const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { lintBanner, lintContent } = require("../dist/banner-lint.js");

const boilerplate = path.resolve(__dirname, "..", "boilerplate");

function readBoilerplate() {
  return ["index.html", "script.js", "Creative.js", "styles.css"].map(
    (name) => ({
      path: name,
      content: fs.readFileSync(path.join(boilerplate, name), "utf8"),
    }),
  );
}

function withScript(extra, files = readBoilerplate()) {
  return files.map((file) =>
    file.path === "script.js"
      ? { ...file, content: `${file.content}\n${extra}\n` }
      : file,
  );
}

function rulesOf(findings) {
  return findings.map((finding) => finding.rule);
}

test("the untouched boilerplate has no findings", () => {
  assert.deepEqual(lintBanner(readBoilerplate(), []), []);
});

test("flags direct navigation and network requests", () => {
  const findings = lintBanner(
    withScript(
      'window.open("https://example.com");\nfetch("/api");\n$("#a").on("click", () => { location.href = "x"; });',
    ),
    [],
  );

  assert.deepEqual(
    findings.filter((finding) => finding.rule === "CLK-001").length,
    2,
  );
  assert.ok(rulesOf(findings).includes("NET-001"));
});

test("flags unapproved and non-HTTPS hosts but not approved ones", () => {
  const findings = lintBanner(
    withScript(
      'const a = "https://cdnjs.cloudflare.com/x.js";\nconst b = "https://evil.example.com/x.js";\nconst c = "http://cdnjs.cloudflare.com/y.js";',
    ),
    [],
  ).filter((finding) => finding.rule === "NET-001");

  assert.deepEqual(
    findings.map((finding) => finding.message),
    [
      "evil.example.com is not an approved host.",
      "cdnjs.cloudflare.com is requested over HTTP.",
    ],
  );
});

test("allows hosts used by stylesheet links in index.html", () => {
  const files = readBoilerplate().map((file) =>
    file.path === "index.html"
      ? {
          ...file,
          content: file.content.replace(
            "{{FONT_LINKS}}",
            '<link rel="stylesheet" href="https://fonts.example.com/a.css?v=400">',
          ),
        }
      : file,
  );

  assert.deepEqual(lintBanner(files, []), []);
});

test("does not warn about font files from assets.lemonpi.io", () => {
  const files = readBoilerplate().map((file) =>
    file.path === "index.html"
      ? {
          ...file,
          content: file.content.replace(
            "{{FONT_LINKS}}",
            '<link rel="stylesheet" type="text/css" media="all" href="https://assets.lemonpi.io/a/font/3737/bpSansTF?v=400">',
          ),
        }
      : file,
  );

  assert.deepEqual(lintBanner(files, []), []);
});

test("flags endless animation, unsafe code and swallowed errors", () => {
  const rules = rulesOf(
    lintBanner(
      withScript(
        "gsap.to('.a', { repeat: -1 });\neval('1');\ntry { x(); } catch (e) {}\nconsole.log('hi');",
      ),
      [],
    ),
  );

  for (const rule of ["ANI-002", "JS-001", "JS-002", "JS-003"]) {
    assert.ok(rules.includes(rule), `missing ${rule}`);
  }
});

test("ignores matches inside comments", () => {
  const findings = lintBanner(
    withScript(
      '// window.open("https://evil.example.com")\n/* eval("x"); repeat: -1 */',
    ),
    [],
  );

  assert.deepEqual(findings, []);
});

test("flags a hard-coded link in index.html", () => {
  const files = readBoilerplate().map((file) =>
    file.path === "index.html"
      ? {
          ...file,
          content: file.content.replace(
            '<div id="content">',
            '<div id="content"><a href="https://cdnjs.cloudflare.com/">x</a>',
          ),
        }
      : file,
  );

  assert.deepEqual(rulesOf(lintBanner(files, [])), ["CLK-001"]);
});

test("checks the template contract and animation order", () => {
  const noStart = readBoilerplate().map((file) =>
    file.path === "script.js"
      ? { ...file, content: file.content.replace("Creative.start();", "") }
      : file,
  );

  assert.deepEqual(rulesOf(lintBanner(noStart, [])), ["CRE-001"]);
  assert.deepEqual(rulesOf(lintBanner(withScript("Creative.start();"), [])), [
    "CRE-001",
  ]);

  const playsEarly = withScript("mainTimeline.play();\n").map((file) =>
    file.path === "script.js"
      ? {
          ...file,
          content: `mainTimeline.play();\n${file.content.replace(
            "await Creative.awaitAll();",
            "",
          )}`,
        }
      : file,
  );

  assert.ok(rulesOf(lintBanner(playsEarly, [])).includes("ANI-001"));
});

function withStyles(extra) {
  return readBoilerplate().map((file) =>
    file.path === "styles.css"
      ? { ...file, content: `${file.content}\n${extra}\n` }
      : file,
  );
}

test("flags a percentage translate used for centering", () => {
  const findings = lintBanner(
    withStyles(
      ".a { top: 50%; transform: translateY(-50%); }\n.b { transform: translate(-50%, -50%); }\n.c { translate: -50% 0; }",
    ),
    [],
  ).filter((finding) => finding.rule === "CSS-003");

  assert.equal(findings.length, 3);
  assert.equal(findings[0].line > 1, true);
});

test("ignores pixel translates and keyframe steps", () => {
  const findings = lintBanner(
    withStyles(
      ".a { transform: translateX(10px); }\n@keyframes slide { from { transform: translateX(-50%); } to { transform: none; } }",
    ),
    [],
  );

  assert.deepEqual(findings, []);
});

test("leaves position: absolute to the AI review", () => {
  const findings = lintBanner(
    withStyles(".logo { position: absolute; }\n.cta { position:absolute; }"),
    [],
  );

  assert.deepEqual(findings, []);
});

test("flags heavy assets and heavy total size", () => {
  const findings = lintBanner(readBoilerplate(), [
    { path: "hero.jpg", bytes: 300 * 1024 },
    { path: "video.mp4", bytes: 900 * 1024 },
  ]).filter((finding) => finding.rule === "PERF-001");

  assert.deepEqual(
    findings.map((finding) => finding.file),
    ["", "hero.jpg", "video.mp4"].sort(),
  );
});

test("flags an image src set in script without Creative.addWait", () => {
  const findings = lintBanner(
    withScript('$(".logo").attr("src", content.logo.value);'),
    [],
  ).filter((finding) => finding.rule === "ANI-001");

  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /\$\("\.logo"\).*not registered/);
});

test("accepts an image registered with Creative.addWait after its src", () => {
  const findings = lintBanner(
    withScript(
      '$(".logo").attr("src", content.logo.value);\nCreative.addWait($(".logo"));',
    ),
    [],
  );

  assert.deepEqual(findings, []);
});

test("flags an image registered before its src is set", () => {
  const findings = lintBanner(
    withScript(
      'Creative.addWait($(".logo"));\n$(".logo").attr("src", content.logo.value);',
    ),
    [],
  ).filter((finding) => finding.rule === "ANI-001");

  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /before its src is set/);
});

test("does not judge call order across functions", () => {
  const findings = lintBanner(
    withScript(
      [
        "async function initBanner(content) {",
        "  setBannerContent(content);",
        '  Creative.addWait($(".lifestyle"));',
        "  await Creative.awaitAll();",
        "}",
        "function setBannerContent(content) {",
        '  $(".lifestyle").attr("src", content.lifestyle.value);',
        "}",
      ].join("\n"),
    ),
    [],
  );

  assert.deepEqual(findings, []);
});

test("assets from assets.lemonpi.io are a warning, other hosts an error", () => {
  const findings = lintBanner(
    withScript(
      'const a = "https://assets.lemonpi.io/x/logo.png";\nconst b = "https://other.example.com/x.png";',
    ),
    [],
  ).filter((finding) => finding.rule === "NET-001");

  assert.deepEqual(
    findings.map((finding) => [finding.severity, finding.message]),
    [
      ["error", "other.example.com is not an approved host."],
      ["warning", "A fixed asset is loaded from assets.lemonpi.io."],
    ],
  );
});

test("flags Creative.click with an undeclared variable as an error", () => {
  const findings = lintBanner(
    withScript('$("#cta").on("click", () => Creative.click(url));'),
    [],
  ).filter((finding) => finding.rule === "CLK-002");

  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "error");
  assert.match(findings[0].message, /Creative\.click\(url\)/);
});

test("flags Creative.click with a placeholder value instead of its name", () => {
  const findings = lintBanner(
    withScript(
      '$("#cta").on("click", () => Creative.click(content.url.value));',
    ),
    [],
  ).filter((finding) => finding.rule === "CLK-002");

  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "error");
  assert.match(findings[0].message, /content\.url\.value/);
});

test("accepts Creative.click with a string, a declared variable or a parameter", () => {
  const code = [
    'Creative.click("clickUrl");',
    'const target = "clickUrl";',
    "Creative.click(target);",
    "function go(name) { Creative.click(name, {}); }",
    "const go2 = (key) => Creative.click(key);",
  ].join("\n");

  assert.deepEqual(lintBanner(withScript(code), []), []);
});

test("tracks images held in variables", () => {
  const missing = lintBanner(
    withScript('const img = $("<img>");\nimg.attr("src", content.a.value);'),
    [],
  );
  const registered = lintBanner(
    withScript(
      'const img = $("<img>");\nimg.attr("src", content.a.value);\nCreative.addWait(img);',
    ),
    [],
  );

  assert.deepEqual(rulesOf(missing), ["ANI-001"]);
  assert.deepEqual(registered, []);
});

function contentWith(...values) {
  return {
    variants: values.map(([id, type, value]) => ({
      contentId: id,
      dimensions: [{ placeholders: [{ name: "headline", type, value }] }],
    })),
  };
}

test("feed markup: allowed tags pass, plain text and other types are ignored", () => {
  const findings = lintContent(
    contentWith(
      ["a", "text", "Save <b>20%</b><br>today"],
      ["b", "text", "Plain 5 < 6 text"],
      ["c", "image", "<script>x</script>"],
    ),
  );

  assert.deepEqual(findings, []);
});

test("feed markup: flags scripts, handlers and script URLs as errors", () => {
  const findings = lintContent(
    contentWith(
      ["a", "text", "<script>alert(1)</script>"],
      ["b", "text", '<b onclick="x()">hi</b>'],
      ["c", "text", '<a href="javascript:x()">y</a>'],
    ),
  );

  const errors = findings.filter((finding) => finding.severity === "error");

  assert.ok(errors.some((finding) => /<script>/.test(finding.message)));
  assert.ok(errors.some((finding) => /event handler/.test(finding.message)));
  assert.ok(
    errors.some((finding) => /script or document URL/.test(finding.message)),
  );
  assert.ok(findings.every((finding) => finding.rule === "HTML-001"));
});

test("feed markup: warns about other tags and groups variants", () => {
  const findings = lintContent(
    contentWith(["a", "text", "<h1>x</h1>"], ["b", "text", "<h1>y</h1>"]),
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "warning");
  assert.match(findings[0].message, /in 2 variants, for example "a"/);
});

test("feed markup: checks values inside collections", () => {
  const findings = lintContent({
    variants: [
      {
        contentId: "a",
        dimensions: [
          {
            placeholders: [
              {
                name: "products",
                type: "collection",
                value: [{ title: { type: "text", value: "<iframe src=x>" } }],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.match(findings[0].message, /products\.title/);
  assert.equal(findings[0].severity, "error");
});
