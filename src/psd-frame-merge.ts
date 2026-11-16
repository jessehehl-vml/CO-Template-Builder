import { parseFragment, serialize, serializeOuter } from "parse5";
import postcss from "postcss";
import { scopePsdCss } from "./psd-output-sanitizer";

export type FrameLayout = { frame: number; html: string; css: string };

type FrameChild = { node: any; signature: string };

type PreparedFrame = {
  frame: number;
  root: any;
  rootSelector: string;
  /** Frame CSS with background moved from the root onto a .bg element. */
  css: string;
  /** Same rules with the root prefix removed, used for shared elements. */
  normalizedRules: { selector: string; body: string }[];
  rootBody: string;
  children: FrameChild[];
};

const POSITION_PROPS = new Set(["position", "top", "left", "right", "bottom", "inset"]);

/**
 * Combines per-frame layouts into frame wrappers plus shared layers.
 * Top-level elements that are identical (markup and CSS) across frames move into a shared
 * layer when that keeps the stacking order: below all frame content if they lead every frame
 * they appear in, above it if they trail it. Everything else stays in its .frameN wrapper.
 */
export function mergeFrameLayouts(
  layouts: FrameLayout[],
  scopeRoot: string,
  /**
   * unwrapRoot: put each frame's content directly in its .frameN wrapper, without the frame root element.
   * allowPsdAssetUrls: keep background images of exported PSD artwork (assets/psd/*.png).
   */
  options: { unwrapRoot?: boolean; allowPsdAssetUrls?: boolean } = {},
): { html: string; css: string; frameSets: number[][]; shared: string[] } {
  const frames = [...layouts]
    .sort((a, b) => a.frame - b.frame)
    .map(prepareFrame);

  const framesBySignature = new Map<string, number[]>();
  for (const frame of frames) {
    for (const signature of new Set(frame.children.map(({ signature }) => signature))) {
      framesBySignature.set(signature, [...(framesBySignature.get(signature) ?? []), frame.frame]);
    }
  }
  const repeated = new Set(
    [...framesBySignature].filter(([, list]) => list.length > 1).map(([signature]) => signature),
  );
  const bottom = stableEdge(frames, repeated, "start");
  const top = stableEdge(
    frames,
    new Set([...repeated].filter((signature) => !bottom.has(signature))),
    "end",
  );

  const html: string[] = [];
  const wrappers = [
    ...frames.map(({ frame }) => `${scopeRoot} > .frame${frame}`),
    `${scopeRoot} > .shared_bottom`,
    `${scopeRoot} > .shared_top`,
  ];
  const css: string[] = [
    `${wrappers.join(", ")} { position: absolute; top: 0; left: 0; width: 100%; height: 100%;${options.unwrapRoot ? " overflow: hidden;" : ""} }`,
  ];
  const frameSets: number[][] = [];
  const shared: string[] = [];

  const sharedLayer = (name: string, signatures: Set<string>) => {
    if (signatures.size === 0) {
      return;
    }
    const origin = frames.find((frame) =>
      frame.children.some(({ signature }) => signatures.has(signature)),
    )!;
    const seen = new Set<string>();
    const parts: string[] = [];
    const rules = new Map<string, string>();
    for (const frame of frames) {
      for (const { node, signature } of frame.children) {
        if (!signatures.has(signature) || seen.has(signature)) {
          continue;
        }
        seen.add(signature);
        const list = framesBySignature.get(signature)!;
        setAttribute(node, "data-frames", list.join(" "));
        frameSets.push(list);
        parts.push(serializeOuter(node));
        shared.push(`${describe(node)} (frames ${list.join(" ")})`);
        for (const rule of relevantRules(frame.normalizedRules, node)) {
          rules.set(rule.selector, rule.body);
        }
      }
    }
    html.push(`<div class="${name}">${parts.join("")}</div>`);
    const rootDeclarations = postcss
      .parse(`x{${origin.rootBody}}`)
      .first as postcss.Rule;
    rootDeclarations.walkDecls((declaration) => {
      if (POSITION_PROPS.has(declaration.prop.toLowerCase())) {
        declaration.remove();
      }
    });
    const layerCss = [
      `#creative_container {${rootDeclarations.nodes.map(String).join(";")}}`,
      ...[...rules].map(([selector, body]) => `${selector} {${body}}`),
    ].join("\n");
    css.push(scopePsdCss(layerCss, `${scopeRoot} .${name}`, { allowPsdAssetUrls: options.allowPsdAssetUrls }));
  };

  sharedLayer("shared_bottom", bottom);
  for (const frame of frames) {
    frame.root.childNodes = frame.root.childNodes.filter(
      (node: any) =>
        !node.tagName ||
        !bottom.has(signatureOf(frame, node)) && !top.has(signatureOf(frame, node)),
    );
    frameSets.push([frame.frame]);
    html.push(
      `<div class="frame${frame.frame}" data-frames="${frame.frame}">${options.unwrapRoot ? serialize(frame.root) : serializeOuter(frame.root)}</div>`,
    );
    const frameCss = options.unwrapRoot
      ? frame.normalizedRules.map(({ selector, body }) => `${selector} {${body}}`).join("\n")
      : frame.css;
    css.push(scopePsdCss(frameCss, `${scopeRoot} .frame${frame.frame}`, { allowPsdAssetUrls: options.allowPsdAssetUrls }));
  }
  sharedLayer("shared_top", top);

  return { html: html.join(""), css: css.join("\n"), frameSets, shared };
}

function signatureOf(frame: PreparedFrame, node: any): string {
  return frame.children.find((child) => child.node === node)?.signature ?? "";
}

/** Signatures that lead (or trail) every frame they appear in, among the given candidates. */
function stableEdge(
  frames: PreparedFrame[],
  candidates: Set<string>,
  edge: "start" | "end",
): Set<string> {
  const result = new Set(candidates);
  let changed = true;
  while (changed) {
    changed = false;
    for (const frame of frames) {
      const ordered = edge === "start" ? frame.children : [...frame.children].reverse();
      let inEdge = true;
      for (const { signature } of ordered) {
        inEdge = inEdge && result.has(signature);
        if (!inEdge && result.has(signature)) {
          result.delete(signature);
          changed = true;
        }
      }
    }
  }
  return result;
}

function prepareFrame(layout: FrameLayout): PreparedFrame {
  const fragment = parseFragment(layout.html) as any;
  const elements = fragment.childNodes.filter((node: any) => node.tagName);
  let root = elements[0];
  if (elements.length !== 1) {
    root = (parseFragment('<div class="frame_root"></div>') as any).childNodes[0];
    root.childNodes = fragment.childNodes;
  }
  if (classesOf(root).length === 0) {
    setAttribute(root, "class", "frame_root");
  }
  for (const child of root.childNodes ?? []) {
    if (child.tagName) {
      child.attrs = (child.attrs ?? []).filter(({ name }: any) => name !== "data-frames");
    }
  }
  const rootClasses = classesOf(root);
  const rootSelector = rootClasses.length > 0 ? `.${rootClasses.join(".")}` : "";
  const isRootCompound = (compound: string) =>
    compound !== "" &&
    [...compound.matchAll(/\.([\w-]+)/g)].every(([, name]) => rootClasses.includes(name)) &&
    /^(?:\.[\w-]+)+$/.test(compound);

  const parsed = postcss.parse(layout.css);
  const background: string[] = [];
  let rootBody = "";
  const normalizedRules: { selector: string; body: string }[] = [];
  parsed.walkRules((rule) => {
    if (rule.parent?.type === "atrule") {
      return;
    }
    if (rule.selectors.every((selector) => isRootCompound(selector.trim()))) {
      rule.walkDecls((declaration) => {
        if (/^background/i.test(declaration.prop)) {
          background.push(`${declaration.prop}: ${declaration.value}`);
          declaration.remove();
        }
      });
      rootBody += rule.nodes.map(String).join(";");
      return;
    }
    const body = rule.nodes.map(String).join(";");
    for (const selector of rule.selectors) {
      const trimmed = selector.trim();
      const [first, ...rest] = trimmed.split(/\s*>\s*|\s+/);
      normalizedRules.push({
        selector: isRootCompound(first) && rest.length > 0 ? trimmed.slice(first.length).replace(/^\s*>?\s*/, "") : trimmed,
        body,
      });
    }
  });
  if (background.length > 0) {
    const bg = (parseFragment('<div class="bg"></div>') as any).childNodes[0];
    bg.parentNode = root;
    root.childNodes = [bg, ...root.childNodes];
    const bgBody = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; ${background.join("; ")}`;
    parsed.append(postcss.parse(`${rootSelector} > .bg {${bgBody}}`));
    normalizedRules.push({ selector: ".bg", body: bgBody });
  }

  const prepared: PreparedFrame = {
    frame: layout.frame,
    root,
    rootSelector,
    css: parsed.toString(),
    normalizedRules,
    rootBody,
    children: [],
  };
  prepared.children = root.childNodes
    .filter((node: any) => node.tagName)
    .map((node: any) => ({
      node,
      signature: [
        serializeOuter(node),
        ...relevantRules(normalizedRules, node)
          .map(({ selector, body }) => `${selector}{${body.replace(/\s+/g, "")}}`)
          .sort(),
      ].join("\n"),
    }));
  return prepared;
}

/** Rules whose last compound selects an element inside the node's subtree. */
function relevantRules(
  rules: { selector: string; body: string }[],
  node: any,
): { selector: string; body: string }[] {
  const elements: any[] = [];
  const collect = (current: any) => {
    if (current.tagName) {
      elements.push(current);
    }
    (current.childNodes ?? []).forEach(collect);
  };
  collect(node);
  return rules.filter(({ selector }) => {
    const last = selector.split(/\s*[>+~]\s*|\s+/).pop() ?? "";
    const compound = last.replace(/::?[\w-]+(\([^)]*\))?/g, "");
    const tag = /^[a-z][\w-]*/i.exec(compound)?.[0];
    const classes = [...compound.matchAll(/\.([\w-]+)/g)].map(([, name]) => name);
    if (!tag && classes.length === 0) {
      return false;
    }
    return elements.some(
      (element) =>
        (!tag || element.tagName === tag.toLowerCase()) &&
        classes.every((name) => classesOf(element).includes(name)),
    );
  });
}

function classesOf(node: any): string[] {
  return String(node.attrs?.find(({ name }: any) => name === "class")?.value ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

function setAttribute(node: any, name: string, value: string): void {
  node.attrs = [...(node.attrs ?? []).filter((attr: any) => attr.name !== name), { name, value }];
}

function describe(node: any): string {
  const classes = classesOf(node);
  return classes.length > 0 ? `.${classes.join(".")}` : node.tagName;
}
