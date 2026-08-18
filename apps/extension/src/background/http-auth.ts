import {
  AuthenticateHttpDataSchema,
  HttpAuthStateDataSchema,
  IBP_ERROR_CODES,
  type AuthenticateHttpData,
  type AuthenticateHttpParameters,
  type HttpAuthStateData,
  type HttpAuthStateParameters,
} from "@invictum/protocol";

import { ExtensionCommandError } from "./command-error.js";

interface ChallengeState {
  origin: string;
  scheme: string;
  realm: string;
  isProxy: boolean;
  detectedAt: string;
  detectedAtMs: number;
}

interface PendingAuthentication {
  tabId: number;
  origin: string;
  username: string;
  password: string;
  attempts: number;
  challengeHandled: boolean;
  scheme?: "basic";
  startedAt: number;
  resolve: (data: AuthenticateHttpData) => void;
  reject: (error: unknown) => void;
}

const urlOrigin = (rawUrl: string): string | undefined => {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return undefined;
  }
};

const challengeOrigin = (details: chrome.webRequest.OnAuthRequiredDetails): string =>
  urlOrigin(details.url) ?? `${details.challenger.host}:${details.challenger.port}`;

export class ChromeHttpAuthAdapter {
  readonly #challenges = new Map<number, ChallengeState>();
  readonly #pending = new Map<number, PendingAuthentication>();

  public constructor() {
    chrome.webRequest.onAuthRequired.addListener(
      (details, callback) => {
        const origin = challengeOrigin(details);
        this.#challenges.set(details.tabId, {
          origin,
          scheme: details.scheme.slice(0, 64),
          realm: (details.realm ?? "").slice(0, 512),
          isProxy: details.isProxy,
          detectedAt: new Date().toISOString(),
          detectedAtMs: Date.now(),
        });
        const pending = this.#pending.get(details.tabId);
        if (
          pending === undefined ||
          details.type !== "main_frame" ||
          details.isProxy ||
          details.scheme.toLowerCase() !== "basic" ||
          origin !== pending.origin
        ) {
          callback?.({});
          return undefined;
        }
        if (pending.attempts >= 1) {
          callback?.({ cancel: true });
          pending.reject(
            new ExtensionCommandError(
              IBP_ERROR_CODES.AUTHENTICATION_FAILED,
              `Basic HTTP authentication failed for tab ${details.tabId}`,
              false,
            ),
          );
          return undefined;
        }
        pending.attempts += 1;
        pending.challengeHandled = true;
        pending.scheme = "basic";
        callback?.({
          authCredentials: { username: pending.username, password: pending.password },
        });
        return undefined;
      },
      { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] },
      ["asyncBlocking"],
    );

    chrome.webRequest.onCompleted.addListener(
      (details) => {
        const pending = this.#pending.get(details.tabId);
        if (
          pending === undefined ||
          details.type !== "main_frame" ||
          details.timeStamp + 5 < pending.startedAt ||
          urlOrigin(details.url) !== pending.origin
        ) {
          return;
        }
        const recentChallenge = this.#challenges.get(details.tabId);
        const browserSatisfiedKnownChallenge =
          recentChallenge !== undefined &&
          recentChallenge.origin === pending.origin &&
          recentChallenge.scheme.toLowerCase() === "basic" &&
          !recentChallenge.isProxy &&
          Date.now() - recentChallenge.detectedAtMs <= 60_000;
        if (!pending.challengeHandled && !browserSatisfiedKnownChallenge) {
          pending.reject(
            new ExtensionCommandError(
              IBP_ERROR_CODES.AUTHENTICATION_FAILED,
              `No HTTP Basic authentication challenge was detected for tab ${details.tabId}`,
              false,
            ),
          );
          return;
        }
        pending.resolve(
          AuthenticateHttpDataSchema.parse({
            tabId: pending.tabId,
            origin: pending.origin,
            authenticated: true,
            challengeHandled: pending.challengeHandled,
            scheme: pending.scheme ?? (browserSatisfiedKnownChallenge ? "basic" : undefined),
            credentialsRetained: false,
            verificationRequired: true,
          }),
        );
      },
      { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] },
    );

    chrome.webRequest.onErrorOccurred.addListener(
      (details) => {
        const pending = this.#pending.get(details.tabId);
        if (pending === undefined || details.type !== "main_frame") return;
        pending.reject(
          new ExtensionCommandError(
            IBP_ERROR_CODES.AUTHENTICATION_FAILED,
            `HTTP authentication navigation failed for tab ${details.tabId}`,
            false,
          ),
        );
      },
      { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] },
    );
  }

  public async getState(parameters: HttpAuthStateParameters): Promise<HttpAuthStateData> {
    const challenge = this.#challenges.get(parameters.tabId);
    if (challenge === undefined || Date.now() - challenge.detectedAtMs > 60_000) {
      this.#challenges.delete(parameters.tabId);
      return HttpAuthStateDataSchema.parse({
        tabId: parameters.tabId,
        challengeDetected: false,
      });
    }
    return HttpAuthStateDataSchema.parse({
      tabId: parameters.tabId,
      challengeDetected: true,
      origin: challenge.origin,
      scheme: challenge.scheme,
      realm: challenge.realm,
      isProxy: challenge.isProxy,
      detectedAt: challenge.detectedAt,
    });
  }

  public async authenticate(parameters: AuthenticateHttpParameters): Promise<AuthenticateHttpData> {
    const permissionsGranted = await chrome.permissions.contains({
      permissions: ["tabs", "webRequest", "webRequestAuthProvider"],
      origins: ["http://*/*", "https://*/*"],
    });
    if (!permissionsGranted) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.PERMISSION_DENIED,
        "HTTP authentication requires webRequestAuthProvider and On all sites access",
        false,
      );
    }
    if (this.#pending.has(parameters.tabId)) {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.BROWSER_API_ERROR,
        `HTTP authentication is already pending for tab ${parameters.tabId}`,
        true,
      );
    }
    const tab = await chrome.tabs.get(parameters.tabId);
    let origin: string;
    try {
      const current = new URL(tab.url ?? "");
      if (current.protocol !== "http:" && current.protocol !== "https:") throw new Error();
      origin = current.origin;
    } catch {
      throw new ExtensionCommandError(
        IBP_ERROR_CODES.RESTRICTED_PAGE,
        `Basic HTTP authentication requires a normal HTTP(S) tab ${parameters.tabId}`,
        false,
      );
    }

    const result = new Promise<AuthenticateHttpData>((resolve, reject) => {
      this.#pending.set(parameters.tabId, {
        tabId: parameters.tabId,
        origin,
        username: parameters.username,
        password: parameters.password,
        attempts: 0,
        challengeHandled: false,
        startedAt: Date.now(),
        resolve,
        reject,
      });
    });
    // Attach a handler immediately because Chrome may reject authentication while reload() is pending.
    void result.catch(() => undefined);
    const timer = setTimeout(() => {
      this.#pending
        .get(parameters.tabId)
        ?.reject(
          new ExtensionCommandError(
            IBP_ERROR_CODES.TIMEOUT,
            `Basic HTTP authentication did not complete within ${parameters.timeoutMs} ms`,
            true,
          ),
        );
    }, parameters.timeoutMs);
    try {
      await chrome.tabs.reload(parameters.tabId, { bypassCache: true });
      return await result;
    } finally {
      clearTimeout(timer);
      this.#pending.delete(parameters.tabId);
      this.#challenges.delete(parameters.tabId);
    }
  }

  public remove(tabId: number): void {
    this.#challenges.delete(tabId);
    this.#pending.delete(tabId);
  }
}
