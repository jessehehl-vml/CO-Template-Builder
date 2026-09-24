import React, { useRef, useState } from "react";

const DIMENSIONS = [
  { size: "300x250", label: "Medium Rectangle" },
  { size: "300x600", label: "Half Page" },
  { size: "160x600", label: "Wide Skyscraper" },
  { size: "728x90", label: "Leaderboard" },
  { size: "970x250", label: "Billboard" },
  { size: "320x50", label: "Mobile Banner" },
];

type DimensionsSectionProps = {
  dimensionType: "single" | "responsive";
  setDimensionType: React.Dispatch<
    React.SetStateAction<"single" | "responsive">
  >;
  selectedDimensions: string[];
  setSelectedDimensions: React.Dispatch<React.SetStateAction<string[]>>;
};

export default function DimensionsSection({
  dimensionType,
  setDimensionType,
  selectedDimensions,
  setSelectedDimensions,
}: DimensionsSectionProps) {
  const [customDimensions, setCustomDimensions] = useState<
    { width: string; height: string }[]
  >([]);

  const [customDimensionAttempted, setCustomDimensionAttempted] = useState<
    Record<number, boolean>
  >({});

  const customWidthRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isCustomDimensionValid = (dimension: {
    width: string;
    height: string;
  }) => {
    return dimension.width.trim() !== "" && dimension.height.trim() !== "";
  };

  const addCustomDimension = () => {
    setCustomDimensions((current) => [
      ...current,
      {
        width: "",
        height: "",
      },
    ]);
  };

  const selectDimension = (size: string) => {
    if (dimensionType === "single") {
      setSelectedDimensions([size]);
      return;
    }

    setSelectedDimensions((current) =>
      current.includes(size)
        ? current.filter((item) => item !== size)
        : [...current, size],
    );
  };

  const updateCustomDimension = (
    index: number,
    field: "width" | "height",
    value: string,
  ) => {
    setCustomDimensions((current) =>
      current.map((dimension, i) =>
        i === index
          ? {
              ...dimension,
              [field]: value,
            }
          : dimension,
      ),
    );

    const dimension = customDimensions[index];

    const width = field === "width" ? value : (dimension?.width ?? "");
    const height = field === "height" ? value : (dimension?.height ?? "");

    const isValid = width.trim() !== "" && height.trim() !== "";

    const key = dimensionType === "single" ? "custom" : `custom-${index}`;

    if (isValid) {
      if (dimensionType === "single") {
        setSelectedDimensions(["custom"]);
      } else {
        setSelectedDimensions((current) =>
          current.includes(key) ? current : [...current, key],
        );
      }
    } else {
      setSelectedDimensions((current) =>
        current.filter((item) => item !== key),
      );
    }
  };

  const removeCustomDimension = (index: number) => {
    setCustomDimensions((current) => current.filter((_, i) => i !== index));

    setSelectedDimensions((current) =>
      current.filter((item) => item !== `custom-${index}`),
    );

    setCustomDimensionAttempted((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  };

  return (
    <section>
      <h1>Choose dimensions</h1>

      <p className="description">
        Choose whether this template is built for a single size or multiple
        responsive sizes.
      </p>

      <div className="dimension-types">
        <button
          className={`dimension-type ${
            dimensionType === "single" ? "selected" : ""
          }`}
          onClick={() => {
            setDimensionType("single");
            setSelectedDimensions([]);
          }}
        >
          <div className="radio">{dimensionType === "single" ? "✓" : ""}</div>

          <div>
            <strong>Single Size</strong>
            <span>Create a template for one ad size.</span>
          </div>
        </button>

        <button
          className={`dimension-type ${
            dimensionType === "responsive" ? "selected" : ""
          }`}
          onClick={() => {
            setDimensionType("responsive");
            setSelectedDimensions([]);
          }}
        >
          <div className="radio">
            {dimensionType === "responsive" ? "✓" : ""}
          </div>

          <div>
            <strong>Responsive</strong>
            <span>Create a template for multiple ad sizes.</span>
          </div>
        </button>
      </div>

      <div className="dimensions">
        {DIMENSIONS.map(({ size, label }) => {
          const selected = selectedDimensions.includes(size);

          return (
            <button
              key={size}
              className={`dimension ${selected ? "selected" : ""}`}
              onClick={() => selectDimension(size)}
            >
              <div
                className={dimensionType === "single" ? "radio" : "checkbox"}
              >
                {selected ? "✓" : ""}
              </div>

              <div className="dimension-info">
                <strong>{size}</strong>
                <span>{label}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="custom-dimensions">
        {customDimensions.map((dimension, index) => {
          const key = dimensionType === "single" ? "custom" : `custom-${index}`;

          const isSelected = selectedDimensions.includes(key);
          const isValid = isCustomDimensionValid(dimension);
          const wasAttempted = customDimensionAttempted[index];

          return (
            <div
              className={`custom-dimension ${
                isSelected ? "selected" : ""
              } ${!isValid ? "invalid" : ""}`}
              key={index}
            >
              <button
                className="custom-dimension-select"
                onClick={() => {
                  if (!isValid) {
                    setCustomDimensionAttempted((current) => ({
                      ...current,
                      [index]: true,
                    }));
                    return;
                  }

                  selectDimension(key);
                }}
              >
                <div
                  className={dimensionType === "single" ? "radio" : "checkbox"}
                >
                  {isSelected ? "✓" : ""}
                </div>

                <strong>
                  Custom size
                  {dimensionType === "responsive" && ` ${index + 1}`}
                </strong>
              </button>

              <div className="custom-dimension-inputs">
                <input
                  type="number"
                  ref={(element) => {
                    customWidthRefs.current[index] = element;
                  }}
                  placeholder="Width"
                  className={
                    wasAttempted && !dimension.width.trim()
                      ? "custom-dimension-input invalid"
                      : "custom-dimension-input"
                  }
                  value={dimension.width}
                  onChange={(event) =>
                    updateCustomDimension(index, "width", event.target.value)
                  }
                />

                <span>×</span>

                <input
                  type="number"
                  placeholder="Height"
                  className={
                    wasAttempted && !dimension.height.trim()
                      ? "custom-dimension-input invalid"
                      : "custom-dimension-input"
                  }
                  value={dimension.height}
                  onChange={(event) =>
                    updateCustomDimension(index, "height", event.target.value)
                  }
                />
              </div>

              {dimensionType === "responsive" && (
                <button
                  className="remove-dimension"
                  onClick={() => removeCustomDimension(index)}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {(dimensionType === "responsive" || customDimensions.length === 0) && (
          <button className="add-custom-dimension" onClick={addCustomDimension}>
            + Add custom size
          </button>
        )}
      </div>
    </section>
  );
}
