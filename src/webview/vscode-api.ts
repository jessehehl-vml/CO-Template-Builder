declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

/** The webview's VS Code API; acquireVsCodeApi may only be called once per page. */
export const vscode = acquireVsCodeApi();
