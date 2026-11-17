import { getFrameHint } from "./psd-image-matching";

export type TextLayerSource = {
  key: string;
  frame: number;
  text: string;
};

export type FeedTextField = {
  placeholderName: string;
  value: string;
};

export type FeedTextMatch = {
  key: string;
  placeholderName: string;
  similarity: number;
};

/** Lowercased words of a PSD text or feed value, ignoring markup, entities and punctuation. */
export function textWords(value: string): string[] {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Dice coefficient over words: 1 for identical copy, 0 for nothing in common. */
export function textSimilarity(a: string, b: string): number {
  const left = textWords(a);
  const right = textWords(b);
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  if (left.join(" ") === right.join(" ")) {
    return 1;
  }
  const remaining = new Map<string, number>();
  for (const word of right) {
    remaining.set(word, (remaining.get(word) ?? 0) + 1);
  }
  let shared = 0;
  for (const word of left) {
    const count = remaining.get(word) ?? 0;
    if (count > 0) {
      shared++;
      remaining.set(word, count - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

/**
 * Pairs PSD text layers with feed text fields by copy similarity.
 * A frame hint in the field name (e.g. "f2_subheadline") is enforced unless the copy is identical.
 * Each field is used at most once per frame; the same field may appear in several frames.
 */
export function matchFeedText(
  layers: TextLayerSource[],
  fields: FeedTextField[],
  minSimilarity = 0.6,
): FeedTextMatch[] {
  const candidates = layers
    .flatMap((layer) =>
      fields.map((field) => ({
        layer,
        field,
        similarity: textSimilarity(layer.text, field.value),
      })),
    )
    .filter(({ layer, field, similarity }) => {
      if (similarity < minSimilarity) {
        return false;
      }
      const frames = getFrameHint(field.placeholderName);
      return similarity === 1 || !frames || frames.includes(layer.frame);
    })
    .sort((a, b) => b.similarity - a.similarity);

  const matchedKeys = new Set<string>();
  const usedInFrame = new Set<string>();
  const matches: FeedTextMatch[] = [];
  for (const { layer, field, similarity } of candidates) {
    const frameKey = `${layer.frame}|${field.placeholderName}`;
    if (matchedKeys.has(layer.key) || usedInFrame.has(frameKey)) {
      continue;
    }
    matchedKeys.add(layer.key);
    usedInFrame.add(frameKey);
    matches.push({
      key: layer.key,
      placeholderName: field.placeholderName,
      similarity: Math.round(similarity * 100) / 100,
    });
  }
  return matches;
}

export type ProfiledTextLayer = {
  key: string;
  /** Layers that compete for the same fields (one artboard). */
  group: string;
  frame: number;
  text: string;
  name: string;
  /** Photoshop's automatic name (e.g. the copy itself), which says nothing about the layer's role. */
  defaultName: boolean;
  fontSize: number;
  fontWeight: number;
};

export type ProfiledTextMatch = {
  key: string;
  placeholderName: string;
  method: "copy" | "name" | "profile";
  score: number;
};

const ROLE_TOKENS: Record<string, string[]> = {
  headline: ["headline", "title", "heading", "header", "hl"],
  subheadline: ["subheadline", "subline", "subtitle", "subhead", "sub", "body"],
  cta: ["cta", "button", "btn"],
  legal: ["legal", "disclaimer", "terms"],
  price: ["price", "cents", "amount"],
};
const IGNORED_NAME_TOKENS = new Set([
  "standard",
  "text",
  "txt",
  "url",
  "value",
  "layer",
  "copy",
  "the",
]);
const MIN_SCORE = 3;

/** Lowercase name tokens ("headline_f3" -> headline, f3), with frame tokens normalised to "f3". */
function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b(?:frame|fr)[_\s-]?(\d+)/g, "f$1")
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !IGNORED_NAME_TOKENS.has(token));
}

function roleOf(tokens: string[]): string | undefined {
  return Object.entries(ROLE_TOKENS).find(([, words]) =>
    tokens.some((token) => words.includes(token)),
  )?.[0];
}

function tokenDice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const shared = a.filter((token) => b.includes(token)).length;
  return (2 * shared) / (a.length + b.length);
}

/** Text fields that hold copy: not URLs, lists ("[a] [b]") or one-word settings like "Prospecting". */
function isCopyValue(value: string): boolean {
  const text = value.trim();
  return (
    !/^https?:\/\//i.test(text) &&
    !/^\[.*\]$/s.test(text) &&
    textWords(text).length >= 2
  );
}

/**
 * Pairs PSD text layers with feed text fields without needing the same language, from:
 * frame hints and roles in the field name ("f3_headline"), the layer name ("headline_f3"),
 * the layer's role by font size, punctuation ("?" endings), digits, length, and copy similarity.
 * Picks the combination per artboard with the highest total score.
 */
export function matchFeedTextByProfile(
  layers: ProfiledTextLayer[],
  fields: FeedTextField[],
): ProfiledTextMatch[] {
  const copyFields = fields.filter(({ value }) => isCopyValue(value));
  const matches: ProfiledTextMatch[] = [];
  for (const group of new Set(layers.map((layer) => layer.group))) {
    const members = layers.filter((layer) => layer.group === group);
    // Without a role in the name, the most prominent text is the headline, the next one the subheadline.
    const prominence = [...members].sort(
      (a, b) => b.fontSize * b.fontWeight - a.fontSize * a.fontWeight,
    );
    const pairs = members.flatMap((layer) =>
      copyFields.flatMap((field) => {
        const scored = scorePair(layer, field, prominence.indexOf(layer));
        return scored && scored.score >= MIN_SCORE
          ? [{ layer, field, ...scored }]
          : [];
      }),
    );

    // Best total over the group, each layer and field used once (groups are small).
    let best: typeof pairs = [];
    let bestScore = 0;
    const search = (index: number, chosen: typeof pairs, total: number) => {
      if (total > bestScore) {
        best = [...chosen];
        bestScore = total;
      }
      for (let next = index; next < pairs.length; next++) {
        const pair = pairs[next];
        if (
          chosen.some(
            ({ layer, field }) => layer === pair.layer || field === pair.field,
          )
        ) {
          continue;
        }
        chosen.push(pair);
        search(next + 1, chosen, total + pair.score);
        chosen.pop();
      }
    };
    search(0, [], 0);
    matches.push(
      ...best.map(({ layer, field, score, method }) => ({
        key: layer.key,
        placeholderName: field.placeholderName,
        method,
        score: Math.round(score * 10) / 10,
      })),
    );
  }
  return matches;
}

function scorePair(
  layer: ProfiledTextLayer,
  field: FeedTextField,
  prominence: number,
): { score: number; method: ProfiledTextMatch["method"] } | undefined {
  const frames = getFrameHint(field.placeholderName);
  if (frames && !frames.includes(layer.frame)) {
    return undefined;
  }
  const fieldTokens = nameTokens(field.placeholderName);
  const layerTokens = layer.defaultName ? [] : nameTokens(layer.name);
  const similarity = textSimilarity(layer.text, field.value);
  const nameMatch = tokenDice(
    layerTokens.filter((token) => !/^f\d+$/.test(token)),
    fieldTokens.filter((token) => !/^f\d+$/.test(token)),
  );

  let score = frames ? 3 : 0;
  score += 6 * similarity;
  score += 4 * nameMatch;

  const fieldRole = roleOf(fieldTokens);
  const namedRole = roleOf(layerTokens);
  const rankedRole =
    prominence === 0
      ? "headline"
      : prominence === 1
        ? "subheadline"
        : undefined;
  if (fieldRole && namedRole) {
    score += fieldRole === namedRole ? 2 : -2;
  } else if (fieldRole && rankedRole) {
    score += fieldRole === rankedRole ? 1 : -0.5;
  }

  // Language-independent shape of the copy.
  const ending = (value: string) => value.trim().slice(-1);
  const [layerEnd, fieldEnd] = [
    ending(layer.text),
    ending(field.value.replace(/<[^>]*>/g, "")),
  ];
  if (layerEnd === "?" && fieldEnd === "?") {
    score += 3;
  } else if ((layerEnd === "?") !== (fieldEnd === "?")) {
    score -= 1;
  } else if (layerEnd === "." && fieldEnd === ".") {
    score += 0.5;
  }
  if (/\d/.test(layer.text) && /\d/.test(field.value)) {
    score += 0.5;
  }
  const ratio = field.value.length / Math.max(1, layer.text.trim().length);
  score += ratio >= 0.5 && ratio <= 2 ? 0.5 : -1.5;

  return {
    score,
    method: similarity >= 0.6 ? "copy" : nameMatch > 0 ? "name" : "profile",
  };
}
