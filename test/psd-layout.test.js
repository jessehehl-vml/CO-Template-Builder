const assert = require("node:assert/strict");
const test = require("node:test");
const { writePsdBuffer } = require("ag-psd");

const { preparePsdCreative, finishPsdCreative, parseListValue, svgInkColor } = require("../dist/psd-codegen.js");
const { NO_FEED_IMAGE } = require("../dist/psd-mapping.js");

function layer(name, left, top, width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { name, left, top, right: left + width, bottom: top + height, imageData: { width, height, data } };
}

function buildPsd() {
  return Buffer.from(
    writePsdBuffer({
      width: 300,
      height: 250,
      children: [
        layer("Background", 0, 0, 300, 250, () => [0, 88, 224, 255]),
        layer("Pattern", 10, 20, 40, 30, (x) => [x * 6, 0, 0, 255]),
        layer("Photo", 0, 100, 300, 50, (x, y) => [x % 255, y * 5, 100, 255]),
      ],
    }),
  );
}

test("PSD layers become CSS boxes, exported artwork and feed images without AI", () => {
  const { draft, review } = preparePsdCreative(buildPsd(), [], false);
  const layers = review.frames[0].layers;
  assert.deepEqual(
    layers.map(({ kind, name }) => `${kind}:${name}`),
    ["image:Pattern", "image:Photo"],
  );

  const creative = finishPsdCreative(draft, [
    { key: layers[0].key, field: null },
    { key: layers[1].key, field: "hero_image" },
  ]);

  assert.match(creative.html, /<div class="frame1" data-frames="1"><div class="background"><\/div>/);
  assert.match(creative.css, /\.frame1 \.background \{position: absolute;left: 0px;top: 0px;width: 100%;height: 100%;background-color: rgb\(0, 88, 224\)/);
  assert.match(creative.html, /<img class="pattern" src="assets\/psd\/[0-9a-f]{12}\.png" alt="">/);
  assert.match(creative.css, /\.frame1 \.pattern \{position: absolute;left: 10px;top: 20px;width: 40px;height: 30px/);
  assert.match(creative.html, /<div class="hero_img hero_image" role="img"/);
  assert.equal(creative.assets.length, 1);
  assert.equal(creative.assets[0].data.subarray(1, 4).toString(), "PNG");
  assert.deepEqual(creative.imagePlaceholders, ["hero_image"]);
});

test("text layers can be centred in their folder", () => {
  const button = {
    name: "Button",
    children: [
      layer("Pill", 90, 180, 120, 40, (x) => [x % 2 ? 20 : 200, 0, 0, 255]),
      {
        ...layer("Label", 130, 192, 40, 16, () => [255, 255, 255, 255]),
        text: { text: "Go", style: { fontSize: 12 } },
      },
    ],
  };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [button] }));
  const { draft, review } = preparePsdCreative(buffer, [], false);
  const label = review.frames[0].layers.find(({ kind }) => kind === "text");
  assert.deepEqual(label.parent, { name: "Button", box: { left: 90, top: 180, width: 120, height: 40 }, key: "300x250|1|f0" });

  const plain = finishPsdCreative(draft, [{ key: label.key, field: null }]);
  assert.match(plain.html, /<div class="frame1" data-frames="1"><div class="Button"><div class="pill"><div class="label">Go<\/div><\/div><\/div><\/div>/);
  assert.match(plain.css, /\.frame1 \.Button \{position: absolute;left: 90px;top: 180px;width: 120px;height: 40px;display: flex;align-items: center\}/);
  assert.match(plain.css, /\.frame1 \.pill \{position: relative;flex-shrink: 0;width: 100%;height: 100%;background-color: rgb\([^)]*\);display: flex;justify-content: center;align-items: center\}/);
  assert.match(plain.css, /\.frame1 \.label \{position: relative;flex-shrink: 0;max-width: 44px;/);
  const centred = finishPsdCreative(draft, [{ key: label.key, field: null, centerInParent: true }]);
  assert.match(
    centred.css,
    /\.frame1 \.Button \{position: absolute;left: 90px;top: 180px;width: 120px;height: 40px;display: flex;flex-direction: column;justify-content: center;box-sizing: border-box;padding: 0 36px 0 40px\}/,
  );
  assert.match(centred.css, /\.frame1 \.label \{position: relative;white-space: nowrap;font-family: sans-serif;/);
  assert.doesNotMatch(centred.css, /\.label \{[^}]*(left|top|width|padding|display)/);
});

test("layers without fill or stroke only size their folder", () => {
  const panel = {
    name: "textContainer",
    children: [
      layer("bg", 0, 150, 300, 100, () => [0, 0, 0, 0]),
      {
        ...layer("Headline", 20, 180, 100, 20, () => [255, 255, 255, 255]),
        text: { text: "Hello", style: { fontSize: 16 } },
      },
    ],
  };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [panel] }));
  const { draft, review } = preparePsdCreative(buffer, [], false);
  assert.deepEqual(review.frames[0].layers.map(({ kind }) => kind), ["text"]);

  const creative = finishPsdCreative(draft, []);
  assert.match(creative.html, /<div class="textContainer"><div class="headline">Hello<\/div><\/div>/);
  assert.match(creative.css, /\.textContainer \{position: absolute;left: 0px;top: 150px;width: 100%;height: 100px;display: flex;align-items: flex-start\}/);
  assert.match(creative.css, /\.headline \{position: relative;flex-shrink: 0;margin-left: 20px;/);
});

test("a folder with a row of buttons is absolute; buttons and labels inside flow", () => {
  const pill = (name, left) => layer(name, left, 200, 60, 30, (x) => [x % 2 ? 250 : 240, 250, 250, 255]);
  const label = (name, left, text) => ({
    ...layer(name, left + 20, 210, 20, 10, () => [0, 0, 0, 255]),
    text: { text, style: { fontSize: 12 } },
  });
  const pills = {
    name: "pills",
    children: [pill("Pill 1", 10), pill("Pill 2", 80), pill("Pill 3", 150), label("A", 10, "1/5"), label("B", 80, "60+"), label("C", 150, "6/49")],
  };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [pills] }));
  const { draft } = preparePsdCreative(buffer, [], false);
  const creative = finishPsdCreative(draft, []);

  assert.match(
    creative.html,
    /<div class="pills"><div class="pill_1"><div class="a">1\/5<\/div><\/div><div class="pill_2"><div class="b">60\+<\/div><\/div><div class="pill_3"><div class="c">6\/49<\/div><\/div><\/div>/,
  );
  assert.match(creative.css, /\.pills \{position: absolute;left: 10px;top: 200px;width: 200px;height: 30px;display: flex;align-items: center;gap: 10px\}/);
  assert.match(
    creative.css,
    /\.pill_2 \{position: relative;flex-shrink: 0;width: 60px;height: 100%;background-color: rgb\([^)]*\);display: flex;justify-content: center;align-items: center\}/,
  );
  assert.match(creative.css, /\.b \{position: relative;flex-shrink: 0;max-width: 22px;/);
});

test("an image clipped to a rectangle becomes one cover element with the rectangle's box", () => {
  const rectangle = layer("Rectangle 1", 0, 0, 300, 150, () => [0, 88, 224, 255]);
  const photo = {
    ...layer("Photo", 0, -50, 300, 300, (x, y) => [x % 255, y % 255, 90, 255]),
    clipping: true,
  };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [rectangle, photo] }));
  const { draft, review } = preparePsdCreative(buffer, [], false);
  const layers = review.frames[0].layers;
  assert.deepEqual(layers.map(({ name, box }) => [name, box]), [
    ["Photo", { left: 0, top: 0, width: 300, height: 150 }],
  ]);

  const artwork = finishPsdCreative(draft, [{ key: layers[0].key, field: null }]);
  assert.match(artwork.html, /<div class="frame1" data-frames="1"><div class="photo"><\/div><\/div>/);
  assert.match(
    artwork.css,
    /\.frame1 \.photo \{position: absolute;left: 0px;top: 0px;width: 100%;height: 150px;background-image: url\("assets\/psd\/[0-9a-f]{12}\.png"\);background-size: cover;/,
  );

  const feed = finishPsdCreative(draft, [{ key: layers[0].key, field: "hero_image" }]);
  assert.match(feed.html, /<div class="frame1" data-frames="1"><div class="hero_img hero_image" role="img" aria-label="hero_image"><\/div><\/div>/);
  assert.match(feed.css, /\.hero_img \{position: absolute;left: 0px;top: 0px;width: 100%;height: 150px;background-size: cover;/);
  assert.deepEqual(feed.imagePlaceholders, ["hero_image"]);
});

test("live Photoshop shapes become CSS; buttons with feed text get padding", () => {
  const unit = (value) => ({ value, units: "Pixels" });
  const pill = (name, left) => ({
    ...layer(name, left, 200, 60, 30, () => [255, 255, 255, 255]),
    vectorFill: { type: "color", color: { r: 255, g: 255, b: 255 } },
    vectorOrigination: {
      keyDescriptorList: [
        {
          keyOriginType: 2,
          keyOriginShapeBoundingBox: { top: unit(200), left: unit(left), bottom: unit(230), right: unit(left + 60) },
          keyOriginRRectRadii: { topLeft: unit(15), topRight: unit(15), bottomRight: unit(15), bottomLeft: unit(15) },
        },
      ],
    },
  });
  const label = (name, left, text) => ({
    ...layer(name, left + 20, 210, 20, 10, () => [0, 0, 0, 255]),
    text: { text, style: { fontSize: 12 } },
  });
  const buttons = {
    name: "buttons",
    children: [
      { name: "button1", children: [pill("Pill 1", 10), label("A", 10, "1/5")] },
      { name: "button2", children: [pill("Pill 2", 80), label("B", 80, "60+")] },
    ],
  };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [buttons] }));
  const { draft, review } = preparePsdCreative(buffer, [], false);
  assert.deepEqual(review.frames[0].layers.map(({ kind }) => kind), ["text", "text", "list"]);
  const feedLabel = review.frames[0].layers[1];
  const creative = finishPsdCreative(draft, [{ key: feedLabel.key, field: "cta_text" }]);

  assert.equal(creative.assets.length, 0);
  assert.match(creative.html, /<div class="button2"><div class="pill_2"><div class="cta_text" data-font_autoscale=""><\/div><\/div><\/div>/);
  assert.match(
    creative.css,
    /\.pill_1 \{position: relative;flex-shrink: 0;width: 100%;height: 100%;background-color: rgb\(255, 255, 255\);border-radius: 15px;display: flex;justify-content: center;align-items: center\}/,
  );
  assert.match(creative.css, /\.button1 \{position: relative;flex-shrink: 0;width: 60px;/);
  assert.match(
    creative.css,
    /\.pill_2 \{position: relative;flex-shrink: 0;min-width: 60px;height: 100%;background-color: rgb\(255, 255, 255\);border-radius: 15px;display: flex;align-items: center;justify-content: center;box-sizing: border-box;padding: 0 20px 0 20px\}/,
  );
  assert.match(creative.css, /\.button2 \{position: relative;flex-shrink: 0;height: 100%;/);
  assert.match(creative.css, /\.cta_text \{position: relative;white-space: nowrap;/);
});

test("a folder of labelled buttons can be filled from a list field", () => {
  const button = (index, left, text) => ({
    name: `button${index}`,
    children: [
      layer(`Pill ${index}`, left, 200, 60, 30, () => [255, 255, 255, 255]),
      { ...layer(`Label ${index}`, left + 20, 210, 20, 10, () => [0, 0, 0, 255]), text: { text, style: { fontSize: 12 } } },
    ],
  });
  const buttons = { name: "buttons", children: [button(1, 10, "1/5"), button(2, 80, "6/49"), button(3, 150, "60+")] };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [buttons] }));
  const fields = [
    { placeholderName: "headline", value: "Hello" },
    { placeholderName: "cta_selection", value: "[1-5] [6-49] [50+]" },
  ];
  const { draft, review } = preparePsdCreative(buffer, [], false, [], fields);
  const rows = review.frames[0].layers;
  assert.deepEqual(rows.map(({ kind, key, text, field }) => [kind, key, text, field]), [
    ["text", "300x250|1|1", "1/5", null],
    ["text", "300x250|1|3", "6/49", null],
    ["text", "300x250|1|5", "60+", null],
    ["list", "300x250|1|f0", "1/5 · 6/49 · 60+", "cta_selection"],
  ]);

  // The list wins over a mapping of one of its labels.
  const creative = finishPsdCreative(draft, [
    ...rows.map(({ key, field }) => ({ key, field })),
    { key: rows[0].key, field: "headline" },
  ]);
  assert.deepEqual(creative.textPlaceholders, []);
  assert.deepEqual(creative.listPlaceholders, ["cta_selection"]);
  assert.match(creative.html, /<div class="buttons cta_selection" data-font_autoscale_group=""><div class="button1"><div class="pill_1"><div class="label_1" data-list-label="">1\/5<\/div>/);
  assert.match(creative.css, /\.pill_1 \{position: relative;flex-shrink: 0;min-width: 60px;height: 100%;[^}]*padding: 0 20px 0 20px\}/);
});

test("list values are read as JSON arrays or [a] [b] [c]", () => {
  assert.deepEqual(parseListValue("[1-5] [6-49] [50+]"), ["1-5", "6-49", "50+"]);
  assert.deepEqual(parseListValue("[Tanken] [Laden] [Beides]"), ["Tanken", "Laden", "Beides"]);
  assert.deepEqual(parseListValue('["Tanken", "Laden"]'), ["Tanken", "Laden"]);
  assert.deepEqual(parseListValue("[1]"), ["1"]);
  assert.deepEqual(parseListValue("no list"), []);
});

test("layers with Photoshop default names are named after their folder and role", () => {
  const button = {
    name: "button1",
    children: [
      layer("Rectangle 20 copy 5", 10, 200, 60, 30, (x) => [x % 2 ? 20 : 200, 0, 0, 255]),
      { ...layer("1/5 ", 30, 210, 20, 10, () => [0, 0, 0, 255]), text: { text: "1/5\n", style: { fontSize: 12 } } },
    ],
  };
  const named = {
    name: "card",
    children: [
      layer("Layer 3", 100, 20, 40, 40, (x) => [x % 2 ? 20 : 200, 0, 0, 255]),
      layer("logo", 150, 20, 40, 40, (x) => [0, x % 2 ? 20 : 200, 0, 255]),
    ],
  };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [named, button] }));
  const { draft } = preparePsdCreative(buffer, [], false);
  const creative = finishPsdCreative(draft, []);

  assert.match(creative.html, /<div class="button1"><div class="button1_bg"><div class="button1_text">1\/5<\/div><\/div><\/div>/);
  assert.match(creative.html, /<div class="card"><img class="card_img" [^>]*><img class="logo" /);
});

test("a folder of centred text in the middle of its parent spans the full width", () => {
  const centred = (name, top, text, fontSize) => ({
    ...layer(name, 110, top, 80, fontSize, () => [255, 255, 255, 255]),
    text: { text, style: { fontSize }, paragraphStyle: { justification: "center" } },
  });
  const folder = { name: "textContainer", children: [centred("headline", 140, "Savings", 24), centred("subline", 172, "Fixed", 18)] };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [folder] }));
  const { draft } = preparePsdCreative(buffer, [], false);
  const creative = finishPsdCreative(draft, []);

  assert.match(
    creative.css,
    /\.textContainer \{position: absolute;left: 0px;top: [\d.]+px;width: 100%;height: [\d.]+px;display: flex;flex-direction: column;align-items: center;gap: [\d.]+px\}/,
  );
  assert.doesNotMatch(creative.css, /margin-top: -/);
});

test("centring is per folder: all its texts are centred together", () => {
  const text = (name, top, copy) => ({ ...layer(name, 40, top, 120, 16, () => [0, 0, 0, 255]), text: { text: copy, style: { fontSize: 16 } } });
  const panel = {
    name: "panel",
    children: [layer("bg", 0, 100, 300, 150, () => [0, 0, 0, 0]), text("headline", 140, "Savings"), text("subline", 170, "Fixed")],
  };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [panel] }));
  const { draft, review } = preparePsdCreative(buffer, [], false);
  const [headline, subline] = review.frames[0].layers;
  assert.equal(headline.parent.key, subline.parent.key);

  const creative = finishPsdCreative(draft, [{ key: headline.key, field: null, centerInParent: true }]);
  assert.match(creative.css, /\.panel \{[^}]*flex-direction: column;justify-content: center;/);
  assert.match(creative.css, /\.headline \{position: relative;/);
  assert.match(creative.css, /\.subline \{position: relative;/);
});

test("centred texts follow the artboard top to bottom, not the layer order", () => {
  const text = (name, top, copy) => ({ ...layer(name, 40, top, 120, 16, () => [0, 0, 0, 255]), text: { text: copy, style: { fontSize: 16 } } });
  const panel = {
    name: "panel",
    children: [layer("bg", 0, 100, 300, 150, () => [0, 0, 0, 0]), text("subline", 170, "Fixed"), text("headline", 140, "Savings")],
  };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [panel] }));
  const { draft, review } = preparePsdCreative(buffer, [], false);
  const creative = finishPsdCreative(draft, [{ key: review.frames[0].layers[0].key, field: null, centerInParent: true }]);
  assert.match(creative.html, /<div class="panel"><div class="headline">Savings<\/div><div class="subline">Fixed<\/div><\/div>/);
});

test("no centring option when a folder holds only its texts", () => {
  const text = (name, top, copy) => ({ ...layer(name, 40, top, 120, 16, () => [0, 0, 0, 255]), text: { text: copy, style: { fontSize: 16 } } });
  const folder = { name: "textContainer", children: [text("headline", 140, "Savings"), text("subline", 170, "Fixed")] };
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [folder] }));
  const { review } = preparePsdCreative(buffer, [], false);
  assert.deepEqual(review.frames[0].layers.map(({ parent }) => parent), [undefined, undefined]);
});

test("single-colour SVG feeds are recoloured to match a white PSD icon", () => {
  const icon = layer("Icon", 100, 40, 40, 40, (x, y) => ((x - 20) ** 2 + (y - 20) ** 2 < 300 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
  const buffer = Buffer.from(writePsdBuffer({ width: 300, height: 250, children: [icon] }));
  const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`);
  const candidates = [
    { placeholderName: "icon_black", mimeType: "image/svg+xml", data: svg('<path d="M0 0h10v10z"/>'), allSvg: true },
    { placeholderName: "icon_white", mimeType: "image/svg+xml", data: svg('<path fill="#fff" d="M0 0h10v10z"/>'), allSvg: true },
    { placeholderName: "icon_multi", mimeType: "image/svg+xml", data: svg('<path fill="red"/><path fill="#00f"/>'), allSvg: true },
    { placeholderName: "icon_mixed", mimeType: "image/svg+xml", data: svg("<path/>"), allSvg: false },
  ];
  const { draft, review } = preparePsdCreative(buffer, [], false, candidates);
  const row = review.frames[0].layers[0];
  assert.deepEqual(row.recolor, { icon_black: "white" });

  const creative = finishPsdCreative(draft, [{ key: row.key, field: "icon_black", recolor: "white" }]);
  assert.match(creative.css, /background-repeat: no-repeat;filter: brightness\(0\) invert\(1\)\}/);
  const plain = finishPsdCreative(draft, [{ key: row.key, field: "icon_black" }]);
  assert.doesNotMatch(plain.css, /brightness/);
});

test("SVG colours are read from fill, stroke and style, black by default", () => {
  assert.deepEqual(svgInkColor("<svg><path d='M0 0'/></svg>"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(svgInkColor('<svg><path fill="#FFF"/><path style="fill:#ffffff"/></svg>'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(svgInkColor('<svg><path stroke="rgb(0, 88, 225)" fill="none"/></svg>'), { r: 0, g: 88, b: 225 });
  assert.equal(svgInkColor('<svg><path fill="#f00"/><path fill="#00f"/></svg>'), undefined);
  assert.equal(svgInkColor('<svg><path fill="url(#gradient)"/><path fill="hsl(0, 0%, 0%)"/></svg>'), undefined);
});

test("PSD image layers can be left out in the review", () => {
  const { draft, review } = preparePsdCreative(buildPsd(), [], false);
  const pattern = review.frames[0].layers.find(({ name }) => name === "Pattern");
  const creative = finishPsdCreative(draft, [{ key: pattern.key, field: NO_FEED_IMAGE }]);

  assert.doesNotMatch(creative.html, /class="pattern"/);
  assert.equal(creative.assets.length, 1);
});
