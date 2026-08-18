#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { EnhancedActionRunner } from "@invictum/agent-sdk";
import { getActionMetadata, type ActionMetadata } from "@invictum/protocol";

import { ControlClient, ControlError } from "./client.js";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const sessionId = process.env["INVICTUM_SESSION_ID"] ?? `mcp-${randomUUID()}`;
const client = new ControlClient(process.env["INVICTUM_CONTROL_URL"], {
  sessionId,
  agentId: process.env["INVICTUM_AGENT_ID"] ?? "mcp-agent",
  clientId: "invictum-browser-mcp",
  sessionAuthorized: process.env["INVICTUM_SESSION_AUTHORIZED"] !== "false",
});
const enhancedActionRunner = new EnhancedActionRunner(client);

const SERVER_INSTRUCTIONS = [
  "This server is Invictum Browser Bridge, also called Invictum Browser Gate, IBB, or IBG.",
  "When the user says 'use IBB', 'use IBG', 'use Invictum Browser Bridge', or 'use Invictum Browser Gate', use these invictum_* tools for the browser task instead of an unrelated browser automation surface.",
  "Start with invictum_ping and invictum_capabilities.",
  "For new tabs use invictum_open_tab and omit active unless the user genuinely needs the tab focused; background operation is the default.",
  "Optionally call invictum_set_control_identity once per controlled tab with the current agent name.",
  "Prefer semantic snapshot/find/typed actions, use screenshots and coordinate clicks only as fallbacks, and never bypass bridge policy.",
  "Before navigating away from a dirty WordPress or other form, use invictum_handle_beforeunload with navigateUrl and decision stay or leave so the native handler is armed before Chrome opens the dialog; never guess leave because it can discard changes.",
  "Always call invictum_unlock_tab in finally, or invictum_end_session once when the task is complete.",
].join(" ");

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  action?: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
}

interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

const objectSchema = (
  properties: Record<string, unknown> = {},
  required: string[] = [],
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const IDEMPOTENCY_KEY_SCHEMA = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9._:-]+$",
  description:
    "Stable key for one logical mutating operation. A retry with the same key and parameters reuses the first result instead of executing twice.",
};

const VERIFY_SCHEMA = objectSchema(
  {
    condition: {
      oneOf: [
        objectSchema(
          {
            type: { enum: ["url", "title", "selector", "text"] },
            value: { type: "string" },
            match: { enum: ["exact", "contains"] },
            caseSensitive: { type: "boolean" },
          },
          ["type", "value"],
        ),
        objectSchema(
          {
            type: { const: "dom_stable" },
            stableMs: { type: "integer", minimum: 100, maximum: 10_000 },
          },
          ["type"],
        ),
      ],
    },
    timeoutMs: { type: "integer", minimum: 100, maximum: 120_000 },
    pollIntervalMs: { type: "integer", minimum: 50, maximum: 2_000 },
  },
  ["condition"],
);

const AUTO_MARKS_SCHEMA = objectSchema({
  max: { type: "integer", minimum: 1, maximum: 20, default: 12 },
  label: { enum: ["number", "name"], default: "number" },
  includeEditable: { type: "boolean", default: true },
});

const tools: readonly ToolDefinition[] = [
  {
    name: "invictum_ping",
    title: "Start IBB/IBG browser control",
    description:
      "Entry point for Invictum Browser Bridge/Gate (IBB/IBG). When the user says to use IBB, IBG, Invictum Browser Bridge, or Invictum Browser Gate, call this first to verify the complete desktop → Native Host → Chrome extension round trip.",
    action: "system.ping",
    inputSchema: objectSchema(),
  },
  {
    name: "invictum_capabilities",
    title: "Browser capabilities",
    description:
      "Return the exact actions and feature flags supported by the currently connected extension build. Call this before relying on documentation.",
    action: "system.capabilities",
    inputSchema: objectSchema(),
  },
  {
    name: "invictum_list_tabs",
    title: "List Chrome tabs",
    description: "List redacted Chrome tab metadata without reserving a tab.",
    action: "browser.list_tabs",
    inputSchema: objectSchema(),
  },
  {
    name: "invictum_open_tab",
    title: "Open web tab",
    description:
      "Open and load one validated credential-free HTTP(S) URL. MUST omit active to honor the user's toolbar default unless the current task genuinely requires showing/focusing this tab. Never force active for visibility, screenshots, debugging, the indicator, or convenience. The first targeted follow-up automatically reserves it.",
    action: "browser.open_tab",
    inputSchema: objectSchema(
      {
        url: { type: "string", format: "uri" },
        active: {
          type: "boolean",
          description: "Optional override; omit to honor the user's toolbar setting.",
        },
        waitUntil: { type: "string", enum: ["none", "complete"], default: "complete" },
        timeoutMs: { type: "integer", minimum: 100, maximum: 120000 },
      },
      ["url"],
    ),
  },
  {
    name: "invictum_navigate",
    title: "Navigate tab",
    description:
      "Navigate a tab to a validated credential-free HTTP(S) URL. MUST omit active to honor the user's toolbar default unless the current task genuinely requires showing/focusing this tab. Never force active for visibility, screenshots, debugging, the indicator, or convenience. If an unsaved-changes dialog blocks the navigation, use invictum_handle_beforeunload and explicitly choose stay or leave.",
    action: "browser.navigate",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        url: { type: "string", format: "uri" },
        active: {
          type: "boolean",
          description: "Optional override; omit to honor the user's toolbar setting.",
        },
        waitUntil: { type: "string", enum: ["none", "complete"], default: "complete" },
        timeoutMs: { type: "integer", minimum: 100, maximum: 120000 },
      },
      ["tabId", "url"],
    ),
  },
  {
    name: "invictum_go_back",
    title: "Navigate tab back",
    description:
      "Navigate a reserved tab backward in browser history. The tab stays in the background unless it was already active. Arm beforeunload first if the page may contain unsaved changes.",
    action: "browser.go_back",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        waitUntil: { type: "string", enum: ["none", "complete"], default: "complete" },
        timeoutMs: { type: "integer", minimum: 100, maximum: 120000 },
      },
      ["tabId"],
    ),
  },
  {
    name: "invictum_go_forward",
    title: "Navigate tab forward",
    description:
      "Navigate a reserved tab forward in browser history without activating it. Arm beforeunload first if the page may contain unsaved changes.",
    action: "browser.go_forward",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        waitUntil: { type: "string", enum: ["none", "complete"], default: "complete" },
        timeoutMs: { type: "integer", minimum: 100, maximum: 120000 },
      },
      ["tabId"],
    ),
  },
  {
    name: "invictum_activate_tab",
    title: "Explicitly activate tab",
    description:
      "Bring one existing tab to the foreground. Use only when the user asked to see/focus it or a trusted interaction genuinely requires activation; ordinary agent work must remain in the background.",
    action: "browser.activate_tab",
    inputSchema: objectSchema({ tabId: { type: "integer", minimum: 0 } }, ["tabId"]),
  },
  {
    name: "invictum_close_tab",
    title: "Close tab",
    description:
      "Close one explicitly authorized tab. Arm and resolve beforeunload before closing; Chrome can block tabs.remove after native UI is already visible. Closing may discard unsaved changes, so never infer authorization.",
    action: "browser.close_tab",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "authorization"],
    ),
  },
  {
    name: "invictum_set_control_identity",
    title: "Identify tab-controlling agent",
    description:
      "Optionally identify the agent using a tab. Call once per tab, for example with Codex, Cursor, or Claude. Without this tool the default remains 'AI agent is using this tab'.",
    action: "browser.set_control_identity",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        agentName: {
          type: "string",
          minLength: 1,
          maxLength: 40,
        },
      },
      ["tabId", "agentName"],
    ),
  },
  {
    name: "invictum_snapshot",
    title: "Semantic page snapshot",
    description:
      "Read a redacted semantic snapshot. Use scope with a fresh documentId/domRevision/elementId to return only that subtree and save tokens.",
    action: "browser.get_page_snapshot",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        detail: {
          type: "string",
          enum: ["minimal", "outline", "interactive", "semantic", "full"],
          default: "interactive",
        },
        includeHidden: { type: "boolean", default: false },
        maxElements: { type: "integer", minimum: 1, maximum: 5000 },
        maxDepth: { type: "integer", minimum: 1, maximum: 64 },
        maxTextLength: { type: "integer", minimum: 1000, maximum: 200000 },
        scope: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            domRevision: { type: "integer" },
            elementId: { type: "string" },
          },
          required: ["documentId", "domRevision", "elementId"],
          additionalProperties: false,
        },
      },
      ["tabId"],
    ),
  },
  {
    name: "invictum_get_page_text",
    title: "Read clean page text",
    description:
      "Return bounded clean text assembled from the Bridge's redacted semantic text blocks. Use scope to read one fresh revision-bound subtree and avoid large snapshots.",
    action: "browser.get_page_text",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        maxChars: { type: "integer", minimum: 1000, maximum: 200000, default: 50000 },
        format: { enum: ["text", "markdown"], default: "text" },
        scope: objectSchema(
          {
            documentId: { type: "string" },
            domRevision: { type: "integer", minimum: 0 },
            elementId: { type: "string" },
          },
          ["documentId", "domRevision", "elementId"],
        ),
      },
      ["tabId"],
    ),
  },
  {
    name: "invictum_find_elements",
    title: "Find semantic elements",
    description:
      "Find unambiguous elements against a fresh snapshot revision. Prefer role+name/label, then testId, then CSS.",
    action: "browser.find_elements",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "integer" },
        documentId: { type: "string" },
        domRevision: { type: "integer" },
        role: { type: "string" },
        name: { type: "string" },
        label: { type: "string" },
        text: { type: "string" },
        css: { type: "string" },
        testId: { type: "string" },
        tag: { type: "string" },
        matchMode: { type: "string", enum: ["exact", "contains", "starts_with"] },
        maxResults: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["tabId", "documentId", "domRevision"],
      additionalProperties: true,
    },
  },
  {
    name: "invictum_find_natural_language",
    title: "Find element naturally",
    description:
      "One-call deterministic semantic locator for queries such as 'Update button' or 'select all checkbox'. It returns ranked fresh element references without sending page content to another service.",
    action: "browser.find_natural_language",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        query: { type: "string", minLength: 2, maxLength: 500 },
        maxResults: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        includeHidden: { type: "boolean", default: false },
      },
      ["tabId", "query"],
    ),
  },
  {
    name: "invictum_click",
    title: "Click semantic element",
    description:
      "Preferred click path: click a fresh revision-bound semantic element. Submit/reset remains blocked.",
    action: "browser.click",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer" },
        documentId: { type: "string" },
        domRevision: { type: "integer" },
        elementId: { type: "string" },
        scrollIntoView: { type: "boolean", default: true },
      },
      ["tabId", "documentId", "domRevision", "elementId"],
    ),
  },
  {
    name: "invictum_type_text",
    title: "Type text",
    description:
      "Type into input, textarea, contenteditable/WYSIWYG, or a same-origin frame. Sensitive fields fail closed.",
    action: "browser.type_text",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer" },
        documentId: { type: "string" },
        domRevision: { type: "integer" },
        elementId: { type: "string" },
        text: { type: "string", maxLength: 10000 },
        mode: { type: "string", enum: ["replace", "append"], default: "replace" },
        dispatchChange: { type: "boolean", default: true },
      },
      ["tabId", "documentId", "domRevision", "elementId", "text"],
    ),
  },
  {
    name: "invictum_set_file_input_files",
    title: "Attach local files",
    description:
      "Attach one or more existing local files to a revision-bound <input type=file>. Requires an explicit user instruction; paths and filenames are never returned or audited. This sets the input only and does not submit the form.",
    action: "browser.set_file_input_files",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        documentId: { type: "string" },
        domRevision: { type: "integer", minimum: 0 },
        elementId: { type: "string" },
        filePaths: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          maxItems: 20,
        },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "documentId", "domRevision", "elementId", "filePaths", "authorization"],
    ),
  },
  {
    name: "invictum_select_option",
    title: "Select form option",
    description: "Select option values, labels, or indices using a fresh semantic reference.",
    action: "browser.select_option",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer" },
        documentId: { type: "string" },
        domRevision: { type: "integer" },
        elementId: { type: "string" },
        selection: {
          oneOf: [
            objectSchema({ values: { type: "array", items: { type: "string" } } }, ["values"]),
            objectSchema({ labels: { type: "array", items: { type: "string" } } }, ["labels"]),
            objectSchema({ indices: { type: "array", items: { type: "integer" } } }, ["indices"]),
          ],
        },
        dispatchChange: { type: "boolean", default: true },
      },
      ["tabId", "documentId", "domRevision", "elementId", "selection"],
    ),
  },
  {
    name: "invictum_check",
    title: "Check form control",
    description: "Check a revision-bound checkbox or radio control.",
    action: "browser.check",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer" },
        documentId: { type: "string" },
        domRevision: { type: "integer" },
        elementId: { type: "string" },
      },
      ["tabId", "documentId", "domRevision", "elementId"],
    ),
  },
  {
    name: "invictum_uncheck",
    title: "Uncheck form control",
    description: "Uncheck a revision-bound checkbox control.",
    action: "browser.uncheck",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer" },
        documentId: { type: "string" },
        domRevision: { type: "integer" },
        elementId: { type: "string" },
      },
      ["tabId", "documentId", "domRevision", "elementId"],
    ),
  },
  {
    name: "invictum_evaluate",
    title: "Evaluate constrained JavaScript",
    description:
      "Fallback expression evaluator with a strict safe grammar. It cannot access credentials, storage, network, navigation, click, submit, or dynamic code.",
    action: "browser.evaluate",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer" },
        expression: { type: "string", minLength: 1, maxLength: 20000 },
        mode: { type: "string", enum: ["read_only", "page_mutation"] },
        world: { type: "string", enum: ["ISOLATED", "MAIN"] },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "expression", "authorization"],
    ),
  },
  {
    name: "invictum_mutate_dom",
    title: "Mutate DOM and inline style",
    description:
      "Apply revision-bound text, attribute, inline CSS, sanitized HTML, or remove-element operations. Requires an explicit user instruction; prefer this over raw JavaScript.",
    action: "browser.mutate_dom",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        documentId: { type: "string" },
        domRevision: { type: "integer", minimum: 0 },
        elementId: { type: "string" },
        operations: {
          type: "array",
          minItems: 0,
          maxItems: 50,
          items: {
            oneOf: [
              objectSchema({ type: { const: "set_text" }, text: { type: "string" } }, [
                "type",
                "text",
              ]),
              objectSchema(
                {
                  type: { const: "set_attribute" },
                  name: { type: "string" },
                  value: { type: "string" },
                },
                ["type", "name", "value"],
              ),
              objectSchema({ type: { const: "remove_attribute" }, name: { type: "string" } }, [
                "type",
                "name",
              ]),
              objectSchema(
                {
                  type: { const: "set_style" },
                  property: { type: "string" },
                  value: { type: "string" },
                  priority: { type: "string", enum: ["", "important"], default: "" },
                },
                ["type", "property", "value"],
              ),
              objectSchema({ type: { const: "remove_style" }, property: { type: "string" } }, [
                "type",
                "property",
              ]),
              objectSchema(
                {
                  type: { const: "insert_html" },
                  position: {
                    type: "string",
                    enum: ["beforebegin", "afterbegin", "beforeend", "afterend"],
                  },
                  html: { type: "string" },
                },
                ["type", "position", "html"],
              ),
              objectSchema({ type: { const: "replace_children_html" }, html: { type: "string" } }, [
                "type",
                "html",
              ]),
              objectSchema({ type: { const: "remove_element" } }, ["type"]),
            ],
          },
        },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "documentId", "domRevision", "elementId", "operations", "authorization"],
    ),
  },
  {
    name: "invictum_inspect_element",
    title: "Inspect element internals",
    description:
      "Inspect redacted attributes, inline/computed styles, geometry, custom-element metadata, ancestry, direct/subtree/delegated event listeners, and bounded source excerpts.",
    action: "browser.inspect_element",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        documentId: { type: "string" },
        domRevision: { type: "integer", minimum: 0 },
        elementId: { type: "string" },
        computedStyleProperties: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 64,
        },
        includeEventListeners: { type: "boolean", default: true },
        includeDocumentListeners: { type: "boolean", default: true },
        listenerDepth: { type: "integer", minimum: 0, maximum: 5, default: 2 },
        maxListeners: { type: "integer", minimum: 1, maximum: 100, default: 40 },
        sourceExcerptChars: { type: "integer", minimum: 0, maximum: 4000, default: 1200 },
      },
      ["tabId", "documentId", "domRevision", "elementId"],
    ),
  },
  {
    name: "invictum_manage_css",
    title: "Inject or remove CSS",
    description:
      "Inject bounded CSS without external resource loads, or remove it by injectionId. All remaining injections are removed automatically on unlock.",
    action: "browser.manage_css",
    inputSchema: objectSchema(
      {
        operation: { type: "string", enum: ["add", "remove"] },
        tabId: { type: "integer", minimum: 0 },
        css: { type: "string", minLength: 1, maxLength: 100000 },
        origin: { type: "string", enum: ["AUTHOR", "USER"], default: "AUTHOR" },
        allFrames: { type: "boolean", default: false },
        injectionId: { type: "string", format: "uuid" },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["operation", "tabId", "authorization"],
    ),
  },
  {
    name: "invictum_observe_events",
    title: "Capture DOM events",
    description:
      "Start, read, or stop a bounded event capture. Values and sensitive keystrokes are redacted; scope can bind capture to one revision-bound subtree.",
    action: "browser.observe_events",
    inputSchema: objectSchema(
      {
        operation: { type: "string", enum: ["start", "read", "stop"] },
        tabId: { type: "integer", minimum: 0 },
        eventTypes: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 50,
        },
        scope: objectSchema(
          {
            documentId: { type: "string" },
            domRevision: { type: "integer", minimum: 0 },
            elementId: { type: "string" },
          },
          ["documentId", "domRevision", "elementId"],
        ),
        maxEvents: { type: "integer", minimum: 1, maximum: 500, default: 200 },
        captureId: { type: "string", format: "uuid" },
        clear: { type: "boolean", default: false },
      },
      ["operation", "tabId"],
    ),
  },
  {
    name: "invictum_execute_javascript",
    title: "Execute raw page JavaScript",
    description:
      "Last-resort explicitly authorized R3 JavaScript through a short-lived debugger session. Direct value/credential, cookie/storage, network, navigation, click/submit, dynamic-code, payment, OTP, and extension references fail closed; this is still not a security sandbox.",
    action: "browser.execute_javascript",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        source: { type: "string", minLength: 1, maxLength: 100000 },
        sourceType: {
          type: "string",
          enum: ["expression", "function_body"],
          default: "expression",
        },
        awaitPromise: { type: "boolean", default: true },
        userGesture: { type: "boolean", default: false },
        timeoutMs: { type: "integer", minimum: 100, maximum: 30000, default: 5000 },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "source", "authorization"],
    ),
  },
  {
    name: "invictum_page_api_request",
    title: "Call same-origin page API",
    description:
      "Explicitly authorized R3 request to the current page's own origin. Cookies stay inside the browser, credential headers cannot be supplied or returned, redirects are manual, response content is bounded/redacted, and an optional WordPress REST nonce is used without exposing it.",
    action: "browser.page_api_request",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        url: {
          type: "string",
          minLength: 1,
          maxLength: 4096,
          description: "Relative URL or same-origin absolute HTTP(S) URL.",
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
          default: "GET",
        },
        headers: objectSchema({
          accept: { type: "string", maxLength: 256 },
          contentType: { type: "string", enum: ["application/json", "text/plain"] },
          ifMatch: { type: "string", maxLength: 512 },
          ifNoneMatch: { type: "string", maxLength: 512 },
        }),
        body: {
          description:
            "Bounded JSON value or text body. It is never returned or written to audit logs.",
        },
        responseMode: {
          type: "string",
          enum: ["json", "text", "status_only"],
          default: "json",
        },
        maxResponseChars: {
          type: "integer",
          minimum: 1000,
          maximum: 500000,
          default: 100000,
        },
        useWordPressNonce: { type: "boolean", default: false },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "url", "authorization"],
    ),
  },
  {
    name: "invictum_console",
    title: "Browser console capture",
    description:
      "Start before the action under test, then read and stop in finally. Captures bounded console messages, uncaught exceptions, and browser log entries with secret redaction. This is the programmatic console; visible DevTools should remain closed.",
    action: "browser.console",
    inputSchema: objectSchema(
      {
        operation: { type: "string", enum: ["start", "read", "clear", "stop"] },
        tabId: { type: "integer", minimum: 0 },
        bufferSize: { type: "integer", minimum: 10, maximum: 500, default: 200 },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 200 },
        clear: { type: "boolean", default: false },
      },
      ["operation", "tabId"],
    ),
  },
  {
    name: "invictum_network",
    title: "Network metadata capture",
    description:
      "Start before the action under test, then read and stop in finally. Captures bounded request/response/failure metadata with query strings removed. It never captures headers, request bodies, response bodies, cookies, or credentials.",
    action: "browser.network",
    inputSchema: objectSchema(
      {
        operation: { type: "string", enum: ["start", "read", "clear", "stop"] },
        tabId: { type: "integer", minimum: 0 },
        bufferSize: { type: "integer", minimum: 20, maximum: 1000, default: 300 },
        limit: { type: "integer", minimum: 1, maximum: 1000, default: 300 },
        clear: { type: "boolean", default: false },
      },
      ["operation", "tabId"],
    ),
  },
  {
    name: "invictum_emulate_device",
    title: "Mobile preview",
    description:
      "Set/get/reset reversible mobile viewport and touch emulation without focusing the tab. Take a screenshot and test interactions while active; always reset in finally. This approximates Chrome Device Mode, not a physical phone.",
    action: "browser.emulate_device",
    inputSchema: objectSchema(
      {
        operation: { type: "string", enum: ["set", "get", "reset"] },
        tabId: { type: "integer", minimum: 0 },
        preset: {
          type: "string",
          enum: ["mobile_small", "mobile_medium", "mobile_large", "tablet", "custom"],
          default: "mobile_medium",
        },
        orientation: {
          type: "string",
          enum: ["portrait", "landscape"],
          default: "portrait",
        },
        width: { type: "integer", minimum: 240, maximum: 2560 },
        height: { type: "integer", minimum: 240, maximum: 2560 },
        deviceScaleFactor: { type: "number", minimum: 1, maximum: 4 },
        touch: { type: "boolean", default: true },
      },
      ["operation", "tabId"],
    ),
  },
  {
    name: "invictum_wait_for",
    title: "Wait for page condition",
    description:
      "Wait without agent polling for URL, title, selector, text, or a stable DOM revision.",
    action: "browser.wait_for",
    inputSchema: {
      type: "object",
      properties: {
        tabId: { type: "integer" },
        condition: {
          oneOf: [
            {
              type: "object",
              properties: {
                type: { enum: ["url", "title", "selector", "text"] },
                value: { type: "string" },
                match: { enum: ["exact", "contains"] },
                caseSensitive: { type: "boolean" },
              },
              required: ["type", "value"],
            },
            {
              type: "object",
              properties: {
                type: { const: "dom_stable" },
                stableMs: { type: "integer", minimum: 100, maximum: 10000 },
              },
              required: ["type"],
            },
          ],
        },
        timeoutMs: { type: "integer", minimum: 100, maximum: 120000 },
        pollIntervalMs: { type: "integer", minimum: 50, maximum: 2000 },
      },
      required: ["tabId", "condition"],
      additionalProperties: false,
    },
  },
  {
    name: "invictum_screenshot",
    title: "Capture or annotate page image",
    description:
      "Capture a bounded JPEG of the viewport, one revision-bound element, a CSS-pixel region, or the full page. Optional non-DOM annotations can outline elements/regions and add tutorial labels with arrows. For a tutorial image: use a fresh snapshot's documentId/domRevision and the target elementId, mode=element, then add an element annotation with label.text. Background tabs are supported; do not activate them merely to take a screenshot.",
    action: "browser.screenshot",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer" },
        quality: { type: "integer", minimum: 30, maximum: 90 },
        maxWidth: { type: "integer", minimum: 320, maximum: 2560 },
        maxHeight: { type: "integer", minimum: 240, maximum: 2560 },
        mode: { enum: ["viewport", "element", "region", "full_page"], default: "viewport" },
        documentId: {
          type: "string",
          description: "Required when mode or any annotation targets an element.",
        },
        domRevision: {
          type: "integer",
          minimum: 0,
          description: "Required when mode or any annotation targets an element.",
        },
        elementId: {
          type: "string",
          description: "Revision-bound element to crop when mode=element.",
        },
        padding: {
          type: "number",
          minimum: 0,
          maximum: 200,
          description: "CSS-pixel padding around an element crop.",
        },
        region: objectSchema(
          {
            x: { type: "number", minimum: 0 },
            y: { type: "number", minimum: 0 },
            width: { type: "number", exclusiveMinimum: 0 },
            height: { type: "number", exclusiveMinimum: 0 },
            coordinateSpace: { enum: ["viewport", "document"], default: "viewport" },
          },
          ["x", "y", "width", "height"],
        ),
        annotations: {
          type: "array",
          maxItems: 20,
          items: objectSchema(
            {
              target: {
                oneOf: [
                  objectSchema(
                    {
                      type: { const: "element" },
                      elementId: { type: "string" },
                      padding: { type: "number", minimum: 0, maximum: 200 },
                    },
                    ["type", "elementId"],
                  ),
                  objectSchema(
                    {
                      type: { const: "region" },
                      region: objectSchema(
                        {
                          x: { type: "number", minimum: 0 },
                          y: { type: "number", minimum: 0 },
                          width: { type: "number", exclusiveMinimum: 0 },
                          height: { type: "number", exclusiveMinimum: 0 },
                          coordinateSpace: {
                            enum: ["viewport", "document"],
                            default: "viewport",
                          },
                        },
                        ["x", "y", "width", "height"],
                      ),
                    },
                    ["type", "region"],
                  ),
                ],
              },
              shape: {
                enum: ["rectangle", "rounded_rectangle", "ellipse", "circle", "highlight"],
                default: "rounded_rectangle",
              },
              stroke: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", default: "#ef4444" },
              strokeWidth: { type: "integer", minimum: 1, maximum: 16, default: 4 },
              fill: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
              fillOpacity: { type: "number", minimum: 0, maximum: 1, default: 0.12 },
              label: objectSchema(
                {
                  text: { type: "string", minLength: 1, maxLength: 200 },
                  position: {
                    enum: ["auto", "top", "bottom", "left", "right"],
                    default: "auto",
                  },
                  color: {
                    type: "string",
                    pattern: "^#[0-9a-fA-F]{6}$",
                    default: "#ffffff",
                  },
                  background: {
                    type: "string",
                    pattern: "^#[0-9a-fA-F]{6}$",
                    default: "#ef4444",
                  },
                  fontSize: { type: "integer", minimum: 10, maximum: 48, default: 18 },
                  arrow: { type: "boolean", default: true },
                },
                ["text"],
              ),
            },
            ["target"],
          ),
        },
      },
      ["tabId"],
    ),
  },
  {
    name: "invictum_click_at",
    title: "Coordinate fallback click",
    description:
      "Last-resort synthetic viewport click tied to the documentId/domRevision from a fresh screenshot. Cannot submit/reset forms.",
    action: "browser.click_at",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer" },
        documentId: { type: "string" },
        domRevision: { type: "integer" },
        x: { type: "number", minimum: 0 },
        y: { type: "number", minimum: 0 },
      },
      ["tabId", "documentId", "domRevision", "x", "y"],
    ),
  },
  {
    name: "invictum_perform_gesture",
    title: "Perform advanced page gesture",
    description:
      "Perform a revision-bound hover, focus, blur, safe key press, scroll, or drag-and-drop gesture. Submit/reset remains blocked. Use semantic click/type/select first, and take a fresh snapshot after the gesture.",
    action: "browser.perform_gesture",
    inputSchema: objectSchema(
      {
        operation: {
          type: "string",
          enum: [
            "hover",
            "focus",
            "blur",
            "double_click",
            "context_click",
            "press_key",
            "scroll_into_view",
            "scroll_by",
            "scroll_to",
            "drag_and_drop",
          ],
        },
        tabId: { type: "integer", minimum: 0 },
        documentId: { type: "string" },
        domRevision: { type: "integer", minimum: 0 },
        elementId: { type: "string" },
        targetElementId: { type: "string" },
        key: { type: "string", minLength: 1, maxLength: 64 },
        code: { type: "string", pattern: "^[A-Za-z0-9]+$", maxLength: 64 },
        ctrl: { type: "boolean", default: false },
        alt: { type: "boolean", default: false },
        meta: { type: "boolean", default: false },
        shift: { type: "boolean", default: false },
        steps: { type: "integer", minimum: 2, maximum: 50, default: 10 },
        deltaX: { type: "number", minimum: -100000, maximum: 100000, default: 0 },
        deltaY: { type: "number", minimum: -100000, maximum: 100000, default: 0 },
        x: { type: "number", minimum: 0, maximum: 10000000, default: 0 },
        y: { type: "number", minimum: 0, maximum: 10000000, default: 0 },
      },
      ["operation", "tabId", "documentId", "domRevision"],
    ),
  },
  {
    name: "invictum_print_to_pdf",
    title: "Export page as PDF",
    description:
      "Export the current normal HTTP(S) page as a bounded PDF without activating the tab. Supports A4, Letter, and Legal paper, page ranges, background graphics, margins, scale, and landscape mode.",
    action: "browser.print_to_pdf",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        landscape: { type: "boolean", default: false },
        printBackground: { type: "boolean", default: true },
        scale: { type: "number", minimum: 0.5, maximum: 2, default: 1 },
        paperSize: { type: "string", enum: ["a4", "letter", "legal"], default: "a4" },
        marginTop: { type: "number", minimum: 0, maximum: 2, default: 0.4 },
        marginBottom: { type: "number", minimum: 0, maximum: 2, default: 0.4 },
        marginLeft: { type: "number", minimum: 0, maximum: 2, default: 0.4 },
        marginRight: { type: "number", minimum: 0, maximum: 2, default: 0.4 },
        pageRanges: { type: "string", maxLength: 256, default: "" },
        preferCssPageSize: { type: "boolean", default: false },
      },
      ["tabId"],
    ),
  },
  {
    name: "invictum_get_wordpress_menu",
    title: "Read WordPress menu tree",
    description:
      "Read a bounded classic WordPress Appearance > Menus tree with stable item IDs, parent/depth/order, labels and sanitized URLs. Call before editing and again after a saved reload.",
    action: "browser.get_wordpress_menu",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        maxItems: { type: "integer", minimum: 1, maximum: 500, default: 250 },
      },
      ["tabId"],
    ),
  },
  {
    name: "invictum_edit_wordpress_menu",
    title: "Edit WordPress menu",
    description:
      "Typed classic WordPress menu editor: add custom links, update labels/settings, remove an item or subtree, and move complete subtrees without drag coordinates. Set save=true only when the user explicitly asked to persist; verify after reload.",
    action: "browser.edit_wordpress_menu",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        documentId: { type: "string" },
        domRevision: { type: "integer", minimum: 0 },
        operations: {
          type: "array",
          minItems: 0,
          maxItems: 100,
          items: {
            oneOf: [
              objectSchema(
                {
                  type: { const: "add_custom" },
                  label: { type: "string", minLength: 1, maxLength: 1000 },
                  url: { type: "string", minLength: 1, maxLength: 4096 },
                  destination: {
                    oneOf: [
                      objectSchema(
                        { placement: { type: "string", enum: ["root_start", "root_end"] } },
                        ["placement"],
                      ),
                      objectSchema(
                        {
                          placement: {
                            type: "string",
                            enum: ["before", "after", "inside_start", "inside_end"],
                          },
                          targetItemId: { type: "string", pattern: "^-?\\d+$" },
                        },
                        ["placement", "targetItemId"],
                      ),
                    ],
                  },
                  titleAttribute: { type: "string", maxLength: 1000, default: "" },
                  cssClasses: { type: "string", maxLength: 1000, default: "" },
                  description: { type: "string", maxLength: 4000, default: "" },
                  openInNewTab: { type: "boolean", default: false },
                },
                ["type", "label", "url"],
              ),
              objectSchema(
                {
                  type: { const: "update" },
                  itemId: { type: "string", pattern: "^-?\\d+$" },
                  label: { type: "string", minLength: 1, maxLength: 1000 },
                  url: { type: "string", minLength: 1, maxLength: 4096 },
                  titleAttribute: { type: "string", maxLength: 1000 },
                  cssClasses: { type: "string", maxLength: 1000 },
                  description: { type: "string", maxLength: 4000 },
                  openInNewTab: { type: "boolean" },
                },
                ["type", "itemId"],
              ),
              objectSchema(
                {
                  type: { const: "remove" },
                  itemId: { type: "string", pattern: "^-?\\d+$" },
                  includeChildren: { type: "boolean", default: false },
                },
                ["type", "itemId"],
              ),
              objectSchema(
                {
                  type: { const: "move" },
                  itemId: { type: "string", pattern: "^-?\\d+$" },
                  destination: {
                    oneOf: [
                      objectSchema(
                        { placement: { type: "string", enum: ["root_start", "root_end"] } },
                        ["placement"],
                      ),
                      objectSchema(
                        {
                          placement: {
                            type: "string",
                            enum: ["before", "after", "inside_start", "inside_end"],
                          },
                          targetItemId: { type: "string", pattern: "^-?\\d+$" },
                        },
                        ["placement", "targetItemId"],
                      ),
                    ],
                  },
                },
                ["type", "itemId", "destination"],
              ),
            ],
          },
        },
        save: { type: "boolean", default: false },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "documentId", "domRevision", "operations", "authorization"],
    ),
  },
  {
    name: "invictum_get_wordpress_admin",
    title: "Read WordPress admin screen",
    description:
      "Read bounded wp-admin context, notices, editor kind, and the current WordPress list table with stable row IDs and available row/bulk action keys. Use before list-table actions.",
    action: "browser.get_wordpress_admin",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        maxRows: { type: "integer", minimum: 1, maximum: 250, default: 50 },
        maxCellText: { type: "integer", minimum: 50, maximum: 4000, default: 500 },
      },
      ["tabId"],
    ),
  },
  {
    name: "invictum_wordpress_list_table_action",
    title: "Act on WordPress admin rows",
    description:
      "Revision-bound typed wp-admin list-table action. Open an advertised row action or apply an advertised bulk action to exact row IDs. Destructive keys remain explicit and every result requires verification.",
    action: "browser.wordpress_list_table_action",
    inputSchema: {
      oneOf: [
        objectSchema(
          {
            tabId: { type: "integer", minimum: 0 },
            documentId: { type: "string" },
            domRevision: { type: "integer", minimum: 0 },
            operation: { const: "open_row_action" },
            rowId: { type: "string", minLength: 1, maxLength: 512 },
            actionKey: {
              type: "string",
              minLength: 1,
              maxLength: 128,
              pattern: "^[A-Za-z0-9_.:-]+$",
            },
            authorization: {
              type: "object",
              properties: {
                source: { const: "explicit_user_instruction" },
                instructionId: { type: "string" },
              },
              required: ["source", "instructionId"],
              additionalProperties: false,
            },
          },
          [
            "tabId",
            "documentId",
            "domRevision",
            "operation",
            "rowId",
            "actionKey",
            "authorization",
          ],
        ),
        objectSchema(
          {
            tabId: { type: "integer", minimum: 0 },
            documentId: { type: "string" },
            domRevision: { type: "integer", minimum: 0 },
            operation: { const: "apply_bulk" },
            rowIds: {
              type: "array",
              minItems: 1,
              maxItems: 250,
              items: { type: "string", minLength: 1, maxLength: 512 },
            },
            actionKey: { type: "string", minLength: 1, maxLength: 128 },
            authorization: {
              type: "object",
              properties: {
                source: { const: "explicit_user_instruction" },
                instructionId: { type: "string" },
              },
              required: ["source", "instructionId"],
              additionalProperties: false,
            },
          },
          [
            "tabId",
            "documentId",
            "domRevision",
            "operation",
            "rowIds",
            "actionKey",
            "authorization",
          ],
        ),
      ],
    },
  },
  {
    name: "invictum_get_wordpress_editor",
    title: "Read WordPress post editor",
    description:
      "Read the authoritative Gutenberg data-store or Classic editor model, including content, status, taxonomy IDs and save state. This avoids visually typing into a mirror/code editor whose value WordPress would discard.",
    action: "browser.get_wordpress_editor",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        maxContentChars: {
          type: "integer",
          minimum: 1000,
          maximum: 500000,
          default: 100000,
        },
      },
      ["tabId"],
    ),
  },
  {
    name: "invictum_edit_wordpress_editor",
    title: "Edit WordPress post model",
    description:
      "Typed Gutenberg/Classic editor update against a fresh document revision. Updates WordPress' authoritative model rather than cosmetic DOM. Default save=false supports review; status=publish only publishes when save=true and explicitly authorized.",
    action: "browser.edit_wordpress_editor",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        documentId: { type: "string" },
        domRevision: { type: "integer", minimum: 0 },
        fields: objectSchema({
          title: { type: "string", maxLength: 20000 },
          content: { type: "string", maxLength: 500000 },
          excerpt: { type: "string", maxLength: 50000 },
          slug: { type: "string", maxLength: 1000 },
          status: {
            type: "string",
            enum: ["draft", "pending", "private", "publish", "future"],
          },
          categoryIds: {
            type: "array",
            maxItems: 500,
            items: { type: "integer", minimum: 0 },
          },
          tagIds: {
            type: "array",
            maxItems: 500,
            items: { type: "integer", minimum: 0 },
          },
          featuredMediaId: {
            oneOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
          },
          authorId: { type: "integer", minimum: 1 },
          parentId: { type: "integer", minimum: 0 },
          menuOrder: { type: "integer", minimum: -100000, maximum: 100000 },
          commentStatus: { type: "string", enum: ["open", "closed"] },
          pingStatus: { type: "string", enum: ["open", "closed"] },
        }),
        save: { type: "boolean", default: false },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "documentId", "domRevision", "fields", "authorization"],
    ),
  },
  {
    name: "invictum_submit_form",
    title: "Submit form",
    description:
      "Submit only when the user explicitly instructed it. Provide the stable user-instruction ID; no redundant confirmation is added.",
    action: "browser.submit_form",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer" },
        documentId: { type: "string" },
        domRevision: { type: "integer" },
        elementId: { type: "string" },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "documentId", "domRevision", "elementId", "authorization"],
    ),
  },
  {
    name: "invictum_unlock_tab",
    title: "Release tab reservation",
    description: "Always call in finally after a browser task. User Stop remains fail-closed.",
    action: "browser.unlock_tab",
    inputSchema: objectSchema({ tabId: { type: "integer", minimum: 0 } }, ["tabId"]),
  },
  {
    name: "invictum_get_http_auth_state",
    title: "Detect HTTP authentication",
    description:
      "Read a recent sanitized HTTP authentication challenge for a tab. Returns scheme/realm/origin, never credentials.",
    action: "browser.get_http_auth_state",
    inputSchema: objectSchema({ tabId: { type: "integer", minimum: 0 } }, ["tabId"]),
  },
  {
    name: "invictum_authenticate_http",
    title: "HTTP Basic authentication",
    description:
      "Use user-supplied credentials for one explicitly authorized HTTP Basic challenge. Credentials are ephemeral and are never returned or audited.",
    action: "browser.authenticate_http",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        username: { type: "string", minLength: 1 },
        password: { type: "string", minLength: 1 },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 30000 },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "username", "password", "authorization"],
    ),
  },
  {
    name: "invictum_handle_beforeunload",
    title: "Resolve unsaved-changes navigation block",
    description:
      "Arm Chrome's native 'Leave site?' / WordPress beforeunload handler before navigation. Supply navigateUrl for reliable handling; omitting it is best-effort recovery only because Chrome may block late debugger attachment after the modal is visible. decision=leave may discard unsaved changes; decision=stay preserves the page. Never guess leave.",
    action: "browser.handle_javascript_dialog",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        decision: {
          type: "string",
          enum: ["leave", "stay"],
          description:
            "leave continues navigation and may discard changes; stay cancels navigation and preserves the current page.",
        },
        timeoutMs: { type: "integer", minimum: 100, maximum: 30000 },
        navigateUrl: {
          type: "string",
          format: "uri",
          description:
            "Recommended credential-free HTTP(S) destination. The handler is armed before navigation.",
        },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "decision", "authorization"],
    ),
  },
  {
    name: "invictum_handle_javascript_dialog",
    title: "Handle native JavaScript dialog",
    description:
      "Explicitly accept or dismiss alert/confirm/prompt/beforeunload. Arm before the click/navigation that opens it. trigger={type:'none'} is best-effort only after browser-native UI is visible because Chrome can block late debugger attachment. For WordPress 'Leave site?' use invictum_handle_beforeunload with navigateUrl.",
    action: "browser.handle_javascript_dialog",
    inputSchema: objectSchema(
      {
        tabId: { type: "integer", minimum: 0 },
        accept: { type: "boolean" },
        promptText: { type: "string", maxLength: 2000 },
        timeoutMs: { type: "integer", minimum: 100, maximum: 30000 },
        trigger: {
          oneOf: [
            objectSchema({ type: { const: "none" } }, ["type"]),
            objectSchema(
              {
                type: { const: "click" },
                documentId: { type: "string" },
                domRevision: { type: "integer", minimum: 0 },
                elementId: { type: "string" },
                scrollIntoView: { type: "boolean", default: true },
              },
              ["type", "documentId", "domRevision", "elementId"],
            ),
            objectSchema({ type: { const: "navigate" }, url: { type: "string", format: "uri" } }, [
              "type",
              "url",
            ]),
          ],
        },
        authorization: {
          type: "object",
          properties: {
            source: { const: "explicit_user_instruction" },
            instructionId: { type: "string" },
          },
          required: ["source", "instructionId"],
          additionalProperties: false,
        },
      },
      ["tabId", "accept", "authorization"],
    ),
  },
  {
    name: "invictum_batch",
    title: "Run browser action batch",
    description:
      "Run up to 25 IBP actions sequentially in one MCP call. Every step still passes through normal validation, reservation, policy, and audit. Later parameters may reference exact prior values with $steps.<id>.<path> or $last.<path>. Nested batches are forbidden.",
    inputSchema: objectSchema(
      {
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 25,
          items: objectSchema(
            {
              id: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" },
              action: { type: "string", minLength: 3, maxLength: 128 },
              parameters: { type: "object", additionalProperties: true },
              idempotencyKey: IDEMPOTENCY_KEY_SCHEMA,
              when: objectSchema(
                {
                  value: {
                    description:
                      "A $steps.<id>.<path> or $last.<path> placeholder evaluated before this step.",
                  },
                  equals: {},
                },
                ["value", "equals"],
              ),
              retry: objectSchema({
                attempts: { type: "integer", minimum: 1, maximum: 3, default: 1 },
                delayMs: { type: "integer", minimum: 0, maximum: 5_000, default: 100 },
              }),
            },
            ["id", "action"],
          ),
        },
        continueOnError: { type: "boolean", default: false },
      },
      ["steps"],
    ),
  },
  {
    name: "invictum_end_session",
    title: "Release all session tabs",
    description:
      "Best-effort release of every tab tracked for this MCP session. Call once at task completion.",
    inputSchema: objectSchema(),
  },
  {
    name: "invictum_call",
    title: "Advanced IBP call",
    description:
      "Escape hatch for any action reported by invictum_capabilities, including select/check/uncheck/evaluate. Never use it to bypass policy.",
    inputSchema: objectSchema(
      {
        action: { type: "string" },
        parameters: { type: "object", additionalProperties: true },
        idempotencyKey: IDEMPOTENCY_KEY_SCHEMA,
        dryRun: { type: "boolean", default: false },
        postSnapshot: { enum: ["outline", "interactive"] },
        domDelta: { type: "boolean", default: false },
        verify: VERIFY_SCHEMA,
        timings: {
          type: "boolean",
          default: false,
          description:
            "Include compact baseline/action/verify/snapshot/total timing diagnostics in the result.",
        },
      },
      ["action"],
    ),
  },
];

const augmentObjectSchema = (
  schema: Record<string, unknown>,
  additions: Record<string, unknown>,
  optionalAuthorization: boolean,
): Record<string, unknown> => {
  if (Array.isArray(schema["oneOf"])) {
    return {
      ...schema,
      oneOf: schema["oneOf"].map((branch) =>
        isRecord(branch) ? augmentObjectSchema(branch, additions, optionalAuthorization) : branch,
      ),
    };
  }
  if (schema["type"] !== "object") return schema;
  const properties = isRecord(schema["properties"]) ? schema["properties"] : {};
  const required = Array.isArray(schema["required"])
    ? schema["required"].filter(
        (key): key is string =>
          typeof key === "string" && !(optionalAuthorization && key === "authorization"),
      )
    : [];
  return {
    ...schema,
    properties: { ...properties, ...additions },
    ...(required.length === 0 ? { required: [] } : { required }),
  };
};

const annotationsFor = (tool: ToolDefinition): ToolAnnotations => {
  if (tool.annotations !== undefined) return tool.annotations;
  const metadata = tool.action === undefined ? undefined : getActionMetadata(tool.action);
  return {
    title: tool.title,
    readOnlyHint: metadata?.readOnly ?? false,
    destructiveHint:
      metadata === undefined
        ? true
        : metadata.destructive || metadata.riskLevel === "R2" || metadata.riskLevel === "R3",
    idempotentHint: metadata?.idempotent ?? false,
    openWorldHint: tool.action?.startsWith("browser.") ?? false,
  };
};

const listedTool = (tool: ToolDefinition): Record<string, unknown> => {
  const metadata = tool.action === undefined ? undefined : getActionMetadata(tool.action);
  const additions: Record<string, unknown> = {};
  if (metadata !== undefined && !metadata.readOnly) {
    additions["idempotencyKey"] = IDEMPOTENCY_KEY_SCHEMA;
    additions["dryRun"] = {
      type: "boolean",
      default: false,
      description: "Return a redacted execution preview without performing the browser mutation.",
    };
    additions["postSnapshot"] = {
      enum: ["outline", "interactive"],
      description: "After success, return a fresh bounded snapshot in the same tool result.",
    };
    additions["domDelta"] = {
      type: "boolean",
      default: false,
      description:
        "After success, return a bounded semantic element delta against the most recent snapshot seen in this MCP session.",
    };
    additions["verify"] = VERIFY_SCHEMA;
    additions["timings"] = {
      type: "boolean",
      default: false,
      description:
        "Include compact baseline/action/verify/snapshot/total timing diagnostics in the result.",
    };
  }
  if (tool.action === "browser.screenshot") additions["autoMarks"] = AUTO_MARKS_SCHEMA;
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: augmentObjectSchema(
      tool.inputSchema,
      additions,
      metadata?.requiresAuthorization ?? false,
    ),
    annotations: annotationsFor(tool),
  };
};

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

let daemonReady: Promise<void> | undefined;
const ensureDaemon = async (): Promise<void> => {
  daemonReady ??= (async () => {
    let health: Record<string, unknown> | undefined;
    try {
      health = await client.health();
    } catch {
      const desktopEntry = fileURLToPath(new URL("../../desktop/dist/index.js", import.meta.url));
      const child = spawn(process.execPath, [desktopEntry], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: process.env,
      });
      child.unref();
      for (let attempt = 0; attempt < 50; attempt += 1) {
        await sleep(100);
        try {
          health = await client.health();
          break;
        } catch {
          // Keep waiting while the desktop authority binds and Chrome reconnects.
        }
      }
      if (health === undefined) {
        throw new Error("Invictum desktop authority did not start within 5 seconds");
      }
    }
    if (health["nativeConnected"] === true) return;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await sleep(200);
      health = await client.health();
      if (health["nativeConnected"] === true) return;
    }
    throw new ControlError(
      "NATIVE_HOST_UNAVAILABLE",
      "Desktop Authority is running, but Chrome did not reconnect within 10 seconds. Reload the unpacked extension once and retry.",
      true,
    );
  })();
  const pending = daemonReady;
  try {
    await pending;
  } finally {
    if (daemonReady === pending) daemonReady = undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const send = (message: unknown): void => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

let clientSupportsElicitation = false;
let nextServerRequestId = 1_000_000;
const parsedElicitationTimeoutMs = Number(
  process.env["INVICTUM_MCP_ELICITATION_TIMEOUT_MS"] ?? "15000",
);
const elicitationTimeoutMs =
  Number.isInteger(parsedElicitationTimeoutMs) &&
  parsedElicitationTimeoutMs >= 100 &&
  parsedElicitationTimeoutMs <= 120_000
    ? parsedElicitationTimeoutMs
    : 15_000;
const pendingServerRequests = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

const sendClientRequest = async (
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> => {
  const id = nextServerRequestId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingServerRequests.delete(id);
      reject(new Error(`MCP client did not answer ${method} within ${elicitationTimeoutMs} ms`));
    }, elicitationTimeoutMs);
    pendingServerRequests.set(id, { resolve, reject, timeout });
    send({ jsonrpc: "2.0", id, method, params });
  });
};

const elicitedAuthorization = async (
  action: string,
  metadata: ActionMetadata,
): Promise<Record<string, unknown> | undefined> => {
  if (!clientSupportsElicitation) return undefined;
  let response: unknown;
  try {
    response = await sendClientRequest("elicitation/create", {
      message: `${action} is a ${metadata.riskLevel} browser action${metadata.destructive ? " that may have a destructive or externally visible effect" : ""}. Approve this exact action?`,
      requestedSchema: {
        type: "object",
        properties: {
          approved: {
            type: "boolean",
            title: "Approve action",
            description:
              "Approve only if the displayed browser action matches the user's current request.",
          },
        },
        required: ["approved"],
      },
    });
  } catch {
    throw new ControlError(
      "CONFIRMATION_REQUIRED",
      `${action} still requires explicit user authorization because the MCP client did not complete confirmation`,
      false,
      {
        action,
        riskLevel: metadata.riskLevel,
        elicitation: "unavailable_or_timed_out",
        timeoutMs: elicitationTimeoutMs,
        recovery:
          "Retry with the authorization object only when the user's current instruction explicitly approves this exact effect.",
      },
    );
  }
  if (
    !isRecord(response) ||
    response["action"] !== "accept" ||
    !isRecord(response["content"]) ||
    response["content"]["approved"] !== true
  ) {
    throw new ControlError("CONFIRMATION_REQUIRED", `The user did not approve ${action}`, false, {
      action,
      riskLevel: metadata.riskLevel,
      elicitation: "declined_or_cancelled",
    });
  }
  return {
    source: "explicit_user_instruction",
    instructionId: `mcp-elicit-${randomUUID()}`,
  };
};

const toolResult = (data: unknown): Record<string, unknown> => {
  if (isRecord(data) && typeof data["dataUrl"] === "string") {
    const dataUrl = data["dataUrl"];
    const comma = dataUrl.indexOf(",");
    const metadata = { ...data };
    delete metadata["dataUrl"];
    if (data["mediaType"] === "application/pdf") {
      return {
        content: [
          {
            type: "resource",
            resource: {
              uri: `invictum://pdf/${String(data["pdfId"] ?? "export")}`,
              mimeType: "application/pdf",
              blob: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
            },
          },
          { type: "text", text: JSON.stringify(metadata) },
        ],
        structuredContent: metadata,
        isError: false,
      };
    }
    return {
      content: [
        {
          type: "image",
          data: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
          mimeType: data["mediaType"] ?? "image/jpeg",
        },
        { type: "text", text: JSON.stringify(metadata) },
      ],
      structuredContent: metadata,
      isError: false,
    };
  }
  const structuredContent = isRecord(data) ? data : { result: data };
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent,
    isError: false,
  };
};

interface CachedElementReference {
  elementId: string;
  frameId: string;
  role: string;
  name: string;
  tag: string;
  css?: string;
}

const elementReferences = new Map<string, CachedElementReference>();
interface CachedSnapshotState {
  documentId: string;
  domRevision: number;
  detail?: "minimal" | "outline" | "interactive" | "semantic" | "full";
  elements: Map<string, CachedSemanticElement>;
}
interface CachedSemanticElement {
  elementId: string;
  signature: string;
}
const snapshotStates = new Map<number, CachedSnapshotState>();

const semanticElementCss = (element: Readonly<Record<string, unknown>>): string | undefined => {
  const selectors = isRecord(element["selectors"]) ? element["selectors"] : undefined;
  return typeof selectors?.["css"] === "string"
    ? selectors["css"]
    : typeof element["css"] === "string"
      ? element["css"]
      : undefined;
};

const semanticElementSignature = (element: Readonly<Record<string, unknown>>): string =>
  JSON.stringify({
    tag: element["tag"],
    role: element["role"],
    name: element["name"],
    text: element["text"],
    editable: element["editable"],
    clickable: element["clickable"],
    checked: element["checked"],
    selected: element["selected"],
    enabled: element["enabled"],
  });

const semanticElementMap = (
  rawElements: ReadonlyArray<Readonly<Record<string, unknown>>>,
): Map<string, CachedSemanticElement> => {
  const occurrences = new Map<string, number>();
  return new Map(
    rawElements
      .filter((element) => typeof element["elementId"] === "string")
      .map((element, index) => {
        const frameId = typeof element["frameId"] === "string" ? element["frameId"] : "top";
        const css = semanticElementCss(element);
        const baseKey =
          css === undefined
            ? `fallback:${frameId}:${String(element["tag"] ?? "")}:${String(element["role"] ?? "")}:${String(element["name"] ?? "")}:${index}`
            : `css:${frameId}:${css}`;
        const occurrence = occurrences.get(baseKey) ?? 0;
        occurrences.set(baseKey, occurrence + 1);
        return [
          `${baseKey}:${occurrence}`,
          {
            elementId: element["elementId"] as string,
            signature: semanticElementSignature(element),
          },
        ];
      }),
  );
};

const referenceFrom = (element: unknown): CachedElementReference | undefined => {
  if (
    !isRecord(element) ||
    typeof element["elementId"] !== "string" ||
    typeof element["frameId"] !== "string" ||
    typeof element["role"] !== "string" ||
    typeof element["name"] !== "string" ||
    typeof element["tag"] !== "string"
  ) {
    return undefined;
  }
  const selectors = isRecord(element["selectors"]) ? element["selectors"] : undefined;
  const css =
    typeof selectors?.["css"] === "string"
      ? selectors["css"]
      : typeof element["css"] === "string"
        ? element["css"]
        : undefined;
  return {
    elementId: element["elementId"],
    frameId: element["frameId"],
    role: element["role"],
    name: element["name"],
    tag: element["tag"],
    ...(css === undefined ? {} : { css }),
  };
};

const cacheElementResult = (
  action: string,
  parameters: Readonly<Record<string, unknown>>,
  data: unknown,
): void => {
  const tabId =
    typeof parameters["tabId"] === "number"
      ? parameters["tabId"]
      : isRecord(data) && isRecord(data["tab"]) && typeof data["tab"]["tabId"] === "number"
        ? data["tab"]["tabId"]
        : undefined;
  if (tabId === undefined || !isRecord(data)) return;
  const rawElements =
    action === "browser.get_page_snapshot"
      ? Array.isArray(data["elements"])
        ? data["elements"]
        : Array.isArray(data["outline"])
          ? data["outline"]
          : []
      : action === "browser.find_elements" || action === "browser.find_natural_language"
        ? Array.isArray(data["matches"])
          ? data["matches"].map((match) => (isRecord(match) ? match["element"] : undefined))
          : []
        : [];
  if (
    action === "browser.get_page_snapshot" &&
    isRecord(data["metadata"]) &&
    typeof data["metadata"]["documentId"] === "string" &&
    typeof data["metadata"]["domRevision"] === "number"
  ) {
    const rawDetail = data["metadata"]["detail"];
    const detail =
      rawDetail === "minimal" ||
      rawDetail === "outline" ||
      rawDetail === "interactive" ||
      rawDetail === "semantic" ||
      rawDetail === "full"
        ? rawDetail
        : undefined;
    snapshotStates.set(tabId, {
      documentId: data["metadata"]["documentId"],
      domRevision: data["metadata"]["domRevision"],
      ...(detail === undefined ? {} : { detail }),
      elements: semanticElementMap(rawElements.filter(isRecord)),
    });
  }
  for (const rawElement of rawElements) {
    const reference = referenceFrom(rawElement);
    if (reference !== undefined) {
      elementReferences.set(`${tabId}:${reference.elementId}`, reference);
    }
  }
  if (
    typeof parameters["elementId"] === "string" &&
    typeof data["resolvedElementId"] === "string"
  ) {
    const previous = elementReferences.get(`${tabId}:${parameters["elementId"]}`);
    if (previous !== undefined) {
      const relocated = { ...previous, elementId: data["resolvedElementId"] };
      elementReferences.set(`${tabId}:${relocated.elementId}`, relocated);
    }
  }
};

const callWithSafeRelocation = async (
  action: string,
  parameters: Record<string, unknown>,
  options: { idempotencyKey?: string },
): Promise<unknown> => {
  try {
    const data = await client.call(action, parameters, options);
    cacheElementResult(action, parameters, data);
    return data;
  } catch (error) {
    const metadata = getActionMetadata(action);
    const tabId = parameters["tabId"];
    const elementId = parameters["elementId"];
    if (
      !(error instanceof ControlError) ||
      error.code !== "STALE_ELEMENT_REFERENCE" ||
      metadata === undefined ||
      metadata.riskLevel === "R2" ||
      metadata.riskLevel === "R3" ||
      typeof tabId !== "number" ||
      typeof elementId !== "string"
    ) {
      throw error;
    }
    const previous = elementReferences.get(`${tabId}:${elementId}`);
    if (previous === undefined) throw error;
    const snapshot = await client.call("browser.get_page_snapshot", {
      tabId,
      detail: "interactive",
      maxElements: 1_000,
      maxTextLength: 25_000,
    });
    cacheElementResult("browser.get_page_snapshot", { tabId }, snapshot);
    if (!isRecord(snapshot) || !isRecord(snapshot["metadata"])) throw error;
    const found = await client.call("browser.find_elements", {
      tabId,
      documentId: snapshot["metadata"]["documentId"],
      domRevision: snapshot["metadata"]["domRevision"],
      role: previous.role,
      name: previous.name,
      tag: previous.tag,
      frameId: previous.frameId,
      ...(previous.css === undefined ? {} : { css: previous.css }),
      matchMode: "exact",
      maxResults: 2,
    });
    cacheElementResult("browser.find_elements", { tabId }, found);
    if (!isRecord(found) || !Array.isArray(found["matches"]) || found["matches"].length !== 1) {
      throw new ControlError(
        "STALE_ELEMENT_REFERENCE",
        "The stale element could not be relocated uniquely; take a fresh snapshot and choose again",
        false,
        {
          action,
          tabId,
          previousElementId: elementId,
          candidateCount:
            isRecord(found) && Array.isArray(found["matches"]) ? found["matches"].length : 0,
        },
      );
    }
    const match = found["matches"][0];
    const relocated = isRecord(match) ? referenceFrom(match["element"]) : undefined;
    if (relocated === undefined) throw error;
    const retriedParameters = {
      ...parameters,
      documentId: found["documentId"],
      domRevision: found["domRevision"],
      elementId: relocated.elementId,
    };
    const relocationOptions =
      options.idempotencyKey === undefined
        ? options
        : {
            idempotencyKey: `relocated-${createHash("sha256")
              .update(options.idempotencyKey)
              .digest("hex")
              .slice(0, 48)}`,
          };
    const data = await client.call(action, retriedParameters, relocationOptions);
    cacheElementResult(action, retriedParameters, data);
    return isRecord(data) ? { ...data, automaticallyRelocated: true } : data;
  }
};

const actionTabId = (
  parameters: Readonly<Record<string, unknown>>,
  result: unknown,
): number | undefined => {
  if (typeof parameters["tabId"] === "number") return parameters["tabId"];
  if (isRecord(result) && isRecord(result["tab"]) && typeof result["tab"]["tabId"] === "number") {
    return result["tab"]["tabId"];
  }
  return undefined;
};

const semanticDelta = (
  previous: CachedSnapshotState | undefined,
  currentSnapshot: unknown,
): Record<string, unknown> | undefined => {
  if (
    previous === undefined ||
    !isRecord(currentSnapshot) ||
    !isRecord(currentSnapshot["metadata"])
  ) {
    return undefined;
  }
  const currentDocumentId = currentSnapshot["metadata"]["documentId"];
  const currentRevision = currentSnapshot["metadata"]["domRevision"];
  if (typeof currentDocumentId !== "string" || typeof currentRevision !== "number")
    return undefined;
  const representation = Array.isArray(currentSnapshot["elements"])
    ? currentSnapshot["elements"]
    : Array.isArray(currentSnapshot["outline"])
      ? currentSnapshot["outline"]
      : [];
  const current = semanticElementMap(representation.filter(isRecord));
  const documentChanged = previous.documentId !== currentDocumentId;
  const added = documentChanged
    ? [...current.values()].map(({ elementId }) => elementId)
    : [...current.entries()]
        .filter(([key]) => !previous.elements.has(key))
        .map(([, { elementId }]) => elementId);
  const removed = documentChanged
    ? [...previous.elements.values()].map(({ elementId }) => elementId)
    : [...previous.elements.entries()]
        .filter(([key]) => !current.has(key))
        .map(([, { elementId }]) => elementId);
  const changed = documentChanged
    ? []
    : [...current.entries()]
        .filter(([key, element]) => {
          const previousElement = previous.elements.get(key);
          return previousElement !== undefined && previousElement.signature !== element.signature;
        })
        .map(([, { elementId }]) => elementId);
  const limit = 100;
  return {
    previousDocumentId: previous.documentId,
    documentId: currentDocumentId,
    previousDomRevision: previous.domRevision,
    domRevision: currentRevision,
    documentChanged,
    addedCount: added.length,
    removedCount: removed.length,
    changedCount: changed.length,
    addedElementIds: added.slice(0, limit),
    removedElementIds: removed.slice(0, limit),
    changedElementIds: changed.slice(0, limit),
    truncated: added.length > limit || removed.length > limit || changed.length > limit,
  };
};

const redactedPreviewValue = (key: string, value: unknown, depth = 0): unknown => {
  if (depth > 5) return "[bounded]";
  if (
    /password|passwd|secret|token|credential|cookie|authorization|body|code|source|username|otp|one.?time|pin|card|cvv|text/iu.test(
      key,
    )
  ) {
    return "[redacted]";
  }
  if (/filepaths?/iu.test(key) && Array.isArray(value)) return `[${value.length} local file(s)]`;
  if (/url/iu.test(key) && typeof value === "string") {
    try {
      const url = new URL(value);
      url.username = "";
      url.password = "";
      if ([...url.searchParams.keys()].length > 0) url.search = "?[REDACTED]";
      if (url.hash.length > 0) url.hash = "#[REDACTED]";
      return url.toString();
    } catch {
      return "[redacted-url]";
    }
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactedPreviewValue(key, item, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactedPreviewValue(childKey, childValue, depth + 1),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 200) return `${value.slice(0, 197)}...`;
  return value;
};

const previewAction = async (
  action: string,
  parameters: Record<string, unknown>,
  metadata: ActionMetadata,
): Promise<Record<string, unknown>> => {
  const tabId = typeof parameters["tabId"] === "number" ? parameters["tabId"] : undefined;
  let page: unknown;
  let forms: unknown;
  if (tabId !== undefined) {
    try {
      const snapshot = await client.call("browser.get_page_snapshot", {
        tabId,
        detail: "interactive",
        maxElements: 300,
        maxTextLength: 10_000,
      });
      if (isRecord(snapshot)) {
        page = redactedPreviewValue("page", snapshot["page"]);
        forms = Array.isArray(snapshot["forms"])
          ? snapshot["forms"].slice(0, 20).map((form) =>
              isRecord(form)
                ? {
                    elementId: form["elementId"],
                    name: form["name"],
                    method: form["method"],
                    action: redactedPreviewValue("url", form["action"]),
                    fieldCount: Array.isArray(form["fieldElementIds"])
                      ? form["fieldElementIds"].length
                      : undefined,
                    sensitive: form["sensitive"],
                  }
                : form,
            )
          : undefined;
      }
    } catch {
      // Preview remains useful when the current page cannot be inspected.
    }
  }
  return {
    dryRun: true,
    executed: false,
    action,
    riskLevel: metadata.riskLevel,
    destructive: metadata.destructive,
    requiresAuthorization: metadata.requiresAuthorization,
    tabId,
    parameters: redactedPreviewValue("parameters", parameters),
    ...(page === undefined ? {} : { page }),
    ...(forms === undefined ? {} : { forms }),
    next: "Review this preview. To execute, repeat the same tool without dryRun and include explicit authorization when required.",
  };
};

const prepareAutomaticMarks = async (
  parameters: Record<string, unknown>,
  autoMarks: Record<string, unknown>,
): Promise<{
  parameters: Record<string, unknown>;
  marks: Record<string, unknown>[];
}> => {
  const tabId = parameters["tabId"];
  if (typeof tabId !== "number") throw new Error("autoMarks requires tabId");
  const mode = parameters["mode"] ?? "viewport";
  if (mode !== "viewport" && mode !== "full_page") {
    throw new Error("autoMarks supports viewport and full_page screenshot modes");
  }
  const snapshot = await client.call("browser.get_page_snapshot", {
    tabId,
    detail: "interactive",
    maxElements: 1_000,
    maxTextLength: 10_000,
  });
  if (
    !isRecord(snapshot) ||
    !isRecord(snapshot["metadata"]) ||
    !Array.isArray(snapshot["elements"])
  ) {
    throw new Error("Could not obtain an interactive snapshot for automatic marks");
  }
  const max =
    typeof autoMarks["max"] === "number"
      ? Math.max(1, Math.min(20, Math.trunc(autoMarks["max"])))
      : 12;
  const includeEditable = autoMarks["includeEditable"] !== false;
  const labelMode = autoMarks["label"] === "name" ? "name" : "number";
  const candidates = snapshot["elements"]
    .filter(
      (element): element is Record<string, unknown> =>
        isRecord(element) &&
        element["visible"] !== false &&
        element["enabled"] !== false &&
        element["sensitive"] !== true &&
        (element["clickable"] === true || (includeEditable && element["editable"] === true)) &&
        (mode === "full_page" || element["outsideViewport"] !== true) &&
        typeof element["elementId"] === "string",
    )
    .slice(0, max);
  const marks = candidates.map((element, index) => ({
    mark: index + 1,
    elementId: element["elementId"],
    role: element["role"],
    name: element["name"],
  }));
  const generatedAnnotations = candidates.map((element, index) => {
    const name =
      typeof element["name"] === "string" && element["name"].trim().length > 0
        ? element["name"].trim().slice(0, 80)
        : String(element["role"] ?? "control");
    return {
      target: { type: "element", elementId: element["elementId"], padding: 4 },
      shape: "rounded_rectangle",
      stroke: "#2563eb",
      strokeWidth: 3,
      fill: "#2563eb",
      fillOpacity: 0.08,
      label: {
        text: labelMode === "name" ? `${index + 1}. ${name}` : String(index + 1),
        position: "auto",
        color: "#ffffff",
        background: "#2563eb",
        fontSize: 16,
        arrow: true,
      },
    };
  });
  const existing = Array.isArray(parameters["annotations"]) ? parameters["annotations"] : [];
  if (existing.length + generatedAnnotations.length > 20) {
    throw new Error("Existing annotations plus autoMarks exceed the 20-annotation limit");
  }
  return {
    parameters: {
      ...parameters,
      documentId: snapshot["metadata"]["documentId"],
      domRevision: snapshot["metadata"]["domRevision"],
      annotations: [...existing, ...generatedAnnotations],
    },
    marks,
  };
};

const applyLegacyActionEnhancements = async (
  action: string,
  originalArguments: Record<string, unknown>,
): Promise<unknown> => {
  const metadata = getActionMetadata(action);
  const parameters = { ...originalArguments };
  const idempotencyKey =
    typeof parameters["idempotencyKey"] === "string" ? parameters["idempotencyKey"] : undefined;
  const dryRun = parameters["dryRun"] === true;
  const postSnapshot =
    parameters["postSnapshot"] === "outline" || parameters["postSnapshot"] === "interactive"
      ? parameters["postSnapshot"]
      : undefined;
  const wantsDomDelta = parameters["domDelta"] === true;
  const verify = isRecord(parameters["verify"]) ? parameters["verify"] : undefined;
  const autoMarks = isRecord(parameters["autoMarks"]) ? parameters["autoMarks"] : undefined;
  delete parameters["idempotencyKey"];
  delete parameters["dryRun"];
  delete parameters["postSnapshot"];
  delete parameters["domDelta"];
  delete parameters["verify"];
  delete parameters["autoMarks"];

  if (metadata !== undefined && dryRun) return previewAction(action, parameters, metadata);
  if (
    metadata?.requiresAuthorization &&
    !isRecord(parameters["authorization"]) &&
    clientSupportsElicitation
  ) {
    parameters["authorization"] = await elicitedAuthorization(action, metadata);
  }

  let marks: Record<string, unknown>[] | undefined;
  let actionParameters = parameters;
  if (action === "browser.screenshot" && autoMarks !== undefined) {
    const prepared = await prepareAutomaticMarks(parameters, autoMarks);
    actionParameters = prepared.parameters;
    marks = prepared.marks;
  }

  const data = await callWithSafeRelocation(action, actionParameters, { idempotencyKey });
  const tabId = actionTabId(actionParameters, data);
  const previousSnapshot = tabId === undefined ? undefined : snapshotStates.get(tabId);
  let snapshot: unknown;
  let verification: unknown;
  let domDelta: Record<string, unknown> | undefined;
  if ((postSnapshot !== undefined || wantsDomDelta) && tabId !== undefined) {
    const previousDetail = previousSnapshot?.detail;
    const snapshotDetail = postSnapshot ?? previousDetail ?? "outline";
    snapshot = await client.call("browser.get_page_snapshot", {
      tabId,
      detail: snapshotDetail,
      maxElements: snapshotDetail === "outline" ? 500 : 1_000,
      maxTextLength: 25_000,
    });
    let deltaSnapshot = snapshot;
    if (
      wantsDomDelta &&
      postSnapshot !== undefined &&
      previousDetail !== undefined &&
      previousDetail !== postSnapshot
    ) {
      deltaSnapshot = await client.call("browser.get_page_snapshot", {
        tabId,
        detail: previousDetail,
        maxElements: previousDetail === "outline" ? 500 : 1_000,
        maxTextLength: 25_000,
      });
    }
    domDelta = wantsDomDelta ? semanticDelta(previousSnapshot, deltaSnapshot) : undefined;
    cacheElementResult("browser.get_page_snapshot", { tabId }, snapshot);
  }
  if (verify !== undefined && tabId !== undefined) {
    verification = await client.call("browser.wait_for", { tabId, ...verify });
  }
  if (
    marks === undefined &&
    postSnapshot === undefined &&
    verification === undefined &&
    domDelta === undefined
  ) {
    return data;
  }
  return {
    ...(isRecord(data) ? data : { result: data }),
    ...(marks === undefined ? {} : { marks }),
    ...(postSnapshot === undefined || snapshot === undefined ? {} : { postSnapshot: snapshot }),
    ...(verification === undefined ? {} : { verification }),
    ...(domDelta === undefined ? {} : { domDelta }),
  };
};

const applyActionEnhancements = async (
  action: string,
  originalArguments: Record<string, unknown>,
): Promise<unknown> => {
  if (process.env["INVICTUM_MCP_LEGACY_ENHANCEMENTS"] === "true") {
    return applyLegacyActionEnhancements(action, originalArguments);
  }
  return enhancedActionRunner.run(action, originalArguments, {
    ...(clientSupportsElicitation
      ? {
          authorize: async (requestedAction: string, metadata: ActionMetadata) =>
            elicitedAuthorization(requestedAction, metadata),
        }
      : {}),
    createError: (code, message, retryable, details) =>
      new ControlError(code, message, retryable, details),
  });
};

const readBatchPath = (value: unknown, path: string): unknown => {
  if (path.length === 0) return value;
  let current = value;
  for (const segment of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/u.test(segment)) {
      current = current[Number(segment)];
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      throw new Error(`Batch placeholder path '${path}' does not exist`);
    }
  }
  return current;
};

const resolveBatchValue = (
  value: unknown,
  completed: ReadonlyMap<string, unknown>,
  last: unknown,
  depth = 0,
): unknown => {
  if (depth > 32) throw new Error("Batch parameter nesting exceeds 32 levels");
  if (typeof value === "string") {
    const stepMatch = /^\$steps\.([A-Za-z][A-Za-z0-9_-]{0,63})(?:\.(.*))?$/u.exec(value);
    if (stepMatch !== null) {
      const prior = completed.get(stepMatch[1]!);
      if (!completed.has(stepMatch[1]!)) {
        throw new Error(`Batch placeholder references unfinished step '${stepMatch[1]}'`);
      }
      return readBatchPath(prior, stepMatch[2] ?? "");
    }
    const lastMatch = /^\$last(?:\.(.*))?$/u.exec(value);
    if (lastMatch !== null) {
      if (last === undefined) throw new Error("Batch $last placeholder has no successful step");
      return readBatchPath(last, lastMatch[1] ?? "");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveBatchValue(item, completed, last, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveBatchValue(item, completed, last, depth + 1),
      ]),
    );
  }
  return value;
};

const runBatch = async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
  if (!Array.isArray(input["steps"]) || input["steps"].length < 1 || input["steps"].length > 25) {
    throw new Error("invictum_batch requires 1-25 steps");
  }
  const continueOnError = input["continueOnError"] === true;
  const ids = new Set<string>();
  const completed = new Map<string, unknown>();
  const results: Record<string, unknown>[] = [];
  let last: unknown;
  for (const rawStep of input["steps"]) {
    if (
      !isRecord(rawStep) ||
      typeof rawStep["id"] !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(rawStep["id"]) ||
      typeof rawStep["action"] !== "string"
    ) {
      throw new Error("Each batch step requires a valid id and action");
    }
    const id = rawStep["id"];
    const action = rawStep["action"];
    if (ids.has(id)) throw new Error(`Duplicate batch step id '${id}'`);
    ids.add(id);
    if (action === "browser.batch" || action === "invictum_batch") {
      throw new Error("Nested batches are forbidden");
    }
    if (isRecord(rawStep["when"])) {
      const condition = rawStep["when"];
      const actual = resolveBatchValue(condition["value"], completed, last);
      const expected = resolveBatchValue(condition["equals"], completed, last);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        results.push({
          id,
          action,
          success: true,
          skipped: true,
          condition: { actual, expected },
        });
        continue;
      }
    }
    try {
      const parameters = resolveBatchValue(rawStep["parameters"] ?? {}, completed, last);
      const idempotencyKey =
        typeof rawStep["idempotencyKey"] === "string" ? rawStep["idempotencyKey"] : undefined;
      const retry = isRecord(rawStep["retry"]) ? rawStep["retry"] : {};
      const attempts =
        typeof retry["attempts"] === "number"
          ? Math.max(1, Math.min(3, Math.trunc(retry["attempts"])))
          : 1;
      const delayMs =
        typeof retry["delayMs"] === "number"
          ? Math.max(0, Math.min(5_000, Math.trunc(retry["delayMs"])))
          : 100;
      const metadata = getActionMetadata(action);
      if (attempts > 1 && metadata?.idempotent !== true && idempotencyKey === undefined) {
        throw new Error(
          `Batch step '${id}' may retry only an idempotent action or a step with idempotencyKey`,
        );
      }
      let data: unknown;
      let finalError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          data = await client.call(action, parameters, { idempotencyKey });
          finalError = undefined;
          break;
        } catch (error) {
          finalError = error;
          if (attempt >= attempts || (error instanceof ControlError && error.retryable === false)) {
            break;
          }
          if (delayMs > 0) await sleep(delayMs);
        }
      }
      if (finalError !== undefined) throw finalError;
      completed.set(id, data);
      last = data;
      results.push({ id, action, success: true, attempts, data });
    } catch (error) {
      results.push({
        id,
        action,
        success: false,
        error: {
          code: error instanceof ControlError ? error.code : "BATCH_STEP_ERROR",
          message: error instanceof Error ? error.message : String(error),
          retryable: error instanceof ControlError ? error.retryable : false,
          ...(error instanceof ControlError && error.details !== undefined
            ? { details: error.details }
            : {}),
        },
      });
      if (!continueOnError) break;
    }
  }
  const failed = results.filter((result) => result["success"] === false).length;
  return {
    steps: results,
    completed: results.length - failed,
    failed,
    stoppedEarly: results.length < input["steps"].length,
  };
};

const callTool = async (
  name: string,
  argumentsValue: unknown,
): Promise<Record<string, unknown>> => {
  const argumentsObject = isRecord(argumentsValue) ? argumentsValue : {};
  try {
    await ensureDaemon();
    if (name === "invictum_end_session") {
      const data = await client.closeSession();
      enhancedActionRunner.clear();
      elementReferences.clear();
      snapshotStates.clear();
      return toolResult(data);
    }
    if (name === "invictum_batch") return toolResult(await runBatch(argumentsObject));
    if (name === "invictum_call") {
      if (typeof argumentsObject["action"] !== "string")
        throw new Error("invictum_call requires action");
      const genericParameters = isRecord(argumentsObject["parameters"])
        ? { ...argumentsObject["parameters"] }
        : {};
      for (const key of [
        "idempotencyKey",
        "dryRun",
        "postSnapshot",
        "domDelta",
        "verify",
        "timings",
      ] as const) {
        if (argumentsObject[key] !== undefined) genericParameters[key] = argumentsObject[key];
      }
      return toolResult(
        await applyActionEnhancements(argumentsObject["action"], genericParameters),
      );
    }
    if (name === "invictum_handle_beforeunload") {
      const decision = argumentsObject["decision"];
      if (decision !== "leave" && decision !== "stay") {
        throw new Error("invictum_handle_beforeunload requires decision=leave or decision=stay");
      }
      const beforeUnloadParameters: Record<string, unknown> = {
        tabId: argumentsObject["tabId"],
        accept: decision === "leave",
        trigger:
          typeof argumentsObject["navigateUrl"] === "string"
            ? { type: "navigate", url: argumentsObject["navigateUrl"] }
            : { type: "none" },
        ...(argumentsObject["timeoutMs"] === undefined
          ? {}
          : { timeoutMs: argumentsObject["timeoutMs"] }),
        authorization: argumentsObject["authorization"],
      };
      for (const key of [
        "idempotencyKey",
        "dryRun",
        "postSnapshot",
        "domDelta",
        "verify",
        "timings",
      ] as const) {
        if (argumentsObject[key] !== undefined) {
          beforeUnloadParameters[key] = argumentsObject[key];
        }
      }
      const data = await applyActionEnhancements(
        "browser.handle_javascript_dialog",
        beforeUnloadParameters,
      );
      return toolResult(
        isRecord(data)
          ? {
              ...data,
              decision,
              meaning:
                decision === "leave"
                  ? "Navigation was allowed to continue; unsaved page changes may have been discarded."
                  : "Navigation was cancelled; the current page and unsaved changes were preserved.",
            }
          : data,
      );
    }
    const tool = tools.find((candidate) => candidate.name === name);
    if (tool?.action === undefined) throw new Error(`Unknown Invictum MCP tool: ${name}`);
    return toolResult(await applyActionEnhancements(tool.action, argumentsObject));
  } catch (error) {
    const suggestedNextAction =
      error instanceof ControlError
        ? error.code === "STALE_ELEMENT_REFERENCE"
          ? "Take a fresh interactive snapshot, resolve exactly one element, then retry with its new documentId/domRevision/elementId."
          : error.code === "ELEMENT_NOT_FOUND"
            ? "Take a fresh snapshot or use invictum_find_natural_language; do not guess coordinates."
            : error.code === "CONFIRMATION_REQUIRED"
              ? "Ask the user to approve the exact effect, or let an elicitation-capable MCP client present the confirmation UI."
              : error.code === "PERMISSION_DENIED"
                ? "Inspect the structured details for the blocked tab/origin and requested Chrome permission."
                : error.code === "NATIVE_HOST_UNAVAILABLE"
                  ? "Call invictum_ping; the server will attempt authority startup. Reload the unpacked extension only if Chrome still does not reconnect."
                  : undefined
        : undefined;
    const body = {
      code: error instanceof ControlError ? error.code : "MCP_TOOL_ERROR",
      message: error instanceof Error ? error.message : String(error),
      retryable: error instanceof ControlError ? error.retryable : false,
      ...(error instanceof ControlError && error.details !== undefined
        ? { details: error.details }
        : {}),
      ...(suggestedNextAction === undefined ? {} : { suggestedNextAction }),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(body) }],
      structuredContent: body,
      isError: true,
    };
  }
};

const prompts = [
  {
    name: "login-and-verify",
    title: "Login and verify",
    description:
      "Use prefilled credentials when present, submit only with authorization, and verify the authenticated state without exposing secrets.",
  },
  {
    name: "fill-form-safely",
    title: "Fill and review form",
    description:
      "Fill native or rich fields, preview submission, verify the result, and prevent duplicate submits.",
  },
  {
    name: "safe-web-task",
    title: "Safe background browser task",
    description:
      "Reserve a background tab, identify the agent, use semantic actions, verify the result, and always release the tab.",
  },
  {
    name: "wordpress-edit",
    title: "Verified WordPress edit",
    description:
      "Use authoritative typed WordPress models, preview risky writes, save once, and verify the persisted model.",
  },
  {
    name: "browser-diagnostics",
    title: "Bounded browser diagnostics",
    description:
      "Capture console/network data only for the diagnostic window and stop debugger-backed capture in finally.",
  },
] as const;

const promptText = (name: string): string => {
  if (name === "login-and-verify") {
    return [
      "Use Invictum Browser Bridge to log in only when the user's request authorizes it.",
      "Inspect the semantic form and prefer already-prefilled username/password fields; never read or return password values.",
      "For HTTP Basic Auth, read the sanitized challenge and use invictum_authenticate_http only with user-supplied credentials and explicit authorization.",
      "Use a stable idempotencyKey for submit, attach verify for the expected URL/text/selector, and confirm the authenticated state without exposing cookies or tokens.",
      "Unlock in finally.",
    ].join(" ");
  }
  if (name === "fill-form-safely") {
    return [
      "Use snapshot/find and typed field actions; do not use coordinate clicks unless semantic interaction fails.",
      "For local upload use the dedicated file-input action.",
      "Before submit, call the submit tool with dryRun=true and review its redacted form target.",
      "Execute exactly once with explicit authorization, a stable idempotencyKey, verify, and postSnapshot or domDelta.",
      "If the page becomes dirty before navigation, handle beforeunload explicitly. Unlock in finally.",
    ].join(" ");
  }
  if (name === "safe-web-task") {
    return [
      "Use Invictum Browser Bridge for this browser task.",
      "Call invictum_ping and invictum_capabilities first.",
      "Open a background tab unless foreground focus is essential.",
      "Set the control identity once, use snapshot/find and typed actions, attach postSnapshot or verify to mutations when useful, and use idempotencyKey for operations that must never repeat.",
      "Use dryRun before destructive R2/R3 actions. Never invent authorization.",
      "Always call invictum_unlock_tab in finally, or invictum_end_session at task completion.",
    ].join(" ");
  }
  if (name === "wordpress-edit") {
    return [
      "Use typed WordPress actions instead of visual drag/drop or cosmetic DOM edits.",
      "Read invictum_get_wordpress_admin, invictum_get_wordpress_editor, or invictum_get_wordpress_menu first.",
      "For a write, use dryRun, an explicit authorization, a stable idempotencyKey, and verify/postSnapshot.",
      "Re-read the authoritative WordPress model after saving and compare the intended structure or content.",
      "Handle beforeunload proactively and never choose leave when unsaved-change intent is ambiguous.",
      "Unlock in finally.",
    ].join(" ");
  }
  if (name === "browser-diagnostics") {
    return [
      "Use opt-in, bounded diagnostics only.",
      "Start console or network capture immediately before reproducing the issue, read a bounded result, then stop capture in finally so Chrome debugger is not held.",
      "Use mobile emulation only when requested and reset it in finally.",
      "Prefer metadata-only network capture; do not request or expose credentials, cookies, or bodies.",
    ].join(" ");
  }
  throw new Error(`Unknown prompt: ${name}`);
};

const handle = async (message: unknown): Promise<void> => {
  if (!isRecord(message) || message["jsonrpc"] !== "2.0") return;
  if (typeof message["method"] !== "string") {
    const responseId = message["id"];
    if (typeof responseId !== "number") return;
    const pending = pendingServerRequests.get(responseId);
    if (pending === undefined) return;
    pendingServerRequests.delete(responseId);
    clearTimeout(pending.timeout);
    if (isRecord(message["error"])) {
      pending.reject(
        new Error(
          typeof message["error"]["message"] === "string"
            ? message["error"]["message"]
            : "MCP client request failed",
        ),
      );
    } else {
      pending.resolve(message["result"]);
    }
    return;
  }
  const id = message["id"];
  if (id === undefined) return;
  try {
    let result: unknown;
    if (message["method"] === "initialize") {
      const initializeParams = isRecord(message["params"]) ? message["params"] : {};
      const clientCapabilities = isRecord(initializeParams["capabilities"])
        ? initializeParams["capabilities"]
        : {};
      clientSupportsElicitation = isRecord(clientCapabilities["elicitation"]);
      result = {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: { name: "invictum-browser-bridge", version: "0.1.0" },
        instructions: SERVER_INSTRUCTIONS,
      };
    } else if (message["method"] === "ping") {
      result = {};
    } else if (message["method"] === "tools/list") {
      result = {
        tools: tools.map(listedTool),
      };
    } else if (message["method"] === "tools/call") {
      const params = isRecord(message["params"]) ? message["params"] : {};
      if (typeof params["name"] !== "string") throw new Error("tools/call requires a tool name");
      result = await callTool(params["name"], params["arguments"]);
    } else if (message["method"] === "prompts/list") {
      result = { prompts };
    } else if (message["method"] === "prompts/get") {
      const params = isRecord(message["params"]) ? message["params"] : {};
      if (typeof params["name"] !== "string") throw new Error("prompts/get requires a name");
      result = {
        description: prompts.find((prompt) => prompt.name === params["name"])?.description,
        messages: [
          {
            role: "user",
            content: { type: "text", text: promptText(params["name"]) },
          },
        ],
      };
    } else {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${message["method"]}` },
      });
      return;
    }
    send({ jsonrpc: "2.0", id, result });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal MCP error",
      },
    });
  }
};

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  try {
    void handle(JSON.parse(line) as unknown);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
});
