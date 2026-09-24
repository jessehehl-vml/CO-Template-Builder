import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { LemonPiAuth } from "./auth";
import { LemonPiApi } from "./api";

import { ZipArchive } from "archiver";
export function activate(context: vscode.ExtensionContext) {
  console.log("[Extension Host] NEW EXTENSION.JS IS RUNNING");
  const auth = new LemonPiAuth(context.secrets);
  const api = new LemonPiApi(auth);

  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    context,
    auth,
    api,
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "my-vscode-extension.sidebar",
      sidebarProvider,
    ),
  );
}

export function deactivate() {}

class SidebarProvider implements vscode.WebviewViewProvider {
  private sidebarWebview: vscode.WebviewView | null = null;
  private settingsPanel: vscode.WebviewPanel | null = null;
  private wizardPanel: vscode.WebviewPanel | null = null;
  private exportPanel: vscode.WebviewPanel | null = null;
  private exportOnReady = false;
  private previewServer: http.Server | null = null;
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly auth: LemonPiAuth,
    private readonly api: LemonPiApi,
  ) {}
  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.sidebarWebview = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "checkAuthentication") {
        await this.sendAuthenticationState(webviewView.webview);
        return;
      }
      if (message.type === "openExport") {
        this.openExportPanel();
        return;
      }
      if (message.type === "loadProjectState") {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        let hasProject = false;

        if (workspaceFolder) {
          const settingsPath = path.join(
            workspaceFolder.uri.fsPath,
            "settings",
            "settings.json",
          );

          if (fs.existsSync(settingsPath)) {
            try {
              const content = fs.readFileSync(settingsPath, "utf8");
              const settings = JSON.parse(content);

              hasProject =
                settings !== null &&
                typeof settings === "object" &&
                !Array.isArray(settings);
            } catch {
              hasProject = false;
            }
          }
        }

        const authState = await this.getAuthenticationState();

        webviewView.webview.postMessage({
          type: "projectStateLoaded",
          hasProject,
          ...authState,
        });
      }
      if (message.type === "logout") {
        await this.auth.logout();
        await this.broadcastAuthenticationState();
        return;
      }
      if (message.type === "exportToZip") {
        await this.exportToZip();
      }
      if (message.type === "createNewTemplate") {
        this.openWizard();
        return;
      }
      if (message.type === "openSettingsSection") {
        this.openSettingsPanel(message.section);

        return;
      }

      if (message.type === "openPreview") {
        this.openPreview();
        return;
      }
      if (message.type === "connectToCreativeOptimizations") {
        await this.login(webviewView.webview);
        return;
      }
    });

    webviewView.webview.html = this.getSidebarContent(webviewView.webview);
  }
  private async buildCOZip(
    projectName: string,
    dimensionName: string,
  ): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      throw new Error("No workspace folder is open.");
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const srcPath = path.join(workspacePath, "src");
    const settingsPath = path.join(workspacePath, "settings", "settings.json");

    if (!fs.existsSync(srcPath)) {
      throw new Error("Could not find the src folder.");
    }

    if (!fs.existsSync(settingsPath)) {
      throw new Error("Could not find settings/settings.json.");
    }

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

    const [width, height] = dimensionName.split("x").map(Number);

    if (!width || !height) {
      throw new Error(`Invalid dimension: ${dimensionName}`);
    }

    const templateJson = JSON.stringify(
      {
        placeholders: settings.placeholders ?? {},
      },
      null,
      2,
    );

    const exportPath = path.join(workspacePath, "export");

    fs.mkdirSync(exportPath, { recursive: true });

    const stylesPath = path.join(srcPath, "styles.css");

    const baseStyles = fs.existsSync(stylesPath)
      ? fs.readFileSync(stylesPath, "utf8")
      : "";

    const files = fs
      .readdirSync(srcPath, { withFileTypes: true })
      .filter((entry) => entry.name !== "dimensions");

    const indexPath = path.join(srcPath, "index.html");

    if (!fs.existsSync(indexPath)) {
      throw new Error("Could not find src/index.html.");
    }

    const originalIndexHtml = fs.readFileSync(indexPath, "utf8");

    const dimensionCssPath = path.join(
      srcPath,
      "dimensions",
      `${dimensionName}.css`,
    );

    let mergedStyles = baseStyles;

    if (fs.existsSync(dimensionCssPath)) {
      const dimensionStyles = fs.readFileSync(dimensionCssPath, "utf8");

      mergedStyles = [
        baseStyles.trimEnd(),
        "",
        `/* Dimension: ${dimensionName} */`,
        "",
        dimensionStyles.trim(),
        "",
      ].join("\n");
    }

    let indexHtml = originalIndexHtml;

    const adSizeMeta = `<meta name="ad.size" content="width=${width},height=${height}">`;

    if (/<meta\s+name=["']ad\.size["'][^>]*>/i.test(indexHtml)) {
      indexHtml = indexHtml.replace(
        /<meta\s+name=["']ad\.size["'][^>]*>/i,
        adSizeMeta,
      );
    } else {
      indexHtml = indexHtml.replace(/<\/head>/i, `  ${adSizeMeta}\n</head>`);
    }

    const zipName = `${projectName}-${dimensionName}.zip`;
    const zipPath = path.join(exportPath, zipName);

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);

      const archive = new ZipArchive({
        zlib: { level: 9 },
      });

      output.on("close", resolve);

      output.on("error", reject);
      archive.on("error", reject);

      archive.pipe(output);

      for (const file of files) {
        const sourcePath = path.join(srcPath, file.name);

        if (file.isDirectory()) {
          archive.directory(sourcePath, file.name);
        } else if (file.name === "styles.css") {
          archive.append(mergedStyles, {
            name: "styles.css",
          });
        } else if (file.name === "index.html") {
          archive.append(indexHtml, {
            name: "index.html",
          });
        } else {
          archive.file(sourcePath, {
            name: file.name,
          });
        }
      }

      archive.append(templateJson, {
        name: "template.json",
      });

      archive.finalize();
    });

    console.log("[CO UPLOAD] ZIP created:", zipPath);

    return zipPath;
  }
  private async exportToZip() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder is open.");
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const srcPath = path.join(workspacePath, "src");
    const settingsPath = path.join(workspacePath, "settings", "settings.json");

    if (!fs.existsSync(srcPath)) {
      vscode.window.showErrorMessage("Could not find the src folder.");
      return;
    }

    if (!fs.existsSync(settingsPath)) {
      vscode.window.showErrorMessage("Could not find settings/settings.json.");
      return;
    }

    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

      const dimensions = Array.isArray(settings.dimensions)
        ? settings.dimensions
        : [];

      if (dimensions.length === 0) {
        vscode.window.showErrorMessage(
          "No dimensions are configured for this project.",
        );
        return;
      }

      const projectName = settings.projectName?.trim() || workspaceFolder.name;

      // Build template.json from the configured placeholders.
      // Only placeholders are exported — project settings such as
      // projectName, dimensions, agency, advertiser, etc. are excluded.
      const templateJson = JSON.stringify(
        {
          placeholders: settings.placeholders ?? {},
        },
        null,
        2,
      );

      const exportPath = path.join(workspacePath, "export");

      fs.mkdirSync(exportPath, { recursive: true });

      // Read the base styles once. Dimension-specific CSS is merged
      // into this in memory for each exported ZIP.
      const stylesPath = path.join(srcPath, "styles.css");

      const baseStyles = fs.existsSync(stylesPath)
        ? fs.readFileSync(stylesPath, "utf8")
        : "";

      // Get all files/directories directly inside src.
      // The dimensions directory itself is excluded because its CSS
      // files are merged into styles.css for each export.
      const files = fs
        .readdirSync(srcPath, { withFileTypes: true })
        .filter((entry) => entry.name !== "dimensions");

      const indexPath = path.join(srcPath, "index.html");

      if (!fs.existsSync(indexPath)) {
        vscode.window.showErrorMessage("Could not find src/index.html.");
        return;
      }

      // Read the original index.html once.
      // Every exported dimension gets its own in-memory version.
      const originalIndexHtml = fs.readFileSync(indexPath, "utf8");

      for (const dimension of dimensions) {
        const width = Number(dimension.width);
        const height = Number(dimension.height);

        if (!width || !height) {
          continue;
        }

        const dimensionName = `${width}x${height}`;
        const zipName = `${projectName}-${dimensionName}.zip`;
        const zipPath = path.join(exportPath, zipName);

        /*
         * ------------------------------------------------------------
         * Build dimension-specific styles.css
         * ------------------------------------------------------------
         */

        const dimensionCssPath = path.join(
          srcPath,
          "dimensions",
          `${dimensionName}.css`,
        );

        let mergedStyles = baseStyles;

        if (fs.existsSync(dimensionCssPath)) {
          const dimensionStyles = fs.readFileSync(dimensionCssPath, "utf8");

          mergedStyles = [
            baseStyles.trimEnd(),
            "",
            `/* Dimension: ${dimensionName} */`,
            "",
            dimensionStyles.trim(),
            "",
          ].join("\n");
        }

        /*
         * ------------------------------------------------------------
         * Build dimension-specific index.html
         * ------------------------------------------------------------
         */

        let indexHtml = originalIndexHtml;

        const adSizeMeta = `<meta name="ad.size" content="width=${width},height=${height}">`;

        // Replace an existing ad.size meta tag if one exists.
        if (/<meta\s+name=["']ad\.size["'][^>]*>/i.test(indexHtml)) {
          indexHtml = indexHtml.replace(
            /<meta\s+name=["']ad\.size["'][^>]*>/i,
            adSizeMeta,
          );
        } else {
          // Otherwise insert it before </head>.
          indexHtml = indexHtml.replace(
            /<\/head>/i,
            `  ${adSizeMeta}\n</head>`,
          );
        }

        /*
         * ------------------------------------------------------------
         * Create ZIP
         * ------------------------------------------------------------
         */

        await new Promise<void>((resolve, reject) => {
          const output = fs.createWriteStream(zipPath);

          const archive = new ZipArchive({
            zlib: { level: 9 },
          });

          output.on("close", () => {
            resolve();
          });

          output.on("error", reject);
          archive.on("error", reject);

          archive.pipe(output);

          /*
           * Add everything directly inside src.
           *
           * - styles.css gets replaced with the merged CSS
           * - index.html gets replaced with the dimension-specific HTML
           * - all other files are copied unchanged
           * - dimensions/ is already excluded above
           */
          for (const file of files) {
            const sourcePath = path.join(srcPath, file.name);

            if (file.isDirectory()) {
              archive.directory(sourcePath, file.name);
            } else if (file.name === "styles.css") {
              archive.append(mergedStyles, {
                name: "styles.css",
              });
            } else if (file.name === "index.html") {
              archive.append(indexHtml, {
                name: "index.html",
              });
            } else {
              archive.file(sourcePath, {
                name: file.name,
              });
            }
          }

          /*
           * Add template.json.
           *
           * This contains only:
           *
           * {
           *   "placeholders": { ... }
           * }
           *
           * based directly on settings/settings.json.
           */
          archive.append(templateJson, {
            name: "template.json",
          });

          archive.finalize();
        });
      }

      vscode.window.showInformationMessage(
        `Export complete: ${dimensions.length} ZIP${
          dimensions.length === 1 ? "" : "s"
        } created in the export folder.`,
      );
    } catch (error) {
      console.error("[EXPORT] Failed:", error);

      vscode.window.showErrorMessage(
        `Export failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  private openPreview() {
    const port = 3001;

    if (this.previewServer) {
      vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
      return;
    }

    const previewClients = new Set<http.ServerResponse>();

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    const server = http.createServer((req, res) => {
      if (!workspaceFolder) {
        res.writeHead(500);
        res.end("No workspace folder");
        return;
      }

      const requestPath = decodeURIComponent((req.url ?? "/").split("?")[0]);

      // --------------------------------------------------
      // Preview events / SSE
      // --------------------------------------------------

      if (requestPath === "/preview-events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        res.write("data: connected\n\n");

        previewClients.add(res);

        req.on("close", () => {
          previewClients.delete(res);
        });

        return;
      }

      // --------------------------------------------------
      // Preview CSS
      // --------------------------------------------------

      if (requestPath === "/preview.css") {
        const filePath = path.join(
          this.context.extensionPath,
          "preview",
          "preview.css",
        );

        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end("preview.css not found");
          return;
        }

        res.writeHead(200, {
          "Content-Type": "text/css",
        });

        res.end(fs.readFileSync(filePath, "utf8"));
        return;
      }

      // --------------------------------------------------
      // Preview JS
      // --------------------------------------------------

      if (requestPath === "/preview.js") {
        const filePath = path.join(
          this.context.extensionPath,
          "preview",
          "preview.js",
        );

        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end("preview.js not found");
          return;
        }

        res.writeHead(200, {
          "Content-Type": "application/javascript",
        });

        res.end(fs.readFileSync(filePath, "utf8"));
        return;
      }
      // --------------------------------------------------
      // Storyboard files
      // --------------------------------------------------

      if (requestPath === "/storyboards/find") {
        const storyboardsFolder = path.join(
          workspaceFolder.uri.fsPath,
          "storyboards",
        );

        const url = new URL(
          `http://localhost${req.url ?? "/storyboards/find"}`,
        );

        const width = Number(url.searchParams.get("width"));
        const height = Number(url.searchParams.get("height"));
        const frame = Number(url.searchParams.get("frame"));

        console.log("[STORYBOARD] Lookup:", {
          width,
          height,
          frame,
          folder: storyboardsFolder,
        });

        if (!width || !height || !frame) {
          console.warn("[STORYBOARD] Invalid lookup parameters");

          res.writeHead(400, {
            "Content-Type": "application/json",
          });

          res.end(
            JSON.stringify({
              error: "width, height and frame are required",
            }),
          );

          return;
        }

        if (!fs.existsSync(storyboardsFolder)) {
          console.warn(
            "[STORYBOARD] Folder does not exist:",
            storyboardsFolder,
          );

          res.writeHead(404, {
            "Content-Type": "application/json",
          });

          res.end(
            JSON.stringify({
              error: "Storyboard folder not found",
            }),
          );

          return;
        }

        const dimension = `${width}x${height}`;
        const frameName = `frame${frame}`;

        const imageExtensions = new Set([
          ".jpg",
          ".jpeg",
          ".png",
          ".gif",
          ".webp",
          ".avif",
          ".bmp",
          ".svg",
        ]);

        const files = fs.readdirSync(storyboardsFolder);

        console.log("[STORYBOARD] Files found:", files);

        const matches = files.filter((fileName) => {
          const extension = path.extname(fileName).toLowerCase();

          if (!imageExtensions.has(extension)) {
            return false;
          }

          const lowerName = fileName.toLowerCase();

          return (
            lowerName.includes(dimension.toLowerCase()) &&
            lowerName.includes(frameName.toLowerCase())
          );
        });

        console.log("[STORYBOARD] Matches:", matches);

        if (matches.length === 0) {
          console.warn("[STORYBOARD] No matching image found:", {
            dimension,
            frameName,
          });

          res.writeHead(404, {
            "Content-Type": "application/json",
          });

          res.end(
            JSON.stringify({
              error: "Storyboard image not found",
              width,
              height,
              frame,
            }),
          );

          return;
        }

        if (matches.length > 1) {
          console.warn("[STORYBOARD] Multiple matching images found:", matches);
        }

        const fileName = matches[0];

        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        });

        res.end(
          JSON.stringify({
            fileName,
            path: `/storyboards/${encodeURIComponent(fileName)}`,
          }),
        );

        return;
      }

      // --------------------------------------------------
      // Storyboard static files
      // --------------------------------------------------

      if (requestPath.startsWith("/storyboards/")) {
        const storyboardsFolder = path.join(
          workspaceFolder.uri.fsPath,
          "storyboards",
        );

        const relativePath = requestPath.slice("/storyboards/".length);
        const filePath = path.join(storyboardsFolder, relativePath);

        const resolvedStoryboardsFolder = path.resolve(storyboardsFolder);
        const resolvedFilePath = path.resolve(filePath);

        // Prevent path traversal outside storyboards/
        if (
          resolvedFilePath !== resolvedStoryboardsFolder &&
          !resolvedFilePath.startsWith(resolvedStoryboardsFolder + path.sep)
        ) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.writeHead(404);
          res.end("File not found");
          return;
        }

        const extension = path.extname(filePath).toLowerCase();

        const contentTypes: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".avif": "image/avif",
          ".bmp": "image/bmp",
          ".svg": "image/svg+xml",
        };

        res.writeHead(200, {
          "Content-Type": contentTypes[extension] ?? "application/octet-stream",
        });

        res.end(fs.readFileSync(filePath));
        return;
      }
      // --------------------------------------------------
      // Workspace src files
      // --------------------------------------------------

      if (requestPath.startsWith("/src/")) {
        const srcFolder = path.join(workspaceFolder.uri.fsPath, "src");

        const relativePath = requestPath.slice("/src/".length);
        const filePath = path.join(srcFolder, relativePath);

        const resolvedSrcFolder = path.resolve(srcFolder);
        const resolvedFilePath = path.resolve(filePath);

        // Prevent path traversal outside src/
        if (
          resolvedFilePath !== resolvedSrcFolder &&
          !resolvedFilePath.startsWith(resolvedSrcFolder + path.sep)
        ) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.writeHead(404);
          res.end("File not found");
          return;
        }

        const extension = path.extname(filePath).toLowerCase();

        const contentTypes: Record<string, string> = {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".woff": "font/woff",
          ".woff2": "font/woff2",
          ".ttf": "font/ttf",
          ".otf": "font/otf",
        };

        res.writeHead(200, {
          "Content-Type": contentTypes[extension] ?? "application/octet-stream",
        });

        res.end(fs.readFileSync(filePath));
        return;
      }

      // --------------------------------------------------
      // Preview application
      // --------------------------------------------------

      const previewPath = path.join(
        this.context.extensionPath,
        "preview",
        "index.html",
      );

      if (!fs.existsSync(previewPath)) {
        res.writeHead(404);
        res.end("Preview file not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/html",
      });

      let html = fs.readFileSync(previewPath, "utf8");

      let projectName = "Preview";

      let dimensions: {
        width: number;
        height: number;
      }[] = [];

      let variants: {
        contentId: string;
        variantId: number | string | null;
      }[] = [];

      // --------------------------------------------------
      // Load settings
      // --------------------------------------------------

      const settingsPath = path.join(
        workspaceFolder.uri.fsPath,
        "settings",
        "settings.json",
      );

      if (fs.existsSync(settingsPath)) {
        try {
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

          projectName = settings.projectName?.trim() || "Preview";

          dimensions = Array.isArray(settings.dimensions)
            ? settings.dimensions
            : [];
        } catch (error) {
          console.error("[PREVIEW] Failed to read settings:", error);
        }
      }

      // --------------------------------------------------
      // Load content
      // --------------------------------------------------

      const contentPath = path.join(
        workspaceFolder.uri.fsPath,
        "settings",
        "content.json",
      );

      if (fs.existsSync(contentPath)) {
        try {
          const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));

          variants = Array.isArray(content.variants) ? content.variants : [];
        } catch (error) {
          console.error("[PREVIEW] Failed to read content:", error);
        }
      }

      // --------------------------------------------------
      // Data exposed to preview.js
      // --------------------------------------------------

      const previewData = {
        projectName,
        dimensions,
        variants,
      };

      console.log("[PREVIEW] Data:", JSON.stringify(previewData, null, 2));

      html = html.replace(
        "</head>",
        `<script>
  window.__PREVIEW_DATA__ = ${JSON.stringify(previewData)};
</script>
</head>`,
      );

      res.end(html);
    });

    this.previewServer = server;

    server.on("error", (error) => {
      console.error("[PREVIEW] Server error:", error);

      if (this.previewServer === server) {
        this.previewServer = null;
      }
    });

    server.listen(port, "127.0.0.1", () => {
      vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
    });
  }
  private async login(webview: vscode.Webview) {
    try {
      await this.authenticate();
      await this.sendAuthenticationState(webview);
      await this.broadcastAuthenticationState();
    } catch (error) {
      console.error("[AUTH] Login failed:", error);

      webview.postMessage({
        type: "authenticationError",
        message:
          error instanceof Error
            ? error.message
            : "Could not connect to Creative Optimizations.",
      });
    }
  }
  private async broadcastAuthenticationState() {
    const authState = await this.getAuthenticationState();

    this.sidebarWebview?.webview.postMessage({
      type: "authenticationState",
      ...authState,
    });

    this.settingsPanel?.webview.postMessage({
      type: "authenticationState",
      ...authState,
    });

    this.wizardPanel?.webview.postMessage({
      type: "authenticationState",
      ...authState,
    });
  }
  private async getAuthenticationState() {
    const token = await this.auth.getAuthToken();

    if (!token) {
      return {
        authenticated: false,
        email: null,
        name: null,
      };
    }

    try {
      const user = await this.api.getMe();

      return {
        authenticated: true,
        email: user.email,
        name: user.name,
      };
    } catch (error) {
      console.error("[AUTH] Token validation failed:", error);

      // Token exists but is no longer valid.
      if (error instanceof Error && error.message.includes("(401)")) {
        await this.auth.logout();
      }

      return {
        authenticated: false,
        email: null,
        name: null,
      };
    }
  }
  private async sendAuthenticationState(webview: vscode.Webview) {
    const authState = await this.getAuthenticationState();

    webview.postMessage({
      type: "authenticationState",
      ...authState,
    });
  }
  private async authenticate(): Promise<void> {
    const existingToken = await this.auth.getAuthToken();

    if (existingToken) {
      const state = await this.getAuthenticationState();

      if (state.authenticated) {
        return;
      }
    }

    await this.auth.authenticate();
  }
  private async loadSettings(panel: vscode.WebviewPanel) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      panel.webview.postMessage({
        type: "settingsLoaded",
        settings: null,
        content: null,
        error: "No workspace folder is open.",
      });

      return;
    }

    const settingsFolder = path.join(workspaceFolder.uri.fsPath, "settings");

    const settingsPath = path.join(settingsFolder, "settings.json");

    const contentPath = path.join(settingsFolder, "content.json");

    try {
      if (!fs.existsSync(settingsPath)) {
        throw new Error("settings.json does not exist.");
      }

      const settingsContent = fs.readFileSync(settingsPath, "utf8");
      const settings = JSON.parse(settingsContent);

      let content = null;

      if (fs.existsSync(contentPath)) {
        const contentFile = fs.readFileSync(contentPath, "utf8");
        content = JSON.parse(contentFile);
      }

      panel.webview.postMessage({
        type: "settingsLoaded",
        settings,
        content,
      });
    } catch (error) {
      panel.webview.postMessage({
        type: "settingsLoaded",
        settings: null,
        content: null,
        error:
          error instanceof Error ? error.message : "Could not load settings.",
      });
    }
  }
  private async saveSettings(
    settings: Record<string, unknown>,
    content: Record<string, unknown>,
    collectionMapping: any,
    panel: vscode.WebviewPanel,
  ) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder is open.");
      return;
    }

    const settingsFolder = path.join(workspaceFolder.uri.fsPath, "settings");

    const settingsPath = path.join(settingsFolder, "settings.json");
    const contentPath = path.join(settingsFolder, "content.json");

    try {
      fs.mkdirSync(settingsFolder, { recursive: true });

      const existingSettings = fs.existsSync(settingsPath)
        ? JSON.parse(fs.readFileSync(settingsPath, "utf8"))
        : {};

      let updatedPlaceholders: Record<string, any> = {};

      const incomingPlaceholders = settings.placeholders;

      // The settings UI stores placeholders as an array:
      if (Array.isArray(incomingPlaceholders)) {
        updatedPlaceholders = Object.fromEntries(
          incomingPlaceholders
            .filter(
              (placeholder: any) =>
                placeholder?.name && typeof placeholder.name === "string",
            )
            .map((placeholder: any) => [
              placeholder.name,
              {
                type: placeholder.type,
              },
            ]),
        );
      } else if (
        incomingPlaceholders &&
        typeof incomingPlaceholders === "object"
      ) {
        // Already in settings.json format.
        updatedPlaceholders = {
          ...(incomingPlaceholders as Record<string, any>),
        };
      }

      // Add/update collection configuration.
      if (
        collectionMapping?.collection &&
        Array.isArray(collectionMapping.fields)
      ) {
        updatedPlaceholders[collectionMapping.collection] = {
          type: "collection",
          intent: collectionMapping.intent ?? "product",
          items_required: Number(collectionMapping.required ?? 1),
          placeholders: Object.fromEntries(
            collectionMapping.fields.map((field: any) => [
              field.placeholder,
              {
                type: field.placeholderType,
              },
            ]),
          ),
        };
      }

      const updatedSettings = {
        ...existingSettings,
        ...settings,
        placeholders: updatedPlaceholders,
      };
      const advertiserId =
        (updatedSettings as any)?.advertiser?.id ??
        (existingSettings as any)?.advertiser?.id;

      fs.writeFileSync(
        settingsPath,
        JSON.stringify(updatedSettings, null, 2),
        "utf8",
      );

      const variants = Array.isArray((content as any).variants)
        ? (content as any).variants
        : [];

      const productCountLimiter = variants
        .flatMap((variant: any) =>
          (variant?.dimensions ?? []).flatMap(
            (dimension: any) => dimension?.placeholders ?? [],
          ),
        )
        .find(
          (placeholder: any) => placeholder?.name === "Product_Count_limiter",
        );

      const updatedVariants = variants.map((variant: any) => ({
        ...variant,
        dimensions: (variant?.dimensions ?? []).map((dimension: any) => {
          const collectionName = collectionMapping?.collection;

          if (!collectionName) {
            return dimension;
          }

          const placeholders = Array.isArray(dimension.placeholders)
            ? [...dimension.placeholders]
            : [];

          // Collection already correctly lives inside placeholders.
          const existingCollectionIndex = placeholders.findIndex(
            (placeholder: any) => placeholder?.name === collectionName,
          );

          if (existingCollectionIndex !== -1) {
            return {
              ...dimension,
              placeholders,
            };
          }

          // Feed import may currently have the collection directly
          // on the dimension object. Move it into placeholders.
          const collection = dimension[collectionName];

          if (collection) {
            const {
              [collectionName]: _removed,
              ...dimensionWithoutCollection
            } = dimension;

            placeholders.push({
              name: collectionName,
              type: "collection",
              value: collection.value ?? [],
            });

            return {
              ...dimensionWithoutCollection,
              placeholders,
            };
          }

          return {
            ...dimension,
            placeholders,
          };
        }),
      }));

      const updatedContent = {
        ...content,
        variants: updatedVariants,
      };

      fs.writeFileSync(
        contentPath,
        JSON.stringify(updatedContent, null, 2),
        "utf8",
      );
      const indexPath = path.join(
        workspaceFolder.uri.fsPath,
        "src",
        "index.html",
      );

      if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, "utf8");

        const fontLinks = Array.isArray(settings.selectedFonts)
          ? settings.selectedFonts
              .map(
                (font: { family: string; variant: string; fontUrl: string }) =>
                  `  <link rel="stylesheet" type="text/css" media="all" href="${font.fontUrl}?v=${font.variant}">`,
              )
              .join("\n")
          : "";

        const fontBlock = `<!-- CO-EXTENSION-FONTS:START -->
${fontLinks}
  <!-- CO-EXTENSION-FONTS:END -->`;

        const fontBlockRegex =
          /<!-- CO-EXTENSION-FONTS:START -->[\s\S]*?<!-- CO-EXTENSION-FONTS:END -->/;

        if (fontBlockRegex.test(html)) {
          html = html.replace(fontBlockRegex, fontBlock);
        } else {
          html = html.replace(/<\/head>/i, `  ${fontBlock}\n</head>`);
        }

        fs.writeFileSync(indexPath, html, "utf8");
      }
      vscode.window.showInformationMessage("Settings saved.");

      panel.dispose();

      this.sidebarWebview?.webview.postMessage({
        type: "projectStateLoaded",
        hasProject: true,
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save settings.json.",
      );
    }
  }
  private getSettingsContent(webview: vscode.Webview): string {
    const htmlPath = path.join(
      this.extensionUri.fsPath,
      "webview-dist",
      "wizard.html",
    );

    let html = fs.readFileSync(htmlPath, "utf8");

    const webviewDistUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview-dist"),
    );

    html = html.replace(/(["'])\.\/assets\//g, `$1${webviewDistUri}/assets/`);

    return html;
  }
  private openSettingsPanel(section: 1 | 2 | 3 | 4) {
    const titles: Record<number, string> = {
      1: "Adset details",
      2: "Dimensions",
      3: "Placeholders",
      4: "Fonts",
    };

    if (this.settingsPanel) {
      this.settingsPanel.title = titles[section] ?? "Settings";

      this.settingsPanel.webview.postMessage({
        type: "openSettingsSection",
        section,
      });

      this.settingsPanel.reveal(vscode.ViewColumn.One);

      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "creativeOptimizationsSettings",
      titles[section] ?? "Settings",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      },
    );

    this.settingsPanel = panel;

    panel.onDidDispose(() => {
      this.settingsPanel = null;

      this.sidebarWebview?.webview.postMessage({
        type: "settingsPanelActive",
        active: false,
      });
    });
    panel.onDidChangeViewState((event) => {
      this.sidebarWebview?.webview.postMessage({
        type: "settingsPanelActive",
        active: event.webviewPanel.active,
      });
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "saveExportAdvertiser") {
        try {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

          if (!workspaceFolder) {
            throw new Error("No workspace folder is open.");
          }

          const settingsPath = path.join(
            workspaceFolder.uri.fsPath,
            "settings",
            "settings.json",
          );

          if (!fs.existsSync(settingsPath)) {
            throw new Error("settings/settings.json was not found.");
          }

          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

          settings.agency = message.agency;
          settings.advertiser = message.advertiser;

          fs.writeFileSync(
            settingsPath,
            JSON.stringify(settings, null, 2),
            "utf8",
          );

          console.log("[EXPORT] Saved agency:", settings.agency);
          console.log("[EXPORT] Saved advertiser:", settings.advertiser);
        } catch (error) {
          console.error("[EXPORT] Failed to save agency/advertiser:", error);

          vscode.window.showErrorMessage(
            `Failed to save export settings: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        return;
      }
      if (message.type === "uploadToCO") {
        try {
          const dimensions = message.dimensions ?? [];

          if (dimensions.length === 0) {
            throw new Error("No export dimensions selected.");
          }

          const projectName = message.projectName?.trim();

          if (!projectName) {
            throw new Error("Project name is required.");
          }

          console.log("[CO UPLOAD] Starting upload:", {
            agencyId: message.agencyId,
            advertiserId: message.advertiserId,
            folderId: message.folderId,
            projectName,
            dimensions,
          });

          // Get all existing templates once.
          const templates = await this.api.getTemplates(
            message.agencyId,
            message.advertiserId,
          );

          const results = await Promise.allSettled(
            dimensions.map(async (dimension: string) => {
              const templateName = `${projectName}_${dimension}`;

              const existingTemplate = templates.find(
                (template) =>
                  Number(template.folderId) === Number(message.folderId) &&
                  template.name === templateName,
              );

              console.log("[CO UPLOAD] Processing:", {
                dimension,
                templateName,
                existingTemplate: existingTemplate ?? null,
              });

              // Build the dimension-specific ZIP.
              const zipPath = await this.buildCOZip(projectName, dimension);

              console.log("[CO UPLOAD] ZIP created:", zipPath);

              // Existing template = revision.
              // No existing template = new template.
              await this.api.uploadTemplate({
                agencyId: message.agencyId,
                advertiserId: message.advertiserId,
                folderId: message.folderId,
                templateName,
                zipPath,
                templateId: existingTemplate?.id,
              });

              console.log(
                "[CO UPLOAD] Upload successful:",
                templateName,
                existingTemplate ? "(revision)" : "(new)",
              );

              return {
                dimension,
                templateName,
                type: existingTemplate ? "updated" : "uploaded",
              };
            }),
          );

          const successful = results.filter(
            (result) => result.status === "fulfilled",
          );

          const failed = results.filter(
            (result) => result.status === "rejected",
          );

          const uploaded = successful.filter(
            (result) =>
              result.status === "fulfilled" && result.value.type === "uploaded",
          );

          const updated = successful.filter(
            (result) =>
              result.status === "fulfilled" && result.value.type === "updated",
          );

          console.log("[CO UPLOAD] Completed:", {
            total: dimensions.length,
            successful: successful.length,
            failed: failed.length,
            uploaded: uploaded.length,
            updated: updated.length,
          });

          if (failed.length === 0) {
            const messages: string[] = [];

            if (uploaded.length > 0) {
              messages.push(`${uploaded.length} uploaded`);
            }

            if (updated.length > 0) {
              messages.push(`${updated.length} updated`);
            }

            vscode.window.showInformationMessage(
              `Creative Optimizations: ${messages.join(", ")}.`,
            );
          } else {
            const errorMessages = failed.map((result) =>
              result.status === "rejected"
                ? result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
                : "",
            );

            console.error("[CO UPLOAD] Failed uploads:", errorMessages);

            vscode.window.showWarningMessage(
              `Creative Optimizations: ${successful.length} succeeded, ${failed.length} failed.`,
            );
          }
          const refreshedTemplates = await this.api.getTemplates(
            message.agencyId,
            message.advertiserId,
          );

          const folderTemplates = refreshedTemplates.filter(
            (template) =>
              Number(template.folderId) === Number(message.folderId),
          );

          const existingDimensions = (message.dimensions ?? []).filter(
            (size: string) => {
              const expectedName = `${message.projectName}_${size}`;

              return folderTemplates.some(
                (template) => template.name === expectedName,
              );
            },
          );

          console.log("[CO UPLOAD] Refreshed existing dimensions:", {
            folderId: message.folderId,
            existingDimensions,
          });

          panel.webview.postMessage({
            type: "coExistingTemplatesLoaded",
            existingDimensions,
          });
        } catch (error) {
          console.error("[CO UPLOAD] Upload failed:", error);

          vscode.window.showErrorMessage(
            `CO upload failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        } finally {
          // Tell the Export UI that uploading is finished.
          panel.webview.postMessage({
            type: "coUploadFinished",
          });
        }

        return;
      }
      if (message.type === "loadCOExistingTemplates") {
        try {
          await this.authenticate();

          const templates = await this.api.getTemplates(
            message.agencyId,
            message.advertiserId,
          );

          const targetTemplate = templates.find(
            (template) => template.name === "BP US Fuel-300x600",
          );

          console.log(
            "[EXPORT] Target template:",
            JSON.stringify(targetTemplate, null, 2),
          );

          const folderTemplates = templates.filter(
            (template) =>
              Number(template.folderId) === Number(message.folderId),
          );
          console.log("[EXPORT] Project name:", message.projectName);
          console.log("[EXPORT] Dimensions:", message.dimensions);
          console.log("[EXPORT] Templates in folder:", templates);

          const expectedNames = (message.dimensions ?? []).map(
            (size: string) => `${message.projectName}_${size}`,
          );

          console.log("[EXPORT] Expected template names:", expectedNames);

          const existingDimensions = (message.dimensions ?? []).filter(
            (size: string) => {
              const expectedName = `${message.projectName}_${size}`;
              return folderTemplates.some(
                (template) => template.name === expectedName,
              );
            },
          );

          console.log("[EXPORT] Existing templates in folder:", {
            folderId: message.folderId,
            existingDimensions,
          });

          panel.webview.postMessage({
            type: "coExistingTemplatesLoaded",
            existingDimensions,
          });
        } catch (error) {
          console.error("[EXPORT] Failed to check existing templates:", error);

          panel.webview.postMessage({
            type: "coExistingTemplatesError",
            message:
              error instanceof Error
                ? error.message
                : "Could not check existing templates.",
          });
        }

        return;
      }
      if (message.type === "loadAgencyData") {
        try {
          const token = await this.auth.getAuthToken();

          if (!token) {
            panel.webview.postMessage({
              type: "agencyDataLoaded",
              agencies: [],
              currentAgencyId: null,
              email: null,
              name: null,
            });

            return;
          }

          const user = await this.api.getMe();

          const agencies = Array.from(
            new Map(
              user.roles.map((role) => [
                role.agencyId,
                {
                  id: role.agencyId,
                  name: role.agencyName,
                },
              ]),
            ).values(),
          );

          panel.webview.postMessage({
            type: "agencyDataLoaded",
            agencies,
            currentAgencyId: null,
            email: user.email,
            name: user.name,
          });
        } catch (error) {
          console.error("[SETTINGS] Failed to load agencies:", error);

          panel.webview.postMessage({
            type: "agencyDataError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load agencies.",
          });
        }

        return;
      }
      if (message.type === "checkAuthentication") {
        await this.sendAuthenticationState(panel.webview);
        return;
      }
      if (message.type === "settingsWebviewReady") {
        if (this.exportOnReady) {
          this.exportOnReady = false;

          panel.title = "Export to Creative Optimizations";

          panel.webview.postMessage({
            type: "openExport",
          });
        } else {
          panel.webview.postMessage({
            type: "openSettingsSection",
            section,
          });
        }

        return;
      }
      if (message.type === "connectToCreativeOptimizations") {
        await this.login(panel.webview);
        return;
      }
      if (message.type === "loadAdvertisers") {
        try {
          const advertisers = await this.api.getAdvertisers(message.agencyId);

          panel.webview.postMessage({
            type: "advertisersLoaded",
            advertisers,
          });
        } catch (error) {
          console.error("[SETTINGS] Failed to load advertisers:", error);

          panel.webview.postMessage({
            type: "advertisersError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load advertisers.",
          });
        }

        return;
      }
      if (message.type === "loadAdsets") {
        try {
          const adsets = await this.api.getAdSets(
            message.agencyId,
            message.advertiserId,
          );

          panel.webview.postMessage({
            type: "adsetsLoaded",
            adsets,
          });
        } catch (error) {
          console.error("[SETTINGS] Failed to load adsets:", error);

          panel.webview.postMessage({
            type: "adsetsError",
            message:
              error instanceof Error ? error.message : "Could not load adsets.",
          });
        }

        return;
      }
      if (message.type === "loadCOFolders") {
        console.log("[EXPORT] loadCOFolders handler hit");
        console.log("[EXPORT] loadCOFolders received:", {
          agencyId: message.agencyId,
          advertiserId: message.advertiserId,
        });

        try {
          await this.authenticate();
          const rootFolder = await this.api.getRootFolder(
            message.agencyId,
            message.advertiserId,
            "templates",
          );

          const folders = await this.api.getFolders(
            message.agencyId,
            message.advertiserId,
            "templates",
          );

          console.log("[EXPORT] Root folder:", rootFolder);
          console.log("[EXPORT] Child folders:", folders);

          panel.webview.postMessage({
            type: "coFoldersLoaded",
            rootFolder,
            folders,
          });
        } catch (error) {
          console.error("[EXPORT] Failed to load CO folders:", error);

          panel.webview.postMessage({
            type: "coFoldersError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load template folders.",
          });
        }

        return;
      }
      if (message.type === "loadPlaceholders") {
        try {
          const result = await this.api.getPlaceholders(
            message.advertiserId,
            message.adsetId,
          );
          panel.webview.postMessage({
            type: "placeholdersLoaded",
            variants: result.variants,
            collections: result.collections,
          });
        } catch (error) {
          console.error("[SETTINGS] Failed to load placeholders:", error);

          panel.webview.postMessage({
            type: "placeholdersError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load placeholders.",
          });
        }

        return;
      }
      if (message.type === "loadCollectionFields") {
        try {
          const fields = await this.api.getCollectionFields(
            message.agencyId,
            message.advertiserId,
          );

          panel.webview.postMessage({
            type: "collectionFieldsLoaded",
            fields,
          });
        } catch (error) {
          console.error("[SETTINGS] Failed to load collection fields:", error);

          panel.webview.postMessage({
            type: "collectionFieldsError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load collection fields.",
          });
        }

        return;
      }
      if (message.type === "loadProductsBySelector") {
        try {
          const products = await this.api.searchProductsBySelector(
            message.advertiserId,
            message.selectorId,
            message.limit ?? 10,
            message.offset ?? 0,
          );

          panel.webview.postMessage({
            type: "productsBySelectorLoaded",
            selectorId: message.selectorId,
            selectorName: message.selectorId,
            products,
          });
        } catch (error) {
          console.error("[WIZARD] Failed to load products:", error);

          panel.webview.postMessage({
            type: "productsError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load products.",
          });
        }

        return;
      }
      if (message.type === "loadWorkspaceFolder") {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        panel.webview.postMessage({
          type: "workspaceFolderLoaded",
          folder: workspaceFolder?.uri.fsPath ?? null,
        });

        return;
      }

      if (message.type === "loadSettings") {
        await this.loadSettings(panel);
        return;
      }

      if (message.type === "saveSettings") {
        await this.saveSettings(
          message.settings,
          message.content,
          message.collectionMapping,
          panel,
        );

        return;
      }

      if (message.type === "loadCOFonts") {
        try {
          const fonts = await this.api.getFonts(message.advertiserId);

          panel.webview.postMessage({
            type: "coFontsLoaded",
            fonts,
          });
        } catch (error) {
          console.error("[CO FONTS] Failed to load fonts:", error);

          panel.webview.postMessage({
            type: "coFontsError",
            message:
              error instanceof Error ? error.message : "Could not load fonts.",
          });
        }

        return;
      }
    });

    panel.webview.html = this.getSettingsContent(panel.webview);

    panel.webview.postMessage({
      type: "openSettingsMode",
      section,
    });
    this.sidebarWebview?.webview.postMessage({
      type: "settingsPanelActive",
      active: true,
    });
  }
  private openExportPanel() {
    if (this.settingsPanel) {
      this.settingsPanel.title = "Export to Creative Optimizations";

      this.settingsPanel.webview.postMessage({
        type: "openExport",
      });

      this.settingsPanel.reveal(vscode.ViewColumn.One);

      return;
    }

    this.exportOnReady = true;

    this.openSettingsPanel(1);
  }
  private openWizard() {
    const panel = vscode.window.createWebviewPanel(
      "creativeOptimizationsWizard",
      "Create New Template",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      },
    );
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "checkAuthentication") {
        await this.sendAuthenticationState(panel.webview);
        return;
      }

      if (message.type === "createBoilerplate") {
        try {
          if (!message.folder) {
            throw new Error("No folder selected.");
          }

          const srcFolder = path.join(message.folder, "src");
          const settingsFolder = path.join(message.folder, "settings");

          const files = [
            path.join(srcFolder, "index.html"),
            path.join(srcFolder, "script.js"),
            path.join(srcFolder, "styles.css"),
            path.join(srcFolder, "Creative.js"),
            path.join(settingsFolder, "settings.json"),
            path.join(settingsFolder, "content.json"),
          ];

          const existingFiles = files.filter((file) => fs.existsSync(file));

          if (existingFiles.length > 0) {
            const overwrite = await vscode.window.showWarningMessage(
              "Some project files already exist. Do you want to overwrite them?",
              {
                modal: true,
              },
              "Overwrite",
            );

            if (overwrite !== "Overwrite") {
              return;
            }
          }

          // frame count
          const frameCount = Number(message.frames ?? 3);

          if (!Number.isInteger(frameCount) || frameCount < 1) {
            throw new Error(
              "Number of frames must be a whole number greater than 0.",
            );
          }

          fs.mkdirSync(srcFolder, { recursive: true });
          fs.mkdirSync(settingsFolder, { recursive: true });

          // --------------------------------------------------
          // Placeholders
          // --------------------------------------------------

          const allPlaceholders = message.placeholderVariants.flatMap(
            (variant: any) =>
              variant.dimensions.flatMap(
                (dimension: any) => dimension.placeholders,
              ),
          );

          const uniquePlaceholders = Array.from(
            new Map<string, any>(
              allPlaceholders.map((placeholder: any) => [
                placeholder.name,
                placeholder,
              ]),
            ).values(),
          );
          // Normal placeholders
          const placeholders: Record<string, unknown> = {};

          for (const placeholder of uniquePlaceholders) {
            if (placeholder.type === "collection") {
              continue;
            }

            placeholders[placeholder.name] = {
              type: placeholder.type,
            };
          }

          // Collection placeholder
          if (message.collectionMapping) {
            const collection = message.collectionMapping;

            placeholders[collection.collection] = {
              placeholders: Object.fromEntries(
                collection.fields.map(
                  (field: { placeholder: string; placeholderType: string }) => [
                    field.placeholder,
                    {
                      type: field.placeholderType,
                    },
                  ],
                ),
              ),
              type: "collection",
              intent: collection.intent,
              items_required: Number(collection.required),
            };
          }
          // --------------------------------------------------
          // Settings
          // --------------------------------------------------

          const settings: Record<string, unknown> = {
            projectName: message.name,
            createdBy: message.userName ?? "",
            adsetType: message.dimensionType ?? "single",

            dimensions: message.selectedDimensions.map((size: string) => {
              const [width, height] = size.split("x").map(Number);

              return {
                width,
                height,
              };
            }),

            fonts: message.coFonts ?? [],

            selectedFonts: message.selectedFonts.map(
              (font: { family: string; variant: string; fontUrl: string }) => ({
                family: font.family,
                variant: font.variant,
                fontUrl: font.fontUrl,
              }),
            ),

            placeholders,
          };

          if (message.selectedAgency) {
            settings.agency = {
              id: message.selectedAgency.id,
              name: message.selectedAgency.name,
            };
          }

          if (message.selectedAdvertiser) {
            settings.advertiser = {
              id: message.selectedAdvertiser.id,
              name: message.selectedAdvertiser.name,
            };
          }

          if (message.selectedAdset) {
            settings.adset = {
              id: message.selectedAdset.id,
              name: message.selectedAdset.name,
            };
          }

          fs.writeFileSync(
            path.join(settingsFolder, "settings.json"),
            JSON.stringify(settings, null, 2),
            "utf8",
          );

          // --------------------------------------------------
          // Content
          // --------------------------------------------------
          const content: Record<string, unknown> = {
            variants: message.placeholderVariants,
          };

          if (message.collectionMapping && message.products) {
            const collection = message.collectionMapping;

            const updatedVariants = message.placeholderVariants.map(
              (variant: any) => ({
                ...variant,
                dimensions: (variant?.dimensions ?? []).map(
                  (dimension: any) => {
                    const selectorPlaceholder = (
                      dimension?.placeholders ?? []
                    ).find(
                      (placeholder: any) =>
                        placeholder?.name === "product-selector_ID" &&
                        placeholder?.value,
                    );

                    if (!selectorPlaceholder) {
                      return dimension;
                    }

                    const selectorId = String(selectorPlaceholder.value).trim();
                    const selectorResult = message.products[selectorId];

                    const items = Array.isArray(selectorResult?.products?.items)
                      ? selectorResult.products.items
                      : [];

                    const required = Number(collection.required);

                    const uniqueProducts = new Map<string, any>();

                    for (const product of items) {
                      if (!product?.id) {
                        continue;
                      }

                      if (!uniqueProducts.has(product.id)) {
                        uniqueProducts.set(product.id, product);
                      }

                      if (uniqueProducts.size >= required) {
                        break;
                      }
                    }

                    const collectionProducts = [...uniqueProducts.values()].map(
                      (product) => {
                        const item: Record<string, unknown> = {};

                        for (const field of collection.fields) {
                          const productFieldName = field.productField;

                          item[field.placeholder] = {
                            type: field.placeholderType,
                            value: product?.fields?.[productFieldName] ?? "",
                          };
                        }

                        return item;
                      },
                    );

                    const placeholders = Array.isArray(dimension.placeholders)
                      ? [...dimension.placeholders]
                      : [];

                    // Remove an existing products collection if one exists.
                    const filteredPlaceholders = placeholders.filter(
                      (placeholder: any) =>
                        placeholder?.name !== collection.collection,
                    );

                    // Put the collection INSIDE placeholders.
                    filteredPlaceholders.push({
                      name: collection.collection,
                      type: "collection",
                      value: collectionProducts,
                    });

                    return {
                      ...dimension,
                      placeholders: filteredPlaceholders,
                    };
                  },
                ),
              }),
            );

            content.variants = updatedVariants;

            content.variants = updatedVariants;
          }

          fs.writeFileSync(
            path.join(settingsFolder, "content.json"),
            JSON.stringify(content, null, 2),
            "utf8",
          );

          // --------------------------------------------------
          // Boilerplate templates
          // --------------------------------------------------

          const boilerplateFolder = path.join(
            this.context.extensionPath,
            "boilerplate",
          );

          if (!fs.existsSync(boilerplateFolder)) {
            throw new Error(
              `Boilerplate templates could not be found: ${boilerplateFolder}`,
            );
          }

          const indexTemplate = fs.readFileSync(
            path.join(boilerplateFolder, "index.html"),
            "utf8",
          );

          const scriptTemplate = fs.readFileSync(
            path.join(boilerplateFolder, "script.js"),
            "utf8",
          );

          const stylesTemplate = fs.readFileSync(
            path.join(boilerplateFolder, "styles.css"),
            "utf8",
          );
          const creativeTemplate = fs.readFileSync(
            path.join(boilerplateFolder, "Creative.js"),
            "utf8",
          );
          // --------------------------------------------------
          // Dynamic values
          // --------------------------------------------------

          const fontLinks = message.selectedFonts
            .map(
              (font: { family: string; variant: string; fontUrl: string }) =>
                `  <link rel="stylesheet" type="text/css" media="all" href="${font.fontUrl}?v=${font.variant}">`,
            )
            .join("\n");

          const extensionPackage = this.context.extension.packageJSON;

          const extensionName = extensionPackage.name ?? "Extension";
          const extensionVersion = extensionPackage.version ?? "0.0.0";
          const generator = `${extensionName} v${extensionVersion}`;

          const today = new Date().toISOString().slice(0, 10);

          const dimensionSuffix =
            message.dimensionType === "single" &&
            message.selectedDimensions?.[0]
              ? ` - ${message.selectedDimensions[0]}`
              : "";

          const fontVariables = message.selectedFonts
            .filter((font: { family: string; variant: string }) =>
              font.family?.trim(),
            )
            .map(
              (
                font: {
                  family: string;
                  variant: string;
                },
                index: number,
              ) => `  --font${index + 1}: "${font.family}";`,
            )
            .join("\n");

          const frameTimelines = Array.from(
            { length: frameCount },
            (_, index) => `const frame${index + 1}Timeline = gsap.timeline();`,
          ).join("\n");

          const frameAnimations = Array.from(
            { length: frameCount },
            (_, index) => {
              const frameNumber = index + 1;

              return `function createFrame${frameNumber}Animation() {
  frame${frameNumber}Timeline.addLabel("preview-ready");
}

`;
            },
          ).join("");

          const startAnimations = `function startAnimations() {
${Array.from({ length: frameCount }, (_, index) => {
  const frameNumber = index + 1;

  return `  createFrame${frameNumber}Animation();
  const frame${frameNumber}Start = mainTimeline.duration();

  mainTimeline.add(frame${frameNumber}Timeline);
  mainTimeline.addLabel(
    "frame${frameNumber}-preview",
    frame${frameNumber}Start + frame${frameNumber}Timeline.labels["preview-ready"],
  );`;
}).join("\n\n")}
}`;
          const frameAnimationCode = `${frameAnimations}${startAnimations}`;
          let placeholderContentCode = "";
          if (message.autoFillPlaceholderContent) {
            const placeholderMap = new Map<string, string>();

            for (const variant of message.placeholderVariants ?? []) {
              for (const dimension of variant.dimensions ?? []) {
                for (const placeholder of dimension.placeholders ?? []) {
                  const raw = placeholder as Record<string, unknown>;

                  const name = String(raw.name ?? "").trim();

                  if (!name) {
                    continue;
                  }

                  const type = String(raw.type ?? "").toLowerCase();

                  placeholderMap.set(
                    name,
                    type === "image" || type === "img" ? "image" : "text",
                  );
                }
              }
            }

            const lines = Array.from(placeholderMap.entries()).map(
              ([name, type]) => {
                const selector = `.${name}`;

                const contentReference = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
                  ? `content?.${name}?.value`
                  : `content?.[${JSON.stringify(name)}]?.value`;

                if (type === "image") {
                  return `  $("${selector}").attr("src", ${contentReference});`;
                }

                return `  $("${selector}").html(${contentReference});`;
              },
            );

            placeholderContentCode = lines.join("\n");
          }
          // click placeholder
          let interactionCode = ";";

          const clickPlaceholder = (message.placeholderVariants ?? [])
            .flatMap((variant: any) => variant.dimensions ?? [])
            .flatMap((dimension: any) => dimension.placeholders ?? [])
            .find(
              (placeholder: any) =>
                String(placeholder.type ?? "").toLowerCase() === "click",
            );

          if (clickPlaceholder) {
            interactionCode = `
    .on("click tap", function () {
      Creative.click(content.clickUrl.value);
    })`;
          }
          // --------------------------------------------------
          // Populate templates
          // --------------------------------------------------

          const indexHtml = indexTemplate
            .replaceAll("{{GENERATOR}}", generator)
            .replace("{{FONT_LINKS}}", fontLinks);
          const scriptJs = scriptTemplate
            .replaceAll("{{PROJECT_NAME}}", message.name)
            .replaceAll("{{DIMENSION_SUFFIX}}", dimensionSuffix)
            .replaceAll("{{OWNER}}", message.userName ?? "")
            .replaceAll("{{DATE}}", today)
            .replace("/* FRAME_TIMELINES */", frameTimelines)
            .replace("/* FRAME_ANIMATIONS */", frameAnimationCode)
            .replace(
              "/* AUTO_FILL_PLACEHOLDER_CONTENT */",
              placeholderContentCode,
            )
            .replace("/* INTERACTION_CODE */", interactionCode);
          const creativeJs = creativeTemplate.replace(
            "/* FRAME_COUNT */ 1",
            String(frameCount),
          );
          const stylesCss = stylesTemplate.replace(
            "/* FONT_VARIABLES */",
            fontVariables,
          );

          // --------------------------------------------------
          // Write generated files
          // --------------------------------------------------

          fs.writeFileSync(
            path.join(srcFolder, "index.html"),
            indexHtml,
            "utf8",
          );

          fs.writeFileSync(path.join(srcFolder, "script.js"), scriptJs, "utf8");

          fs.writeFileSync(
            path.join(srcFolder, "Creative.js"),
            creativeJs,
            "utf8",
          );

          fs.writeFileSync(
            path.join(srcFolder, "styles.css"),
            stylesCss,
            "utf8",
          );

          // --------------------------------------------------
          // Finish
          // --------------------------------------------------

          this.sidebarWebview?.webview.postMessage({
            type: "projectStateLoaded",
            hasProject: true,
          });

          vscode.window.showInformationMessage("Creative boilerplate created.");

          await vscode.window.showTextDocument(
            vscode.Uri.file(path.join(message.folder, "src", "index.html")),
          );

          panel.dispose();
        } catch (error) {
          console.error("[BOILERPLATE] Failed:", error);

          vscode.window.showErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not create creative boilerplate.",
          );
        }
      }
      if (message.type === "loadWorkspaceFolder") {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        panel.webview.postMessage({
          type: "workspaceFolderLoaded",
          folder: workspaceFolder?.uri.fsPath ?? null,
        });
      }

      if (message.type === "selectFolder") {
        const result = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select folder",
        });

        if (result?.[0]) {
          panel.webview.postMessage({
            type: "folderSelected",
            folder: result[0].fsPath,
          });
        }
      }
      if (message.type === "connectToCreativeOptimizations") {
        await this.login(panel.webview);
        return;
      }
      if (message.type === "loadPlaceholders") {
        try {
          const result = await this.api.getPlaceholders(
            message.advertiserId,
            message.adsetId,
          );
          panel.webview.postMessage({
            type: "placeholdersLoaded",
            variants: result.variants,
            collections: result.collections,
          });
        } catch (error) {
          console.error("[WIZARD] Failed to load placeholders:", error);

          panel.webview.postMessage({
            type: "placeholdersError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load placeholders.",
          });
        }
      }
      if (message.type === "loadAdvertisers") {
        try {
          const advertisers = await this.api.getAdvertisers(message.agencyId);

          panel.webview.postMessage({
            type: "advertisersLoaded",
            advertisers,
          });
        } catch (error) {
          console.error("Failed to load advertisers:", error);

          panel.webview.postMessage({
            type: "advertisersError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load advertisers.",
          });
        }
      }
      if (message.type === "loadAdsets") {
        try {
          const adsets = await this.api.getAdSets(
            message.agencyId,
            message.advertiserId,
          );

          panel.webview.postMessage({
            type: "adsetsLoaded",
            adsets,
          });
        } catch (error) {
          console.error("Failed to load adsets:", error);

          panel.webview.postMessage({
            type: "adsetsError",
            message:
              error instanceof Error ? error.message : "Could not load adsets.",
          });
        }
      }
      if (message.type === "loadProductsBySelector") {
        try {
          const selector = await this.api.getProductSelector(
            message.advertiserId,
            message.selectorId,
          );

          const result = await this.api.searchProductsBySelector(
            message.advertiserId,
            message.selectorId,
            message.limit ?? 10,
            message.offset ?? 0,
          );

          panel.webview.postMessage({
            type: "productsBySelectorLoaded",
            selectorId: message.selectorId,
            selectorName: selector.name,
            products: result,
          });
        } catch (error) {
          console.error(
            `[WIZARD] Failed to load products for selector ${message.selectorId}:`,
            error,
          );

          panel.webview.postMessage({
            type: "productsBySelectorError",
            selectorId: message.selectorId,
            message:
              error instanceof Error
                ? error.message
                : "Could not load products.",
          });
        }

        return;
      }
      if (message.type === "loadCollectionFields") {
        try {
          await this.authenticate();

          const fields = await this.api.getCollectionFields(
            message.agencyId,
            message.advertiserId,
          );

          panel.webview.postMessage({
            type: "collectionFieldsLoaded",
            fields,
          });
        } catch (error) {
          console.error("[SETTINGS] Failed to load collection fields:", error);

          panel.webview.postMessage({
            type: "collectionFieldsError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load collection fields.",
          });
        }

        return;
      }
      if (message.type === "loadAgencyData") {
        try {
          const token = await this.auth.getAuthToken();

          if (!token) {
            panel.webview.postMessage({
              type: "agencyDataLoaded",
              agencies: [],
              currentAgencyId: null,
              email: null,
              name: null,
            });

            return;
          }

          const user = await this.api.getMe();

          const agencies = Array.from(
            new Map(
              user.roles.map((role) => [
                role.agencyId,
                {
                  id: role.agencyId,
                  name: role.agencyName,
                },
              ]),
            ).values(),
          );
          panel.webview.postMessage({
            type: "agencyDataLoaded",
            agencies,
            currentAgencyId: null,
            email: user.email,
            name: user.name,
          });
        } catch (error) {
          console.error("Failed to load agencies:", error);

          panel.webview.postMessage({
            type: "agencyDataError",
            message:
              error instanceof Error
                ? error.message
                : "Could not load agencies.",
          });
        }
      }
      if (message.type === "loadCOFonts") {
        try {
          const fonts = await this.api.getFonts(message.advertiserId);
          panel.webview.postMessage({
            type: "coFontsLoaded",
            fonts,
          });
        } catch (error) {
          console.error("[CO FONTS] Failed to load fonts:", error);

          panel.webview.postMessage({
            type: "coFontsError",
            message:
              error instanceof Error ? error.message : "Could not load fonts.",
            unauthorized:
              error instanceof Error && error.message.includes("(401)"),
          });
        }
      }
    });

    panel.webview.html = this.getWizardContent(panel.webview);
  }

  private getSidebarContent(webview: vscode.Webview): string {
    const htmlPath = path.join(
      this.extensionUri.fsPath,
      "webview-dist",
      "index.html",
    );

    let html = fs.readFileSync(htmlPath, "utf8");

    const webviewDistUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview-dist"),
    );

    html = html.replace(/(["'])\.\/assets\//g, `$1${webviewDistUri}/assets/`);
    return html;
  }

  private getWizardContent(webview: vscode.Webview): string {
    const htmlPath = path.join(
      this.extensionUri.fsPath,
      "webview-dist",
      "wizard.html",
    );

    let html = fs.readFileSync(htmlPath, "utf8");

    const webviewDistUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "webview-dist"),
    );

    html = html.replace(
      /(["'])(?:\.\/|\/)?assets\//g,
      `$1${webviewDistUri}/assets/`,
    );

    return html;
  }
}
