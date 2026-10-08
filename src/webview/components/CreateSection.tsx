type CreateSectionProps = {
  name: string;
  dimensionType: "single" | "responsive";
  selectedDimensions: string[];
  selectedAdset: string | null;
  frameCount: number;
  setFrameCount: React.Dispatch<React.SetStateAction<number>>;
  autoFillPlaceholderContent: boolean;
  setAutoFillPlaceholderContent: React.Dispatch<React.SetStateAction<boolean>>;
  autoScaleFonts: boolean;
  setAutoScaleFonts: React.Dispatch<React.SetStateAction<boolean>>;
  onExport: () => void;
};
export default function CreateSection({
  name,
  dimensionType,
  selectedDimensions,
  selectedAdset,
  frameCount,
  setFrameCount,
  autoFillPlaceholderContent,
  setAutoFillPlaceholderContent,
  autoScaleFonts,
  setAutoScaleFonts,
  onExport,
}: CreateSectionProps) {
  return (
    <section className="create-page">
      {" "}
      <div className="create-page-header">
        {" "}
        <h1>Create boilerplate</h1>{" "}
        <p className="description">
          {" "}
          Everything looks good. We'll create the initial HTML creative in your
          workspace.{" "}
        </p>{" "}
      </div>{" "}
      <div className="summary">
        {" "}
        <div className="summary-row">
          {" "}
          <span>Name</span> <strong>{name || "Untitled creative"}</strong>{" "}
        </div>{" "}
        <div className="summary-row">
          {" "}
          <span>Dimensions</span>{" "}
          <strong>
            {" "}
            {dimensionType === "single"
              ? selectedDimensions[0] || "Not selected"
              : selectedDimensions.length > 0
                ? selectedDimensions.join(", ")
                : "Not selected"}{" "}
          </strong>{" "}
        </div>{" "}
      </div>{" "}
      <div className="create-card">
        {" "}
        <div className="create-option">
          {" "}
          <label htmlFor="frame-count">Number of frames</label>{" "}
          <input
            id="frame-count"
            type="number"
            min={1}
            step={1}
            value={frameCount}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 1) {
                setFrameCount(value);
              }
            }}
          />{" "}
        </div>{" "}
        <div
          className="create-option"
          onClick={() => setAutoFillPlaceholderContent((current) => !current)}
        >
          {" "}
          <div className="create-checkbox-label">
            {" "}
            <div className="checkbox">
              {" "}
              {autoFillPlaceholderContent ? "✓" : ""}{" "}
            </div>{" "}
            <span>Auto-fill placeholder content</span>{" "}
          </div>{" "}
        </div>
        <div
          className="create-option"
          onClick={() => setAutoScaleFonts((current) => !current)}
        >
          {" "}
          <div className="create-checkbox-label">
            {" "}
            <div className="checkbox"> {autoScaleFonts ? "✓" : ""} </div>{" "}
            <span>Auto-scale fonts</span>{" "}
          </div>{" "}
        </div>
      </div>{" "}
    </section>
  );
}
