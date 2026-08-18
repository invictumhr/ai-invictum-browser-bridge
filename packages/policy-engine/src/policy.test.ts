import {
  BROWSER_GET_PAGE_SNAPSHOT_ACTION,
  BROWSER_GET_PAGE_TEXT_ACTION,
  BROWSER_UNLOCK_TAB_ACTION,
  BROWSER_SET_CONTROL_IDENTITY_ACTION,
  BROWSER_FIND_ELEMENTS_ACTION,
  BROWSER_FIND_NATURAL_LANGUAGE_ACTION,
  BROWSER_CLICK_ACTION,
  BROWSER_TYPE_TEXT_ACTION,
  BROWSER_SET_FILE_INPUT_FILES_ACTION,
  BROWSER_LIST_TABS_ACTION,
  BROWSER_SUBMIT_FORM_ACTION,
  BROWSER_EVALUATE_ACTION,
  BROWSER_SCREENSHOT_ACTION,
  BROWSER_CLICK_AT_ACTION,
  SYSTEM_CAPABILITIES_ACTION,
  BROWSER_OPEN_TAB_ACTION,
  BROWSER_NAVIGATE_ACTION,
  BROWSER_GO_BACK_ACTION,
  BROWSER_GO_FORWARD_ACTION,
  BROWSER_ACTIVATE_TAB_ACTION,
  BROWSER_WAIT_FOR_ACTION,
  BROWSER_GET_HTTP_AUTH_STATE_ACTION,
  BROWSER_AUTHENTICATE_HTTP_ACTION,
  BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
  BROWSER_MUTATE_DOM_ACTION,
  BROWSER_INSPECT_ELEMENT_ACTION,
  BROWSER_MANAGE_CSS_ACTION,
  BROWSER_OBSERVE_EVENTS_ACTION,
  BROWSER_EXECUTE_JAVASCRIPT_ACTION,
  BROWSER_CONSOLE_ACTION,
  BROWSER_NETWORK_ACTION,
  BROWSER_EMULATE_DEVICE_ACTION,
  BROWSER_PERFORM_GESTURE_ACTION,
  BROWSER_PRINT_TO_PDF_ACTION,
  BROWSER_PAGE_API_REQUEST_ACTION,
  BROWSER_GET_WORDPRESS_MENU_ACTION,
  BROWSER_EDIT_WORDPRESS_MENU_ACTION,
  BROWSER_GET_WORDPRESS_ADMIN_ACTION,
  BROWSER_WORDPRESS_LIST_TABLE_ACTION,
  BROWSER_GET_WORDPRESS_EDITOR_ACTION,
  BROWSER_EDIT_WORDPRESS_EDITOR_ACTION,
  IBP_ERROR_CODES,
} from "@invictum/protocol";
import { describe, expect, it } from "vitest";

import { analyzeJavaScriptExpression, DefaultPolicyEngine } from "./index.js";

describe("DefaultPolicyEngine", () => {
  const policy = new DefaultPolicyEngine();

  it("allows list_tabs as R0 for an authorized session", () => {
    expect(
      policy.evaluate({ action: BROWSER_LIST_TABS_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    expect(
      policy.evaluate({ action: BROWSER_UNLOCK_TAB_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    expect(
      policy.evaluate({ action: BROWSER_SET_CONTROL_IDENTITY_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
  });

  it("allows get_page_snapshot as R0 for an authorized session", () => {
    expect(
      policy.evaluate({
        action: BROWSER_GET_PAGE_SNAPSHOT_ACTION,
        sessionAuthorized: true,
        domain: "example.test",
      }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    expect(
      policy.evaluate({
        action: BROWSER_GET_WORDPRESS_MENU_ACTION,
        sessionAuthorized: true,
        domain: "example.test",
      }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    for (const action of [
      BROWSER_GET_WORDPRESS_ADMIN_ACTION,
      BROWSER_GET_WORDPRESS_EDITOR_ACTION,
    ]) {
      expect(
        policy.evaluate({ action, sessionAuthorized: true, domain: "example.test" }),
      ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    }
  });

  it("allows find_elements as R0 for an authorized session", () => {
    expect(
      policy.evaluate({ action: BROWSER_FIND_ELEMENTS_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    for (const action of [BROWSER_GET_PAGE_TEXT_ACTION, BROWSER_FIND_NATURAL_LANGUAGE_ACTION]) {
      expect(policy.evaluate({ action, sessionAuthorized: true })).toMatchObject({
        outcome: "allow",
        riskLevel: "R0",
      });
    }
  });

  it("classifies click and type_text as reversible R1 interactions", () => {
    expect(
      policy.evaluate({ action: BROWSER_CLICK_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R1" });
    expect(
      policy.evaluate({ action: BROWSER_TYPE_TEXT_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R1" });
    expect(
      policy.evaluate({ action: BROWSER_CLICK_AT_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R1" });
    expect(
      policy.evaluate({ action: BROWSER_SCREENSHOT_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
  });

  it("classifies discovery, navigation, and wait actions", () => {
    expect(
      policy.evaluate({ action: SYSTEM_CAPABILITIES_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    expect(
      policy.evaluate({ action: BROWSER_OPEN_TAB_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R1" });
    expect(
      policy.evaluate({ action: BROWSER_NAVIGATE_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R1" });
    for (const action of [
      BROWSER_GO_BACK_ACTION,
      BROWSER_GO_FORWARD_ACTION,
      BROWSER_ACTIVATE_TAB_ACTION,
    ]) {
      expect(policy.evaluate({ action, sessionAuthorized: true })).toMatchObject({
        outcome: "allow",
        riskLevel: "R1",
      });
    }
    expect(
      policy.evaluate({ action: BROWSER_WAIT_FOR_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    expect(
      policy.evaluate({ action: BROWSER_GET_HTTP_AUTH_STATE_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
  });

  it("denies an unauthorized session before action execution", () => {
    expect(
      policy.evaluate({ action: BROWSER_LIST_TABS_ACTION, sessionAuthorized: false }),
    ).toMatchObject({
      outcome: "deny",
      errorCode: IBP_ERROR_CODES.SESSION_UNAUTHORIZED,
    });
  });

  it("fails closed for an unclassified action", () => {
    expect(policy.evaluate({ action: "browser.unknown", sessionAuthorized: true })).toMatchObject({
      outcome: "deny",
      riskLevel: "R3",
      errorCode: IBP_ERROR_CODES.POLICY_DENIED,
    });
  });

  it("requires an explicit user authorization assertion for R2 actions", () => {
    expect(
      policy.evaluate({ action: BROWSER_SUBMIT_FORM_ACTION, sessionAuthorized: true }),
    ).toMatchObject({
      outcome: "confirm",
      riskLevel: "R2",
      errorCode: IBP_ERROR_CODES.CONFIRMATION_REQUIRED,
    });
    expect(
      policy.evaluate({
        action: BROWSER_EVALUATE_ACTION,
        sessionAuthorized: true,
        explicitUserAuthorization: true,
      }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R2" });
    expect(
      policy.evaluate({
        action: BROWSER_AUTHENTICATE_HTTP_ACTION,
        sessionAuthorized: true,
        explicitUserAuthorization: true,
      }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R2" });
    expect(
      policy.evaluate({
        action: BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
        sessionAuthorized: true,
      }),
    ).toMatchObject({ outcome: "confirm", riskLevel: "R2" });
    expect(
      policy.evaluate({
        action: BROWSER_SET_FILE_INPUT_FILES_ACTION,
        sessionAuthorized: true,
        explicitUserAuthorization: true,
      }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R2" });
    expect(
      policy.evaluate({
        action: BROWSER_EDIT_WORDPRESS_MENU_ACTION,
        sessionAuthorized: true,
      }),
    ).toMatchObject({
      outcome: "confirm",
      riskLevel: "R2",
      errorCode: IBP_ERROR_CODES.CONFIRMATION_REQUIRED,
    });
    expect(
      policy.evaluate({
        action: BROWSER_EDIT_WORDPRESS_MENU_ACTION,
        sessionAuthorized: true,
        explicitUserAuthorization: true,
      }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R2" });
    for (const action of [
      BROWSER_WORDPRESS_LIST_TABLE_ACTION,
      BROWSER_EDIT_WORDPRESS_EDITOR_ACTION,
    ]) {
      expect(policy.evaluate({ action, sessionAuthorized: true })).toMatchObject({
        outcome: "confirm",
        riskLevel: "R2",
        errorCode: IBP_ERROR_CODES.CONFIRMATION_REQUIRED,
      });
      expect(
        policy.evaluate({
          action,
          sessionAuthorized: true,
          explicitUserAuthorization: true,
        }),
      ).toMatchObject({ outcome: "allow", riskLevel: "R2" });
    }
  });

  it("classifies advanced inspection, mutation, capture, CSS, and raw JavaScript", () => {
    expect(
      policy.evaluate({ action: BROWSER_INSPECT_ELEMENT_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    expect(
      policy.evaluate({ action: BROWSER_OBSERVE_EVENTS_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    for (const action of [BROWSER_MUTATE_DOM_ACTION, BROWSER_MANAGE_CSS_ACTION]) {
      expect(policy.evaluate({ action, sessionAuthorized: true })).toMatchObject({
        outcome: "confirm",
        riskLevel: "R2",
      });
      expect(
        policy.evaluate({
          action,
          sessionAuthorized: true,
          explicitUserAuthorization: true,
        }),
      ).toMatchObject({ outcome: "allow", riskLevel: "R2" });
    }
    expect(
      policy.evaluate({ action: BROWSER_EXECUTE_JAVASCRIPT_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "confirm", riskLevel: "R3" });
    expect(
      policy.evaluate({
        action: BROWSER_EXECUTE_JAVASCRIPT_ACTION,
        sessionAuthorized: true,
        explicitUserAuthorization: true,
      }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R3" });
    expect(
      policy.evaluate({ action: BROWSER_CONSOLE_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    expect(
      policy.evaluate({ action: BROWSER_EMULATE_DEVICE_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R1" });
    expect(
      policy.evaluate({ action: BROWSER_NETWORK_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    expect(
      policy.evaluate({ action: BROWSER_PERFORM_GESTURE_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R1" });
    expect(
      policy.evaluate({ action: BROWSER_PRINT_TO_PDF_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R0" });
    expect(
      policy.evaluate({ action: BROWSER_PAGE_API_REQUEST_ACTION, sessionAuthorized: true }),
    ).toMatchObject({ outcome: "confirm", riskLevel: "R3" });
    expect(
      policy.evaluate({
        action: BROWSER_PAGE_API_REQUEST_ACTION,
        sessionAuthorized: true,
        explicitUserAuthorization: true,
      }),
    ).toMatchObject({ outcome: "allow", riskLevel: "R3" });
  });
});

describe("constrained JavaScript policy", () => {
  it("allows exact read-only and explicitly requested DOM mutation expressions", () => {
    expect(
      analyzeJavaScriptExpression('document.querySelector("#status")?.textContent', "read_only"),
    ).toMatchObject({ allowed: true, requiredMode: "read_only" });
    expect(
      analyzeJavaScriptExpression(
        'document.querySelector("#panel")?.setAttribute("aria-expanded", "true")',
        "page_mutation",
      ),
    ).toMatchObject({ allowed: true, requiredMode: "page_mutation" });
  });

  it("denies mutation in read-only mode and dangerous capabilities in every mode", () => {
    expect(
      analyzeJavaScriptExpression(
        'document.querySelector("#panel")?.setAttribute("aria-expanded", "true")',
        "read_only",
      ),
    ).toMatchObject({ allowed: false, requiredMode: "page_mutation" });
    for (const expression of [
      "document.cookie",
      'fetch("https://example.test")',
      'document.querySelector("form")?.submit()',
      'document.querySelector("input[type=password]")?.textContent',
      String.raw`document.querySelector("input[type=\u0070assword]")?.textContent`,
      'document.querySelector("#x")?.setAttribute("onclick", "evil()")',
    ]) {
      expect(analyzeJavaScriptExpression(expression, "page_mutation")).toMatchObject({
        allowed: false,
      });
    }
  });
});
