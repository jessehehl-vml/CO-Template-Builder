import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  AUTO_SCALE_FONT_CODE,
  BROWSER_CHECK_CODE,
  GSAP_LATEST,
} from "./addons";
import { fontBlock } from "./font-links";
import { writePsdStoryboardImages } from "./psd-analysis";
import type { PsdGeneratedCreative } from "./psd-codegen";

/** Fills a PSD list folder (e.g. a row of buttons) with one copy of its first item per feed value. */
const LIST_HELPER_CODE = `// ============================================================
// Lists
// ============================================================

// Reads "[a] [b] [c]" or a JSON array.
function parseList(value) {
  const text = String(value ?? "").trim();
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch (error) {
      // Not JSON; read it as [a] [b] [c].
    }
  }
  return [...text.matchAll(/\\[([^\\]]*)\\]/g)].map((match) => match[1].trim());
}

function fillList(selector, value) {
  const labels = parseList(value);
  $(selector).each(function () {
    const list = $(this);
    const template = list.children().first();
    if (labels.length === 0 || template.length === 0) {
      return;
    }
    list.children().remove();
    labels.forEach((label) => {
      const item = template.clone();
      item.find("[data-list-label]").addBack("[data-list-label]").text(label);
      list.append(item);
    });
  });
}
`;

type SelectedFont = {
  family: string;
  variant: string;
  fontUrl: string;
};

type Placeholder = {
  name: string;
  type: string;
  value?: unknown;
};

type PlaceholderDimension = {
  width?: number;
  height?: number;
  placeholders?: Placeholder[];
};

type PlaceholderVariant = {
  dimensions?: PlaceholderDimension[];
};

type CollectionField = {
  placeholder: string;
  placeholderType: string;
  productField: string;
};

type CollectionMapping = {
  collection: string;
  intent: string;
  required: string;
  fields: CollectionField[];
};

type SettingsSelection = {
  id: number;
  name: string;
};

export type BoilerplateMessage = {
  folder: string;
  name: string;
  userName?: string | null;
  dimensionType: "single" | "responsive";
  selectedDimensions: string[];
  selectedFonts: SelectedFont[];
  coFonts: unknown[];
  placeholderVariants: PlaceholderVariant[];
  products?: Record<string, { products?: { items?: unknown[] } }>;
  collectionMapping?: CollectionMapping | null;
  frames?: number;
  frameDurations?: Record<number, number>;
  autoFillPlaceholderContent?: boolean;
  autoScaleFonts?: boolean;
  browserCheck?: boolean;
  splitText?: boolean;
  drawSVGPlugin?: boolean;
  motionPathPlugin?: boolean;
  fromPsd?: boolean;
  psdIs2x?: boolean;
  selectedAgency?: SettingsSelection | null;
  selectedAdvertiser?: SettingsSelection | null;
  selectedAdset?: SettingsSelection | null;
};

export class BoilerplateGenerator {
  constructor(private readonly extensionContext: vscode.ExtensionContext) {}

  generate(
    message: BoilerplateMessage,
    psdBuffer?: Buffer,
    psdCreative?: PsdGeneratedCreative,
  ): void {
    this.getFrameDurations(message, this.getFrameCount(message.frames));

    const srcFolder = path.join(message.folder, "src");
    const settingsFolder = path.join(message.folder, "settings");
    this.createProjectDirectories(srcFolder, settingsFolder);

    if (message.fromPsd) {
      if (!psdBuffer) {
        throw new Error("PSD source data is required to generate storyboards.");
      }
      if (!psdCreative) {
        throw new Error("Generated PSD HTML/CSS is required for PSD projects.");
      }
      writePsdStoryboardImages(
        psdBuffer,
        path.join(message.folder, "storyboards"),
        Boolean(message.psdIs2x),
      );
      for (const asset of psdCreative.assets) {
        const assetPath = path.join(srcFolder, asset.fileName);
        fs.mkdirSync(path.dirname(assetPath), { recursive: true });
        fs.writeFileSync(assetPath, asset.data);
      }
    }

    const settings = this.buildSettings(message);
    this.writeFile(path.join(settingsFolder, "settings.json"), settings);

    const content = this.buildContent(message);
    this.writeFile(path.join(settingsFolder, "content.json"), content);

    const templates = this.loadTemplates();
    // Feed lists rely on autoscale to keep their labels inside the PSD's row.
    const generated = this.buildGeneratedFiles(
      psdCreative?.listPlaceholders?.length
        ? { ...message, autoScaleFonts: true }
        : message,
      templates,
      psdCreative,
    );

    this.writeGeneratedFiles(srcFolder, generated);
  }

  private createProjectDirectories(
    srcFolder: string,
    settingsFolder: string,
  ): void {
    fs.mkdirSync(srcFolder, { recursive: true });
    fs.mkdirSync(settingsFolder, { recursive: true });
  }

  private buildSettings(message: BoilerplateMessage): Record<string, unknown> {
    const settings: Record<string, unknown> = {
      projectName: message.name,
      createdBy: message.userName ?? "",
      adsetType: message.dimensionType ?? "single",
      dimensions: message.selectedDimensions.map((size) => {
        const [width, height] = size.split("x").map(Number);
        return { width, height };
      }),
      fonts: message.coFonts ?? [],
      selectedFonts: message.selectedFonts.map(
        ({ family, variant, fontUrl }) => ({
          family,
          variant,
          fontUrl,
        }),
      ),
      placeholders: this.buildPlaceholders(message),
      autoScaleFonts: Boolean(message.autoScaleFonts),
      browserCheck: Boolean(message.browserCheck),
      splitText: Boolean(message.splitText),
      drawSVGPlugin: Boolean(message.drawSVGPlugin),
      motionPathPlugin: Boolean(message.motionPathPlugin),
    };

    this.addSelection(settings, "agency", message.selectedAgency);
    this.addSelection(settings, "advertiser", message.selectedAdvertiser);
    this.addSelection(settings, "adset", message.selectedAdset);

    return settings;
  }

  private buildPlaceholders(
    message: BoilerplateMessage,
  ): Record<string, unknown> {
    const allPlaceholders = message.placeholderVariants.flatMap(
      (variant) =>
        variant.dimensions?.flatMap(
          (dimension) => dimension.placeholders ?? [],
        ) ?? [],
    );

    const uniquePlaceholders = Array.from(
      new Map(
        allPlaceholders.map((placeholder) => [placeholder.name, placeholder]),
      ).values(),
    );

    const placeholders: Record<string, unknown> = {};

    for (const placeholder of uniquePlaceholders) {
      if (placeholder.type === "collection") {
        continue;
      }

      placeholders[placeholder.name] = { type: placeholder.type };
    }

    const collection = message.collectionMapping;
    if (collection) {
      placeholders[collection.collection] = {
        placeholders: Object.fromEntries(
          collection.fields.map(({ placeholder, placeholderType }) => [
            placeholder,
            { type: placeholderType },
          ]),
        ),
        type: "collection",
        intent: collection.intent,
        items_required: Number(collection.required),
      };
    }

    return placeholders;
  }

  private buildContent(message: BoilerplateMessage): Record<string, unknown> {
    const content: Record<string, unknown> = {
      variants: message.placeholderVariants,
    };

    const collection = message.collectionMapping;
    const products = message.products;

    if (collection && products) {
      content.variants = message.placeholderVariants.map((variant) => ({
        ...variant,
        dimensions: (variant.dimensions ?? []).map((dimension) => {
          const selectorPlaceholder = (dimension.placeholders ?? []).find(
            (placeholder) =>
              (placeholder.name === "product-selector_ID" ||
                placeholder.name === "productSelector") &&
              placeholder.value,
          );

          if (!selectorPlaceholder) {
            return dimension;
          }

          const selectorId = String(selectorPlaceholder.value).trim();
          const selectorResult = products[selectorId];
          const items = Array.isArray(selectorResult?.products?.items)
            ? selectorResult.products.items
            : [];
          const required = Number(collection.required);
          const uniqueProducts = new Map<string, unknown>();

          for (const product of items) {
            if (!product || typeof product !== "object" || !("id" in product)) {
              continue;
            }

            const id = String((product as { id: unknown }).id);
            if (!uniqueProducts.has(id)) {
              uniqueProducts.set(id, product);
            }
            if (uniqueProducts.size >= required) {
              break;
            }
          }

          const collectionProducts = [...uniqueProducts.values()].map(
            (product) => {
              const item: Record<string, unknown> = {};

              for (const field of collection.fields) {
                const productFieldName = field.productField as string;
                item[field.placeholder] = {
                  type: field.placeholderType,
                  value:
                    (product as { fields?: Record<string, unknown> })?.fields?.[
                      productFieldName
                    ] ?? "",
                };
              }

              return item;
            },
          );

          const placeholders = [...(dimension.placeholders ?? [])];
          const filtered = placeholders.filter(
            (placeholder) => placeholder.name !== collection.collection,
          );
          filtered.push({
            name: collection.collection,
            type: "collection",
            value: collectionProducts,
          });

          return { ...dimension, placeholders: filtered };
        }),
      }));
    }

    return content;
  }

  private loadTemplates(): {
    index: string;
    script: string;
    styles: string;
    creative: string;
  } {
    const boilerplateFolder = path.join(
      this.extensionContext.extensionPath,
      "boilerplate",
    );

    if (!fs.existsSync(boilerplateFolder)) {
      throw new Error(
        `Boilerplate templates could not be found: ${boilerplateFolder}`,
      );
    }

    return {
      index: this.readFile(path.join(boilerplateFolder, "index.html")),
      script: this.readFile(path.join(boilerplateFolder, "script.js")),
      styles: this.readFile(path.join(boilerplateFolder, "styles.css")),
      creative: this.readFile(path.join(boilerplateFolder, "Creative.js")),
    };
  }

  private buildGeneratedFiles(
    message: BoilerplateMessage,
    templates: {
      index: string;
      script: string;
      styles: string;
      creative: string;
    },
    psdCreative?: PsdGeneratedCreative,
  ): {
    index: string;
    script: string;
    styles: string;
    creative: string;
  } {
    const frameCount = this.getFrameCount(message.frames);
    const frameDurations = this.getFrameDurations(message, frameCount);
    const dimensionSuffix = this.getDimensionSuffix(message);
    const generator = this.getGenerator();
    const today = this.getCurrentDate();

    const creative = this.buildCreativeScript(
      templates.creative,
      frameCount,
      message.autoScaleFonts,
      message.browserCheck,
    );
    const script = this.buildScript(
      templates.script,
      message,
      frameCount,
      frameDurations,
      dimensionSuffix,
      today,
      this.buildPlaceholderContent(
        message,
        psdCreative?.imagePlaceholders ?? [],
        psdCreative?.textPlaceholders ?? [],
        psdCreative?.listPlaceholders ?? [],
      ),
      this.buildInteractionCode(message),
      psdCreative?.frameSets,
    );

    return {
      index: this.buildIndexHtml(
        templates.index,
        generator,
        message.selectedFonts,
        message.splitText,
        message.drawSVGPlugin,
        message.motionPathPlugin,
        psdCreative?.html,
      ),
      script: psdCreative?.listPlaceholders?.length
        ? `${script}\n${LIST_HELPER_CODE}`
        : script,
      styles: this.buildStyles(
        templates.styles,
        message.selectedFonts,
        psdCreative?.css,
      ),
      creative,
    };
  }

  private getFrameCount(frames?: number): number {
    const frameCount = Number(frames ?? 3);

    if (!Number.isInteger(frameCount) || frameCount < 1) {
      throw new Error(
        "Number of frames must be a whole number greater than 0.",
      );
    }

    return frameCount;
  }

  private getFrameDurations(
    message: BoilerplateMessage,
    frameCount: number,
  ): number[] {
    const durations = Array.from({ length: frameCount }, (_, index) => {
      const duration = Number(
        message.frameDurations?.[index + 1] ?? 15 / frameCount,
      );
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error("Each frame duration must be greater than 0 seconds.");
      }
      return duration;
    });

    if (
      durations.reduce((total, duration) => total + duration, 0) > 15.000001
    ) {
      throw new Error("The total frame duration cannot exceed 15 seconds.");
    }

    return durations;
  }

  private getDimensionSuffix(message: BoilerplateMessage): string {
    return message.dimensionType === "single" && message.selectedDimensions[0]
      ? ` - ${message.selectedDimensions[0]}`
      : "";
  }

  private getGenerator(): string {
    return `${this.extensionContext.extension.packageJSON.name ?? "Extension"} v${this.extensionContext.extension.packageJSON.version ?? "0.0.0"}`;
  }

  private getCurrentDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private buildIndexHtml(
    template: string,
    generator: string,
    fonts: SelectedFont[],
    splitText?: boolean,
    drawSVGPlugin?: boolean,
    motionPathPlugin?: boolean,
    creativeMarkup = "",
  ): string {
    const fontLinks = fonts.length > 0 ? fontBlock(fonts) : "";
    const gsapPlugins = [
      splitText
        ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/${GSAP_LATEST}/SplitText.min.js"></script>`
        : "",
      drawSVGPlugin
        ? '<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/DrawSVGPlugin.min.js"></script>'
        : "",
      motionPathPlugin
        ? '<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/MotionPathPlugin.min.js"></script>'
        : "",
    ]
      .filter(Boolean)
      .join("\n    ");

    const hasGsapPlugins = splitText || drawSVGPlugin || motionPathPlugin;
    const html = hasGsapPlugins
      ? template.replace(
          "gsap/3.13.0/gsap.min.js",
          `gsap/${GSAP_LATEST}/gsap.min.js`,
        )
      : template;

    return html
      .replaceAll("{{GENERATOR}}", generator)
      .replace("{{FONT_LINKS}}", fontLinks)
      .replace("{{CREATIVE_MARKUP}}", creativeMarkup)
      .replace("{{SPLIT_TEXT}}", gsapPlugins)
      .replace(/\n[ \t]*\{\{SPLIT_TEXT\}\}/, "");
  }

  private buildStyles(
    template: string,
    fonts: SelectedFont[],
    psdStyles = "",
  ): string {
    const fontVariables = fonts
      .filter((font) => font.family?.trim())
      .map((font, index) => `  --font${index + 1}: "${font.family}";`)
      .join("\n");

    return `${template.replace("/* FONT_VARIABLES */", fontVariables)}\n${psdStyles}`;
  }

  private buildCreativeScript(
    template: string,
    frameCount: number,
    autoScaleFonts?: boolean,
    browserCheck?: boolean,
  ): string {
    return template
      .replace("/* FRAME_COUNT */ 1", String(frameCount))
      .replace("/* BROWSER_CHECK */", browserCheck ? BROWSER_CHECK_CODE : "")
      .replace(
        "/* AUTO_SCALE_FONT */",
        autoScaleFonts ? AUTO_SCALE_FONT_CODE : "",
      );
  }

  private buildScript(
    template: string,
    message: BoilerplateMessage,
    frameCount: number,
    frameDurations: number[],
    dimensionSuffix: string,
    today: string,
    placeholderContentCode: string,
    interactionCode: string,
    psdFrameSets?: number[][],
  ): string {
    const frameTimelines = Array.from(
      { length: frameCount },
      (_, index) => `const frame${index + 1}Timeline = gsap.timeline();`,
    ).join("\n");

    const frameFadeIns = frameDurations.map((duration, index) =>
      message.fromPsd && index > 0
        ? Math.min(0.25, duration / 2, frameDurations[index - 1] / 2)
        : message.fromPsd
          ? Math.min(0.25, duration / 2)
          : 0,
    );
    const frameFadeOuts = frameDurations.map((duration, index) =>
      message.fromPsd && index < frameCount - 1
        ? Math.min(0.25, duration / 2, frameDurations[index + 1] / 2)
        : 0,
    );

    const frameAnimations = Array.from({ length: frameCount }, (_, index) => {
      const frameNumber = index + 1;
      const duration = frameDurations[index];
      const fadeIn = frameFadeIns[index];
      const fadeOut = frameFadeOuts[index];
      const psdFrameAnimation = message.fromPsd
        ? this.buildPsdFrameAnimation(
            frameNumber,
            frameCount,
            duration,
            fadeIn,
            fadeOut,
            psdFrameSets,
          )
        : `  frame${frameNumber}Timeline.addLabel("preview-ready");\n  frame${frameNumber}Timeline.to({}, { duration: ${duration} });\n  frame${frameNumber}Timeline.duration(${duration});`;
      return `function createFrame${frameNumber}Animation() {
${psdFrameAnimation}
}

`;
    }).join("");

    const startAnimations = `function startAnimations() {
${Array.from({ length: frameCount }, (_, index) => {
  const frameNumber = index + 1;
  const overlap = message.fromPsd ? frameFadeIns[index] : 0;
  const addPosition = overlap > 0 ? `, "-=${overlap}"` : "";
  return `  createFrame${frameNumber}Animation();
  const frame${frameNumber}Start = mainTimeline.duration() - ${overlap};

  mainTimeline.add(frame${frameNumber}Timeline${addPosition});
  mainTimeline.addLabel(
    "frame${frameNumber}-preview",
    frame${frameNumber}Start + frame${frameNumber}Timeline.labels["preview-ready"],
  );`;
}).join("\n\n")}
}`;

    return template
      .replaceAll("{{PROJECT_NAME}}", message.name)
      .replaceAll("{{DIMENSION_SUFFIX}}", dimensionSuffix)
      .replaceAll("{{OWNER}}", message.userName ?? "")
      .replaceAll("{{DATE}}", today)
      .replace("/* FRAME_TIMELINES */", frameTimelines)
      .replace("/* FRAME_ANIMATIONS */", `${frameAnimations}${startAnimations}`)
      .replace("/* AUTO_FILL_PLACEHOLDER_CONTENT */", placeholderContentCode)
      .replace(
        "/* AUTO_SCALE_FONTS */",
        message.autoScaleFonts ? "  await Creative.autoScaleFont();" : "",
      )
      .replace("/* INTERACTION_CODE */", interactionCode);
  }

  /**
   * Shows the elements of one PSD frame: elements tagged with data-frames fade in when their
   * first frame starts and fade out after their last frame; shared elements stay visible.
   */
  private buildPsdFrameAnimation(
    frameNumber: number,
    frameCount: number,
    duration: number,
    fadeIn: number,
    fadeOut: number,
    frameSets?: number[][],
  ): string {
    const timeline = `frame${frameNumber}Timeline`;
    const inFrame = `[data-frames~="${frameNumber}"]`;
    const enters =
      !frameSets ||
      frameSets.some(
        (frames) =>
          frames.includes(frameNumber) && !frames.includes(frameNumber - 1),
      );
    const leaves =
      frameNumber < frameCount &&
      fadeOut > 0 &&
      (!frameSets ||
        frameSets.some(
          (frames) =>
            frames.includes(frameNumber) && !frames.includes(frameNumber + 1),
        ));
    const enterSelector =
      frameNumber === 1
        ? `#creative_container ${inFrame}`
        : `#creative_container ${inFrame}:not([data-frames~="${frameNumber - 1}"])`;
    const leaveSelector = `#creative_container ${inFrame}:not([data-frames~="${frameNumber + 1}"])`;
    // QA previews the frame's final state, just before it starts fading out.
    const previewReady =
      Math.round(Math.max(fadeIn, duration - fadeOut - 0.05) * 1000) / 1000;

    return [
      `  ${timeline}.to({}, { duration: ${duration} }, 0);`,
      enters
        ? `  ${timeline}.fromTo('${enterSelector}', { autoAlpha: 0 }, { autoAlpha: 1, duration: ${fadeIn}, immediateRender: false }, 0);`
        : "",
      `  ${timeline}.addLabel("preview-ready", ${previewReady});`,
      leaves
        ? `  ${timeline}.to('${leaveSelector}', { autoAlpha: 0, duration: ${fadeOut} }, ${Math.round((duration - fadeOut) * 1000) / 1000});`
        : "",
      `  ${timeline}.duration(${duration});`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildPlaceholderContent(
    message: BoilerplateMessage,
    psdImagePlaceholders: string[] = [],
    psdTextPlaceholders: string[] = [],
    psdListPlaceholders: string[] = [],
  ): string {
    const psdImagePlaceholderSet = new Set(psdImagePlaceholders);
    const psdTextPlaceholderSet = new Set([
      ...psdTextPlaceholders,
      ...psdListPlaceholders,
    ]);
    const psdListPlaceholderSet = new Set(psdListPlaceholders);
    if (
      !message.autoFillPlaceholderContent &&
      psdImagePlaceholderSet.size === 0 &&
      psdTextPlaceholderSet.size === 0
    ) {
      return "";
    }

    const placeholderMap = new Map<string, string>();
    for (const variant of message.placeholderVariants ?? []) {
      for (const dimension of variant.dimensions ?? []) {
        for (const placeholder of dimension.placeholders ?? []) {
          const name = placeholder.name.trim();
          if (!name) {
            continue;
          }

          const type = placeholder.type.toLowerCase();
          const isImage = ["image", "img", "image-url"].includes(type);
          if (
            !message.autoFillPlaceholderContent &&
            !(isImage ? psdImagePlaceholderSet : psdTextPlaceholderSet).has(
              name,
            )
          ) {
            continue;
          }
          placeholderMap.set(name, isImage ? "image" : "text");
        }
      }
    }

    const imageWaits: string[] = [];

    const lines = Array.from(placeholderMap.entries()).map(([name, type]) => {
      const selector = `.${name}`;
      const contentReference = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
        ? `content?.${name}?.value`
        : `content?.[${JSON.stringify(name)}]?.value`;

      if (type === "image" && psdImagePlaceholderSet.has(name)) {
        imageWaits.push(contentReference);
        return `  $("${selector}").css("background-image", "url(" + JSON.stringify(${contentReference}) + ")");`;
      }

      if (type === "image") {
        imageWaits.push(`$("${selector}")`);
        return `  $("${selector}").attr("src", ${contentReference});`;
      }

      if (psdListPlaceholderSet.has(name)) {
        return `  fillList("${selector}", ${contentReference});`;
      }

      return `  $("${selector}").html(${contentReference});`;
    });

    // One call after all images are set; addWait accepts elements and image URLs.
    if (imageWaits.length > 0) {
      lines.push(`  Creative.addWait(${imageWaits.join(", ")});`);
    }

    return lines.join("\n");
  }

  private buildInteractionCode(message: BoilerplateMessage): string {
    const bySize: Record<string, string> = {};
    const names = new Set<string>();

    for (const variant of message.placeholderVariants ?? []) {
      for (const dimension of variant.dimensions ?? []) {
        for (const placeholder of dimension.placeholders ?? []) {
          if (placeholder.type.toLowerCase() !== "click") {
            continue;
          }

          names.add(placeholder.name);

          if (dimension.width && dimension.height) {
            bySize[`${dimension.width}x${dimension.height}`] ??=
              placeholder.name;
          }
        }
      }
    }

    const [first] = names;

    if (first === undefined) {
      return ";";
    }

    if (names.size === 1) {
      return `
    .on("click tap", function () {
      Creative.click(${JSON.stringify(first)});
    })`;
    }

    // The click placeholder is named differently per size.
    return `
    .on("click tap", function () {
      const clickPlaceholders = ${JSON.stringify(bySize)};

      Creative.click(
        clickPlaceholders[Creative.width + "x" + Creative.height] ?? ${JSON.stringify(first)},
      );
    })`;
  }

  private addSelection(
    settings: Record<string, unknown>,
    key: string,
    selection?: { id: number; name: string } | null,
  ): void {
    if (!selection) {
      return;
    }

    settings[key] = {
      id: selection.id,
      name: selection.name,
    };
  }

  private readFile(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  }

  private writeFile(filePath: string, content: unknown): void {
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), "utf8");
  }

  private writeGeneratedFiles(
    srcFolder: string,
    generated: {
      index: string;
      script: string;
      styles: string;
      creative: string;
    },
  ): void {
    fs.writeFileSync(
      path.join(srcFolder, "index.html"),
      generated.index,
      "utf8",
    );
    fs.writeFileSync(
      path.join(srcFolder, "script.js"),
      generated.script,
      "utf8",
    );
    fs.writeFileSync(
      path.join(srcFolder, "Creative.js"),
      generated.creative,
      "utf8",
    );
    fs.writeFileSync(
      path.join(srcFolder, "styles.css"),
      generated.styles,
      "utf8",
    );
  }
}
