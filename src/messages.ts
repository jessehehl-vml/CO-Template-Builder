import type { BoilerplateMessage } from "./boilerplate-generator";

export interface CoExportMessage {
  agencyId: number;
  advertiserId: number;
  folderId: number;
  projectName?: string;
  dimensions?: string[];
}

export type SidebarMessage =
  | { type: "checkAuthentication" }
  | { type: "connectToCreativeOptimizations" }
  | { type: "logout" }
  | { type: "loadProjectState" }
  | { type: "createNewTemplate" }
  | { type: "openExport" }
  | { type: "exportToZip" }
  | { type: "openPreview" }
  | { type: "openSettingsSection"; section: 1 | 2 | 3 | 4 };

/** Messages handled identically by the settings and wizard panels. */
export type CommonPanelMessage =
  | { type: "checkAuthentication" }
  | { type: "connectToCreativeOptimizations" }
  | { type: "loadWorkspaceFolder" }
  | { type: "loadAdvertisers"; agencyId: number }
  | { type: "loadAdsets"; agencyId: number; advertiserId: number }
  | { type: "loadPlaceholders"; advertiserId: number; adsetId: number }
  | { type: "loadCollectionFields"; agencyId: number; advertiserId: number }
  | {
      type: "loadProductsBySelector";
      advertiserId: number;
      selectorId: string;
      limit?: number;
      offset?: number;
    }
  | { type: "loadCOFonts"; advertiserId: number }
  | {
      type: "findProductSelectorOwner";
      selectorIds: string[];
      preferredAgencyId?: number | null;
    }
  | {
      type: "checkProductSelectors";
      advertiserId: number;
      selectorIds: string[];
    };

export type SettingsPanelMessage =
  | CommonPanelMessage
  | { type: "settingsWebviewReady" }
  | { type: "loadAgencyData" }
  | { type: "loadSettings" }
  | {
      type: "saveSettings";
      settings: Record<string, unknown>;
      content: Record<string, unknown>;
      collectionMapping: unknown;
    }
  | { type: "saveExportAdvertiser"; agency: unknown; advertiser: unknown }
  | ({ type: "uploadToCO" } & CoExportMessage)
  | ({ type: "loadCOExistingTemplates" } & CoExportMessage)
  | { type: "loadCOFolders"; agencyId: number; advertiserId: number };

export type WizardPanelMessage =
  | CommonPanelMessage
  | { type: "loadAgencyData" }
  | { type: "selectFolder" }
  | ({ type: "createBoilerplate" } & BoilerplateMessage);
