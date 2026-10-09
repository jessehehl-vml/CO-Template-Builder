import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { randomBytes } from "crypto";

const PORT = 3001;

const CONTENT_TYPES: Record<string, string> = {
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
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

// Forwards runtime errors from a banner iframe to the preview page.
const ERROR_CAPTURE_SCRIPT = `<script>
(function () {
  function send(kind, message, file, line) {
    try {
      parent.postMessage(
        { type: "qa-runtime-error", kind: kind, message: String(message), file: file || "", line: line || 0 },
        "*"
      );
    } catch (e) {}
  }

  function fromStack(stack) {
    var match = /\\/src\\/([^:\\s)]+):(\\d+)/.exec(String(stack || ""));
    return match ? [match[1], Number(match[2])] : ["", 0];
  }

  window.addEventListener(
    "error",
    function (event) {
      var target = event.target;

      if (target && target !== window && (target.src || target.href)) {
        send("resource", "Failed to load " + (target.src || target.href));
        return;
      }

      var file = String(event.filename || "").replace(/^.*\\/src\\//, "");
      send("error", event.message, file, event.lineno);
    },
    true
  );

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    var where = fromStack(reason && reason.stack);
    send("rejection", (reason && reason.message) || reason, where[0], where[1]);
  });

  var originalError = console.error;
  console.error = function () {
    send("console.error", Array.prototype.join.call(arguments, " "));
    return originalError.apply(console, arguments);
  };
})();
</script>`;

const STORYBOARD_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
]);

export class PreviewServer implements vscode.Disposable {
  private server: http.Server | null = null;
  private readonly clients = new Set<http.ServerResponse>();
  private readonly qaToken = randomBytes(16).toString("hex");

  constructor(
    private readonly extensionPath: string,
    private readonly qa?: {
      lint: (workspacePath: string) => unknown;
      review: (
        workspacePath: string,
        onProgress: (message: string) => void,
      ) => Promise<unknown>;
    },
  ) {}

  open() {
    if (this.server) {
      this.openBrowser();
      return;
    }

    const server = http.createServer((req, res) => this.handle(req, res));
    this.server = server;

    server.on("error", (error) => {
      console.error("[PREVIEW] Server error:", error);

      if (this.server === server) {
        this.server = null;
      }
    });

    server.listen(PORT, "127.0.0.1", () => this.openBrowser());
  }

  dispose() {
    for (const client of this.clients) {
      client.end();
    }

    this.clients.clear();
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = null;
  }

  private openBrowser() {
    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${PORT}`));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    if (!workspacePath) {
      res.writeHead(500);
      res.end("No workspace folder");
      return;
    }

    let requestPath: string;

    try {
      requestPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    if (requestPath === "/qa/lint" || requestPath === "/qa/review") {
      void this.handleQa(req, res, workspacePath, requestPath === "/qa/lint");
    } else if (requestPath === "/preview-events") {
      this.handleEvents(req, res);
    } else if (requestPath === "/preview.css") {
      this.serveExtensionFile(res, "preview.css", "text/css");
    } else if (requestPath === "/preview.js") {
      this.serveExtensionFile(res, "preview.js", "application/javascript");
    } else if (requestPath === "/storyboards/find") {
      this.findStoryboard(req, res, workspacePath);
    } else if (requestPath.startsWith("/storyboards/")) {
      this.serveFolderFile(
        res,
        path.join(workspacePath, "storyboards"),
        requestPath.slice("/storyboards/".length),
      );
    } else if (requestPath.startsWith("/src/")) {
      this.serveFolderFile(
        res,
        path.join(workspacePath, "src"),
        requestPath.slice("/src/".length),
        requestPath === "/src/index.html" &&
          (req.url ?? "").includes("_qaCapture=1")
          ? ERROR_CAPTURE_SCRIPT
          : undefined,
      );
    } else {
      this.servePreviewApp(res, workspacePath);
    }
  }

  private async handleQa(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    workspacePath: string,
    lintOnly: boolean,
  ) {
    // The token and host checks stop other web pages from spending Copilot quota.
    const allowedHosts = [`localhost:${PORT}`, `127.0.0.1:${PORT}`];
    const origin = req.headers.origin;

    if (
      req.method !== "POST" ||
      !allowedHosts.includes(req.headers.host ?? "") ||
      (origin !== undefined &&
        !allowedHosts.includes(origin.replace("http://", ""))) ||
      req.headers["x-qa-token"] !== this.qaToken
    ) {
      this.sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    if (!this.qa) {
      this.sendJson(res, 501, { error: "Code review is not available." });
      return;
    }

    if (lintOnly) {
      try {
        this.sendJson(res, 200, this.qa.lint(workspacePath));
      } catch (error) {
        this.sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return;
    }

    // One JSON object per line, so the page can show progress as it arrives.
    res.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    });

    const send = (line: object) => res.write(`${JSON.stringify(line)}\n`);

    try {
      const result = await this.qa.review(workspacePath, (message) =>
        send({ type: "progress", message }),
      );

      send({ type: "result", result });
    } catch (error) {
      send({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    res.end();
  }

  private handleEvents(req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    res.write("data: connected\n\n");

    this.clients.add(res);

    req.on("close", () => {
      this.clients.delete(res);
    });
  }

  private serveExtensionFile(
    res: http.ServerResponse,
    fileName: string,
    contentType: string,
  ) {
    const filePath = path.join(this.extensionPath, "preview", fileName);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end(`${fileName} not found`);
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(fs.readFileSync(filePath, "utf8"));
  }

  private serveFolderFile(
    res: http.ServerResponse,
    folder: string,
    relativePath: string,
    injectIntoHead?: string,
  ) {
    const filePath = path.join(folder, relativePath);
    const resolvedFolder = path.resolve(folder);
    const resolvedFile = path.resolve(filePath);

    if (
      resolvedFile !== resolvedFolder &&
      !resolvedFile.startsWith(resolvedFolder + path.sep)
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

    if (injectIntoHead) {
      const html = fs.readFileSync(filePath, "utf8");
      const injected = /<head[^>]*>/i.test(html)
        ? html.replace(/<head[^>]*>/i, (head) => head + injectIntoHead)
        : injectIntoHead + html;

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(injected);
      return;
    }

    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    });
    res.end(fs.readFileSync(filePath));
  }

  private findStoryboard(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    workspacePath: string,
  ) {
    const storyboardsFolder = path.join(workspacePath, "storyboards");
    const url = new URL(req.url ?? "", "http://localhost");

    const width = Number(url.searchParams.get("width"));
    const height = Number(url.searchParams.get("height"));
    const frame = Number(url.searchParams.get("frame"));

    if (!width || !height || !frame) {
      this.sendJson(res, 400, {
        error: "width, height and frame are required",
      });
      return;
    }

    if (!fs.existsSync(storyboardsFolder)) {
      this.sendJson(res, 404, { error: "Storyboard folder not found" });
      return;
    }

    const dimension = `${width}x${height}`.toLowerCase();
    const frameName = `frame${frame}`.toLowerCase();

    const matches = fs.readdirSync(storyboardsFolder).filter((fileName) => {
      if (!STORYBOARD_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
        return false;
      }

      const lowerName = fileName.toLowerCase();

      return lowerName.includes(dimension) && lowerName.includes(frameName);
    });

    if (matches.length === 0) {
      console.warn("[STORYBOARD] No matching image found:", {
        dimension,
        frameName,
      });

      this.sendJson(res, 404, {
        error: "Storyboard image not found",
        width,
        height,
        frame,
      });
      return;
    }

    if (matches.length > 1) {
      console.warn("[STORYBOARD] Multiple matching images found:", matches);
    }

    const fileName = matches[0];

    this.sendJson(
      res,
      200,
      {
        fileName,
        path: `/storyboards/${encodeURIComponent(fileName)}`,
      },
      { "Cache-Control": "no-cache" },
    );
  }

  private servePreviewApp(res: http.ServerResponse, workspacePath: string) {
    const previewPath = path.join(this.extensionPath, "preview", "index.html");

    if (!fs.existsSync(previewPath)) {
      res.writeHead(404);
      res.end("Preview file not found");
      return;
    }

    let projectName = "Preview";
    let dimensions: { width: number; height: number }[] = [];
    let variants: { contentId: string; variantId: number | string | null }[] =
      [];

    const settings = this.readWorkspaceJson(workspacePath, "settings.json");

    if (settings) {
      projectName = settings.projectName?.trim() || "Preview";
      dimensions = Array.isArray(settings.dimensions)
        ? settings.dimensions
        : [];
    }

    const content = this.readWorkspaceJson(workspacePath, "content.json");

    if (content) {
      variants = Array.isArray(content.variants) ? content.variants : [];
    }

    const previewData = JSON.stringify({
      projectName,
      dimensions,
      variants,
      qaToken: this.qaToken,
    })
      // Prevent "</script>" in user content from closing the injected tag.
      .replace(/</g, "\\u003c");

    const html = fs.readFileSync(previewPath, "utf8").replace(
      "</head>",
      `<script>
  window.__PREVIEW_DATA__ = ${previewData};
</script>
</head>`,
    );

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  }

  private readWorkspaceJson(workspacePath: string, fileName: string) {
    const filePath = path.join(workspacePath, "settings", fileName);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      console.error(`[PREVIEW] Failed to read ${fileName}:`, error);
      return null;
    }
  }

  private sendJson(
    res: http.ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  }
}
