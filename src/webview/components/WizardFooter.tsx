import React from "react";
import type { ParsedFeed } from "../../feed";

type Step = 1 | 2 | 3 | 4 | 5;
type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
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

type COFont = {
  "font-family": string;
  "css-base-url": string;
  variants: {
    variant: string;
    "font-weight": string | number;
    "font-style"?: string;
  }[];
};

type SelectedFont = {
  id: number;
  family: string;
  variant: string;
  fontUrl: string;
};
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

type WizardFooterProps = {
  step: Step;
  setStep: React.Dispatch<React.SetStateAction<Step>>;
  settingsMode: boolean;
  parsedFeed: ParsedFeed | null;
  isFeedMappingFinished: boolean;
  vscode: VsCodeApi;
  frameCount: number;
  autoFillPlaceholderContent: boolean;
  autoScaleFonts: boolean;
  name: string;
  selectedFolder: string | null;
  userName: string | null;
  dimensionType: "single" | "responsive";
  selectedDimensions: string[];

  selectedFonts: SelectedFont[];
  coFonts: COFont[];

  placeholderVariants: PlaceholderVariant[];
  products: Record<string, { name: string; products: unknown }>;
  collectionMapping: CollectionMapping | null;

  agencies: Agency[];
  advertisers: Advertiser[];
  adsets: AdSet[];

  selectedAgency: number | null;
  selectedAdvertiser: number | null;
  selectedAdsetId: number | null;

  settingsSection: 1 | 2 | 3 | 4 | 5;
  hasSettingsChanges: boolean;
  hasIncompleteFont: boolean;
  getCurrentSettings: () => unknown;
};

export default function WizardFooter({
  vscode,
  userName,
  dimensionType,
  selectedFonts,
  coFonts,
  placeholderVariants,
  products,
  collectionMapping,
  selectedAgency,
  agencies,
  selectedAdvertiser,
  advertisers,
  adsets,
  frameCount,
  autoFillPlaceholderContent,
  autoScaleFonts,
  step,
  setStep,
  settingsMode,
  name,
  selectedFolder,
  selectedDimensions,
  selectedAdsetId,
  parsedFeed,
  isFeedMappingFinished,
  hasSettingsChanges,
  settingsSection,
  hasIncompleteFont,
  getCurrentSettings,
}: WizardFooterProps) {
  if (settingsMode) {
    return (
      <footer className="footer">
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
      </footer>
    );
  }

  return (
    <footer className="footer">
      <div className="footer-buttons">
        {step > 1 && (
          <button
            className="secondary-button"
            onClick={() => {
              setStep((step - 1) as Step);
            }}
          >
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
                (!!parsedFeed && !isFeedMappingFinished)))
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
              frames: frameCount,
              autoFillPlaceholderContent,
              autoScaleFonts,
              selectedAgency: selectedAgency
                ? (agencies.find((agency) => agency.id === selectedAgency) ??
                  null)
                : null,
              selectedAdvertiser: selectedAdvertiser
                ? (advertisers.find(
                    (advertiser) => advertiser.id === selectedAdvertiser,
                  ) ?? null)
                : null,
              selectedAdset: selectedAdsetId
                ? (adsets.find((adset) => adset.id === selectedAdsetId) ?? null)
                : null,
            });
          }}
        >
          {step === 5 ? "Create boilerplate" : "Continue →"}
        </button>
      </div>
    </footer>
  );
}
