const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { BoilerplateGenerator } = require("../dist/boilerplate-generator.js");

function createMessage(overrides = {}) {
  return {
    folder: "",
    name: "Test Campaign",
    userName: "Test User",
    dimensionType: "single",
    selectedDimensions: ["300x250"],
    selectedFonts: [],
    coFonts: [],
    placeholderVariants: [],
    frames: 3,
    autoFillPlaceholderContent: false,
    autoScaleFonts: false,
    ...overrides,
  };
}

function createGenerator() {
  const extensionPath = path.resolve(__dirname, "..");

  return new BoilerplateGenerator({
    extensionPath,
    extension: {
      packageJSON: {
        name: "CO Template Builder",
        version: "0.0.3",
      },
    },
  });
}

function createProject(messageOverrides = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const generator = createGenerator();

  generator.generate(createMessage({ folder, ...messageOverrides }));

  return { folder, generator };
}

function readGeneratedFile(folder, fileName) {
  return fs.readFileSync(path.join(folder, "src", fileName), "utf8");
}

test("generate adds Creative.autoScaleFont when autoscale is enabled", () => {
  const { folder } = createProject({ autoScaleFonts: true });

  const creative = readGeneratedFile(folder, "Creative.js");
  const script = readGeneratedFile(folder, "script.js");

  assert.match(creative, /autoScaleFont:\s*function/);
  assert.match(script, /await Creative\.autoScaleFont\(\);/);
});

test("generate removes Creative.autoScaleFont when autoscale is disabled", () => {
  const { folder } = createProject();

  const creative = readGeneratedFile(folder, "Creative.js");
  const script = readGeneratedFile(folder, "script.js");

  assert.doesNotMatch(creative, /autoScaleFont:\s*function/);
  assert.doesNotMatch(script, /await Creative\.autoScaleFont\(\);/);
});

function loadCheck(creativeSource, navigator) {
  const vm = require("node:vm");
  const window = { devicePixelRatio: 2 };

  vm.runInNewContext(creativeSource, {
    window,
    navigator,
    document: { fonts: { ready: Promise.resolve() } },
  });

  return window.Creative.check;
}

test("generate adds Creative.check when browser check is enabled", () => {
  const { folder } = createProject({ browserCheck: true });
  const creative = readGeneratedFile(folder, "Creative.js");

  assert.match(creative, /check: \(\(\) => \{/);
  assert.doesNotMatch(creative, /BROWSER_CHECK/);

  const chrome = loadCheck(creative, {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    maxTouchPoints: 0,
  });

  assert.deepEqual(
    [chrome.chrome(), chrome.safari(), chrome.edge(), chrome.windows()],
    [true, false, false, true],
  );
  assert.deepEqual(
    [chrome.desktop(), chrome.mobile(), chrome.retina()],
    [true, false, true],
  );

  const ipad = loadCheck(creative, {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    maxTouchPoints: 5,
  });

  assert.deepEqual(
    [ipad.ios(), ipad.mobile(), ipad.osx(), ipad.safari()],
    [true, true, false, true],
  );

  const edge = loadCheck(creative, {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    maxTouchPoints: 0,
  });

  assert.deepEqual([edge.edge(), edge.chrome()], [true, false]);
});

test("generate omits Creative.check when browser check is disabled", () => {
  const { folder } = createProject();
  const creative = readGeneratedFile(folder, "Creative.js");

  assert.doesNotMatch(creative, /check: \(\(\) => \{/);
  assert.doesNotMatch(creative, /BROWSER_CHECK/);
});

test("generate adds the latest SplitText when it is enabled", () => {
  const { folder } = createProject({ splitText: true });
  const index = readGeneratedFile(folder, "index.html");

  assert.match(index, /gsap\/3\.15\.0\/gsap\.min\.js/);
  assert.match(index, /gsap\/3\.15\.0\/SplitText\.min\.js/);
  assert.doesNotMatch(index, /3\.13\.0|SPLIT_TEXT/);
});

test("generate leaves SplitText out when it is disabled", () => {
  const { folder } = createProject();
  const index = readGeneratedFile(folder, "index.html");

  assert.doesNotMatch(index, /SplitText|SPLIT_TEXT/);
  assert.match(index, /gsap\/3\.13\.0\/gsap\.min\.js/);
  assert.doesNotMatch(index, /\n\s*\n\s*<script src="\.\/Creative\.js"/);
});

function readProjectFiles(folder) {
  return {
    creative: readGeneratedFile(folder, "Creative.js"),
    script: readGeneratedFile(folder, "script.js"),
    index: readGeneratedFile(folder, "index.html"),
  };
}

test("add-ons can be added to and removed from an existing project", () => {
  const { applyAddOns, detectAddOns } = require("../dist/addons.js");
  const { folder } = createProject();
  const original = readProjectFiles(folder);
  const all = { autoScaleFonts: true, browserCheck: true, splitText: true };

  assert.deepEqual(detectAddOns(original), {
    autoScaleFonts: false,
    browserCheck: false,
    splitText: false,
  });

  const added = applyAddOns(original, all);

  assert.deepEqual(detectAddOns(added.files), all);
  assert.deepEqual(added.warnings, []);
  assert.equal(
    added.files.script.match(/await Creative\.autoScaleFont\(\);/g).length,
    1,
  );
  assert.match(added.files.index, /gsap\/3\.15\.0\/gsap\.min\.js/);
  assert.match(added.files.index, /gsap\/3\.15\.0\/SplitText\.min\.js/);
  assert.doesNotThrow(() => new Function(added.files.creative));

  const removed = applyAddOns(added.files, {
    autoScaleFonts: false,
    browserCheck: false,
    splitText: false,
  });

  assert.equal(removed.files.creative, original.creative);
  assert.equal(removed.files.script, original.script);
  assert.equal(
    removed.files.index,
    original.index.replace("gsap/3.13.0/", "gsap/3.15.0/"),
  );
});

test("add-ons detects what a generated project already has", () => {
  const { detectAddOns } = require("../dist/addons.js");
  const { folder } = createProject({
    autoScaleFonts: true,
    browserCheck: true,
    splitText: true,
  });

  assert.deepEqual(detectAddOns(readProjectFiles(folder)), {
    autoScaleFonts: true,
    browserCheck: true,
    splitText: true,
  });
});

test("add-ons reports what it cannot change", () => {
  const { applyAddOns } = require("../dist/addons.js");
  const { folder } = createProject();
  const files = readProjectFiles(folder);
  const result = applyAddOns(
    {
      creative: "// no Creative object here",
      script: "// no initCreative here",
      index: "<html></html>",
    },
    { autoScaleFonts: true, browserCheck: true, splitText: true },
  );

  assert.equal(result.changes.length, 0);
  assert.equal(result.warnings.length, 3);
  assert.ok(files.creative.length > 0);
});

test("font links are marked, replaced on update and never duplicated", () => {
  const { updateFontLinks } = require("../dist/font-links.js");
  const open = {
    family: "Open Sans",
    variant: "700",
    fontUrl: "https://fonts.example/open-sans",
  };
  const inter = {
    family: "Inter",
    variant: "400",
    fontUrl: "https://fonts.example/inter",
  };
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));

  createGenerator().generate(createMessage({ folder, selectedFonts: [open] }));

  const index = fs.readFileSync(path.join(folder, "src", "index.html"), "utf8");
  const count = (html, url) => html.split(url).length - 1;

  assert.match(index, /CO-EXTENSION-FONTS:START/);
  assert.equal(count(index, "fonts.example/open-sans"), 1);

  const swapped = updateFontLinks(index, [inter], [open]);

  assert.equal(count(swapped, "fonts.example/open-sans"), 0);
  assert.equal(count(swapped, "fonts.example/inter"), 1);

  const legacy =
    '<head>\n    <link rel="stylesheet" type="text/css" media="all" href="https://fonts.example/open-sans?v=700">\n</head>';
  const migrated = updateFontLinks(legacy, [open, inter], [open]);

  assert.equal(count(migrated, "fonts.example/open-sans"), 1);
  assert.equal(count(migrated, "fonts.example/inter"), 1);
});

test("saving other sections keeps the saved placeholders", () => {
  const { mergePlaceholders } = require("../dist/placeholders.js");
  const saved = {
    headline: { type: "text" },
    logo: { type: "image" },
    products: {
      type: "collection",
      intent: "product",
      items_required: 3,
      placeholders: { name: { type: "text" } },
    },
  };
  const mapping = {
    collection: "products",
    intent: "product",
    required: "3",
    fields: [{ placeholder: "name", placeholderType: "text" }],
  };

  assert.deepEqual(mergePlaceholders(saved, undefined, null), saved);
  assert.deepEqual(mergePlaceholders(saved, undefined, mapping), saved);
  assert.deepEqual(mergePlaceholders(undefined, undefined, null), {});

  const edited = mergePlaceholders(
    saved,
    [{ name: "headline", type: "text" }],
    mapping,
  );

  assert.deepEqual(Object.keys(edited), ["headline", "products"]);
});

test("font variables in styles.css follow the selected fonts", () => {
  const { updateFontVariables } = require("../dist/font-links.js");
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const fonts = [
    { family: "Open Sans", variant: "700", fontUrl: "https://f.example/a" },
    { family: "Inter", variant: "400", fontUrl: "https://f.example/b" },
  ];

  createGenerator().generate(createMessage({ folder, selectedFonts: fonts }));

  const css = fs.readFileSync(path.join(folder, "src", "styles.css"), "utf8");
  const next = updateFontVariables(css, [fonts[1]]);

  assert.match(next, /--font1: "Inter";/);
  assert.doesNotMatch(next, /--font2|Open Sans/);
  assert.equal(next.length < css.length, true);

  const added = updateFontVariables(":root {\n  --x: 1;\n}", fonts);

  assert.match(added, /--font1: "Open Sans";\n  --font2: "Inter";/);
  assert.equal(updateFontVariables("body {}", fonts), "body {}");
});

test("new sizes get content copied from the first size of each variant", () => {
  const { syncContentDimensions } = require("../dist/dimensions.js");
  const content = {
    variants: [
      {
        contentId: "a",
        dimensions: [
          {
            width: 300,
            height: 250,
            placeholders: [{ name: "headline", type: "text", value: "Hi" }],
          },
        ],
      },
      { contentId: "empty", dimensions: [] },
    ],
  };
  const sizes = [
    { width: 300, height: 250 },
    { width: 728, height: 90 },
  ];
  const { content: synced, added } = syncContentDimensions(content, sizes);

  assert.equal(added, 1);
  assert.deepEqual(
    synced.variants[0].dimensions.map((d) => `${d.width}x${d.height}`),
    ["300x250", "728x90"],
  );
  assert.equal(synced.variants[0].dimensions[1].placeholders[0].value, "Hi");
  assert.equal(synced.variants[1].dimensions.length, 0);
  assert.equal(content.variants[0].dimensions.length, 1);
  assert.equal(syncContentDimensions(synced, sizes).added, 0);
});

test("renaming the project updates the script.js header", () => {
  const { renameInScript } = require("../dist/project-name.js");
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));

  createGenerator().generate(createMessage({ folder, name: "Old Name" }));

  const script = readGeneratedFile(folder, "script.js");
  const renamed = renameInScript(script, "Old Name", "New Name");

  assert.match(renamed, /^\/\*\*\n \* New Name - 300x250\n/);
  assert.equal(renamed.slice(renamed.indexOf("@Owner")), script.slice(script.indexOf("@Owner")));
  assert.equal(renameInScript(script, "Other Name", "New Name"), script);
  assert.equal(renameInScript("const a = 1;", "Old Name", "New Name"), "const a = 1;");
});

test("generate accepts positive whole frame counts", () => {
  const { folder } = createProject({ frames: 1 });

  const script = readGeneratedFile(folder, "script.js");

  assert.match(script, /const frame1Timeline = gsap\.timeline\(\);/);
  assert.doesNotMatch(script, /const frame2Timeline = gsap\.timeline\(\);/);
});

test("generate rejects invalid frame counts", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const generator = createGenerator();

  assert.throws(
    () => generator.generate(createMessage({ folder, frames: 0 })),
    /Number of frames must be a whole number greater than 0\./,
  );
});

test("generate autofills text and image placeholders", () => {
  const { folder } = createProject({
    autoFillPlaceholderContent: true,
    placeholderVariants: [
      {
        dimensions: [
          {
            placeholders: [
              { name: "headline", type: "text", value: "Welcome" },
              { name: "product-image", type: "image", value: "hero.jpg" },
            ],
          },
        ],
      },
    ],
  });

  const script = readGeneratedFile(folder, "script.js");

  assert.match(
    script,
    /\$\("\.headline"\)\.html\(content\?\.headline\?\.value\);/,
  );
  assert.match(
    script,
    /\$\("\.product-image"\)\.attr\("src", content\?\.\["product-image"\]\?\.value\);/,
  );
  assert.match(
    script,
    /\.attr\("src"[^\n]*\n\s*Creative\.addWait\(\$\("\.product-image"\)\);/,
  );
});

test("generate registers several images with one Creative.addWait call", () => {
  const { folder } = createProject({
    autoFillPlaceholderContent: true,
    placeholderVariants: [
      {
        dimensions: [
          {
            placeholders: [
              { name: "logo", type: "image", value: "a.jpg" },
              { name: "trail", type: "image", value: "b.jpg" },
            ],
          },
        ],
      },
    ],
  });

  const script = readGeneratedFile(folder, "script.js");

  assert.match(script, /Creative\.addWait\(\$\("\.logo"\), \$\("\.trail"\)\);/);
  assert.equal(script.match(/Creative\.addWait\(/g).length, 1);
});

test("generate omits placeholder autofill when disabled", () => {
  const { folder } = createProject({
    autoFillPlaceholderContent: false,
    placeholderVariants: [
      {
        dimensions: [
          {
            placeholders: [
              { name: "headline", type: "text", value: "Welcome" },
            ],
          },
        ],
      },
    ],
  });

  const script = readGeneratedFile(folder, "script.js");

  assert.doesNotMatch(script, /\.html\(content\?\.headline\?\.value\);/);
});

test("generate maps collection products and limits unique items", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const generator = createGenerator();

  generator.generate(
    createMessage({
      folder,
      collectionMapping: {
        collection: "products",
        intent: "product",
        required: "2",
        fields: [
          {
            placeholder: "title",
            placeholderType: "text",
            productField: "name",
          },
          {
            placeholder: "image",
            placeholderType: "image",
            productField: "image",
          },
        ],
      },
      products: {
        "selector-1": {
          products: {
            items: [
              { id: "a", fields: { name: "First", image: "first.jpg" } },
              {
                id: "a",
                fields: { name: "Duplicate", image: "duplicate.jpg" },
              },
              { id: "b", fields: { name: "Second", image: "second.jpg" } },
              { id: "c", fields: { name: "Third", image: "third.jpg" } },
            ],
          },
        },
      },
      placeholderVariants: [
        {
          dimensions: [
            {
              placeholders: [
                {
                  name: "product-selector_ID",
                  type: "text",
                  value: "selector-1",
                },
              ],
            },
          ],
        },
      ],
    }),
  );

  const content = JSON.parse(
    fs.readFileSync(path.join(folder, "settings", "content.json"), "utf8"),
  );
  const products = content.variants[0].dimensions[0].placeholders.find(
    (placeholder) => placeholder.name === "products",
  ).value;

  assert.deepEqual(
    products.map(({ title, image }) => ({
      title: title.value,
      image: image.value,
    })),
    [
      { title: "First", image: "first.jpg" },
      { title: "Second", image: "second.jpg" },
    ],
  );
});

test("generate leaves the collection empty when a selector has no products", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const generator = createGenerator();

  const variant = (selectorId) => ({
    dimensions: [
      {
        placeholders: [
          { name: "product-selector_ID", type: "text", value: selectorId },
        ],
      },
    ],
  });

  generator.generate(
    createMessage({
      folder,
      collectionMapping: {
        collection: "products",
        intent: "product",
        required: "1",
        fields: [
          {
            placeholder: "title",
            placeholderType: "text",
            productField: "name",
          },
        ],
      },
      products: {
        "known-selector": {
          products: { items: [{ id: "a", fields: { name: "First" } }] },
        },
      },
      placeholderVariants: [variant("known-selector"), variant("missing")],
    }),
  );

  const content = JSON.parse(
    fs.readFileSync(path.join(folder, "settings", "content.json"), "utf8"),
  );
  const collectionOf = (index) =>
    content.variants[index].dimensions[0].placeholders.find(
      (placeholder) => placeholder.name === "products",
    ).value;

  assert.equal(collectionOf(0).length, 1);
  assert.deepEqual(collectionOf(1), []);
});

test("generate writes settings metadata for the project and selections", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const generator = createGenerator();

  generator.generate(
    createMessage({
      folder,
      name: "Quarterly Campaign",
      userName: "Jesse",
      dimensionType: "responsive",
      selectedDimensions: ["300x250", "728x90"],
      selectedFonts: [
        {
          family: "Open Sans",
          variant: "700",
          fontUrl: "https://fonts.example/open-sans",
        },
      ],
      coFonts: [{ family: "Inter" }],
      selectedAgency: { id: 4, name: "Agency Inc" },
      selectedAdvertiser: { id: 5, name: "Advertiser Corp" },
      selectedAdset: { id: 6, name: "Spring Launch" },
    }),
  );

  const settings = JSON.parse(
    fs.readFileSync(path.join(folder, "settings", "settings.json"), "utf8"),
  );

  assert.deepEqual(settings, {
    projectName: "Quarterly Campaign",
    createdBy: "Jesse",
    adsetType: "responsive",
    dimensions: [
      { width: 300, height: 250 },
      { width: 728, height: 90 },
    ],
    fonts: [{ family: "Inter" }],
    selectedFonts: [
      {
        family: "Open Sans",
        variant: "700",
        fontUrl: "https://fonts.example/open-sans",
      },
    ],
    placeholders: {},
    autoScaleFonts: false,
    browserCheck: false,
    splitText: false,
    agency: { id: 4, name: "Agency Inc" },
    advertiser: { id: 5, name: "Advertiser Corp" },
    adset: { id: 6, name: "Spring Launch" },
  });
});

test("generate embeds generator metadata and selected font resources", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const generator = createGenerator();

  generator.generate(
    createMessage({
      folder,
      selectedFonts: [
        {
          family: "Open Sans",
          variant: "700",
          fontUrl: "https://fonts.example/open-sans",
        },
      ],
    }),
  );

  const index = fs.readFileSync(path.join(folder, "src", "index.html"), "utf8");
  const styles = fs.readFileSync(
    path.join(folder, "src", "styles.css"),
    "utf8",
  );

  assert.match(index, /CO Template Builder v0\.0\.3/);
  assert.match(
    index,
    /<link rel="stylesheet" type="text\/css" media="all" href="https:\/\/fonts\.example\/open-sans\?v=700">/,
  );
  assert.match(styles, /--font1: "Open Sans";/);
});

test("generate adds a click interaction when a click placeholder is present", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const generator = createGenerator();

  generator.generate(
    createMessage({
      folder,
      placeholderVariants: [
        {
          dimensions: [
            {
              placeholders: [
                {
                  name: "clickUrl",
                  type: "click",
                  value: "https://example.com",
                },
              ],
            },
          ],
        },
      ],
    }),
  );

  const script = fs.readFileSync(path.join(folder, "src", "script.js"), "utf8");

  assert.match(
    script,
    /\.on\("click tap", function \(\) \{\s*Creative\.click\("clickUrl"\);/s,
  );
});

test("generate picks the click placeholder name per size when names differ", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const generator = createGenerator();
  const dimension = (width, height, name) => ({
    width,
    height,
    placeholders: [{ name, type: "click", value: "https://example.com" }],
  });

  generator.generate(
    createMessage({
      folder,
      placeholderVariants: [
        {
          dimensions: [
            dimension(300, 250, "url"),
            dimension(728, 90, "clickUrl"),
          ],
        },
      ],
    }),
  );

  const script = fs.readFileSync(path.join(folder, "src", "script.js"), "utf8");

  assert.match(script, /"300x250":"url"/);
  assert.match(script, /"728x90":"clickUrl"/);
  assert.match(script, /Creative\.width \+ "x" \+ Creative\.height/);
});

test("generate omits interaction code when no click placeholder exists", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "co-template-builder-"));
  const generator = createGenerator();

  generator.generate(createMessage({ folder }));

  const script = fs.readFileSync(path.join(folder, "src", "script.js"), "utf8");

  assert.doesNotMatch(script, /\.on\("click tap", function \(\) \{/);
  assert.doesNotMatch(script, /Creative\.click\(/);
});
