import { parseFragment, serialize } from "parse5";
import postcss from "postcss";
import { sharesNameToken } from "./psd-image-matching";
import { textSimilarity } from "./psd-text-matching";

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "br",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "ul",
]);

export function sanitizePsdHtmlFragment(source: string): string {
  const fragment = parseFragment(source) as any;

  const sanitizeChildren = (parent: { childNodes: any[] }) => {
    const children: any[] = [];

    for (const node of parent.childNodes ?? []) {
      const tagName = node.tagName?.toLowerCase();
      if (tagName && !ALLOWED_TAGS.has(tagName)) {
        continue;
      }

      if (tagName) {
        node.attrs = (node.attrs ?? []).filter(({ name, value }: any) => {
          const attribute = name.toLowerCase();
          if (
            attribute === "class" ||
            attribute === "alt" ||
            attribute === "role" ||
            attribute.startsWith("aria-") ||
            attribute.startsWith("data-")
          ) {
            return true;
          }

          if (tagName === "img" && attribute === "src") {
            return false;
          }

          return tagName === "a" && attribute === "href" && value === "#";
        });
      }

      if (Array.isArray(node.childNodes)) {
        sanitizeChildren(node);
      }
      children.push(node);
    }

    parent.childNodes = children;
  };

  sanitizeChildren(fragment);
  return serialize(fragment);
}

/** Removes model-authored images and prepends host-placed feed image layers to the artboard root. */
export function insertPsdFeedImages(
  source: string,
  images: {
    className: string;
    placeholderName: string;
    layerName: string;
    frames?: number[];
  }[],
  position: "start" | "end" = "start",
): string {
  const fragment = parseFragment(source) as any;
  const removeImages = (parent: { childNodes?: any[] }) => {
    parent.childNodes = (parent.childNodes ?? []).filter(
      (node: any) => node.tagName !== "img",
    );
    parent.childNodes.forEach(removeImages);
  };
  removeImages(fragment);

  const elements = fragment.childNodes.filter((node: any) => node.tagName);
  const root = elements.length === 1 ? elements[0] : fragment;
  const imageFragment = parseFragment(
    images
      .map(
        ({ className, placeholderName, layerName, frames }) =>
          `<div class="${escapeHtml(className)} ${escapeHtml(placeholderName)}"${frames ? ` data-frames="${frames.join(" ")}"` : ""} role="img" aria-label="${escapeHtml(layerName)}"></div>`,
      )
      .join(""),
  ) as any;
  for (const node of imageFragment.childNodes) {
    node.parentNode = root;
  }
  root.childNodes =
    position === "start"
      ? [...imageFragment.childNodes, ...root.childNodes]
      : [...root.childNodes, ...imageFragment.childNodes];
  return serialize(fragment);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

type Box = { left: number; top: number; width: number; height: number };

type ClassRule = { classes: string[]; declarations: Record<string, string> };

/** Rules whose last selector compound is made of classes only, e.g. ".panel .title" -> ["title"]. */
function parseClassRules(css: string): ClassRule[] {
  const rules: ClassRule[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent?.type === "atrule") {
      return;
    }
    const declarations: Record<string, string> = {};
    rule.walkDecls((declaration) => {
      declarations[declaration.prop.toLowerCase()] = declaration.value.trim();
    });
    for (const selector of rule.selectors) {
      const last =
        selector
          .trim()
          .split(/[\s>+~]+/)
          .pop() ?? "";
      if (/^(?:\.[A-Za-z0-9_-]+)+$/.test(last)) {
        rules.push({
          classes: [...last.matchAll(/\.([A-Za-z0-9_-]+)/g)].map(
            ([, name]) => name,
          ),
          declarations,
        });
      }
    }
  });
  return rules;
}

function styleOf(node: any, rules: ClassRule[]): Record<string, string> {
  const classes = classesOfNode(node);
  const style: Record<string, string> = {};
  for (const rule of rules) {
    if (
      classes.length > 0 &&
      rule.classes.every((name) => classes.includes(name))
    ) {
      Object.assign(style, rule.declarations);
    }
  }
  return style;
}

function classesOfNode(node: any): string[] {
  return String(
    node.attrs?.find(({ name }: any) => name === "class")?.value ?? "",
  )
    .split(/\s+/)
    .filter(Boolean);
}

const MAX_IMAGE_STAND_IN_WORDS = 3;

/**
 * Removes model-drawn stand-ins for feed images, e.g. a CSS logo or a "card" box.
 * Direct children of the artboard root are removed when they overlap an image box,
 * or when their class names the image and they hold little text.
 */
export function removeElementsCoveringImages(
  html: string,
  css: string,
  images: { box: Box; names: string[]; frames?: number[] }[],
  artboardWidth: number,
  artboardHeight: number,
  minOverlap = 0.5,
): { html: string; removed: string[] } {
  const fragment = parseFragment(html) as any;
  const elements = fragment.childNodes.filter((node: any) => node.tagName);
  if (elements.length !== 1 || images.length === 0) {
    return { html, removed: [] };
  }

  const rules = parseClassRules(css);

  const removed: string[] = [];
  const root = elements[0];
  root.childNodes = root.childNodes.filter((node: any) => {
    const classes = classesOfNode(node);
    if (!node.tagName || classes.length === 0) {
      return true;
    }
    const box = getAbsoluteBox(
      styleOf(node, rules),
      artboardWidth,
      artboardHeight,
    );
    const frameText = node.attrs?.find(
      ({ name }: any) => name === "data-frames",
    )?.value;
    const nodeFrames = frameText
      ? new Set(String(frameText).split(/\s+/).map(Number))
      : undefined;
    const sameFrames = images.filter(
      (image) =>
        !nodeFrames ||
        !image.frames ||
        image.frames.some((frame) => nodeFrames.has(frame)),
    );
    const covers =
      box !== undefined &&
      sameFrames.some((image) => overlapRatio(box, image.box) >= minOverlap);
    const namesImage =
      countWords(node) <= MAX_IMAGE_STAND_IN_WORDS &&
      classes.some((name) =>
        sameFrames.some((image) =>
          image.names.some((imageName) => sharesNameToken(name, imageName)),
        ),
      );
    if (covers || namesImage) {
      removed.push(`.${classes.join(".")}`);
    }
    return !covers && !namesImage;
  });

  return { html: removed.length > 0 ? serialize(fragment) : html, removed };
}

function countWords(node: any): number {
  if (node.nodeName === "#text") {
    return String(node.value).split(/\s+/).filter(Boolean).length;
  }
  return (node.childNodes ?? []).reduce(
    (total: number, child: any) => total + countWords(child),
    0,
  );
}

function textContent(node: any): string {
  if (node.nodeName === "#text") {
    return String(node.value);
  }
  return (node.childNodes ?? []).map(textContent).join(" ");
}

/**
 * Turns the model's element for each feed-backed PSD text into an empty placeholder:
 * adds the feed field class and data-font_autoscale, and removes the hard-coded copy.
 * Prefers an element that already carries the field class, otherwise the deepest element
 * whose text best matches the PSD copy. When the element has one class of its own that no
 * other element uses, that class is replaced by the field name; `renames` lists those swaps.
 */
export function bindPsdTextFields(
  html: string,
  bindings: { text: string; placeholderName: string }[],
  minSimilarity = 0.6,
): { html: string; bound: string[]; renames: { from: string; to: string }[] } {
  const fragment = parseFragment(html) as any;
  const elements: { node: any; depth: number }[] = [];
  const collect = (parent: any, depth: number) => {
    for (const node of parent.childNodes ?? []) {
      if (node.tagName) {
        elements.push({ node, depth });
        collect(node, depth + 1);
      }
    }
  };
  collect(fragment, 0);
  const classesOf = (node: any) =>
    String(node.attrs?.find(({ name }: any) => name === "class")?.value ?? "")
      .split(/\s+/)
      .filter(Boolean);

  const used = new Set<any>();
  const bound: string[] = [];
  const renames: { from: string; to: string }[] = [];
  const classUses = (name: string) =>
    elements.filter(({ node }) => classesOf(node).includes(name)).length;
  for (const { text, placeholderName } of bindings) {
    let target = elements.find(
      ({ node }) =>
        !used.has(node) && classesOf(node).includes(placeholderName),
    )?.node;
    if (!target) {
      target = elements
        .filter(({ node }) => !used.has(node))
        .map(({ node, depth }) => ({
          node,
          depth,
          similarity: textSimilarity(textContent(node), text),
        }))
        .filter(({ similarity }) => similarity >= minSimilarity)
        .sort(
          (a, b) => b.similarity - a.similarity || b.depth - a.depth,
        )[0]?.node;
    }
    if (!target) {
      continue;
    }
    used.add(target);
    let classes = classesOf(target);
    const own = classes.filter((name) => name !== placeholderName);
    if (
      own.length === 1 &&
      classUses(own[0]) === 1 &&
      classUses(placeholderName) <= 1
    ) {
      renames.push({ from: own[0], to: placeholderName });
      classes = [placeholderName];
    } else if (!classes.includes(placeholderName)) {
      classes.push(placeholderName);
    }
    target.attrs = [
      ...(target.attrs ?? []).filter(
        ({ name }: any) => name !== "class" && name !== "data-font_autoscale",
      ),
      { name: "class", value: classes.join(" ") },
      { name: "data-font_autoscale", value: "" },
    ];
    target.childNodes = [];
    bound.push(placeholderName);
  }

  return {
    html: bound.length > 0 ? serialize(fragment) : html,
    bound,
    renames,
  };
}

export type PsdTextBox = {
  text: string;
  /** PSD text bounds in final creative pixels. */
  box: Box;
  fontSize?: number;
  align?: "left" | "center" | "right";
};

const POSITIONED = new Set(["absolute", "relative", "fixed", "sticky"]);

/**
 * Places the model's element for each PSD text at the PSD text bounds, size and alignment.
 * The element is matched by its copy. Elements inside a container are only placed when that
 * container is absolutely positioned with a known px box directly in the root.
 */
export function positionPsdTexts(
  html: string,
  css: string,
  texts: PsdTextBox[],
  artboardWidth: number,
  artboardHeight: number,
  minSimilarity = 0.6,
): { html: string; css: string; placed: string[]; skipped: string[] } {
  const fragment = parseFragment(html) as any;
  const tops = fragment.childNodes.filter((node: any) => node.tagName);
  if (tops.length !== 1 || texts.length === 0) {
    return {
      html,
      css: "",
      placed: [],
      skipped: texts.map(({ text }) => text),
    };
  }
  const root = tops[0];
  const rules = parseClassRules(css);
  const elements: { node: any; depth: number }[] = [];
  const collect = (parent: any, depth: number) => {
    for (const node of parent.childNodes ?? []) {
      if (node.tagName) {
        elements.push({ node, depth });
        collect(node, depth + 1);
      }
    }
  };
  collect(root, 1);
  const classCount = (name: string) =>
    elements.filter(({ node }) => classesOfNode(node).includes(name)).length;

  const used = new Set<any>();
  const output: string[] = [];
  const placed: string[] = [];
  const skipped: string[] = [];
  let generated = 0;
  for (const { text, box, fontSize, align } of texts) {
    const target = elements
      .filter(({ node }) => !used.has(node))
      .map(({ node, depth }) => ({
        node,
        depth,
        similarity: textSimilarity(textContent(node), text),
      }))
      .filter(({ similarity }) => similarity >= minSimilarity)
      .sort(
        (a, b) => b.similarity - a.similarity || b.depth - a.depth,
      )[0]?.node;
    if (!target) {
      skipped.push(text);
      continue;
    }

    const positioned: any[] = [];
    for (
      let parent = target.parentNode;
      parent && parent !== root;
      parent = parent.parentNode
    ) {
      if (POSITIONED.has(styleOf(parent, rules).position ?? "")) {
        positioned.push(parent);
      }
    }
    let offset = { left: 0, top: 0 };
    if (positioned.length > 0) {
      const container = getAbsoluteBox(
        styleOf(positioned[0], rules),
        artboardWidth,
        artboardHeight,
      );
      if (
        positioned.length > 1 ||
        styleOf(positioned[0], rules).position !== "absolute" ||
        !container
      ) {
        skipped.push(text);
        continue;
      }
      offset = container;
    }

    used.add(target);
    let className = classesOfNode(target).find(
      (name) => classCount(name) === 1,
    );
    if (!className) {
      do {
        className = `text_${++generated}`;
      } while (classCount(className) > 0);
      target.attrs = [
        ...(target.attrs ?? []).filter(({ name }: any) => name !== "class"),
        {
          name: "class",
          value: [...classesOfNode(target), className].join(" "),
        },
      ];
    }

    const round = (value: number) => Math.round(value * 10) / 10;
    // A little slack, because browser fonts rarely wrap exactly like Photoshop.
    const width = round(box.width * 1.1);
    const left =
      align === "center"
        ? box.left + box.width / 2 - width / 2
        : align === "right"
          ? box.left + box.width - width
          : box.left;
    const declarations = [
      "position: absolute",
      `left: ${round(left - offset.left)}px`,
      `top: ${round(box.top - offset.top)}px`,
      "right: auto",
      "bottom: auto",
      "margin: 0",
      "transform: none",
      align && align !== "left" ? `width: ${width}px` : `max-width: ${width}px`,
      `max-height: ${round(box.height * 1.3)}px`,
      ...(fontSize ? [`font-size: ${fontSize}px`] : []),
      ...(align ? [`text-align: ${align}`] : []),
    ];
    output.push(
      `${target.tagName}.${className} { ${declarations.join("; ")}; }`,
    );
    placed.push(`.${className} \u2190 ${JSON.stringify(text.slice(0, 40))}`);
  }

  return { html: serialize(fragment), css: output.join("\n"), placed, skipped };
}

/** Renames classes in CSS selectors, leaving keyframe selectors alone. */
export function renameCssClasses(
  css: string,
  renames: { from: string; to: string }[],
): string {
  if (renames.length === 0) {
    return css;
  }
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (isInsideKeyframes(rule)) {
      return;
    }
    rule.selector = renames.reduce(
      (selector, { from, to }) =>
        selector.replace(
          new RegExp(
            `\\.${from.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&")}(?![\\w-])`,
            "g",
          ),
          `.${to}`,
        ),
      rule.selector,
    );
  });
  return root.toString();
}

function getAbsoluteBox(
  style: Record<string, string>,
  artboardWidth: number,
  artboardHeight: number,
): Box | undefined {
  if (!["absolute", "fixed"].includes(style.position ?? "")) {
    return undefined;
  }
  const px = (prop: string) => {
    const match = /^(-?\d+(?:\.\d+)?)px$/i.exec(style[prop] ?? "");
    return match ? Number(match[1]) : style[prop] === "0" ? 0 : undefined;
  };
  const left = px("left");
  const right = px("right");
  const top = px("top");
  const bottom = px("bottom");
  const width =
    px("width") ??
    (left !== undefined && right !== undefined
      ? artboardWidth - left - right
      : undefined);
  const height =
    px("height") ??
    (top !== undefined && bottom !== undefined
      ? artboardHeight - top - bottom
      : undefined);
  if (
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  const x =
    left ?? (right !== undefined ? artboardWidth - right - width : undefined);
  const y =
    top ??
    (bottom !== undefined ? artboardHeight - bottom - height : undefined);
  return x === undefined || y === undefined
    ? undefined
    : { left: x, top: y, width, height };
}

/** Intersection over union of two boxes. */
function overlapRatio(a: Box, b: Box): number {
  const width =
    Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height =
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) {
    return 0;
  }
  const intersection = width * height;
  return (
    intersection / (a.width * a.height + b.width * b.height - intersection)
  );
}

export function getPsdCanvasScale(
  html: string,
  css: string,
  targetWidth: number,
  targetHeight: number,
): { width: number; height: number; scale: number } | undefined {
  const fragment = parseFragment(html) as any;
  const rootElement = fragment.childNodes.find((node: any) => node.tagName);
  const rootClasses = String(
    rootElement?.attrs?.find(({ name }: any) => name === "class")?.value ?? "",
  )
    .split(/\s+/)
    .filter(Boolean);
  if (rootClasses.length === 0) {
    return undefined;
  }

  let width = 0;
  let height = 0;
  postcss.parse(css).walkRules((rule) => {
    const matchesRoot = rule.selectors.some((selector) => {
      const compoundSelector = selector
        .trim()
        .split(/[\s>+~]/, 1)[0]
        .split(":", 1)[0];
      const classes = [...compoundSelector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map(
        ([, name]) => name,
      );
      return rootClasses.some((name) => classes.includes(name));
    });
    if (!matchesRoot) {
      return;
    }

    for (const node of rule.nodes ?? []) {
      if (node.type !== "decl") {
        continue;
      }
      const value = /^\s*(\d+(?:\.\d+)?)px\s*$/i.exec(node.value);
      if (!value) {
        continue;
      }
      if (node.prop === "width") {
        width = Math.max(width, Number(value[1]));
      } else if (node.prop === "height") {
        height = Math.max(height, Number(value[1]));
      }
    }
  });

  if (
    (width <= targetWidth && height <= targetHeight) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  return {
    width,
    height,
    scale: Math.min(targetWidth / width, targetHeight / height),
  };
}

export function scalePsdCss(source: string, scale: number): string {
  const root = postcss.parse(source);
  root.walkDecls((declaration) => {
    declaration.value = declaration.value.replace(
      /(-?(?:\d+|\d*\.\d+))px\b/gi,
      (_match, value: string) =>
        `${Number((Number(value) * scale).toFixed(4))}px`,
    );
  });
  return root.toString();
}

export function scopePsdCss(
  source: string,
  scopeRoot = "#creative_container",
  /** Keep background images that point at our own exported PSD artwork. */
  options: { allowPsdAssetUrls?: boolean } = {},
): string {
  const root = postcss.parse(source);

  root.walkAtRules((rule) => {
    if (
      ["import", "namespace", "font-face", "page"].includes(
        rule.name.toLowerCase(),
      )
    ) {
      throw new Error(`Generated CSS contains unsupported @${rule.name}.`);
    }
  });

  root.walkDecls((declaration) => {
    if (
      options.allowPsdAssetUrls &&
      declaration.prop.toLowerCase() === "background-image" &&
      /^url\("assets\/psd\/[0-9a-f]{12}\.png"\)$/.test(declaration.value.trim())
    ) {
      return;
    }
    if (
      declaration.prop.toLowerCase() === "background-image" ||
      /(?:url|gradient|image-set|cross-fade)\s*\(/i.test(declaration.value)
    ) {
      declaration.remove();
    }
  });

  root.walkRules((rule) => {
    if (isInsideKeyframes(rule)) {
      return;
    }

    rule.selectors = [
      ...new Set(
        rule.selectors.map((selector) => {
          const trimmed = selector.trim();
          if (trimmed === ":root" || trimmed === "html" || trimmed === "body") {
            return scopeRoot;
          }
          if (trimmed === "#creative_container") {
            return scopeRoot;
          }
          if (trimmed.startsWith("#creative_container ")) {
            return `${scopeRoot}${trimmed.slice("#creative_container".length)}`;
          }
          return trimmed.startsWith(scopeRoot)
            ? trimmed
            : `${scopeRoot} ${trimmed}`;
        }),
      ),
    ];
  });

  return root.toString();
}

function isInsideKeyframes(rule: postcss.Rule): boolean {
  const parent = rule.parent;
  if (!parent || parent.type === "root") {
    return false;
  }
  if (parent.type === "atrule" && /(?:^|-)keyframes$/i.test(parent.name)) {
    return true;
  }
  return isInsideKeyframes(parent as postcss.Rule);
}
