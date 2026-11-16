import * as fs from "fs";
import * as path from "path";
import { PNG } from "pngjs";
import { initializeCanvas, readPsd, type PixelData, type Psd } from "ag-psd";

initializeCanvas(
  () => {
    throw new Error("Canvas rendering is unavailable in the extension host.");
  },
  (width, height) =>
    ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }) as never,
);

export type PsdAnalysis = {
  dimensions: string[];
  dimensionCount: number;
  frameCount: number;
  fonts: string[];
};

export type PsdStoryboardPreview = {
  width: number;
  height: number;
  frame: number;
  previewDataUrl: string;
};

export type PsdArtboard = {
  left: number;
  top: number;
  width: number;
  height: number;
  frame: number;
};

function collectArtboardSizes(
  layers: NonNullable<Psd["children"]>,
  sizes: Set<string>,
  namedDimensions: Set<string>,
  namedFrames: Set<number>,
  fonts: Set<string>,
): void {
  for (const layer of layers) {
    const dimensionMatch = /\b(\d{2,5})\s*x\s*(\d{2,5})\b/i.exec(
      layer.name ?? "",
    );

    if (dimensionMatch) {
      namedDimensions.add(
        `${Number(dimensionMatch[1])}x${Number(dimensionMatch[2])}`,
      );
    }

    const frameMatch = /\bframe[\s_-]*(\d+)\b/i.exec(layer.name ?? "");
    if (frameMatch) {
      namedFrames.add(Number(frameMatch[1]));
    }

    const addFont = (name?: string) => {
      const font = name?.trim();
      if (font) {
        fonts.add(font);
      }
    };

    addFont(layer.text?.style?.font?.name);
    layer.text?.styleRuns?.forEach((styleRun) =>
      addFont(styleRun.style.font?.name),
    );

    const rect = layer.artboard?.rect;

    if (rect) {
      const width = rect.right - rect.left;
      const height = rect.bottom - rect.top;

      if (width > 0 && height > 0) {
        sizes.add(`${width}x${height}`);
      }
    }

    if (layer.children) {
      collectArtboardSizes(
        layer.children,
        sizes,
        namedDimensions,
        namedFrames,
        fonts,
      );
    }
  }
}

export function summarizePsd(psd: Psd): PsdAnalysis {
  const dimensionSizes = new Set<string>();
  const namedDimensions = new Set<string>();
  const namedFrames = new Set<number>();
  const fonts = new Set<string>();
  collectArtboardSizes(
    psd.children ?? [],
    dimensionSizes,
    namedDimensions,
    namedFrames,
    fonts,
  );

  const artboardCount = Math.max(0, psd.artboards?.count ?? 0);
  const detectedDimensions =
    dimensionSizes.size > 0
      ? dimensionSizes
      : namedDimensions.size > 0
        ? namedDimensions
        : new Set([`${psd.width}x${psd.height}`]);
  const dimensions = [...detectedDimensions];
  const dimensionCount =
    dimensionSizes.size > 0 || namedDimensions.size > 0
      ? dimensions.length
      : artboardCount || dimensions.length || 1;

  const animationFrameCount =
    psd.imageResources?.animations?.frames.length ?? 0;
  const layerCompCount = psd.imageResources?.layerComps?.list.length ?? 0;

  return {
    dimensions,
    dimensionCount,
    frameCount: animationFrameCount || namedFrames.size || layerCompCount || 1,
    fonts: [...fonts].sort((a, b) => a.localeCompare(b)),
  };
}

export function analyzePsdBuffer(buffer: Buffer): PsdAnalysis {
  const psd = readPsd(buffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
  });

  return summarizePsd(psd);
}

export function analyzePsdBufferWithPreviews(
  buffer: Buffer,
): PsdAnalysis & { storyboards: PsdStoryboardPreview[] } {
  const psd = readPsdWithComposite(buffer);

  return {
    ...summarizePsd(psd),
    storyboards: createPsdStoryboardPreviews(psd),
  };
}

export function createPsdStoryboardPreviews(
  psd: Psd,
  maxPreviewSize = 360,
): PsdStoryboardPreview[] {
  const imageData = getCompositePixels(psd);

  return getPsdArtboards(psd).map((artboard) => {
    const cropped = cropPixels(imageData, artboard);
    const scale = Math.min(
      1,
      maxPreviewSize / Math.max(artboard.width, artboard.height),
    );
    const previewWidth = Math.max(1, Math.round(artboard.width * scale));
    const previewHeight = Math.max(1, Math.round(artboard.height * scale));
    const previewPixels = resizePixels(
      cropped,
      artboard.width,
      artboard.height,
      previewWidth,
      previewHeight,
    );

    return {
      width: artboard.width,
      height: artboard.height,
      frame: artboard.frame,
      previewDataUrl: `data:image/png;base64,${encodePng(previewPixels, previewWidth, previewHeight).toString("base64")}`,
    };
  });
}

export function writePsdStoryboardImages(
  buffer: Buffer,
  outputFolder: string,
  is2x: boolean,
): string[] {
  return writePsdStoryboardImagesFromDocument(
    readPsdWithComposite(buffer),
    outputFolder,
    is2x,
  );
}

export function writePsdStoryboardImagesFromDocument(
  psd: Psd,
  outputFolder: string,
  is2x: boolean,
): string[] {
  const imageData = getCompositePixels(psd);
  fs.mkdirSync(outputFolder, { recursive: true });

  return getPsdArtboards(psd).map((artboard) => {
    const width = is2x ? artboard.width / 2 : artboard.width;
    const height = is2x ? artboard.height / 2 : artboard.height;
    const fileName = `${width}x${height}-frame${artboard.frame}.png`;
    const image = cropPixels(imageData, artboard);
    fs.writeFileSync(
      path.join(outputFolder, fileName),
      encodePng(image, artboard.width, artboard.height),
    );
    return fileName;
  });
}

function readPsdWithComposite(buffer: Buffer): Psd {
  return readPsd(buffer, {
    skipLayerImageData: true,
    skipCompositeImageData: false,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    useImageData: true,
  });
}

function getCompositePixels(psd: Psd): PixelData {
  if (!psd.imageData) {
    throw new Error("This PSD does not contain a flattened composite image.");
  }
  return psd.imageData;
}

export function getPsdArtboards(psd: Psd): PsdArtboard[] {
  const artboards: (Omit<PsdArtboard, "frame"> & { frame?: number })[] = [];

  const collect = (layers: NonNullable<Psd["children"]>) => {
    for (const layer of layers) {
      const rect = layer.artboard?.rect;
      if (rect) {
        const left = Math.round(rect.left);
        const top = Math.round(rect.top);
        const width = Math.round(rect.right - rect.left);
        const height = Math.round(rect.bottom - rect.top);
        if (width > 0 && height > 0) {
          const frameMatch = /\bframe[\s_-]*(\d+)\b/i.exec(layer.name ?? "");
          artboards.push({
            left,
            top,
            width,
            height,
            frame: frameMatch ? Number(frameMatch[1]) : undefined,
          });
        }
      }
      if (layer.children) {
        collect(layer.children);
      }
    }
  };

  collect(psd.children ?? []);
  if (artboards.length === 0) {
    artboards.push({ left: 0, top: 0, width: psd.width, height: psd.height });
  }

  const frameCounts = new Map<string, number>();
  return artboards.map((artboard) => {
    const key = `${artboard.width}x${artboard.height}`;
    const frame = artboard.frame ?? (frameCounts.get(key) ?? 0) + 1;
    frameCounts.set(key, Math.max(frameCounts.get(key) ?? 0, frame));
    return { ...artboard, frame };
  });
}

function cropPixels(imageData: PixelData, artboard: PsdArtboard): Buffer {
  const pixels = Buffer.alloc(artboard.width * artboard.height * 4);
  const source = imageData.data;
  const sourceLeft = Math.max(0, artboard.left);
  const sourceTop = Math.max(0, artboard.top);
  const sourceRight = Math.min(imageData.width, artboard.left + artboard.width);
  const sourceBottom = Math.min(
    imageData.height,
    artboard.top + artboard.height,
  );

  for (let y = sourceTop; y < sourceBottom; y++) {
    for (let x = sourceLeft; x < sourceRight; x++) {
      const sourceIndex = (y * imageData.width + x) * 4;
      const targetIndex =
        ((y - artboard.top) * artboard.width + (x - artboard.left)) * 4;
      for (let channel = 0; channel < 4; channel++) {
        pixels[targetIndex + channel] = to8Bit(
          source[sourceIndex + channel],
          source,
        );
      }
    }
  }

  return pixels;
}

function to8Bit(value: number, source: PixelData["data"]): number {
  if (source instanceof Uint16Array) {
    return Math.max(0, Math.min(255, Math.round(value / 257)));
  }
  if (source instanceof Float32Array) {
    return Math.max(0, Math.min(255, Math.round(value * 255)));
  }
  return Math.max(0, Math.min(255, Math.round(value)));
}

function resizePixels(
  source: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
): Buffer {
  if (sourceWidth === width && sourceHeight === height) {
    return source;
  }

  const target = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(
      sourceHeight - 1,
      Math.floor((y * sourceHeight) / height),
    );
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(
        sourceWidth - 1,
        Math.floor((x * sourceWidth) / width),
      );
      const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
      const targetIndex = (y * width + x) * 4;
      source.copy(target, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return target;
}

function encodePng(data: Buffer, width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  data.copy(png.data);
  return PNG.sync.write(png);
}
