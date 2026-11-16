const assert = require("node:assert/strict");
const test = require("node:test");

const {
  matchFeedText,
  matchFeedTextByProfile,
  textSimilarity,
} = require("../dist/psd-text-matching.js");
const {
  bindPsdTextFields,
  positionPsdTexts,
  renameCssClasses,
} = require("../dist/psd-output-sanitizer.js");

const textLayer = (key, frame, text, fontSize, fontWeight, name = text) => ({
  key,
  group: `300x250|${frame}`,
  frame,
  text,
  name,
  defaultName: name === text,
  fontSize,
  fontWeight,
});

test("feed text is mapped across languages by frame, role, name and punctuation", () => {
  const layers = [
    textLayer("f1", 1, "Moving your small business forward.", 24, 700),
    textLayer("f2", 2, "Up to 4ct/litre off at your home station. Fuel savings that add up.", 16, 300),
    textLayer("f3a", 3, "Fixed discounts at around 2,400 Aral stations nationwide.", 18, 300, "subheadline_f3"),
    textLayer("f3b", 3, "Savings that add up.", 24, 700, "headline_f3"),
    textLayer("f4a", 4, "What is the size of your fleet?", 24, 700),
    textLayer("f4b", 4, "Aral Komfort Card. Built for small fleets.", 13, 300),
  ];
  const fields = [
    { placeholderName: "tactic", value: "Prospecting" },
    { placeholderName: "f1_headline", value: "Gemeinsam bewegen wir etwas." },
    { placeholderName: "f2_subheadline", value: "Maßgeschneiderte Tankkartenlösungen für Ihr Unternehmen." },
    { placeholderName: "f3_headline_standard", value: "Ganz auf Ihr Unternehmen abgestimmt." },
    { placeholderName: "f3_subheadline_standard", value: "Ersparnis, Kontrolle und Sicherheit bei jedem Liter." },
    { placeholderName: "f4_headline", value: "Die passende Aral Tankkarte für jede Flotte." },
    { placeholderName: "cta_text", value: "Finden Sie Ihre Lösung. Wie groß ist Ihre Flotte?" },
    { placeholderName: "cta_selection", value: "[1-5] [6-49] [50+]" },
  ];
  const matches = Object.fromEntries(
    matchFeedTextByProfile(layers, fields).map(({ key, placeholderName }) => [key, placeholderName]),
  );
  assert.deepEqual(matches, {
    f1: "f1_headline",
    f2: "f2_subheadline",
    f3a: "f3_subheadline_standard",
    f3b: "f3_headline_standard",
    f4a: "cta_text",
    f4b: "f4_headline",
  });
});

test("unrelated feed fields are not mapped", () => {
  const layers = [textLayer("a", 1, "Hello there, friend.", 24, 700)];
  const fields = [
    { placeholderName: "f2_headline", value: "Hallo daar, vriend." },
    { placeholderName: "tactic", value: "Prospecting" },
    { placeholderName: "url", value: "https://example.com/page" },
  ];
  assert.deepEqual(matchFeedTextByProfile(layers, fields), []);
});

test("PSD texts are placed at their layer bounds, size and alignment", () => {
  const { html, css, placed, skipped } = positionPsdTexts(
    '<div class="ad"><h2>Savings that add up.</h2><div class="panel"><h1>Moving your small business forward.</h1></div><div class="opts"><span>1/5</span></div></div>',
    ".ad{position:relative}.panel{position:absolute;left:0;bottom:0;width:300px;height:80px;display:flex}.opts{position:absolute;top:200px;left:14px;display:flex}",
    [
      { text: "Savings that add up.", box: { left: 50, top: 140, width: 200, height: 26 }, fontSize: 24, align: "center" },
      { text: "Moving your small business forward.", box: { left: 12, top: 180, width: 220, height: 50 }, fontSize: 22 },
      { text: "1/5", box: { left: 20, top: 205, width: 30, height: 16 } },
    ],
    300,
    250,
  );

  assert.equal(
    html,
    '<div class="ad"><h2 class="text_1">Savings that add up.</h2><div class="panel"><h1 class="text_2">Moving your small business forward.</h1></div><div class="opts"><span>1/5</span></div></div>',
  );
  assert.match(css, /h2\.text_1 \{ position: absolute; left: 40px; top: 140px; .*width: 220px; max-height: 33\.8px; font-size: 24px; text-align: center; \}/);
  assert.match(css, /h1\.text_2 \{ position: absolute; left: 12px; top: 10px; .*max-width: 242px; max-height: 65px; font-size: 22px; \}/);
  assert.equal(placed.length, 2);
  assert.deepEqual(skipped, ["1/5"]);
});

test("PSD text similarity ignores markup, case, punctuation and line breaks", () => {
  assert.equal(
    textSimilarity("Moving your small\rbusiness forward.", "Moving your small<br>business <b>forward</b>"),
    1,
  );
  assert.ok(textSimilarity("Savings that add up.", "Savings that really add up!") >= 0.8);
  assert.equal(textSimilarity("Aral Fleet Solutions", "Fixed discounts"), 0);
});

test("PSD texts match feed fields by copy, honouring frame hints and one use per frame", () => {
  const matches = matchFeedText(
    [
      { key: "1|0", frame: 1, text: "Moving your small business forward." },
      { key: "1|1", frame: 1, text: "Aral Fleet Solutions" },
      { key: "2|0", frame: 2, text: "Up to 4ct/litre off at your home station." },
      { key: "3|0", frame: 3, text: "Savings that add up." },
      { key: "4|0", frame: 4, text: "Savings that add up." },
    ],
    [
      { placeholderName: "f1_headline", value: "Moving your small business forward." },
      { placeholderName: "f2_subheadline", value: "Up to 4 ct/litre off at your home station!" },
      { placeholderName: "f3_headline_standard", value: "Savings that add up" },
    ],
  );

  assert.deepEqual(
    matches.map(({ key, placeholderName }) => `${key}=${placeholderName}`).sort(),
    [
      "1|0=f1_headline",
      "2|0=f2_subheadline",
      "3|0=f3_headline_standard",
      "4|0=f3_headline_standard",
    ],
  );
});

test("PSD text hints only apply when the copy is not identical", () => {
  const matches = matchFeedText(
    [{ key: "2|0", frame: 2, text: "Up to 4ct/litre off" }],
    [{ placeholderName: "f3_subheadline", value: "Up to 4ct/litre off, today" }],
  );

  assert.deepEqual(matches, []);
});

test("PSD text binding empties the matching element and names it after the feed field", () => {
  const { html, bound, renames } = bindPsdTextFields(
    '<div class="ad"><div class="panel"><h1 class="title">Moving your small business forward.</h1></div><p class="brand">Aral Fleet Solutions</p><p class="sub f2_subheadline">Old copy</p><p class="copy big">Savings that add up.</p></div>',
    [
      { text: "Moving your small business forward.", placeholderName: "f1_headline" },
      { text: "Up to 4ct/litre off", placeholderName: "f2_subheadline" },
      { text: "Savings that add up.", placeholderName: "f3_headline" },
    ],
  );

  assert.deepEqual(bound, ["f1_headline", "f2_subheadline", "f3_headline"]);
  assert.deepEqual(renames, [
    { from: "title", to: "f1_headline" },
    { from: "sub", to: "f2_subheadline" },
  ]);
  assert.equal(
    html,
    '<div class="ad"><div class="panel"><h1 class="f1_headline" data-font_autoscale=""></h1></div><p class="brand">Aral Fleet Solutions</p><p class="f2_subheadline" data-font_autoscale=""></p><p class="copy big f3_headline" data-font_autoscale=""></p></div>',
  );
});

test("PSD CSS follows renamed classes without touching similar names or keyframes", () => {
  const css = renameCssClasses(
    ".title{top:10px}.panel .title, .title_bar{color:red}@keyframes title{from{opacity:0}}",
    [{ from: "title", to: "f1_headline" }],
  );

  assert.equal(
    css,
    ".f1_headline{top:10px}.panel .f1_headline, .title_bar{color:red}@keyframes title{from{opacity:0}}",
  );
});
