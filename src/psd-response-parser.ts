export type PsdCodegenResponse = {
  artboards: {
    size?: string;
    frame?: number | string;
    html?: string;
    css?: string;
  }[];
  textMappings?: { text?: string; field?: string }[];
};

export type PsdCodegenTarget = { size: string; frame: number };

export function mapPsdCodegenArtboards(
  targets: PsdCodegenTarget[],
  items: PsdCodegenResponse["artboards"],
): (PsdCodegenResponse["artboards"][number] | undefined)[] {
  const mapped: (PsdCodegenResponse["artboards"][number] | undefined)[] = Array(
    targets.length,
  ).fill(undefined);
  const used = new Set<number>();

  targets.forEach((target, targetIndex) => {
    const matchIndex = items.findIndex((item, itemIndex) => {
      if (!item || used.has(itemIndex)) {
        return false;
      }
      return (
        normalizeSize(item.size) === normalizeSize(target.size) &&
        normalizeFrame(item.frame, item.size) === target.frame
      );
    });
    if (matchIndex !== -1) {
      mapped[targetIndex] = {
        ...items[matchIndex],
        size: target.size,
        frame: target.frame,
      };
      used.add(matchIndex);
    }
  });

  if (items.length === targets.length) {
    targets.forEach((_, targetIndex) => {
      if (mapped[targetIndex]) {
        return;
      }
      const samePosition = targetIndex;
      const itemIndex = used.has(samePosition)
        ? items.findIndex((_, index) => !used.has(index))
        : samePosition;
      if (itemIndex !== -1) {
        mapped[targetIndex] = {
          ...items[itemIndex],
          size: targets[targetIndex].size,
          frame: targets[targetIndex].frame,
        };
        used.add(itemIndex);
      }
    });
  }

  return mapped;
}

export function parsePsdCodegenResponse(
  responseText: string,
): PsdCodegenResponse {
  const normalized = stripJsonFence(responseText);
  try {
    const parsed: unknown = JSON.parse(normalized);
    if (isPsdCodegenResponse(parsed)) {
      return parsed;
    }
  } catch {
    // Copilot may wrap valid JSON in a short explanation.
  }

  for (
    let start = responseText.indexOf("{");
    start !== -1;
    start = responseText.indexOf("{", start + 1)
  ) {
    const candidate = extractJsonObject(responseText, start);
    if (!candidate) {
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isPsdCodegenResponse(parsed)) {
        return parsed;
      }
    } catch {
      // Keep searching in case the preamble contains unrelated braces.
    }
  }

  throw new Error(
    "Copilot's response did not contain valid PSD HTML/CSS JSON. Please try generating again.",
  );
}

function isPsdCodegenResponse(value: unknown): value is PsdCodegenResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "artboards" in value &&
    Array.isArray(value.artboards)
  );
}

function normalizeSize(value?: string): string | undefined {
  const match = /\b(\d{2,5})\s*[x×]\s*(\d{2,5})\b/i.exec(value ?? "");
  return match ? `${Number(match[1])}x${Number(match[2])}` : undefined;
}

function normalizeFrame(
  frame?: number | string,
  size?: string,
): number | undefined {
  if (typeof frame === "number" && Number.isInteger(frame)) {
    return frame;
  }
  const frameMatch = /(?:frame\s*)?(\d+)\s*$/i.exec(String(frame ?? ""));
  if (frameMatch) {
    return Number(frameMatch[1]);
  }
  const sizeMatch =
    /\b\d{2,5}\s*[x×]\s*\d{2,5}\s*(?:-|,)?\s*frame\s*(\d+)\b/i.exec(size ?? "");
  return sizeMatch ? Number(sizeMatch[1]) : undefined;
}

function extractJsonObject(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth++;
    } else if (character === "}" && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  return null;
}

function stripJsonFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}
