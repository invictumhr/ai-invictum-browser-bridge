import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthenticateHttpParametersSchema, IBP_ERROR_CODES } from "@invictum/protocol";

import { ChromeHttpAuthAdapter } from "./http-auth.js";

type Listener = (...arguments_: unknown[]) => unknown;

const event = () => {
  let listener: Listener | undefined;
  return {
    api: {
      addListener: vi.fn((next: Listener) => {
        listener = next;
      }),
    },
    emit: (...arguments_: unknown[]) => listener?.(...arguments_),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("ChromeHttpAuthAdapter", () => {
  it("detects a challenge and supplies ephemeral Basic credentials once", async () => {
    const authRequired = event();
    const completed = event();
    const failed = event();
    const reload = vi.fn();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: "https://protected.test/private" }),
        reload: vi.fn().mockImplementation(async () => reload()),
      },
      webRequest: {
        onAuthRequired: authRequired.api,
        onCompleted: completed.api,
        onErrorOccurred: failed.api,
      },
    });
    const adapter = new ChromeHttpAuthAdapter();
    const callback = vi.fn();
    authRequired.emit(
      {
        tabId: 4,
        type: "main_frame",
        url: "https://protected.test/private",
        scheme: "basic",
        realm: "robots",
        isProxy: false,
        challenger: { host: "protected.test", port: 443 },
      },
      vi.fn(),
    );
    await expect(adapter.getState({ tabId: 4 })).resolves.toMatchObject({
      challengeDetected: true,
      scheme: "basic",
      realm: "robots",
    });
    reload.mockImplementation(() => {
      authRequired.emit(
        {
          tabId: 4,
          type: "main_frame",
          url: "https://protected.test/private",
          scheme: "basic",
          realm: "robots",
          isProxy: false,
          challenger: { host: "protected.test", port: 443 },
        },
        callback,
      );
      completed.emit({
        tabId: 4,
        type: "main_frame",
        url: "https://protected.test/private",
        timeStamp: Date.now(),
      });
    });
    const result = await adapter.authenticate(
      AuthenticateHttpParametersSchema.parse({
        tabId: 4,
        username: "robots-user",
        password: "robots-password",
        authorization: {
          source: "explicit_user_instruction",
          instructionId: "user-auth-1",
        },
      }),
    );
    expect(callback).toHaveBeenCalledWith({
      authCredentials: { username: "robots-user", password: "robots-password" },
    });
    expect(result).toMatchObject({
      authenticated: true,
      challengeHandled: true,
      credentialsRetained: false,
    });
    await expect(adapter.getState({ tabId: 4 })).resolves.toMatchObject({
      challengeDetected: false,
    });
  });

  it("fails instead of claiming success when reload has no Basic challenge", async () => {
    const authRequired = event();
    const completed = event();
    const failed = event();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: "https://public.test/" }),
        reload: vi.fn().mockImplementation(async () => {
          completed.emit({
            tabId: 9,
            type: "main_frame",
            url: "https://public.test/",
            timeStamp: Date.now(),
          });
        }),
      },
      webRequest: {
        onAuthRequired: authRequired.api,
        onCompleted: completed.api,
        onErrorOccurred: failed.api,
      },
    });
    const adapter = new ChromeHttpAuthAdapter();
    await expect(
      adapter.authenticate(
        AuthenticateHttpParametersSchema.parse({
          tabId: 9,
          username: "user",
          password: "password",
          authorization: {
            source: "explicit_user_instruction",
            instructionId: "user-auth-2",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: IBP_ERROR_CODES.AUTHENTICATION_FAILED });
  });

  it("accepts a completed reload when Chrome satisfies a recently detected Basic challenge", async () => {
    const authRequired = event();
    const completed = event();
    const failed = event();
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: {
        get: vi.fn().mockResolvedValue({ url: "https://cached-auth.test/private" }),
        reload: vi.fn().mockImplementation(async () => {
          completed.emit({
            tabId: 12,
            type: "main_frame",
            url: "https://cached-auth.test/private",
            timeStamp: Date.now(),
          });
        }),
      },
      webRequest: {
        onAuthRequired: authRequired.api,
        onCompleted: completed.api,
        onErrorOccurred: failed.api,
      },
    });
    const adapter = new ChromeHttpAuthAdapter();
    authRequired.emit(
      {
        tabId: 12,
        type: "main_frame",
        url: "https://cached-auth.test/private",
        scheme: "basic",
        realm: "cached",
        isProxy: false,
        challenger: { host: "cached-auth.test", port: 443 },
      },
      vi.fn(),
    );

    await expect(
      adapter.authenticate(
        AuthenticateHttpParametersSchema.parse({
          tabId: 12,
          username: "user",
          password: "password",
          authorization: {
            source: "explicit_user_instruction",
            instructionId: "user-auth-cached",
          },
        }),
      ),
    ).resolves.toMatchObject({
      authenticated: true,
      challengeHandled: false,
      scheme: "basic",
      credentialsRetained: false,
    });
  });
});
