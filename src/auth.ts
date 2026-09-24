import * as vscode from "vscode";

const API_URL = "https://api.lemonpi.io";
const AUTH_URL = `${API_URL}/auth`;

const AUTH_TOKEN_KEY = "lemonpi.authToken";
const REFRESH_TOKEN_KEY = "lemonpi.refreshToken";

type DeviceAuthResponse = {
  "device-code": string;
  "verification-uri-complete": string;
  "expires-in": number;
  interval: number;
};

type DeviceTokenResponse = {
  "access-token"?: string;
  error?: string;
};

type UserTokenResponse = {
  "auth-token": string;
  "refresh-token": string;
};

export class LemonPiAuth {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async authenticate(): Promise<void> {
    console.log("Starting LemonPi SSO authentication...");

    const deviceAuth = await this.request<DeviceAuthResponse>(
      `${AUTH_URL}/sso/device-auth`,
      {
        method: "POST",
      },
    );

    await vscode.env.openExternal(
      vscode.Uri.parse(deviceAuth["verification-uri-complete"]),
    );

    const accessToken = await this.pollForDeviceToken(
      deviceAuth["device-code"],
      deviceAuth["expires-in"],
      deviceAuth.interval,
    );

    const userToken = await this.request<UserTokenResponse>(
      `${AUTH_URL}/sso/user-token`,
      {
        method: "POST",
        body: JSON.stringify({
          "sso-token": accessToken,
        }),
      },
    );

    await this.secrets.store(AUTH_TOKEN_KEY, userToken["auth-token"]);
    await this.secrets.store(REFRESH_TOKEN_KEY, userToken["refresh-token"]);

    console.log("LemonPi authentication successful.");
  }

  async getAuthToken(): Promise<string | undefined> {
    return this.secrets.get(AUTH_TOKEN_KEY);
  }

  async getRefreshToken(): Promise<string | undefined> {
    return this.secrets.get(REFRESH_TOKEN_KEY);
  }
  async switchAgency(agencyId: number): Promise<void> {
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error("Not authenticated with Creative Optimizations.");
    }

    const result = await this.request<UserTokenResponse>(
      `${AUTH_URL}/switch-agency`,
      {
        method: "POST",
        headers: {
          Authorization: `lemonpi ${token}`,
        },
        body: JSON.stringify({
          "agency-id": agencyId,
        }),
      },
    );

    await this.secrets.store(AUTH_TOKEN_KEY, result["auth-token"]);

    await this.secrets.store(REFRESH_TOKEN_KEY, result["refresh-token"]);
  }
  async logout(): Promise<void> {
    await this.secrets.delete(AUTH_TOKEN_KEY);
    await this.secrets.delete(REFRESH_TOKEN_KEY);
  }

  private async pollForDeviceToken(
    deviceCode: string,
    expiresIn: number,
    interval: number,
  ): Promise<string> {
    const timeout = expiresIn * 1000;
    const startTime = Date.now();

    let pollInterval = interval * 1000;

    while (Date.now() - startTime <= timeout) {
      await this.sleep(pollInterval);

      const response = await this.request<DeviceTokenResponse>(
        `${AUTH_URL}/sso/device-token`,
        {
          method: "POST",
          body: JSON.stringify({
            "device-code": deviceCode,
          }),
        },
      );

      if (response["access-token"]) {
        return response["access-token"];
      }

      if (response.error === "slow_down") {
        pollInterval += 500;
        continue;
      }

      if (response.error === "authorization_pending") {
        continue;
      }

      throw new Error(
        `LemonPi authentication failed: ${response.error ?? "unknown error"}`,
      );
    }

    throw new Error("LemonPi authentication timed out.");
  }

  private async request<T>(
    url: string,
    options: {
      method: string;
      body?: string;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const response = await fetch(url, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
      body: options.body,
    });

    if (!response.ok) {
      const text = await response.text();

      throw new Error(`LemonPi request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
