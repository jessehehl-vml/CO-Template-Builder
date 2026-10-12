import AddOnsOptions from "./AddOnsOptions";

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
  browserCheck: boolean;
  setBrowserCheck: React.Dispatch<React.SetStateAction<boolean>>;
  splitText: boolean;
  setSplitText: React.Dispatch<React.SetStateAction<boolean>>;
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
  browserCheck,
  setBrowserCheck,
  splitText,
  setSplitText,
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
      <h2 className="create-group-title">Project setup</h2>
      <div className="create-card">
        <div className="create-option">
          <label htmlFor="frame-count">Number of frames</label>
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
          />
        </div>
        <div
          className="create-option"
          onClick={() => setAutoFillPlaceholderContent((current) => !current)}
        >
          <div className="create-checkbox-label">
            <div className="checkbox">
              {autoFillPlaceholderContent ? "✓" : ""}
            </div>
            <span>Auto-fill placeholder content</span>
          </div>
        </div>
      </div>
      <h2 className="create-group-title">Add-ons</h2>
      <p className="create-group-hint">
        Optional code added to Creative.js and index.html.
      </p>
      <AddOnsOptions
        autoScaleFonts={autoScaleFonts}
        setAutoScaleFonts={setAutoScaleFonts}
        browserCheck={browserCheck}
        setBrowserCheck={setBrowserCheck}
        splitText={splitText}
        setSplitText={setSplitText}
      />
    </section>
  );
}
