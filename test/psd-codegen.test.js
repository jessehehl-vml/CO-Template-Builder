const assert = require("node:assert/strict");
const test = require("node:test");

const {
  mapPsdCodegenArtboards,
  parsePsdCodegenResponse,
} = require("../dist/psd-response-parser.js");
const { mergeFrameLayouts } = require("../dist/psd-frame-merge.js");
const {
  bindPsdTextFields,
  getPsdCanvasScale,
  insertPsdFeedImages,
  removeElementsCoveringImages,
} = require("../dist/psd-output-sanitizer.js");
const {
  cropOccludedEdges,
  imageRoleClass,
  getFrameHint,
  matchFeedImages,
  summarizeRgba,
} = require("../dist/psd-image-matching.js");

function image(width, height, pixel, region) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return summarizeRgba(data, width, height, 255, region);
}

const redGradient = image(40, 20, (x) => [255, x * 6, 0, 255]);
const blueLogo = image(20, 20, (x, y) => [
  0,
  0,
  255,
  (x - 10) ** 2 + (y - 10) ** 2 < 64 ? 255 : 0,
]);
const greenGradient = image(40, 30, (_, y) => [0, 255, y * 8, 255]);
const flat = image(40, 20, () => [0, 87, 224, 255]);

const response = {
  artboards: [
    {
      size: "300x250",
      frame: 1,
      html: '<div class="psd-title">These four {offers}</div>',
      css: '.psd-title::after { content: "}"; }',
    },
  ],
};

test("PSD codegen parses a direct JSON response", () => {
  assert.deepEqual(parsePsdCodegenResponse(JSON.stringify(response)), response);
});

test("PSD codegen extracts JSON after a prose preamble and fence", () => {
  const modelText = `These four artboards are ready. Here is the generated markup:\n\n\`\`\`json\n${JSON.stringify(response)}\n\`\`\``;

  assert.deepEqual(parsePsdCodegenResponse(modelText), response);
});

test("PSD codegen rejects responses without an artboards JSON object", () => {
  assert.throws(
    () => parsePsdCodegenResponse("These four designs need more detail."),
    /did not contain valid PSD HTML\/CSS JSON/,
  );
});

test("PSD codegen matches normalized artboard sizes and frame labels", () => {
  const matched = mapPsdCodegenArtboards(
    [{ size: "300x250", frame: 4 }],
    [{ ...response.artboards[0], size: "300 × 250", frame: "Frame 4" }],
  );

  assert.equal(matched[0].size, "300x250");
  assert.equal(matched[0].frame, 4);
  assert.equal(matched[0].html, response.artboards[0].html);
});

test("PSD codegen uses response order when metadata is inconsistent", () => {
  const items = [
    { ...response.artboards[0], frame: 0 },
    { ...response.artboards[0], frame: 0 },
  ];
  const mapped = mapPsdCodegenArtboards(
    [
      { size: "300x250", frame: 1 },
      { size: "300x250", frame: 2 },
    ],
    items,
  );

  assert.deepEqual(
    mapped.map(({ size, frame }) => ({ size, frame })),
    [
      { size: "300x250", frame: 1 },
      { size: "300x250", frame: 2 },
    ],
  );
  assert.deepEqual(
    mapped.map(({ html }) => html),
    items.map(({ html }) => html),
  );
});

test("PSD codegen leaves genuinely omitted artboards unmapped for retry", () => {
  const mapped = mapPsdCodegenArtboards(
    [
      { size: "300x250", frame: 3 },
      { size: "300x250", frame: 4 },
    ],
    [{ ...response.artboards[0], frame: 3 }],
  );

  assert.equal(mapped[0].frame, 3);
  assert.equal(mapped[1], undefined);
});

test("PSD codegen scales an oversized root canvas to the creative dimensions", () => {
  const fit = getPsdCanvasScale(
    '<div class="ab ab1"><span>Offer</span></div>',
    ".ab { width: 360px; height: 300px; }",
    300,
    250,
  );

  assert.deepEqual(fit, { width: 360, height: 300, scale: 5 / 6 });
});

test("PSD feed images replace model images and are prepended to the artboard root", () => {
  const html = insertPsdFeedImages(
    '<div class="ad"><img class="hero" src="{{hero}}"><h1>Offer</h1></div>',
    [
      {
        className: "hero_img",
        placeholderName: "hero_image_f1-2_URL",
        layerName: "f1img",
      },
    ],
  );

  assert.equal(
    html,
    '<div class="ad"><div class="hero_img hero_image_f1-2_URL" role="img" aria-label="f1img"></div><h1>Offer</h1></div>',
  );
});

test("PSD feed images get a descriptive role class", () => {
  const used = new Set(["logo_img"]);
  assert.equal(imageRoleClass("hero_image_f1-2_URL", used), "hero_img");
  assert.equal(imageRoleClass("f4_product_image_URL", used), "product_img");
  assert.equal(imageRoleClass("logo_aral", used), "logo_img_2");
  assert.equal(imageRoleClass("f3_url", used), "feed_img");
});

test("PSD feed field names restrict which frames they can match", () => {
  assert.deepEqual(getFrameHint("hero_image_f1-2_URL"), [1, 2]);
  assert.deepEqual(getFrameHint("f4_product_image_URL"), [4]);
  assert.deepEqual(getFrameHint("frame_3_icon"), [3]);
  assert.deepEqual(getFrameHint("bg-fr2to3"), [2, 3]);
  assert.equal(getFrameHint("logo_aral"), undefined);
  assert.equal(getFrameHint("free_2_image"), undefined);
});

test("PSD feed matching uses names, frame hints, pixels and one use per frame", () => {
  const { matches, scores } = matchFeedImages(
    [
      {
        key: "1|name",
        layerName: "hero_image_f1-2_URL",
        frame: 1,
        summary: flat,
      },
      { key: "1|flat", layerName: "Rectangle 19", frame: 1, summary: flat },
      { key: "1|logo", layerName: "Aral_Logo", frame: 1, summary: blueLogo },
      {
        key: "1|logo-copy",
        layerName: "Aral_Logo copy",
        frame: 1,
        summary: blueLogo,
      },
      { key: "2|photo", layerName: "f1img", frame: 2, summary: redGradient },
      { key: "4|photo", layerName: "f1img", frame: 4, summary: redGradient },
      { key: "4|card", layerName: "Card", frame: 4, summary: greenGradient },
    ],
    [
      { placeholderName: "hero_image_f1-2_URL", summary: redGradient },
      { placeholderName: "logo_aral", summary: blueLogo },
      { placeholderName: "f4_product_image_URL", summary: greenGradient },
    ],
  );

  assert.deepEqual(
    matches
      .map(
        ({ key, placeholderName, method }) =>
          `${key}=${placeholderName}:${method}`,
      )
      .sort(),
    [
      "1|logo=logo_aral:pixels",
      "1|name=hero_image_f1-2_URL:name",
      "2|photo=hero_image_f1-2_URL:pixels",
      "4|card=f4_product_image_URL:pixels",
    ],
  );
  assert.equal(
    scores.find(({ key }) => key === "1|flat").skipped,
    "flat colour",
  );
});

test("PSD layer summaries only use pixels inside the visible region", () => {
  const summary = image(100, 50, (x, y) => [x, y, 0, x >= 50 ? 255 : 0], {
    x: 0,
    y: 10,
    width: 80,
    height: 40,
  });

  assert.deepEqual(summary.trim, { x: 50, y: 10, width: 30, height: 40 });
  assert.equal(summary.opaqueRatio, 1);
});

test("PSD image boxes are trimmed where opaque layers above cover a full band", () => {
  const photo = { left: 0, top: 0, width: 300, height: 250 };
  const panel = { left: 0, top: 175, width: 300, height: 75 };
  const logo = { left: 250, top: 200, width: 36, height: 36 };

  assert.deepEqual(cropOccludedEdges(photo, [panel, logo]), {
    left: 0,
    top: 0,
    width: 300,
    height: 175,
  });
});

test("PSD feed matching reuses same-named layers and pairs SVG feeds by frame and name", () => {
  const { matches } = matchFeedImages(
    [
      {
        key: "1|logo",
        layerName: "Aral_Logo_RGB_negativ",
        frame: 1,
        summary: blueLogo,
      },
      {
        key: "2|logo",
        layerName: "Aral_Logo_RGB_negativ",
        frame: 2,
        summary: greenGradient,
      },
      {
        key: "3|text",
        layerName: "Aral Fleet Solutions",
        frame: 3,
        summary: redGradient,
      },
      {
        key: "3|icon",
        layerName: "ico_finance-accrue.png.img.750.medium",
        frame: 3,
        summary: greenGradient,
      },
    ],
    [
      { placeholderName: "logo_aral", summary: blueLogo },
      { placeholderName: "f3_icon_url" },
    ],
  );

  assert.deepEqual(
    matches
      .map(
        ({ key, placeholderName, method }) =>
          `${key}=${placeholderName}:${method}`,
      )
      .sort(),
    [
      "1|logo=logo_aral:pixels",
      "2|logo=logo_aral:layer-name",
      "3|icon=f3_icon_url:frame-hint",
    ],
  );
});

test("PSD feed images are matched in every size, not once per frame number", () => {
  const { matches } = matchFeedImages(
    [
      { key: "300x250|1|2", layerName: "f1im", frame: 1, summary: redGradient },
      { key: "728x90|1|2", layerName: "f1im", frame: 1, summary: redGradient },
      {
        key: "300x250|3|1",
        layerName: "ico_finance",
        frame: 3,
        summary: greenGradient,
      },
      {
        key: "728x90|3|2",
        layerName: "ico_finance",
        frame: 3,
        summary: greenGradient,
      },
    ],
    [
      { placeholderName: "hero_image_f1-2_URL", summary: redGradient },
      { placeholderName: "f3_icon_url" },
    ],
  );

  assert.deepEqual(
    matches
      .map(({ key, placeholderName }) => `${key}=${placeholderName}`)
      .sort(),
    [
      "300x250|1|2=hero_image_f1-2_URL",
      "300x250|3|1=f3_icon_url",
      "728x90|1|2=hero_image_f1-2_URL",
      "728x90|3|2=f3_icon_url",
    ],
  );
});

test("PSD codegen removes model-drawn stand-ins for feed images", () => {
  const { html, removed } = removeElementsCoveringImages(
    '<div class="ad"><div class="card">ARAL Komfort Card</div><p class="card-txt">Aral Komfort Card. Built for small fleets.</p><div class="logo">ARAL</div><h1>Offer</h1></div>',
    ".card{position:absolute;top:50px;left:20px;width:150px;height:90px}.logo{position:absolute;right:12px;bottom:12px;width:36px;height:36px}",
    [
      {
        box: { left: 250, top: 200, width: 40, height: 40 },
        names: ["Aral_Logo_RGB_negativ", "logo_aral"],
      },
      {
        box: { left: 10, top: 40, width: 120, height: 120 },
        names: ["BP-and-Aral-FC-Card", "f4_product_image_URL"],
      },
    ],
    300,
    250,
  );

  assert.deepEqual(removed, [".card", ".logo"]);
  assert.equal(
    html,
    '<div class="ad"><p class="card-txt">Aral Komfort Card. Built for small fleets.</p><h1>Offer</h1></div>',
  );
});

test("PSD frames share identical leading and trailing elements and keep the rest per frame", () => {
  const css =
    ".ad{position:relative;width:300px;height:250px;background:#05e;color:#fff}.photo{position:absolute;top:0;left:0;width:300px;height:150px}.logo{position:absolute;right:10px;bottom:10px;width:30px;height:30px}";
  const merged = mergeFrameLayouts(
    [
      {
        frame: 1,
        html: '<div class="ad"><div class="photo"></div><h1 class="f1_headline"></h1><div class="logo"></div></div>',
        css,
      },
      {
        frame: 2,
        html: '<div class="ad"><div class="photo"></div><p class="f2_subheadline"></p><div class="logo"></div></div>',
        css,
      },
      {
        frame: 3,
        html: '<div class="ad"><h1 class="f3_headline"></h1><div class="logo"></div></div>',
        css,
      },
    ],
    "#creative_container",
  );

  assert.deepEqual(merged.shared, [
    ".bg (frames 1 2 3)",
    ".photo (frames 1 2)",
    ".logo (frames 1 2 3)",
  ]);
  assert.equal(
    merged.html,
    '<div class="shared_bottom"><div class="bg" data-frames="1 2 3"></div><div class="photo" data-frames="1 2"></div></div>' +
      '<div class="frame1" data-frames="1"><div class="ad"><h1 class="f1_headline"></h1></div></div>' +
      '<div class="frame2" data-frames="2"><div class="ad"><p class="f2_subheadline"></p></div></div>' +
      '<div class="frame3" data-frames="3"><div class="ad"><h1 class="f3_headline"></h1></div></div>' +
      '<div class="shared_top"><div class="logo" data-frames="1 2 3"></div></div>',
  );
  assert.match(
    merged.css,
    /\.shared_bottom \.bg \{position: absolute;[^}]*background: #05e/,
  );
  assert.match(
    merged.css,
    /\.frame1 \.ad\{position:relative;width:300px;height:250px;color:#fff\}/,
  );
});

test("PSD frame elements between frame-specific content stay per frame", () => {
  const merged = mergeFrameLayouts(
    [
      {
        frame: 1,
        html: '<div class="ad"><p class="intro">A</p><p class="brand">Brand</p><p class="x">1</p></div>',
        css: ".brand{top:10px}",
      },
      {
        frame: 2,
        html: '<div class="ad"><p class="intro">B</p><p class="brand">Brand</p><p class="x">2</p></div>',
        css: ".brand{top:10px}",
      },
    ],
    "#creative_container",
  );

  assert.deepEqual(merged.shared, []);
  assert.match(
    merged.html,
    /<div class="frame1" data-frames="1"><div class="ad"><p class="intro">A<\/p><p class="brand">Brand<\/p>/,
  );
});

test("PSD stand-in removal only applies to elements sharing a frame with the image", () => {
  const { removed } = removeElementsCoveringImages(
    '<div class="psd-ad"><div class="psd-panel" data-frames="3">Savings that add up today for everyone</div><div class="psd-photo" data-frames="1 2"></div></div>',
    ".psd-panel{position:absolute;left:0;top:0;width:300px;height:175px}.psd-photo{position:absolute;left:0;top:0;width:300px;height:175px}",
    [
      {
        box: { left: 0, top: 0, width: 300, height: 175 },
        names: ["f1img"],
        frames: [1, 2],
      },
    ],
    300,
    250,
  );

  assert.deepEqual(removed, [".psd-photo"]);
});
