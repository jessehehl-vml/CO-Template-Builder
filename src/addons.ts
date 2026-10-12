// Latest GSAP on cdnjs, used when SplitText is added.
export const GSAP_LATEST = "3.15.0";

export type AddOns = {
  autoScaleFonts: boolean;
  browserCheck: boolean;
  splitText: boolean;
};

export type ProjectFiles = {
  creative: string;
  script: string;
  index: string;
};

export const AUTO_SCALE_FONT_CODE = `autoScaleFont: function (minSize = 8, selector = "[data-font_autoscale]") {
    const elements = $(selector).toArray();

    return Promise.all(
      elements.map((element) => {
        return new Promise((resolve) => {
          const styles = window.getComputedStyle(element);

          let fontSize = parseFloat(styles.fontSize);
          const maxHeight = parseFloat(styles.maxHeight);
          const maxWidth = element.clientWidth;

          if (
            !Number.isFinite(fontSize) ||
            !Number.isFinite(maxHeight) ||
            !maxWidth
          ) {
            resolve();
            return;
          }

          const fits = () =>
            element.scrollHeight <= maxHeight && element.scrollWidth <= maxWidth;

          const reduceFontSize = () => {
            if (fits() || fontSize <= minSize) {
              resolve();
              return;
            }

            fontSize -= 0.5;
            element.style.fontSize = \`\${fontSize}px\`;

            requestAnimationFrame(reduceFontSize);
          };

          requestAnimationFrame(reduceFontSize);
        });
      }),
    );
  },`;

// Regexes avoid "//" so the code check does not read them as comments.
export const BROWSER_CHECK_CODE = `check: (() => {
    const { userAgent, maxTouchPoints } = navigator;

    const check = {
      retina: () => window.devicePixelRatio >= 2,

      // iPadOS reports itself as a Mac, so touch support tells them apart.
      ios: () =>
        /iPhone|iPad|iPod/i.test(userAgent) ||
        (/Macintosh/i.test(userAgent) && maxTouchPoints > 1),

      android: () => /Android/i.test(userAgent),

      mobile: () =>
        check.ios() || /Android|Mobi|webOS|BlackBerry|Opera Mini/i.test(userAgent),

      desktop: () => !check.mobile(),

      osx: () => /Macintosh|Mac OS X/i.test(userAgent) && !check.ios(),

      windows: () => /Windows/i.test(userAgent),

      ie: () => /MSIE|Trident/i.test(userAgent),

      // Covers legacy Edge and Chromium Edge (Edge, Edg, EdgA, EdgiOS).
      edge: () => /Edg/i.test(userAgent),

      chrome: () =>
        /Chrome|CriOS/i.test(userAgent) && !/Edg|OPR/i.test(userAgent),

      firefox: () => /Firefox|FxiOS/i.test(userAgent),

      safari: () =>
        /Safari/i.test(userAgent) &&
        !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/i.test(userAgent),
    };

    return check;
  })(),`;

const AUTO_SCALE_PROPERTY = /^[ \t]*autoScaleFont\s*:\s*function\b/m;
const BROWSER_CHECK_PROPERTY = /^[ \t]*check\s*:\s*\(\(\)\s*=>/m;
const SPLIT_TEXT_TAG = /<script\b[^>]*SplitText[^>]*>\s*<\/script>/i;
const GSAP_CORE_TAG =
  /<script\b[^>]*\bsrc\s*=\s*["']([^"']*[/]gsap(?:\.min)?\.js[^"']*)["'][^>]*>\s*<\/script>/i;
const AUTO_SCALE_CALL =
  /^[ \t]*await\s+Creative\.autoScaleFont\(\)\s*;?[ \t]*\n/m;

export function detectAddOns(files: Partial<ProjectFiles>): Partial<AddOns> {
  const detected: Partial<AddOns> = {};

  if (files.creative !== undefined) {
    detected.autoScaleFonts = AUTO_SCALE_PROPERTY.test(files.creative);
    detected.browserCheck = BROWSER_CHECK_PROPERTY.test(files.creative);
  }

  if (files.index !== undefined) {
    detected.splitText = SPLIT_TEXT_TAG.test(files.index);
  }

  return detected;
}

// Removes an object property whose value is a braced block, plus its tail.
function removeProperty(
  source: string,
  start: RegExp,
  tail: RegExp,
): string | null {
  const match = start.exec(source);

  if (!match) {
    return null;
  }

  const open = source.indexOf("{", match.index);
  let depth = 0;
  let end = -1;

  for (let i = open; open !== -1 && i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
    } else if (source[i] === "}" && --depth === 0) {
      end = i + 1;
      break;
    }
  }

  const rest = end === -1 ? null : source.slice(end);
  const tailMatch = rest === null ? null : tail.exec(rest);

  if (rest === null || !tailMatch) {
    return null;
  }

  return source.slice(0, match.index) + rest.slice(tailMatch[0].length);
}

function addToCreative(creative: string, code: string): string | null {
  const opening = /window\.Creative\s*=\s*\{[ \t]*\n/.exec(creative);

  if (!opening) {
    return null;
  }

  const at = opening.index + opening[0].length;

  return `${creative.slice(0, at)}  ${code}\n${creative.slice(at)}`;
}

export type AddOnResult = {
  files: ProjectFiles;
  changes: string[];
  warnings: string[];
};

// Brings the project files in line with the wanted add-ons.
export function applyAddOns(files: ProjectFiles, wanted: AddOns): AddOnResult {
  let { creative, script, index } = files;
  const changes: string[] = [];
  const warnings: string[] = [];
  const present = detectAddOns(files) as AddOns;

  const creativeProblem = (name: string, verb: string) =>
    warnings.push(
      `${name} was not ${verb}: Creative.js has no recognizable ${name} code. ${verb === "added" ? "Check that window.Creative is defined." : "Remove it by hand."}`,
    );

  if (wanted.autoScaleFonts !== present.autoScaleFonts) {
    if (wanted.autoScaleFonts) {
      const next = addToCreative(creative, AUTO_SCALE_FONT_CODE);

      if (next === null) {
        creativeProblem("Auto-scale fonts", "added");
      } else {
        creative = next;
        changes.push("Added Auto-scale fonts");

        if (/\bawait\s+Creative\.awaitAll\(\)/.test(script)) {
          script = script.replace(
            /(\bawait\s+Creative\.awaitAll\(\)\s*;?)/,
            "$1\n  await Creative.autoScaleFont();",
          );
        } else {
          warnings.push(
            "Add `await Creative.autoScaleFont();` to initCreative in script.js, after Creative.awaitAll().",
          );
        }
      }
    } else {
      const next = removeProperty(
        creative,
        AUTO_SCALE_PROPERTY,
        /^,?[ \t]*\n?/,
      );

      if (next === null) {
        creativeProblem("Auto-scale fonts", "removed");
      } else {
        creative = next;
        script = script.replace(AUTO_SCALE_CALL, "");
        changes.push("Removed Auto-scale fonts");
      }
    }
  }

  if (wanted.browserCheck !== present.browserCheck) {
    if (wanted.browserCheck) {
      const next = addToCreative(creative, BROWSER_CHECK_CODE);

      if (next === null) {
        creativeProblem("Browser check", "added");
      } else {
        creative = next;
        changes.push("Added Browser check");
      }
    } else {
      const next = removeProperty(
        creative,
        BROWSER_CHECK_PROPERTY,
        /^\)\(\)[ \t]*,?[ \t]*\n?/,
      );

      if (next === null) {
        creativeProblem("Browser check", "removed");
      } else {
        creative = next;
        changes.push("Removed Browser check");
      }
    }
  }

  if (wanted.splitText !== present.splitText) {
    if (wanted.splitText) {
      const core = GSAP_CORE_TAG.exec(index);

      if (!core) {
        warnings.push(
          "SplitText was not added: index.html has no GSAP script tag to add it after.",
        );
      } else {
        const onCdnjs = /cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\//.test(
          core[1],
        );
        // SplitText must match the GSAP core version, so both use the latest.
        const coreTag = onCdnjs
          ? core[0].replace(/gsap\/\d+\.\d+\.\d+\//, `gsap/${GSAP_LATEST}/`)
          : core[0];
        const indent = /([ \t]*)$/.exec(index.slice(0, core.index))?.[1] ?? "";
        const splitTag = `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/${GSAP_LATEST}/SplitText.min.js"></script>`;

        index =
          index.slice(0, core.index) +
          `${coreTag}\n${indent}${splitTag}` +
          index.slice(core.index + core[0].length);
        changes.push("Added SplitText");

        if (!onCdnjs) {
          warnings.push(
            `GSAP is not loaded from cdnjs, so check that it is version ${GSAP_LATEST} like SplitText.`,
          );
        }
      }
    } else {
      index = index.replace(
        /^[ \t]*<script\b[^>]*SplitText[^>]*>\s*<\/script>[ \t]*\n/im,
        "",
      );

      if (SPLIT_TEXT_TAG.test(index)) {
        index = index.replace(SPLIT_TEXT_TAG, "");
      }

      changes.push("Removed SplitText");
    }
  }

  return { files: { creative, script, index }, changes, warnings };
}
