/** Data for reviewing which feed field each PSD layer uses, shared by the extension and the wizard. */

export type PsdMappingBox = { left: number; top: number; width: number; height: number };

export type PsdMappingLayer = {
  /** `${size}|${frame}|${layerIndex}` */
  key: string;
  kind: "image" | "text" | "list";
  name: string;
  text?: string;
  /** Layer bounds in creative pixels. */
  box: PsdMappingBox;
  /** Proposed feed field, or null for none / fixed copy. */
  field: string | null;
  /** How the proposal was made, e.g. "name", "pixels", "copy", "copilot". */
  method?: string;
  /** Nearest folder that is larger than this text layer; the text can be centred in it. */
  parent?: { name: string; box: PsdMappingBox; key?: string };
  /** Initial state of the "centre in folder" option. */
  centerInParent?: boolean;
  /** On a list: keys of its label rows, which the list replaces when it is mapped. */
  children?: string[];
  /** On an image: SVG feed fields whose colour differs from the PSD artwork, with the colour to use. */
  recolor?: Record<string, SvgRecolor>;
  /** Initial state of the recolour option; on by default. */
  recolorChecked?: boolean;
};

/** Colours an SVG can be turned into with a CSS filter. */
export type SvgRecolor = "white" | "black";

export type PsdMappingFrame = {
  size: string;
  frame: number;
  width: number;
  height: number;
  previewDataUrl: string;
  layers: PsdMappingLayer[];
};

export type PsdMappingReview = {
  reviewId: string;
  frames: PsdMappingFrame[];
  imageFields: { field: string; previewDataUrl?: string }[];
  textFields: { field: string; sample: string }[];
};

export type PsdMappingDecision = {
  key: string;
  field: string | null;
  centerInParent?: boolean;
  /** Recolour the SVG from the feed to match the PSD; null when switched off in the review. */
  recolor?: SvgRecolor | null;
};

/** Image decision value that leaves the layer out; null keeps the PSD artwork. */
export const NO_FEED_IMAGE = "__none__";
