import React from "react";
import AdvertiserSelectionModal from "./AdvertiserSelectionModal";

type VsCodeApi = {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
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

type SelectedFont = {
  id: number;
  family: string;
  variant: string;
  fontUrl: string;
};

type Agency = {
  id: number;
  name: string;
};

type Advertiser = {
  id: number;
  name: string;
};

type FontsSectionProps = {
  vscode: VsCodeApi;

  coFonts: COFont[];
  selectedFonts: SelectedFont[];
  setSelectedFonts: React.Dispatch<React.SetStateAction<SelectedFont[]>>;

  showFontImportModal: boolean;
  setShowFontImportModal: React.Dispatch<React.SetStateAction<boolean>>;

  loadingFonts: boolean;
  setLoadingFonts: React.Dispatch<React.SetStateAction<boolean>>;

  isAuthenticated: boolean;
  userEmail: string | null;

  agencies: Agency[];
  advertisers: Advertiser[];

  selectedAgency: number | null;
  setSelectedAgency: React.Dispatch<React.SetStateAction<number | null>>;

  selectedAdvertiser: number | null;
  setSelectedAdvertiser: React.Dispatch<React.SetStateAction<number | null>>;
  selectedAdvertiserName: string | null;
  loadingAgencies: boolean;
  setLoadingAgencies: React.Dispatch<React.SetStateAction<boolean>>;

  apiError: string | null;
  setApiError: React.Dispatch<React.SetStateAction<string | null>>;
};

export default function FontsSection({
  vscode,
  coFonts,
  selectedFonts,
  setSelectedFonts,
  showFontImportModal,
  setShowFontImportModal,
  loadingFonts,
  setLoadingFonts,
  isAuthenticated,
  userEmail,
  agencies,
  advertisers,
  selectedAgency,
  setSelectedAgency,
  selectedAdvertiser,
  selectedAdvertiserName,
  setSelectedAdvertiser,
  loadingAgencies,
  setLoadingAgencies,
  apiError,
  setApiError,
}: FontsSectionProps) {
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

  const fontKey = (family: string, variant: string) => `${family}|${variant}`;

  const selectedKeys = new Set(
    selectedFonts.map((font) => fontKey(font.family, font.variant)),
  );

  const remainingFontCount = coFonts.reduce(
    (count, font) =>
      count +
      font.variants.filter(
        (variant) =>
          !selectedKeys.has(fontKey(font["font-family"], variant.variant)),
      ).length,
    0,
  );

  const isVariantTaken = (id: number, family: string, variant: string) =>
    selectedFonts.some(
      (font) =>
        font.id !== id && font.family === family && font.variant === variant,
    );

  const addAllFonts = () => {
    setSelectedFonts((current) => {
      // Empty rows are placeholders, so they make way for the real fonts.
      const kept = current.filter((font) => font.family);
      const keys = new Set(
        kept.map((font) => fontKey(font.family, font.variant)),
      );

      const added = coFonts.flatMap((font) =>
        font.variants
          .filter(
            (variant) =>
              !keys.has(fontKey(font["font-family"], variant.variant)),
          )
          .map((variant) => ({
            id: Date.now() + Math.random(),
            family: font["font-family"],
            variant: variant.variant,
            fontUrl: font["css-base-url"],
          })),
      );

      return [...kept, ...added];
    });
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

  return (
    <section>
      <h1>Fonts</h1>
      <p className="description">
        Select the fonts that should be included in the creative.
      </p>
      {coFonts.length > 0 ? (
        <div className="fonts-loaded">
          {" "}
          <div className="fonts-loaded-info">
            {" "}
            <div className="fonts-loaded-source">
              {" "}
              <strong>
                {" "}
                Fonts loaded from{" "}
                {selectedAdvertiserName || "Creative Optimizations"}{" "}
              </strong>{" "}
              <button
                type="button"
                className="font-reimport-button"
                onClick={() => {
                  setApiError(null);
                  setShowFontImportModal(true);
                }}
              >
                {" "}
                <span aria-hidden="true">↻</span> Re-import fonts{" "}
              </button>{" "}
            </div>{" "}
            <div className="fonts-loaded-count">
              <p>
                {" "}
                {coFonts.length} {coFonts.length === 1 ? "font" : "fonts"}{" "}
                available{" "}
              </p>
              <button
                type="button"
                className="font-reimport-button"
                disabled={remainingFontCount === 0}
                onClick={addAllFonts}
              >
                + Add all fonts
              </button>
            </div>{" "}
          </div>{" "}
        </div>
      ) : (
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
      )}

      <div className="font-list">
        {selectedFonts.length > 0 && (
          <>
            {selectedFonts.map((selectedFont, index) => {
              const font = coFonts.find(
                (font) => font["font-family"] === selectedFont.family,
              );

              return (
                <div className="font-row" key={selectedFont.id}>
                  <div className="font-row-number">{index + 1}</div>

                  <div className="font-row-fields">
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
                                    selectedCOFont?.["css-base-url"] ?? "",
                                }
                              : font,
                          ),
                        );
                      }}
                      className="select-input"
                    >
                      <option value="">Select a font</option>

                      {coFonts.map((font) => (
                        <option
                          key={font["font-family"]}
                          value={font["font-family"]}
                        >
                          {font["font-family"]}
                        </option>
                      ))}
                    </select>

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
                      <option value="">
                        {font ? "Select a weight" : "Select a font first"}
                      </option>

                      {font?.variants.map((variant) => {
                        const taken = isVariantTaken(
                          selectedFont.id,
                          selectedFont.family,
                          variant.variant,
                        );

                        return (
                          <option
                            key={variant.variant}
                            value={variant.variant}
                            disabled={taken}
                          >
                            {variant["font-weight"]}
                            {variant["font-style"]
                              ? ` ${variant["font-style"]}`
                              : ""}
                            {taken ? " (already added)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="font-remove-button"
                    onClick={() => removeFont(selectedFont.id)}
                    aria-label="Remove font"
                  >
                    ×
                  </button>
                </div>
              );
            })}

            <button type="button" className="add-font-button" onClick={addFont}>
              + Add font
            </button>
          </>
        )}
      </div>

      <AdvertiserSelectionModal
        vscode={vscode}
        isOpen={showFontImportModal}
        onClose={() => setShowFontImportModal(false)}
        title="Import fonts"
        description="Connect to Creative Optimizations and select the advertiser to import fonts from."
        confirmLabel={loadingFonts ? "Loading fonts..." : "Import fonts"}
        confirmDisabled={!selectedAdvertiser || loadingFonts}
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
          setSelectedAdvertiser(null);
        }}
        onAdvertiserChange={(advertiserId) => {
          setSelectedAdvertiser(advertiserId);
        }}
        onConfirm={() => {
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
      />
    </section>
  );
}
