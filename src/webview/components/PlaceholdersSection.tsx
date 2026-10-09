import React, { useEffect, useRef, useState } from "react";
import { parseFeed, type ParsedFeed } from "../../feed";

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

const PLACEHOLDER_TYPE_ICONS: Record<PlaceholderType, string> = {
  "not used": "—",
  text: "T",
  image: "▧",
  video: "▶",
  audio: "♫",
  click: "↗",
  collection: "☷",
};

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

type Placeholder = {
  name: string;
  type: PlaceholderType;
  value: unknown;
};

type PlaceholderDimension = {
  templateDimension: string;
  width: number;
  height: number;
  productSelectorId?: string;
  placeholders: Placeholder[];
};

export type PlaceholderVariant = {
  contentId: string;
  variantId: number | string | null;
  dimensions: PlaceholderDimension[];
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

type CollectionMapping = {
  collection: string;
  intent: string;
  required: string;
  fields: {
    productField: string;
    placeholder: string;
    placeholderType: PlaceholderType;
  }[];
};

type ProductsBySelector = Record<
  string,
  {
    name: string;
    products: unknown;
  }
>;

type SelectorSearchProgress = {
  agencyIndex: number;
  agencyCount: number;
  agencyName: string;
  advertiserCount: number | null;
  advertisersChecked: number;
  totalChecked: number;
};

type ProductSelectorRequest = {
  selectorId: string;
  required: number;
};

type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type PlaceholdersSectionProps = {
  vscode: VsCodeApi;
  dimensionType: "single" | "responsive";
  selectedDimensions: string[];

  selectedAgency: number | null;
  setSelectedAgency: React.Dispatch<React.SetStateAction<number | null>>;

  selectedAdvertiser: number | null;
  setSelectedAdvertiser: React.Dispatch<React.SetStateAction<number | null>>;

  selectedAdsetId: number | null;
  setSelectedAdsetId: React.Dispatch<React.SetStateAction<number | null>>;

  setSelectedAdset: React.Dispatch<React.SetStateAction<string | null>>;

  agencies: Agency[];
  setAgencies: React.Dispatch<React.SetStateAction<Agency[]>>;

  advertisers: Advertiser[];
  setAdvertisers: React.Dispatch<React.SetStateAction<Advertiser[]>>;

  adsets: AdSet[];
  setAdsets: React.Dispatch<React.SetStateAction<AdSet[]>>;

  isAuthenticated: boolean;
  userEmail: string | null;

  apiError: string | null;
  setApiError: React.Dispatch<React.SetStateAction<string | null>>;

  placeholderVariants: PlaceholderVariant[];
  setPlaceholderVariants: React.Dispatch<
    React.SetStateAction<PlaceholderVariant[]>
  >;

  parsedFeed: ParsedFeed | null;
  setParsedFeed: React.Dispatch<React.SetStateAction<ParsedFeed | null>>;

  isFeedMappingFinished: boolean;
  setIsFeedMappingFinished: React.Dispatch<React.SetStateAction<boolean>>;

  collectionMapping: CollectionMapping | null;
  setCollectionMapping: React.Dispatch<
    React.SetStateAction<CollectionMapping | null>
  >;

  products: ProductsBySelector;
  setProducts: React.Dispatch<React.SetStateAction<ProductsBySelector>>;
};

export default function PlaceholdersSection({
  vscode,
  dimensionType,
  selectedDimensions,

  selectedAgency,
  setSelectedAgency,

  selectedAdvertiser,
  setSelectedAdvertiser,

  selectedAdsetId,
  setSelectedAdsetId,

  setSelectedAdset,

  agencies,
  setAgencies,

  advertisers,
  setAdvertisers,

  adsets,
  setAdsets,

  isAuthenticated,
  userEmail,

  apiError,
  setApiError,

  placeholderVariants,
  setPlaceholderVariants,

  parsedFeed,
  setParsedFeed,

  isFeedMappingFinished,
  setIsFeedMappingFinished,

  collectionMapping,
  setCollectionMapping,

  products,
  setProducts,
}: PlaceholdersSectionProps) {
  const [loadingPlaceholders, setLoadingPlaceholders] = useState(false);

  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [displayDimension, setDisplayDimension] = useState("");

  const [showImportModal, setShowImportModal] = useState(false);
  const [importModalMode, setImportModalMode] = useState<
    "placeholders" | "collectionFields"
  >("placeholders");

  const [loadingAgencies, setLoadingAgencies] = useState(false);
  const [loadingAdvertisers, setLoadingAdvertisers] = useState(false);
  const [loadingAdsets, setLoadingAdsets] = useState(false);

  const [showFeedModal, setShowFeedModal] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedFile, setFeedFile] = useState<File | null>(null);
  const [feedSourceType, setFeedSourceType] = useState<
    "local" | "remote" | null
  >(null);

  const [isMappingFeed, setIsMappingFeed] = useState(false);
  const [isMappingFeedPlaceholders, setIsMappingFeedPlaceholders] =
    useState(false);
  const [isMappingPlaceholders, setIsMappingPlaceholders] = useState(false);
  const [isMappingCollection, setIsMappingCollection] = useState(false);

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

  const [collectionName, setCollectionName] = useState("products");
  const [collectionIntent, setCollectionIntent] = useState("product");
  const [collectionRequiredItems, setCollectionRequiredItems] = useState("1");

  const [collectionFields, setCollectionFields] = useState<CollectionField[]>(
    [],
  );

  const [collectionMappings, setCollectionMappings] = useState<
    CollectionFieldMapping[]
  >([]);

  const [loadingCollectionFields, setLoadingCollectionFields] = useState(false);

  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  const productRequestsLoaded = useRef<Set<string>>(new Set());

  // The message handler is registered once, so it reads this instead of props.
  const previousCollectionFields = useRef<CollectionMapping["fields"]>([]);
  previousCollectionFields.current = collectionMapping?.fields ?? [];

  // Start the collection step from the previous mapping's settings.
  useEffect(() => {
    if (isMappingCollection && collectionMapping) {
      setCollectionName(collectionMapping.collection);
      setCollectionIntent(collectionMapping.intent);
      setCollectionRequiredItems(collectionMapping.required);
    }
  }, [isMappingCollection]);

  const [selectorCheckResult, setSelectorCheckResult] = useState<{
    advertiserId: number;
    unavailable: string[];
  } | null>(null);
  const pendingSelectorCheck = useRef<number | null>(null);

  const [findingAdvertiser, setFindingAdvertiser] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchProgress, setSearchProgress] =
    useState<SelectorSearchProgress | null>(null);
  const [foundOwner, setFoundOwner] = useState<{
    agencyName: string;
    advertiserName: string;
  } | null>(null);
  const autoSearchedSelector = useRef<string | null>(null);
  const fieldsRequestedFor = useRef<number | null>(null);

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

  const allCollectionFieldsSelected =
    collectionMappings.length > 0 &&
    collectionMappings.every((mapping) => mapping.selected);

  const hasSelectedCollectionFields = collectionMappings.some(
    (mapping) => mapping.selected,
  );

  const getDimensionLabel = (dimension: string) => {
    return dimension;
  };

  // Custom sizes aren't plain WxH ids, so they can't be checked here.
  const availableDimensions = new Set(
    placeholderVariants.flatMap((variant) =>
      variant.dimensions.map((dimension) => dimension.templateDimension),
    ),
  );

  const missingDimensions =
    placeholderVariants.length > 0
      ? selectedDimensions.filter(
          (dimension) =>
            /^\d+x\d+$/.test(dimension) && !availableDimensions.has(dimension),
        )
      : [];

  const missingDimensionsKey = missingDimensions.join("|");

  /*
   * Keep the displayed dimension in sync with the selected dimensions.
   */
  useEffect(() => {
    if (selectedDimensions.length === 0) {
      return;
    }

    const missing = missingDimensionsKey.split("|");
    const preferred =
      selectedDimensions.find((dimension) => !missing.includes(dimension)) ??
      selectedDimensions[0];

    if (dimensionType === "single") {
      setDisplayDimension(preferred);
      return;
    }

    if (
      !selectedDimensions.includes(displayDimension) ||
      missing.includes(displayDimension)
    ) {
      setDisplayDimension(preferred);
    }
  }, [
    selectedDimensions,
    dimensionType,
    displayDimension,
    missingDimensionsKey,
  ]);

  /*
   * Reset the product preview when changing variant or dimension.
   */
  useEffect(() => {
    setSelectedProductIndex(0);
  }, [selectedVariantIndex, displayDimension]);

  /*
   * Load agencies when an import modal is opened.
   */
  useEffect(() => {
    if (!isAuthenticated || !showImportModal) {
      return;
    }

    setLoadingAgencies(true);
    setApiError(null);

    vscode.postMessage({
      type: "loadAgencyData",
    });
  }, [isAuthenticated, showImportModal, setApiError]);

  /*
   * Load advertisers after selecting an agency.
   */
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
  }, [isAuthenticated, showImportModal, selectedAgency, setApiError]);

  /*
   * Load adsets only for the placeholder import flow.
   */
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
    setApiError,
  ]);

  /*
   * Step-3 message handling.
   */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === "placeholdersLoaded") {
        setPlaceholderVariants(message.variants ?? []);
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
                placeholderType: (
                  config as {
                    type: PlaceholderType;
                  }
                ).type,
              }),
            ),
          });
        } else {
          setCollectionMapping(null);
        }

        /*
         * Restore products already supplied by the CO content API.
         */
        const restoredProducts: ProductsBySelector = {};

        message.variants?.forEach((variant: PlaceholderVariant) => {
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

        return;
      }

      if (message.type === "placeholdersError") {
        setLoadingPlaceholders(false);
        setApiError(message.message);
        return;
      }

      if (message.type === "collectionFieldsLoaded") {
        const fields = (message.fields ?? []) as CollectionField[];

        setCollectionFields(fields);

        const previous = previousCollectionFields.current;

        setCollectionMappings(
          fields.map((field) => {
            const earlier = previous.find(
              (item) => item.productField === field.name,
            );

            return {
              productField: field,
              placeholder: earlier?.placeholder ?? field.name,
              placeholderType:
                earlier?.placeholderType ??
                COLLECTION_FIELD_PLACEHOLDER_TYPES[field.type] ??
                "text",
              selected: !!earlier,
            };
          }),
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
        setLoadingProducts(false);
        setProductsError(message.message);
        return;
      }

      if (message.type === "productSelectorsChecked") {
        setSelectorCheckResult({
          advertiserId: message.advertiserId,
          unavailable: message.unavailable ?? [],
        });
        return;
      }

      if (message.type === "productSelectorOwnerFound") {
        setFindingAdvertiser(false);
        setSearchProgress(null);

        const owner = message.owner as {
          agency: Agency;
          advertiser: Advertiser;
        } | null;

        if (!owner) {
          setSearchFailed(true);
          return;
        }

        setFoundOwner({
          agencyName: owner.agency.name,
          advertiserName: owner.advertiser.name,
        });

        setAgencies((current) =>
          current.some((agency) => agency.id === owner.agency.id)
            ? current
            : [...current, owner.agency],
        );
        setAdvertisers((current) =>
          current.some((advertiser) => advertiser.id === owner.advertiser.id)
            ? current
            : [...current, owner.advertiser],
        );
        setSelectedAgency(owner.agency.id);
        setSelectedAdvertiser(owner.advertiser.id);
        setCollectionMappings([]);
        return;
      }

      if (message.type === "productSelectorOwnerError") {
        setFindingAdvertiser(false);
        setSearchProgress(null);
        setSearchFailed(true);
        return;
      }

      if (message.type === "productSelectorSearchProgress") {
        setSearchProgress(message.progress);
        return;
      }

      if (message.type === "productSelectorsError") {
        // Don't block mapping when the check itself fails.
        if (pendingSelectorCheck.current !== null) {
          setSelectorCheckResult({
            advertiserId: pendingSelectorCheck.current,
            unavailable: [],
          });
        }
        return;
      }

      if (message.type === "agencyDataLoaded") {
        setAgencies(message.agencies ?? []);
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
        setAdvertisers(message.advertisers ?? []);
        setLoadingAdvertisers(false);
        setApiError(null);
        return;
      }

      if (message.type === "advertisersError") {
        setLoadingAdvertisers(false);
        setApiError(message.message);
        return;
      }

      if (message.type === "adsetsLoaded") {
        setAdsets(message.adsets ?? []);
        setLoadingAdsets(false);
        setApiError(null);
        return;
      }

      if (message.type === "adsetsError") {
        setLoadingAdsets(false);
        setApiError(message.message);
        return;
      }
    };

    window.addEventListener("message", handler);

    return () => {
      window.removeEventListener("message", handler);
    };
  }, [
    setApiError,
    setAgencies,
    setAdvertisers,
    setAdsets,
    setCollectionMapping,
    setPlaceholderVariants,
    setProducts,
    setSelectedAgency,
    setSelectedAdvertiser,
  ]);

  /*
   * Pick the identifier and dimension columns from a feed's headers.
   */
  const detectFeedColumns = (feed: ParsedFeed) => {
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
  };

  // Re-opening the modal should show the feed that was already imported.
  useEffect(() => {
    if (showFeedModal && parsedFeed?.sourceType === "remote") {
      setFeedUrl((current) => current || parsedFeed.source || "");
    }
  }, [showFeedModal, parsedFeed]);

  /*
   * Load a remote CSV feed.
   */
  const loadFeedFromUrl = async () => {
    setLoadingPlaceholders(true);

    const url = feedUrl.trim();

    if (!url) {
      setApiError("Please enter a feed URL.");
      setLoadingPlaceholders(false);
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

      setParsedFeed({ ...feed, source: url, sourceType: "remote" });

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
      setLoadingPlaceholders(false);
    } catch (error) {
      console.error("Failed to load remote feed:", error);

      setLoadingPlaceholders(false);

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

  /*
   * Load products for a product selector.
   */
  const loadProductsBySelector = (
    advertiserId: number,
    selectorId: string,
    required: number,
  ) => {
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

  /*
   * Find all selector requests required by the current variants.
   *
   * Important:
   * Actual collection products are detected by:
   *   type === "collection"
   *   Array.isArray(value)
   *
   * We deliberately do not depend on the collection being named "products".
   */
  const getProductSelectorRequests = (): ProductSelectorRequest[] => {
    const requests = new Map<string, number>();

    for (const variant of placeholderVariants) {
      for (const dimension of variant.dimensions) {
        if (!dimension.productSelectorId) {
          continue;
        }

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

  /*
   * Verify the feed's product selectors exist for the selected advertiser
   * before any product fields are mapped.
   */
  const feedCollectionColumn = Object.entries(feedPlaceholderTypes).find(
    ([, type]) => type === "collection",
  )?.[0];

  const feedSelectorKey =
    feedCollectionColumn && parsedFeed
      ? Array.from(
          new Set(
            parsedFeed.rows
              .map((row) => row[feedCollectionColumn]?.trim() ?? "")
              .filter(Boolean),
          ),
        ).join("\n")
      : "";

  useEffect(() => {
    if (!isMappingCollection || !selectedAdvertiser || !feedSelectorKey) {
      return;
    }

    setSelectorCheckResult(null);
    pendingSelectorCheck.current = selectedAdvertiser;

    vscode.postMessage({
      type: "checkProductSelectors",
      advertiserId: selectedAdvertiser,
      selectorIds: feedSelectorKey.split("\n"),
    });
  }, [isMappingCollection, selectedAdvertiser, feedSelectorKey]);

  const feedSelectorCount = feedSelectorKey
    ? feedSelectorKey.split("\n").length
    : 0;

  const unavailableSelectors =
    selectorCheckResult?.advertiserId === selectedAdvertiser
      ? selectorCheckResult.unavailable
      : [];

  // Some missing selectors are fine; only none found blocks the mapping.
  const selectorCheckStatus =
    !isMappingCollection || !selectedAdvertiser || !feedSelectorKey
      ? "idle"
      : selectorCheckResult?.advertiserId !== selectedAdvertiser
        ? "checking"
        : unavailableSelectors.length === 0
          ? "ok"
          : unavailableSelectors.length >= feedSelectorCount
            ? "unavailable"
            : "partial";

  const advertiserLabel =
    foundOwner?.advertiserName ??
    advertisers.find((advertiser) => advertiser.id === selectedAdvertiser)
      ?.name ??
    "the selected advertiser";

  const unavailableSelectorsText =
    feedSelectorCount === 1
      ? `Product selector ${unavailableSelectors[0]} was not found for ${advertiserLabel}.`
      : `None of the ${feedSelectorCount} product selectors in the feed were found for ${advertiserLabel}.`;

  const partialSelectorsText = `${unavailableSelectors.length} of ${feedSelectorCount} product selectors in the feed were not found for ${advertiserLabel} and will have no products: ${unavailableSelectors.join(", ")}.`;

  /*
   * Find the advertiser that owns the feed's first product selectors.
   */
  const firstFeedSelectorId = feedSelectorKey.split("\n")[0];

  // Several IDs, so one invalid selector doesn't hide the right advertiser.
  const searchSelectorIds = feedSelectorKey
    ? feedSelectorKey.split("\n").slice(0, 3)
    : [];

  const needsAdvertiser =
    !selectedAdvertiser || selectorCheckStatus === "unavailable";

  const searchPending =
    isMappingCollection &&
    isAuthenticated &&
    !!firstFeedSelectorId &&
    needsAdvertiser &&
    autoSearchedSelector.current !== firstFeedSelectorId;

  useEffect(() => {
    if (
      !searchPending ||
      autoSearchedSelector.current === firstFeedSelectorId
    ) {
      return;
    }

    autoSearchedSelector.current = firstFeedSelectorId;
    setFindingAdvertiser(true);
    setSearchFailed(false);
    setFoundOwner(null);
    setSearchProgress(null);

    vscode.postMessage({
      type: "findProductSelectorOwner",
      selectorIds: searchSelectorIds,
      preferredAgencyId: selectedAgency,
    });
  }, [searchPending, firstFeedSelectorId, selectedAgency]);

  /*
   * Load the advertiser's product fields once its selectors are confirmed.
   */
  useEffect(() => {
    if (!isMappingCollection || !selectedAdvertiser || !selectedAgency) {
      return;
    }

    if (
      selectorCheckStatus !== "ok" &&
      selectorCheckStatus !== "partial" &&
      selectorCheckStatus !== "idle"
    ) {
      return;
    }

    if (fieldsRequestedFor.current === selectedAdvertiser) {
      return;
    }

    fieldsRequestedFor.current = selectedAdvertiser;
    setLoadingCollectionFields(true);
    setApiError(null);

    vscode.postMessage({
      type: "loadCollectionFields",
      agencyId: selectedAgency,
      advertiserId: selectedAdvertiser,
    });
  }, [
    isMappingCollection,
    selectedAdvertiser,
    selectedAgency,
    selectorCheckStatus,
    setApiError,
  ]);

  const searchProgressText = searchProgress
    ? `Searching agency ${searchProgress.agencyIndex} of ${searchProgress.agencyCount} (${searchProgress.agencyName})` +
      (searchProgress.advertiserCount === null
        ? " - loading advertisers..."
        : ` - ${searchProgress.advertisersChecked} of ${searchProgress.advertiserCount} advertisers checked`) +
      ` (${searchProgress.totalChecked} checked in total)`
    : "Looking for the advertiser that has this product selector...";

  const needsManualSetup =
    isMappingCollection &&
    !findingAdvertiser &&
    !searchPending &&
    selectorCheckStatus !== "ok" &&
    selectorCheckStatus !== "partial" &&
    selectorCheckStatus !== "checking" &&
    !(selectorCheckStatus === "idle" && !!selectedAdvertiser);

  /*
   * A different advertiser may know the selector, so allow a fresh attempt.
   */
  useEffect(() => {
    productRequestsLoaded.current.clear();
    setProductsError(null);
  }, [selectedAdvertiser]);

  /*
   * Fetch products once a selector is known.
   */
  useEffect(() => {
    if (!collectionMapping || !selectedAdvertiser) {
      return;
    }

    const requests = getProductSelectorRequests();

    if (requests.length === 0) {
      return;
    }

    const pendingRequests = requests.filter(
      ({ selectorId }) =>
        !productRequestsLoaded.current.has(selectorId) &&
        !unavailableSelectors.includes(selectorId),
    );

    if (pendingRequests.length === 0) {
      return;
    }

    setLoadingProducts(true);
    setProductsError(null);

    for (const { selectorId, required } of pendingRequests) {
      productRequestsLoaded.current.add(selectorId);

      loadProductsBySelector(selectedAdvertiser, selectorId, required);
    }
  }, [collectionMapping, placeholderVariants, selectedAdvertiser]);

  /*
   * Automatically detect feed placeholder types.
   */
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
        // Not a valid URL, so treat it as text.
      }

      if (/\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tif|tiff)$/i.test(pathname)) {
        return "image";
      }

      if (/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(pathname)) {
        return "video";
      }

      if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(pathname)) {
        return "audio";
      }

      if (/^https?:\/\//i.test(trimmedValue)) {
        return "click";
      }

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

  /*
   * Convert the mapped feed into the normal PlaceholderVariant structure.
   *
   * A dimension cell can contain:
   * 300x250, 300x600, 160x600, ...
   * and each size becomes its own dimension.
   */
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

  const resetCollectionState = () => {
    setCollectionMapping(null);
    setProducts({});
    setCollectionMappings([]);
    setSelectorCheckResult(null);
    setProductsError(null);
    setFoundOwner(null);
    setSearchFailed(false);
    productRequestsLoaded.current.clear();
    fieldsRequestedFor.current = null;
  };

  const saveFeedMapping = () => {
    setParsedFeed((feed) =>
      feed
        ? {
            ...feed,
            mapping: {
              identifierColumn: feedIdentifierColumn,
              dimensionColumn: feedDimensionColumn,
              placeholderTypes: feedPlaceholderTypes,
            },
          }
        : feed,
    );
  };

  /*
   * Finish the feed mapping.
   */
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

    // A feed without a collection must not keep the previous one's products.
    resetCollectionState();
    saveFeedMapping();
    buildFeedVariants();

    setApiError(null);
    setIsMappingPlaceholders(false);
    setIsMappingFeedPlaceholders(false);
    setIsFeedMappingFinished(true);
  };

  const selectedVariant = placeholderVariants[selectedVariantIndex];

  // Fall back so a size mismatch doesn't hide every placeholder.
  const selectedDimension =
    selectedVariant?.dimensions.find(
      (dimension) => dimension.templateDimension === displayDimension,
    ) ?? selectedVariant?.dimensions[0];

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
    : [];

  const selectedProduct = selectedProducts[selectedProductIndex] ?? null;

  const selectedSelectorUnavailable =
    !!selectedProductSelectorId &&
    unavailableSelectors.includes(selectedProductSelectorId);

  const showCollectionSection =
    !!collectionMapping &&
    !isMappingFeed &&
    !isMappingFeedPlaceholders &&
    !isMappingPlaceholders &&
    !isMappingCollection &&
    (selectedProducts.length > 0 ||
      !!productsError ||
      selectedSelectorUnavailable);

  const productsErrorText = productsError?.includes("(404)")
    ? `Product selector "${selectedProductSelectorId ?? ""}" (identifier "${selectedVariant?.contentId ?? ""}") was not found for the selected advertiser.`
    : productsError;

  const sectionErrorText = selectedSelectorUnavailable
    ? `Product selector "${selectedProductSelectorId}" (identifier "${selectedVariant?.contentId ?? ""}") was not found for ${advertiserLabel}. No products are included for this variant.`
    : productsErrorText;

  const reimportCollectionFields = () => {
    if (collectionMapping) {
      setCollectionName(collectionMapping.collection);
      setCollectionIntent(collectionMapping.intent);
      setCollectionRequiredItems(collectionMapping.required);
    }

    setApiError(null);
    setCollectionMappings([]);
    fieldsRequestedFor.current = null;
    setIsMappingCollection(true);
  };

  return (
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
                    {feedFile?.name ??
                      (parsedFeed?.sourceType === "local"
                        ? parsedFeed.source
                        : undefined) ??
                      "Choose CSV file"}
                  </span>

                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={async (event) => {
                      const file = event.target.files?.[0] ?? null;

                      setFeedFile(file);
                      setParsedFeed(null);
                      setFeedPlaceholderTypes({});
                      setFeedSourceType(file ? "local" : null);

                      if (!file) {
                        return;
                      }

                      try {
                        const csvText = await file.text();

                        const feed = parseFeed(csvText);

                        setParsedFeed({
                          ...feed,
                          source: file.name,
                          sourceType: "local",
                        });

                        const findColumn = (candidates: string[]) => {
                          const normalizedCandidates = candidates.map(
                            (candidate) => candidate.trim().toLowerCase(),
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
                )}
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
                    const saved = parsedFeed.mapping;

                    if (saved) {
                      setFeedIdentifierColumn(saved.identifierColumn);
                      setFeedDimensionColumn(saved.dimensionColumn);
                      setFeedPlaceholderTypes(
                        saved.placeholderTypes as Record<
                          string,
                          PlaceholderType
                        >,
                      );
                    } else {
                      if (!feedIdentifierColumn) {
                        detectFeedColumns(parsedFeed);
                      }

                      setFeedPlaceholderTypes({});
                    }

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
                  Connect to Creative Optimizations and select the adset to
                  import content from.
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

                  <p>Sign in to Creative Optimizations to select an adset.</p>

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

              {importModalMode === "collectionFields" &&
                selectorCheckStatus === "checking" && (
                  <p>Checking product selector...</p>
                )}

              {importModalMode === "collectionFields" &&
                selectorCheckStatus === "unavailable" && (
                  <p className="error-message">{unavailableSelectorsText}</p>
                )}

              {importModalMode === "collectionFields" &&
                selectorCheckStatus === "partial" && (
                  <p className="warning-message">{partialSelectorsText}</p>
                )}

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
                          const advertiserId = Number(event.target.value);

                          setSelectedAdvertiser(advertiserId);
                          setCollectionMappings([]);

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
                          <option key={advertiser.id} value={advertiser.id}>
                            {advertiser.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {selectedAdvertiser && importModalMode === "placeholders" && (
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
                  (importModalMode === "placeholders" && !selectedAdsetId) ||
                  (importModalMode === "collectionFields" &&
                    (selectorCheckStatus === "checking" ||
                      selectorCheckStatus === "unavailable"))
                }
                onClick={() => {
                  if (!selectedAdvertiser) {
                    return;
                  }

                  if (importModalMode === "collectionFields") {
                    // Product fields load automatically once the selectors check out.
                    setShowImportModal(false);
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
                  ? "Use advertiser"
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
              {parsedFeed.rows.length} rows · {parsedFeed.columns.length}{" "}
              columns
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
                id="feed-dimension"
                value={feedDimensionColumn}
                onChange={(event) => setFeedDimensionColumn(event.target.value)}
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
                const initialPlaceholderTypes: Record<string, PlaceholderType> =
                  {};

                parsedFeed.columns.forEach((column) => {
                  if (
                    column !== feedIdentifierColumn &&
                    column !== feedDimensionColumn
                  ) {
                    initialPlaceholderTypes[column] =
                      feedPlaceholderTypes[column] ?? "not used";
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
                setBulkPlaceholderType(event.target.value as PlaceholderType);
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
                  const updated = {
                    ...current,
                  };

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
                const isSelected = selectedFeedPlaceholders.includes(column);

                const type = feedPlaceholderTypes[column] ?? "not used";

                return (
                  <div
                    key={column}
                    className={`feed-placeholder-row ${
                      isSelected ? "selected" : ""
                    } ${type !== "not used" ? "mapped" : "not-used"}`}
                  >
                    <label className="feed-placeholder-checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) => {
                          setSelectedFeedPlaceholders((current) =>
                            event.target.checked
                              ? [...current, column]
                              : current.filter((item) => item !== column),
                          );
                        }}
                      />
                    </label>

                    <div className="feed-placeholder-name">{column}</div>

                    <div className="feed-placeholder-type">
                      <span className="feed-placeholder-type-icon">
                        {PLACEHOLDER_TYPE_ICONS[type]}{" "}
                      </span>

                      <span>{type}</span>
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
                setIsMappingPlaceholders(false);
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
              onClick={finishFeedMapping}
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
              <label htmlFor="collection-required-items">Required items</label>

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

          {findingAdvertiser && (
            <p className="status-message">{searchProgressText}</p>
          )}

          {searchFailed &&
            selectorCheckStatus !== "ok" &&
            selectorCheckStatus !== "partial" && (
              <p className="error-message">
                No advertiser with product selector{" "}
                {searchSelectorIds.join(", ")} was found in your agencies.
              </p>
            )}

          {selectorCheckStatus === "checking" && (
            <p className="status-message">
              {foundOwner
                ? `Found ${foundOwner.advertiserName} (${foundOwner.agencyName}). `
                : ""}
              Checking {feedSelectorCount} product selector
              {feedSelectorCount === 1 ? "" : "s"} from the feed...
            </p>
          )}

          {selectorCheckStatus === "ok" && (
            <p className="success-message">
              {foundOwner
                ? `Found ${foundOwner.advertiserName} (${foundOwner.agencyName}). `
                : ""}
              {feedSelectorCount === 1
                ? "The product selector is"
                : `All ${feedSelectorCount} product selectors are`}{" "}
              available for {advertiserLabel}.
            </p>
          )}

          {selectorCheckStatus === "unavailable" && (
            <p className="error-message">{unavailableSelectorsText}</p>
          )}

          {selectorCheckStatus === "partial" && (
            <p className="warning-message">
              {foundOwner
                ? `Found ${foundOwner.advertiserName} (${foundOwner.agencyName}). `
                : ""}
              {partialSelectorsText}
            </p>
          )}

          {loadingCollectionFields && (
            <p className="status-message">Loading product fields...</p>
          )}

          {apiError && <p className="error-message">{apiError}</p>}

          {needsManualSetup && (
            <div className="feed-mapping-actions align-start">
              <button
                className="secondary-button"
                onClick={() => {
                  setApiError(null);

                  if (!isAuthenticated) {
                    vscode.postMessage({
                      type: "connectToCreativeOptimizations",
                    });
                    return;
                  }

                  setImportModalMode("collectionFields");
                  setShowImportModal(true);
                }}
              >
                {isAuthenticated
                  ? "Select advertiser"
                  : "Connect to Creative Optimizations"}
              </button>
            </div>
          )}

          <div className="feed-mapping-actions collection-mapping-actions">
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

                  <span className="collection-field-type">Field type</span>

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
                            item.productField.id === mapping.productField.id
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
                disabled={
                  !hasSelectedCollectionFields ||
                  selectorCheckStatus === "unavailable"
                }
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

                  setProducts({});
                  productRequestsLoaded.current.clear();
                  saveFeedMapping();
                  buildFeedVariants();

                  setIsMappingCollection(false);
                  setIsMappingFeed(false);
                  setIsMappingFeedPlaceholders(false);
                  setIsMappingPlaceholders(false);

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
                  selectedVariantIndex === placeholderVariants.length - 1
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
                      <option
                        key={dimension}
                        value={dimension}
                        disabled={missingDimensions.includes(dimension)}
                      >
                        {getDimensionLabel(dimension)}
                        {missingDimensions.includes(dimension)
                          ? " (not in feed)"
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

            {missingDimensions.length > 0 && (
              <p className="warning-message">
                {missingDimensions.join(", ")}{" "}
                {missingDimensions.length === 1 ? "is" : "are"} selected but not
                available in the feed
                {dimensionType === "responsive" ? " and disabled" : ""}.
              </p>
            )}

            <div className="placeholder-list">
              <div className="placeholder-item identifier-item">
                <div className="placeholder-name">Identifier</div>

                <div className="placeholder-value">
                  {placeholderVariants[selectedVariantIndex].contentId}
                </div>
              </div>

              {selectedDimension?.placeholders.map((placeholder) => (
                <div className="placeholder-item" key={placeholder.name}>
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
              <span>{selectedDimension?.placeholders.length ?? 0} fields</span>
            </div>
          </div>
        )}

      {showCollectionSection && (
        <div className="collection-fields-section">
          <div className="feed-mapping-header">
            <strong>Collection</strong>
          </div>

          <div className="feed-mapping-fields">
            <div className="feed-mapping-field">
              <label>Collection name</label>

              <input
                value={collectionMapping.collection}
                onChange={(event) => {
                  const value = event.target.value;

                  setCollectionMapping((current) =>
                    current
                      ? {
                          ...current,
                          collection: value,
                        }
                      : current,
                  );
                }}
              />
            </div>

            <div className="feed-mapping-field">
              <label>Intent</label>

              <input
                value={collectionMapping.intent}
                onChange={(event) => {
                  const value = event.target.value;

                  setCollectionMapping((current) =>
                    current
                      ? {
                          ...current,
                          intent: value,
                        }
                      : current,
                  );
                }}
              />
            </div>

            <div className="feed-mapping-field">
              <label>Required</label>

              <input
                type="number"
                min="1"
                max="10"
                value={collectionMapping.required}
                onChange={(event) => {
                  setCollectionMapping((current) =>
                    current
                      ? {
                          ...current,
                          required: event.target.value,
                        }
                      : current,
                  );
                }}
              />
            </div>
          </div>

          <div className="feed-mapping-fields">
            <div className="feed-mapping-field">
              <label>Selector ID</label>

              <div className="placeholder-value">
                {selectedProductSelectorId || "—"}
              </div>
            </div>
          </div>

          {selectedProducts.length > 0 ? (
            <>
              <div className="feed-mapping-header">
                <strong>Products</strong>
              </div>

              <div className="variant-navigation">
                <button
                  className="variant-arrow"
                  disabled={selectedProductIndex === 0}
                  onClick={() => {
                    setSelectedProductIndex((index) => index - 1);
                  }}
                >
                  ←
                </button>

                <span>
                  Product {selectedProductIndex + 1} of{" "}
                  {selectedProducts.length}
                </span>

                <button
                  className="variant-arrow"
                  disabled={
                    selectedProductIndex === selectedProducts.length - 1
                  }
                  onClick={() => {
                    setSelectedProductIndex((index) => index + 1);
                  }}
                >
                  →
                </button>
              </div>
            </>
          ) : (
            <div className="feed-mapping-actions align-start">
              <p className="error-message">{sectionErrorText}</p>

              {!selectedSelectorUnavailable && (
                <button
                  className="secondary-button"
                  onClick={reimportCollectionFields}
                >
                  Import product fields from CO
                </button>
              )}
            </div>
          )}

          {selectedProducts.length > 0 && (
            <>
              <div className="collection-field-list">
                <div className="collection-field-list-header">
                  <span>Placeholder</span>
                  <span>Content</span>
                </div>

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
                      <div className="placeholder-name">
                        <span className="placeholder-name-text">
                          {field.placeholder}

                          <span className="placeholder-type">
                            {PLACEHOLDER_TYPE_ICONS[field.placeholderType]}
                          </span>
                        </span>
                      </div>

                      <div className="placeholder-value">
                        {String(value) || "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="collection-field-count">
                <span>{collectionMapping.fields.length} fields</span>
              </div>
            </>
          )}
        </div>
      )}

      {productsError && !showCollectionSection && (
        <p className="error-message">{productsErrorText}</p>
      )}

      {loadingProducts && (
        <p className="loading-message">Loading products...</p>
      )}
    </section>
  );
}
