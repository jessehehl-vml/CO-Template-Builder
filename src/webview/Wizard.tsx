import React, { useEffect, useRef, useState } from "react";
import { parseFeed, type ParsedFeed } from "../feed";
declare global {
  interface Window {
    __WIZARD_MODE__?: "create" | "export";
  }
}
import WizardProgress from "./components/WizardProgress";
import NameSection from "./components/NameSection";
import DimensionsSection from "./components/DimensionsSection";
import PlaceholdersSection from "./components/PlaceholdersSection";
import FontsSection from "./components/FontsSection";
import CreateSection from "./components/CreateSection";
import WizardFooter from "./components/WizardFooter";
import AdvertiserSelectionModal from "./components/AdvertiserSelectionModal";
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

type Step = 1 | 2 | 3 | 4 | 5;

type COFolder = {
  "asset-tree/id": number;
  "asset-tree/name": string;
  "asset-tree/parent-id": number;
  "asset-tree/advertiser-id": number;
  "asset-tree/folder-type": string;
  children?: COFolder[];
};
function FolderNode({
  folder,
  selectedCOFolder,
  expandedCOFolders,
  setExpandedCOFolders,
  onSelect,
  depth = 0,
}: {
  folder: COFolder;
  selectedCOFolder: number | null;
  expandedCOFolders: Set<number>;
  setExpandedCOFolders: React.Dispatch<React.SetStateAction<Set<number>>>;
  onSelect: (folder: COFolder) => void;
  depth?: number;
}) {
  const folderId = folder["asset-tree/id"];
  const folderName = folder["asset-tree/name"];
  const hasChildren = !!folder.children?.length;

  const isExpanded = expandedCOFolders.has(folderId);
  const isSelected = selectedCOFolder === folderId;

  const toggleExpanded = () => {
    setExpandedCOFolders((current) => {
      const next = new Set(current);

      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  };

  return (
    <div className="export-folder-node">
      <div
        className="export-folder-row"
        style={{
          paddingLeft: `${0 + depth * 12}px`,
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="export-folder-toggle"
            aria-label={
              isExpanded ? `Collapse ${folderName}` : `Expand ${folderName}`
            }
            aria-expanded={isExpanded}
            onClick={toggleExpanded}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="export-folder-toggle-placeholder" />
        )}

        <button
          type="button"
          className={`export-folder-button ${isSelected ? "selected" : ""}`}
          onClick={() => onSelect(folder)}
        >
          <span>{folderName}</span>
        </button>
      </div>

      {isExpanded &&
        folder.children?.map((child) => (
          <FolderNode
            key={child["asset-tree/id"]}
            folder={child}
            selectedCOFolder={selectedCOFolder}
            expandedCOFolders={expandedCOFolders}
            setExpandedCOFolders={setExpandedCOFolders}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export default function Wizard() {
  // Settings
  const [settingsSection, setSettingsSection] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [settingsMode, setSettingsMode] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [loadedSettings, setLoadedSettings] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [loadedCollections, setLoadedCollections] = useState<
    CollectionSetting[]
  >([]);
  const [loadedContent, setLoadedContent] = useState<any>(null);
  const [customDimensions, setCustomDimensions] = useState<
    { width: string; height: string }[]
  >([]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const productRequestsLoaded = useRef<Set<string>>(new Set());
  useEffect(() => {
    vscode.postMessage({
      type: "checkAuthentication",
    });
  }, []);

  useEffect(() => {
    vscode.postMessage({
      type: "settingsWebviewReady",
    });
  }, []);

  // Progress
  const [step, setStep] = useState<Step>(1);
  const [maxStepReached, setMaxStepReached] = useState<Step>(1);

  // Authentication
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  // CO data
  type Agency = {
    id: number;
    name: string;
  };

  type Advertiser = {
    id: number;
    name: string;
  };

  type AdSet = {
    id: number;
    name: string;
  };
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [adsets, setAdsets] = useState<AdSet[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<number | null>(null);
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<number | null>(
    null,
  );
  const [selectedAgencyName, setSelectedAgencyName] = useState<string | null>(
    null,
  );
  const [selectedAdvertiserName, setSelectedAdvertiserName] = useState<
    string | null
  >(null);
  const [selectedAdset, setSelectedAdset] = useState<string | null>(null);
  const [selectedAdsetId, setSelectedAdsetId] = useState<number | null>(null);
  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [loadingAdvertisers, setLoadingAdvertisers] = useState(false);
  const [loadingAdsets, setLoadingAdsets] = useState(false);

  // API
  const [apiError, setApiError] = useState<string | null>(null);

  // Adset Details
  const [name, setName] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Dimensions
  type DimensionOption = {
    size: string;
    label: string;
  };
  const DIMENSIONS: DimensionOption[] = [
    { size: "300x250", label: "Medium Rectangle" },
    { size: "300x600", label: "Half Page" },
    { size: "160x600", label: "Wide Skyscraper" },
    { size: "728x90", label: "Leaderboard" },
    { size: "970x250", label: "Billboard" },
    { size: "320x50", label: "Mobile Banner" },
  ];
  const [dimensionType, setDimensionType] = useState<"single" | "responsive">(
    "single",
  );
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);

  // Placeholders
  const [parsedFeed, setParsedFeed] = useState<ParsedFeed | null>(null);
  const [isFeedMappingFinished, setIsFeedMappingFinished] = useState(false);
  const PLACEHOLDER_TYPES = [
    "not used",
    "text",
    "image",
    "video",
    "audio",
    "click",
    "collection",
  ] as const;

  type PlaceholderType = (typeof PLACEHOLDER_TYPES)[number];
  type Placeholder = {
    name: string;
    type: PlaceholderType;
    value: unknown;
  };
  type CollectionSetting = {
    name: string;
    type: "collection";
    intent?: string;
    items_required?: number;
    placeholders?: Record<
      string,
      {
        type: PlaceholderType;
      }
    >;
  };
  type PlaceholderDimension = {
    templateDimension: string;
    width: number;
    height: number;
    productSelectorId?: string;
    placeholders: Placeholder[];
  };

  type PlaceholderVariant = {
    contentId: string;
    variantId: number | string | null;
    dimensions: PlaceholderDimension[];
  };
  const [placeholderVariants, setPlaceholderVariants] = useState<
    PlaceholderVariant[]
  >([]);
  type CollectionField = {
    name: string;
    id: number;
    slot: number;
    type: string;
    sortable: boolean;
    "empty-string-is-undefined"?: boolean;
  };

  type CollectionFieldMapping = {
    productField: CollectionField;
    placeholder: string;
    placeholderType: PlaceholderType;
    selected: boolean;
  };
  const [collectionMappings, setCollectionMappings] = useState<
    CollectionFieldMapping[]
  >([]);
  type ProductsBySelector = Record<
    string,
    {
      name: string;
      products: unknown;
    }
  >;
  const [products, setProducts] = useState<ProductsBySelector>({});
  const [collectionMapping, setCollectionMapping] = useState<{
    collection: string;
    intent: string;
    required: string;
    fields: {
      productField: string;
      placeholder: string;
      placeholderType: PlaceholderType;
    }[];
  } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalMode, setImportModalMode] = useState<
    "placeholders" | "collectionFields" | "fonts"
  >("placeholders");

  // Fonts
  type COFont = {
    "font-family": string;
    "css-base-url": string;
    variants: {
      "font-weight": number;
      "font-style"?: string;
      variant: string;
    }[];
  };

  type SelectedFont = {
    id: number;
    family: string;
    variant: string;
    fontUrl: string;
  };

  const [coFonts, setCoFonts] = useState<COFont[]>([]);
  const [selectedFonts, setSelectedFonts] = useState<SelectedFont[]>([]);
  const [loadingFonts, setLoadingFonts] = useState(false);
  const [showFontImportModal, setShowFontImportModal] = useState(false);
  const [showExportAdvertiserModal, setShowExportAdvertiserModal] =
    useState(false);
  const hasIncompleteFont = selectedFonts.some(
    (font) => !font.family || !font.variant,
  );

  // Create Boilerplate
  const [frameCount, setFrameCount] = useState(1);
  const [autoFillPlaceholderContent, setAutoFillPlaceholderContent] =
    useState(false);

  // Export to CO
  const [exportMode, setExportMode] = useState(
    window.__WIZARD_MODE__ === "export",
  );
  const [selectedCOFolder, setSelectedCOFolder] = useState<number | null>(1);
  const [selectedCOFolderName, setSelectedCOFolderName] = useState<
    string | null
  >(null);
  const [coRootFolder, setCORootFolder] = useState<COFolder | null>(null);

  const [coFolders, setCOFolders] = useState<COFolder[]>([]);
  const [expandedCOFolders, setExpandedCOFolders] = useState<Set<number>>(
    new Set(),
  );
  const [selectedExportDimensions, setSelectedExportDimensions] = useState<
    string[]
  >([]);
  const [existingExportDimensions, setExistingExportDimensions] = useState<
    string[]
  >([]);
  const [isUploading, setIsUploading] = useState(false);

  // load current folder
  useEffect(() => {
    vscode.postMessage({
      type: "loadWorkspaceFolder",
    });
  }, []);

  // Max steps
  useEffect(() => {
    setMaxStepReached((currentMax) => Math.max(currentMax, step) as Step);
  }, [step]);

  // Export mode
  useEffect(() => {
    if (
      !exportMode ||
      !isAuthenticated ||
      !selectedAgency ||
      !selectedAdvertiser
    ) {
      return;
    }

    vscode.postMessage({
      type: "loadCOFolders",
      agencyId: selectedAgency,
      advertiserId: selectedAdvertiser,
    });
  }, [exportMode, isAuthenticated, selectedAgency, selectedAdvertiser]);

  // Open advertiser selection after connecting
  useEffect(() => {
    if (!exportMode || settingsMode || !isAuthenticated || selectedAdvertiser) {
      return;
    }

    setShowExportAdvertiserModal(true);
  }, [exportMode, settingsMode, isAuthenticated, selectedAdvertiser]);
  // folder check
  useEffect(() => {
    if (
      !exportMode ||
      !isAuthenticated ||
      !selectedAgency ||
      !selectedAdvertiser ||
      selectedCOFolder === null ||
      !name.trim()
    ) {
      return;
    }

    vscode.postMessage({
      type: "loadCOExistingTemplates",
      agencyId: selectedAgency,
      advertiserId: selectedAdvertiser,
      folderId: selectedCOFolder,
      projectName: name.trim(),
      dimensions: selectedDimensions,
    });
  }, [
    exportMode,
    selectedAgency,
    selectedAdvertiser,
    selectedCOFolder,
    name,
    selectedDimensions,
  ]);
  // Message Handler
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === "workspaceFolderLoaded") {
        const folder = message.folder ?? null;

        if (folder) {
          setSelectedFolder(folder);
        }
      }
      if (message.type === "coUploadFinished") {
        setIsUploading(false);
      }
      if (message.type === "openExport") {
        setSettingsMode(false);
        setExportMode(true);

        vscode.postMessage({
          type: "loadSettings",
        });

        return;
      }
      if (message.type === "coFoldersLoaded") {
        setCOFolders(message.folders);
        setCORootFolder(message.rootFolder ?? null);

        if (message.rootFolder) {
          setSelectedCOFolder(message.rootFolder["asset-tree/id"]);
          setSelectedCOFolderName("Root");
        }

        return;
      }
      if (message.type === "coFoldersError") {
        setApiError(message.message);
        return;
      }
      if (message.type === "coExistingTemplatesLoaded") {
        console.log(
          "[EXPORT] Existing export dimensions:",
          message.existingDimensions,
        );

        setExistingExportDimensions(message.existingDimensions ?? []);
        return;
      }
      if (message.type === "folderSelected") {
        setSelectedFolder(message.folder);
      }
      if (message.type === "openSettingsSection") {
        setExportMode(false);
        setSettingsMode(true);
        setSettingsSection(message.section);
        setStep(message.section);
        setSettingsLoaded(false);

        vscode.postMessage({
          type: "loadSettings",
        });

        return;
      }
      if (message.type === "settingsLoaded") {
        if (message.error) {
          setApiError(message.error);
          return;
        }
        const settings = message.settings;

        if (!settings) {
          setApiError("Could not load settings.");
          return;
        }

        setLoadedSettings(settings);
        setLoadedContent(message.content ?? null);
        const collections = Object.entries(settings.placeholders ?? {})
          .filter(([, config]) => {
            const collection = config as CollectionSetting;

            return (
              collection.type === "collection" &&
              collection.placeholders &&
              Object.keys(collection.placeholders).length > 0
            );
          })
          .map(([name, config]) => ({
            name,
            ...(config as Omit<CollectionSetting, "name">),
          }));

        setLoadedCollections(collections);
        const collection = collections[0];

        if (collection) {
          setCollectionMapping({
            collection: collection.name,
            intent: collection.intent ?? "",
            required: String(collection.items_required ?? 1),
            fields: Object.entries(collection.placeholders ?? {}).map(
              ([placeholder, config]) => ({
                productField: placeholder,
                placeholder,
                placeholderType: config.type,
                selected: true,
              }),
            ),
          });
        }
        if (Array.isArray(settings.fonts)) {
          setCoFonts(settings.fonts as COFont[]);
        }
        if (Array.isArray(settings.selectedFonts)) {
          setSelectedFonts(
            settings.selectedFonts.map(
              (font: { family: string; variant: string; fontUrl: string }) => ({
                id: Date.now() + Math.random(),
                family: font.family,
                variant: font.variant,
                fontUrl: font.fontUrl,
              }),
            ),
          );
        }
        const savedAgency = settings.agency as { id?: number } | undefined;
        const savedAdvertiser = settings.advertiser as
          | { id?: number }
          | undefined;

        if (savedAgency?.id) {
          setSelectedAgency(savedAgency.id);
          setSelectedAgencyName(
            (settings.agency as { name?: string } | undefined)?.name ?? null,
          );
        }

        if (savedAdvertiser?.id) {
          setSelectedAdvertiser(savedAdvertiser.id);
          setSelectedAdvertiserName(
            (settings.advertiser as { name?: string } | undefined)?.name ??
              null,
          );
        }

        if (settings.projectName) {
          setName(settings.projectName);
        }

        if (
          settings.adsetType === "single" ||
          settings.adsetType === "responsive"
        ) {
          setDimensionType(settings.adsetType);
        }

        if (Array.isArray(settings.dimensions)) {
          const savedDimensions = settings.dimensions as {
            width: number;
            height: number;
          }[];

          const presetSizes = new Set(
            DIMENSIONS.map((dimension) => dimension.size),
          );

          const restoredSelectedDimensions: string[] = [];
          const restoredCustomDimensions: {
            width: string;
            height: string;
          }[] = [];

          savedDimensions.forEach((dimension) => {
            const size = `${dimension.width}x${dimension.height}`;

            if (presetSizes.has(size)) {
              // Existing preset dimension
              restoredSelectedDimensions.push(size);
            } else {
              // Custom dimension
              const customIndex = restoredCustomDimensions.length;

              restoredCustomDimensions.push({
                width: String(dimension.width),
                height: String(dimension.height),
              });

              if (settings.adsetType === "single") {
                restoredSelectedDimensions.push("custom");
              } else {
                restoredSelectedDimensions.push(`custom-${customIndex}`);
              }
            }
          });

          setSelectedDimensions(restoredSelectedDimensions);
          setSelectedExportDimensions(restoredSelectedDimensions);
          setCustomDimensions(restoredCustomDimensions);
        }

        if (Array.isArray(message.content?.variants)) {
          const typeMap = new Map(
            Object.entries(settings.placeholders ?? {})
              .filter(
                ([, config]) =>
                  (config as { type?: string }).type !== "collection",
              )
              .map(([name, config]) => [
                name,
                (config as { type: PlaceholderType }).type,
              ]),
          );

          const variants = message.content.variants.map((variant: any) => ({
            ...variant,
            dimensions: variant.dimensions.map((dimension: any) => ({
              ...dimension,
              placeholders: dimension.placeholders.map((placeholder: any) => ({
                ...placeholder,
                type: typeMap.get(placeholder.name) ?? placeholder.type,
              })),
            })),
          }));

          setPlaceholderVariants(variants);
          setSelectedVariantIndex(0);

          const restoredProducts: ProductsBySelector = {};

          message.content.variants.forEach((variant: PlaceholderVariant) => {
            variant.dimensions?.forEach((dimension) => {
              const selectorId = dimension.productSelectorId;

              if (!selectorId) {
                return;
              }

              const collection = dimension.placeholders?.find(
                (placeholder) =>
                  placeholder.type === "collection" &&
                  Array.isArray(placeholder.value),
              );

              if (!collection || !Array.isArray(collection.value)) {
                return;
              }

              restoredProducts[selectorId] = {
                name: collection.name,
                products: {
                  items: collection.value.map((product) => ({
                    fields: product,
                  })),
                },
              };

              productRequestsLoaded.current.add(selectorId);
            });
          });

          if (Object.keys(restoredProducts).length > 0) {
            setProducts((current) => ({
              ...current,
              ...restoredProducts,
            }));
          }
        }

        setSettingsLoaded(true);
        return;
      }

      if (message.type === "authenticationState") {
        setIsAuthenticated(message.authenticated);

        if (message.authenticated) {
          setUserEmail(message.email ?? null);
          setUserName(message.name ?? null);
        } else {
          setUserEmail(null);
          setUserName(null);
        }

        return;
      }

      if (message.type === "agencyDataLoaded") {
        setAgencies(message.agencies);
        setUserEmail(message.email ?? null);
        setUserName(message.name ?? null);
        setLoadingAgencies(false);
        setApiError(null);

        return;
      }

      if (message.type === "agencyDataError") {
        setLoadingAgencies(false);
        setApiError(message.message);

        return;
      }
      if (message.type === "advertisersLoaded") {
        setAdvertisers(message.advertisers);
        setLoadingAdvertisers(false);
        setApiError(null);
        return;
      }

      if (message.type === "advertisersError") {
        setLoadingAdvertisers(false);
        setApiError(message.message);
        return;
      }

      if (message.type === "coFontsLoaded") {
        const fonts = message.fonts ?? [];

        setCoFonts(fonts);
        setLoadingFonts(false);
        setShowFontImportModal(false);
        setApiError(null);

        setSelectedFonts((current) => {
          if (settingsMode && Array.isArray(loadedSettings?.selectedFonts)) {
            return loadedSettings.selectedFonts.map(
              (font: { family: string; variant: string; fontUrl: string }) => ({
                id: Date.now() + Math.random(),
                family: font.family,
                variant: font.variant,
                fontUrl: font.fontUrl,
              }),
            );
          }

          if (current.length > 0) {
            return current;
          }

          if (fonts.length > 0) {
            return [
              {
                id: Date.now(),
                family: "",
                variant: "",
                fontUrl: "",
              },
            ];
          }

          return [];
        });

        return;
      }

      if (message.type === "coFontsError") {
        setLoadingFonts(false);
        return;
      }
    };

    window.addEventListener("message", handler);

    return () => {
      window.removeEventListener("message", handler);
    };
  }, []);

  // Has Settings Changed
  const hasSettingsChanges = (() => {
    if (!settingsMode || !settingsLoaded || !loadedSettings) {
      return false;
    }

    switch (settingsSection) {
      case 1:
        return name !== loadedSettings.projectName;

      case 2: {
        const savedDimensions = Array.isArray(loadedSettings.dimensions)
          ? loadedSettings.dimensions
          : [];

        const currentDimensions =
          dimensionType === "single"
            ? selectedDimensions.slice(0, 1)
            : selectedDimensions;

        return (
          dimensionType !== loadedSettings.adsetType ||
          JSON.stringify(currentDimensions) !== JSON.stringify(savedDimensions)
        );
      }

      case 3:
        return (
          JSON.stringify(placeholderVariants) !==
            JSON.stringify(loadedContent?.variants ?? []) ||
          JSON.stringify(collectionMapping) !==
            JSON.stringify(
              loadedCollections.length > 0 ? loadedCollections[0] : null,
            )
        );

      case 4:
        return (
          JSON.stringify(coFonts) !==
            JSON.stringify(loadedSettings.fonts ?? []) ||
          JSON.stringify(selectedFonts) !==
            JSON.stringify(loadedSettings.selectedFonts ?? [])
        );

      default:
        return false;
    }
  })();

  // Get current Settings
  const getCurrentSettings = () => {
    switch (settingsSection) {
      case 1:
        return {
          projectName: name,
        };

      case 2: {
        const dimensions = selectedDimensions
          .map((size) => {
            // Preset dimension
            if (!size.startsWith("custom")) {
              const [width, height] = size.split("x").map(Number);

              if (!Number.isFinite(width) || !Number.isFinite(height)) {
                return null;
              }

              return { width, height };
            }

            // Custom dimension
            const index =
              size === "custom" ? 0 : Number(size.replace("custom-", ""));

            const customDimension = customDimensions[index];

            if (!customDimension) {
              return null;
            }

            const width = Number(customDimension.width);
            const height = Number(customDimension.height);

            if (!Number.isFinite(width) || !Number.isFinite(height)) {
              return null;
            }

            return { width, height };
          })
          .filter(
            (dimension): dimension is { width: number; height: number } =>
              dimension !== null,
          );

        return {
          adsetType: dimensionType,
          dimensions,
        };
      }

      case 3:
        return {
          placeholders: Array.from(
            new Map(
              placeholderVariants
                .flatMap((variant) =>
                  variant.dimensions.flatMap(
                    (dimension) => dimension.placeholders,
                  ),
                )
                .map((placeholder) => [
                  placeholder.name,
                  {
                    name: placeholder.name,
                    type: placeholder.type,
                  },
                ]),
            ).values(),
          ),
        };

      case 4:
        return {
          fonts: coFonts,
          selectedFonts: selectedFonts.map((font) => ({
            family: font.family,
            variant: font.variant,
            fontUrl: font.fontUrl,
          })),
        };

      default:
        return {};
    }
  };

  // Selected adset
  useEffect(() => {
    if (
      !settingsMode ||
      !settingsLoaded ||
      !loadedSettings ||
      !Array.isArray(adsets)
    ) {
      return;
    }

    const savedAdset = loadedSettings.adset as
      | { id?: number; name?: string }
      | undefined;

    if (!savedAdset?.id) {
      return;
    }

    const adset = adsets.find((item) => item.id === savedAdset.id);

    if (!adset) {
      return;
    }

    setSelectedAdsetId(adset.id);
    setSelectedAdset(adset.name);
  }, [settingsMode, settingsLoaded, loadedSettings, adsets]);

  // Load agencies for Fonts and Export
  useEffect(() => {
    if (!showFontImportModal && !showExportAdvertiserModal) {
      return;
    }

    setLoadingAgencies(true);
    setApiError(null);

    vscode.postMessage({
      type: "loadAgencyData",
    });
  }, [showFontImportModal, showExportAdvertiserModal]);

  // Load advertisers for import modals
  // Load advertisers for import modals and export advertiser modal
  useEffect(() => {
    if (
      !isAuthenticated ||
      (!showImportModal &&
        !showFontImportModal &&
        !showExportAdvertiserModal) ||
      !selectedAgency
    ) {
      return;
    }

    setLoadingAdvertisers(true);
    setApiError(null);

    vscode.postMessage({
      type: "loadAdvertisers",
      agencyId: selectedAgency,
    });
  }, [
    isAuthenticated,
    showImportModal,
    showFontImportModal,
    showExportAdvertiserModal,
    selectedAgency,
  ]);
  return (
    <div className="app">
      <div className="main">
        {!settingsMode && !exportMode && (
          <WizardProgress
            step={step}
            maxStepReached={maxStepReached}
            setStep={setStep}
          />
        )}
        <main className="content">
          {!settingsMode && !exportMode && (
            <>
              {step === 1 && (
                <NameSection
                  vscode={vscode}
                  name={name}
                  setName={setName}
                  selectedFolder={selectedFolder}
                  setSelectedFolder={setSelectedFolder}
                  settingsMode={false}
                />
              )}

              {step === 2 && (
                <DimensionsSection
                  dimensionType={dimensionType}
                  setDimensionType={setDimensionType}
                  selectedDimensions={selectedDimensions}
                  setSelectedDimensions={setSelectedDimensions}
                />
              )}

              {step === 3 && (
                <PlaceholdersSection
                  vscode={vscode}
                  dimensionType={dimensionType}
                  selectedDimensions={selectedDimensions}
                  selectedAgency={selectedAgency}
                  setSelectedAgency={setSelectedAgency}
                  selectedAdvertiser={selectedAdvertiser}
                  setSelectedAdvertiser={setSelectedAdvertiser}
                  selectedAdsetId={selectedAdsetId}
                  setSelectedAdsetId={setSelectedAdsetId}
                  setSelectedAdset={setSelectedAdset}
                  agencies={agencies}
                  setAgencies={setAgencies}
                  advertisers={advertisers}
                  setAdvertisers={setAdvertisers}
                  adsets={adsets}
                  setAdsets={setAdsets}
                  isAuthenticated={isAuthenticated}
                  userEmail={userEmail}
                  apiError={apiError}
                  setApiError={setApiError}
                  placeholderVariants={placeholderVariants}
                  setPlaceholderVariants={setPlaceholderVariants}
                  parsedFeed={parsedFeed}
                  setParsedFeed={setParsedFeed}
                  isFeedMappingFinished={isFeedMappingFinished}
                  setIsFeedMappingFinished={setIsFeedMappingFinished}
                  collectionMapping={collectionMapping}
                  setCollectionMapping={setCollectionMapping}
                  products={products}
                  setProducts={setProducts}
                />
              )}

              {step === 4 && (
                <FontsSection
                  vscode={vscode}
                  coFonts={coFonts}
                  selectedFonts={selectedFonts}
                  setSelectedFonts={setSelectedFonts}
                  showFontImportModal={showFontImportModal}
                  setShowFontImportModal={setShowFontImportModal}
                  loadingFonts={loadingFonts}
                  setLoadingFonts={setLoadingFonts}
                  isAuthenticated={isAuthenticated}
                  userEmail={userEmail}
                  agencies={agencies}
                  advertisers={advertisers}
                  selectedAgency={selectedAgency}
                  setSelectedAgency={setSelectedAgency}
                  selectedAdvertiser={selectedAdvertiser}
                  selectedAdvertiserName={selectedAdvertiserName}
                  setSelectedAdvertiser={setSelectedAdvertiser}
                  loadingAgencies={loadingAgencies}
                  setLoadingAgencies={setLoadingAgencies}
                  apiError={apiError}
                  setApiError={setApiError}
                />
              )}

              {step === 5 && (
                <CreateSection
                  name={name}
                  dimensionType={dimensionType}
                  selectedDimensions={selectedDimensions}
                  selectedAdset={selectedAdset}
                  frameCount={frameCount}
                  setFrameCount={setFrameCount}
                  autoFillPlaceholderContent={autoFillPlaceholderContent}
                  setAutoFillPlaceholderContent={setAutoFillPlaceholderContent}
                  onExport={() => setExportMode(true)}
                />
              )}
            </>
          )}

          {settingsMode && (
            <>
              {settingsSection === 1 && (
                <NameSection
                  vscode={vscode}
                  name={name}
                  setName={setName}
                  selectedFolder={selectedFolder}
                  setSelectedFolder={setSelectedFolder}
                  settingsMode={true}
                />
              )}

              {settingsSection === 2 && (
                <DimensionsSection
                  dimensionType={dimensionType}
                  setDimensionType={setDimensionType}
                  selectedDimensions={selectedDimensions}
                  setSelectedDimensions={setSelectedDimensions}
                />
              )}

              {settingsSection === 3 && (
                <PlaceholdersSection
                  vscode={vscode}
                  dimensionType={dimensionType}
                  selectedDimensions={selectedDimensions}
                  selectedAgency={selectedAgency}
                  setSelectedAgency={setSelectedAgency}
                  selectedAdvertiser={selectedAdvertiser}
                  setSelectedAdvertiser={setSelectedAdvertiser}
                  selectedAdsetId={selectedAdsetId}
                  setSelectedAdsetId={setSelectedAdsetId}
                  setSelectedAdset={setSelectedAdset}
                  agencies={agencies}
                  setAgencies={setAgencies}
                  advertisers={advertisers}
                  setAdvertisers={setAdvertisers}
                  adsets={adsets}
                  setAdsets={setAdsets}
                  isAuthenticated={isAuthenticated}
                  userEmail={userEmail}
                  apiError={apiError}
                  setApiError={setApiError}
                  placeholderVariants={placeholderVariants}
                  setPlaceholderVariants={setPlaceholderVariants}
                  parsedFeed={parsedFeed}
                  setParsedFeed={setParsedFeed}
                  isFeedMappingFinished={isFeedMappingFinished}
                  setIsFeedMappingFinished={setIsFeedMappingFinished}
                  collectionMapping={collectionMapping}
                  setCollectionMapping={setCollectionMapping}
                  products={products}
                  setProducts={setProducts}
                />
              )}

              {settingsSection === 4 && (
                <FontsSection
                  vscode={vscode}
                  coFonts={coFonts}
                  selectedFonts={selectedFonts}
                  setSelectedFonts={setSelectedFonts}
                  showFontImportModal={showFontImportModal}
                  setShowFontImportModal={setShowFontImportModal}
                  loadingFonts={loadingFonts}
                  setLoadingFonts={setLoadingFonts}
                  isAuthenticated={isAuthenticated}
                  userEmail={userEmail}
                  agencies={agencies}
                  advertisers={advertisers}
                  selectedAgency={selectedAgency}
                  setSelectedAgency={setSelectedAgency}
                  selectedAdvertiser={selectedAdvertiser}
                  selectedAdvertiserName={selectedAdvertiserName}
                  setSelectedAdvertiser={setSelectedAdvertiser}
                  loadingAgencies={loadingAgencies}
                  setLoadingAgencies={setLoadingAgencies}
                  apiError={apiError}
                  setApiError={setApiError}
                />
              )}
            </>
          )}
          {exportMode && !settingsMode && !isAuthenticated && (
            <section>
              <h1>Export to Creative Optimizations</h1>

              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setApiError(null);

                  vscode.postMessage({
                    type: "connectToCreativeOptimizations",
                  });
                }}
              >
                Connect to Creative Optimizations
              </button>
            </section>
          )}
          {exportMode && !settingsMode && isAuthenticated && (
            <section>
              <h1>Export to Creative Optimizations</h1>

              <div className="export-selection">
                <div className="export-selection-row">
                  <span>Advertiser</span>

                  <strong>
                    {selectedAdvertiserName || "No advertiser selected"}
                  </strong>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setApiError(null);
                      setShowExportAdvertiserModal(true);
                    }}
                  >
                    {selectedAdvertiser ? "Change" : "Select"}
                  </button>
                </div>

                <div className="export-selection-row">
                  <span>Filename</span>
                  <strong>
                    {name.trim()
                      ? `${name.trim()}_{width}x{height}`
                      : "{projectname}_{width}x{height}"}
                  </strong>
                </div>
              </div>
              <div className="export-section">
                <span>Folder</span>

                <div className="export-folders">
                  <button
                    type="button"
                    className={`export-folder-button ${
                      selectedCOFolder === coRootFolder?.["asset-tree/id"]
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => {
                      if (!coRootFolder) {
                        return;
                      }

                      setSelectedCOFolder(coRootFolder["asset-tree/id"]);
                      setSelectedCOFolderName("Root");
                    }}
                  >
                    Root
                  </button>
                  {coFolders.map((folder) => (
                    <FolderNode
                      key={folder["asset-tree/id"]}
                      folder={folder}
                      selectedCOFolder={selectedCOFolder}
                      expandedCOFolders={expandedCOFolders}
                      setExpandedCOFolders={setExpandedCOFolders}
                      onSelect={(folder) => {
                        setSelectedCOFolder(folder["asset-tree/id"]);
                        setSelectedCOFolderName(folder["asset-tree/name"]);
                      }}
                      depth={1}
                    />
                  ))}
                </div>
              </div>
              <div className="export-section">
                <span>Sizes</span>

                <div className="export-sizes">
                  {selectedDimensions.map((size) => (
                    <label key={size} className="export-size-option">
                      <input
                        type="checkbox"
                        checked={selectedExportDimensions.includes(size)}
                        onChange={() => {
                          setSelectedExportDimensions((current) =>
                            current.includes(size)
                              ? current.filter((item) => item !== size)
                              : [...current, size],
                          );
                        }}
                      />

                      <span className="export-size-info">
                        <strong>{size}</strong>

                        {existingExportDimensions.includes(size) && (
                          <span className="export-size-exists">
                            <span
                              className="export-size-exists-icon"
                              aria-hidden="true"
                            >
                              ⚠
                            </span>
                            Already exists
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="export-actions">
                <button
                  type="button"
                  className="primary-button export-button"
                  disabled={
                    isUploading ||
                    !isAuthenticated ||
                    !selectedAgency ||
                    !selectedAdvertiser ||
                    selectedCOFolder === null ||
                    selectedExportDimensions.length === 0
                  }
                  onClick={(event) => {
                    console.log("[EXPORT] Upload button clicked");

                    setIsUploading(true);

                    vscode.postMessage({
                      type: "uploadToCO",
                      agencyId: selectedAgency,
                      advertiserId: selectedAdvertiser,
                      folderId: selectedCOFolder,
                      projectName: name.trim(),
                      dimensions: selectedExportDimensions,
                    });
                  }}
                >
                  {isUploading
                    ? "Uploading…"
                    : "Upload to Creative Optimizations"}
                </button>
              </div>
            </section>
          )}
          <AdvertiserSelectionModal
            vscode={vscode}
            isOpen={showExportAdvertiserModal}
            onClose={() => setShowExportAdvertiserModal(false)}
            title="Change advertiser"
            description="Select the agency and advertiser to export to."
            confirmLabel="Select"
            confirmDisabled={!selectedAdvertiser}
            isAuthenticated={isAuthenticated}
            userEmail={userEmail}
            agencies={agencies}
            advertisers={advertisers}
            selectedAgency={selectedAgency}
            selectedAdvertiser={selectedAdvertiser}
            loadingAgencies={loadingAgencies}
            setLoadingAgencies={setLoadingAgencies}
            apiError={apiError}
            setApiError={setApiError}
            onAgencyChange={(agencyId) => {
              setSelectedAgency(agencyId);

              setSelectedAgencyName(
                agencies.find((agency) => agency.id === agencyId)?.name ?? null,
              );

              setSelectedAdvertiser(null);
              setSelectedAdvertiserName(null);
            }}
            onAdvertiserChange={(advertiserId) => {
              setSelectedAdvertiser(advertiserId);

              setSelectedAdvertiserName(
                advertisers.find((advertiser) => advertiser.id === advertiserId)
                  ?.name ?? null,
              );
            }}
            onConfirm={() => {
              const agency = agencies.find(
                (agency) => agency.id === selectedAgency,
              );

              const advertiser = advertisers.find(
                (advertiser) => advertiser.id === selectedAdvertiser,
              );

              if (!agency || !advertiser) {
                return;
              }

              vscode.postMessage({
                type: "saveExportAdvertiser",
                agency: {
                  id: agency.id,
                  name: agency.name,
                },
                advertiser: {
                  id: advertiser.id,
                  name: advertiser.name,
                },
              });

              setSelectedAgencyName(agency.name);
              setSelectedAdvertiserName(advertiser.name);
              setShowExportAdvertiserModal(false);
            }}
          />
        </main>
        {!exportMode && (
          <WizardFooter
            step={step}
            setStep={setStep}
            settingsMode={settingsMode}
            name={name}
            selectedFolder={selectedFolder}
            selectedDimensions={selectedDimensions}
            selectedAdsetId={selectedAdsetId}
            parsedFeed={parsedFeed}
            frameCount={frameCount}
            isFeedMappingFinished={isFeedMappingFinished}
            vscode={vscode}
            userName={userName}
            dimensionType={dimensionType}
            selectedFonts={selectedFonts}
            coFonts={coFonts}
            placeholderVariants={placeholderVariants}
            products={products}
            collectionMapping={collectionMapping}
            agencies={agencies}
            advertisers={advertisers}
            adsets={adsets}
            selectedAgency={selectedAgency}
            selectedAdvertiser={selectedAdvertiser}
            settingsSection={settingsSection}
            hasSettingsChanges={hasSettingsChanges}
            hasIncompleteFont={hasIncompleteFont}
            getCurrentSettings={getCurrentSettings}
            autoFillPlaceholderContent={autoFillPlaceholderContent}
          />
        )}
      </div>
    </div>
  );
}
