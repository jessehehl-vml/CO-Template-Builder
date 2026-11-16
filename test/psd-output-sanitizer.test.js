const assert = require("node:assert/strict");
const test = require("node:test");

const {
  scalePsdCss,
  sanitizePsdHtmlFragment,
  scopePsdCss,
} = require("../dist/psd-output-sanitizer.js");

test("PSD HTML sanitization keeps editable markup and removes unsafe content", () => {
  const html = sanitizePsdHtmlFragment(
    '<div class="psd-title" onclick="alert(1)" style="color:red"><script>alert(1)</script><p>Offer</p><img src="assets/psd/layer.png" onerror="alert(1)"><img src="assets/psd/../secret.png"><a href="javascript:alert(1)">Click</a></div>',
  );

  assert.match(html, /class="psd-title"/);
  assert.match(html, /<p>Offer<\/p>/);
  assert.doesNotMatch(
    html,
    /src=|script|onclick|onerror|style=|secret\.png|javascript:/i,
  );
});

test("PSD CSS scopes selectors and leaves keyframe selectors intact", () => {
  const css = scopePsdCss(
    "html, body { margin: 0 } .title:hover, .copy { color: red } @keyframes fade { from { opacity: 0 } to { opacity: 1 } }",
  );

  assert.match(css, /#creative_container \{ margin: 0 \}/);
  assert.match(
    css,
    /#creative_container \.title:hover, #creative_container \.copy/,
  );
  assert.match(css, /from \{ opacity: 0 \}/);
  assert.doesNotMatch(css, /#creative_container from/);

  const frameCss = scopePsdCss(
    ".title { color: blue }",
    '#creative_container .psd-artboard[data-size="300x250"][data-frame="2"]',
  );
  assert.match(
    frameCss,
    /#creative_container \.psd-artboard\[data-size="300x250"\]\[data-frame="2"\] \.title/,
  );
});

test("PSD CSS removes model-authored image URLs and gradients", () => {
  const css = scopePsdCss(
    ".image { background-image: url(https://example.com/a.png); background: linear-gradient(red, blue); color: red }",
  );

  assert.doesNotMatch(css, /url\(|gradient|background-image/i);
  assert.match(css, /color: red/);
});

test("PSD CSS scaling adjusts root size and positioned content", () => {
  const css = scalePsdCss(
    ".ab { width: 360px; height: 300px; } .brand { left: 20px; font-size: 12px; }",
    5 / 6,
  );

  assert.match(css, /width: 300px/);
  assert.match(css, /height: 250px/);
  assert.match(css, /left: 16\.6667px/);
  assert.match(css, /font-size: 10px/);
});

test("PSD CSS rejects global imports and font declarations", () => {
  assert.throws(() => scopePsdCss('@import url("https://example.com/a.css");'));
  assert.throws(() =>
    scopePsdCss(
      "@font-face { font-family: remote; src: url(assets/psd/font.woff2) }",
    ),
  );
});
