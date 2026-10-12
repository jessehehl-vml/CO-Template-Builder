# Banner review rules

The reviewer reads the banner's `src` folder and reports only violations of the
rules below. Edit this file to change what it looks for. A project can add its
own rules in `qa-rules.md` in the workspace root; those are appended to these.

Each rule has an ID, a severity (`error`, `warning` or `info`) and a description.
Reference the rule by its ID in every finding. Thresholds in square brackets are
defaults: change them to match your ad specs.

CLK-001, CLK-002, NET-001, ANI-001, ANI-002, ANI-003, CRE-001, PERF-001, JS-001,
JS-002, JS-003, CSS-003, SEL-001, LIB-001 and DIM-001 are also checked by code
(`src/banner-lint.ts`) for everyone.
The AI review is told what that check already found and covers the rest. If you
change a threshold for PERF-001, change it in `banner-lint.ts` too.

HTML-001 (markup in feed values) is checked only by code, on the values in
`settings/content.json`, so do not report it.

## Rules

### CLK-001 (error) Click-through goes through Creative.click

Clicks must call `Creative.click(placeholderName, query)`. Report `window.open`,
`location.href` / `location.assign`, hard-coded `<a href>` URLs, and inline
`onclick` handlers that navigate.

### CLK-002 (error) Click-out cannot work

If clicking fails, the creative cannot go live, so report these as errors.
Report `Creative.click(...)` called with a variable that is not declared (it
throws a ReferenceError on click), and click handlers that throw because of
undeclared variables or missing objects. The fix is usually to pass the click
placeholder name as a string, for example `Creative.click("clickUrl")`.
Also report `Creative.click(content.x.value)` or any other call that passes a
placeholder's value (the URL) instead of its name: the click event needs the
name, so the click-out fails and the browser shows about:blank.

### NET-001 (error) Unapproved external requests

Only these hosts may be requested: `cdnjs.cloudflare.com`,
`cdn.jsdelivr.net` (both may serve libraries such as jQuery and GSAP),
`creative-libraries.lemonpi.io`, and the font URLs added by the template.
Report any other hard-coded `http(s)://` URL in HTML, CSS or JS, any `fetch`,
`XMLHttpRequest` or `WebSocket` call, and any non-HTTPS URL.

`assets.lemonpi.io` is the asset host of Creative Optimizations and is allowed.
A hard-coded asset from it is only a **warning**, never an error and never
"not permitted". Word it as: a fixed asset is loaded from assets.lemonpi.io; if
it should change per variant, take it from the feed; if it is meant to be fixed,
it can be ignored. Do not report font files at all (for example a
`<link rel="stylesheet">` to `https://assets.lemonpi.io/a/font/...`, or
`.woff`/`.woff2`/`.ttf`/`.otf` URLs).

### CON-001 (warning) Hard-coded content

Copy, image URLs and click URLs that belong to a placeholder must come from the
`content` object passed to `initCreative`. Report text or URLs written directly
into the HTML or JS that look like per-variant content.

### ANI-001 (error) Animation starts before assets are ready

The main timeline must only play after `await Creative.awaitAll()`. An image
whose `src` is set in script must be registered with `Creative.addWait` right
after the `src` is set (an `<img>` without a `src` counts as already loaded, so
registering it earlier does nothing). Report timelines that play earlier, and
images that are not registered or registered too early. `Creative.addWait`
accepts any number of images or jQuery collections, so
`Creative.addWait($(".a"), $(".b"))` is valid when the `addWait` in Creative.js
takes `...elements`; only report it if Creative.js accepts a single argument.
Consecutive `Creative.addWait` calls are reported by the code check as info:
they can be one call with several arguments.

### ANI-003 (error) Timelines do not work in QA mode

QA mode loads one iframe per frame and pauses `mainTimeline` at the label
`frameN-preview`. That needs:

- `const mainTimeline = gsap.timeline({ paused: true })`, played only once from
  `initCreative`.
- One `frameNTimeline` per frame (matching `Creative.frames`), each added to
  `mainTimeline` with `mainTimeline.add(frameNTimeline)`.
- `.addLabel("preview-ready")` in each frame timeline, once the frame is fully
  shown. Exit animations such as a fade-out may come after it; do not report
  those.
- `mainTimeline.addLabel("frameN-preview", frameNStart + frameNTimeline.labels["preview-ready"])`
  with `frameNStart` read from `mainTimeline.duration()` before the add.
- `Creative.js` keeps `setupPreviewControls()` (handles `preview-pause`) and
  `notifyReady()` (sends `creative-ready`).

The code check covers the parts above that can be matched in the source. Also
report, as **warnings** (not errors), animation that does not belong to a frame
timeline and so is not paused by the seek: standalone `gsap.to/from/fromTo`
calls that are not added to a frame timeline (including ones created inside
`onComplete` callbacks), `setTimeout` / `gsap.delayedCall` driven animation, and
code that kills, restarts or re-plays `mainTimeline` after `initCreative` has
started it. Also report frame content that is only visible through a tween
created outside its frame (for example text revealed by a loop or a separate
timeline). Suggest adding the tween to the frame timeline at the time it would
have started.

### ANI-002 (warning) Endless or very long animation

Report `repeat: -1`, `repeat: Infinity`, `setInterval`-driven loops, and a total
animation longer than [30 seconds] when it can be determined from the code.
Looping animations are allowed only if something stops them after 15 seconds,
for example `gsap.delayedCall(15, () => timeline.pause())`; report loops with
no such stop. Animations that start on user interaction are fine.

### CRE-001 (error) Template contract broken

`window.Creative` must stay defined, `Creative.start()` must be called once at
the end of `script.js`, and `initCreative(content)` must exist. Report removed or
renamed parts of this contract, and any second call to `Creative.start()`.

### PERF-001 (warning) Heavy assets

Use the asset inventory. Report any single image, video or font larger than
[200 KB], and a combined weight of all files above [1 MB]. Mention the file and
size.

### PERF-002 (info) Layout-heavy animation

Report animation of `width`, `height`, `top`, `left` or `margin` where
`x`, `y` or `scale` would do the same job.

### CSS-001 (warning) Size-specific rules in the wrong file

Rules that only make sense at one banner size belong in `dimensions/WxH.css`,
not in `styles.css`. Report fixed pixel widths or heights in `styles.css` that
match one size, and `!important` used to win specificity fights.

### CSS-002 (warning) Fonts not provided

Report a `font-family` that is neither a web-safe fallback nor loaded through a
font link in `index.html`, and font stacks without a generic fallback.

### CSS-003 (warning) Centering with a percentage translate

GSAP writes an element's `transform`, so `transform: translate(-50%, -50%)`,
`translateY(-50%)` and `translate: -50%` used for centering can clash with the
animation. Center with `display: flex` on the parent instead.

### CSS-004 (info) position: absolute where flex would do

A judgement call, so do not list every use. Report `position: absolute` only
when a flex layout would clearly be simpler, for example an element placed
absolutely just to center or align it inside its parent, or text blocks stacked
with hand-set `top` values. Layers, overlays, backgrounds and decorative
elements are fine. Group related cases into one finding per file. The template's
own `#content` wrapper is fine.

### CSS-005 (warning) Layout not using flex

Prefer `display: flex` for centering and for laying out children. Report
centering done with `margin: auto` tricks, `line-height` equal to the height,
`top: 50%` / `left: 50%` pairs, `display: table-cell`, or floats, and say how
flex would replace it. Do not report places where layering with absolute
positioning is clearly needed.

### JS-001 (error) Unsafe code

Report `eval`, `new Function` and `document.write`. Do not report `innerHTML` or
`.html()` on content values: the banner inserts markup from the feed on purpose,
and HTML-001 checks that markup in the data.

### JS-002 (warning) Sloppy JavaScript

Report undeclared variables, accidental globals, unused functions, `var` in new
code, and swallowed errors (empty `catch`). An undeclared variable in a click
path is CLK-002 (an error), not JS-002.

### JS-003 (info) Debug leftovers

Report `console.log`, `debugger` and commented-out code blocks. The template's
own `[Creative] initCreative` log is expected and must not be reported.

### INT-001 (warning) Interaction state not respected

Animations that loop or restart must check `userInteracted` / `userInteracting`
so they do not fight the user's hover.

### SEL-001 (warning) Selector matches nothing

Checked by code: a class or id used in `$()`, `querySelector(All)`, `closest`,
`find` or a GSAP target that is not in `index.html` and not created by the
script. GSAP only logs a console warning for these. Do not report it.

### LIB-001 (warning) Library problems

Checked by code: jQuery or GSAP loaded twice, GSAP files in different versions,
and a GSAP plugin (for example `SplitText`) used without being loaded. Do not
report it.

### DIM-001 (warning) Missing dimension stylesheet

Checked by code: a selected size without `dimensions/WxH.css` when the banner
has several sizes, and a dimension file for a size that is not selected. Do not
report it.

### DEAD-001 (info) Dead code

Report code that can be removed: CSS rules whose class or id selectors are not
in the HTML or created by the script, functions that are never called, and
variables that are never read. Group related cases into one finding per file.
Do not report template parts that are meant to be filled in later, such as the
empty `createTheme`, or classes added by feed content.

### DRY-001 (info) Repeated animation code

Report the same tween chain or setup repeated across frames or elements (three
or more times, or a long block twice) that a helper function such as
`animateText` would replace. Name the repeated lines and suggest the helper.
Do not report short one-line tweens that merely look alike.

## Do not report

- `innerHTML` or `.html()` used with content values.
- Template tokens and markers such as `{{PROJECT_NAME}}`, `/* FRAME_TIMELINES */`
  and `/* AUTO_FILL_PLACEHOLDER_CONTENT */`.
- Code inside minified third-party libraries.
- Style preferences that are not covered by a rule above.

## Examples

Bad (CLK-001):

```js
$("#cta").on("click", () => window.open("https://example.com"));
```

Good:

```js
$("#cta").on("click", () => Creative.click("clickUrl"));
```

Bad (ANI-001):

```js
const img = $("<img>").attr("src", content.image.value);
mainTimeline.play();
```

Good:

```js
const img = $("<img>").attr("src", content.image.value);
Creative.addWait(img);
await Creative.awaitAll();
mainTimeline.play();
```
