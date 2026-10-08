import * as fs from "fs";
import * as path from "path";
import { ZipArchive } from "archiver";

export interface ExportDimension {
  width: number | string;
  height: number | string;
}

export interface ExportProjectOptions {
  workspacePath: string;
  projectName: string;
  dimensions: ExportDimension[];
}

export class ZipExportService {
  async exportProject({
    workspacePath,
    projectName,
    dimensions,
  }: ExportProjectOptions): Promise<string[]> {
    const srcPath = path.join(workspacePath, "src");
    const settingsPath = path.join(workspacePath, "settings", "settings.json");

    if (!fs.existsSync(srcPath)) {
      throw new Error("Could not find the src folder.");
    }

    if (!fs.existsSync(settingsPath)) {
      throw new Error("Could not find settings/settings.json.");
    }

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const exportPath = path.join(workspacePath, "export");
    const stylesPath = path.join(srcPath, "styles.css");
    const indexPath = path.join(srcPath, "index.html");
    const files = fs
      .readdirSync(srcPath, { withFileTypes: true })
      .filter((entry) => entry.name !== "dimensions");

    if (!fs.existsSync(indexPath)) {
      throw new Error("Could not find src/index.html.");
    }

    const baseStyles = fs.existsSync(stylesPath)
      ? fs.readFileSync(stylesPath, "utf8")
      : "";
    const originalIndexHtml = fs.readFileSync(indexPath, "utf8");
    const templateJson = JSON.stringify(
      {
        placeholders: settings.placeholders ?? {},
      },
      null,
      2,
    );

    fs.mkdirSync(exportPath, { recursive: true });

    const zipPaths: string[] = [];

    for (const dimension of dimensions) {
      const width = Number(dimension.width);
      const height = Number(dimension.height);

      if (!width || !height) {
        continue;
      }

      const dimensionName = `${width}x${height}`;
      const zipPath = path.join(
        exportPath,
        `${projectName}-${dimensionName}.zip`,
      );
      const dimensionCssPath = path.join(
        srcPath,
        "dimensions",
        `${dimensionName}.css`,
      );

      let mergedStyles = baseStyles;

      if (fs.existsSync(dimensionCssPath)) {
        mergedStyles = [
          baseStyles.trimEnd(),
          "",
          `/* Dimension: ${dimensionName} */`,
          "",
          fs.readFileSync(dimensionCssPath, "utf8").trim(),
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

      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = new ZipArchive({ zlib: { level: 9 } });

        output.on("close", resolve);
        output.on("error", reject);
        archive.on("error", reject);
        archive.pipe(output);

        for (const file of files) {
          const sourcePath = path.join(srcPath, file.name);

          if (file.isDirectory()) {
            archive.directory(sourcePath, file.name);
          } else if (file.name === "styles.css") {
            archive.append(mergedStyles, { name: "styles.css" });
          } else if (file.name === "index.html") {
            archive.append(indexHtml, { name: "index.html" });
          } else {
            archive.file(sourcePath, { name: file.name });
          }
        }

        archive.append(templateJson, { name: "template.json" });
        archive.finalize();
      });

      zipPaths.push(zipPath);
    }

    return zipPaths;
  }
}
