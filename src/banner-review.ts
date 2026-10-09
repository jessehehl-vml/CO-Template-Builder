import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  buildFilesMessage,
  buildInstructions,
  collectBanner,
  fitToBudget,
  parseFindings,
  type Finding,
} from "./banner-review-core";
import { lintBanner, lintContent, sortFindings } from "./banner-lint";

export type LintResult = {
  findings: Finding[];
  filesReviewed: number;
};

export type ReviewResult = LintResult & {
  model: string;
};

const TIMEOUT_MS = 120_000;
// Code averages roughly 3 characters per token.
const CHARS_PER_TOKEN = 3;

export class BannerReviewService {
  private running = false;

  constructor(private readonly extensionPath: string) {}

  // Runs without Copilot, so it works for everyone.
  lint(workspacePath: string): LintResult {
    const { files, assets } = this.load(workspacePath);

    return {
      findings: sortFindings([
        ...lintBanner(files, assets),
        ...lintContent(this.readContent(workspacePath)),
      ]),
      filesReviewed: files.length,
    };
  }

  private readContent(workspacePath: string): unknown {
    const contentPath = path.join(workspacePath, "settings", "content.json");

    try {
      return JSON.parse(fs.readFileSync(contentPath, "utf8"));
    } catch {
      return null;
    }
  }

  private load(workspacePath: string) {
    const srcPath = path.join(workspacePath, "src");

    if (!fs.existsSync(srcPath)) {
      throw new Error("The workspace has no src folder to review.");
    }

    const banner = collectBanner(srcPath);

    if (banner.files.length === 0) {
      throw new Error("No banner files were found in the src folder.");
    }

    return banner;
  }

  async review(
    workspacePath: string,
    onProgress: (message: string) => void = () => {},
  ): Promise<ReviewResult> {
    if (this.running) {
      throw new Error("A review is already running.");
    }

    this.running = true;

    try {
      return await this.run(workspacePath, onProgress);
    } finally {
      this.running = false;
    }
  }

  private async run(
    workspacePath: string,
    onProgress: (message: string) => void,
  ): Promise<ReviewResult> {
    onProgress(
      "Connecting to Copilot (approve the access prompt in VS Code if it appears)",
    );
    const model = await this.pickModel();
    onProgress(`Using ${model.name}`);

    const { files, assets } = this.load(workspacePath);
    const lintFindings = lintBanner(files, assets);
    onProgress(
      `Read ${files.length} files and ${assets.length} assets, ${lintFindings.length} found by the code checks`,
    );

    const instructions = buildInstructions(
      this.loadRules(workspacePath),
      lintFindings,
    );
    const budget = Math.max(
      model.maxInputTokens * CHARS_PER_TOKEN - instructions.length - 4000,
      10_000,
    );
    const fitted = fitToBudget(files, budget);
    const shortened = fitted.filter(
      (file, index) => file.content.length < files[index].content.length,
    ).length;

    if (shortened > 0) {
      onProgress(
        `Shortened ${shortened} large file${shortened === 1 ? "" : "s"} to fit the model's limit`,
      );
    }

    const source = new vscode.CancellationTokenSource();
    const timer = setTimeout(() => source.cancel(), TIMEOUT_MS);

    try {
      onProgress(`Waiting for ${model.name} to respond`);

      const response = await model.sendRequest(
        [
          vscode.LanguageModelChatMessage.User(instructions),
          vscode.LanguageModelChatMessage.User(
            buildFilesMessage(fitted, assets),
          ),
        ],
        {},
        source.token,
      );

      let text = "";
      let lastReport = 0;

      for await (const fragment of response.text) {
        text += fragment;

        if (Date.now() - lastReport > 1500) {
          lastReport = Date.now();

          const found = (text.match(/"rule"\s*:/g) ?? []).length;

          onProgress(
            `Receiving the review: ${found} finding${found === 1 ? "" : "s"} so far`,
          );
        }
      }

      onProgress("Reading the results");

      return {
        findings: parseFindings(text),
        model: model.name,
        filesReviewed: files.length,
      };
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        const hint =
          error.code === "NoPermissions"
            ? "Copilot access was not granted in VS Code."
            : error.code === "Blocked"
              ? "The request was blocked, possibly by your Copilot quota or policy."
              : error.message;

        throw new Error(`The AI review could not run: ${hint}`);
      }

      throw error;
    } finally {
      clearTimeout(timer);
      source.dispose();
    }
  }

  private async pickModel(): Promise<vscode.LanguageModelChat> {
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });

    if (models.length === 0) {
      throw new Error(
        "No Copilot language model is available. Make sure GitHub Copilot is installed and you are signed in.",
      );
    }

    // The largest context window fits the most banner code.
    return [...models].sort((a, b) => b.maxInputTokens - a.maxInputTokens)[0];
  }

  private loadRules(workspacePath: string): string {
    const rules = [
      fs.readFileSync(path.join(this.extensionPath, "qa", "rules.md"), "utf8"),
    ];

    const projectRules = path.join(workspacePath, "qa-rules.md");

    if (fs.existsSync(projectRules)) {
      rules.push(
        "## Project-specific rules\n\n" + fs.readFileSync(projectRules, "utf8"),
      );
    }

    return rules.join("\n\n");
  }
}
