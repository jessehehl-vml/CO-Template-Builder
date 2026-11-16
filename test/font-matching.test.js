const assert = require("node:assert/strict");
const test = require("node:test");

const { matchPsdFontsToCatalog } = require("../dist/font-matching.js");

const catalog = [
  {
    "font-family": "Arial",
    "css-base-url": "https://fonts.example/arial",
    variants: [
      { "font-weight": 400, variant: "400" },
      { "font-weight": 700, variant: "700" },
    ],
  },
  {
    "font-family": "Open Sans",
    "css-base-url": "https://fonts.example/open-sans",
    variants: [{ "font-weight": 400, variant: "400" }],
  },
];

test("matches PostScript font names to catalog families", () => {
  const result = matchPsdFontsToCatalog(
    ["Arial-BoldMT", "OpenSans-Regular", "MissingFont"],
    catalog,
  );

  assert.deepEqual(
    result.matches.map((font) => font["font-family"]),
    ["Arial", "Open Sans"],
  );
  assert.deepEqual(result.unmatched, ["MissingFont"]);
});

test("deduplicates repeated PSD font names and catalog families", () => {
  const result = matchPsdFontsToCatalog(
    ["ArialMT", "Arial-BoldMT", "ArialMT"],
    catalog,
  );

  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.unmatched, []);
});
