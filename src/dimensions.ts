type Size = { width: number; height: number };

export const STANDARD_AD_DIMENSIONS = [
  { size: "300x250", label: "Medium Rectangle" },
  { size: "300x600", label: "Half Page" },
  { size: "160x600", label: "Wide Skyscraper" },
  { size: "728x90", label: "Leaderboard" },
  { size: "970x250", label: "Billboard" },
  { size: "320x50", label: "Mobile Banner" },
];

export type PsdDimensionSelection = {
  dimensionType: "single" | "responsive";
  selectedDimensions: string[];
  customDimensions: { width: string; height: string }[];
};

/** A PSD is probably designed at 2x when its sizes halved are standard ad sizes, but not as they are. */
export function detectPsd2x(dimensions: string[]): boolean {
  const standardSizes = new Set(STANDARD_AD_DIMENSIONS.map(({ size }) => size));
  const sizes = dimensions.flatMap((dimension) => {
    const match = /^(\d+)x(\d+)$/i.exec(dimension.trim());
    return match ? [{ width: Number(match[1]), height: Number(match[2]) }] : [];
  });
  const standardAt1x = sizes.filter(({ width, height }) =>
    standardSizes.has(`${width}x${height}`),
  ).length;
  const standardAt2x = sizes.filter(({ width, height }) =>
    standardSizes.has(`${width / 2}x${height / 2}`),
  ).length;
  return standardAt2x > standardAt1x;
}

export function mapPsdDimensions(
  dimensions: string[],
  is2x = false,
): PsdDimensionSelection | null {
  const standardSizes = new Set(STANDARD_AD_DIMENSIONS.map(({ size }) => size));
  const mappedSizes = new Set<string>();

  for (const dimension of dimensions) {
    const match = /^(\d+)x(\d+)$/i.exec(dimension.trim());

    if (!match) {
      continue;
    }

    const scale = is2x ? 2 : 1;
    const width = Number(match[1]) / scale;
    const height = Number(match[2]) / scale;
    const exactSize = `${width}x${height}`;

    if (standardSizes.has(exactSize)) {
      mappedSizes.add(exactSize);
      continue;
    }

    mappedSizes.add(exactSize);
  }

  const sizes = [...mappedSizes];
  if (sizes.length === 0) {
    return null;
  }

  const dimensionType = sizes.length > 1 ? "responsive" : "single";
  const customDimensions = sizes
    .filter((size) => !standardSizes.has(size))
    .map((size) => {
      const [width, height] = size.split("x");
      return { width, height };
    });
  let customIndex = 0;
  const selectedDimensions = sizes.map((size) => {
    if (standardSizes.has(size)) {
      return size;
    }

    const index = customIndex++;
    return dimensionType === "single" ? "custom" : `custom-${index}`;
  });

  return { dimensionType, selectedDimensions, customDimensions };
}

// Gives every variant an entry for each size, copied from its first size.
export function syncContentDimensions<T extends { variants?: unknown }>(
  content: T,
  sizes: Size[],
): { content: T; added: number } {
  if (!Array.isArray(content?.variants)) {
    return { content, added: 0 };
  }

  let added = 0;

  const variants = content.variants.map((variant: any) => {
    const dimensions: any[] = Array.isArray(variant?.dimensions)
      ? variant.dimensions
      : [];
    const template = dimensions[0];

    if (!template) {
      return variant;
    }

    const missing = sizes.filter(
      (size) =>
        !dimensions.some(
          (dimension) =>
            dimension?.width === size.width &&
            dimension?.height === size.height,
        ),
    );

    added += missing.length;

    return {
      ...variant,
      dimensions: [
        ...dimensions,
        ...missing.map((size) => ({
          ...JSON.parse(JSON.stringify(template)),
          width: size.width,
          height: size.height,
        })),
      ],
    };
  });

  return { content: { ...content, variants }, added };
}
