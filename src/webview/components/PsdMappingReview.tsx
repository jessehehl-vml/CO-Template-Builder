import React, { useState } from "react";
import {
  NO_FEED_IMAGE,
  type PsdMappingDecision,
  type PsdMappingLayer,
  type PsdMappingReview as Review,
} from "../../psd-mapping";

type Props = {
  review: Review;
  onConfirm: (decisions: PsdMappingDecision[]) => void;
  onCancel: () => void;
};

const METHOD_LABELS: Record<string, string> = {
  name: "same name",
  pixels: "matched by pixels",
  "layer-name": "same layer in another frame",
  "frame-hint": "frame in field name",
  copy: "same copy",
  profile: "frame, role and punctuation",
  list: "same number of [items]",
  copilot: "suggested by Copilot",
};

/** The list a row belongs to, if any. */
function listOf(
  layers: PsdMappingLayer[],
  key: string,
): PsdMappingLayer | undefined {
  return layers.find(
    ({ kind, children }) => kind === "list" && children?.includes(key),
  );
}

/** Table order: each list where its first item would be, with its items under it when expanded. */
function orderRows(
  layers: PsdMappingLayer[],
  expanded: Record<string, boolean>,
): { layer: PsdMappingLayer; child?: boolean }[] {
  const rows: { layer: PsdMappingLayer; child?: boolean }[] = [];
  const shown = new Set<string>();
  for (const layer of layers) {
    const list = layer.kind === "list" ? layer : listOf(layers, layer.key);
    if (!list) {
      rows.push({ layer });
      continue;
    }
    if (shown.has(list.key)) {
      continue;
    }
    shown.add(list.key);
    rows.push({ layer: list });
    if (expanded[list.key]) {
      for (const key of list.children ?? []) {
        const item = layers.find((candidate) => candidate.key === key);
        if (item) {
          rows.push({ layer: item, child: true });
        }
      }
    }
  }
  return rows;
}

export default function PsdMappingReview({
  review,
  onConfirm,
  onCancel,
}: Props) {
  const [fields, setFields] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      review.frames.flatMap(({ layers }) =>
        layers.map(({ key, field }) => [key, field]),
      ),
    ),
  );
  const [highlighted, setHighlighted] = useState<string | null>(null);
  // Lists start collapsed, unless one of their items already has its own field and the list has none.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      review.frames.flatMap(({ layers }) =>
        layers
          .filter(({ kind }) => kind === "list")
          .map((list) => [
            list.key,
            !list.field &&
              (list.children ?? []).some(
                (key) => layers.find((layer) => layer.key === key)?.field,
              ),
          ]),
      ),
    ),
  );
  const [centered, setCentered] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      review.frames.flatMap(({ layers }) =>
        layers.map(({ key, centerInParent }) => [key, Boolean(centerInParent)]),
      ),
    ),
  );
  const [recolorOn, setRecolorOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      review.frames.flatMap(({ layers }) =>
        layers.map(({ key, recolorChecked }) => [
          key,
          recolorChecked !== false,
        ]),
      ),
    ),
  );
  const allLayers = review.frames.flatMap(({ layers }) => layers);
  // One size at a time: all frames of the first size, then the next size.
  const sizes = [...new Set(review.frames.map(({ size }) => size))];
  const framesBySize = [...review.frames].sort(
    (a, b) =>
      sizes.indexOf(a.size) - sizes.indexOf(b.size) || a.frame - b.frame,
  );
  // Colour to give the selected SVG field, if it is offered and switched on.
  const recolorFor = (layer: PsdMappingLayer) => {
    const field = fields[layer.key];
    return field && recolorOn[layer.key] ? layer.recolor?.[field] : undefined;
  };
  const imagePreview = (field: string | null) =>
    review.imageFields.find((item) => item.field === field)?.previewDataUrl;

  const renderSelect = (layer: PsdMappingLayer) => {
    const value = fields[layer.key] ?? "";
    const options =
      layer.kind === "image"
        ? review.imageFields.map(({ field }) => ({ field, title: field }))
        : review.textFields.map(({ field, sample }) => ({
            field,
            title: sample,
          }));
    return (
      <select
        value={value}
        onChange={(event) =>
          setFields((current) => ({
            ...current,
            [layer.key]: event.target.value || null,
          }))
        }
      >
        <option value="">
          {layer.kind === "image"
            ? "PSD artwork (exported from the PSD)"
            : layer.kind === "list"
              ? "Fixed labels from the PSD"
              : "Fixed copy from the PSD"}
        </option>
        {layer.kind === "image" && (
          <option value={NO_FEED_IMAGE}>Leave empty</option>
        )}
        {options.map(({ field, title }) => (
          <option key={field} value={field} title={title}>
            {field}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="modal-backdrop">
      <div
        className="import-modal mapping-modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <h2>Review feed mapping</h2>
            <p>
              Check which content-feed field each PSD image and text uses. Hover
              a row to see the layer on the storyboard. Nothing is written until
              you create the project.
            </p>
          </div>
          <button
            className="modal-close"
            onClick={onCancel}
            aria-label="Cancel"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {framesBySize.map((frame, index) => (
            <React.Fragment key={`${frame.size}|${frame.frame}`}>
              {sizes.length > 1 &&
                frame.size !== framesBySize[index - 1]?.size && (
                  <h2 className="mapping-size">{frame.size}</h2>
                )}
              <section className="mapping-frame">
                <h3>
                  Frame {frame.frame} <span>{frame.size}</span>
                </h3>
                <div className="mapping-frame-content">
                  <div
                    className="mapping-preview"
                    style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
                  >
                    {frame.previewDataUrl && (
                      <img src={frame.previewDataUrl} alt="" />
                    )}
                    {frame.layers.map((layer) => (
                      <div
                        key={layer.key}
                        className={`mapping-box mapping-box-${layer.kind}${
                          highlighted === layer.key ? " is-highlighted" : ""
                        }`}
                        style={{
                          left: `${(layer.box.left / frame.width) * 100}%`,
                          top: `${(layer.box.top / frame.height) * 100}%`,
                          width: `${(layer.box.width / frame.width) * 100}%`,
                          height: `${(layer.box.height / frame.height) * 100}%`,
                        }}
                      />
                    ))}
                    {frame.layers
                      .filter(
                        ({ key, parent }) => parent && highlighted === key,
                      )
                      .map(({ key, parent }) => (
                        <div
                          key={`${key}-parent`}
                          className="mapping-box mapping-box-parent"
                          style={{
                            left: `${(parent!.box.left / frame.width) * 100}%`,
                            top: `${(parent!.box.top / frame.height) * 100}%`,
                            width: `${(parent!.box.width / frame.width) * 100}%`,
                            height: `${(parent!.box.height / frame.height) * 100}%`,
                          }}
                        />
                      ))}
                  </div>

                  <table className="mapping-table">
                    <tbody>
                      {orderRows(frame.layers, expanded).map(
                        ({ layer, child }) => {
                          const preview =
                            layer.kind === "image"
                              ? imagePreview(fields[layer.key])
                              : undefined;
                          const list = child
                            ? listOf(frame.layers, layer.key)
                            : undefined;
                          const replaced = Boolean(list && fields[list.key]);
                          return (
                            <tr
                              key={layer.key}
                              className={[
                                highlighted === layer.key
                                  ? "is-highlighted"
                                  : "",
                                child ? "mapping-child" : "",
                                replaced ? "is-replaced" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onMouseEnter={() => setHighlighted(layer.key)}
                              onMouseLeave={() => setHighlighted(null)}
                            >
                              <td>
                                <span
                                  className={`mapping-kind mapping-kind-${layer.kind}`}
                                >
                                  {layer.kind === "image"
                                    ? "Image"
                                    : layer.kind === "list"
                                      ? "List"
                                      : "Text"}
                                </span>
                              </td>
                              <td className="mapping-layer">
                                {layer.kind === "text" ? (
                                  <span title={layer.text}>“{layer.text}”</span>
                                ) : layer.kind === "list" ? (
                                  <span title={layer.text}>
                                    {layer.name}: {layer.text}
                                  </span>
                                ) : (
                                  <span title={layer.name}>{layer.name}</span>
                                )}
                                {layer.method &&
                                  layer.field &&
                                  fields[layer.key] === layer.field && (
                                    <small>
                                      {METHOD_LABELS[layer.method] ??
                                        layer.method}
                                    </small>
                                  )}
                                {layer.kind === "list" && layer.children && (
                                  <button
                                    type="button"
                                    className="mapping-toggle"
                                    aria-expanded={Boolean(expanded[layer.key])}
                                    onClick={() =>
                                      setExpanded((current) => ({
                                        ...current,
                                        [layer.key]: !current[layer.key],
                                      }))
                                    }
                                  >
                                    {expanded[layer.key] ? "▾" : "▸"}{" "}
                                    {layer.children.length} items separately
                                  </button>
                                )}
                              </td>
                              <td className="mapping-field">
                                {replaced ? (
                                  <small>
                                    Filled by the list “{list!.name}”
                                  </small>
                                ) : (
                                  renderSelect(layer)
                                )}
                                {!replaced &&
                                  layer.kind !== "image" &&
                                  fields[layer.key] && (
                                    <small>
                                      {review.textFields.find(
                                        ({ field }) =>
                                          field === fields[layer.key],
                                      )?.sample ?? ""}
                                    </small>
                                  )}
                                {(() => {
                                  if (!layer.parent || replaced) {
                                    return null;
                                  }
                                  // One option per folder, on its first text; it centres all texts in the folder together.
                                  const group = frame.layers
                                    .filter(
                                      ({ parent }) =>
                                        parent?.key &&
                                        parent.key === layer.parent!.key,
                                    )
                                    .map(({ key }) => key);
                                  if (
                                    group.length > 0 &&
                                    group[0] !== layer.key
                                  ) {
                                    return null;
                                  }
                                  const keys =
                                    group.length > 0 ? group : [layer.key];
                                  return (
                                    <label className="mapping-center">
                                      <input
                                        type="checkbox"
                                        checked={keys.some(
                                          (key) => centered[key],
                                        )}
                                        onChange={(event) =>
                                          setCentered((current) => ({
                                            ...current,
                                            ...Object.fromEntries(
                                              keys.map((key) => [
                                                key,
                                                event.target.checked,
                                              ]),
                                            ),
                                          }))
                                        }
                                      />
                                      {keys.length > 1
                                        ? `Centre the ${keys.length} texts vertically in folder “${layer.parent.name}”`
                                        : `Centre vertically in folder “${layer.parent.name}”`}
                                    </label>
                                  );
                                })()}
                                {layer.kind === "image" &&
                                  fields[layer.key] &&
                                  layer.recolor?.[fields[layer.key]!] && (
                                    <label className="mapping-center">
                                      <input
                                        type="checkbox"
                                        checked={recolorOn[layer.key]}
                                        onChange={(event) =>
                                          setRecolorOn((current) => ({
                                            ...current,
                                            [layer.key]: event.target.checked,
                                          }))
                                        }
                                      />
                                      Make the SVG{" "}
                                      {layer.recolor[fields[layer.key]!]}, like
                                      the PSD
                                    </label>
                                  )}
                              </td>
                              <td className="mapping-thumb">
                                {preview && (
                                  <img
                                    src={preview}
                                    alt=""
                                    className={
                                      recolorFor(layer)
                                        ? `is-recolored-${recolorFor(layer)}`
                                        : ""
                                    }
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </React.Fragment>
          ))}
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primary-button"
            onClick={() =>
              onConfirm(
                Object.entries(fields).map(([key, field]) => {
                  const layer = allLayers.find((item) => item.key === key);
                  const offered = field ? layer?.recolor?.[field] : undefined;
                  return {
                    key,
                    field,
                    ...(centered[key] ? { centerInParent: true } : {}),
                    ...(offered
                      ? { recolor: recolorOn[key] ? offered : null }
                      : {}),
                  };
                }),
              )
            }
          >
            Create project
          </button>
        </div>
      </div>
    </div>
  );
}
