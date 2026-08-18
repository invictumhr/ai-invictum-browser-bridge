import { afterEach, describe, expect, it, vi } from "vitest";

import { getExtensionCapabilities } from "./capabilities.js";

const requiredAdvancedActions = [
  "browser.close_tab",
  "browser.set_file_input_files",
  "browser.get_wordpress_menu",
  "browser.edit_wordpress_menu",
  "browser.get_wordpress_admin",
  "browser.wordpress_list_table_action",
  "browser.get_wordpress_editor",
  "browser.edit_wordpress_editor",
  "browser.mutate_dom",
  "browser.inspect_element",
  "browser.manage_css",
  "browser.observe_events",
  "browser.execute_javascript",
  "browser.console",
  "browser.network",
  "browser.emulate_device",
  "browser.perform_gesture",
  "browser.get_page_text",
  "browser.find_natural_language",
  "browser.go_back",
  "browser.go_forward",
  "browser.activate_tab",
  "browser.page_api_request",
  "browser.print_to_pdf",
  "browser.set_control_identity",
] as const;

const requiredAdvancedFeatures = [
  "localFileUpload",
  "wordpressMenuEditing",
  "wordpressAdminTools",
  "wordpressPostEditing",
  "elementInspection",
  "domMutation",
  "cssInjection",
  "eventCapture",
  "browserConsole",
  "networkCapture",
  "deviceEmulation",
  "advancedGestures",
  "pageText",
  "naturalLanguageFind",
  "historyNavigation",
  "explicitTabActivation",
  "sameOriginPageApi",
  "agentBatching",
  "pdfExport",
  "rawJavaScript",
  "customControlIdentity",
  "configurableTabActivation",
  "screenshotModes",
  "screenshotAnnotations",
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extension capability contract", () => {
  it("advertises the complete advanced build without duplicate actions", () => {
    vi.stubGlobal("chrome", {
      runtime: { getManifest: () => ({ version: "0.1.0" }) },
    });

    const capabilities = getExtensionCapabilities();
    const actions = capabilities.actions.map(({ action }) => action);

    expect(actions).toHaveLength(46);
    expect(new Set(actions).size).toBe(actions.length);
    expect(actions).toEqual(expect.arrayContaining([...requiredAdvancedActions]));
    expect(
      capabilities.actions.every(
        (action) =>
          typeof action.readOnly === "boolean" &&
          typeof action.destructive === "boolean" &&
          typeof action.idempotent === "boolean" &&
          typeof action.requiresAuthorization === "boolean" &&
          Array.isArray(action.parameterKeys),
      ),
    ).toBe(true);

    for (const feature of requiredAdvancedFeatures) {
      expect(capabilities.features[feature]).toBe(true);
    }
  });
});
