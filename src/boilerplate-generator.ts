import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

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
  autoFillPlaceholderContent?: boolean;
  autoScaleFonts?: boolean;
  selectedAgency?: SettingsSelection | null;
  selectedAdvertiser?: SettingsSelection | null;
  selectedAdset?: SettingsSelection | null;
};

export class BoilerplateGenerator {
  constructor(private readonly extensionContext: vscode.ExtensionContext) {}

  generate(message: BoilerplateMessage): void {
    const srcFolder = path.join(message.folder, "src");
    const settingsFolder = path.join(message.folder, "settings");
    this.createProjectDirectories(srcFolder, settingsFolder);

    const settings = this.buildSettings(message);
    this.writeFile(path.join(settingsFolder, "settings.json"), settings);

    const content = this.buildContent(message);
    this.writeFile(path.join(settingsFolder, "content.json"), content);

    const templates = this.loadTemplates();
    const generated = this.buildGeneratedFiles(message, templates);

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
  ): {
    index: string;
    script: string;
    styles: string;
    creative: string;
  } {
    const frameCount = this.getFrameCount(message.frames);
    const dimensionSuffix = this.getDimensionSuffix(message);
    const generator = this.getGenerator();
    const today = this.getCurrentDate();

    const creative = this.buildCreativeScript(
      templates.creative,
      frameCount,
      message.autoScaleFonts,
    );
    const script = this.buildScript(
      templates.script,
      message,
      frameCount,
      dimensionSuffix,
      today,
      this.buildPlaceholderContent(message),
      this.buildInteractionCode(message),
    );

    return {
      index: this.buildIndexHtml(
        templates.index,
        generator,
        message.selectedFonts,
      ),
      script,
      styles: this.buildStyles(templates.styles, message.selectedFonts),
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
  ): string {
    const fontLinks = fonts
      .map(
        ({ variant, fontUrl }) =>
          `  <link rel="stylesheet" type="text/css" media="all" href="${fontUrl}?v=${variant}">`,
      )
      .join("\n");

    return template
      .replaceAll("{{GENERATOR}}", generator)
      .replace("{{FONT_LINKS}}", fontLinks);
  }

  private buildStyles(template: string, fonts: SelectedFont[]): string {
    const fontVariables = fonts
      .filter((font) => font.family?.trim())
      .map((font, index) => `  --font${index + 1}: "${font.family}";`)
      .join("\n");

    return template.replace("/* FONT_VARIABLES */", fontVariables);
  }

  private buildCreativeScript(
    template: string,
    frameCount: number,
    autoScaleFonts?: boolean,
  ): string {
    return template.replace("/* FRAME_COUNT */ 1", String(frameCount)).replace(
      "/* AUTO_SCALE_FONT */",
      autoScaleFonts
        ? `  autoScaleFont: function (minSize = 8, selector = "[data-font_autoscale]") {
    const elements = $(selector).toArray();

    return Promise.all(
      elements.map((element) => {
        return new Promise((resolve) => {
          const parent = element;
          const child = parent.firstElementChild;

          if (!child) {
            resolve();
            return;
          }

          const styles = window.getComputedStyle(parent);

          let fontSize = parseFloat(styles.fontSize);
          const maxHeight = parseFloat(styles.maxHeight);
          const parentWidth = parent.getBoundingClientRect().width;

          if (
            !Number.isFinite(fontSize) ||
            !Number.isFinite(maxHeight) ||
            !parentWidth
          ) {
            resolve();
            return;
          }

          const fits = () => {
            const rect = child.getBoundingClientRect();

            return rect.height <= maxHeight && rect.width <= parentWidth;
          };

          const reduceFontSize = () => {
            if (fits() || fontSize <= minSize) {
              resolve();
              return;
            }

            fontSize -= 0.5;
            parent.style.fontSize = \`\${fontSize}px\`;

            requestAnimationFrame(reduceFontSize);
          };

          requestAnimationFrame(reduceFontSize);
        });
      }),
    );
  },`
        : "",
    );
  }

  private buildScript(
    template: string,
    message: BoilerplateMessage,
    frameCount: number,
    dimensionSuffix: string,
    today: string,
    placeholderContentCode: string,
    interactionCode: string,
  ): string {
    const frameTimelines = Array.from(
      { length: frameCount },
      (_, index) => `const frame${index + 1}Timeline = gsap.timeline();`,
    ).join("\n");

    const frameAnimations = Array.from({ length: frameCount }, (_, index) => {
      const frameNumber = index + 1;
      return `function createFrame${frameNumber}Animation() {
  frame${frameNumber}Timeline.addLabel("preview-ready");
}

`;
    }).join("");

    const startAnimations = `function startAnimations() {
${Array.from({ length: frameCount }, (_, index) => {
  const frameNumber = index + 1;
  return `  createFrame${frameNumber}Animation();
  const frame${frameNumber}Start = mainTimeline.duration();

  mainTimeline.add(frame${frameNumber}Timeline);
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

  private buildPlaceholderContent(message: BoilerplateMessage): string {
    if (!message.autoFillPlaceholderContent) {
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
          placeholderMap.set(
            name,
            type === "image" || type === "img" ? "image" : "text",
          );
        }
      }
    }

    return Array.from(placeholderMap.entries())
      .map(([name, type]) => {
        const selector = `.${name}`;
        const contentReference = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
          ? `content?.${name}?.value`
          : `content?.[${JSON.stringify(name)}]?.value`;

        if (type === "image") {
          return [
            `  $("${selector}").attr("src", ${contentReference});`,
            `  Creative.addWait($("${selector}"));`,
          ].join("\n");
        }

        return `  $("${selector}").html(${contentReference});`;
      })
      .join("\n");
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
