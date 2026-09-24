import { LemonPiAuth } from "./auth";
import * as fs from "fs";

const API_URL = "https://api.lemonpi.io";
const MANAGE_API_URL = `${API_URL}/api/v0`;
const CONTENT_BUILD_API_URL = `${API_URL}/content-build/v1`;
const FONTS_API_URL = `${API_URL}/fonts/advertiser`;
const FOLDERS_API_URL = `${API_URL}/folders`;

type Placeholder = {
  name: string;
  type: string;
  value: unknown;
};
type Collection = {
  name: string;
  intent: string;
  itemsRequired: number;
  placeholders: Record<
    string,
    {
      type: string;
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
type PlaceholderImportResult = {
  variants: PlaceholderVariant[];
  collections: Collection[];
};
export type ProductQueryFilter = {
  field?: string;
  kind: string;
  operator: string;
  value?: string | number;
  meta?: string;
};

export type ProductQuerySort = {
  metric: string;
  granularity: string;
  kind: string;
  window: number;
  order: "asc" | "desc";
};

export type ProductSelector = {
  id: string;
  name: string;
  "advertiser-id": number;
  valid: boolean;
  query: {
    version: number;
    filter: ProductQueryFilter[];
    sort?: ProductQuerySort[];
    "required-fields"?: string[];
  };
};
export type COFolder = {
  "asset-tree/id": number;
  "asset-tree/name": string;
  "asset-tree/parent-id": number;
  "asset-tree/advertiser-id": number;
  "asset-tree/folder-type": string;
  children?: COFolder[];
};

type COFoldersResponse = {
  children?: COFolder[];
};
export type COTemplate = {
  id: number;
  name: string;
  "folder-id": number;
  folderId: number;
  "advertiser-id": number;
  width?: number;
  height?: number;
  revisions?: unknown[];
};
export type ProductSearchResponse = {
  [key: string]: unknown;
};
export type COFont = {
  "font-family": string;
  "css-base-url": string;
  variants: {
    "font-weight": number;
    "font-style"?: string;
    variant: string;
  }[];
};
export type Agency = {
  id: number;
  name: string;
};

export type Advertiser = {
  id: number;
  name: string;
  agencyId: number;
  active: boolean;
  archived: boolean;
};

export type AdSet = {
  id: number;
  name: string;
  channel: string;
  archived: boolean;
};
export type CollectionField = {
  name: string;
  id: number;
  slot: number;
  type: string;
  sortable: boolean;
  "empty-string-is-undefined"?: boolean;
};
export class LemonPiApi {
  constructor(private readonly auth: LemonPiAuth) {}
  async getFonts(advertiserId: number): Promise<COFont[]> {
    const token = await this.auth.getAuthToken();

    console.log("[CO FONTS] advertiserId:", advertiserId);
    console.log("[CO FONTS] has token:", !!token);

    if (!token) {
      throw new Error("Not authenticated with Creative Optimizations.");
    }

    const url = `${FONTS_API_URL}/${advertiserId}/font-families`;

    console.log("[CO FONTS] request URL:", url);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `lemonpi ${token}`,
      },
    });

    console.log("[CO FONTS] response status:", response.status);
    console.log("[CO FONTS] response ok:", response.ok);

    const text = await response.text();

    console.log("[CO FONTS] raw response:", text);

    if (!response.ok) {
      throw new Error(
        `Creative Optimizations API error (${response.status}): ${text}`,
      );
    }

    const fonts = JSON.parse(text) as COFont[];

    console.log("[CO FONTS] parsed response:", fonts);
    console.log("[CO FONTS] font count:", fonts.length);

    return fonts;
  }
  async getFolders(
    agencyId: number,
    advertiserId: number,
    folderType: "templates" | "assets" | "logos",
  ): Promise<COFolder[]> {
    await this.switchAgency(agencyId);

    const token = await this.auth.getAuthToken();

    if (!token) {
      throw new Error("Not authenticated with Creative Optimizations.");
    }

    const url = `${FOLDERS_API_URL}/advertiser/${advertiserId}/parent/1`;

    console.log("[CO FOLDERS] agencyId:", agencyId);
    console.log("[CO FOLDERS] advertiserId:", advertiserId);
    console.log("[CO FOLDERS] folderType:", folderType);
    console.log("[CO FOLDERS] request URL:", url);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `lemonpi ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Creative Optimizations folders API error (${response.status}): ${text}`,
      );
    }

    const foldersData = (await response.json()) as COFoldersResponse;

    const rootFolders =
      foldersData.children?.filter(
        (folder) => folder["asset-tree/folder-type"] === folderType,
      ) ?? [];

    const folders = rootFolders.flatMap((folder) => folder.children ?? []);

    console.log("[CO FOLDERS] folders:", folders);

    return folders;
  }
  async getRootFolder(
    agencyId: number,
    advertiserId: number,
    folderType: "templates" | "assets" | "logos",
  ): Promise<COFolder | null> {
    await this.switchAgency(agencyId);

    const token = await this.auth.getAuthToken();

    if (!token) {
      throw new Error("Not authenticated with Creative Optimizations.");
    }

    const url = `${FOLDERS_API_URL}/advertiser/${advertiserId}/parent/1`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `lemonpi ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Creative Optimizations folders API error (${response.status}): ${text}`,
      );
    }

    const foldersData = (await response.json()) as COFoldersResponse;

    return (
      foldersData.children?.find(
        (folder) => folder["asset-tree/folder-type"] === folderType,
      ) ?? null
    );
  }
  async getTemplates(
    agencyId: number,
    advertiserId: number,
    folderId?: number,
  ): Promise<COTemplate[]> {
    await this.switchAgency(agencyId);

    const params = new URLSearchParams({
      "advertiser-id": String(advertiserId),
      embed: '["revisions"]',
    });

    if (folderId !== undefined) {
      params.set("folder-id", String(folderId));
    }

    const templates = await this.request<COTemplate[]>(
      `/templates?${params.toString()}`,
    );

    if (folderId === undefined) {
      return templates;
    }

    return templates.filter(
      (template) => Number(template["folder-id"]) === folderId,
    );
  }
  async uploadTemplate({
    agencyId,
    advertiserId,
    folderId,
    templateName,
    zipPath,
    templateId,
  }: {
    agencyId: number;
    advertiserId: number;
    folderId: number;
    templateName: string;
    zipPath: string;
    templateId?: number;
  }): Promise<unknown> {
    await this.switchAgency(agencyId);

    const token = await this.auth.getAuthToken();

    if (!token) {
      throw new Error("Not authenticated with Creative Optimizations.");
    }

    if (!fs.existsSync(zipPath)) {
      throw new Error(`Template ZIP not found: ${zipPath}`);
    }

    const endpoint = templateId
      ? `/templates/${templateId}/revisions`
      : "/templates";

    const url = `${MANAGE_API_URL}${endpoint}`;

    console.log("[CO UPLOAD] URL:", url);
    console.log("[CO UPLOAD] templateName:", templateName);
    console.log("[CO UPLOAD] advertiserId:", advertiserId);
    console.log("[CO UPLOAD] folderId:", folderId);
    console.log("[CO UPLOAD] templateId:", templateId ?? null);
    console.log("[CO UPLOAD] zipPath:", zipPath);

    const form = new FormData();

    form.append(
      "json",
      JSON.stringify({
        name: templateName,
        labels: [],
        advertiserId,
        folderId,
      }),
    );

    const zipBuffer = fs.readFileSync(zipPath);

    form.append(
      "template",
      new Blob([zipBuffer], {
        type: "application/zip",
      }),
      `${templateName}.zip`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `lemonpi ${token}`,
      },
      body: form,
    });

    console.log("[CO UPLOAD] response status:", response.status);
    console.log("[CO UPLOAD] response ok:", response.ok);

    const text = await response.text();

    console.log("[CO UPLOAD] response:", text);

    if (!response.ok) {
      throw new Error(
        `Creative Optimizations upload API error (${response.status}): ${text}`,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  private async productStoreRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.auth.getAuthToken();

    if (!token) {
      throw new Error("Not authenticated with Creative Optimizations.");
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `lemonpi ${token}`,
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Creative Optimizations Product API error (${response.status}): ${text}`,
      );
    }

    return (await response.json()) as T;
  }
  async getProductSelector(
    advertiserId: number,
    selectorId: string,
  ): Promise<ProductSelector> {
    return this.productStoreRequest<ProductSelector>(
      `/product-stores/${advertiserId}/selectors/${encodeURIComponent(selectorId)}`,
    );
  }
  async searchProductsBySelector(
    advertiserId: number,
    selectorId: string,
    limit = 10,
    offset = 0,
  ): Promise<ProductSearchResponse> {
    const selector = await this.getProductSelector(advertiserId, selectorId);

    if (!selector.valid) {
      throw new Error(`Product selector "${selectorId}" is not valid.`);
    }

    const query = selector.query;

    return this.productStoreRequest<ProductSearchResponse>(
      `/product-stores/${advertiserId}/products/search`,
      {
        method: "POST",
        body: JSON.stringify({
          version: query.version,
          limit,
          offset,
          filter: query.filter,
          ...(query.sort ? { sort: query.sort } : {}),
        }),
      },
    );
  }
  async getCollectionFields(
    agencyId: number,
    advertiserId: number,
  ): Promise<CollectionField[]> {
    await this.switchAgency(agencyId);
    const token = await this.auth.getAuthToken();

    console.log("[CO COLLECTION] advertiserId:", advertiserId);
    console.log("[CO COLLECTION] has token:", !!token);

    if (!token) {
      throw new Error("Not authenticated with Creative Optimizations.");
    }

    const url = `${API_URL}/product-stores/${advertiserId}`;

    console.log("[CO COLLECTION] request URL:", url);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `lemonpi ${token}`,
      },
    });

    console.log("[CO COLLECTION] response status:", response.status);
    console.log("[CO COLLECTION] response ok:", response.ok);

    const text = await response.text();

    console.log("[CO COLLECTION] raw response:", text);

    if (!response.ok) {
      throw new Error(
        `Creative Optimizations API error (${response.status}): ${text}`,
      );
    }

    const data = JSON.parse(text);

    console.log("[CO COLLECTION] parsed response:", data);
    console.log("[CO COLLECTION] fields:", data?.fields);

    return data.fields as CollectionField[];
  }
  async getMe() {
    return this.request<{
      agencyId: number;
      name: string;
      email: string;
      roles: {
        roleName: string;
        agencyName: string;
        agencyId: number;
        roleId: number;
      }[];
    }>("/useraccounts/me");
  }

  async getPlaceholders(
    advertiserId: number,
    adsetId: number,
  ): Promise<PlaceholderImportResult> {
    const endpoint =
      `/advertisers/${advertiserId}/adsets/${adsetId}` +
      `/ad-variants-by-content-id?limit=100&sort=%2Bcontent-id`;

    const token = await this.auth.getAuthToken();

    if (!token) {
      throw new Error("Not authenticated with Creative Optimizations.");
    }

    const fullUrl = `${CONTENT_BUILD_API_URL}${endpoint}`;

    const body = {
      "muix-data-grid": {
        "link-operator": "and",
        filters: [
          {
            operator: "is-any-of",
            column: "ad-variant-status",
            value: [
              "approved",
              "error",
              "queued",
              "draft",
              "internal-review",
              "render-failed",
              "unknown",
              "rendering",
              "rejected",
              "canceled",
            ],
          },
        ],
      },
    };

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `lemonpi ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Creative Optimizations API error (${response.status}): ${text}`,
      );
    }

    const result = (await response.json()) as {
      data: Array<{
        data: {
          "content-id": string;
          "ad-variants": Array<{
            "variant-id"?: number | string;
            "content-id"?: string;
            dimensions?: {
              width?: number;
              height?: number;
            };
            components?: {
              "urn:lemonpi:artefact:display:content+template"?: {
                value?: {
                  content?: Record<
                    string,
                    {
                      type?: string;
                      value?: unknown;
                    }
                  >;
                  "dynamic-content-config"?: Record<
                    string,
                    {
                      config?: {
                        "product-selector-id"?: string;
                        placeholder?: {
                          name?: string;
                          type?: string;
                          "child-mapping"?: Record<
                            string,
                            {
                              name?: string;
                              type?: string;
                            }
                          >;
                          "items-required"?: number;
                        };
                      };
                      "source-type"?: string;
                    }
                  >;
                };
              };
            };
          }>;
        };
      }>;
    };
    const collections = new Map<string, Collection>();
    const grouped = new Map<
      string,
      {
        contentId: string;
        variantId: number | string | null;
        dimensions: Map<
          string,
          {
            templateDimension: string;
            width: number;
            height: number;
            productSelectorId?: string;
            products?: {
              type: "collection";
              value: Record<string, unknown>[];
            };
            placeholders: Map<string, Placeholder>;
          }
        >;
      }
    >();

    for (const contentGroup of result.data) {
      for (const variant of contentGroup.data["ad-variants"]) {
        const contentId =
          variant["content-id"] ?? contentGroup.data["content-id"];

        if (!contentId) {
          continue;
        }
        const width = Number(variant["dimensions"]?.width ?? 0);

        const height = Number(variant["dimensions"]?.height ?? 0);

        const templateDimension =
          width && height ? `${width}x${height}` : "unknown";

        const content =
          variant.components?.["urn:lemonpi:artefact:display:content+template"]
            ?.value?.content;
        const dynamicContentConfig =
          variant.components?.["urn:lemonpi:artefact:display:content+template"]
            ?.value?.["dynamic-content-config"];
        if (!content) {
          continue;
        }

        let group = grouped.get(contentId);

        if (!group) {
          group = {
            contentId,
            variantId: variant["variant-id"] ?? null,
            dimensions: new Map(),
          };

          grouped.set(contentId, group);
        }

        let dimension = group.dimensions.get(templateDimension);

        if (!dimension) {
          dimension = {
            templateDimension,
            width,
            height,
            placeholders: new Map<string, Placeholder>(),
          };

          group.dimensions.set(templateDimension, dimension);
        }

        for (const [name, placeholder] of Object.entries(content)) {
          if (typeof placeholder !== "object" || placeholder === null) {
            continue;
          }

          if (placeholder.type === "collection") {
            const collectionConfig = dynamicContentConfig?.[name]?.config;
            const collectionPlaceholder = collectionConfig?.placeholder;

            const productSelectorId = collectionConfig?.["product-selector-id"];

            if (productSelectorId) {
              dimension.productSelectorId = productSelectorId;
            }

            if (collectionPlaceholder) {
              const childMapping = collectionPlaceholder["child-mapping"] ?? {};

              const collectionFields = Object.fromEntries(
                Object.values(childMapping)
                  .filter((field) => field.name && field.type)
                  .map((field) => [
                    field.name!,
                    {
                      type: field.type!,
                    },
                  ]),
              );

              collections.set(name, {
                name,
                intent:
                  dynamicContentConfig?.[name]?.["source-type"] === "products"
                    ? "product"
                    : "",
                itemsRequired: collectionPlaceholder["items-required"] ?? 1,
                placeholders: collectionFields,
              });
            }

            // Preserve the actual collection content as a placeholder.
            dimension.placeholders.set(name, {
              name,
              type: "collection",
              value: Array.isArray(placeholder.value) ? placeholder.value : [],
            });

            continue;
          }

          dimension.placeholders.set(name, {
            name,
            type: String(placeholder.type ?? "text"),
            value: String(placeholder.value ?? ""),
          });
        }
      }
    }

    return {
      variants: Array.from(grouped.values()).map((group) => ({
        contentId: group.contentId,
        variantId: group.variantId,
        dimensions: Array.from(group.dimensions.values()).map((dimension) => ({
          templateDimension: dimension.templateDimension,
          width: dimension.width,
          height: dimension.height,
          productSelectorId: dimension.productSelectorId,
          placeholders: Array.from(dimension.placeholders.values()),
        })),
      })),
      collections: Array.from(collections.values()),
    };
  }

  async getAdvertisers(agencyId: number): Promise<Advertiser[]> {
    await this.switchAgency(agencyId);

    return this.request<Advertiser[]>("/advertisers");
  }

  async getAdSets(agencyId: number, advertiserId: number): Promise<AdSet[]> {
    await this.switchAgency(agencyId);

    return this.getAdSetsForAdvertiser(agencyId, advertiserId);
  }

  private async getAdSetsForAdvertiser(
    agencyId: number,
    advertiserId: number,
  ): Promise<AdSet[]> {
    const filters = encodeURIComponent(
      JSON.stringify({
        agencyId,
        advertiserId,
      }),
    );

    const endpoint = `/adsets-2?filters=${filters}`;

    console.log("[ADSETS] ===============================");
    console.log("[ADSETS] agencyId:", agencyId);
    console.log("[ADSETS] advertiserId:", advertiserId);
    console.log("[ADSETS] endpoint:", endpoint);

    try {
      const result = await this.request<AdSet[]>(endpoint);

      console.log("[ADSETS] Success:", advertiserId, "count:", result.length);

      return result;
    } catch (error) {
      console.error("[ADSETS] FAILED:", advertiserId, error);

      throw error;
    }
  }

  private async switchAgency(agencyId: number): Promise<void> {
    await this.auth.switchAgency(agencyId);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.auth.getAuthToken();

    if (!token) {
      throw new Error("Not authenticated with Creative Optimizations.");
    }

    const response = await fetch(`${MANAGE_API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `lemonpi ${token}`,
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Creative Optimizations API error (${response.status}): ${text}`,
      );
    }

    return (await response.json()) as T;
  }
}
