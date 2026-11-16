import { PNG } from "pngjs";

const GRID = 8;
const ALPHA_THRESHOLD = 16;
const ASPECT_PENALTY = 40;
const UNIFORM_RANGE = 12;
const STRONG_MATCH = 10;

export type PixelRegion = { x: number; y: number; width: number; height: number };

export type PixelSummary = {
  width: number;
  height: number;
  /** Opaque bounding box in source pixels, within the summarized region. */
  trim: PixelRegion;
  /** Share of opaque pixels inside the trim box; low values mean a cut-out such as a logo. */
  opaqueRatio: number;
  uniform: boolean;
  signature: number[];
};

export type ImageLayerSource = {
  key: string;
  layerName: string;
  frame: number;
  summary?: PixelSummary;
};

export type FeedImageSource = {
  placeholderName: string;
  summary?: PixelSummary;
};

export type FeedImageMatch = {
  key: string;
  placeholderName: string;
  method: "name" | "pixels" | "layer-name" | "frame-hint";
  distance?: number;
  /** For "layer-name" matches: the same-named layer the match was copied from. */
  sourceKey?: string;
};

export type FeedImageScore = {
  key: string;
  layerName: string;
  skipped?: string;
  distances: Record<string, number>;
};

export function summarizeRgba(
  data: ArrayLike<number>,
  width: number,
  height: number,
  maxValue = 255,
  region: PixelRegion = { x: 0, y: 0, width, height },
): PixelSummary | undefined {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return undefined;
  }
  const toByte = 255 / maxValue;
  const startX = Math.max(0, Math.floor(region.x));
  const startY = Math.max(0, Math.floor(region.y));
  const endX = Math.min(width, Math.ceil(region.x + region.width));
  const endY = Math.min(height, Math.ceil(region.y + region.height));

  let minX = endX;
  let minY = endY;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;
  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      if (data[(y * width + x) * 4 + 3] * toByte > ALPHA_THRESHOLD) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        opaque++;
      }
    }
  }
  if (maxX < 0) {
    return undefined;
  }

  const trim = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const sums = new Array(GRID * GRID * 4).fill(0);
  const counts = new Array(GRID * GRID).fill(0);
  for (let y = trim.y; y <= maxY; y++) {
    const row = Math.min(GRID - 1, Math.floor(((y - trim.y) * GRID) / trim.height));
    for (let x = trim.x; x <= maxX; x++) {
      const column = Math.min(
        GRID - 1,
        Math.floor(((x - trim.x) * GRID) / trim.width),
      );
      const index = (y * width + x) * 4;
      const alpha = (data[index + 3] * toByte) / 255;
      const cell = row * GRID + column;
      // Composite over white so transparent areas compare consistently.
      for (let channel = 0; channel < 3; channel++) {
        sums[cell * 4 + channel] +=
          data[index + channel] * toByte * alpha + 255 * (1 - alpha);
      }
      sums[cell * 4 + 3] += alpha * 255;
      counts[cell]++;
    }
  }
  const signature = sums.map((sum, index) =>
    Math.round(sum / Math.max(1, counts[Math.floor(index / 4)])),
  );

  return {
    width,
    height,
    trim,
    opaqueRatio: opaque / (trim.width * trim.height),
    uniform: [0, 1, 2, 3].every((channel) => {
      const values = signature.filter((_, index) => index % 4 === channel);
      return Math.max(...values) - Math.min(...values) <= UNIFORM_RANGE;
    }),
    signature,
  };
}

export function summarizePng(data: Buffer): PixelSummary | undefined {
  try {
    const png = PNG.sync.read(data);
    return summarizeRgba(png.data, png.width, png.height);
  } catch {
    return undefined;
  }
}

export function signatureDistance(a: PixelSummary, b: PixelSummary): number {
  let total = 0;
  for (let index = 0; index < a.signature.length; index++) {
    total += Math.abs(a.signature[index] - b.signature[index]);
  }
  const aspectA = a.trim.width / a.trim.height;
  const aspectB = b.trim.width / b.trim.height;
  return (
    total / a.signature.length +
    ASPECT_PENALTY * Math.abs(Math.log(aspectA / aspectB))
  );
}

/** Frames named in a feed field, e.g. "hero_f1-2_URL" or "frame3_icon" -> [1, 2] / [3]; undefined when unrestricted. */
export function getFrameHint(placeholderName: string): number[] | undefined {
  const match =
    /(?:^|[_\s-])(?:f|fr|frame)[_\s-]?(\d+)(?:\s*(?:-|to)\s*(\d+))?(?=[_\s-]|$)/i.exec(
      placeholderName,
    );
  if (!match) {
    return undefined;
  }
  const first = Number(match[1]);
  const last = Number(match[2] ?? match[1]);
  return Array.from(
    { length: Math.max(0, last - first) + 1 },
    (_, index) => first + index,
  );
}

export function matchFeedImages(
  layers: ImageLayerSource[],
  feeds: FeedImageSource[],
  maxDistance = 50,
  maxHintedDistance = 110,
): { matches: FeedImageMatch[]; scores: FeedImageScore[] } {
  const matches: FeedImageMatch[] = [];
  const matchedKeys = new Set<string>();
  const usedInFrame = new Set<string>();
  const hints = new Map(
    feeds.map(({ placeholderName }) => [
      placeholderName,
      getFrameHint(placeholderName),
    ]),
  );
  // Layers that clearly show a feed image become extra references for that image.
  const references = new Map(
    feeds.map(({ placeholderName, summary }) => [
      placeholderName,
      summary ? [summary] : [],
    ]),
  );
  // Keys are "size|frame|index"; each artboard (size and frame) uses a feed image at most once.
  const artboardOf = (layer: ImageLayerSource) => layer.key.split("|").slice(0, -1).join("|");
  const assign = (layer: ImageLayerSource, match: FeedImageMatch) => {
    matches.push(match);
    matchedKeys.add(layer.key);
    usedInFrame.add(`${artboardOf(layer)}|${match.placeholderName}`);
    if (
      layer.summary &&
      !layer.summary.uniform &&
      (match.distance ?? 0) <= STRONG_MATCH
    ) {
      references.get(match.placeholderName)!.push(layer.summary);
    }
  };
  const allowed = (layer: ImageLayerSource, placeholderName: string) =>
    !usedInFrame.has(`${artboardOf(layer)}|${placeholderName}`) &&
    (hints.get(placeholderName)?.includes(layer.frame) ?? true);
  const distanceTo = (layer: ImageLayerSource, placeholderName: string) =>
    Math.min(
      ...references
        .get(placeholderName)!
        .map((reference) => signatureDistance(layer.summary!, reference)),
    );

  for (const layer of layers) {
    const byName = feeds.find(
      ({ placeholderName }) =>
        normalizeName(placeholderName) === normalizeName(layer.layerName),
    );
    if (byName) {
      assign(layer, {
        key: layer.key,
        placeholderName: byName.placeholderName,
        method: "name",
      });
    }
  }

  const comparable = layers.filter(
    (layer) => layer.summary && !layer.summary.uniform,
  );
  while (true) {
    const candidates = comparable
      .filter((layer) => !matchedKeys.has(layer.key))
      .flatMap((layer) =>
        feeds
          .filter(
            ({ placeholderName }) =>
              references.get(placeholderName)!.length > 0 &&
              allowed(layer, placeholderName),
          )
          .map(({ placeholderName }) => ({
            layer,
            placeholderName,
            distance: distanceTo(layer, placeholderName),
          })),
      )
      .filter(
        ({ placeholderName, distance }) =>
          distance <=
          (hints.get(placeholderName) ? maxHintedDistance : maxDistance),
      )
      .sort((a, b) => a.distance - b.distance);
    const best = candidates[0];
    if (!best) {
      break;
    }
    assign(best.layer, {
      key: best.layer.key,
      placeholderName: best.placeholderName,
      method: "pixels",
      distance: round(best.distance),
    });
  }

  // A layer reused across frames under the same name shows the same asset.
  for (const layer of comparable) {
    if (matchedKeys.has(layer.key)) {
      continue;
    }
    const sibling = matches.find(
      (match) =>
        layers.find(({ key }) => key === match.key)?.layerName ===
          layer.layerName && allowed(layer, match.placeholderName),
    );
    if (sibling) {
      assign(layer, {
        key: layer.key,
        placeholderName: sibling.placeholderName,
        method: "layer-name",
        sourceKey: sibling.key,
      });
    }
  }

  // Feed images without decodable pixels (e.g. SVG) can still be paired via their frame hint.
  for (const { placeholderName } of feeds) {
    const frames = hints.get(placeholderName);
    if (!frames || references.get(placeholderName)!.length > 0) {
      continue;
    }
    for (const frame of frames) {
      const inFrame = comparable.filter(
        (layer) =>
          layer.frame === frame &&
          !matchedKeys.has(layer.key) &&
          allowed(layer, placeholderName),
      );
      for (const artboard of new Set(inFrame.map(artboardOf))) {
        const open = inFrame.filter((layer) => artboardOf(layer) === artboard);
        const named = open.filter((layer) =>
          sharesNameToken(placeholderName, layer.layerName),
        );
        const layer = named.length === 1 ? named[0] : open.length === 1 ? open[0] : undefined;
        if (layer) {
          assign(layer, { key: layer.key, placeholderName, method: "frame-hint" });
        }
      }
    }
  }

  const scores = layers.map((layer) => ({
    key: layer.key,
    layerName: layer.layerName,
    ...(!layer.summary
      ? { skipped: "no visible pixels" }
      : layer.summary.uniform
        ? { skipped: "flat colour" }
        : {}),
    distances: layer.summary
      ? Object.fromEntries(
          feeds
            .filter(({ placeholderName }) => references.get(placeholderName)!.length > 0)
            .map(({ placeholderName }) => [
              placeholderName,
              round(distanceTo(layer, placeholderName)),
            ]),
        )
      : {},
  }));

  return { matches, scores };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

type Rect = { left: number; top: number; width: number; height: number };

/** Trims edge bands of an image that opaque layers above it cover completely. */
export function cropOccludedEdges(rect: Rect, occluders: Rect[]): Rect {
  let left = rect.left;
  let top = rect.top;
  let right = rect.left + rect.width;
  let bottom = rect.top + rect.height;
  let changed = true;
  while (changed) {
    changed = false;
    for (const occluder of occluders) {
      const oRight = occluder.left + occluder.width;
      const oBottom = occluder.top + occluder.height;
      const spansWidth = occluder.left <= left && oRight >= right;
      const spansHeight = occluder.top <= top && oBottom >= bottom;
      if (spansWidth && occluder.top <= top && oBottom > top && oBottom < bottom) {
        top = oBottom;
        changed = true;
      } else if (spansWidth && oBottom >= bottom && occluder.top < bottom && occluder.top > top) {
        bottom = occluder.top;
        changed = true;
      } else if (spansHeight && occluder.left <= left && oRight > left && oRight < right) {
        left = oRight;
        changed = true;
      } else if (spansHeight && oRight >= right && occluder.left < right && occluder.left > left) {
        right = occluder.left;
        changed = true;
      }
    }
  }
  return { left, top, width: right - left, height: bottom - top };
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Descriptive class for a feed image element, e.g. "hero_image_f1-2_URL" -> "hero_img"; unique within `used`. */
export function imageRoleClass(placeholderName: string, used: Set<string>): string {
  const word = nameTokens(placeholderName).find((token) => /^[a-z]/.test(token));
  const base = `${word ?? "feed"}_img`;
  let name = base;
  for (let index = 2; used.has(name); index++) {
    name = `${base}_${index}`;
  }
  used.add(name);
  return name;
}

const GENERIC_TOKENS = new Set(["url", "image", "img", "png", "jpg", "jpeg", "svg", "copy", "layer", "psd", "and"]);

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length >= 3 &&
        !GENERIC_TOKENS.has(token) &&
        !/^(?:f|fr|frame)?\d+$/.test(token),
    );
}

/** True when any meaningful word of both names starts the same way, e.g. "icon" and "ico". */
export function sharesNameToken(a: string, b: string): boolean {
  const right = nameTokens(b);
  return nameTokens(a).some((left) =>
    right.some((token) => {
      const length = Math.min(left.length, token.length);
      return length >= 3 && left.slice(0, length) === token.slice(0, length);
    }),
  );
}
