import React, { useEffect, useState } from "react";

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

type AdvertiserSelectionModalProps = {
  vscode: VsCodeApi;

  isOpen: boolean;
  onClose: () => void;

  title: string;
  description: string;
  confirmLabel: string;
  confirmDisabled?: boolean;

  isAuthenticated: boolean;
  userEmail: string | null;

  agencies: Agency[];
  advertisers: Advertiser[];

  selectedAgency: number | null;
  selectedAdvertiser: number | null;

  loadingAgencies: boolean;
  setLoadingAgencies: React.Dispatch<React.SetStateAction<boolean>>;

  apiError: string | null;
  setApiError: React.Dispatch<React.SetStateAction<string | null>>;

  onAgencyChange: (agencyId: number) => void;
  onAdvertiserChange: (advertiserId: number) => void;

  onConfirm: () => void;
};

export default function AdvertiserSelectionModal({
  vscode,
  isOpen,
  onClose,
  title,
  description,
  confirmLabel,
  confirmDisabled = false,
  isAuthenticated,
  userEmail,
  agencies,
  advertisers,
  selectedAgency,
  selectedAdvertiser,
  loadingAgencies,
  setLoadingAgencies,
  apiError,
  setApiError,
  onAgencyChange,
  onAdvertiserChange,
  onConfirm,
}: AdvertiserSelectionModalProps) {
  console.log("[AGENCY MODAL] render:", {
    isOpen,
    isAuthenticated,
    userEmail,
    agenciesCount: agencies.length,
    loadingAgencies,
    apiError,
    selectedAgency,
    selectedAdvertiser,
  });
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="import-modal">
        <div className="modal-header">
          <div>
            <h2>{title}</h2>

            <p>{description}</p>
          </div>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {!isAuthenticated || !userEmail ? (
            <div className="login-section">
              <h3>Connect to Creative Optimizations</h3>

              <p>Sign in to Creative Optimizations to select an advertiser.</p>

              <button
                className="connect-button"
                onClick={() => {
                  console.log(
                    "[AGENCY MODAL] Connect to Creative Optimizations clicked",
                  );

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

                    onAgencyChange(agencyId);
                    setApiError(null);

                    vscode.postMessage({
                      type: "loadAdvertisers",
                      agencyId,
                    });
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
                    onChange={(event) => {
                      const advertiserId = Number(event.target.value);

                      onAdvertiserChange(advertiserId);
                      setApiError(null);
                    }}
                  >
                    <option value="">Select an advertiser</option>

                    {advertisers.map((advertiser) => (
                      <option key={advertiser.id} value={advertiser.id}>
                        {advertiser.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>

          <button
            className="primary-button"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
