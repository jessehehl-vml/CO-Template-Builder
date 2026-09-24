import React, { useEffect, useRef, useState } from "react";
import { parseFeed, type ParsedFeed } from "../feed";
const vscode = acquireVsCodeApi();

type Step = 1 | 2 | 3 | 4 | 5;
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

type DimensionOption = {
  size: string;
  label: string;
};

type COFont = {
  "font-family": string;
  "css-base-url": string;
  variants: {
    "font-weight": number;
    "font-style"?: string;
    variant: string;
  }[];
};

export default function Wizard() {
  const [step, setStep] = useState<Step>(1);
  const [maxStepReached, setMaxStepReached] = useState<Step>(1);
  const [settingsSection, setSettingsSection] = useState<1 | 2 | 3 | 4>(1);
  const [settingsMode, setSettingsMode] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [loadedSettings, setLoadedSettings] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  useEffect(() => {
    vscode.postMessage({
      type: "loadWorkspaceFolder",
    });
  }, []);
  const [name, setName] = useState("");

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const [selectedAdset, setSelectedAdset] = useState<string | null>(null);
  const [selectedAdsetId, setSelectedAdsetId] = useState<number | null>(null);

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [adsets, setAdsets] = useState<AdSet[]>([]);

  const [selectedAgency, setSelectedAgency] = useState<number | null>(null);
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<number | null>(
    null,
  );
  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [loadingAdvertisers, setLoadingAdvertisers] = useState(false);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const customWidthRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [customDimensionAttempted, setCustomDimensionAttempted] = useState<
    Record<string, boolean>
  >({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loadingPlaceholders, setLoadingPlaceholders] = useState(false);
  const [placeholderVariants, setPlaceholderVariants] = useState<
    PlaceholderVariant[]
  >([]);
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
  const PLACEHOLDER_TYPE_ICONS: Record<PlaceholderType, string> = {
    "not used": "—",
    text: "T",
    image: "▧",
    video: "▶",
    audio: "♫",
    click: "↗",
    collection: "☷",
  };
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
  const DIMENSIONS: DimensionOption[] = [
    { size: "300x250", label: "Medium Rectangle" },
    { size: "300x600", label: "Half Page" },
    { size: "160x600", label: "Wide Skyscraper" },
    { size: "728x90", label: "Leaderboard" },
    { size: "970x250", label: "Billboard" },
    { size: "320x50", label: "Mobile Banner" },
  ];
  const getDimensionLabel = (dimension: string) => {
    if (!dimension.startsWith("custom")) {
      const preset = DIMENSIONS.find((item) => item.size === dimension);

      return preset?.size ?? dimension;
    }

    const index =
      dimension === "custom" ? 0 : Number(dimension.replace("custom-", ""));

    const customDimension = customDimensions[index];

    if (!customDimension) {
      return dimension;
    }

    return `${customDimension.width}x${customDimension.height}`;
  };
  const [coFonts, setCoFonts] = useState<COFont[]>([]);
  const [showFontImportModal, setShowFontImportModal] = useState(false);
  const [loadingFonts, setLoadingFonts] = useState(false);
  type SelectedFont = {
    id: number;
    family: string;
    variant: string;
    fontUrl: string;
  };
  const [selectedFonts, setSelectedFonts] = useState<SelectedFont[]>([]);

  const hasIncompleteFont = selectedFonts.some(
    (font) => !font.family || !font.variant,
  );
  const addFont = () => {
    setSelectedFonts((fonts) => [
      ...fonts,
      {
        id: Date.now(),
        family: "",
        variant: "",
        fontUrl: "",
      },
    ]);
  };

  const removeFont = (id: number) => {
    setSelectedFonts((fonts) => fonts.filter((font) => font.id !== id));
  };

  const updateFont = (
    id: number,
    field: "family" | "variant",
    value: string,
  ) => {
    setSelectedFonts((fonts) =>
      fonts.map((font) =>
        font.id === id
          ? {
              ...font,
              [field]: value,
              ...(field === "family" ? { variant: "" } : {}),
            }
          : font,
      ),
    );
  };

  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [displayDimension, setDisplayDimension] = useState("");

  const [dimensionType, setDimensionType] = useState<"single" | "responsive">(
    "single",
  );

  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);

  const [customDimensions, setCustomDimensions] = useState<
    { width: string; height: string }[]
  >([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalMode, setImportModalMode] = useState<
    "placeholders" | "collectionFields" | "fonts"
  >("placeholders");
  const [feedSourceType, setFeedSourceType] = useState<
    "local" | "remote" | null
  >(null);
  const [showFeedModal, setShowFeedModal] = useState(false);

  const [feedUrl, setFeedUrl] = useState("");
  const [feedFile, setFeedFile] = useState<File | null>(null);
  const [parsedFeed, setParsedFeed] = useState<ParsedFeed | null>(null);
  const [isMappingFeed, setIsMappingFeed] = useState(false);
  const [isMappingFeedPlaceholders, setIsMappingFeedPlaceholders] =
    useState(false);
  const [isMappingPlaceholders, setIsMappingPlaceholders] = useState(false);
  const [feedIdentifierColumn, setFeedIdentifierColumn] = useState("");

  const [feedDimensionColumn, setFeedDimensionColumn] = useState("");

  const [feedPlaceholderTypes, setFeedPlaceholderTypes] = useState<
    Record<string, PlaceholderType>
  >({});
  const [selectedFeedPlaceholders, setSelectedFeedPlaceholders] = useState<
    string[]
  >([]);
  const [bulkPlaceholderType, setBulkPlaceholderType] =
    useState<PlaceholderType>("text");
  const [isMappingCollection, setIsMappingCollection] = useState(false);

  const [collectionName, setCollectionName] = useState("products");
  const [collectionIntent, setCollectionIntent] = useState("product");
  const [collectionRequiredItems, setCollectionRequiredItems] = useState("1");
  const isCollectionMappingValid =
    collectionName.trim() !== "" &&
    collectionIntent.trim() !== "" &&
    Number.isInteger(Number(collectionRequiredItems)) &&
    Number(collectionRequiredItems) >= 1 &&
    Number(collectionRequiredItems) <= 10;
  const [collectionFields, setCollectionFields] = useState<CollectionField[]>(
    [],
  );
  const [collectionMappings, setCollectionMappings] = useState<
    CollectionFieldMapping[]
  >([]);
  const hasSelectedCollectionFields = collectionMappings.some(
    (mapping) => mapping.selected,
  );
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
  const COLLECTION_FIELD_PLACEHOLDER_TYPES: Record<string, PlaceholderType> = {
    text: "text",
    blob: "text",
    keyword: "text",
    number: "text",
    boolean: "text",
    "date-time": "text",
    "image-url": "image",
    url: "click",
  };
  const [loadedCollections, setLoadedCollections] = useState<
    CollectionSetting[]
  >([]);
  const [loadedContent, setLoadedContent] = useState<any>(null);
  const [loadingCollectionFields, setLoadingCollectionFields] = useState(false);
  const allCollectionFieldsSelected =
    collectionMappings.length > 0 &&
    collectionMappings.every((mapping) => mapping.selected);

  type ProductsBySelector = Record<
    string,
    {
      name: string;
      products: unknown;
    }
  >;
  type ProductSelectorRequest = {
    selectorId: string;
    required: number;
  };
  const [products, setProducts] = useState<ProductsBySelector>({});
  const [loadedProducts, setLoadedProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const productRequestsLoaded = useRef<Set<string>>(new Set());

  const [isFeedMappingFinished, setIsFeedMappingFinished] = useState(false);
  useEffect(() => {
    setMaxStepReached((currentMax) => Math.max(currentMax, step) as Step);
  }, [step]);
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
  // Load agencies
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (!showImportModal && !showFontImportModal) {
      return;
    }

    setLoadingAgencies(true);
    setApiError(null);

    vscode.postMessage({
      type: "loadAgencyData",
    });
  }, [isAuthenticated, showImportModal, showFontImportModal]);

  // Load advertisers
  useEffect(() => {
    if (!isAuthenticated || !showImportModal || !selectedAgency) {
      return;
    }

    setLoadingAdvertisers(true);
    setApiError(null);

    vscode.postMessage({
      type: "loadAdvertisers",
      agencyId: selectedAgency,
    });
  }, [isAuthenticated, showImportModal, selectedAgency]);

  // Load adsets — ONLY for placeholder imports
  useEffect(() => {
    if (
      !isAuthenticated ||
      !showImportModal ||
      importModalMode !== "placeholders" ||
      !selectedAgency ||
      !selectedAdvertiser
    ) {
      return;
    }

    setLoadingAdsets(true);
    setApiError(null);

    vscode.postMessage({
      type: "loadAdsets",
      agencyId: selectedAgency,
      advertiserId: selectedAdvertiser,
    });
  }, [
    isAuthenticated,
    showImportModal,
    importModalMode,
    selectedAgency,
    selectedAdvertiser,
  ]);

  useEffect(() => {
    if (!loadedSettings || adsets.length === 0) {
      return;
    }

    const savedAdset = loadedSettings.adset as { id?: number } | undefined;

    if (!savedAdset?.id) {
      return;
    }

    const matchingAdset = adsets.find((adset) => adset.id === savedAdset.id);

    if (!matchingAdset) {
      return;
    }

    setSelectedAdsetId(matchingAdset.id);
    setSelectedAdset(matchingAdset.name);
  }, [loadedSettings, adsets]);
  useEffect(() => {
    if (selectedDimensions.length === 0) {
      return;
    }

    if (dimensionType === "single") {
      setDisplayDimension(selectedDimensions[0]);
      return;
    }

    if (!selectedDimensions.includes(displayDimension)) {
      setDisplayDimension(selectedDimensions[0]);
    }
  }, [selectedDimensions, dimensionType]);

  const back = () => {
    setStep((current) => Math.max(current - 1, 1) as Step);
  };

  const addCustomDimension = () => {
    if (dimensionType === "single") {
      setCustomDimensions([{ width: "", height: "" }]);

      requestAnimationFrame(() => {
        customWidthRefs.current[0]?.focus();
      });

      return;
    }

    setCustomDimensions((current) => {
      const newIndex = current.length;

      requestAnimationFrame(() => {
        customWidthRefs.current[newIndex]?.focus();
      });

      return [...current, { width: "", height: "" }];
    });
  };
  const isCustomDimensionValid = (dimension: {
    width: string;
    height: string;
  }) => {
    return dimension.width.trim() !== "" && dimension.height.trim() !== "";
  };
  const loadFeedFromUrl = async () => {
    setLoadingPlaceholders(true);

    const url = feedUrl.trim();

    if (!url) {
      setApiError("Please enter a feed URL.");
      return;
    }

    try {
      setApiError(null);
      setFeedSourceType("remote");

      const response = await fetch(url);

      if (!response.ok) {
        switch (response.status) {
          case 401:
            throw new Error(
              "The feed requires authentication. Please make sure the feed is publicly accessible.",
            );

          case 403:
            throw new Error(
              "Access to the feed was denied. Please check that the feed is publicly accessible.",
            );

          case 404:
            throw new Error(
              "The feed could not be found. Please check the URL.",
            );

          default:
            throw new Error(
              `The feed could not be loaded (HTTP ${response.status}).`,
            );
        }
      }

      const csvText = await response.text();

      if (!csvText.trim()) {
        throw new Error("The feed is empty.");
      }

      const feed = parseFeed(csvText);
      setParsedFeed(feed);

      const findColumn = (candidates: string[]) => {
        const normalizedCandidates = candidates.map((candidate) =>
          candidate.trim().toLowerCase(),
        );

        return (
          feed.columns.find((column) =>
            normalizedCandidates.includes(column.trim().toLowerCase()),
          ) ?? ""
        );
      };

      setFeedIdentifierColumn(
        findColumn(["variantID", "variantId", "variant-name", "variantName"]),
      );

      setFeedDimensionColumn(
        findColumn([
          "dimensions",
          "template_dimensions",
          "template_dimension",
          "templateDimension",
          "templateDimensions",
        ]),
      );

      setFeedPlaceholderTypes({});
      setIsMappingFeed(true);
      setIsMappingPlaceholders(true);
      setShowFeedModal(false);
    } catch (error) {
      console.error("Failed to load remote feed:", error);

      if (error instanceof TypeError && error.message === "Failed to fetch") {
        setApiError(
          "Unable to access the feed. Please check that the URL is correct and that the feed is publicly accessible.",
        );
        return;
      }

      setApiError(
        error instanceof Error
          ? error.message
          : "Could not load the feed. Please check the URL and try again.",
      );
    }
  };
  const loadProductsBySelector = (
    advertiserId: number,
    selectorId: string,
    required: number,
  ) => {
    console.log("[PRODUCT FLOW] loadProductsBySelector called:", {
      advertiserId,
      selectorId,
      required,
    });
    setLoadingProducts(true);
    setProductsError(null);

    vscode.postMessage({
      type: "loadProductsBySelector",
      advertiserId,
      selectorId,
      limit: required,
      offset: 0,
    });
  };
  const getProductSelectorRequests = (): ProductSelectorRequest[] => {
    const requests = new Map<string, number>();

    for (const variant of placeholderVariants) {
      for (const dimension of variant.dimensions) {
        if (!dimension.productSelectorId) {
          continue;
        }

        // Products were already supplied by the CO content API.
        // They live inside the collection placeholder, so don't fetch
        // them again through the product-selector API.
        const hasImportedProducts = dimension.placeholders.some(
          (placeholder) =>
            placeholder.type === "collection" &&
            Array.isArray(placeholder.value) &&
            placeholder.value.length > 0,
        );

        if (hasImportedProducts) {
          continue;
        }

        const required = Number(collectionMapping?.required ?? 1);

        if (!Number.isFinite(required) || required < 1) {
          continue;
        }

        const currentRequired = requests.get(dimension.productSelectorId) ?? 0;

        requests.set(
          dimension.productSelectorId,
          Math.max(currentRequired, required),
        );
      }
    }

    return Array.from(requests.entries()).map(([selectorId, required]) => ({
      selectorId,
      required,
    }));
  };
  useEffect(() => {
    console.log("[PRODUCT FLOW] Effect triggered:", {
      hasCollectionMapping: !!collectionMapping,
      selectedAdvertiser,
      placeholderVariantsCount: placeholderVariants.length,
    });

    if (!collectionMapping || !selectedAdvertiser) {
      console.log(
        "[PRODUCT FLOW] Stopped: missing collectionMapping or selectedAdvertiser",
      );
      return;
    }

    const requests = getProductSelectorRequests();

    console.log("[PRODUCT FLOW] Discovered selector requests:", requests);

    if (requests.length === 0) {
      console.log("[PRODUCT FLOW] Stopped: no selector requests");
      return;
    }

    const pendingRequests = requests.filter(
      ({ selectorId }) => !productRequestsLoaded.current.has(selectorId),
    );

    console.log("[PRODUCT FLOW] Pending selector requests:", {
      pendingRequests,
      alreadyLoaded: Array.from(productRequestsLoaded.current),
    });

    if (pendingRequests.length === 0) {
      console.log("[PRODUCT FLOW] Stopped: all selectors already loaded");
      return;
    }

    console.log("[PRODUCT FLOW] Starting product loading:", pendingRequests);

    setLoadingProducts(true);
    setProductsError(null);

    for (const { selectorId, required } of pendingRequests) {
      console.log("[PRODUCT FLOW] Requesting products:", {
        advertiserId: selectedAdvertiser,
        selectorId,
        required,
      });

      productRequestsLoaded.current.add(selectorId);

      loadProductsBySelector(selectedAdvertiser, selectorId, required);
    }
  }, [collectionMapping, placeholderVariants, selectedAdvertiser]);
  const autoMapSelectedFeedPlaceholders = () => {
    if (!parsedFeed || selectedFeedPlaceholders.length === 0) {
      return;
    }

    const COLLECTION_PLACEHOLDER_COLUMNS = new Set([
      "product-selector_id",
      "product-selector",
      "product_selector",
      "productselector",
    ]);

    const getPlaceholderType = (
      column: string,
      value: string,
    ): PlaceholderType => {
      const normalizedColumn = column.trim().toLowerCase();

      // Product selector fields are always collections
      if (COLLECTION_PLACEHOLDER_COLUMNS.has(normalizedColumn)) {
        return "collection";
      }

      const trimmedValue = value.trim();

      if (!trimmedValue) {
        return "text";
      }

      let pathname = "";

      try {
        const url = new URL(trimmedValue);

        if (url.protocol === "http:" || url.protocol === "https:") {
          pathname = url.pathname.toLowerCase();
        }
      } catch {
        // Not a valid URL, so we'll treat it as text below.
      }

      // Hosted image
      if (/\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)$/i.test(pathname)) {
        return "image";
      }

      // Hosted video
      if (/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(pathname)) {
        return "video";
      }

      // Hosted audio
      if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(pathname)) {
        return "audio";
      }

      // HTTP/HTTPS URL without a recognised media file extension
      if (/^https?:\/\//i.test(trimmedValue)) {
        return "click";
      }

      // Everything else
      return "text";
    };

    setFeedPlaceholderTypes((current) => {
      const updated = { ...current };

      selectedFeedPlaceholders.forEach((column) => {
        const firstNonEmptyValue = parsedFeed.rows
          .map((row) => row[column]?.trim() ?? "")
          .find((value) => value !== "");

        updated[column] = getPlaceholderType(column, firstNonEmptyValue ?? "");
      });

      return updated;
    });
  };
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "workspaceFolderLoaded") {
        const folder = message.folder ?? null;

        setCurrentFolder(folder);

        if (folder) {
          setSelectedFolder(folder);
        }
      }
      if (message.type === "openSettingsSection") {
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
        }

        if (savedAdvertiser?.id) {
          setSelectedAdvertiser(savedAdvertiser.id);
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
      if (message.type === "folderSelected") {
        setSelectedFolder(message.folder);
      }
      if (message.type === "placeholdersLoaded") {
        setPlaceholderVariants(message.variants);
        setSelectedVariantIndex(0);
        setLoadingPlaceholders(false);
        setApiError(null);

        if (message.collections?.length > 0) {
          const collection = message.collections[0];

          setCollectionMapping({
            collection: collection.name,
            intent: collection.intent,
            required: String(collection.itemsRequired),
            fields: Object.entries(collection.placeholders).map(
              ([placeholder, config]) => ({
                productField: placeholder,
                placeholder,
                placeholderType: (config as { type: PlaceholderType }).type,
              }),
            ),
          });
        } else {
          setCollectionMapping(null);
        }

        // Restore products that were already returned by the CO
        // ad-variants/content API. These do not need to be
        // fetched again through the product-selector API.
        const restoredProducts: ProductsBySelector = {};

        message.variants?.forEach((variant: PlaceholderVariant) => {
          variant.dimensions?.forEach((dimension) => {
            const selectorId = dimension.productSelectorId;

            if (!selectorId) {
              return;
            }

            const collection = dimension.placeholders?.find(
              (placeholder) => placeholder.name === "products",
            );

            if (!collection || !Array.isArray(collection.value)) {
              return;
            }

            restoredProducts[selectorId] = {
              name: selectorId,
              products: {
                items: collection.value.map((product) => ({
                  fields: product,
                })),
              },
            };

            productRequestsLoaded.current.add(selectorId);
          });
        });

        setProducts(restoredProducts);
      }

      if (message.type === "placeholdersError") {
        setLoadingPlaceholders(false);

        setApiError(message.message);
      }
      if (message.type === "collectionFieldsLoaded") {
        const fields = (message.fields ?? []) as CollectionField[];

        setCollectionFields(fields);

        setCollectionMappings(
          fields.map((field) => ({
            productField: field,
            placeholder: field.name,
            placeholderType:
              COLLECTION_FIELD_PLACEHOLDER_TYPES[field.type] ?? "text",
            selected: false,
          })),
        );

        setLoadingCollectionFields(false);
        setApiError(null);

        return;
      }

      if (message.type === "collectionFieldsError") {
        setLoadingCollectionFields(false);
        setApiError(message.message);
        return;
      }
      if (message.type === "productsBySelectorLoaded") {
        console.log("[PRODUCT FLOW] Products received:", {
          selectorId: message.selectorId,
          selectorName: message.selectorName,
          products: message.products,
        });

        setProducts((current) => ({
          ...current,
          [message.selectorId]: {
            name: message.selectorName,
            products: message.products,
          },
        }));

        setLoadingProducts(false);
        setProductsError(null);
        return;
      }

      if (message.type === "productsError") {
        console.error("[WIZARD] productsError:", message.message);

        setLoadingProducts(false);
        setProductsError(message.message);

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
      if (message.type === "coFontsLoaded") {
        const fonts = message.fonts ?? [];
        setCoFonts(fonts);
        setLoadingFonts(false);

        setShowFontImportModal(false);
        setApiError(null);

        setSelectedFonts((current) => {
          // In Settings mode, restore the fonts selected for this project
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

          // Existing behaviour for the normal Wizard
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
      }

      if (message.type === "coFontsError") {
        setLoadingFonts(false);

        return;
      }
      if (message.type === "agencyDataError") {
        setLoadingAgencies(false);
        setApiError(message.message);
      }
      if (message.type === "advertisersLoaded") {
        setAdvertisers(message.advertisers);
        setLoadingAdvertisers(false);
        setApiError(null);
      }

      if (message.type === "advertisersError") {
        setLoadingAdvertisers(false);
        setApiError(message.message);
      }
      if (message.type === "adsetsLoaded") {
        setAdsets(message.adsets);
        setLoadingAdsets(false);
        setApiError(null);
      }

      if (message.type === "adsetsError") {
        setLoadingAdsets(false);
        setApiError(message.message);
      }
    };

    window.addEventListener("message", handler);

    return () => {
      window.removeEventListener("message", handler);
    };
  }, []);
  const buildFeedVariants = () => {
    if (!parsedFeed) {
      return;
    }

    const variants = new Map<string, PlaceholderVariant>();

    parsedFeed.rows.forEach((row) => {
      const contentId = row[feedIdentifierColumn]?.trim();

      if (!contentId) {
        return;
      }

      let templateDimensions: string[];

      if (feedDimensionColumn) {
        const dimensionValue = row[feedDimensionColumn]?.trim();

        if (!dimensionValue) {
          return;
        }

        templateDimensions = dimensionValue
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
      } else {
        templateDimensions = selectedDimensions;
      }

      if (templateDimensions.length === 0) {
        return;
      }

      let variant = variants.get(contentId);

      if (!variant) {
        variant = {
          contentId,
          variantId: contentId,
          dimensions: [],
        };

        variants.set(contentId, variant);
      }

      templateDimensions.forEach((templateDimension) => {
        const [width, height] = templateDimension
          .toLowerCase()
          .split("x")
          .map((value) => Number(value.trim()));

        if (
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        ) {
          return;
        }

        let dimension = variant!.dimensions.find(
          (item) => item.width === width && item.height === height,
        );

        if (!dimension) {
          const collectionPlaceholderColumn = Object.entries(
            feedPlaceholderTypes,
          ).find(([, type]) => type === "collection")?.[0];

          const productSelectorId = collectionPlaceholderColumn
            ? row[collectionPlaceholderColumn]?.trim()
            : undefined;

          dimension = {
            templateDimension: `${width}x${height}`,
            width,
            height,
            productSelectorId,
            placeholders: [],
          };

          variant!.dimensions.push(dimension);
        }
        Object.entries(feedPlaceholderTypes).forEach(([column, type]) => {
          if (type === "not used") {
            return;
          }

          dimension!.placeholders.push({
            name: column,
            type,
            value: row[column] ?? "",
          });
        });
      });
    });

    const result = Array.from(variants.values());

    setPlaceholderVariants(result);
    setSelectedVariantIndex(0);
  };
  const finishFeedMapping = () => {
    if (!parsedFeed) {
      return;
    }

    const hasCollectionPlaceholder = Object.values(feedPlaceholderTypes).some(
      (type) => type === "collection",
    );

    if (hasCollectionPlaceholder) {
      setIsMappingFeedPlaceholders(false);
      setIsMappingCollection(true);
      return;
    }

    buildFeedVariants();

    setApiError(null);
    setIsMappingPlaceholders(false);
    setIsMappingFeedPlaceholders(false);
    setIsFeedMappingFinished(true);
  };
  const hasSettingsChanges =
    settingsLoaded &&
    loadedSettings !== null &&
    (() => {
      switch (settingsSection) {
        case 1:
          return name !== (loadedSettings.projectName ?? "");

        case 2: {
          const currentDimensions = selectedDimensions
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

          const savedDimensions = Array.isArray(loadedSettings.dimensions)
            ? loadedSettings.dimensions
            : [];

          const dimensionsChanged =
            JSON.stringify(currentDimensions) !==
            JSON.stringify(savedDimensions);

          const dimensionTypeChanged =
            dimensionType !== loadedSettings.adsetType;

          return dimensionsChanged || dimensionTypeChanged;
        }
        case 3: {
          const currentPlaceholders = Array.from(
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
          );

          const savedPlaceholders = Array.isArray(loadedSettings.placeholders)
            ? loadedSettings.placeholders
            : [];

          return (
            JSON.stringify(currentPlaceholders) !==
            JSON.stringify(savedPlaceholders)
          );
        }
        case 4: {
          const currentFonts = coFonts;

          const savedFonts = Array.isArray(loadedSettings?.fonts)
            ? loadedSettings.fonts
            : [];

          const currentSelectedFonts = selectedFonts.map((font) => ({
            family: font.family,
            variant: font.variant,
            fontUrl: font.fontUrl,
          }));

          const savedSelectedFonts = Array.isArray(
            loadedSettings?.selectedFonts,
          )
            ? loadedSettings.selectedFonts
            : [];

          const hasIncompleteFont = selectedFonts.some(
            (font) => !font.family || !font.variant,
          );

          return (
            hasIncompleteFont ||
            JSON.stringify(currentFonts) !== JSON.stringify(savedFonts) ||
            JSON.stringify(currentSelectedFonts) !==
              JSON.stringify(savedSelectedFonts)
          );
        }
        default:
          return false;
      }
    })();
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
  const selectedVariant = placeholderVariants[selectedVariantIndex];

  const selectedDimension = selectedVariant?.dimensions.find(
    (dimension) => dimension.templateDimension === displayDimension,
  );

  const selectedProductSelectorId = selectedDimension?.productSelectorId;

  const selectedSelector = selectedProductSelectorId
    ? products[selectedProductSelectorId]
    : null;

  const selectedSelectorResult = selectedSelector?.products as
    | {
        items?: any[];
      }
    | undefined;

  const selectedProducts = selectedSelectorResult?.items?.length
    ? selectedSelectorResult.items
    : loadedProducts;

  const selectedProduct = selectedProducts[selectedProductIndex] ?? null;
  const selectedProductSelectorName = selectedSelector?.name ?? "";
  useEffect(() => {
    setSelectedProductIndex(0);
  }, [selectedVariantIndex, displayDimension]);
  return (
    <div className="app">
      <div className="main">
        {!settingsMode && (
          <div className="wizard">
            <header className="header">
              <h1>Create new creative</h1>
            </header>
            <div className="progress">
              {["Name", "Dimensions", "Placeholders", "Fonts", "Create"].map(
                (label, index) => {
                  const number = index + 1;
                  const isCurrent = step === number;
                  const isComplete = maxStepReached > number;
                  const isClickable = number <= maxStepReached;

                  return (
                    <React.Fragment key={label}>
                      <div
                        className={`progress-item ${
                          isCurrent ? "current" : ""
                        } ${isComplete ? "complete" : ""} ${
                          isClickable && !isComplete && !isCurrent
                            ? "unlocked"
                            : ""
                        } ${!isClickable ? "disabled" : ""}`}
                        onClick={() => {
                          if (isClickable) {
                            setStep(number as Step);
                          }
                        }}
                      >
                        <div className="progress-step">
                          {isComplete ? "✓" : number}
                        </div>

                        <span>{label}</span>
                      </div>

                      {number < 6 && (
                        <div
                          className={`progress-line ${
                            maxStepReached > number ? "active" : ""
                          }`}
                        />
                      )}
                    </React.Fragment>
                  );
                },
              )}
            </div>
          </div>
        )}
        <main className="content">
          {step === 1 && (!settingsMode || settingsSection === 1) && (
            <section>
              <h1>Name your creative</h1>

              <p className="description">Give your HTML creative a name.</p>
              {!settingsMode && (
                <div className="field">
                  <label>Folder</label>

                  {selectedFolder ? (
                    <div className="selected-folder-row">
                      <div className="selected-folder-icon">📁</div>

                      <div className="selected-folder-info">
                        <div className="selected-folder-name">
                          {selectedFolder.split("/").pop() || selectedFolder}
                        </div>

                        <div className="selected-folder-path">
                          {selectedFolder}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="change-folder-button"
                        onClick={() => {
                          vscode.postMessage({
                            type: "selectFolder",
                          });
                        }}
                      >
                        Change folder
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="select-folder-button"
                      onClick={() => {
                        vscode.postMessage({
                          type: "selectFolder",
                        });
                      }}
                    >
                      📁 Select folder…
                    </button>
                  )}
                </div>
              )}

              <div className="field">
                <label htmlFor="creative-name">Creative name</label>

                <input
                  id="creative-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Summer Campaign"
                  autoFocus
                />
              </div>
            </section>
          )}

          {step === 2 && (!settingsMode || settingsSection === 2) && (
            <>
              <h1>Choose dimensions</h1>

              <p className="description">
                Choose whether this template is built for a single size or
                multiple responsive sizes.
              </p>

              <div className="dimension-types">
                <button
                  className={`dimension-type ${
                    dimensionType === "single" ? "selected" : ""
                  }`}
                  onClick={() => {
                    setDimensionType("single");
                    setSelectedDimensions([]);
                  }}
                >
                  <div className="radio">
                    {dimensionType === "single" ? "✓" : ""}
                  </div>

                  <div>
                    <strong>Single Size</strong>
                    <span>Create a template for one ad size.</span>
                  </div>
                </button>

                <button
                  className={`dimension-type ${
                    dimensionType === "responsive" ? "selected" : ""
                  }`}
                  onClick={() => {
                    setDimensionType("responsive");
                    setSelectedDimensions([]);
                  }}
                >
                  <div className="radio">
                    {dimensionType === "responsive" ? "✓" : ""}
                  </div>

                  <div>
                    <strong>Responsive</strong>
                    <span>Create a template for multiple ad sizes.</span>
                  </div>
                </button>
              </div>

              <div className="dimensions">
                {DIMENSIONS.map(({ size, label }) => {
                  const selected = selectedDimensions.includes(size);

                  return (
                    <button
                      key={size}
                      className={`dimension ${selected ? "selected" : ""}`}
                      onClick={() => {
                        if (dimensionType === "single") {
                          setSelectedDimensions([size]);
                          return;
                        }

                        setSelectedDimensions((current) =>
                          current.includes(size)
                            ? current.filter((item) => item !== size)
                            : [...current, size],
                        );
                      }}
                    >
                      <div
                        className={
                          dimensionType === "single" ? "radio" : "checkbox"
                        }
                      >
                        {selected ? "✓" : ""}
                      </div>

                      <div className="dimension-info">
                        <strong>{size}</strong>
                        <span>{label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="custom-dimensions">
                {customDimensions.map((dimension, index) => {
                  const isSelected =
                    dimensionType === "single"
                      ? selectedDimensions.includes("custom")
                      : selectedDimensions.includes(`custom-${index}`);

                  return (
                    <div
                      className={`custom-dimension ${
                        isSelected ? "selected" : ""
                      } ${!isCustomDimensionValid(dimension) ? "invalid" : ""}`}
                      key={index}
                    >
                      <button
                        className="custom-dimension-select"
                        onClick={() => {
                          if (!isCustomDimensionValid(dimension)) {
                            setCustomDimensionAttempted((current) => ({
                              ...current,
                              [index]: true,
                            }));

                            return;
                          }

                          if (dimensionType === "single") {
                            setSelectedDimensions(["custom"]);
                          } else {
                            setSelectedDimensions((current) =>
                              current.includes(`custom-${index}`)
                                ? current.filter(
                                    (item) => item !== `custom-${index}`,
                                  )
                                : [...current, `custom-${index}`],
                            );
                          }
                        }}
                      >
                        <div
                          className={
                            dimensionType === "single" ? "radio" : "checkbox"
                          }
                        >
                          {isSelected ? "✓" : ""}
                        </div>

                        <strong>
                          Custom size
                          {dimensionType === "responsive" && ` ${index + 1}`}
                        </strong>
                      </button>

                      <div className="custom-dimension-inputs">
                        <input
                          type="number"
                          ref={(element) => {
                            customWidthRefs.current[index] = element;
                          }}
                          placeholder="Width"
                          className={
                            customDimensionAttempted[index] &&
                            !dimension.width.trim()
                              ? "custom-dimension-input invalid"
                              : "custom-dimension-input"
                          }
                          value={dimension.width}
                          onChange={(event) => {
                            const width = event.target.value;

                            setCustomDimensions((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      width,
                                    }
                                  : item,
                              ),
                            );

                            const isValid =
                              width.trim() !== "" &&
                              dimension.height.trim() !== "";

                            if (isValid) {
                              if (dimensionType === "single") {
                                setSelectedDimensions(["custom"]);
                              } else {
                                setSelectedDimensions((current) =>
                                  current.includes(`custom-${index}`)
                                    ? current
                                    : [...current, `custom-${index}`],
                                );
                              }
                            } else {
                              setSelectedDimensions((current) =>
                                current.filter(
                                  (item) =>
                                    item !== "custom" &&
                                    item !== `custom-${index}`,
                                ),
                              );
                            }
                          }}
                        />

                        <span>×</span>

                        <input
                          type="number"
                          placeholder="Height"
                          className={
                            customDimensionAttempted[index] &&
                            !dimension.height.trim()
                              ? "custom-dimension-input invalid"
                              : "custom-dimension-input"
                          }
                          value={dimension.height}
                          onChange={(event) => {
                            const height = event.target.value;

                            setCustomDimensions((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      height,
                                    }
                                  : item,
                              ),
                            );

                            const isValid =
                              dimension.width.trim() !== "" &&
                              height.trim() !== "";

                            if (isValid) {
                              if (dimensionType === "single") {
                                setSelectedDimensions(["custom"]);
                              } else {
                                setSelectedDimensions((current) =>
                                  current.includes(`custom-${index}`)
                                    ? current
                                    : [...current, `custom-${index}`],
                                );
                              }
                            } else {
                              setSelectedDimensions((current) =>
                                current.filter(
                                  (item) =>
                                    item !== "custom" &&
                                    item !== `custom-${index}`,
                                ),
                              );
                            }
                          }}
                        />
                      </div>

                      {dimensionType === "responsive" && (
                        <button
                          className="remove-dimension"
                          onClick={() => {
                            setCustomDimensions((current) =>
                              current.filter((_, i) => i !== index),
                            );

                            setSelectedDimensions((current) =>
                              current.filter(
                                (item) => item !== `custom-${index}`,
                              ),
                            );
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
                {(dimensionType === "responsive" ||
                  customDimensions.length === 0) && (
                  <button
                    className="add-custom-dimension"
                    onClick={addCustomDimension}
                  >
                    + Add custom size
                  </button>
                )}
              </div>
            </>
          )}

          {step === 3 && (!settingsMode || settingsSection === 3) && (
            <section>
              <h1>Select placeholders</h1>

              <p className="description">
                Import the placeholders and content from Creative Optimizations.
              </p>

              {loadingPlaceholders ? (
                <div className="loading-message">Loading placeholders...</div>
              ) : (
                <div className="import-buttons">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setApiError(null);
                      setImportModalMode("placeholders");
                      setShowImportModal(true);
                    }}
                  >
                    Import placeholders from CO
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() => {
                      setApiError(null);
                      setShowFeedModal(true);
                    }}
                  >
                    Import from feed
                  </button>
                </div>
              )}
              {showFeedModal && (
                <div className="modal-backdrop">
                  <div className="import-modal feed-modal">
                    <div className="modal-header">
                      <div>
                        <h2>Import from feed</h2>
                        <p>Select a local CSV file or provide a feed URL.</p>
                      </div>

                      <button
                        className="modal-close"
                        onClick={() => {
                          setShowFeedModal(false);
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="feed-option">
                        <label className="feed-label">Local CSV</label>

                        <label className="file-input">
                          <span>
                            {feedFile ? feedFile.name : "Choose CSV file"}
                          </span>

                          <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={async (event) => {
                              const file = event.target.files?.[0] ?? null;
                              setFeedFile(file);
                              setParsedFeed(null);
                              setFeedSourceType(file ? "local" : null);

                              if (!file) {
                                return;
                              }

                              try {
                                const csvText = await file.text();
                                const feed = parseFeed(csvText);

                                setParsedFeed(feed);

                                const findColumn = (candidates: string[]) => {
                                  const normalizedCandidates = candidates.map(
                                    (candidate) =>
                                      candidate.trim().toLowerCase(),
                                  );

                                  return (
                                    feed.columns.find((column) =>
                                      normalizedCandidates.includes(
                                        column.trim().toLowerCase(),
                                      ),
                                    ) ?? ""
                                  );
                                };

                                setFeedIdentifierColumn(
                                  findColumn([
                                    "variantID",
                                    "variantId",
                                    "variant-name",
                                    "variantName",
                                    "ID",
                                  ]),
                                );

                                setFeedDimensionColumn(
                                  findColumn([
                                    "dimensions",
                                    "template_dimensions",
                                    "template_dimension",
                                    "templateDimension",
                                    "templateDimensions",
                                  ]),
                                );
                                setApiError(null);
                              } catch (error) {
                                console.error("Failed to parse feed:", error);

                                setApiError(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not parse the feed.",
                                );
                              }
                            }}
                          />
                        </label>
                      </div>

                      <div className="feed-divider">
                        <span>or</span>
                      </div>

                      <div className="feed-option">
                        <label className="feed-label" htmlFor="feed-url">
                          Feed URL
                        </label>
                        <input
                          id="feed-url"
                          className="feed-url-input"
                          type="url"
                          placeholder="https://example.com/feed.csv"
                          value={feedUrl}
                          onChange={(event) => {
                            const value = event.target.value;

                            setFeedUrl(value);

                            if (value) {
                              setFeedFile(null);
                              setParsedFeed(null);
                              setFeedSourceType("remote");
                            } else {
                              setFeedSourceType(null);
                            }
                          }}
                        />
                        {apiError && (
                          <p className="error-message">
                            <span className="error-icon">!</span>
                            <span>{apiError}</span>
                          </p>
                        )}{" "}
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setShowFeedModal(false);
                        }}
                      >
                        Cancel
                      </button>

                      <button
                        className="primary-button"
                        disabled={!parsedFeed && !feedUrl.trim()}
                        onClick={async () => {
                          if (parsedFeed) {
                            setFeedPlaceholderTypes({});
                            setIsMappingFeed(true);
                            setIsMappingPlaceholders(true);
                            setShowFeedModal(false);
                            return;
                          }

                          if (feedUrl.trim()) {
                            await loadFeedFromUrl();
                          }
                        }}
                      >
                        Import
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {showImportModal && (
                <div className="modal-backdrop">
                  <div className="import-modal">
                    <div className="modal-header">
                      <div>
                        <h2>Import placeholders</h2>
                        <p>
                          Connect to Creative Optimizations and select the adset
                          to import content from.
                        </p>
                      </div>

                      <button
                        className="modal-close"
                        onClick={() => {
                          setShowImportModal(false);
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <div className="modal-body">
                      {!isAuthenticated ? (
                        <div className="login-section">
                          <h3>Connect to Creative Optimizations</h3>

                          <p>
                            Sign in to Creative Optimizations to select an
                            adset.
                          </p>

                          <button
                            className="connect-button"
                            onClick={() => {
                              setLoadingAgencies(true);
                              setApiError(null);

                              vscode.postMessage({
                                type: "connectToCreativeOptimizations",
                              });
                            }}
                          >
                            Connect to Creative Optimizations
                          </button>
                        </div>
                      ) : (
                        <div className="logged-in">
                          <span>
                            Logged in as <strong>{userEmail}</strong>
                          </span>

                          <button
                            className="change-account-button"
                            onClick={() => {
                              setLoadingAgencies(true);
                              setApiError(null);

                              vscode.postMessage({
                                type: "connectToCreativeOptimizations",
                              });
                            }}
                          >
                            Change account
                          </button>
                        </div>
                      )}

                      {loadingAgencies && <p>Loading agencies...</p>}

                      {apiError && <p className="error-message">{apiError}</p>}

                      {!loadingAgencies && agencies.length > 0 && (
                        <div className="selection-fields">
                          <label>
                            Agency
                            <select
                              value={selectedAgency ?? ""}
                              onChange={(event) => {
                                const agencyId = Number(event.target.value);

                                setSelectedAgency(agencyId);
                                setSelectedAdvertiser(null);
                                setSelectedAdset(null);
                                setSelectedAdsetId(null);

                                setAdvertisers([]);
                                setAdsets([]);
                                setApiError(null);
                              }}
                            >
                              <option value="">Select an agency</option>

                              {agencies.map((agency) => (
                                <option key={agency.id} value={agency.id}>
                                  {agency.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          {selectedAgency && (
                            <label>
                              Advertiser
                              <select
                                value={selectedAdvertiser ?? ""}
                                disabled={loadingAdvertisers}
                                onChange={(event) => {
                                  const advertiserId = Number(
                                    event.target.value,
                                  );

                                  setSelectedAdvertiser(advertiserId);
                                  setSelectedAdset(null);
                                  setSelectedAdsetId(null);

                                  setAdsets([]);
                                  setApiError(null);
                                }}
                              >
                                <option value="">
                                  {loadingAdvertisers
                                    ? "Loading advertisers..."
                                    : "Select an advertiser"}
                                </option>

                                {advertisers.map((advertiser) => (
                                  <option
                                    key={advertiser.id}
                                    value={advertiser.id}
                                  >
                                    {advertiser.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}

                          {selectedAdvertiser &&
                            importModalMode === "placeholders" && (
                              <label>
                                Adset
                                <select
                                  value={selectedAdsetId ?? ""}
                                  disabled={loadingAdsets}
                                  onChange={(event) => {
                                    const adsetId = Number(event.target.value);

                                    const adset = adsets.find(
                                      (item) => item.id === adsetId,
                                    );

                                    setSelectedAdsetId(adset?.id ?? null);
                                    setSelectedAdset(adset?.name ?? null);
                                  }}
                                >
                                  <option value="">
                                    {loadingAdsets
                                      ? "Loading adsets..."
                                      : "Select an adset"}
                                  </option>

                                  {adsets.map((adset) => (
                                    <option key={adset.id} value={adset.id}>
                                      {adset.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                        </div>
                      )}
                    </div>

                    <div className="modal-footer">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setShowImportModal(false);
                        }}
                      >
                        Cancel
                      </button>

                      <button
                        className="primary-button"
                        disabled={
                          !selectedAdvertiser ||
                          (importModalMode === "placeholders" &&
                            !selectedAdsetId)
                        }
                        onClick={() => {
                          if (!selectedAdvertiser) {
                            return;
                          }

                          if (importModalMode === "collectionFields") {
                            setShowImportModal(false);
                            setLoadingCollectionFields(true);

                            vscode.postMessage({
                              type: "loadCollectionFields",
                              agencyId: selectedAgency,
                              advertiserId: selectedAdvertiser,
                            });

                            return;
                          }

                          if (!selectedAdsetId) {
                            return;
                          }

                          setShowImportModal(false);

                          vscode.postMessage({
                            type: "loadPlaceholders",
                            advertiserId: selectedAdvertiser,
                            adsetId: selectedAdsetId,
                          });
                        }}
                      >
                        {importModalMode === "collectionFields"
                          ? "Import product fields"
                          : "Import placeholders"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {isMappingFeed && parsedFeed && (
                <div className="feed-mapping">
                  <div className="feed-mapping-header">
                    <strong>Map feed</strong>

                    <span>
                      {parsedFeed.rows.length} rows ·{" "}
                      {parsedFeed.columns.length} columns
                    </span>
                  </div>

                  <div className="feed-mapping-fields">
                    <div className="feed-mapping-field">
                      <label htmlFor="feed-identifier">Identifier</label>

                      <select
                        id="feed-identifier"
                        value={feedIdentifierColumn}
                        onChange={(event) => {
                          setFeedIdentifierColumn(event.target.value);
                        }}
                      >
                        <option value="">Select column</option>

                        {parsedFeed.columns.map((column) => (
                          <option
                            key={column}
                            value={column}
                            disabled={column === feedDimensionColumn}
                          >
                            {column}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="feed-mapping-field">
                      <label htmlFor="feed-dimension">Dimensions</label>

                      <select
                        value={feedDimensionColumn}
                        onChange={(event) =>
                          setFeedDimensionColumn(event.target.value)
                        }
                      >
                        <option value="">No dimension column</option>

                        {parsedFeed.columns.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="feed-mapping-actions">
                    <button
                      className="mapping-button"
                      onClick={() => {
                        setIsMappingFeed(false);
                        setIsMappingPlaceholders(false);
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      className="mapping-button"
                      disabled={!feedIdentifierColumn}
                      onClick={() => {
                        const initialPlaceholderTypes: Record<
                          string,
                          PlaceholderType
                        > = {};

                        parsedFeed?.columns.forEach((column) => {
                          if (
                            column !== feedIdentifierColumn &&
                            column !== feedDimensionColumn
                          ) {
                            initialPlaceholderTypes[column] = "not used";
                          }
                        });

                        setFeedPlaceholderTypes(initialPlaceholderTypes);
                        setSelectedFeedPlaceholders([]);
                        setIsMappingFeed(false);
                        setIsMappingFeedPlaceholders(true);
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
              {isMappingFeedPlaceholders && parsedFeed && (
                <div className="feed-mapping">
                  <div className="feed-mapping-header">
                    <strong>Map placeholders</strong>

                    <span>
                      {
                        parsedFeed.columns.filter(
                          (column) =>
                            column !== feedIdentifierColumn &&
                            column !== feedDimensionColumn,
                        ).length
                      }{" "}
                      fields
                    </span>
                  </div>
                  <div className="feed-bulk-mapping">
                    <label className="feed-select-all">
                      <input
                        type="checkbox"
                        checked={
                          parsedFeed.columns.filter(
                            (column) =>
                              column !== feedIdentifierColumn &&
                              column !== feedDimensionColumn,
                          ).length > 0 &&
                          selectedFeedPlaceholders.length ===
                            parsedFeed.columns.filter(
                              (column) =>
                                column !== feedIdentifierColumn &&
                                column !== feedDimensionColumn,
                            ).length
                        }
                        onChange={(event) => {
                          const placeholderColumns = parsedFeed.columns.filter(
                            (column) =>
                              column !== feedIdentifierColumn &&
                              column !== feedDimensionColumn,
                          );

                          setSelectedFeedPlaceholders(
                            event.target.checked ? placeholderColumns : [],
                          );
                        }}
                      />

                      <span>Select all</span>
                    </label>

                    <span className="feed-selected-count">
                      {selectedFeedPlaceholders.length} selected
                    </span>
                    <button
                      className="mapping-button"
                      disabled={selectedFeedPlaceholders.length === 0}
                      onClick={autoMapSelectedFeedPlaceholders}
                    >
                      Auto-map
                    </button>
                    <select
                      value={bulkPlaceholderType}
                      onChange={(event) => {
                        setBulkPlaceholderType(
                          event.target.value as PlaceholderType,
                        );
                      }}
                      disabled={selectedFeedPlaceholders.length === 0}
                    >
                      {PLACEHOLDER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>

                    <button
                      className="mapping-button"
                      disabled={selectedFeedPlaceholders.length === 0}
                      onClick={() => {
                        setFeedPlaceholderTypes((current) => {
                          const updated = { ...current };

                          selectedFeedPlaceholders.forEach((column) => {
                            updated[column] = bulkPlaceholderType;
                          });

                          return updated;
                        });
                      }}
                    >
                      Apply
                    </button>
                  </div>
                  <div className="feed-placeholder-list">
                    {parsedFeed.columns
                      .filter(
                        (column) =>
                          column !== feedIdentifierColumn &&
                          column !== feedDimensionColumn,
                      )
                      .map((column) => {
                        const isSelected =
                          selectedFeedPlaceholders.includes(column);

                        return (
                          <div
                            key={column}
                            className={`feed-placeholder-row ${
                              isSelected ? "selected" : ""
                            } ${
                              (feedPlaceholderTypes[column] ?? "not used") !==
                              "not used"
                                ? "mapped"
                                : "not-used"
                            }`}
                          >
                            <label className="feed-placeholder-checkbox">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(event) => {
                                  setSelectedFeedPlaceholders((current) =>
                                    event.target.checked
                                      ? [...current, column]
                                      : current.filter(
                                          (item) => item !== column,
                                        ),
                                  );
                                }}
                              />
                            </label>

                            <div className="feed-placeholder-name">
                              {column}
                            </div>

                            <div className="feed-placeholder-type">
                              {(() => {
                                const type =
                                  feedPlaceholderTypes[column] ?? "not used";

                                return (
                                  <>
                                    <span className="feed-placeholder-type-icon">
                                      {PLACEHOLDER_TYPE_ICONS[type]}{" "}
                                    </span>
                                    <span>{type}</span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  <div className="feed-mapping-actions">
                    <button
                      className="mapping-button"
                      onClick={() => {
                        setIsMappingFeedPlaceholders(false);
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      className="mapping-button"
                      disabled={
                        !Object.values(feedPlaceholderTypes).some(
                          (type) => type !== "not used",
                        )
                      }
                      onClick={() => {
                        finishFeedMapping();
                      }}
                    >
                      {Object.values(feedPlaceholderTypes).some(
                        (type) => type === "collection",
                      )
                        ? "Next"
                        : "Finish"}
                    </button>
                  </div>
                </div>
              )}
              {isMappingCollection && (
                <div className="feed-mapping">
                  <div className="feed-mapping-header">
                    <strong>Map collection</strong>

                    <span>Collection settings</span>
                  </div>

                  <div className="feed-mapping-fields">
                    <div className="feed-mapping-field">
                      <label htmlFor="collection-name">Collection</label>

                      <input
                        id="collection-name"
                        type="text"
                        value={collectionName}
                        onChange={(event) => {
                          setCollectionName(event.target.value);
                        }}
                        placeholder="products"
                      />
                    </div>

                    <div className="feed-mapping-field">
                      <label htmlFor="collection-intent">Intent</label>

                      <input
                        id="collection-intent"
                        type="text"
                        value={collectionIntent}
                        onChange={(event) => {
                          setCollectionIntent(event.target.value);
                        }}
                        placeholder="product"
                      />
                    </div>

                    <div className="feed-mapping-field">
                      <label htmlFor="collection-required-items">
                        Required items
                      </label>

                      <input
                        id="collection-required-items"
                        type="number"
                        min="1"
                        max="10"
                        step="1"
                        value={collectionRequiredItems}
                        onChange={(event) => {
                          setCollectionRequiredItems(event.target.value);
                        }}
                      />
                    </div>
                  </div>

                  <div className="feed-mapping-actions collection-mapping-actions">
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setApiError(null);

                        if (!selectedAdvertiser) {
                          setImportModalMode("collectionFields");
                          setShowImportModal(true);
                          return;
                        }

                        setLoadingCollectionFields(true);

                        vscode.postMessage({
                          type: "loadCollectionFields",
                          agencyId: selectedAgency,
                          advertiserId: selectedAdvertiser,
                        });
                      }}
                    >
                      {loadingCollectionFields
                        ? "Loading product fields..."
                        : "Import product fields from CO"}
                    </button>
                    {collectionMappings.length > 0 && (
                      <div className="collection-fields-section">
                        <div className="collection-fields-header">
                          <div className="collection-field-select">
                            <div className="feed-select-all">
                              <input
                                type="checkbox"
                                checked={allCollectionFieldsSelected}
                                onChange={(event) => {
                                  const selected = event.target.checked;

                                  setCollectionMappings((current) =>
                                    current.map((mapping) => ({
                                      ...mapping,
                                      selected,
                                    })),
                                  );
                                }}
                              />
                            </div>
                          </div>

                          <span className="collection-field-placeholder">
                            Placeholder
                          </span>

                          <span className="collection-field-product">
                            Product field
                          </span>

                          <span className="collection-field-type">
                            Field type
                          </span>

                          <span className="collection-field-placeholder-type">
                            Placeholder type
                          </span>
                        </div>
                      </div>
                    )}
                    {collectionMappings.map((mapping) => (
                      <div
                        key={mapping.productField.id}
                        className={`collection-field-row ${
                          mapping.selected ? "selected" : ""
                        }`}
                      >
                        <div className="collection-field-checkbox">
                          <div className="feed-placeholder-checkbox">
                            <input
                              type="checkbox"
                              checked={mapping.selected}
                              onChange={(event) => {
                                const selected = event.target.checked;

                                setCollectionMappings((current) =>
                                  current.map((item) =>
                                    item.productField.id ===
                                    mapping.productField.id
                                      ? {
                                          ...item,
                                          selected,
                                        }
                                      : item,
                                  ),
                                );
                              }}
                            />
                          </div>
                        </div>

                        <input
                          className="collection-placeholder-input"
                          type="text"
                          value={mapping.placeholder}
                          onChange={(event) => {
                            const placeholder = event.target.value;

                            setCollectionMappings((current) =>
                              current.map((item) =>
                                item.productField.id === mapping.productField.id
                                  ? {
                                      ...item,
                                      placeholder,
                                    }
                                  : item,
                              ),
                            );
                          }}
                        />

                        <div className="collection-field-product-name">
                          {mapping.productField.name}
                        </div>

                        <div className="collection-field-type">
                          {mapping.productField.type}
                        </div>
                        <div className="collection-field-placeholder-type">
                          <span className="feed-placeholder-type-icon">
                            {PLACEHOLDER_TYPE_ICONS[mapping.placeholderType]}
                          </span>

                          {mapping.placeholderType}
                        </div>
                      </div>
                    ))}

                    <div className="collection-mapping-navigation">
                      <button
                        className="mapping-button"
                        onClick={() => {
                          setIsMappingCollection(false);
                          setIsMappingFeedPlaceholders(true);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="mapping-button"
                        disabled={!hasSelectedCollectionFields}
                        onClick={() => {
                          const selectedFields = collectionMappings
                            .filter((mapping) => mapping.selected)
                            .map((mapping) => ({
                              productField: mapping.productField.name,
                              placeholder: mapping.placeholder,
                              placeholderType: mapping.placeholderType,
                            }));
                          setCollectionMapping({
                            collection: collectionName,
                            intent: collectionIntent,
                            required: collectionRequiredItems,
                            fields: selectedFields,
                          });

                          // Build the normal placeholder list too
                          buildFeedVariants();

                          // Close mapping UIs
                          setIsMappingCollection(false);
                          setIsMappingFeed(false);
                          setIsMappingFeedPlaceholders(false);
                          setIsMappingPlaceholders(false);

                          // Show finished result
                          setIsFeedMappingFinished(true);
                        }}
                      >
                        Finish
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {placeholderVariants.length > 0 &&
                !isMappingPlaceholders &&
                !isMappingFeed &&
                !isMappingFeedPlaceholders &&
                !isMappingCollection && (
                  <div className="variant-container">
                    <div className="variant-navigation">
                      <button
                        className="variant-arrow"
                        disabled={selectedVariantIndex === 0}
                        onClick={() => {
                          setSelectedVariantIndex((index) => index - 1);
                        }}
                      >
                        ←
                      </button>

                      <span>
                        Variant {selectedVariantIndex + 1} of{" "}
                        {placeholderVariants.length}
                      </span>
                      <button
                        className="variant-arrow"
                        disabled={
                          selectedVariantIndex ===
                          placeholderVariants.length - 1
                        }
                        onClick={() => {
                          setSelectedVariantIndex((index) => index + 1);
                        }}
                      >
                        →
                      </button>
                    </div>
                    {dimensionType === "responsive" &&
                      selectedDimensions.length > 0 && (
                        <div className="placeholder-size-selector">
                          <label htmlFor="placeholder-size">Size</label>

                          <select
                            id="placeholder-size"
                            value={displayDimension}
                            onChange={(event) => {
                              setDisplayDimension(event.target.value);
                            }}
                          >
                            {selectedDimensions.map((dimension) => (
                              <option key={dimension} value={dimension}>
                                {getDimensionLabel(dimension)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    <div className="placeholder-list">
                      <div className="placeholder-item identifier-item">
                        <div className="placeholder-name">Identifier</div>

                        <div className="placeholder-value">
                          {placeholderVariants[selectedVariantIndex].contentId}
                        </div>
                      </div>
                      {placeholderVariants[selectedVariantIndex].dimensions
                        .find(
                          (dimension) =>
                            dimension.templateDimension === displayDimension,
                        )
                        ?.placeholders.map((placeholder) => (
                          <div className="placeholder-item">
                            <div className="placeholder-name">
                              <span className="placeholder-name-text">
                                {placeholder.name}
                              </span>

                              <span className="placeholder-type">
                                {PLACEHOLDER_TYPE_ICONS[placeholder.type]}{" "}
                              </span>
                            </div>
                            <div className="placeholder-value">
                              {Array.isArray(placeholder.value)
                                ? `${placeholder.value.length} products`
                                : String(placeholder.value || "—")}
                            </div>
                          </div>
                        ))}
                    </div>
                    <div className="variant-field-count">
                      <span>
                        {placeholderVariants[
                          selectedVariantIndex
                        ]?.dimensions.find(
                          (dimension) =>
                            dimension.templateDimension === displayDimension,
                        )?.placeholders.length ?? 0}{" "}
                        fields
                      </span>
                    </div>
                  </div>
                )}
              {collectionMapping &&
                !isMappingCollection &&
                selectedProducts.length > 0 && (
                  <div className="collection-fields-section">
                    {" "}
                    <div className="feed-mapping-header">
                      {" "}
                      <strong>Collection</strong>{" "}
                    </div>{" "}
                    <div className="feed-mapping-fields">
                      {" "}
                      <div className="feed-mapping-field">
                        {" "}
                        <label>Collection name</label>{" "}
                        <input
                          value={collectionMapping.collection}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCollectionMapping((current) =>
                              current
                                ? { ...current, collection: value }
                                : current,
                            );
                          }}
                        />{" "}
                      </div>{" "}
                      <div className="feed-mapping-field">
                        {" "}
                        <label>Intent</label>{" "}
                        <input
                          value={collectionMapping.intent}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCollectionMapping((current) =>
                              current ? { ...current, intent: value } : current,
                            );
                          }}
                        />{" "}
                      </div>{" "}
                      <div className="feed-mapping-field">
                        {" "}
                        <label>Required</label>{" "}
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={collectionMapping.required}
                          onChange={(event) => {
                            setCollectionMapping((current) =>
                              current
                                ? { ...current, required: event.target.value }
                                : current,
                            );
                          }}
                        />{" "}
                      </div>{" "}
                    </div>{" "}
                    <div className="feed-mapping-fields">
                      <div className="feed-mapping-field">
                        {" "}
                        <label>Selector ID</label>{" "}
                        <div className="placeholder-value">
                          {" "}
                          {selectedProductSelectorId || "—"}{" "}
                        </div>{" "}
                      </div>
                    </div>
                    <div className="feed-mapping-header">
                      {" "}
                      <strong>Products</strong>{" "}
                    </div>{" "}
                    <div className="variant-navigation">
                      {" "}
                      <button
                        className="variant-arrow"
                        disabled={selectedProductIndex === 0}
                        onClick={() => {
                          setSelectedProductIndex((index) => index - 1);
                        }}
                      >
                        {" "}
                        ←{" "}
                      </button>{" "}
                      <span>
                        {" "}
                        Product {selectedProductIndex + 1} of{" "}
                        {selectedProducts.length}{" "}
                      </span>{" "}
                      <button
                        className="variant-arrow"
                        disabled={
                          selectedProductIndex === selectedProducts.length - 1
                        }
                        onClick={() => {
                          setSelectedProductIndex((index) => index + 1);
                        }}
                      >
                        {" "}
                        →{" "}
                      </button>{" "}
                    </div>{" "}
                    <div className="collection-field-list">
                      {" "}
                      <div className="collection-field-list-header">
                        {" "}
                        <span>Placeholder</span> <span>Content</span>{" "}
                      </div>{" "}
                      {collectionMapping.fields.map((field) => {
                        const rawValue =
                          selectedProduct?.fields?.[field.productField];

                        const value =
                          rawValue &&
                          typeof rawValue === "object" &&
                          "value" in rawValue
                            ? rawValue.value
                            : (rawValue ?? "");
                        return (
                          <div
                            key={field.placeholder}
                            className="collection-field-list-row"
                          >
                            {" "}
                            <div className="placeholder-name">
                              {" "}
                              <span className="placeholder-name-text">
                                {field.placeholder}
                                <span className="placeholder-type">
                                  {
                                    PLACEHOLDER_TYPE_ICONS[
                                      field.placeholderType
                                    ]
                                  }
                                </span>
                              </span>{" "}
                            </div>{" "}
                            <div className="placeholder-value">
                              {" "}
                              {String(value) || "—"}{" "}
                            </div>{" "}
                          </div>
                        );
                      })}{" "}
                    </div>{" "}
                    <div className="collection-field-count">
                      {" "}
                      <span>
                        {" "}
                        {collectionMapping.fields.length} fields{" "}
                      </span>{" "}
                    </div>{" "}
                  </div>
                )}
            </section>
          )}

          {step === 4 && (!settingsMode || settingsSection === 4) && (
            <section>
              {" "}
              <h1>Fonts</h1>{" "}
              <p className="description">
                {" "}
                Select the fonts that should be included in the
                boilerplate.{" "}
              </p>{" "}
              <div className="font-list">
                {" "}
                {selectedFonts.length > 0 && (
                  <>
                    {" "}
                    {selectedFonts.map((selectedFont, index) => {
                      const font = coFonts.find(
                        (font) => font["font-family"] === selectedFont.family,
                      );
                      return (
                        <div className="font-row" key={selectedFont.id}>
                          {" "}
                          <div className="font-row-number">
                            {index + 1}
                          </div>{" "}
                          <div className="font-row-fields">
                            {" "}
                            <select
                              value={selectedFont.family}
                              onChange={(event) => {
                                const family = event.target.value;
                                const selectedCOFont = coFonts.find(
                                  (font) => font["font-family"] === family,
                                );
                                setSelectedFonts((fonts) =>
                                  fonts.map((font) =>
                                    font.id === selectedFont.id
                                      ? {
                                          ...font,
                                          family,
                                          variant: "",
                                          fontUrl:
                                            selectedCOFont?.["css-base-url"] ??
                                            "",
                                        }
                                      : font,
                                  ),
                                );
                              }}
                              className="select-input"
                            >
                              {" "}
                              <option value="">Select a font</option>{" "}
                              {coFonts.map((font) => (
                                <option
                                  key={font["font-family"]}
                                  value={font["font-family"]}
                                >
                                  {" "}
                                  {font["font-family"]}{" "}
                                </option>
                              ))}{" "}
                            </select>{" "}
                            <select
                              value={selectedFont.variant}
                              disabled={!font}
                              onChange={(event) =>
                                updateFont(
                                  selectedFont.id,
                                  "variant",
                                  event.target.value,
                                )
                              }
                              className="select-input"
                            >
                              {" "}
                              <option value="">
                                {" "}
                                {font
                                  ? "Select a weight"
                                  : "Select a font first"}{" "}
                              </option>{" "}
                              {font?.variants.map((variant) => (
                                <option
                                  key={variant.variant}
                                  value={variant.variant}
                                >
                                  {" "}
                                  {variant["font-weight"]}{" "}
                                  {variant["font-style"]
                                    ? ` ${variant["font-style"]}`
                                    : ""}{" "}
                                </option>
                              ))}{" "}
                            </select>{" "}
                          </div>{" "}
                          <button
                            type="button"
                            className="font-remove-button"
                            onClick={() => removeFont(selectedFont.id)}
                            aria-label="Remove font"
                          >
                            {" "}
                            ×{" "}
                          </button>{" "}
                        </div>
                      );
                    })}{" "}
                    <button
                      type="button"
                      className="add-font-button"
                      onClick={addFont}
                    >
                      {" "}
                      + Add font{" "}
                    </button>{" "}
                  </>
                )}{" "}
                {selectedFonts.length === 0 && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setApiError(null);
                      setShowFontImportModal(true);
                    }}
                  >
                    Import fonts from CO
                  </button>
                )}{" "}
              </div>{" "}
              {showFontImportModal && (
                <div className="modal-backdrop">
                  {" "}
                  <div className="import-modal">
                    {" "}
                    <div className="modal-header">
                      {" "}
                      <div>
                        {" "}
                        <h2>Import fonts</h2>{" "}
                        <p>
                          {" "}
                          Connect to Creative Optimizations and select the
                          advertiser to import fonts from.{" "}
                        </p>{" "}
                      </div>{" "}
                      <button
                        className="modal-close"
                        onClick={() => {
                          setShowFontImportModal(false);
                        }}
                      >
                        {" "}
                        ×{" "}
                      </button>{" "}
                    </div>{" "}
                    <div className="modal-body">
                      {" "}
                      {!isAuthenticated ? (
                        <div className="login-section">
                          {" "}
                          <h3>Connect to Creative Optimizations</h3>{" "}
                          <p>
                            {" "}
                            Sign in to Creative Optimizations to select an
                            advertiser.{" "}
                          </p>{" "}
                          <button
                            className="connect-button"
                            onClick={() => {
                              setLoadingAgencies(true);
                              setApiError(null);
                              vscode.postMessage({
                                type: "connectToCreativeOptimizations",
                              });
                            }}
                          >
                            {" "}
                            Connect to Creative Optimizations{" "}
                          </button>{" "}
                        </div>
                      ) : (
                        <div className="logged-in">
                          {" "}
                          <span>
                            {" "}
                            Logged in as <strong>{userEmail}</strong>{" "}
                          </span>{" "}
                          <button
                            className="change-account-button"
                            onClick={() => {
                              setLoadingAgencies(true);
                              setApiError(null);
                              vscode.postMessage({
                                type: "connectToCreativeOptimizations",
                              });
                            }}
                          >
                            {" "}
                            Change account{" "}
                          </button>{" "}
                        </div>
                      )}{" "}
                      {loadingAgencies && <p>Loading agencies...</p>}{" "}
                      {apiError && <p className="error-message">{apiError}</p>}{" "}
                      {!loadingAgencies && agencies.length > 0 && (
                        <div className="selection-fields">
                          {" "}
                          <label>
                            {" "}
                            Agency{" "}
                            <select
                              value={selectedAgency ?? ""}
                              onChange={(event) => {
                                const agencyId = Number(event.target.value);

                                setSelectedAgency(agencyId);
                                setSelectedAdvertiser(null);
                                setAdvertisers([]);
                                setApiError(null);
                              }}
                            >
                              {" "}
                              <option value="">Select an agency</option>{" "}
                              {agencies.map((agency) => (
                                <option key={agency.id} value={agency.id}>
                                  {" "}
                                  {agency.name}{" "}
                                </option>
                              ))}{" "}
                            </select>{" "}
                          </label>{" "}
                          {selectedAgency && (
                            <label>
                              {" "}
                              Advertiser{" "}
                              <select
                                value={selectedAdvertiser ?? ""}
                                disabled={loadingAdvertisers}
                                onChange={(event) => {
                                  const advertiserId = Number(
                                    event.target.value,
                                  );
                                  setSelectedAdvertiser(advertiserId);
                                  setApiError(null);
                                }}
                              >
                                {" "}
                                <option value="">
                                  {" "}
                                  {loadingAdvertisers
                                    ? "Loading advertisers..."
                                    : "Select an advertiser"}{" "}
                                </option>{" "}
                                {advertisers.map((advertiser) => (
                                  <option
                                    key={advertiser.id}
                                    value={advertiser.id}
                                  >
                                    {" "}
                                    {advertiser.name}{" "}
                                  </option>
                                ))}{" "}
                              </select>{" "}
                            </label>
                          )}{" "}
                        </div>
                      )}{" "}
                    </div>{" "}
                    <div className="modal-footer">
                      {" "}
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setShowFontImportModal(false);
                        }}
                      >
                        {" "}
                        Cancel{" "}
                      </button>{" "}
                      <button
                        className="primary-button"
                        disabled={!selectedAdvertiser || loadingFonts}
                        onClick={() => {
                          if (!selectedAdvertiser) {
                            return;
                          }
                          setApiError(null);
                          setLoadingFonts(true);

                          vscode.postMessage({
                            type: "loadCOFonts",
                            advertiserId: selectedAdvertiser,
                          });
                        }}
                      >
                        {" "}
                        {loadingFonts
                          ? "Loading fonts..."
                          : "Import fonts"}{" "}
                      </button>{" "}
                    </div>{" "}
                  </div>{" "}
                </div>
              )}{" "}
            </section>
          )}

          {step === 5 && (
            <section>
              <h1>Create boilerplate</h1>

              <p className="description">
                Everything looks good. We'll create the initial HTML creative in
                your workspace.
              </p>

              <div className="summary">
                <div>
                  <span>Name</span>
                  <strong>{name || "Untitled creative"}</strong>
                </div>

                <div>
                  <span>Dimensions</span>
                  <strong>
                    {dimensionType === "single"
                      ? selectedDimensions[0] || "Not selected"
                      : selectedDimensions.length > 0
                        ? selectedDimensions.join(", ")
                        : "Not selected"}
                  </strong>
                </div>

                <div>
                  <span>Adset</span>
                  <strong>{selectedAdset || "Not selected"}</strong>
                </div>

                <div>
                  <span>Placeholders</span>
                  <strong></strong>
                </div>
              </div>
            </section>
          )}
        </main>

        <footer className="footer">
          {settingsMode ? (
            <div className="footer-buttons">
              <button
                className="primary-button"
                disabled={
                  !hasSettingsChanges ||
                  (settingsSection === 4 && hasIncompleteFont)
                }
                onClick={() => {
                  vscode.postMessage({
                    type: "saveSettings",
                    settings: getCurrentSettings(),
                    content: {
                      variants: placeholderVariants,
                    },
                    collectionMapping,
                  });
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <div className="footer-buttons">
              {step > 1 && (
                <button className="secondary-button" onClick={back}>
                  ← Back
                </button>
              )}

              <button
                className="primary-button"
                disabled={
                  (step === 1 && (name.trim() === "" || !selectedFolder)) ||
                  (step === 2 && selectedDimensions.length === 0) ||
                  (step === 3 &&
                    ((!selectedAdsetId && !parsedFeed) ||
                      (parsedFeed && !isFeedMappingFinished))) ||
                  (step === 4 && hasIncompleteFont)
                }
                onClick={() => {
                  if (step < 5) {
                    setStep((step + 1) as Step);
                    return;
                  }
                  vscode.postMessage({
                    type: "createBoilerplate",
                    folder: selectedFolder,
                    name,
                    userName,
                    dimensionType,
                    selectedDimensions,
                    selectedFonts,
                    coFonts,
                    placeholderVariants,
                    products,
                    collectionMapping,
                    selectedAgency: selectedAgency
                      ? (agencies.find(
                          (agency) => agency.id === selectedAgency,
                        ) ?? null)
                      : null,
                    selectedAdvertiser: selectedAdvertiser
                      ? (advertisers.find(
                          (advertiser) => advertiser.id === selectedAdvertiser,
                        ) ?? null)
                      : null,
                    selectedAdset: selectedAdsetId
                      ? (adsets.find((adset) => adset.id === selectedAdsetId) ??
                        null)
                      : null,
                  });
                }}
              >
                {step === 5 ? "Create boilerplate" : "Continue →"}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
