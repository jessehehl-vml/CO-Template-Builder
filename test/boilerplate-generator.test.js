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
