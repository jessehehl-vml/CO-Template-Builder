import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { LemonPiAuth } from "./auth";
import { LemonPiApi } from "./api";
import {
  BoilerplateGenerator,
  BoilerplateMessage,
} from "./boilerplate-generator";
import { ZipExportService } from "./zip-export";
import { PreviewServer } from "./preview-server";
import { BannerReviewService } from "./banner-review";
import type {
  CoExportMessage,
  CommonPanelMessage,
  SettingsPanelMessage,
  SidebarMessage,
  WizardPanelMessage,
} from "./messages";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function activate(context: vscode.ExtensionContext) {
  console.log("[Extension Host] NEW EXTENSION.JS IS RUNNING");
  const auth = new LemonPiAuth(context.secrets);
  const api = new LemonPiApi(auth);
  const reviewService = new BannerReviewService(context.extensionPath);
  const previewServer = new PreviewServer(context.extensionPath, {
    lint: (workspacePath) => reviewService.lint(workspacePath),
    review: (workspacePath, onProgress) =>
      reviewService.review(workspacePath, onProgress),
  });
  context.subscriptions.push(previewServer);

  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    context,
    auth,
    api,
    previewServer,
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
  private exportOnReady = false;
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly auth: LemonPiAuth,
    private readonly api: LemonPiApi,
    private readonly previewServer: PreviewServer,
  ) {}
  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.sidebarWebview = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (message: SidebarMessage) => {
      switch (message.type) {
        case "checkAuthentication":
          await this.sendAuthenticationState(webviewView.webview);
          return;
        case "openExport":
          this.openExportPanel();
          return;
        case "loadProjectState":
          await this.loadProjectState(webviewView.webview);
          return;
        case "logout":
          await this.auth.logout();
          await this.broadcastAuthenticationState();
          return;
        case "exportToZip":
          await this.exportToZip();
          return;
        case "createNewTemplate":
          this.openWizard();
          return;
        case "openSettingsSection":
          this.openSettingsPanel(message.section);
          return;
        case "openPreview":
          this.previewServer.open();
          return;
        case "connectToCreativeOptimizations":
          await this.login(webviewView.webview);
          return;
      }
    });

    webviewView.webview.html = this.getWebviewHtml(
      webviewView.webview,
      "index.html",
    );
  }

  private async loadProjectState(webview: vscode.Webview): Promise<void> {
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

    webview.postMessage({
      type: "projectStateLoaded",
      hasProject,
      ...authState,
    });
  }

  private async selectFolder(webview: vscode.Webview): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select folder",
    });

    if (result?.[0]) {
      webview.postMessage({
        type: "folderSelected",
        folder: result[0].fsPath,
      });
    }
  }

  private async buildCOZip(
    projectName: string,
    dimensionName: string,
  ): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      throw new Error("No workspace folder is open.");
    }

    const [width, height] = dimensionName.split("x").map(Number);

    if (!width || !height) {
      throw new Error(`Invalid dimension: ${dimensionName}`);
    }

    const [zipPath] = await new ZipExportService().exportProject({
      workspacePath: workspaceFolder.uri.fsPath,
      projectName,
      dimensions: [{ width, height }],
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
    const settingsPath = path.join(workspacePath, "settings", "settings.json");

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
      const zipPaths = await new ZipExportService().exportProject({
        workspacePath,
        projectName,
        dimensions,
      });

      vscode.window.showInformationMessage(
        `Export complete: ${zipPaths.length} ZIP${
          zipPaths.length === 1 ? "" : "s"
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
  private async login(webview: vscode.Webview) {
    try {
      console.log("[EXT AUTH] login() starting");

      await this.authenticate();

      console.log("[EXT AUTH] authenticate() completed");

      const token = await this.auth.getAuthToken();

      console.log("[EXT AUTH] token after authenticate:", {
        hasToken: !!token,
      });

      await this.sendAuthenticationState(webview);

      console.log("[EXT AUTH] sendAuthenticationState() completed");

      await this.broadcastAuthenticationState();

      console.log("[EXT AUTH] broadcastAuthenticationState() completed");
    } catch (error) {
      console.error("[EXT AUTH] Login failed:", error);

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

    console.log("[EXT AUTH] Broadcasting authenticationState:", authState);

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

    console.log("[EXT AUTH] authenticationState broadcast complete");
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

  private async getAgencyData() {
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

    return {
      agencies,
      email: user.email,
      name: user.name,
    };
  }

  private async loadAgencyData(
    panel: vscode.WebviewPanel,
    unauthenticatedType: "agencyDataLoaded" | "authenticationState",
  ): Promise<void> {
    try {
      const token = await this.auth.getAuthToken();

      if (!token) {
        panel.webview.postMessage({
          type: unauthenticatedType,
          agencies: [],
          currentAgencyId: null,
          email: null,
          name: null,
          authenticated: false,
        });

        return;
      }

      const { agencies, email, name } = await this.getAgencyData();

      panel.webview.postMessage({
        type: "agencyDataLoaded",
        agencies,
        currentAgencyId: null,
        email,
        name,
      });
    } catch (error) {
      console.error("[SETTINGS] Failed to load agencies:", error);

      panel.webview.postMessage({
        type: "agencyDataError",
        message:
          error instanceof Error ? error.message : "Could not load agencies.",
      });
    }
  }

  private async handleApiRequest<T>(options: {
    panel: vscode.WebviewPanel;
    operation: string;
    request: () => Promise<T>;
    successType: string;
    successPayload: (result: T) => Record<string, unknown>;
    errorType: string;
    errorMessage: string;
    logPrefix: string;
  }): Promise<void> {
    try {
      const result = await options.request();
      options.panel.webview.postMessage({
        type: options.successType,
        ...options.successPayload(result),
      });
    } catch (error) {
      console.error(`${options.logPrefix} Failed:`, error);
      options.panel.webview.postMessage({
        type: options.errorType,
        message: error instanceof Error ? error.message : options.errorMessage,
      });
    }
  }

  private async handleCommonPanelMessage(
    message: CommonPanelMessage,
    panel: vscode.WebviewPanel,
    logPrefix: string,
  ): Promise<void> {
    switch (message.type) {
      case "checkAuthentication":
        await this.sendAuthenticationState(panel.webview);
        return;
      case "connectToCreativeOptimizations":
        await this.login(panel.webview);
        return;
      case "loadWorkspaceFolder":
        panel.webview.postMessage({
          type: "workspaceFolderLoaded",
          folder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,
        });
        return;
      case "loadAdvertisers":
        await this.handleApiRequest({
          panel,
          operation: "loadAdvertisers",
          request: () => this.api.getAdvertisers(message.agencyId),
          successType: "advertisersLoaded",
          successPayload: (advertisers) => ({ advertisers }),
          errorType: "advertisersError",
          errorMessage: "Could not load advertisers.",
          logPrefix,
        });
        return;
      case "loadAdsets":
        await this.handleApiRequest({
          panel,
          operation: "loadAdsets",
          request: () =>
            this.api.getAdSets(message.agencyId, message.advertiserId),
          successType: "adsetsLoaded",
          successPayload: (adsets) => ({ adsets }),
          errorType: "adsetsError",
          errorMessage: "Could not load adsets.",
          logPrefix,
        });
        return;
      case "loadPlaceholders":
        await this.handleApiRequest({
          panel,
          operation: "loadPlaceholders",
          request: () =>
            this.api.getPlaceholders(message.advertiserId, message.adsetId),
          successType: "placeholdersLoaded",
          successPayload: (result) => ({
            variants: result.variants,
            collections: result.collections,
          }),
          errorType: "placeholdersError",
          errorMessage: "Could not load placeholders.",
          logPrefix,
        });
        return;
      case "loadCollectionFields":
        await this.handleApiRequest({
          panel,
          operation: "loadCollectionFields",
          request: async () => {
            await this.authenticate();
            return this.api.getCollectionFields(
              message.agencyId,
              message.advertiserId,
            );
          },
          successType: "collectionFieldsLoaded",
          successPayload: (fields) => ({ fields }),
          errorType: "collectionFieldsError",
          errorMessage: "Could not load collection fields.",
          logPrefix,
        });
        return;
      case "loadProductsBySelector":
        await this.handleApiRequest({
          panel,
          operation: "loadProductsBySelector",
          request: async () => {
            const selector = await this.api.getProductSelector(
              message.advertiserId,
              message.selectorId,
            );
            const products = await this.api.searchProductsBySelector(
              message.advertiserId,
              message.selectorId,
              message.limit ?? 10,
              message.offset ?? 0,
            );

            return { selector, products };
          },
          successType: "productsBySelectorLoaded",
          successPayload: ({ selector, products }) => ({
            selectorId: message.selectorId,
            selectorName: selector.name,
            products,
          }),
          // The webview listens for "productsError".
          errorType: "productsError",
          errorMessage: "Could not load products.",
          logPrefix,
        });
        return;
      case "checkProductSelectors":
        await this.handleApiRequest({
          panel,
          operation: "checkProductSelectors",
          request: () =>
            this.findUnavailableSelectors(
              message.advertiserId,
              message.selectorIds,
            ),
          successType: "productSelectorsChecked",
          successPayload: (unavailable) => ({
            advertiserId: message.advertiserId,
            unavailable,
          }),
          errorType: "productSelectorsError",
          errorMessage: "Could not check product selectors.",
          logPrefix,
        });
        return;
      case "findProductSelectorOwner":
        await this.handleApiRequest({
          panel,
          operation: "findProductSelectorOwner",
          request: () =>
            this.findSelectorOwner(
              message.selectorIds,
              message.preferredAgencyId ?? undefined,
              (progress) =>
                panel.webview.postMessage({
                  type: "productSelectorSearchProgress",
                  progress,
                }),
            ),
          successType: "productSelectorOwnerFound",
          successPayload: (owner) => ({
            owner,
          }),
          errorType: "productSelectorOwnerError",
          errorMessage: "Could not search for the product selector.",
          logPrefix,
        });
        return;
      case "loadCOFonts":
        await this.handleApiRequest({
          panel,
          operation: "loadCOFonts",
          request: () => this.api.getFonts(message.advertiserId),
          successType: "coFontsLoaded",
          successPayload: (fonts) => ({ fonts }),
          errorType: "coFontsError",
          errorMessage: "Could not load fonts.",
          logPrefix: "[CO FONTS]",
        });
        return;
    }
  }

  private async findUnavailableSelectors(
    advertiserId: number,
    selectorIds: string[],
  ): Promise<string[]> {
    const results = await Promise.all(
      selectorIds.map(async (selectorId) => {
        try {
          const selector = await this.api.getProductSelector(
            advertiserId,
            selectorId,
          );

          return selector.valid ? null : selectorId;
        } catch (error) {
          if (errorText(error).includes("(404)")) {
            return selectorId;
          }

          throw error;
        }
      }),
    );

    return results.filter((selectorId) => selectorId !== null);
  }

  private async findSelectorOwner(
    selectorIds: string[],
    preferredAgencyId: number | undefined,
    onProgress: (progress: {
      agencyIndex: number;
      agencyCount: number;
      agencyName: string;
      advertiserCount: number | null;
      advertisersChecked: number;
      totalChecked: number;
    }) => void,
  ) {
    const { agencies } = await this.getAgencyData();

    // Try the agency the user already picked first.
    const ordered = [...agencies].sort(
      (a, b) =>
        Number(b.id === preferredAgencyId) - Number(a.id === preferredAgencyId),
    );

    const batchSize = 8;
    let totalChecked = 0;

    for (const [index, agency] of ordered.entries()) {
      const progress = {
        agencyIndex: index + 1,
        agencyCount: ordered.length,
        agencyName: agency.name,
      };

      onProgress({
        ...progress,
        advertiserCount: null,
        advertisersChecked: 0,
        totalChecked,
      });

      let advertisers;

      try {
        advertisers = await this.api.getAdvertisers(agency.id);
      } catch (error) {
        console.error("[SELECTOR SEARCH] Advertisers failed:", error);
        continue;
      }

      onProgress({
        ...progress,
        advertiserCount: advertisers.length,
        advertisersChecked: 0,
        totalChecked,
      });

      for (let i = 0; i < advertisers.length; i += batchSize) {
        const batch = advertisers.slice(i, i + batchSize);

        const matches = await Promise.all(
          batch.map(async (advertiser) => {
            // Any one known selector identifies the advertiser.
            const found = await Promise.all(
              selectorIds.map((selectorId) =>
                this.api.getProductSelector(advertiser.id, selectorId).then(
                  () => true,
                  () => false,
                ),
              ),
            );

            return found.some(Boolean) ? advertiser : null;
          }),
        );

        const match = matches.find((advertiser) => advertiser !== null);

        if (match) {
          return {
            agency,
            advertiser: { id: match.id, name: match.name },
          };
        }

        totalChecked += batch.length;

        onProgress({
          ...progress,
          advertiserCount: advertisers.length,
          advertisersChecked: i + batch.length,
          totalChecked,
        });
      }
    }

    // The search switches agencies, so go back to the one the user had.
    if (preferredAgencyId !== undefined) {
      await this.auth.switchAgency(preferredAgencyId);
    }

    return null;
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

    panel.webview.onDidReceiveMessage(async (message: SettingsPanelMessage) => {
      switch (message.type) {
        case "saveExportAdvertiser":
          this.saveExportAdvertiser(message.agency, message.advertiser);
          return;
        case "uploadToCO":
          await this.uploadToCO(message, panel);
          return;
        case "loadCOExistingTemplates":
          await this.loadCOExistingTemplates(message, panel);
          return;
        case "loadAgencyData":
          await this.loadAgencyData(panel, "agencyDataLoaded");
          return;
        case "settingsWebviewReady":
          if (this.exportOnReady) {
            this.exportOnReady = false;

            panel.title = "Export to Creative Optimizations";

            panel.webview.postMessage({ type: "openExport" });
          } else {
            panel.webview.postMessage({
              type: "openSettingsSection",
              section,
            });
          }
          return;
        case "loadCOFolders":
          await this.loadCOFolders(message, panel);
          return;
        case "loadSettings":
          await this.loadSettings(panel);
          return;
        case "saveSettings":
          await this.saveSettings(
            message.settings,
            message.content,
            message.collectionMapping,
            panel,
          );
          return;
        default:
          await this.handleCommonPanelMessage(message, panel, "[SETTINGS]");
      }
    });

    // The settings panel reuses the wizard bundle.
    panel.webview.html = this.getWebviewHtml(panel.webview, "wizard.html");

    panel.webview.postMessage({
      type: "openSettingsMode",
      section,
    });
    this.sidebarWebview?.webview.postMessage({
      type: "settingsPanelActive",
      active: true,
    });
  }
  private saveExportAdvertiser(agency: unknown, advertiser: unknown) {
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

      settings.agency = agency;
      settings.advertiser = advertiser;

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    } catch (error) {
      console.error("[EXPORT] Failed to save agency/advertiser:", error);

      vscode.window.showErrorMessage(
        `Failed to save export settings: ${errorText(error)}`,
      );
    }
  }

  private async getExistingDimensions(
    message: CoExportMessage,
    projectName: string | undefined,
  ): Promise<string[]> {
    const templates = await this.api.getTemplates(
      message.agencyId,
      message.advertiserId,
    );

    const folderTemplates = templates.filter(
      (template) => Number(template.folderId) === Number(message.folderId),
    );

    return (message.dimensions ?? []).filter((size) =>
      folderTemplates.some(
        (template) => template.name === `${projectName}_${size}`,
      ),
    );
  }

  private async uploadToCO(
    message: CoExportMessage,
    panel: vscode.WebviewPanel,
  ) {
    try {
      const dimensions = message.dimensions ?? [];

      if (dimensions.length === 0) {
        throw new Error("No export dimensions selected.");
      }

      const projectName = message.projectName?.trim();

      if (!projectName) {
        throw new Error("Project name is required.");
      }

      const templates = await this.api.getTemplates(
        message.agencyId,
        message.advertiserId,
      );

      const results = await Promise.allSettled(
        dimensions.map(async (dimension) => {
          const templateName = `${projectName}_${dimension}`;

          const existingTemplate = templates.find(
            (template) =>
              Number(template.folderId) === Number(message.folderId) &&
              template.name === templateName,
          );

          const zipPath = await this.buildCOZip(projectName, dimension);

          // An existing template is uploaded as a revision.
          await this.api.uploadTemplate({
            agencyId: message.agencyId,
            advertiserId: message.advertiserId,
            folderId: message.folderId,
            templateName,
            zipPath,
            templateId: existingTemplate?.id,
          });

          return existingTemplate ? "updated" : "uploaded";
        }),
      );

      const outcomes = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      const uploaded = outcomes.filter((outcome) => outcome === "uploaded");
      const updated = outcomes.filter((outcome) => outcome === "updated");

      if (failures.length === 0) {
        const parts: string[] = [];

        if (uploaded.length > 0) {
          parts.push(`${uploaded.length} uploaded`);
        }

        if (updated.length > 0) {
          parts.push(`${updated.length} updated`);
        }

        vscode.window.showInformationMessage(
          `Creative Optimizations: ${parts.join(", ")}.`,
        );
      } else {
        console.error("[CO UPLOAD] Failed uploads:", failures.map(errorText));

        vscode.window.showWarningMessage(
          `Creative Optimizations: ${outcomes.length} succeeded, ${failures.length} failed.`,
        );
      }

      panel.webview.postMessage({
        type: "coExistingTemplatesLoaded",
        existingDimensions: await this.getExistingDimensions(
          message,
          projectName,
        ),
      });
    } catch (error) {
      console.error("[CO UPLOAD] Upload failed:", error);

      vscode.window.showErrorMessage(`CO upload failed: ${errorText(error)}`);
    } finally {
      panel.webview.postMessage({ type: "coUploadFinished" });
    }
  }

  private async loadCOExistingTemplates(
    message: CoExportMessage,
    panel: vscode.WebviewPanel,
  ) {
    try {
      await this.authenticate();

      panel.webview.postMessage({
        type: "coExistingTemplatesLoaded",
        existingDimensions: await this.getExistingDimensions(
          message,
          message.projectName,
        ),
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
  }

  private async loadCOFolders(
    message: Pick<CoExportMessage, "agencyId" | "advertiserId">,
    panel: vscode.WebviewPanel,
  ) {
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

  private async createBoilerplate(
    message: BoilerplateMessage,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
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

    const generator = new BoilerplateGenerator(this.context);
    generator.generate(message);

    this.sidebarWebview?.webview.postMessage({
      type: "projectStateLoaded",
      hasProject: true,
    });

    vscode.window.showInformationMessage("Creative boilerplate created.");

    await vscode.window.showTextDocument(
      vscode.Uri.file(path.join(message.folder, "src", "index.html")),
    );

    panel.dispose();
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

    this.wizardPanel = panel;
    panel.onDidDispose(() => {
      if (this.wizardPanel === panel) {
        this.wizardPanel = null;
      }
    });

    panel.webview.onDidReceiveMessage(async (message: WizardPanelMessage) => {
      switch (message.type) {
        case "createBoilerplate":
          try {
            await this.createBoilerplate(message, panel);
          } catch (error) {
            console.error("[BOILERPLATE] Failed:", error);

            vscode.window.showErrorMessage(
              error instanceof Error
                ? error.message
                : "Could not create creative boilerplate.",
            );
          }
          return;
        case "selectFolder":
          await this.selectFolder(panel.webview);
          return;
        case "loadAgencyData":
          await this.loadAgencyData(panel, "authenticationState");
          return;
        default:
          await this.handleCommonPanelMessage(message, panel, "[WIZARD]");
      }
    });
    panel.webview.html = this.getWebviewHtml(panel.webview, "wizard.html");
  }

  private getWebviewHtml(
    webview: vscode.Webview,
    fileName: "index.html" | "wizard.html",
  ): string {
    const htmlPath = path.join(
      this.extensionUri.fsPath,
      "webview-dist",
      fileName,
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
