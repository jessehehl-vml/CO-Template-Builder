const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { writePsdBuffer } = require("ag-psd");
const agPsdHelpers = require("ag-psd/dist/helpers.js");
const { PNG } = require("pngjs");
const {
  analyzePsdBuffer,
  createPsdStoryboardPreviews,
  summarizePsd,
  writePsdStoryboardImages,
  writePsdStoryboardImagesFromDocument,
} = require("../dist/psd-analysis.js");
const { detectPsd2x, mapPsdDimensions } = require("../dist/dimensions.js");

test("PSD analysis counts unique artboard dimensions and animation frames", () => {
  const summary = summarizePsd({
    width: 1024,
    height: 768,
    artboards: { count: 3 },
    children: [
      {
        name: "300x250 frame 1",
        artboard: { rect: { left: 0, top: 0, right: 300, bottom: 250 } },
        children: [],
      },
      {
        name: "300x250 frame 2",
        artboard: { rect: { left: 300, top: 0, right: 600, bottom: 250 } },
        children: [],
      },
      {
        name: "728x90 frame 1",
        artboard: { rect: { left: 600, top: 0, right: 1328, bottom: 90 } },
        children: [],
      },
    ],
    imageResources: {
      animations: { frames: [{ id: 1 }, { id: 2 }] },
      layerComps: { list: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    },
  });

  assert.deepEqual(summary, {
    dimensions: ["300x250", "728x90"],
    dimensionCount: 2,
    frameCount: 2,
    fonts: [],
  });
});

test("PSD analysis falls back to canvas dimensions and one frame", () => {
  const summary = summarizePsd({ width: 300, height: 250, children: [] });

  assert.deepEqual(summary, {
    dimensions: ["300x250"],
    dimensionCount: 1,
    frameCount: 1,
    fonts: [],
  });
});

test("PSD analysis uses layer comps when animation frames are absent", () => {
  const summary = summarizePsd({
    width: 300,
    height: 250,
    children: [],
    imageResources: { layerComps: { list: [{ id: 1 }, { id: 2 }, { id: 3 }] } },
  });

  assert.equal(summary.frameCount, 3);
});

test("PSD analysis recognizes dimension and frame group names", () => {
  const summary = summarizePsd({
    width: 1200,
    height: 500,
    children: [
      {
        name: "300x250",
        children: [{ name: "Frame 1" }, { name: "Frame_2" }],
      },
      {
        name: "728x90",
        children: [{ name: "Frame 1" }, { name: "Frame 2" }],
      },
    ],
  });

  assert.deepEqual(summary, {
    dimensions: ["300x250", "728x90"],
    dimensionCount: 2,
    frameCount: 2,
    fonts: [],
  });
});

test("PSD buffer analysis reads document structure without image data", () => {
  const buffer = writePsdBuffer({
    width: 300,
    height: 250,
    children: [{ name: "Background" }],
  });

  assert.deepEqual(analyzePsdBuffer(buffer), {
    dimensions: ["300x250"],
    dimensionCount: 1,
    frameCount: 1,
    fonts: [],
  });
});

test("PSD pixel buffers initialize without a canvas backend", () => {
  const imageData = agPsdHelpers.createImageData(2, 3);

  assert.deepEqual([imageData.width, imageData.height], [2, 3]);
  assert.equal(imageData.data.length, 24);
});

test("PSD analysis lists unique fonts from text styles and style runs", () => {
  const summary = summarizePsd({
    width: 300,
    height: 250,
    children: [
      {
        name: "Headline",
        text: {
          text: "Headline",
          style: { font: { name: "ArialMT" } },
          styleRuns: [
            { length: 5, style: { font: { name: "BrandSans-Bold" } } },
            { length: 3, style: { font: { name: "ArialMT" } } },
          ],
        },
      },
      {
        name: "Group",
        children: [
          {
            name: "Body copy",
            text: {
              text: "Body copy",
              style: { font: { name: "BrandSans-Regular" } },
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(summary.fonts, [
    "ArialMT",
    "BrandSans-Bold",
    "BrandSans-Regular",
  ]);
});

test("PSD artboard previews crop each board and number frames per size", () => {
  const previews = createPsdStoryboardPreviews({
    width: 4,
    height: 1,
    imageData: {
      width: 4,
      height: 1,
      data: Uint8Array.from([
        255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
      ]),
    },
    children: [
      {
        name: "300x250 frame 2",
        artboard: { rect: { left: 0, top: 0, right: 2, bottom: 1 } },
      },
      {
        name: "300x250 frame 1",
        artboard: { rect: { left: 2, top: 0, right: 4, bottom: 1 } },
      },
    ],
  });

  assert.deepEqual(
    previews.map(({ width, height, frame }) => ({ width, height, frame })),
    [
      { width: 2, height: 1, frame: 2 },
      { width: 2, height: 1, frame: 1 },
    ],
  );

  const firstPreview = PNG.sync.read(
    Buffer.from(previews[0].previewDataUrl.split(",")[1], "base64"),
  );
  const secondPreview = PNG.sync.read(
    Buffer.from(previews[1].previewDataUrl.split(",")[1], "base64"),
  );
  assert.deepEqual([...firstPreview.data.slice(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...secondPreview.data.slice(0, 4)], [0, 255, 0, 255]);
});

test("PSD storyboard output writes full artboard PNGs using creative dimensions", () => {
  const psd = {
    width: 2,
    height: 2,
    imageData: {
      width: 2,
      height: 2,
      data: Uint8Array.from([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
      ]),
    },
    children: [
      {
        name: "Storyboard Frame_7",
        artboard: { rect: { left: 0, top: 0, right: 2, bottom: 2 } },
      },
    ],
  };
  const outputFolder = fs.mkdtempSync(
    path.join(os.tmpdir(), "psd-storyboards-"),
  );

  assert.deepEqual(
    writePsdStoryboardImagesFromDocument(psd, outputFolder, true),
    ["1x1-frame7.png"],
  );

  const image = PNG.sync.read(
    fs.readFileSync(path.join(outputFolder, "1x1-frame7.png")),
  );
  assert.deepEqual([image.width, image.height], [2, 2]);
});

test("2x PSD artboard sizes map to supported creative dimensions", () => {
  assert.deepEqual(mapPsdDimensions(["600x500"], true), {
    dimensionType: "single",
    selectedDimensions: ["300x250"],
    customDimensions: [],
  });
});

test("PSD dimensions preselect standard and custom responsive sizes", () => {
  assert.deepEqual(mapPsdDimensions(["600x500", "500x300"], true), {
    dimensionType: "responsive",
    selectedDimensions: ["300x250", "custom-0"],
    customDimensions: [{ width: "250", height: "150" }],
  });
});

test("PSD dimension mapping preserves source sizes unless 2x is selected", () => {
  assert.deepEqual(mapPsdDimensions(["300x250", "600x500"]), {
    dimensionType: "responsive",
    selectedDimensions: ["300x250", "custom-0"],
    customDimensions: [{ width: "600", height: "500" }],
  });
});

test("2x is detected when halved artboard sizes are standard ad sizes", () => {
  assert.equal(detectPsd2x(["600x500", "1456x180"]), true);
  assert.equal(detectPsd2x(["300x250", "728x90"]), false);
  assert.equal(detectPsd2x(["1080x1080"]), false);
  assert.equal(detectPsd2x(["300x250", "600x500", "1456x180"]), true);
});
