const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

const { ZipExportService } = require("../dist/zip-export.js");

function createProject() {
  const folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "co-template-builder-zip-"),
  );
  const srcPath = path.join(folder, "src");
  const settingsPath = path.join(folder, "settings");

  fs.mkdirSync(path.join(srcPath, "dimensions"), { recursive: true });
  fs.mkdirSync(settingsPath, { recursive: true });

  fs.writeFileSync(
    path.join(srcPath, "index.html"),
    `<!doctype html><html><head></head><body><div class="ad"></div></body></html>`,
  );
  fs.writeFileSync(path.join(srcPath, "styles.css"), ".ad { color: red; }\n");
  fs.writeFileSync(
    path.join(srcPath, "dimensions", "300x250.css"),
    ".ad { width: 300px; }\n",
  );
  fs.writeFileSync(
    path.join(settingsPath, "settings.json"),
    JSON.stringify(
      {
        projectName: "Test Project",
        dimensions: [{ width: 300, height: 250 }],
        placeholders: { headline: "Welcome" },
      },
      null,
      2,
    ),
  );

  return { folder, srcPath };
}

test("ZipExportService exports each configured dimension into a ZIP", async () => {
  const { folder } = createProject();
  const service = new ZipExportService();

  const zipPaths = await service.exportProject({
    workspacePath: folder,
    projectName: "Test Project",
    dimensions: [{ width: 300, height: 250 }],
  });

  assert.deepEqual(zipPaths, [
    path.join(folder, "export", "Test Project-300x250.zip"),
  ]);

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "co-template-builder-unzip-"),
  );
  execFileSync("unzip", ["-qq", zipPaths[0], "-d", tempDir]);

  const indexHtml = fs.readFileSync(path.join(tempDir, "index.html"), "utf8");
  assert.match(
    indexHtml,
    /<meta name="ad.size" content="width=300,height=250">/,
  );
  assert.match(indexHtml, /<\/head>/);
  assert.match(
    fs.readFileSync(path.join(tempDir, "styles.css"), "utf8"),
    /width: 300px/,
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(tempDir, "template.json"), "utf8")),
    {
      placeholders: { headline: "Welcome" },
    },
  );
});
