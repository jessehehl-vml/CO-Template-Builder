import React from "react";

type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type NameSectionProps = {
  vscode: VsCodeApi;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  selectedFolder: string | null;
  setSelectedFolder: React.Dispatch<React.SetStateAction<string | null>>;
  settingsMode: boolean;
  creationSource?: "scratch" | "psd";
  setCreationSource?: React.Dispatch<React.SetStateAction<"scratch" | "psd">>;
  psdAnalysis?: {
    fileName: string;
    dimensions: string[];
    dimensionCount: number;
    frameCount: number;
    fonts: string[];
  } | null;
  psdIs2x?: boolean;
  setPsdIs2x?: React.Dispatch<React.SetStateAction<boolean>>;
  psdAnalysisError?: string | null;
  isAnalyzingPSD?: boolean;
};

export default function NameSection({
  vscode,
  name,
  setName,
  selectedFolder,
  setSelectedFolder,
  settingsMode,
  creationSource,
  setCreationSource,
  psdAnalysis,
  psdIs2x,
  setPsdIs2x,
  psdAnalysisError,
  isAnalyzingPSD,
}: NameSectionProps) {
  const displayedPsdDimensions = psdAnalysis?.dimensions.map((dimension) => {
    const match = /^(\d+)x(\d+)$/i.exec(dimension.trim());
    if (!psdIs2x || !match) {
      return dimension;
    }
    return `${Number(match[1]) / 2}x${Number(match[2]) / 2}`;
  });

  return (
    <section>
      <h1>Name your creative</h1>

      <p className="description">Give your HTML creative a name.</p>

      {!settingsMode && (
        <>
          {creationSource && setCreationSource && (
            <fieldset className="creation-source-fieldset">
              <legend>Start from</legend>
              <label className="creation-source-option">
                <input
                  type="radio"
                  name="creation-source"
                  value="scratch"
                  checked={creationSource === "scratch"}
                  onChange={() => setCreationSource("scratch")}
                />
                <span>
                  <strong>Create from scratch</strong>
                  <small>Start with a blank HTML creative.</small>
                </span>
              </label>
              <label className="creation-source-option">
                <input
                  type="radio"
                  name="creation-source"
                  value="psd"
                  checked={creationSource === "psd"}
                  onChange={() => setCreationSource("psd")}
                />
                <span>
                  <strong>Create from PSD</strong>
                  <small>Use a Photoshop design as the starting point.</small>
                </span>
              </label>
            </fieldset>
          )}

          {creationSource === "psd" && (
            <div className="field">
              <label>PSD file</label>
              <div className="psd-upload-row">
                <button
                  type="button"
                  className="select-folder-button"
                  disabled={isAnalyzingPSD}
                  onClick={() => {
                    vscode.postMessage({ type: "selectPSDFile" });
                  }}
                >
                  {isAnalyzingPSD
                    ? "Analyzing PSD…"
                    : psdAnalysis
                      ? "Choose a different PSD…"
                      : "Choose PSD file…"}
                </button>
                {psdAnalysis && setPsdIs2x && (
                  <label className="psd-2x-option">
                    <input
                      type="checkbox"
                      checked={psdIs2x ?? false}
                      onChange={(event) => setPsdIs2x(event.target.checked)}
                    />
                    <strong>PSD uses 2x resolution</strong>
                  </label>
                )}
              </div>
              {psdAnalysis && (
                <div className="psd-analysis-summary" role="status">
                  <strong>{psdAnalysis.fileName}</strong>
                  <span>
                    {psdAnalysis.dimensionCount}{" "}
                    {psdAnalysis.dimensionCount === 1
                      ? "dimension"
                      : "dimensions"}
                    {" · "}
                    {psdAnalysis.frameCount}{" "}
                    {psdAnalysis.frameCount === 1 ? "frame" : "frames"}
                  </span>
                  {psdAnalysis.dimensions.length > 0 && (
                    <small>{displayedPsdDimensions?.join(", ")}</small>
                  )}
                  <small>
                    {psdAnalysis.fonts.length > 0
                      ? `Fonts: ${psdAnalysis.fonts.join(", ")}`
                      : "No editable text-layer fonts detected"}
                  </small>
                </div>
              )}
              {psdAnalysisError && (
                <p className="psd-analysis-error" role="alert">
                  {psdAnalysisError}
                </p>
              )}
            </div>
          )}

          <div className="field">
            <label>Folder</label>

            {selectedFolder ? (
              <div className="selected-folder-row">
                <div className="selected-folder-icon">📁</div>

                <div className="selected-folder-info">
                  <div className="selected-folder-name">
                    {selectedFolder.split("/").pop() || selectedFolder}
                  </div>

                  <div className="selected-folder-path">{selectedFolder}</div>
                </div>

                <button
                  type="button"
                  className="change-folder-button"
                  onClick={() => {
                    vscode.postMessage({
                      type: "selectFolder",
                    });
                  }}
                >
                  Change folder
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="select-folder-button"
                onClick={() => {
                  vscode.postMessage({
                    type: "selectFolder",
                  });
                }}
              >
                📁 Select folder…
              </button>
            )}
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="creative-name">Creative name</label>

        <input
          id="creative-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Summer Campaign"
          autoFocus
        />
      </div>
    </section>
  );
}
