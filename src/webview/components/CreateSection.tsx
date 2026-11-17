import AddOnsOptions from "./AddOnsOptions";
import type { PsdStoryboardPreview } from "../../psd-analysis";

type CreateSectionProps = {
  name: string;
  dimensionType: "single" | "responsive";
  selectedDimensions: string[];
  selectedAdset: string | null;
  frameCount: number;
  setFrameCount: React.Dispatch<React.SetStateAction<number>>;
  fromPsd: boolean;
  psdIs2x: boolean;
  psdStoryboards: PsdStoryboardPreview[];
  frameNumbers: number[];
  frameDurations: Record<number, number>;
  totalFrameDuration: number;
  onFrameDurationChange: (frame: number, duration: number) => void;
  autoFillPlaceholderContent: boolean;
  setAutoFillPlaceholderContent: React.Dispatch<React.SetStateAction<boolean>>;
  autoScaleFonts: boolean;
  setAutoScaleFonts: React.Dispatch<React.SetStateAction<boolean>>;
  browserCheck: boolean;
  setBrowserCheck: React.Dispatch<React.SetStateAction<boolean>>;
  splitText: boolean;
  setSplitText: React.Dispatch<React.SetStateAction<boolean>>;
  drawSVGPlugin: boolean;
  setDrawSVGPlugin: React.Dispatch<React.SetStateAction<boolean>>;
  motionPathPlugin: boolean;
  setMotionPathPlugin: React.Dispatch<React.SetStateAction<boolean>>;
  onExport: () => void;
};
export default function CreateSection({
  name,
  dimensionType,
  selectedDimensions,
  selectedAdset,
  frameCount,
  setFrameCount,
  fromPsd,
  psdIs2x,
  psdStoryboards,
  frameNumbers,
  frameDurations,
  totalFrameDuration,
  onFrameDurationChange,
  autoFillPlaceholderContent,
  setAutoFillPlaceholderContent,
  autoScaleFonts,
  setAutoScaleFonts,
  browserCheck,
  setBrowserCheck,
  splitText,
  setSplitText,
  drawSVGPlugin,
  setDrawSVGPlugin,
  motionPathPlugin,
  setMotionPathPlugin,
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
      {fromPsd && (
        <>
          <h2 className="create-group-title">Frames from PSD</h2>
          <p className="frame-duration-total" role="status">
            Total: {totalFrameDuration.toFixed(1)} / 15 seconds
          </p>
          <div className="psd-storyboard-grid">
            {[...psdStoryboards]
              .sort(
                (a, b) =>
                  a.width - b.width || a.height - b.height || a.frame - b.frame,
              )
              .map((frame, index) => {
                const width = psdIs2x ? frame.width / 2 : frame.width;
                const height = psdIs2x ? frame.height / 2 : frame.height;
                const duration =
                  frameDurations[frame.frame] ?? 15 / frameNumbers.length;
                const maxDuration = Math.max(
                  0.1,
                  15 - (totalFrameDuration - duration),
                );
                return (
                  <figure
                    className="psd-storyboard-frame"
                    key={`${width}x${height}-frame${frame.frame}-${index}`}
                  >
                    <img
                      src={frame.previewDataUrl}
                      alt={`Frame ${frame.frame}, ${width}x${height}`}
                    />
                    <figcaption>
                      <div className="psd-storyboard-meta">
                        <strong>Frame {frame.frame}</strong>
                        <span>
                          {width}x{height}
                        </span>
                      </div>
                      <label className="psd-storyboard-duration">
                        <span>Duration</span>
                        <span className="frame-duration-input">
                          <input
                            type="number"
                            min={0.1}
                            max={maxDuration}
                            step={0.1}
                            value={duration}
                            aria-label={`Duration for frame ${frame.frame} in seconds`}
                            onChange={(event) =>
                              onFrameDurationChange(
                                frame.frame,
                                Number(event.target.value),
                              )
                            }
                          />
                          <span>sec</span>
                        </span>
                      </label>
                    </figcaption>
                  </figure>
                );
              })}
          </div>
        </>
      )}
      {!fromPsd && (
        <>
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
              onClick={() =>
                setAutoFillPlaceholderContent((current) => !current)
              }
            >
              <div className="create-checkbox-label">
                <div className="checkbox">
                  {autoFillPlaceholderContent ? "✓" : ""}
                </div>
                <span>Auto-fill placeholder content</span>
              </div>
            </div>
          </div>
        </>
      )}
      {!fromPsd && (
        <>
          <h2 className="create-group-title">Frame durations</h2>
          <p className="frame-duration-total" role="status">
            {totalFrameDuration.toFixed(1)} / 15 seconds
          </p>
          <div className="frame-duration-list">
            {frameNumbers.map((frame) => {
              const duration =
                frameDurations[frame] ?? 15 / frameNumbers.length;
              const otherDuration = totalFrameDuration - duration;
              const maxDuration = Math.max(0.1, 15 - otherDuration);
              return (
                <label className="frame-duration-row" key={frame}>
                  <span>Frame {frame}</span>
                  <span className="frame-duration-input">
                    <input
                      type="number"
                      min={0.1}
                      max={maxDuration}
                      step={0.1}
                      value={duration}
                      aria-label={`Duration for frame ${frame} in seconds`}
                      onChange={(event) =>
                        onFrameDurationChange(frame, Number(event.target.value))
                      }
                    />
                    <span>sec</span>
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
      <AddOnsOptions
        autoScaleFonts={autoScaleFonts}
        setAutoScaleFonts={setAutoScaleFonts}
        browserCheck={browserCheck}
        setBrowserCheck={setBrowserCheck}
        splitText={splitText}
        setSplitText={setSplitText}
        drawSVGPlugin={drawSVGPlugin}
        setDrawSVGPlugin={setDrawSVGPlugin}
        motionPathPlugin={motionPathPlugin}
        setMotionPathPlugin={setMotionPathPlugin}
      />
    </section>
  );
}
