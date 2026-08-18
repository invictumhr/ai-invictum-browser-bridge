import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

import { InMemoryAuditLog } from "@invictum/audit-log";
import { DesktopBridgeServer } from "@invictum/desktop";
import { DesktopControlServer } from "@invictum/desktop/control-server";
import { handleProtocolMessage } from "@invictum/extension/handler";
import {
  encodeNativeMessage,
  NativeHostBridge,
  NativeMessageDecoder,
  type NativeHostLogger,
} from "@invictum/native-host";
import { describe, expect, it } from "vitest";

const silentLogger: NativeHostLogger = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

interface TestBridge {
  bridge: NativeHostBridge;
  extensionInput: PassThrough;
  extensionOutput: PassThrough;
}

const emulateExtension = (
  desktopUrl: string,
  listTabs: () => Promise<unknown> = async () => ({ tabs: [], count: 0, permission: "tabs" }),
  getPageSnapshot: () => Promise<unknown> = async () => {
    throw new Error("Page snapshot dependency is not configured for this test");
  },
  findElements: () => Promise<unknown> = async () => {
    throw new Error("Find-elements dependency is not configured for this test");
  },
  click: () => Promise<unknown> = async () => {
    throw new Error("Click dependency is not configured for this test");
  },
  typeText: () => Promise<unknown> = async () => {
    throw new Error("Type-text dependency is not configured for this test");
  },
  unlockTab: (parameters: { tabId: number }) => Promise<unknown> = async (parameters) => ({
    tabId: parameters.tabId,
    unlocked: false,
  }),
  selectOption: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("Select-option dependency is not configured for this test");
  },
  setChecked: (_parameters: unknown, _checked: boolean) => Promise<unknown> = async () => {
    throw new Error("Set-checked dependency is not configured for this test");
  },
  submitForm: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("Submit-form dependency is not configured for this test");
  },
  evaluateJavaScript: (parameters: {
    tabId: number;
    mode: "read_only" | "page_mutation";
    world: "ISOLATED" | "MAIN";
  }) => Promise<unknown> = async () => {
    throw new Error("JavaScript dependency is not configured for this test");
  },
  captureScreenshot: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("Screenshot dependency is not configured for this test");
  },
  clickAt: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("Coordinate-click dependency is not configured for this test");
  },
  getHttpAuthState: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("HTTP-auth-state dependency is not configured for this test");
  },
  authenticateHttp: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("HTTP-authentication dependency is not configured for this test");
  },
  handleJavaScriptDialog: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("JavaScript-dialog dependency is not configured for this test");
  },
  setFileInputFiles: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("File-input dependency is not configured for this test");
  },
  mutateDom: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("DOM-mutation dependency is not configured for this test");
  },
  inspectElement: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("Element-inspection dependency is not configured for this test");
  },
  manageCss: (_parameters: {
    tabId: number;
    operation: "add" | "remove";
  }) => Promise<unknown> = async () => {
    throw new Error("CSS dependency is not configured for this test");
  },
  observeEvents: (_parameters: {
    tabId: number;
    operation: "start" | "read" | "stop";
  }) => Promise<unknown> = async () => {
    throw new Error("Event-capture dependency is not configured for this test");
  },
  executeJavaScript: (_parameters: {
    tabId: number;
    sourceType: "expression" | "function_body";
    awaitPromise: boolean;
    userGesture: boolean;
  }) => Promise<unknown> = async () => {
    throw new Error("Raw-JavaScript dependency is not configured for this test");
  },
  manageBrowserConsole: (_parameters: {
    tabId: number;
    operation: "start" | "read" | "clear" | "stop";
  }) => Promise<unknown> = async () => {
    throw new Error("Browser-console dependency is not configured for this test");
  },
  manageDeviceEmulation: (_parameters: {
    tabId: number;
    operation: "set" | "get" | "reset";
  }) => Promise<unknown> = async () => {
    throw new Error("Device-emulation dependency is not configured for this test");
  },
  getWordPressMenu: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("WordPress-menu inspection dependency is not configured for this test");
  },
  editWordPressMenu: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("WordPress-menu editing dependency is not configured for this test");
  },
  getWordPressAdmin: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("WordPress-admin inspection dependency is not configured for this test");
  },
  wordpressListTableAction: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("WordPress list-table dependency is not configured for this test");
  },
  getWordPressEditor: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("WordPress-editor inspection dependency is not configured for this test");
  },
  editWordPressEditor: (_parameters: unknown) => Promise<unknown> = async () => {
    throw new Error("WordPress-editor editing dependency is not configured for this test");
  },
): TestBridge => {
  const extensionInput = new PassThrough();
  const extensionOutput = new PassThrough();
  const decoder = new NativeMessageDecoder();
  const bridge = new NativeHostBridge({
    input: extensionInput,
    output: extensionOutput,
    desktopUrl,
    logger: silentLogger,
    reconnectInitialDelayMs: 20,
    reconnectMaxDelayMs: 100,
    heartbeatMs: 500,
  });

  extensionOutput.on("data", (chunk: Buffer) => {
    for (const request of decoder.push(chunk)) {
      void handleProtocolMessage(request, {
        listTabs,
        setControlIdentity: async (parameters) => ({
          ...parameters,
          label: `${parameters.agentName} is using this tab`,
          identified: true,
        }),
        getPageSnapshot,
        findElements,
        click,
        typeText,
        unlockTab,
        selectOption,
        setChecked,
        submitForm,
        evaluateJavaScript,
        captureScreenshot,
        clickAt,
        getHttpAuthState,
        authenticateHttp,
        handleJavaScriptDialog,
        setFileInputFiles,
        mutateDom,
        inspectElement,
        manageCss,
        observeEvents,
        executeJavaScript,
        manageBrowserConsole,
        manageDeviceEmulation,
        getWordPressMenu,
        editWordPressMenu,
        getWordPressAdmin,
        wordpressListTableAction,
        getWordPressEditor,
        editWordPressEditor,
      }).then((response) => {
        if (response !== undefined) {
          extensionInput.write(encodeNativeMessage(response));
        }
      });
    }
  });
  bridge.start();
  return { bridge, extensionInput, extensionOutput };
};

const stopTestBridge = (testBridge: TestBridge): void => {
  testBridge.bridge.stop();
  testBridge.extensionInput.destroy();
  testBridge.extensionOutput.destroy();
};

const controlSnapshot = {
  page: {
    url: "https://example.test/control",
    title: "Control API fixture",
    origin: "https://example.test",
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    scroll: { x: 0, y: 0, maxX: 0, maxY: 0 },
    loadingState: "complete" as const,
  },
  frames: [],
  elements: [],
  forms: [],
  dialogs: [],
  alerts: [],
  textBlocks: [],
  metadata: {
    generatedAt: "2026-07-22T12:00:00.000Z",
    documentId: "document-control-api",
    domRevision: 0,
    elementCount: 0,
    textLength: 0,
    truncated: false,
    detail: "interactive" as const,
  },
};

describe("Phase 1 desktop/native-host/extension integration", () => {
  it("round-trips a correlated ping and pong through both transports", async () => {
    const desktop = new DesktopBridgeServer({ port: 0 });
    const address = await desktop.start();
    const testBridge = emulateExtension(address.url);

    try {
      await desktop.waitForConnection();
      await expect(desktop.ping("integration-session")).resolves.toMatchObject({
        reply: "pong",
        component: "extension",
      });
    } finally {
      stopTestBridge(testBridge);
      await desktop.stop();
    }
  });

  it("lets agents call a running authority through the persistent loopback control API", async () => {
    const desktop = new DesktopBridgeServer({ port: 0 });
    const address = await desktop.start();
    const control = new DesktopControlServer({ bridge: desktop, port: 0 });
    const controlAddress = await control.start();
    const testBridge = emulateExtension(address.url);

    try {
      await desktop.waitForConnection();
      const health = (await (await fetch(`${controlAddress.url}/v1/health`)).json()) as {
        nativeConnected: boolean;
      };
      expect(health.nativeConnected).toBe(true);
      const response = (await (
        await fetch(`${controlAddress.url}/v1/call`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "system.ping",
            parameters: {},
            context: { sessionId: "control-api-test", sessionAuthorized: true },
          }),
        })
      ).json()) as { ok: boolean; data: { reply: string; component: string } };
      expect(response).toMatchObject({
        ok: true,
        data: { reply: "pong", component: "extension" },
      });
      const browserOriginAttempt = await fetch(`${controlAddress.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attacker.test" },
        body: JSON.stringify({ action: "system.ping", parameters: {} }),
      });
      await expect(browserOriginAttempt.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "PERMISSION_DENIED" },
      });
      const simpleRequestAttempt = await fetch(`${controlAddress.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ action: "system.ping", parameters: {} }),
      });
      await expect(simpleRequestAttempt.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "INVALID_MESSAGE" },
      });
      const confirmationAttempt = await fetch(`${controlAddress.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "browser.close_tab",
          parameters: { tabId: 12 },
          context: { sessionId: "control-api-test", sessionAuthorized: true },
        }),
      });
      await expect(confirmationAttempt.json()).resolves.toMatchObject({
        ok: false,
        error: {
          code: "CONFIRMATION_REQUIRED",
          details: {
            stage: "authorization_preflight",
            action: "browser.close_tab",
            riskLevel: "R2",
            requiredAuthorization: { source: "explicit_user_instruction" },
          },
        },
      });
      const confirmationKeyWasNotConsumed = await fetch(`${controlAddress.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "browser.close_tab",
          parameters: { tabId: 13 },
          idempotencyKey: "close-after-user-approval",
          context: { sessionId: "control-api-test", sessionAuthorized: true },
        }),
      });
      await expect(confirmationKeyWasNotConsumed.json()).resolves.toMatchObject({
        ok: false,
        error: {
          code: "CONFIRMATION_REQUIRED",
          details: { stage: "authorization_preflight" },
        },
      });
      const idempotentPing = {
        action: "system.ping",
        parameters: {},
        idempotencyKey: "integration-ping-once",
        context: { sessionId: "control-api-test", sessionAuthorized: true },
      };
      const firstIdempotentResponse = await fetch(`${controlAddress.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(idempotentPing),
      });
      expect(firstIdempotentResponse.status).toBe(200);
      const conflictingIdempotentResponse = await fetch(`${controlAddress.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...idempotentPing, parameters: { changed: true } }),
      });
      await expect(conflictingIdempotentResponse.json()).resolves.toMatchObject({
        ok: false,
        error: {
          code: "INVALID_PARAMETERS",
          details: { stage: "idempotency", idempotencyKey: "integration-ping-once" },
        },
      });
    } finally {
      stopTestBridge(testBridge);
      await control.stop();
      await desktop.stop();
    }
  });

  it("serves documented snapshot calls and readable parameter errors over control API", async () => {
    const desktop = new DesktopBridgeServer({ port: 0 });
    const address = await desktop.start();
    const control = new DesktopControlServer({ bridge: desktop, port: 0 });
    const controlAddress = await control.start();
    const testBridge = emulateExtension(
      address.url,
      async () => ({ tabs: [], count: 0, permission: "tabs" }),
      async () => controlSnapshot,
    );

    try {
      await desktop.waitForConnection();
      const snapshotResponse = await fetch(`${controlAddress.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "browser.get_page_snapshot",
          parameters: { tabId: 12, detail: "interactive" },
          context: { sessionId: "documented-control-example", sessionAuthorized: true },
        }),
      });
      expect(snapshotResponse.status).toBe(200);
      await expect(snapshotResponse.json()).resolves.toMatchObject({
        ok: true,
        data: {
          page: { title: "Control API fixture" },
          metadata: { documentId: "document-control-api" },
        },
      });

      const identityResponse = await fetch(`${controlAddress.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "browser.set_control_identity",
          parameters: { tabId: 12, agentName: "Codex" },
          context: { sessionId: "documented-control-example", sessionAuthorized: true },
        }),
      });
      expect(identityResponse.status).toBe(200);
      await expect(identityResponse.json()).resolves.toMatchObject({
        ok: true,
        data: {
          tabId: 12,
          agentName: "Codex",
          label: "Codex is using this tab",
          identified: true,
        },
      });

      const invalidResponse = await fetch(`${controlAddress.url}/v1/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "browser.type_text",
          parameters: {
            tabId: 12,
            documentId: "document-control-api",
            domRevision: 0,
            elementId: "el-1",
            text: "hello",
            clear: true,
          },
        }),
      });
      expect(invalidResponse.status).toBe(400);
      await expect(invalidResponse.json()).resolves.toMatchObject({
        ok: false,
        error: {
          code: "INVALID_PARAMETERS",
          message: expect.stringContaining("unknown key 'clear'. Allowed keys:"),
          details: {
            stage: "parameters",
            action: "browser.type_text",
            allowedKeys: expect.arrayContaining(["text", "mode"]),
            issues: expect.any(Array),
          },
        },
      });
    } finally {
      stopTestBridge(testBridge);
      await control.stop();
      await desktop.stop();
    }
  });

  it("reconnects after the desktop WebSocket server restarts", async () => {
    const firstDesktop = new DesktopBridgeServer({ port: 0 });
    const firstAddress = await firstDesktop.start();
    const testBridge = emulateExtension(firstAddress.url);

    try {
      await firstDesktop.waitForConnection();
      await expect(firstDesktop.ping("before-restart")).resolves.toMatchObject({ reply: "pong" });
      await firstDesktop.stop();

      const restartedDesktop = new DesktopBridgeServer({ port: firstAddress.port });
      try {
        await restartedDesktop.start();
        await restartedDesktop.waitForConnection(3_000);
        await expect(restartedDesktop.ping("after-restart")).resolves.toMatchObject({
          reply: "pong",
        });
      } finally {
        await restartedDesktop.stop();
      }
    } finally {
      stopTestBridge(testBridge);
      if (firstDesktop.address !== undefined) {
        await firstDesktop.stop();
      }
    }
  });

  it("lists tabs through policy, both transports, validation, and sanitized audit", async () => {
    const audit = new InMemoryAuditLog();
    const desktop = new DesktopBridgeServer({ port: 0, auditLog: audit });
    const address = await desktop.start();
    const testBridge = emulateExtension(address.url, async () => ({
      tabs: [
        {
          tabId: 42,
          windowId: 3,
          index: 0,
          active: true,
          highlighted: true,
          pinned: false,
          incognito: false,
          audible: false,
          discarded: false,
          status: "complete",
          title: "Local form",
          url: "http://127.0.0.1:4173/form",
          origin: "http://127.0.0.1:4173",
          restricted: false,
        },
      ],
      count: 1,
      permission: "tabs",
    }));

    try {
      await desktop.waitForConnection();
      await expect(
        desktop.listTabs({
          sessionId: "integration-tabs",
          agentId: "integration-agent",
          clientId: "vitest",
          sessionAuthorized: true,
        }),
      ).resolves.toMatchObject({
        count: 1,
        tabs: [{ tabId: 42, title: "Local form" }],
      });
      expect(audit.list()).toEqual([
        expect.objectContaining({
          sessionId: "integration-tabs",
          tool: "browser.list_tabs",
          policyDecision: expect.stringContaining("allow"),
          riskLevel: "R0",
          result: "success",
          sanitizedParameters: {},
        }),
      ]);
    } finally {
      stopTestBridge(testBridge);
      await desktop.stop();
    }
  });

  it("denies list_tabs before transport use when the session is unauthorized", async () => {
    const audit = new InMemoryAuditLog();
    const desktop = new DesktopBridgeServer({ port: 0, auditLog: audit });
    await desktop.start();

    try {
      await expect(
        desktop.listTabs({
          sessionId: "unauthorized-tabs",
          agentId: "unknown-agent",
          clientId: "vitest",
          sessionAuthorized: false,
        }),
      ).rejects.toMatchObject({ code: "SESSION_UNAUTHORIZED" });
      expect(audit.list()).toEqual([
        expect.objectContaining({ result: "denied", riskLevel: "R0" }),
      ]);
    } finally {
      await desktop.stop();
    }
  });

  it("releases an agent tab reservation through policy and both transports", async () => {
    const audit = new InMemoryAuditLog();
    const desktop = new DesktopBridgeServer({ port: 0, auditLog: audit });
    const address = await desktop.start();
    const testBridge = emulateExtension(
      address.url,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      async ({ tabId }) => ({ tabId, unlocked: true }),
    );

    try {
      await desktop.waitForConnection();
      await expect(
        desktop.unlockTab(
          {
            sessionId: "integration-release",
            agentId: "integration-agent",
            clientId: "vitest",
            sessionAuthorized: true,
          },
          { tabId: 42 },
        ),
      ).resolves.toEqual({ tabId: 42, unlocked: true });
      expect(audit.list()).toEqual([
        expect.objectContaining({
          sessionId: "integration-release",
          tool: "browser.unlock_tab",
          riskLevel: "R0",
          result: "success",
          sanitizedParameters: { tabId: 42 },
        }),
      ]);
    } finally {
      stopTestBridge(testBridge);
      await desktop.stop();
    }
  });

  it("sets a validated control identity through policy and both transports", async () => {
    const audit = new InMemoryAuditLog();
    const desktop = new DesktopBridgeServer({ port: 0, auditLog: audit });
    const address = await desktop.start();
    const testBridge = emulateExtension(address.url);

    try {
      await desktop.waitForConnection();
      await expect(
        desktop.setControlIdentity(
          {
            sessionId: "integration-identity",
            agentId: "integration-agent",
            clientId: "vitest",
            sessionAuthorized: true,
          },
          { tabId: 42, agentName: "Claude" },
        ),
      ).resolves.toEqual({
        tabId: 42,
        agentName: "Claude",
        label: "Claude is using this tab",
        identified: true,
      });
      expect(audit.list()).toEqual([
        expect.objectContaining({
          sessionId: "integration-identity",
          tool: "browser.set_control_identity",
          riskLevel: "R0",
          result: "success",
          sanitizedParameters: { tabId: 42, agentName: "Claude" },
        }),
      ]);
    } finally {
      stopTestBridge(testBridge);
      await desktop.stop();
    }
  });

  it("round-trips a validated page snapshot and records an R0 audit entry", async () => {
    const audit = new InMemoryAuditLog();
    const desktop = new DesktopBridgeServer({ port: 0, auditLog: audit });
    const address = await desktop.start();
    const snapshot = {
      page: {
        url: "http://127.0.0.1:4173/form?token=%5BREDACTED%5D",
        title: "Local form",
        origin: "http://127.0.0.1:4173",
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        scroll: { x: 0, y: 0, maxX: 0, maxY: 200 },
        loadingState: "complete",
      },
      frames: [
        {
          frameId: "top",
          parentFrameId: null,
          url: "http://127.0.0.1:4173/form?token=%5BREDACTED%5D",
          title: "Local form",
          name: "top",
          accessible: true,
        },
      ],
      elements: [
        {
          elementId: "el_document_0_1",
          frameId: "top",
          tag: "button",
          role: "button",
          name: "Save",
          text: "Save",
          visible: true,
          enabled: true,
          editable: false,
          clickable: true,
          focused: false,
          checked: null,
          selected: null,
          required: false,
          sensitive: false,
          hasValue: false,
          outsideViewport: false,
          boundingBox: { x: 10, y: 20, width: 80, height: 32 },
          selectors: { css: "#save", aria: "button[name='Save']" },
        },
      ],
      forms: [],
      dialogs: [],
      alerts: [],
      textBlocks: [],
      metadata: {
        generatedAt: "2026-07-22T12:00:00.000Z",
        documentId: "document-integration",
        domRevision: 0,
        elementCount: 1,
        textLength: 8,
        truncated: false,
        detail: "interactive",
      },
    };
    const testBridge = emulateExtension(
      address.url,
      async () => ({ tabs: [], count: 0, permission: "tabs" }),
      async () => snapshot,
    );

    try {
      await desktop.waitForConnection();
      await expect(
        desktop.getPageSnapshot(
          {
            sessionId: "integration-snapshot",
            agentId: "integration-agent",
            clientId: "vitest",
            sessionAuthorized: true,
          },
          { tabId: 12 },
        ),
      ).resolves.toMatchObject({
        page: { title: "Local form" },
        elements: [{ elementId: "el_document_0_1", role: "button" }],
        metadata: { detail: "interactive" },
      });
      expect(audit.list()).toEqual([
        expect.objectContaining({
          tool: "browser.get_page_snapshot",
          tabId: 12,
          domain: "127.0.0.1",
          riskLevel: "R0",
          result: "success",
          sanitizedParameters: expect.objectContaining({
            tabId: 12,
            detail: "interactive",
          }),
        }),
      ]);
    } finally {
      stopTestBridge(testBridge);
      await desktop.stop();
    }
  });

  it("finds revision-bound elements and audits criteria without raw query text", async () => {
    const audit = new InMemoryAuditLog();
    const desktop = new DesktopBridgeServer({ port: 0, auditLog: audit });
    const address = await desktop.start();
    const testBridge = emulateExtension(
      address.url,
      async () => ({ tabs: [], count: 0, permission: "tabs" }),
      async () => {
        throw new Error("Snapshot dependency is not used in this test");
      },
      async () => ({
        page: {
          url: "http://127.0.0.1:4173/form?token=%5BREDACTED%5D",
          origin: "http://127.0.0.1:4173",
        },
        documentId: "document-integration",
        domRevision: 4,
        matches: [
          {
            element: {
              elementId: "el_document_4_1",
              frameId: "top",
              tag: "button",
              role: "button",
              name: "Save settings",
              text: "Save settings",
              visible: true,
              enabled: true,
              editable: false,
              clickable: true,
              focused: false,
              checked: null,
              selected: null,
              required: false,
              sensitive: false,
              hasValue: false,
              outsideViewport: false,
              boundingBox: { x: 10, y: 20, width: 120, height: 32 },
              selectors: { css: "#save", aria: "button[name='Save settings']" },
            },
            score: 65,
            matchedBy: ["visible", "role", "name"],
          },
        ],
        count: 1,
        truncated: false,
      }),
    );

    try {
      await desktop.waitForConnection();
      await expect(
        desktop.findElements(
          {
            sessionId: "integration-find",
            agentId: "integration-agent",
            clientId: "vitest",
            sessionAuthorized: true,
          },
          {
            tabId: 12,
            documentId: "document-integration",
            domRevision: 4,
            role: "button",
            name: "raw-query-must-not-be-audited",
          },
        ),
      ).resolves.toMatchObject({
        count: 1,
        matches: [{ element: { role: "button", name: "Save settings" } }],
      });
      const entries = audit.list();
      expect(entries).toEqual([
        expect.objectContaining({
          tool: "browser.find_elements",
          tabId: 12,
          domain: "127.0.0.1",
          riskLevel: "R0",
          result: "success",
          sanitizedParameters: {
            tabId: 12,
            domRevision: 4,
            criteria: ["role", "name", "visible"],
            matchMode: "contains",
            maxResults: 50,
          },
        }),
      ]);
      expect(JSON.stringify(entries)).not.toContain("raw-query-must-not-be-audited");
    } finally {
      stopTestBridge(testBridge);
      await desktop.stop();
    }
  });

  it("round-trips R1 click/type_text and never audits typed text", async () => {
    const audit = new InMemoryAuditLog();
    const desktop = new DesktopBridgeServer({ port: 0, auditLog: audit });
    const address = await desktop.start();
    const typedText = "typed-value-must-not-enter-audit";
    const testBridge = emulateExtension(
      address.url,
      async () => ({ tabs: [], count: 0, permission: "tabs" }),
      async () => {
        throw new Error("Snapshot dependency is not used in this test");
      },
      async () => {
        throw new Error("Find dependency is not used in this test");
      },
      async () => ({
        page: {
          urlBefore: "http://127.0.0.1:4173/form",
          urlAfter: "http://127.0.0.1:4173/form",
          origin: "http://127.0.0.1:4173",
        },
        documentId: "document-integration",
        domRevisionBefore: 2,
        domRevisionAfter: 3,
        elementId: "el-preview",
        target: { role: "button", name: "Preview", sensitive: false },
        clicked: true,
        domChanged: true,
        urlChanged: false,
        requiresNewSnapshot: true,
      }),
      async () => ({
        page: { url: "http://127.0.0.1:4173/form", origin: "http://127.0.0.1:4173" },
        documentId: "document-integration",
        domRevisionBefore: 1,
        domRevisionAfter: 2,
        elementId: "el-email",
        target: { role: "textbox", name: "Email", sensitive: false },
        mode: "replace",
        characters: typedText.length,
        changed: true,
        requiresNewSnapshot: true,
      }),
    );

    try {
      await desktop.waitForConnection();
      await expect(
        desktop.typeText(
          {
            sessionId: "integration-interactions",
            agentId: "integration-agent",
            clientId: "vitest",
            sessionAuthorized: true,
          },
          {
            tabId: 12,
            documentId: "document-integration",
            domRevision: 1,
            elementId: "el-email",
            text: typedText,
          },
        ),
      ).resolves.toMatchObject({ changed: true, characters: typedText.length });
      await expect(
        desktop.click(
          {
            sessionId: "integration-interactions",
            agentId: "integration-agent",
            clientId: "vitest",
            sessionAuthorized: true,
          },
          {
            tabId: 12,
            documentId: "document-integration",
            domRevision: 2,
            elementId: "el-preview",
          },
        ),
      ).resolves.toMatchObject({ clicked: true, requiresNewSnapshot: true });

      const entries = audit.list();
      expect(entries).toEqual([
        expect.objectContaining({
          tool: "browser.type_text",
          riskLevel: "R1",
          result: "success",
          sanitizedParameters: expect.objectContaining({
            characters: typedText.length,
            mode: "replace",
          }),
        }),
        expect.objectContaining({
          tool: "browser.click",
          riskLevel: "R1",
          result: "success",
        }),
      ]);
      expect(JSON.stringify(entries)).not.toContain(typedText);
    } finally {
      stopTestBridge(testBridge);
      await desktop.stop();
    }
  });

  it("round-trips advanced form controls, authorized submit, and constrained JS", async () => {
    const audit = new InMemoryAuditLog();
    const desktop = new DesktopBridgeServer({ port: 0, auditLog: audit });
    const address = await desktop.start();
    const authorization = {
      source: "explicit_user_instruction" as const,
      instructionId: "integration-user-turn",
    };
    const unused = async (): Promise<unknown> => {
      throw new Error("Dependency is not used in this test");
    };
    const testBridge = emulateExtension(
      address.url,
      async () => ({ tabs: [], count: 0, permission: "tabs" }),
      unused,
      unused,
      unused,
      unused,
      async (parameters) => ({ tabId: parameters.tabId, unlocked: false }),
      async () => ({
        page: { url: "https://example.test/form", origin: "https://example.test" },
        documentId: "document-advanced",
        domRevisionBefore: 1,
        domRevisionAfter: 2,
        elementId: "country",
        selectedCount: 1,
        selectedIndices: [2],
        changed: true,
        requiresNewSnapshot: true,
      }),
      async (_parameters, checked) => ({
        page: { url: "https://example.test/form", origin: "https://example.test" },
        documentId: "document-advanced",
        domRevisionBefore: 2,
        domRevisionAfter: 3,
        elementId: "terms",
        checked,
        changed: true,
        requiresNewSnapshot: true,
      }),
      async () => ({
        page: { urlBefore: "https://example.test/form", origin: "https://example.test" },
        documentId: "document-advanced",
        domRevisionBefore: 3,
        elementId: "form",
        submitted: true,
        verificationRequired: true,
      }),
      async (parameters) => ({
        tabId: parameters.tabId,
        mode: parameters.mode,
        world: parameters.world,
        value: "Form title",
        valueType: "string",
        truncated: false,
      }),
      async () => ({
        screenshotId: "112d1030-f123-4b81-bb20-416335c830fe",
        tabId: 12,
        documentId: "document-advanced",
        domRevision: 3,
        capturedAt: "2026-07-22T12:00:00.000Z",
        mediaType: "image/jpeg",
        width: 800,
        height: 600,
        viewport: { cssWidth: 1_600, cssHeight: 900, deviceScaleFactor: 1 },
        capture: {
          mode: "viewport",
          sourceCssRect: { x: 0, y: 0, width: 1_600, height: 900 },
          fullPage: false,
          annotationsApplied: 0,
        },
        byteLength: 12,
        dataUrl: "data:image/jpeg;base64,ZmFrZS1qcGVnLWJ5dGVz",
      }),
      async () => ({
        page: {
          urlBefore: "https://example.test/form",
          urlAfter: "https://example.test/form",
          origin: "https://example.test",
        },
        documentId: "document-advanced",
        domRevisionBefore: 3,
        domRevisionAfter: 4,
        coordinates: { x: 400, y: 300 },
        target: { role: "button", name: "Fallback", sensitive: false },
        clicked: true,
        domChanged: true,
        urlChanged: false,
        requiresNewSnapshot: true,
      }),
      async () => ({
        tabId: 12,
        challengeDetected: true,
        origin: "https://example.test",
        scheme: "basic",
        realm: "robots",
        isProxy: false,
        detectedAt: "2026-07-22T12:00:00.000Z",
      }),
      async () => ({
        tabId: 12,
        origin: "https://example.test",
        authenticated: true,
        challengeHandled: true,
        scheme: "basic",
        credentialsRetained: false,
        verificationRequired: true,
      }),
      async () => ({
        tabId: 12,
        detected: true,
        handled: true,
        accepted: true,
        type: "confirm",
        message: "Continue?",
        origin: "https://example.test",
        triggerType: "none",
        promptTextSupplied: false,
        requiresNewSnapshot: true,
      }),
      async () => ({
        page: { url: "https://example.test/form", origin: "https://example.test" },
        documentId: "document-advanced",
        domRevisionBefore: 3,
        domRevisionAfter: 4,
        elementId: "upload",
        fileCount: 1,
        countVerified: true,
        multiple: false,
        accept: ".txt",
        changed: true,
        requiresNewSnapshot: true,
        verificationRequired: true,
      }),
      async () => ({
        page: { url: "https://example.test/form", origin: "https://example.test" },
        documentId: "document-advanced",
        domRevisionBefore: 4,
        domRevisionAfter: 5,
        elementId: "advanced-target",
        resolvedElementId: "advanced-target-next",
        operationTypes: ["set_text", "set_style"],
        operationsApplied: 2,
        sanitizedHtml: false,
        elementRemoved: false,
        changed: true,
        requiresNewSnapshot: true,
      }),
      async () => ({
        page: { url: "https://example.test/form", origin: "https://example.test" },
        documentId: "document-advanced",
        domRevision: 5,
        elementId: "advanced-target-next",
        element: {
          tag: "div",
          id: "advanced-target",
          classes: ["fixture"],
          role: "generic",
          name: "Advanced target",
          selector: "#advanced-target",
          text: "Advanced target",
          sensitive: false,
          visible: true,
          enabled: true,
          editable: false,
          clickable: false,
          box: { x: 10, y: 20, width: 300, height: 40 },
          attributes: [{ name: "data-state", value: "ready" }],
          inlineStyle: [{ name: "color", value: "rgb(1, 2, 3)" }],
          computedStyle: [{ name: "display", value: "block" }],
        },
        ancestors: [],
        eventListeners: [
          {
            target: "document",
            type: "click",
            useCapture: false,
            passive: false,
            once: false,
            handlerName: "privateFixtureHandler",
            scriptId: "12",
            sourceUrl: "https://example.test/app.js",
            lineNumber: 10,
            columnNumber: 2,
            sourceExcerpt: "function privateFixtureHandler() {}",
            excerptTruncated: false,
          },
        ],
        listenersTruncated: false,
        debuggerUsed: true,
      }),
      async (parameters: { tabId: number; operation: "add" | "remove" }) => ({
        tabId: parameters.tabId,
        operation: parameters.operation,
        injectionId: "2b9ad5a0-df50-4bd5-ae80-e94b91a01173",
        applied: parameters.operation === "add",
        removed: parameters.operation === "remove",
        origin: "USER",
        allFrames: false,
        cssBytes: 38,
        cleanupOnUnlock: true,
        requiresNewSnapshot: true,
      }),
      async (parameters: { tabId: number; operation: "start" | "read" | "stop" }) => ({
        tabId: parameters.tabId,
        operation: parameters.operation,
        captureId: "527561ef-b68c-4c20-a615-3442385116d7",
        active: parameters.operation !== "stop",
        startedAt: "2026-07-22T12:00:00.000Z",
        eventTypes: ["click", "fixture:selection"],
        scoped: false,
        events: [],
        eventCount: 0,
        droppedEvents: 0,
        cleared: false,
      }),
      async (parameters: {
        tabId: number;
        sourceType: "expression" | "function_body";
        awaitPromise: boolean;
        userGesture: boolean;
      }) => ({
        tabId: parameters.tabId,
        sourceType: parameters.sourceType,
        value: { title: "Form title" },
        valueType: "object",
        description: "Object",
        truncated: false,
        awaitPromise: parameters.awaitPromise,
        userGesture: parameters.userGesture,
        debuggerUsed: true,
        requiresNewSnapshot: true,
      }),
      async (parameters: { tabId: number; operation: "start" | "read" | "clear" | "stop" }) => ({
        tabId: parameters.tabId,
        operation: parameters.operation,
        active: parameters.operation !== "stop",
        captureId: "2ec5c52d-87e0-4396-8aac-5239f3c38fc5",
        startedAt: "2026-07-23T08:00:00.000Z",
        entries: [],
        entryCount: 0,
        droppedEntries: 0,
        cleared: parameters.operation === "clear",
      }),
      async (parameters: { tabId: number; operation: "set" | "get" | "reset" }) => ({
        tabId: parameters.tabId,
        operation: parameters.operation,
        active: parameters.operation === "set",
        profile:
          parameters.operation === "set"
            ? {
                preset: "mobile_medium",
                orientation: "portrait",
                width: 390,
                height: 844,
                deviceScaleFactor: 3,
                mobile: true,
                touch: true,
              }
            : null,
        debuggerAttached: parameters.operation === "set",
        requiresNewSnapshot: parameters.operation !== "get",
      }),
      async () => ({
        page: {
          url: "https://example.test/wp-admin/nav-menus.php?menu=151",
          origin: "https://example.test",
        },
        documentId: "document-wordpress-menu",
        domRevision: 8,
        menuId: "151",
        menuName: "Primary",
        items: [
          {
            itemId: "101",
            parentItemId: null,
            depth: 0,
            position: 0,
            label: "Home",
            type: "custom",
            object: "custom",
            url: "https://example.test/",
            openInNewTab: false,
            childCount: 0,
          },
        ],
        itemCount: 1,
        truncated: false,
        dirty: false,
      }),
      async () => ({
        page: {
          url: "https://example.test/wp-admin/nav-menus.php?menu=151",
          origin: "https://example.test",
        },
        documentId: "document-wordpress-menu",
        domRevisionBefore: 8,
        domRevisionAfter: 9,
        menuId: "151",
        menuName: "Primary",
        operationTypes: ["add_custom"],
        affectedItemIds: ["-1"],
        items: [
          {
            itemId: "101",
            parentItemId: null,
            depth: 0,
            position: 0,
            label: "Home",
            type: "custom",
            object: "custom",
            url: "https://example.test/",
            openInNewTab: false,
            childCount: 0,
          },
          {
            itemId: "-1",
            parentItemId: null,
            depth: 0,
            position: 1,
            label: "Private audit label",
            type: "custom",
            object: "custom",
            url: "https://example.test/private-audit-url",
            openInNewTab: false,
            childCount: 0,
          },
        ],
        itemCount: 2,
        changed: true,
        submitted: false,
        verificationRequired: false,
        requiresNewSnapshot: true,
      }),
      async () => ({
        page: {
          url: "https://example.test/wp-admin/edit.php",
          origin: "https://example.test",
        },
        documentId: "document-wordpress-admin",
        domRevision: 10,
        screen: {
          pageTitle: "Posts",
          heading: "Posts",
          pageSlug: "",
          postType: "post",
          taxonomy: "",
          editorKind: "none",
        },
        adminBar: { present: true, siteName: "Example site" },
        notices: [{ kind: "success", text: "Private notice", dismissible: true }],
        listTable: {
          tableId: "posts-list",
          columns: [{ key: "title", label: "Title" }],
          rows: [
            {
              rowId: "post-201",
              primaryText: "Private post title",
              status: "Published",
              selected: false,
              columns: [{ key: "title", text: "Private post title" }],
              actions: [{ key: "edit", label: "Edit", destructive: false }],
            },
          ],
          rowCount: 1,
          truncated: false,
          bulkActions: [{ key: "edit", label: "Edit", destructive: false }],
        },
      }),
      async () => ({
        page: {
          urlBefore: "https://example.test/wp-admin/edit.php",
          urlAfter: "https://example.test/wp-admin/edit.php",
          origin: "https://example.test",
        },
        documentId: "document-wordpress-admin",
        domRevisionBefore: 10,
        domRevisionAfter: 11,
        operation: "apply_bulk",
        rowIds: ["post-201"],
        actionKey: "edit",
        destructive: false,
        triggered: true,
        verificationRequired: true,
        requiresNewSnapshot: true,
      }),
      async () => ({
        page: {
          url: "https://example.test/wp-admin/post.php?post=301&action=edit",
          origin: "https://example.test",
        },
        documentId: "document-wordpress-editor",
        domRevision: 12,
        editorKind: "block",
        postId: "301",
        postType: "post",
        title: "Private editor title",
        content: "Private editor content",
        contentTruncated: false,
        excerpt: "Private editor excerpt",
        slug: "private-editor-slug",
        status: "draft",
        categoryIds: [4],
        tagIds: [8],
        featuredMediaId: 22,
        authorId: 1,
        parentId: 0,
        menuOrder: 0,
        commentStatus: "open",
        pingStatus: "closed",
        dirty: true,
        saving: false,
        lastSaveSucceeded: null,
      }),
      async () => ({
        page: {
          urlBefore: "https://example.test/wp-admin/post.php?post=301&action=edit",
          urlAfter: "https://example.test/wp-admin/post.php?post=301&action=edit",
          origin: "https://example.test",
        },
        documentId: "document-wordpress-editor",
        domRevisionBefore: 12,
        domRevisionAfter: 13,
        editorKind: "block",
        postId: "301",
        postType: "post",
        fieldNames: ["title", "content"],
        status: "draft",
        changed: true,
        saved: false,
        publishRequested: false,
        verificationRequired: false,
        requiresNewSnapshot: true,
      }),
    );
    const context = {
      sessionId: "integration-advanced",
      agentId: "integration-agent",
      clientId: "vitest",
      sessionAuthorized: true,
    };

    try {
      await desktop.waitForConnection();
      await expect(
        desktop.selectOption(context, {
          tabId: 12,
          documentId: "document-advanced",
          domRevision: 1,
          elementId: "country",
          selection: { values: ["private-selection-value"] },
        }),
      ).resolves.toMatchObject({ selectedIndices: [2] });
      await expect(
        desktop.check(context, {
          tabId: 12,
          documentId: "document-advanced",
          domRevision: 2,
          elementId: "terms",
        }),
      ).resolves.toMatchObject({ checked: true });
      await expect(
        desktop.setFileInputFiles(context, {
          tabId: 12,
          documentId: "document-advanced",
          domRevision: 3,
          elementId: "upload",
          filePaths: [fileURLToPath(new URL("../../fixtures/upload-one.txt", import.meta.url))],
          authorization,
        }),
      ).resolves.toMatchObject({ fileCount: 1, verificationRequired: true });
      await expect(
        desktop.submitForm(context, {
          tabId: 12,
          documentId: "document-advanced",
          domRevision: 3,
          elementId: "form",
          authorization,
        }),
      ).resolves.toMatchObject({ submitted: true, verificationRequired: true });
      await expect(
        desktop.evaluateJavaScript(context, {
          tabId: 12,
          expression: "document.title",
          authorization,
        }),
      ).resolves.toMatchObject({ value: "Form title" });
      const screenshot = await desktop.captureScreenshot(context, {
        tabId: 12,
        maxWidth: 800,
        maxHeight: 600,
      });
      expect(screenshot.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
      await expect(
        desktop.clickAt(context, {
          tabId: 12,
          documentId: "document-advanced",
          domRevision: 3,
          x: 400,
          y: 300,
        }),
      ).resolves.toMatchObject({ clicked: true, coordinates: { x: 400, y: 300 } });
      await expect(desktop.getHttpAuthState(context, { tabId: 12 })).resolves.toMatchObject({
        challengeDetected: true,
        scheme: "basic",
      });
      await expect(
        desktop.authenticateHttp(context, {
          tabId: 12,
          username: "private-basic-user",
          password: "private-basic-password",
          authorization,
        }),
      ).resolves.toMatchObject({ authenticated: true, credentialsRetained: false });
      await expect(
        desktop.handleJavaScriptDialog(context, {
          tabId: 12,
          accept: true,
          promptText: "private-prompt-value",
          authorization,
        }),
      ).resolves.toMatchObject({ handled: true, accepted: true });
      await expect(
        desktop.mutateDom(context, {
          tabId: 12,
          documentId: "document-advanced",
          domRevision: 4,
          elementId: "advanced-target",
          operations: [
            { type: "set_text", text: "private-dom-content" },
            { type: "set_style", property: "color", value: "private-inline-css" },
          ],
          authorization,
        }),
      ).resolves.toMatchObject({ operationsApplied: 2, resolvedElementId: "advanced-target-next" });
      await expect(
        desktop.inspectElement(context, {
          tabId: 12,
          documentId: "document-advanced",
          domRevision: 5,
          elementId: "advanced-target-next",
          computedStyleProperties: ["display"],
          includeEventListeners: true,
        }),
      ).resolves.toMatchObject({ debuggerUsed: true, eventListeners: [{ type: "click" }] });
      await expect(
        desktop.manageCss(context, {
          operation: "add",
          tabId: 12,
          css: "#advanced-target { --private-css-marker: 1; }",
          origin: "USER",
          authorization,
        }),
      ).resolves.toMatchObject({ applied: true, cleanupOnUnlock: true });
      await expect(
        desktop.observeEvents(context, {
          operation: "start",
          tabId: 12,
          eventTypes: ["click", "fixture:selection"],
        }),
      ).resolves.toMatchObject({ active: true, eventCount: 0 });
      await expect(
        desktop.executeJavaScript(context, {
          tabId: 12,
          source: '({ marker: "private-raw-source" })',
          authorization,
        }),
      ).resolves.toMatchObject({ debuggerUsed: true, value: { title: "Form title" } });
      await expect(
        desktop.manageBrowserConsole(context, {
          operation: "start",
          tabId: 12,
        }),
      ).resolves.toMatchObject({ active: true, entryCount: 0 });
      await expect(
        desktop.manageDeviceEmulation(context, {
          operation: "set",
          tabId: 12,
          preset: "mobile_medium",
        }),
      ).resolves.toMatchObject({
        active: true,
        profile: { width: 390, height: 844, touch: true },
      });
      await expect(desktop.getWordPressMenu(context, { tabId: 12 })).resolves.toMatchObject({
        menuId: "151",
        items: [{ itemId: "101", label: "Home" }],
      });
      await expect(
        desktop.editWordPressMenu(context, {
          tabId: 12,
          documentId: "document-wordpress-menu",
          domRevision: 8,
          operations: [
            {
              type: "add_custom",
              label: "Private audit label",
              url: "https://example.test/private-audit-url",
            },
          ],
          authorization,
        }),
      ).resolves.toMatchObject({
        operationTypes: ["add_custom"],
        affectedItemIds: ["-1"],
        changed: true,
      });
      await expect(desktop.getWordPressAdmin(context, { tabId: 12 })).resolves.toMatchObject({
        screen: { heading: "Posts" },
        listTable: { rows: [{ rowId: "post-201" }] },
      });
      await expect(
        desktop.wordpressListTableAction(context, {
          tabId: 12,
          documentId: "document-wordpress-admin",
          domRevision: 10,
          operation: "apply_bulk",
          rowIds: ["post-201"],
          actionKey: "edit",
          authorization,
        }),
      ).resolves.toMatchObject({
        operation: "apply_bulk",
        rowIds: ["post-201"],
        triggered: true,
      });
      await expect(desktop.getWordPressEditor(context, { tabId: 12 })).resolves.toMatchObject({
        editorKind: "block",
        postId: "301",
        title: "Private editor title",
      });
      await expect(
        desktop.editWordPressEditor(context, {
          tabId: 12,
          documentId: "document-wordpress-editor",
          domRevision: 12,
          fields: {
            title: "Private replacement title",
            content: "Private replacement content",
          },
          authorization,
        }),
      ).resolves.toMatchObject({
        fieldNames: ["title", "content"],
        changed: true,
        saved: false,
      });

      const entries = audit.list();
      expect(entries.map((entry) => entry.tool)).toEqual([
        "browser.select_option",
        "browser.check",
        "browser.set_file_input_files",
        "browser.submit_form",
        "browser.evaluate",
        "browser.screenshot",
        "browser.click_at",
        "browser.get_http_auth_state",
        "browser.authenticate_http",
        "browser.handle_javascript_dialog",
        "browser.mutate_dom",
        "browser.inspect_element",
        "browser.manage_css",
        "browser.observe_events",
        "browser.execute_javascript",
        "browser.console",
        "browser.emulate_device",
        "browser.get_wordpress_menu",
        "browser.edit_wordpress_menu",
        "browser.get_wordpress_admin",
        "browser.wordpress_list_table_action",
        "browser.get_wordpress_editor",
        "browser.edit_wordpress_editor",
      ]);
      expect(entries[2]).toMatchObject({
        riskLevel: "R2",
        confirmationId: "integration-user-turn",
        sanitizedParameters: expect.objectContaining({ fileCount: 1 }),
      });
      expect(entries[3]).toMatchObject({
        riskLevel: "R2",
        confirmationId: "integration-user-turn",
      });
      expect(entries[4]?.sanitizedParameters).toMatchObject({
        expressionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        expressionLength: 14,
      });
      expect(JSON.stringify(entries)).not.toContain("private-selection-value");
      expect(JSON.stringify(entries)).not.toContain("document.title");
      expect(JSON.stringify(entries)).not.toContain("ZmFrZS1qcGVnLWJ5dGVz");
      expect(JSON.stringify(entries)).not.toContain("private-basic-user");
      expect(JSON.stringify(entries)).not.toContain("private-basic-password");
      expect(JSON.stringify(entries)).not.toContain("private-prompt-value");
      expect(JSON.stringify(entries)).not.toContain("upload-one.txt");
      expect(JSON.stringify(entries)).not.toContain("Private notice");
      expect(JSON.stringify(entries)).not.toContain("Private post title");
      expect(JSON.stringify(entries)).not.toContain("Private editor title");
      expect(JSON.stringify(entries)).not.toContain("Private editor content");
      expect(JSON.stringify(entries)).not.toContain("Private replacement title");
      expect(JSON.stringify(entries)).not.toContain("Private replacement content");
      expect(entries[12]?.sanitizedParameters).toMatchObject({
        cssSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        cssLength: "#advanced-target { --private-css-marker: 1; }".length,
      });
      expect(entries[14]).toMatchObject({
        riskLevel: "R3",
        confirmationId: "integration-user-turn",
        sanitizedParameters: expect.objectContaining({
          sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      });
      expect(JSON.stringify(entries)).not.toContain("private-dom-content");
      expect(JSON.stringify(entries)).not.toContain("private-inline-css");
      expect(JSON.stringify(entries)).not.toContain("privateFixtureHandler");
      expect(JSON.stringify(entries)).not.toContain("private-css-marker");
      expect(JSON.stringify(entries)).not.toContain("private-raw-source");
      expect(JSON.stringify(entries)).not.toContain("Private audit label");
      expect(JSON.stringify(entries)).not.toContain("private-audit-url");
      expect(entries[18]).toMatchObject({
        riskLevel: "R2",
        confirmationId: "integration-user-turn",
        sanitizedParameters: expect.objectContaining({
          operationTypes: ["add_custom"],
          operationCount: 1,
        }),
      });
    } finally {
      stopTestBridge(testBridge);
      await desktop.stop();
    }
  });
});
