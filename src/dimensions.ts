type Size = { width: number; height: number };

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
