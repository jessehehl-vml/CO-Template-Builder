import { createHash } from "crypto";
import { readPsd, type Layer, type Psd } from "ag-psd";
import { PNG } from "pngjs";
import {
  getPsdArtboards,
  type PsdArtboard,
  type PsdStoryboardPreview,
} from "./psd-analysis";
import {
  cropOccludedEdges,
  imageRoleClass,
  matchFeedImages,
  summarizePng,
  summarizeRgba,
  type FeedImageMatch,
  type PixelSummary,
} from "./psd-image-matching";
import {
  matchFeedTextByProfile,
  type FeedTextField,
} from "./psd-text-matching";
import { mergeFrameLayouts } from "./psd-frame-merge";
import {
  NO_FEED_IMAGE,
  type PsdMappingDecision,
  type PsdMappingLayer,
  type PsdMappingReview,
  type SvgRecolor,
} from "./psd-mapping";

export type PsdCodegenAsset = {
  fileName: string;
  data: Buffer;
};

export type PsdFeedImageCandidate = {
  placeholderName: string;
  mimeType: string;
  data: Buffer;
  /** Every value of this field in the feed is an SVG, so it can be recoloured with CSS. */
  allSvg?: boolean;
};

export type PsdGeneratedCreative = {
  html: string;
  css: string;
  assets: PsdCodegenAsset[];
  imagePlaceholders: string[];
  textPlaceholders?: string[];
  /** Text fields like "[a] [b] [c]" that fill a folder with one copy of its first item per value. */
  listPlaceholders?: string[];
  /** Frames of each top-level element, used to build the frame timelines. */
  frameSets?: number[][];
};

export type { FeedTextField };

export type PsdFontVariable = {
  variable: string;
  family: string;
  variant?: string;
};

type Rect = { left: number; top: number; width: number; height: number };

type PsdCodegenLayer = {
  name: string;
  /** "spacer": paints nothing (no fill or stroke) and only gives its folder its size. */
  type: "text" | "image" | "shape" | "spacer";
  bounds: Rect;
  opacity: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  /** Letter spacing in em. */
  letterSpacing?: number;
  /** Line height in creative pixels; undefined means automatic leading. */
  lineHeight?: number;
  uppercase?: boolean;
  /** Width of a Photoshop text box in creative pixels; undefined for point text. */
  boxWidth?: number;
  align?: "left" | "center" | "right";
  color?: string;
  fill?: string;
  /** CSS of a live Photoshop shape (fill, border, radius). */
  shapeCss?: string;
  /** Nearest enclosing folder larger than a text layer, in creative pixels. */
  parent?: { name: string; box: Rect };
  parentFolder?: number;
  /** Indexes into the artboard's folders, outermost first. */
  folders?: number[];
  /** Photoshop clipping layer: only shows inside the layer below it. */
  clipping?: boolean;
  /** On a mask layer: index of the single image clipped to it; both become one element. */
  clipImage?: number;
  /** On a clipped image: index of the mask layer whose box it fills. */
  clipBase?: number;
};

type PsdFolder = {
  name: string;
  box?: Rect;
  /** Folder of repeated items (e.g. buttons), each with one label: the label layer indexes. */
  listLabels?: number[];
};

type PsdCodegenArtboard = PsdArtboard & {
  size: string;
  sourceWidth: number;
  sourceHeight: number;
  creativeWidth: number;
  creativeHeight: number;
  layers: PsdCodegenLayer[];
  folders: PsdFolder[];
};

type ArtboardLayer = {
  layer: Layer | null;
  children: Layer[];
};

type FeedImagePlacement = {
  placeholderName: string;
  layerName: string;
  layerIndex: number;
  rect: Rect;
  fit: "cover" | "contain";
  opacity: number;
  /** Turns the feed SVG this colour, to match the PSD artwork. */
  recolor?: SvgRecolor;
};

type FeedTextBinding = { text: string; placeholderName: string };

type DocRect = { left: number; top: number; right: number; bottom: number };

type LayerVisual = {
  summary: PixelSummary;
  /** Visible opaque area, trimmed where opaque layers above cover it (for feed images). */
  rect: Rect;
  /** Visible opaque area of the layer's own pixels (for exported artwork). */
  artRect: Rect;
};

type LayerPixels = {
  data: ArrayLike<number>;
  width: number;
  maxValue: number;
  /** Opaque area to export, in the layer's own pixel coordinates. */
  crop: { x: number; y: number; width: number; height: number };
};

type DecodedFeed = { placeholderName: string; summary?: PixelSummary };

/** Everything needed to build the creative once the mapping has been reviewed. */
export type PsdCreativeDraft = {
  artboards: PsdCodegenArtboard[];
  summaries: Map<string, LayerVisual>;
  pixels: Map<string, LayerPixels>;
  feeds: DecodedFeed[];
  fonts: PsdFontVariable[];
};

const CSS_CLASS_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const OPAQUE_IMAGE_RATIO = 0.95;
const SOLID_FILL_RATIO = 0.98;

/** Feed text fields shown as copy; image descriptions and alt texts are not. */
function isCopyField(name: string): boolean {
  return (
    CSS_CLASS_NAME.test(name) &&
    !/(?:^|[_-])(?:description|desc|alt|alt_?text)(?:$|[_-])/i.test(name)
  );
}

function intersectRects(a: DocRect, b: DocRect): DocRect | undefined {
  const rect = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return rect.right > rect.left && rect.bottom > rect.top ? rect : undefined;
}

/** Reads the PSD, matches feed content to its layers and returns a draft plus the proposed mapping. */
export function preparePsdCreative(
  buffer: Buffer,
  storyboards: PsdStoryboardPreview[],
  is2x: boolean,
  feedImageCandidates: PsdFeedImageCandidate[] = [],
  feedTextFields: FeedTextField[] = [],
  fonts: PsdFontVariable[] = [],
  log?: (entry: string) => void,
): { draft: PsdCreativeDraft; review: PsdMappingReview } {
  const { artboards, summaries, pixels } = extractPsdLayerData(buffer, is2x);
  artboards.sort((a, b) => a.frame - b.frame || a.size.localeCompare(b.size));
  alignSameNamedImageBoxes(artboards, summaries, log);
  log?.(
    `Artboards and PSD image layers: ${JSON.stringify(artboards.map(({ size, frame, layers }) => ({ size, frame, imageLayers: layers.filter(({ type }) => type === "image").map(({ name }) => name) })))}`,
  );
  const { matches, feeds } = matchArtboardFeedImages(
    artboards,
    summaries,
    feedImageCandidates,
    log,
  );
  const { bindings: textBindings, methods: textMethods } =
    matchArtboardFeedText(artboards, feedTextFields, log);

  const imageMatches = new Map(matches.map((match) => [match.key, match]));
  // Colour of each all-SVG feed field (undefined when it uses several colours).
  const svgInks = new Map(
    feedImageCandidates
      .filter(({ allSvg }) => allSvg)
      .map(
        ({ placeholderName, data }) =>
          [placeholderName, svgInkColor(data.toString("utf8"))] as const,
      ),
  );
  if (svgInks.size > 0) {
    log?.(
      `SVG feed colours: ${JSON.stringify([...svgInks].map(([field, ink]) => ({ field, ink: ink ?? "several colours" })))}`,
    );
  }
  const review: PsdMappingReview = {
    reviewId: `${Date.now()}`,
    frames: artboards.map((artboard) => {
      const artboardKey = `${artboard.size}|${artboard.frame}`;
      const bindings = textBindings.get(artboardKey) ?? [];
      const preview = storyboards.find(
        (frame) =>
          frame.frame === artboard.frame &&
          frame.width === artboard.sourceWidth &&
          frame.height === artboard.sourceHeight,
      );
      return {
        size: artboard.size,
        frame: artboard.frame,
        width: artboard.creativeWidth,
        height: artboard.creativeHeight,
        previewDataUrl: preview?.previewDataUrl ?? "",
        layers: [
          ...artboard.layers.flatMap((layer, index): PsdMappingLayer[] => {
            const key = `${artboardKey}|${index}`;
            const visual = summaries.get(key);
            if (
              layer.type === "image" &&
              visual &&
              !isSolidFill(visual.summary) &&
              layer.clipImage === undefined
            ) {
              const match = imageMatches.get(key);
              const recolor = svgRecolors(pixels.get(key), svgInks);
              return [
                {
                  key,
                  kind: "image",
                  name: layer.name,
                  box: visual.rect,
                  field: match?.placeholderName ?? null,
                  method: match?.method,
                  ...(Object.keys(recolor).length > 0 ? { recolor } : {}),
                },
              ];
            }
            if (layer.type === "text" && layer.text?.trim()) {
              const field =
                bindings.find(({ text }) => text === layer.text)
                  ?.placeholderName ?? null;
              return [
                {
                  key,
                  kind: "text",
                  name: layer.name,
                  text: layer.text.trim(),
                  box: layer.bounds,
                  field,
                  method: field ? (textMethods.get(key) ?? "copy") : undefined,
                  parent: layer.parent && {
                    ...layer.parent,
                    key: `${artboardKey}|f${layer.parentFolder}`,
                  },
                },
              ];
            }
            return [];
          }),
          ...artboard.folders.flatMap((folder, index): PsdMappingLayer[] => {
            if (!folder.listLabels || !folder.box) {
              return [];
            }
            const labels = folder.listLabels.map((label) =>
              artboard.layers[label].text!.trim(),
            );
            // Propose a feed field whose value has as many [items] as the folder has labels.
            const field =
              feedTextFields.find(
                ({ placeholderName, value }) =>
                  isCopyField(placeholderName) &&
                  parseListValue(value).length === labels.length,
              )?.placeholderName ?? null;
            return [
              {
                key: `${artboardKey}|f${index}`,
                kind: "list",
                name: folder.name,
                text: labels.join(" · "),
                box: folder.box,
                field,
                method: field ? "list" : undefined,
                children: folder.listLabels.map(
                  (label) => `${artboardKey}|${label}`,
                ),
              },
            ];
          }),
        ],
      };
    }),
    imageFields: feedImageCandidates
      .filter(({ placeholderName }) => CSS_CLASS_NAME.test(placeholderName))
      .map(({ placeholderName, mimeType, data }) => ({
        field: placeholderName,
        previewDataUrl: `data:${mimeType};base64,${data.toString("base64")}`,
      })),
    textFields: feedTextFields
      .filter(({ placeholderName }) => isCopyField(placeholderName))
      .map(({ placeholderName, value }) => ({
        field: placeholderName,
        sample: value
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160),
      })),
  };

  return { draft: { artboards, summaries, pixels, feeds, fonts }, review };
}

/** Builds the creative from the PSD layers using the reviewed layer-to-field mapping. */
export function finishPsdCreative(
  draft: PsdCreativeDraft,
  decisions: PsdMappingDecision[],
  log?: (entry: string) => void,
): PsdGeneratedCreative {
  const placements = new Map<string, FeedImagePlacement[]>();
  const textBindings = new Map<string, FeedTextBinding[]>();
  const hidden = new Set<string>();
  const centered = new Set(
    decisions
      .filter(({ centerInParent }) => centerInParent)
      .map(({ key }) => key),
  );
  // Centring applies to a folder: all its texts move together.
  for (const key of [...centered]) {
    const [size, frame, index] = key.split("|");
    const artboard = draft.artboards.find(
      (item) => item.size === size && item.frame === Number(frame),
    );
    const folder = artboard?.layers[Number(index)]?.parentFolder;
    artboard?.layers.forEach((layer, other) => {
      if (
        folder !== undefined &&
        layer.type === "text" &&
        layer.parentFolder === folder
      ) {
        centered.add(`${size}|${frame}|${other}`);
      }
    });
  }
  // Folder index → feed field, per artboard.
  const lists = new Map<string, Map<number, string>>();
  for (const { key, field, recolor } of decisions) {
    if (field === NO_FEED_IMAGE) {
      hidden.add(key);
      continue;
    }
    if (!field || !CSS_CLASS_NAME.test(field)) {
      continue;
    }
    const [size, frame, index] = key.split("|");
    const artboardKey = `${size}|${frame}`;
    if (index.startsWith("f")) {
      lists.set(
        artboardKey,
        (lists.get(artboardKey) ?? new Map()).set(
          Number(index.slice(1)),
          field,
        ),
      );
      continue;
    }
    const artboard = draft.artboards.find(
      (item) => item.size === size && item.frame === Number(frame),
    );
    const layer = artboard?.layers[Number(index)];
    if (!artboard || !layer) {
      continue;
    }
    if (layer.type === "image") {
      placements.set(artboardKey, [
        ...(placements.get(artboardKey) ?? []),
        {
          ...createPlacement(key, field, layer, draft.summaries, draft.feeds),
          recolor: recolor ?? undefined,
        },
      ]);
    } else if (layer.type === "text" && layer.text) {
      textBindings.set(artboardKey, [
        ...(textBindings.get(artboardKey) ?? []),
        { text: layer.text, placeholderName: field },
      ]);
    }
  }
  log?.(
    `Reviewed mapping: ${JSON.stringify(decisions.filter(({ field }) => field))}`,
  );

  const creative = buildGeneratedCreative(
    draft,
    placements,
    textBindings,
    hidden,
    centered,
    lists,
    log,
  );
  log?.(
    `Final image placeholders: ${JSON.stringify(creative.imagePlaceholders)}`,
  );
  log?.(
    `Final text placeholders: ${JSON.stringify(creative.textPlaceholders)}`,
  );
  log?.(
    `Final list placeholders: ${JSON.stringify(creative.listPlaceholders)}`,
  );
  log?.(
    `Exported PSD artwork: ${JSON.stringify(creative.assets.map(({ fileName }) => fileName))}`,
  );
  return creative;
}

export function extractPsdLayerData(
  buffer: Buffer,
  is2x: boolean,
): {
  artboards: PsdCodegenArtboard[];
  summaries: Map<string, LayerVisual>;
  pixels: Map<string, LayerPixels>;
} {
  const psd = readPsd(buffer, {
    skipLayerImageData: false,
    skipCompositeImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    useImageData: true,
  });
  const geometries = getPsdArtboards(psd);
  const artboardLayers = getArtboardLayers(psd);
  const summaries = new Map<string, LayerVisual>();
  const pixels = new Map<string, LayerPixels>();

  const artboards = geometries.map((geometry, index) => {
    const root = artboardLayers[index];
    const scale = is2x ? 0.5 : 1;
    const creativeWidth = geometry.width * scale;
    const creativeHeight = geometry.height * scale;
    const size = `${creativeWidth}x${creativeHeight}`;
    const layers: PsdCodegenLayer[] = [];
    const groupNames: string[] = [];
    // Folder indexes (outermost first) around each layer, by layer index.
    const layerGroups: number[][] = [];
    const occluders: { index: number; rect: DocRect }[] = [];
    const artboardRect = {
      left: geometry.left,
      top: geometry.top,
      right: geometry.left + geometry.width,
      bottom: geometry.top + geometry.height,
    };
    const toCreativeRect = (rect: DocRect) => ({
      left: (rect.left - geometry.left) * scale,
      top: (rect.top - geometry.top) * scale,
      width: (rect.right - rect.left) * scale,
      height: (rect.bottom - rect.top) * scale,
    });

    const collectLayers = (sourceLayers: Layer[], groupPath: number[]) => {
      // Photoshop clipping layers only show inside the nearest non-clipping layer below them.
      let clipBase: DocRect | undefined;
      for (const layer of sourceLayers) {
        if (layer.hidden) {
          continue;
        }
        if (layer.children?.length) {
          groupNames.push(
            layer.name?.trim() || `Folder ${groupNames.length + 1}`,
          );
          collectLayers(layer.children, [...groupPath, groupNames.length - 1]);
          clipBase = undefined;
          continue;
        }
        layerGroups[layers.length] = groupPath;
        const name = layer.name?.trim() || `Layer ${layers.length + 1}`;
        const bounds = getLayerBounds(layer, geometry);
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
          continue;
        }

        const relativeBounds = {
          left: (bounds.left - geometry.left) * scale,
          top: (bounds.top - geometry.top) * scale,
          width: bounds.width * scale,
          height: bounds.height * scale,
        };
        const opacity = Math.max(0, Math.min(1, layer.opacity ?? 1));
        let visible = intersectRects(
          {
            left: bounds.left,
            top: bounds.top,
            right: bounds.left + bounds.width,
            bottom: bounds.top + bounds.height,
          },
          artboardRect,
        );
        const mask = layer.mask;
        if (
          visible &&
          mask &&
          !mask.disabled &&
          (mask.defaultColor ?? 0) === 0 &&
          mask.right !== undefined &&
          mask.left !== undefined &&
          mask.bottom !== undefined &&
          mask.top !== undefined &&
          mask.right > mask.left
        ) {
          visible = intersectRects(visible, {
            left: mask.left,
            top: mask.top,
            right: mask.right,
            bottom: mask.bottom,
          });
        }
        if (visible && layer.clipping && clipBase) {
          visible = intersectRects(visible, clipBase);
        }
        if (!layer.clipping) {
          clipBase = visible;
        }

        if (layer.text?.text) {
          layers.push({
            name,
            type: "text",
            bounds: relativeBounds,
            opacity,
            text: layer.text.text,
            ...textProperties(layer, scale),
          });
          continue;
        }

        const spacer = {
          name,
          type: "spacer" as const,
          bounds: visible ? toCreativeRect(visible) : relativeBounds,
          opacity,
        };
        const stroke = layer.vectorStroke;
        if (
          stroke &&
          !stroke.fillEnabled &&
          !stroke.strokeEnabled &&
          !hasVisibleEffects(layer)
        ) {
          layers.push(spacer);
          continue;
        }

        const shape = liveShape(layer, scale);
        if (shape) {
          if (shape.opaque && opacity >= 0.99) {
            occluders.push({ index: layers.length, rect: shape.box });
          }
          if (!layer.clipping) {
            clipBase = shape.box;
          }
          layers.push({
            name,
            type: "shape",
            bounds: toCreativeRect(shape.box),
            opacity,
            shapeCss: shape.css,
            ...(layer.clipping ? { clipping: true } : {}),
          });
          continue;
        }

        if (layer.imageData) {
          const { data, width, height } = layer.imageData;
          const maxValue =
            data instanceof Uint16Array
              ? 65535
              : data instanceof Float32Array
                ? 1
                : 255;
          const summary = visible
            ? summarizeRgba(data, width, height, maxValue, {
                x: visible.left - bounds.left,
                y: visible.top - bounds.top,
                width: visible.right - visible.left,
                height: visible.bottom - visible.top,
              })
            : undefined;
          if (
            visible &&
            (!summary || summary.opaqueRatio === 0) &&
            !hasVisibleEffects(layer)
          ) {
            layers.push(spacer);
            continue;
          }
          if (summary) {
            const key = `${size}|${geometry.frame}|${layers.length}`;
            const trimmed = {
              left: bounds.left + summary.trim.x,
              top: bounds.top + summary.trim.y,
              right: bounds.left + summary.trim.x + summary.trim.width,
              bottom: bounds.top + summary.trim.y + summary.trim.height,
            };
            const rect = toCreativeRect(trimmed);
            summaries.set(key, { summary, rect, artRect: { ...rect } });
            pixels.set(key, { data, width, maxValue, crop: summary.trim });
            if (summary.opaqueRatio >= OPAQUE_IMAGE_RATIO && opacity >= 0.99) {
              occluders.push({ index: layers.length, rect: trimmed });
            }
            if (!layer.clipping) {
              clipBase = trimmed;
            }
          }
          layers.push({
            name,
            type: "image",
            bounds: relativeBounds,
            opacity,
            ...(layer.clipping ? { clipping: true } : {}),
          });
          continue;
        }

        const fill = vectorFillColor(layer.vectorFill);
        if (fill) {
          if (visible && opacity >= 0.99) {
            occluders.push({ index: layers.length, rect: visible });
          }
          layers.push({
            name,
            type: "shape",
            bounds: visible ? toCreativeRect(visible) : relativeBounds,
            opacity,
            fill,
          });
        }
      }
    };

    collectLayers(root.children, []);
    const folders = assignTextParents(
      layers,
      layerGroups,
      groupNames,
      (index) => summaries.get(`${size}|${geometry.frame}|${index}`)?.artRect,
    );
    layers.forEach((layer, index) => {
      layer.folders = layerGroups[index] ?? [];
    });
    detectListFolders(layers, folders);
    layers.forEach((_, index) => {
      const visual = summaries.get(`${size}|${geometry.frame}|${index}`);
      if (!visual) {
        return;
      }
      const above = occluders
        .filter((occluder) => occluder.index > index)
        .map(({ rect }) => toCreativeRect(rect));
      visual.rect = cropOccludedEdges(visual.rect, above);
    });
    linkClippedImages(layers, (index) =>
      summaries.get(`${size}|${geometry.frame}|${index}`),
    );
    return {
      ...geometry,
      size,
      sourceWidth: geometry.width,
      sourceHeight: geometry.height,
      creativeWidth,
      creativeHeight,
      layers,
      folders,
    };
  });

  return { artboards, summaries, pixels };
}

/** A shape with one image clipped to it becomes one element: the shape's box filled with the image. */
function linkClippedImages(
  layers: PsdCodegenLayer[],
  visualAt: (index: number) => LayerVisual | undefined,
): void {
  layers.forEach((base, index) => {
    const image = layers[index + 1];
    if (
      base.clipping ||
      base.type === "text" ||
      image?.type !== "image" ||
      !image.clipping ||
      layers[index + 2]?.clipping
    ) {
      return;
    }
    const imageVisual = visualAt(index + 1);
    const baseRect =
      base.type === "image" ? visualAt(index)?.artRect : base.bounds;
    if (!imageVisual || !baseRect) {
      return;
    }
    base.clipImage = index + 1;
    image.clipBase = index;
    imageVisual.rect = { ...baseRect };
    imageVisual.artRect = { ...baseRect };
  });
}

/**
 * Marks folders of repeated items, such as a row of buttons: each item is a sub-folder with exactly one
 * text, or a shape/image directly in the folder with exactly one text on it.
 */
function detectListFolders(
  layers: PsdCodegenLayer[],
  folders: PsdFolder[],
): void {
  const contains = (outer: Rect, inner: Rect) =>
    inner.left >= outer.left - 1 &&
    inner.top >= outer.top - 1 &&
    inner.left + inner.width <= outer.left + outer.width + 1 &&
    inner.top + inner.height <= outer.top + outer.height + 1;
  folders.forEach((folder, folderIndex) => {
    if (!folder.box) {
      return;
    }
    const direct: number[] = [];
    const childFolders = new Set<number>();
    layers.forEach((layer, index) => {
      const path = layer.folders ?? [];
      const at = path.indexOf(folderIndex);
      if (at < 0 || layer.type === "spacer") {
        return;
      }
      if (at === path.length - 1) {
        direct.push(index);
      } else {
        childFolders.add(path[at + 1]);
      }
    });

    const labels: number[] = [];
    for (const child of childFolders) {
      const texts = layers.flatMap((layer, index) =>
        layer.type === "text" && layer.folders?.includes(child) ? [index] : [],
      );
      if (texts.length !== 1) {
        return;
      }
      labels.push(texts[0]);
    }
    const texts = direct.filter((index) => layers[index].type === "text");
    const shapes = direct.filter((index) => layers[index].type !== "text");
    for (const shape of shapes) {
      if (
        texts.filter((text) =>
          contains(layers[shape].bounds, layers[text].bounds),
        ).length !== 1
      ) {
        return;
      }
    }
    for (const text of texts) {
      if (
        shapes.filter((shape) =>
          contains(layers[shape].bounds, layers[text].bounds),
        ).length !== 1
      ) {
        return;
      }
      labels.push(text);
    }
    if (labels.length >= 2) {
      folder.listLabels = labels.sort(
        (a, b) =>
          layers[a].bounds.left - layers[b].bounds.left ||
          layers[a].bounds.top - layers[b].bounds.top,
      );
    }
  });
}

/** Items of a list field: a JSON array, or "[a] [b] [c]". Mirrors parseList in the generated script.js. */
export function parseListValue(value: string): string[] {
  const text = value.trim();
  if (text.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      // Not JSON; read it as [a] [b] [c].
    }
  }
  return [...text.matchAll(/\[([^\]]*)\]/g)].map((match) => match[1].trim());
}

/** Computes each folder's content box and gives each text layer the nearest folder larger than the text. */
function assignTextParents(
  layers: PsdCodegenLayer[],
  layerGroups: number[][],
  groupNames: string[],
  imageRect: (index: number) => Rect | undefined,
): PsdFolder[] {
  const groupBoxes = new Map<number, DocRect>();
  // Vertical extent of only the text in each folder.
  const textSpans = new Map<number, { top: number; bottom: number }>();
  layers.forEach((layer, index) => {
    // Text counts with its CSS box (line-height and paragraph width), as that is what the layout places.
    const rect =
      layer.type === "image"
        ? imageRect(index)
        : layer.type === "text"
          ? textBox(layer)
          : layer.bounds;
    if (!rect) {
      return;
    }
    for (const group of layerGroups[index] ?? []) {
      const box = groupBoxes.get(group);
      groupBoxes.set(group, {
        left: Math.min(box?.left ?? Infinity, rect.left),
        top: Math.min(box?.top ?? Infinity, rect.top),
        right: Math.max(box?.right ?? -Infinity, rect.left + rect.width),
        bottom: Math.max(box?.bottom ?? -Infinity, rect.top + rect.height),
      });
      if (layer.type === "text") {
        const span = textSpans.get(group);
        textSpans.set(group, {
          top: Math.min(span?.top ?? Infinity, rect.top),
          bottom: Math.max(span?.bottom ?? -Infinity, rect.top + rect.height),
        });
      }
    }
  });
  layers.forEach((layer, index) => {
    if (layer.type !== "text") {
      return;
    }
    for (const group of [...(layerGroups[index] ?? [])].reverse()) {
      const box = groupBoxes.get(group)!;
      const width = box.right - box.left;
      const height = box.bottom - box.top;
      const span = textSpans.get(group)!;
      // Vertical centring only means something when other content (a background, spacer) makes the folder taller.
      if (height > span.bottom - span.top + 1) {
        layer.parent = {
          name: groupNames[group],
          box: { left: box.left, top: box.top, width, height },
        };
        layer.parentFolder = group;
        return;
      }
    }
  });
  return groupNames.map((name, group) => {
    const box = groupBoxes.get(group);
    return {
      name,
      box: box && {
        left: box.left,
        top: box.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
      },
    };
  });
}

function textProperties(layer: Layer, scale: number): Partial<PsdCodegenLayer> {
  const text = layer.text!;
  const style = text.style ?? {};
  const xScale = Math.abs(text.transform?.[0] ?? 1);
  const yScale = Math.abs(text.transform?.[3] ?? 1);
  const round = (value: number) => Math.round(value * 10) / 10;
  const fontName = style.font?.name ?? "";
  return {
    fontFamily: fontName || undefined,
    fontSize:
      style.fontSize !== undefined
        ? round(style.fontSize * yScale * scale)
        : undefined,
    fontWeight: fontWeightFromName(fontName, style.fauxBold),
    italic: Boolean(style.fauxItalic) || /italic|oblique/i.test(fontName),
    letterSpacing: style.tracking
      ? Math.round(style.tracking) / 1000
      : undefined,
    lineHeight:
      style.autoLeading === false && style.leading
        ? round(style.leading * yScale * scale)
        : undefined,
    uppercase: style.fontCaps === 2,
    boxWidth:
      text.shapeType === "box" && text.boxBounds?.length === 4
        ? round((text.boxBounds[2] - text.boxBounds[0]) * xScale * scale)
        : undefined,
    align: justificationToAlign(text.paragraphStyle?.justification),
    color: colorToCss(style.fillColor),
  };
}

function fontWeightFromName(name: string, fauxBold?: boolean): number {
  const lower = name.toLowerCase();
  const weight = /thin|hairline/.test(lower)
    ? 100
    : /extralight|ultralight/.test(lower)
      ? 200
      : /light/.test(lower)
        ? 300
        : /semibold|demibold/.test(lower)
          ? 600
          : /extrabold|ultrabold/.test(lower)
            ? 800
            : /black|heavy/.test(lower)
              ? 900
              : /bold/.test(lower)
                ? 700
                : /medium/.test(lower)
                  ? 500
                  : 400;
  return fauxBold && weight < 700 ? 700 : weight;
}

/** Whether any enabled layer effect (shadow, glow, overlay, ...) would still paint something. */
function hasVisibleEffects(layer: Layer): boolean {
  const effects = layer.effects as Record<string, unknown> | undefined;
  if (!effects || effects.disabled) {
    return false;
  }
  return Object.entries(effects).some(
    ([name, value]) =>
      name !== "disabled" &&
      name !== "scale" &&
      (Array.isArray(value) ? value : [value]).some(
        (effect) =>
          effect &&
          typeof effect === "object" &&
          (effect as { enabled?: boolean }).enabled !== false,
      ),
  );
}

function vectorFillColor(fill: unknown): string | undefined {
  if (!fill || typeof fill !== "object") {
    return undefined;
  }
  const value = fill as { type?: string; color?: unknown };
  return value.type === "color" ? colorToCss(value.color) : undefined;
}

/** A layer that is one colour and fills its box, so a CSS box reproduces it exactly. */
function isSolidFill(summary: PixelSummary): boolean {
  return summary.uniform && summary.opaqueRatio >= SOLID_FILL_RATIO;
}

function matchArtboardFeedImages(
  artboards: PsdCodegenArtboard[],
  summaries: Map<string, LayerVisual>,
  feedImageCandidates: PsdFeedImageCandidate[],
  log?: (entry: string) => void,
): { matches: FeedImageMatch[]; feeds: DecodedFeed[] } {
  const feeds: DecodedFeed[] = feedImageCandidates
    .filter(({ placeholderName }) => CSS_CLASS_NAME.test(placeholderName))
    .map(({ placeholderName, mimeType, data }) => ({
      placeholderName,
      summary: mimeType === "image/png" ? summarizePng(data) : undefined,
    }));
  log?.(
    `Feed images available for matching: ${JSON.stringify(feeds.map(({ placeholderName, summary }) => ({ placeholderName, pixels: summary ? `${summary.width}x${summary.height}` : "not decoded (PNG only)" })))}`,
  );

  const layers = artboards.flatMap((artboard) =>
    artboard.layers.flatMap((layer, index) => {
      const key = `${artboard.size}|${artboard.frame}|${index}`;
      return layer.type === "image"
        ? [
            {
              key,
              layerName: layer.name,
              frame: artboard.frame,
              summary: summaries.get(key)?.summary,
            },
          ]
        : [];
    }),
  );
  const { matches, scores } = matchFeedImages(layers, feeds);
  log?.(
    `Pixel distances per PSD image layer (lower is closer):\n${scores.map((score) => `  ${score.key} ${JSON.stringify(score.layerName)}: ${score.skipped ? `skipped (${score.skipped}) ` : ""}${JSON.stringify(score.distances)}`).join("\n")}`,
  );
  log?.(`Feed image matches: ${JSON.stringify(matches)}`);
  return { matches, feeds };
}

function createPlacement(
  key: string,
  placeholderName: string,
  layer: PsdCodegenLayer,
  summaries: Map<string, LayerVisual>,
  feeds: DecodedFeed[],
): FeedImagePlacement {
  const feed = feeds.find((item) => item.placeholderName === placeholderName);
  const transparency = feed?.summary ?? summaries.get(key)?.summary;
  return {
    placeholderName,
    layerName: layer.name,
    layerIndex: Number(key.split("|").pop()),
    rect: roundRect(summaries.get(key)?.rect ?? layer.bounds),
    fit:
      layer.clipBase !== undefined ||
      (transparency?.opaqueRatio ?? 1) >= OPAQUE_IMAGE_RATIO
        ? "cover"
        : "contain",
    opacity: layer.opacity,
  };
}

/**
 * Same-named image layers in one size usually show the same asset at the same place.
 * A copy with stray faint pixels gets an oversized box; give it the smallest sibling's box.
 */
function alignSameNamedImageBoxes(
  artboards: PsdCodegenArtboard[],
  summaries: Map<string, LayerVisual>,
  log?: (entry: string) => void,
): void {
  const groups = new Map<string, string[]>();
  for (const artboard of artboards) {
    artboard.layers.forEach((layer, index) => {
      const key = `${artboard.size}|${artboard.frame}|${index}`;
      if (layer.type === "image" && summaries.has(key)) {
        const group = `${artboard.size}|${layer.name}`;
        groups.set(group, [...(groups.get(group) ?? []), key]);
      }
    });
  }
  const area = (key: string) => {
    const { width, height } = summaries.get(key)!.rect;
    return width * height;
  };
  for (const keys of groups.values()) {
    const smallest = keys.reduce((best, key) =>
      area(key) < area(best) ? key : best,
    );
    for (const key of keys) {
      if (area(key) > 2 * area(smallest)) {
        log?.(
          `Image box of ${key} replaced by the box of same-named ${smallest} (stray pixels).`,
        );
        summaries.get(key)!.rect = { ...summaries.get(smallest)!.rect };
      }
    }
  }
}

function matchArtboardFeedText(
  artboards: PsdCodegenArtboard[],
  fields: FeedTextField[],
  log?: (entry: string) => void,
): { bindings: Map<string, FeedTextBinding[]>; methods: Map<string, string> } {
  // Copy repeated across frames of a size (e.g. a brand line) is fixed, and list labels come from their list.
  const framesWithCopy = new Map<string, Set<number>>();
  for (const artboard of artboards) {
    for (const layer of artboard.layers) {
      if (layer.type === "text" && layer.text) {
        const copy = `${artboard.size}|${layer.text.replace(/\s+/g, " ").trim()}`;
        framesWithCopy.set(
          copy,
          (framesWithCopy.get(copy) ?? new Set()).add(artboard.frame),
        );
      }
    }
  }
  const layers = artboards.flatMap((artboard) => {
    const labels = new Set(
      artboard.folders.flatMap(({ listLabels }) => listLabels ?? []),
    );
    return artboard.layers.flatMap((layer, index) =>
      layer.type === "text" &&
      layer.text?.trim() &&
      !labels.has(index) &&
      (framesWithCopy.get(
        `${artboard.size}|${layer.text.replace(/\s+/g, " ").trim()}`,
      )?.size ?? 0) < 2
        ? [
            {
              key: `${artboard.size}|${artboard.frame}|${index}`,
              group: `${artboard.size}|${artboard.frame}`,
              frame: artboard.frame,
              text: layer.text,
              name: layer.name,
              defaultName: hasDefaultName(layer),
              fontSize: layer.fontSize ?? 16,
              fontWeight: layer.fontWeight ?? 400,
            },
          ]
        : [],
    );
  });
  const usable = fields.filter(({ placeholderName }) =>
    isCopyField(placeholderName),
  );
  const matches = matchFeedTextByProfile(layers, usable);
  log?.(
    `Feed text fields (first variant): ${JSON.stringify(usable.map(({ placeholderName }) => placeholderName))}`,
  );
  log?.(
    `Feed text matches: ${JSON.stringify(matches.map((match) => ({ ...match, text: layers.find(({ key }) => key === match.key)?.text.slice(0, 40) })))}`,
  );

  const bindings = new Map<string, FeedTextBinding[]>();
  for (const match of matches) {
    const layer = layers.find(({ key }) => key === match.key)!;
    bindings.set(layer.group, [
      ...(bindings.get(layer.group) ?? []),
      { text: layer.text, placeholderName: match.placeholderName },
    ]);
  }
  return {
    bindings,
    methods: new Map(matches.map(({ key, method }) => [key, method])),
  };
}

function roundRect(rect: Rect): Rect {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    left: round(rect.left),
    top: round(rect.top),
    width: round(rect.width),
    height: round(rect.height),
  };
}

/** Groups the same feed image at the same box across frames, keeping each frame's placement. */
function mergeSizePlacements(
  size: string,
  frames: number[],
  placements: Map<string, FeedImagePlacement[]>,
): (FeedImagePlacement & { members: FeedImagePlacement[] })[] {
  const merged: (FeedImagePlacement & { members: FeedImagePlacement[] })[] = [];
  const close = (a: number, b: number) => Math.abs(a - b) <= 2;
  for (const frame of frames) {
    for (const placement of placements.get(`${size}|${frame}`) ?? []) {
      const existing = merged.find(
        (item) =>
          item.placeholderName === placement.placeholderName &&
          item.fit === placement.fit &&
          close(item.rect.left, placement.rect.left) &&
          close(item.rect.top, placement.rect.top) &&
          close(item.rect.width, placement.rect.width) &&
          close(item.rect.height, placement.rect.height),
      );
      if (existing) {
        existing.members.push(placement);
      } else {
        merged.push({ ...placement, members: [placement] });
      }
    }
  }
  return merged;
}

function buildGeneratedCreative(
  draft: PsdCreativeDraft,
  placements: Map<string, FeedImagePlacement[]>,
  textBindings: Map<string, FeedTextBinding[]>,
  hidden: Set<string>,
  centered: Set<string>,
  lists: Map<string, Map<number, string>>,
  log?: (entry: string) => void,
): PsdGeneratedCreative {
  const wrappers: string[] = [];
  const styles: string[] = [];
  const assets = new Map<string, PsdCodegenAsset>();
  const usedImagePlaceholders = new Set<string>();
  const usedTextPlaceholders = new Set<string>();
  const usedListPlaceholders = new Set<string>();
  const frameSets: number[][] = [];
  const sizes = [...new Set(draft.artboards.map(({ size }) => size))];
  const singleSize = sizes.length === 1;

  for (const size of sizes) {
    const sizeArtboards = draft.artboards.filter(
      (artboard) => artboard.size === size,
    );
    const frames = sizeArtboards.map(({ frame }) => frame);
    const reserved = new Set<string>(["ad", "bg"]);
    // One class per distinct feed image box, so the same image is identical in every frame.
    const imageClasses = mergeSizePlacements(size, frames, placements).map(
      (placement) => ({
        placement,
        className: imageRoleClass(placement.placeholderName, reserved),
      }),
    );

    const frameLayouts = sizeArtboards.map((artboard) => {
      const artboardKey = `${artboard.size}|${artboard.frame}`;
      const frameImages = placements.get(artboardKey) ?? [];
      const bindings = textBindings.get(artboardKey) ?? [];
      const used = new Set(reserved);
      const describe: string[] = [];
      const artboardSize = {
        width: artboard.creativeWidth,
        height: artboard.creativeHeight,
      };
      const folderBox = (folder: number) =>
        roundRect(artboard.folders[folder].box!);
      const isCentred = (layer: PsdCodegenLayer, key: string) =>
        layer.type === "text" &&
        layer.parentFolder !== undefined &&
        centered.has(key) &&
        !hidden.has(key);
      const frameLists = lists.get(artboardKey) ?? new Map<number, string>();
      // Labels of mapped lists are replaced from the feed in script.js.
      const listLabelIndexes = new Set(
        [...frameLists.keys()].flatMap(
          (folder) => artboard.folders[folder]?.listLabels ?? [],
        ),
      );
      // Every list item is a copy of the first, so all use the tightest padding of the PSD's labels.
      const listPadding = new Map<number, { left: number; right: number }>();
      for (const folder of frameLists.keys()) {
        const labels = artboard.folders[folder]?.listLabels ?? [];
        const gaps = labels.flatMap((label) => {
          const ink = artboard.layers[label].bounds;
          const host = artboard.layers
            .filter(
              (layer) =>
                (layer.type === "shape" || layer.type === "image") &&
                layer.bounds.left <= ink.left + 1 &&
                layer.bounds.left + layer.bounds.width >=
                  ink.left + ink.width - 1 &&
                layer.bounds.top <= ink.top + 1 &&
                layer.bounds.top + layer.bounds.height >=
                  ink.top + ink.height - 1,
            )
            .sort(
              (a, b) =>
                a.bounds.width * a.bounds.height -
                b.bounds.width * b.bounds.height,
            )[0];
          return host
            ? [
                {
                  left: ink.left - host.bounds.left,
                  right:
                    host.bounds.left + host.bounds.width - ink.left - ink.width,
                },
              ]
            : [];
        });
        if (gaps.length > 0) {
          const padding = {
            left: Math.max(
              0,
              round1(Math.min(...gaps.map(({ left }) => left))),
            ),
            right: Math.max(
              0,
              round1(Math.min(...gaps.map(({ right }) => right))),
            ),
          };
          labels.forEach((label) => listPadding.set(label, padding));
        }
      }
      // Folders with vertically centred text lay it out as a flex column; padding keeps the PSD's horizontal position.
      const folderPadding = new Map<number, { left: number; right: number }>();
      artboard.layers.forEach((layer, index) => {
        if (!isCentred(layer, `${artboardKey}|${index}`)) {
          return;
        }
        const folder = layer.parentFolder!;
        const box = folderBox(folder);
        const { left, width } = textHorizontal(layer);
        const current = folderPadding.get(folder);
        folderPadding.set(folder, {
          left: Math.min(
            current?.left ?? Infinity,
            Math.max(0, round1(left - box.left)),
          ),
          right: Math.min(
            current?.right ?? Infinity,
            Math.max(0, round1(box.left + box.width - left - width)),
          ),
        });
      });

      // Build a tree of PSD folders and elements; positions are decided when it is rendered.
      const folderClasses = new Map<number, string>();
      const folderClass = (folder: number) => {
        let className = folderClasses.get(folder);
        if (!className) {
          const { name } = artboard.folders[folder];
          className =
            CSS_CLASS_NAME.test(name) && !used.has(name)
              ? name
              : layerClass(name, used);
          used.add(className);
          folderClasses.set(folder, className);
        }
        return className;
      };
      // Layers still named "Rectangle 20 copy 5" or after their own copy are named by folder and role.
      const elementClass = (layer: PsdCodegenLayer) => {
        const folder = (layer.folders ?? [])
          .filter((index) => artboard.folders[index]?.box)
          .at(-1);
        if (folder === undefined || !hasDefaultName(layer)) {
          return layerClass(layer.name, used);
        }
        const base = `${folderClass(folder)}_${elementRole(layer, folder, artboard)}`;
        let className = base;
        for (let index = 2; used.has(className); index++) {
          className = `${base}_${index}`;
        }
        used.add(className);
        return className;
      };
      const roots: LayoutItem[] = [];
      const stack: LayoutItem[] = [];
      const add = (path: number[], item: LayoutItem) => {
        let common = 0;
        while (common < stack.length && stack[common].folder === path[common]) {
          common++;
        }
        stack.length = common;
        for (const folder of path.slice(common)) {
          const className = folderClass(folder);
          const box = folderBox(folder);
          const padding = folderPadding.get(folder);
          const listField = frameLists.get(folder);
          if (listField) {
            usedListPlaceholders.add(listField);
          }
          const node: LayoutItem = {
            className,
            classAttr: listField ? `${className} ${listField}` : className,
            tag: "div",
            attrs: listField ? " data-font_autoscale_group" : "",
            inner: "",
            box,
            size: (container) => sizeCss(box, container),
            style: "",
            children: [],
            folder,
            layout: padding
              ? `display: flex; flex-direction: column; justify-content: center; box-sizing: border-box; padding: 0 ${padding.right}px 0 ${padding.left}px;`
              : undefined,
          };
          (stack[stack.length - 1]?.children ?? roots).push(node);
          stack.push(node);
        }
        (stack[stack.length - 1]?.children ?? roots).push(item);
      };
      const element = (
        item: Omit<
          LayoutItem,
          "classAttr" | "attrs" | "inner" | "children" | "size"
        > &
          Partial<Pick<LayoutItem, "classAttr" | "attrs" | "inner" | "size">>,
      ): LayoutItem => ({
        classAttr: item.className,
        attrs: "",
        inner: "",
        size: (container) => sizeCss(item.box, container),
        children: [],
        ...item,
      });

      artboard.layers.forEach((layer, index) => {
        const key = `${artboardKey}|${index}`;
        if (hidden.has(key)) {
          return;
        }
        // The clipped image's element takes the mask's box, so the mask itself is not drawn.
        if (
          layer.clipImage !== undefined &&
          !hidden.has(`${artboardKey}|${layer.clipImage}`)
        ) {
          return;
        }
        const folders = (layer.folders ?? []).filter(
          (folder) => artboard.folders[folder]?.box,
        );
        // Centred text is a flex item of its folder, so it sits directly inside it.
        const path = isCentred(layer, key)
          ? folders.slice(0, folders.indexOf(layer.parentFolder!) + 1)
          : folders;
        const filter =
          layer.opacity < 1
            ? ` filter: opacity(${Math.round(layer.opacity * 100) / 100});`
            : "";

        const feedImage = frameImages.find(
          (placement) => placement.layerIndex === index,
        );
        if (feedImage) {
          const entry = imageClasses.find(({ placement }) =>
            placement.members.includes(feedImage),
          )!;
          add(
            path,
            element({
              className: entry.className,
              classAttr: `${entry.className} ${feedImage.placeholderName}`,
              tag: "div",
              attrs: ` role="img" aria-label="${escapeHtml(feedImage.placeholderName)}"`,
              box: roundRect(entry.placement.rect),
              style: `background-size: ${feedImage.fit}; background-position: center; background-repeat: no-repeat;${feedFilter(layer.opacity, feedImage.recolor)}`,
            }),
          );
          usedImagePlaceholders.add(feedImage.placeholderName);
          describe.push(
            `${layer.name} → feed ${feedImage.placeholderName}${feedImage.recolor ? ` (made ${feedImage.recolor})` : ""}`,
          );
          return;
        }

        if (layer.type === "image") {
          const visual = draft.summaries.get(key);
          const source = draft.pixels.get(key);
          if (!visual || !source) {
            return;
          }
          const className = elementClass(layer);
          const box = roundRect(visual.artRect);
          if (isSolidFill(visual.summary)) {
            add(
              path,
              element({
                className,
                tag: "div",
                box,
                style: `background-color: ${averageColor(visual.summary)};${filter}`,
              }),
            );
            describe.push(`${layer.name} → colour box`);
            return;
          }
          const data = encodeLayerPng(source);
          const fileName = `assets/psd/${createHash("sha1").update(data).digest("hex").slice(0, 12)}.png`;
          assets.set(fileName, { fileName, data });
          if (layer.clipBase !== undefined) {
            add(
              path,
              element({
                className,
                tag: "div",
                box,
                style: `background-image: url("${fileName}"); background-size: cover; background-position: center; background-repeat: no-repeat;${filter}`,
              }),
            );
            describe.push(
              `${layer.name} → ${fileName} in ${artboard.layers[layer.clipBase].name}`,
            );
            return;
          }
          add(
            path,
            element({
              className,
              tag: "img",
              attrs: ` src="${fileName}" alt=""`,
              box,
              style: filter.trim(),
              image: fileName,
            }),
          );
          describe.push(`${layer.name} → ${fileName}`);
          return;
        }

        if (layer.type === "shape" && (layer.shapeCss || layer.fill)) {
          const className = elementClass(layer);
          add(
            path,
            element({
              className,
              tag: "div",
              box: roundRect(layer.bounds),
              style: `${layer.shapeCss ?? `background-color: ${layer.fill};`}${filter}`,
            }),
          );
          describe.push(
            `${layer.name} → ${layer.shapeCss ? "CSS shape" : "colour box"}`,
          );
          return;
        }

        if (layer.type === "text" && layer.text?.trim()) {
          const isListLabel = listLabelIndexes.has(index);
          const field = isListLabel
            ? undefined
            : bindings.find(({ text }) => text === layer.text)?.placeholderName;
          const className =
            field && !used.has(field) ? field : elementClass(layer);
          used.add(className);
          if (field) {
            usedTextPlaceholders.add(field);
          }
          const centred = isCentred(layer, key);
          const text = textParts(
            layer,
            draft.fonts,
            Boolean(field) || isListLabel,
            centred,
          );
          add(
            path,
            element({
              className,
              tag: "div",
              attrs: field
                ? " data-font_autoscale"
                : isListLabel
                  ? " data-list-label"
                  : "",
              inner: field ? "" : textToHtml(layer.text),
              box: text.box,
              ink: layer.bounds,
              size: () => text.size,
              style: `${text.style}${filter}`,
              text: true,
              align: layer.align,
              feed: Boolean(field) || isListLabel,
              padding: listPadding.get(index),
              centred,
            }),
          );
          describe.push(
            `${JSON.stringify(layer.text.trim().slice(0, 30))} → ${field ? `feed ${field}` : "fixed copy"}${centred ? ` centred in ${layer.parent!.name}` : ""}`,
          );
        }
      });
      log?.(`Elements in ${artboardKey}: ${JSON.stringify(describe)}`);

      const css: string[] = [
        `.ad { position: relative; width: ${artboard.creativeWidth}px; height: ${artboard.creativeHeight}px; overflow: hidden; }`,
      ];
      const { html } = renderLayoutItems(roots, undefined, artboardSize, css);

      return {
        frame: artboard.frame,
        html: `<div class="ad">${html}</div>`,
        css: css.join("\n"),
      };
    });

    const scopeRoot = singleSize
      ? "#creative_container"
      : `#creative_container .psd-artboard[data-size="${size}"]`;
    const merged = mergeFrameLayouts(frameLayouts, scopeRoot, {
      unwrapRoot: true,
      allowPsdAssetUrls: true,
    });
    frameSets.push(...merged.frameSets);
    log?.(
      `${size} shared across frames: ${merged.shared.length > 0 ? merged.shared.join(", ") : "nothing (each frame keeps its own elements)"}`,
    );
    styles.push(merged.css);
    wrappers.push(
      singleSize
        ? merged.html
        : `<div class="psd-artboard" data-size="${escapeHtml(size)}">${merged.html}</div>`,
    );
  }

  return {
    html: wrappers.join("\n"),
    css: `${createArtboardCss(draft.artboards, singleSize)}\n${styles.join("\n")}`,
    assets: [...assets.values()],
    imagePlaceholders: [...usedImagePlaceholders],
    textPlaceholders: [...usedTextPlaceholders],
    listPlaceholders: [...usedListPlaceholders],
    frameSets,
  };
}

type Size = { width: number; height: number };

/** A PSD folder or element in a frame's layout tree. */
type LayoutItem = {
  className: string;
  classAttr: string;
  tag: "div" | "img";
  attrs: string;
  inner: string;
  /** CSS box in artboard pixels. */
  box: Rect;
  /** Text glyph bounds, used to find the shape a text sits on. */
  ink?: Rect;
  /** Width/height declarations for the given container. */
  size: (container: Size) => string;
  style: string;
  children: LayoutItem[];
  folder?: number;
  /** Fixed layout of a folder (vertically centred text). */
  layout?: string;
  /** Exported artwork shown by an <img>; becomes a background if the element gets children. */
  image?: string;
  text?: boolean;
  centred?: boolean;
  /** Text filled from the feed, so its length is unknown. */
  feed?: boolean;
  align?: "left" | "center" | "right";
  /** Width follows the content (a button padded around feed text). */
  grows?: boolean;
  /** Horizontal padding of the button around this label, shared by all labels of a list. */
  padding?: { left: number; right: number };
};

const round1 = (value: number) => Math.round(value * 10) / 10;

function sizeCss(rect: Rect, container?: Size): string {
  // Full-size boxes follow their container, which stays correct if it gets a border or padding.
  const size = (value: number, full?: number) =>
    full !== undefined && Math.abs(value - full) < 0.5 ? "100%" : `${value}px`;
  return `width: ${size(rect.width, container?.width)}; height: ${size(rect.height, container?.height)};`;
}

/**
 * Renders sibling items inside `parent` (undefined for the artboard) and returns their HTML plus the
 * layout declarations for the parent. Items that form one non-overlapping row or column become
 * relatively positioned flex items; otherwise they keep absolute positions.
 */
function renderLayoutItems(
  input: LayoutItem[],
  parent: Rect | undefined,
  container: Size,
  css: string[],
): { html: string; parentCss: string; grows: boolean } {
  const items = parent ? nestTextInShapes(input) : input;
  const origin = parent ?? { left: 0, top: 0, ...container };
  const flow =
    parent && !items.some(({ centred }) => centred)
      ? flowLayout(items, origin)
      : undefined;
  // Centred texts stack in a column, so they follow the artboard top to bottom, not the layer order.
  const centredByTop = items
    .filter(({ centred }) => centred)
    .sort((a, b) => a.box.top - b.box.top);
  const ordered = flow
    ? flow.ordered
    : items.map((item) => (item.centred ? centredByTop.shift()! : item));

  const html = ordered.map((item, index) => {
    // A folder of centre-aligned text, centred in its parent, spans the parent so the text stays centred.
    if (
      !flow &&
      item.folder !== undefined &&
      !item.layout &&
      hasOnlyCentredText(item) &&
      Math.abs(
        item.box.left + item.box.width / 2 - (origin.left + origin.width / 2),
      ) <= 2
    ) {
      const box = { ...item.box, left: origin.left, width: origin.width };
      item.box = box;
      item.size = (size) => sizeCss(box, size);
    }
    if (item.tag === "img" && item.children.length > 0) {
      item.tag = "div";
      item.attrs = "";
      item.style = `background-image: url("${item.image}"); background-size: 100% 100%; background-repeat: no-repeat; ${item.style}`;
    }
    const label =
      item.children.length === 1 && item.folder === undefined
        ? item.children[0]
        : undefined;
    if (label?.feed && label.ink) {
      // A button with feed text grows with it: padding from the PSD instead of a fixed width.
      const box = item.box;
      const left =
        label.padding?.left ?? Math.max(0, round1(label.ink.left - box.left));
      const right =
        label.padding?.right ??
        Math.max(
          0,
          round1(box.left + box.width - label.ink.left - label.ink.width),
        );
      item.size = (size) =>
        `min-width: ${box.width}px; ${sizeCss(box, size).replace(/^width: [^;]+;\s*/, "")}`;
      item.layout = `display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 0 ${right}px 0 ${left}px;`;
      label.centred = true;
      label.style = `white-space: nowrap; ${label.style}`;
      item.grows = true;
    }
    const inner = renderLayoutItems(item.children, item.box, item.box, css);
    if (item.folder !== undefined && inner.grows) {
      // A folder that only wraps a growing element grows with it.
      const box = item.box;
      item.size = (size) => sizeCss(box, size).replace(/^width: [^;]+;\s*/, "");
      item.grows = true;
    }
    const childLayout =
      item.layout ??
      (item.folder !== undefined || item.children.length > 0
        ? `display: flex;${inner.parentCss}`
        : "");
    const position = item.centred
      ? "position: relative;"
      : flow
        ? `position: relative; flex-shrink: 0;${flow.margins[index]}`
        : `position: absolute; left: ${round1(item.box.left - origin.left)}px; top: ${round1(item.box.top - origin.top)}px;`;
    css.push(
      `.${item.className} { ${[
        position,
        item.centred ? "" : item.size(container),
        item.style,
        childLayout,
      ]
        .filter(Boolean)
        .join(" ")} }`,
    );
    const open = `<${item.tag} class="${item.classAttr}"${item.attrs}>`;
    return item.tag === "img"
      ? open
      : `${open}${item.inner}${inner.html}</${item.tag}>`;
  });
  return {
    html: html.join(""),
    parentCss: flow?.parentCss ?? "",
    grows: ordered.length === 1 && Boolean(ordered[0].grows),
  };
}

/** True when every element in the subtree is centre-aligned text. */
function hasOnlyCentredText(item: LayoutItem): boolean {
  const leaves: LayoutItem[] = [];
  const collect = (node: LayoutItem) =>
    node.children.length === 0
      ? leaves.push(node)
      : node.children.forEach(collect);
  item.children.forEach(collect);
  return (
    leaves.length > 0 &&
    leaves.every((leaf) => leaf.text && leaf.align === "center")
  );
}

/** Inside a folder, moves each text onto the shape or image below it that contains it, e.g. a label on a button. */
function nestTextInShapes(items: LayoutItem[]): LayoutItem[] {
  const result = [...items];
  const contains = (outer: Rect, inner: Rect) =>
    inner.left >= outer.left - 1 &&
    inner.top >= outer.top - 1 &&
    inner.left + inner.width <= outer.left + outer.width + 1 &&
    inner.top + inner.height <= outer.top + outer.height + 1;
  for (const text of items) {
    if (!text.text || text.centred || !text.ink) {
      continue;
    }
    const index = result.indexOf(text);
    const host = result
      .slice(0, index)
      .filter(
        (item) =>
          !item.text &&
          item.folder === undefined &&
          contains(item.box, text.ink!),
      )
      .sort(
        (a, b) => a.box.width * a.box.height - b.box.width * b.box.height,
      )[0];
    if (host) {
      host.children.push(text);
      result.splice(index, 1);
    }
  }
  return result;
}

/** Flex row or column layout for items that do not overlap along one axis. */
function flowLayout(
  items: LayoutItem[],
  parent: Rect,
): { ordered: LayoutItem[]; margins: string[]; parentCss: string } | undefined {
  if (items.length === 0) {
    return undefined;
  }
  for (const axis of ["row", "column"] as const) {
    const [start, length, crossStart, crossLength] =
      axis === "row"
        ? (["left", "width", "top", "height"] as const)
        : (["top", "height", "left", "width"] as const);
    const ordered = [...items].sort((a, b) => a.box[start] - b.box[start]);
    const gaps = ordered.map((item, index) =>
      round1(
        index === 0
          ? item.box[start] - parent[start]
          : item.box[start] -
              (ordered[index - 1].box[start] + ordered[index - 1].box[length]),
      ),
    );
    if (gaps.slice(1).some((gap) => gap < -0.5)) {
      continue;
    }
    const last = ordered[ordered.length - 1];
    const between = gaps.slice(1);
    const evenGap =
      between.length > 0 &&
      between.every((gap) => Math.abs(gap - between[0]) < 0.5);
    // Text is centred by its glyphs; its CSS box also holds line-height and some spare width.
    const ink = (item: LayoutItem) => item.ink ?? item.box;
    const leading = ink(ordered[0])[start] - parent[start];
    const trailing =
      parent[start] + parent[length] - (ink(last)[start] + ink(last)[length]);
    const centredMain =
      leading > 0.5 &&
      Math.abs(leading - trailing) < 1 &&
      (between.length === 0 || evenGap);
    const crossOffsets = ordered.map((item) =>
      round1(item.box[crossStart] - parent[crossStart]),
    );
    const centredCross = ordered.every((item) => {
      const rect = ink(item);
      return (
        Math.abs(
          rect[crossStart] +
            rect[crossLength] / 2 -
            (parent[crossStart] + parent[crossLength] / 2),
        ) < 2
      );
    });
    const [mainMargin, crossMargin] =
      axis === "row"
        ? ["margin-left", "margin-top"]
        : ["margin-top", "margin-left"];
    const margins = ordered.map((_, index) => {
      const main = centredMain
        ? 0
        : index === 0
          ? gaps[0]
          : evenGap
            ? 0
            : gaps[index];
      const cross = centredCross ? 0 : crossOffsets[index];
      return [
        main ? ` ${mainMargin}: ${main}px;` : "",
        cross ? ` ${crossMargin}: ${cross}px;` : "",
      ].join("");
    });
    const parentCss = [
      axis === "column" ? " flex-direction: column;" : "",
      centredMain ? " justify-content: center;" : "",
      centredCross ? " align-items: center;" : " align-items: flex-start;",
      evenGap && between[0] > 0 ? ` gap: ${between[0]}px;` : "",
    ].join("");
    return { ordered, margins, parentCss };
  }
  return undefined;
}

/** Left edge and width of a text element, from the PSD bounds, box width and alignment. */
function textHorizontal(layer: PsdCodegenLayer): {
  left: number;
  width: number;
} {
  const width =
    Math.round((layer.boxWidth ?? layer.bounds.width * 1.1) * 10) / 10;
  const left =
    layer.align === "center"
      ? layer.bounds.left + layer.bounds.width / 2 - width / 2
      : layer.align === "right"
        ? layer.bounds.left + layer.bounds.width - width
        : layer.bounds.left;
  return { left, width };
}

/** CSS box of a text layer in artboard pixels: its line box rather than its glyph outlines. */
function textBox(layer: PsdCodegenLayer): Rect {
  const fontSize = layer.fontSize ?? 16;
  const lineHeight = layer.lineHeight ?? round1(fontSize * 1.2);
  // Photoshop bounds start at the glyph tops; CSS boxes start above them by half the leading plus the ascender gap.
  const top = round1(
    layer.bounds.top - (lineHeight - fontSize) / 2 - fontSize * 0.08,
  );
  const { left, width } = textHorizontal(layer);
  return {
    left: round1(left),
    top,
    width,
    height: round1(layer.bounds.top + layer.bounds.height - top),
  };
}

/** CSS box, size and style of a text layer; position is added by the layout. */
function textParts(
  layer: PsdCodegenLayer,
  fonts: PsdFontVariable[],
  fromFeed: boolean,
  centred: boolean,
): { box: Rect; size: string; style: string } {
  const fontSize = layer.fontSize ?? 16;
  const lineHeight = layer.lineHeight ?? round1(fontSize * 1.2);
  const fontVariable = matchFontVariable(layer.fontFamily, fonts);
  const box = textBox(layer);
  const { width } = box;
  // Box text wraps at the Photoshop box width; point text keeps its own line breaks.
  const isBox = layer.boxWidth !== undefined;
  const style = [
    isBox || fromFeed ? "" : "white-space: nowrap;",
    fontVariable
      ? `font-family: var(${fontVariable}), sans-serif;`
      : "font-family: sans-serif;",
    `font-size: ${fontSize}px;`,
    `font-weight: ${layer.fontWeight ?? 400};`,
    layer.italic ? "font-style: italic;" : "",
    // Unitless, so the spacing follows the font size when autoscale shrinks the text.
    `line-height: ${Math.round((lineHeight / fontSize) * 1000) / 1000};`,
    layer.letterSpacing ? `letter-spacing: ${layer.letterSpacing}em;` : "",
    layer.uppercase ? "text-transform: uppercase;" : "",
    layer.color ? `color: ${layer.color};` : "",
    layer.align && (layer.align !== "left" || !centred)
      ? `text-align: ${layer.align};`
      : "",
  ];
  const size = [
    isBox || (layer.align && layer.align !== "left")
      ? `width: ${width}px;`
      : `max-width: ${width}px;`,
    fromFeed
      ? `max-height: ${round1(Math.max(layer.bounds.height * 1.3, lineHeight))}px;`
      : "",
  ];
  return {
    box,
    size: size.filter(Boolean).join(" "),
    style: style.filter(Boolean).join(" "),
  };
}

/** The selected CO font variable whose family the PSD font name starts with, e.g. "AralV4-Bold" -> "Aral V4". */
function matchFontVariable(
  psdFont: string | undefined,
  fonts: PsdFontVariable[],
): string | undefined {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = normalize(psdFont ?? "");
  return (
    fonts.find(({ family }) => name && name.startsWith(normalize(family)))
      ?.variable ?? fonts[0]?.variable
  );
}

function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\r\n|\r|\n/)
    .map(escapeHtml)
    .join("<br>");
}

const DEFAULT_LAYER_NAME =
  /^(?:layer|rectangle|rounded rectangle|ellipse|polygon|triangle|line|shape|path|vector smart object|group|text|copy)(?: \d+)?(?: copy(?: \d+)?)*$/i;

/** Photoshop's automatic name: "Rectangle 20 copy 5", "Layer 3", or (for text) the start of its copy. */
function hasDefaultName(layer: PsdCodegenLayer): boolean {
  const name = layer.name.replace(/\s+/g, " ").trim();
  if (DEFAULT_LAYER_NAME.test(name)) {
    return true;
  }
  const text = layer.text?.replace(/\s+/g, " ").trim();
  return Boolean(text && name && text.startsWith(name));
}

/** What a layer does in its folder: its text, the background behind it, or another image/shape. */
function elementRole(
  layer: PsdCodegenLayer,
  folder: number,
  artboard: PsdCodegenArtboard,
): string {
  if (layer.type === "text") {
    return "text";
  }
  const box = layer.bounds;
  const contains = (inner: Rect) =>
    inner.left >= box.left - 1 &&
    inner.top >= box.top - 1 &&
    inner.left + inner.width <= box.left + box.width + 1 &&
    inner.top + inner.height <= box.top + box.height + 1;
  const holdsText = artboard.layers.some(
    (other) =>
      other.type === "text" &&
      other.folders?.at(-1) === folder &&
      contains(other.bounds),
  );
  const folderBox = artboard.folders[folder].box;
  const fillsFolder =
    folderBox !== undefined &&
    Math.abs(box.width - folderBox.width) <= 1 &&
    Math.abs(box.height - folderBox.height) <= 1;
  return holdsText || fillsFolder
    ? "bg"
    : layer.type === "image"
      ? "img"
      : "shape";
}

/** Lowercase snake_case class from a layer name, unique within `used`. */
function layerClass(name: string, used: Set<string>): string {
  const snake = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  const base = /^[a-z]/.test(snake) ? snake : `layer_${snake || "item"}`;
  let className = base;
  for (let index = 2; used.has(className); index++) {
    className = `${base}_${index}`;
  }
  used.add(className);
  return className;
}

type Rgb = { r: number; g: number; b: number };

/** Colour of a single-colour layer (e.g. a white icon); undefined when it has several colours. */
function layerInkColor(source: LayerPixels | undefined): Rgb | undefined {
  if (!source) {
    return undefined;
  }
  const { data, width, maxValue, crop } = source;
  const toByte = 255 / maxValue;
  const colours: Rgb[] = [];
  for (let y = crop.y; y < crop.y + crop.height; y++) {
    for (let x = crop.x; x < crop.x + crop.width; x++) {
      const index = (y * width + x) * 4;
      // Only clearly visible pixels; anti-aliased edges blend with whatever is behind them.
      if (data[index + 3] * toByte > 128) {
        colours.push({
          r: data[index] * toByte,
          g: data[index + 1] * toByte,
          b: data[index + 2] * toByte,
        });
      }
    }
  }
  if (colours.length === 0) {
    return undefined;
  }
  const average = {
    r: colours.reduce((sum, { r }) => sum + r, 0) / colours.length,
    g: colours.reduce((sum, { g }) => sum + g, 0) / colours.length,
    b: colours.reduce((sum, { b }) => sum + b, 0) / colours.length,
  };
  const close = colours.filter(
    (colour) => colourDistance(colour, average) <= 48,
  ).length;
  return close / colours.length >= 0.97 ? average : undefined;
}

const NAMED_COLOURS: Record<string, Rgb> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
};

/**
 * Colour of a single-colour SVG from its fill/stroke/stop-color values; SVG paints black when none is
 * set. Undefined when it uses several colours.
 */
export function svgInkColor(svg: string): Rgb | undefined {
  const values = [
    ...svg.matchAll(
      /\b(?:fill|stroke|stop-color)\s*(?:=\s*["']|:\s*)([^"';}>]+)/gi,
    ),
  ].map(([, value]) => value.trim().toLowerCase());
  const colours = values
    .filter(
      (value) =>
        !["none", "transparent", "inherit"].includes(value) &&
        !value.startsWith("url("),
    )
    .map((value) => {
      if (value === "currentcolor") {
        return NAMED_COLOURS.black;
      }
      if (NAMED_COLOURS[value]) {
        return NAMED_COLOURS[value];
      }
      const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value)?.[1];
      if (hex) {
        const full =
          hex.length === 3
            ? [...hex].map((digit) => digit + digit).join("")
            : hex;
        return {
          r: parseInt(full.slice(0, 2), 16),
          g: parseInt(full.slice(2, 4), 16),
          b: parseInt(full.slice(4, 6), 16),
        };
      }
      const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(value);
      return rgb
        ? { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
        : null;
    });
  if (colours.includes(null)) {
    return undefined;
  }
  const known = colours as Rgb[];
  if (known.length === 0) {
    return NAMED_COLOURS.black;
  }
  return known.every((colour) => colourDistance(colour, known[0]) <= 24)
    ? known[0]
    : undefined;
}

function colourDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** SVG feed fields that need recolouring to match a white or black single-colour PSD layer. */
function svgRecolors(
  source: LayerPixels | undefined,
  svgInks: Map<string, Rgb | undefined>,
): Record<string, SvgRecolor> {
  const ink = layerInkColor(source);
  const target: SvgRecolor | undefined = !ink
    ? undefined
    : Math.min(ink.r, ink.g, ink.b) >= 225
      ? "white"
      : Math.max(ink.r, ink.g, ink.b) <= 30
        ? "black"
        : undefined;
  if (!target) {
    return {};
  }
  return Object.fromEntries(
    [...svgInks]
      .filter(
        ([, svgInk]) =>
          svgInk && colourDistance(svgInk, NAMED_COLOURS[target]) > 60,
      )
      .map(([field]) => [field, target]),
  );
}

/** CSS filter of a feed image: layer opacity and an optional recolour of a single-colour SVG. */
function feedFilter(opacity: number, recolor?: SvgRecolor): string {
  const filters = [
    // brightness(0) makes every visible pixel black; invert(1) then turns it white.
    recolor === "white"
      ? "brightness(0) invert(1)"
      : recolor === "black"
        ? "brightness(0)"
        : "",
    opacity < 1 ? `opacity(${Math.round(opacity * 100) / 100})` : "",
  ].filter(Boolean);
  return filters.length > 0 ? ` filter: ${filters.join(" ")};` : "";
}

function averageColor(summary: PixelSummary): string {
  const channels = [0, 1, 2].map((channel) => {
    const values = summary.signature.filter(
      (_, index) => index % 4 === channel,
    );
    return Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    );
  });
  return `rgb(${channels.join(", ")})`;
}

function encodeLayerPng({ data, width, maxValue, crop }: LayerPixels): Buffer {
  const png = new PNG({ width: crop.width, height: crop.height });
  const toByte = 255 / maxValue;
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const source = ((crop.y + y) * width + crop.x + x) * 4;
      const target = (y * crop.width + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        png.data[target + channel] = Math.max(
          0,
          Math.min(255, Math.round(data[source + channel] * toByte)),
        );
      }
    }
  }
  return PNG.sync.write(png);
}

function createArtboardCss(
  artboards: PsdCodegenArtboard[],
  singleSize: boolean,
): string {
  const hidden =
    "#creative_container [data-frames] { opacity: 0; visibility: hidden; }";
  if (singleSize) {
    return hidden;
  }
  const sizes = [
    ...new Map(artboards.map((artboard) => [artboard.size, artboard])).values(),
  ];
  return [
    "#creative_container { position: relative; overflow: hidden; }",
    "#creative_container .psd-artboard { display: none; position: absolute; top: 0; left: 0; overflow: hidden; }",
    hidden,
    ...sizes.map(
      (artboard) =>
        `#creative_container .psd-artboard[data-size="${artboard.size}"] { width: ${artboard.creativeWidth}px; height: ${artboard.creativeHeight}px; }`,
    ),
    ...sizes.map(
      (artboard) =>
        `@media (width: ${artboard.creativeWidth}px) and (height: ${artboard.creativeHeight}px) {\n  #creative_container .psd-artboard[data-size="${artboard.size}"] {\n    display: block;\n  }\n}`,
    ),
  ].join("\n");
}

function getArtboardLayers(psd: Psd): ArtboardLayer[] {
  const roots: Layer[] = [];
  const collect = (layers: Layer[]) => {
    for (const layer of layers) {
      if (layer.artboard?.rect) {
        roots.push(layer);
      }
      if (layer.children) {
        collect(layer.children);
      }
    }
  };
  collect(psd.children ?? []);

  return roots.length > 0
    ? roots.map((layer) => ({ layer, children: layer.children ?? [] }))
    : [{ layer: null, children: psd.children ?? [] }];
}

function getLayerBounds(layer: Layer, artboard: PsdArtboard): Rect | null {
  const left = layer.left ?? layer.text?.left ?? artboard.left;
  const top = layer.top ?? layer.text?.top ?? artboard.top;
  const right =
    layer.right ?? layer.text?.right ?? left + (layer.imageData?.width ?? 0);
  const bottom =
    layer.bottom ?? layer.text?.bottom ?? top + (layer.imageData?.height ?? 0);
  return { left, top, width: right - left, height: bottom - top };
}

function justificationToAlign(
  justification: string | undefined,
): "left" | "center" | "right" | undefined {
  if (!justification) {
    return undefined;
  }
  return justification.includes("center")
    ? "center"
    : justification.includes("right")
      ? "right"
      : "left";
}

/**
 * A rectangle, rounded rectangle or ellipse drawn with Photoshop's shape tools, with a solid fill
 * and/or solid stroke and no effects, as CSS. Anything else is exported as artwork.
 */
function liveShape(
  layer: Layer,
  scale: number,
): { box: DocRect; css: string; opaque: boolean } | undefined {
  type Unit = { value?: number } | undefined;
  const origins = (
    layer.vectorOrigination as
      | { keyDescriptorList?: Record<string, any>[] }
      | undefined
  )?.keyDescriptorList;
  if (!origins || origins.length !== 1) {
    return undefined;
  }
  const origin = origins[0];
  // keyOriginType: 1 rectangle, 2 rounded rectangle, 5 ellipse.
  const type = origin.keyOriginType as number;
  const transform = origin.transform as number[] | undefined;
  if (
    ![1, 2, 5].includes(type) ||
    (transform &&
      (Math.abs(transform[1]) > 1e-6 || Math.abs(transform[2]) > 1e-6))
  ) {
    return undefined;
  }
  const bbox = origin.keyOriginShapeBoundingBox as
    | Record<string, Unit>
    | undefined;
  const box = {
    left: bbox?.left?.value ?? NaN,
    top: bbox?.top?.value ?? NaN,
    right: bbox?.right?.value ?? NaN,
    bottom: bbox?.bottom?.value ?? NaN,
  };
  if (
    !Object.values(box).every(Number.isFinite) ||
    box.right <= box.left ||
    box.bottom <= box.top
  ) {
    return undefined;
  }
  if (
    hasVisibleEffects(layer) ||
    (layer.fillOpacity !== undefined && layer.fillOpacity < 1)
  ) {
    return undefined;
  }

  const stroke = layer.vectorStroke;
  const fillOn = stroke?.fillEnabled !== false;
  const fill = fillOn ? vectorFillColor(layer.vectorFill) : undefined;
  if (fillOn && !fill) {
    return undefined;
  }
  let border = "";
  const strokeWidth = stroke?.strokeEnabled
    ? (stroke.lineWidth?.value ?? 0)
    : 0;
  if (strokeWidth > 0) {
    const content = stroke!.content as
      | { type?: string; color?: unknown }
      | undefined;
    const color =
      content?.type === "color" ? colorToCss(content.color) : undefined;
    if (!color || (stroke!.lineDashSet?.length ?? 0) > 0) {
      return undefined;
    }
    border = `border: ${round1(strokeWidth * scale)}px solid ${color}; box-sizing: border-box;`;
  }
  if (!fill && !border) {
    return undefined;
  }

  let radius = "";
  if (type === 5) {
    radius = "border-radius: 50%;";
  } else if (type === 2) {
    const radii = origin.keyOriginRRectRadii as
      | Record<string, Unit>
      | undefined;
    const max =
      (Math.min(box.right - box.left, box.bottom - box.top) * scale) / 2;
    const corner = (value: Unit) =>
      round1(Math.min(max, (value?.value ?? 0) * scale));
    const corners = [
      radii?.topLeft,
      radii?.topRight,
      radii?.bottomRight,
      radii?.bottomLeft,
    ].map(corner);
    radius = corners.every((value) => value === corners[0])
      ? `border-radius: ${corners[0]}px;`
      : `border-radius: ${corners.join("px ")}px;`;
  }
  return {
    box,
    css: [fill ? `background-color: ${fill};` : "", border, radius]
      .filter(Boolean)
      .join(" "),
    opaque: Boolean(fill) && type === 1,
  };
}

function colorToCss(color: unknown): string | undefined {
  if (!color || typeof color !== "object") {
    return undefined;
  }
  const value = color as Record<string, number>;
  if (
    Number.isFinite(value.r) &&
    Number.isFinite(value.g) &&
    Number.isFinite(value.b)
  ) {
    return `rgb(${Math.round(value.r)}, ${Math.round(value.g)}, ${Math.round(value.b)})`;
  }
  if (
    Number.isFinite(value.fr) &&
    Number.isFinite(value.fg) &&
    Number.isFinite(value.fb)
  ) {
    return `rgb(${Math.round(value.fr * 255)}, ${Math.round(value.fg * 255)}, ${Math.round(value.fb * 255)})`;
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
