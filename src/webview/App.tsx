import React, { useEffect, useState } from "react";

const vscode = acquireVsCodeApi();

export default function App() {
  const [hasProject, setHasProject] = useState(false);
  const [email, setEmail] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(true);
  const [activeSettingsSection, setActiveSettingsSection] = useState<
    1 | 2 | 3 | 4 | null
  >(null);
  const [exportOpen, setExportOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);

  const openSettingsSection = (section: 1 | 2 | 3 | 4) => {
    setActiveSettingsSection(section);

    vscode.postMessage({
      type: "openSettingsSection",
      section,
    });
  };
  useEffect(() => {
    vscode.postMessage({
      type: "loadProjectState",
    });
  }, []);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "settingsPanelActive") {
        if (!message.active) {
          setActiveSettingsSection(null);
        }
      }
      if (message.type === "authenticationState") {
        setEmail(message.authenticated ? (message.email ?? "") : "");
      }

      if (message.type === "projectStateLoaded") {
        setHasProject(message.hasProject);
        setEmail(message.authenticated ? (message.email ?? "") : "");
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);
  const logout = () => {
    vscode.postMessage({ type: "logout" });
  };
  const createNewTemplate = () => {
    vscode.postMessage({
      type: "createNewTemplate",
    });
  };

  return (
    <div className="app">
      <header className="header"></header>

      <main className="landing">
        <div className="landing-content">
          {hasProject ? (
            <nav className="app-menu">
              <div className="menu-section">
                <button
                  type="button"
                  className="menu-section-header"
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  <span className="menu-section-title">
                    <span className="menu-icon">⚙</span>
                    SETTINGS
                  </span>

                  <span className="menu-chevron">
                    {settingsOpen ? "⌃" : "⌄"}
                  </span>
                </button>

                {settingsOpen && (
                  <div className="menu-section-items">
                    <button
                      className={`menu-item ${
                        activeSettingsSection === 1 ? "active" : ""
                      }`}
                      onClick={() => openSettingsSection(1)}
                    >
                      Adset details
                    </button>

                    <button
                      className={`menu-item ${
                        activeSettingsSection === 2 ? "active" : ""
                      }`}
                      onClick={() => openSettingsSection(2)}
                    >
                      Dimensions
                    </button>

                    <button
                      className={`menu-item ${
                        activeSettingsSection === 3 ? "active" : ""
                      }`}
                      onClick={() => openSettingsSection(3)}
                    >
                      Placeholders
                    </button>

                    <button
                      className={`menu-item ${
                        activeSettingsSection === 4 ? "active" : ""
                      }`}
                      onClick={() => openSettingsSection(4)}
                    >
                      Fonts
                    </button>
                  </div>
                )}
              </div>

              <div className="menu-section">
                <button
                  type="button"
                  className="menu-section-header"
                  onClick={() => setExportOpen((open) => !open)}
                >
                  <span className="menu-section-title">
                    <span className="menu-icon">⇧</span>
                    EXPORT
                  </span>

                  <span className="menu-chevron">{exportOpen ? "⌃" : "⌄"}</span>
                </button>

                {exportOpen && (
                  <div className="menu-section-items">
                    <button
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        vscode.postMessage({
                          type: "exportToZip",
                        });
                      }}
                    >
                      <span>Export to ZIP</span>
                    </button>

                    <button
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        vscode.postMessage({
                          type: "openExport",
                        });
                      }}
                    >
                      <span>Export to Creative Optimizations</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="menu-section">
                <button
                  type="button"
                  className="menu-section-header"
                  onClick={() => setPreviewOpen((open) => !open)}
                >
                  <span className="menu-section-title">
                    <span className="menu-icon">▶</span>
                    PREVIEW
                  </span>

                  <span className="menu-chevron">
                    {previewOpen ? "⌃" : "⌄"}
                  </span>
                </button>

                {previewOpen && (
                  <div className="menu-section-items">
                    <button
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        vscode.postMessage({
                          type: "openPreview",
                        });
                      }}
                    >
                      <span>Open preview</span>
                    </button>
                  </div>
                )}
              </div>
            </nav>
          ) : (
            <>
              <div className="newProject">
                <h1>Create a new template</h1>

                <p className="description">
                  Build a new HTML display ad from a Creative Optimizations
                  boilerplate.
                </p>

                <button className="create-button" onClick={createNewTemplate}>
                  Create new template
                </button>
              </div>
            </>
          )}
          <div className="account">
            {email ? (
              <>
                <div className="account-email">Logged in as {email}</div>

                <button
                  type="button"
                  className="logout-button"
                  onClick={logout}
                >
                  Log out
                </button>
              </>
            ) : (
              <button
                type="button"
                className="login-button"
                onClick={() => {
                  vscode.postMessage({
                    type: "connectToCreativeOptimizations",
                  });
                }}
              >
                Connect to Creative Optimizations
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
