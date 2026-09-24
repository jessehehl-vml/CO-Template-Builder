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
};

export default function NameSection({
  vscode,
  name,
  setName,
  selectedFolder,
  setSelectedFolder,
  settingsMode,
}: NameSectionProps) {
  return (
    <section>
      <h1>Name your creative</h1>

      <p className="description">Give your HTML creative a name.</p>

      {!settingsMode && (
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
