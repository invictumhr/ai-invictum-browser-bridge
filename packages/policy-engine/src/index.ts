import {
  BROWSER_GET_PAGE_SNAPSHOT_ACTION,
  BROWSER_GET_PAGE_TEXT_ACTION,
  BROWSER_UNLOCK_TAB_ACTION,
  BROWSER_FIND_ELEMENTS_ACTION,
  BROWSER_FIND_NATURAL_LANGUAGE_ACTION,
  BROWSER_CLICK_ACTION,
  BROWSER_TYPE_TEXT_ACTION,
  BROWSER_SET_FILE_INPUT_FILES_ACTION,
  BROWSER_SELECT_OPTION_ACTION,
  BROWSER_CHECK_ACTION,
  BROWSER_UNCHECK_ACTION,
  BROWSER_SUBMIT_FORM_ACTION,
  BROWSER_GET_WORDPRESS_MENU_ACTION,
  BROWSER_EDIT_WORDPRESS_MENU_ACTION,
  BROWSER_GET_WORDPRESS_ADMIN_ACTION,
  BROWSER_WORDPRESS_LIST_TABLE_ACTION,
  BROWSER_GET_WORDPRESS_EDITOR_ACTION,
  BROWSER_EDIT_WORDPRESS_EDITOR_ACTION,
  BROWSER_EVALUATE_ACTION,
  BROWSER_EXECUTE_JAVASCRIPT_ACTION,
  BROWSER_INSPECT_ELEMENT_ACTION,
  BROWSER_MANAGE_CSS_ACTION,
  BROWSER_MUTATE_DOM_ACTION,
  BROWSER_OBSERVE_EVENTS_ACTION,
  BROWSER_SCREENSHOT_ACTION,
  BROWSER_SET_CONTROL_IDENTITY_ACTION,
  BROWSER_CLICK_AT_ACTION,
  BROWSER_LIST_TABS_ACTION,
  SYSTEM_CAPABILITIES_ACTION,
  BROWSER_OPEN_TAB_ACTION,
  BROWSER_CLOSE_TAB_ACTION,
  BROWSER_NAVIGATE_ACTION,
  BROWSER_GO_BACK_ACTION,
  BROWSER_GO_FORWARD_ACTION,
  BROWSER_ACTIVATE_TAB_ACTION,
  BROWSER_WAIT_FOR_ACTION,
  BROWSER_GET_HTTP_AUTH_STATE_ACTION,
  BROWSER_AUTHENTICATE_HTTP_ACTION,
  BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION,
  BROWSER_CONSOLE_ACTION,
  BROWSER_NETWORK_ACTION,
  BROWSER_EMULATE_DEVICE_ACTION,
  BROWSER_PERFORM_GESTURE_ACTION,
  BROWSER_PRINT_TO_PDF_ACTION,
  BROWSER_PAGE_API_REQUEST_ACTION,
  IBP_ERROR_CODES,
} from "@invictum/protocol";

export type RiskLevel = "R0" | "R1" | "R2" | "R3" | "R4";
export type PolicyOutcome = "allow" | "deny" | "confirm";

export interface PolicyEvaluationInput {
  action: string;
  sessionAuthorized: boolean;
  domain?: string;
  explicitUserAuthorization?: boolean;
}

export interface PolicyDecision {
  action: string;
  outcome: PolicyOutcome;
  riskLevel: RiskLevel;
  reason: string;
  errorCode?: string;
}

export interface PolicyEngine {
  evaluate: (input: PolicyEvaluationInput) => PolicyDecision;
}

const ACTION_RISK_LEVELS: Readonly<Record<string, RiskLevel>> = {
  [SYSTEM_CAPABILITIES_ACTION]: "R0",
  [BROWSER_OPEN_TAB_ACTION]: "R1",
  [BROWSER_CLOSE_TAB_ACTION]: "R2",
  [BROWSER_NAVIGATE_ACTION]: "R1",
  [BROWSER_GO_BACK_ACTION]: "R1",
  [BROWSER_GO_FORWARD_ACTION]: "R1",
  [BROWSER_ACTIVATE_TAB_ACTION]: "R1",
  [BROWSER_WAIT_FOR_ACTION]: "R0",
  [BROWSER_SET_CONTROL_IDENTITY_ACTION]: "R0",
  [BROWSER_CLICK_ACTION]: "R1",
  [BROWSER_FIND_ELEMENTS_ACTION]: "R0",
  [BROWSER_FIND_NATURAL_LANGUAGE_ACTION]: "R0",
  [BROWSER_GET_PAGE_SNAPSHOT_ACTION]: "R0",
  [BROWSER_GET_PAGE_TEXT_ACTION]: "R0",
  [BROWSER_LIST_TABS_ACTION]: "R0",
  [BROWSER_UNLOCK_TAB_ACTION]: "R0",
  [BROWSER_TYPE_TEXT_ACTION]: "R1",
  [BROWSER_SET_FILE_INPUT_FILES_ACTION]: "R2",
  [BROWSER_SELECT_OPTION_ACTION]: "R1",
  [BROWSER_CHECK_ACTION]: "R1",
  [BROWSER_UNCHECK_ACTION]: "R1",
  [BROWSER_SUBMIT_FORM_ACTION]: "R2",
  [BROWSER_GET_WORDPRESS_MENU_ACTION]: "R0",
  [BROWSER_EDIT_WORDPRESS_MENU_ACTION]: "R2",
  [BROWSER_GET_WORDPRESS_ADMIN_ACTION]: "R0",
  [BROWSER_WORDPRESS_LIST_TABLE_ACTION]: "R2",
  [BROWSER_GET_WORDPRESS_EDITOR_ACTION]: "R0",
  [BROWSER_EDIT_WORDPRESS_EDITOR_ACTION]: "R2",
  [BROWSER_EVALUATE_ACTION]: "R2",
  [BROWSER_MUTATE_DOM_ACTION]: "R2",
  [BROWSER_INSPECT_ELEMENT_ACTION]: "R0",
  [BROWSER_MANAGE_CSS_ACTION]: "R2",
  [BROWSER_OBSERVE_EVENTS_ACTION]: "R0",
  [BROWSER_EXECUTE_JAVASCRIPT_ACTION]: "R3",
  [BROWSER_SCREENSHOT_ACTION]: "R0",
  [BROWSER_CLICK_AT_ACTION]: "R1",
  [BROWSER_GET_HTTP_AUTH_STATE_ACTION]: "R0",
  [BROWSER_AUTHENTICATE_HTTP_ACTION]: "R2",
  [BROWSER_HANDLE_JAVASCRIPT_DIALOG_ACTION]: "R2",
  [BROWSER_CONSOLE_ACTION]: "R0",
  [BROWSER_NETWORK_ACTION]: "R0",
  [BROWSER_EMULATE_DEVICE_ACTION]: "R1",
  [BROWSER_PERFORM_GESTURE_ACTION]: "R1",
  [BROWSER_PRINT_TO_PDF_ACTION]: "R0",
  [BROWSER_PAGE_API_REQUEST_ACTION]: "R3",
};

export interface JavaScriptPolicyAnalysis {
  allowed: boolean;
  requiredMode: "read_only" | "page_mutation";
  reason: string;
}

const STRING_LITERAL = String.raw`"(?:\\["\\/bfnrt]|\\u[0-9a-fA-F]{4}|[^"\\\u0000-\u001F])*"`;
const ACCESS = String.raw`\s*(?:\?\.|\.)\s*`;
const QUERY = String.raw`document\s*\.\s*(?:querySelector(?:All)?|getElementById)\s*\(\s*${STRING_LITERAL}\s*\)`;
const SAFE_ATTRIBUTE = String.raw`"(?:aria-[a-z0-9_.:-]+|data-[a-z0-9_.:-]+|title|class|id|role|hidden|disabled)"`;
const READ_PROPERTY = String.raw`(?:textContent|innerText|tagName|id|className|hidden|disabled|checked|selected|length|childElementCount)`;
const READ_METHOD = String.raw`(?:getAttribute|hasAttribute|matches)`;
const FORBIDDEN_SCRIPT_CAPABILITY =
  /(?:document\s*\.\s*cookie|localStorage|sessionStorage|indexedDB|\bfetch\b|XMLHttpRequest|WebSocket|sendBeacon|window\s*\.\s*open|\blocation\b|\.\s*(?:submit|requestSubmit|click)\s*\(|\b(?:password|passwd|token|secret|credential)\b|\beval\b|\bFunction\b|\bchrome\b|\bimport\b|\brequire\b)/i;

const exact = (source: string): RegExp => new RegExp(`^(?:${source})$`, "u");
const READ_ONLY_EXPRESSIONS = [
  exact(String.raw`document\s*\.\s*(?:title|readyState|visibilityState|activeElement)`),
  exact(String.raw`${QUERY}`),
  exact(String.raw`${QUERY}${ACCESS}${READ_PROPERTY}`),
  exact(String.raw`${QUERY}${ACCESS}${READ_METHOD}\s*\(\s*${SAFE_ATTRIBUTE}\s*\)`),
  exact(
    String.raw`${QUERY}${ACCESS}closest\s*\(\s*${STRING_LITERAL}\s*\)(?:${ACCESS}${READ_PROPERTY})?`,
  ),
];
const MUTATION_EXPRESSIONS = [
  exact(
    String.raw`${QUERY}${ACCESS}setAttribute\s*\(\s*${SAFE_ATTRIBUTE}\s*,\s*${STRING_LITERAL}\s*\)`,
  ),
  exact(
    String.raw`${QUERY}${ACCESS}(?:removeAttribute|toggleAttribute)\s*\(\s*${SAFE_ATTRIBUTE}(?:\s*,\s*(?:true|false))?\s*\)`,
  ),
  exact(String.raw`${QUERY}${ACCESS}(?:focus|blur|scrollIntoView)\s*\(\s*\)`),
  exact(String.raw`${QUERY}${ACCESS}(?:textContent|innerText|className)\s*=\s*${STRING_LITERAL}`),
  exact(String.raw`${QUERY}${ACCESS}(?:hidden|disabled|checked|selected)\s*=\s*(?:true|false)`),
];

export function analyzeJavaScriptExpression(
  expression: string,
  requestedMode: "read_only" | "page_mutation",
): JavaScriptPolicyAnalysis {
  const source = expression.trim();
  if (source.length === 0 || source.length > 20_000) {
    return {
      allowed: false,
      requiredMode: requestedMode,
      reason: "The JavaScript expression length is outside the allowed range",
    };
  }
  if (FORBIDDEN_SCRIPT_CAPABILITY.test(source)) {
    return {
      allowed: false,
      requiredMode: requestedMode,
      reason:
        "Credential, network, storage, navigation, submit, click, and dynamic-code capabilities are forbidden",
    };
  }
  const literalMatches = source.match(new RegExp(STRING_LITERAL, "gu")) ?? [];
  let decodedLiterals: string[];
  try {
    decodedLiterals = literalMatches.map((literal) => JSON.parse(literal) as string);
  } catch {
    return {
      allowed: false,
      requiredMode: requestedMode,
      reason: "Only valid JSON string literals are allowed in constrained expressions",
    };
  }
  if (
    decodedLiterals.some((literal) =>
      /(?:cookie|credential|indexeddb|localstorage|password|passwd|secret|sessionstorage|token)/i.test(
        literal,
      ),
    )
  ) {
    return {
      allowed: false,
      requiredMode: requestedMode,
      reason: "Credential and storage identifiers are forbidden even when string-escaped",
    };
  }
  if (READ_ONLY_EXPRESSIONS.some((pattern) => pattern.test(source))) {
    return {
      allowed: true,
      requiredMode: "read_only",
      reason: "Expression matches the constrained read-only DOM grammar",
    };
  }
  if (MUTATION_EXPRESSIONS.some((pattern) => pattern.test(source))) {
    return requestedMode === "page_mutation"
      ? {
          allowed: true,
          requiredMode: "page_mutation",
          reason: "Expression matches the constrained DOM mutation grammar",
        }
      : {
          allowed: false,
          requiredMode: "page_mutation",
          reason: "This DOM mutation requires mode page_mutation",
        };
  }
  return {
    allowed: false,
    requiredMode: requestedMode,
    reason: "Expression is outside the constrained JavaScript grammar; use a typed browser action",
  };
}

export class DefaultPolicyEngine implements PolicyEngine {
  public evaluate(input: PolicyEvaluationInput): PolicyDecision {
    if (!input.sessionAuthorized) {
      return {
        action: input.action,
        outcome: "deny",
        riskLevel: ACTION_RISK_LEVELS[input.action] ?? "R3",
        reason: "The browser session has not been authorized",
        errorCode: IBP_ERROR_CODES.SESSION_UNAUTHORIZED,
      };
    }

    const riskLevel = ACTION_RISK_LEVELS[input.action];
    if (riskLevel === undefined) {
      return {
        action: input.action,
        outcome: "deny",
        riskLevel: "R3",
        reason: "The action has no registered policy classification",
        errorCode: IBP_ERROR_CODES.POLICY_DENIED,
      };
    }

    if ((riskLevel === "R2" || riskLevel === "R3") && input.explicitUserAuthorization !== true) {
      return {
        action: input.action,
        outcome: "confirm",
        riskLevel,
        reason: "The action requires an explicit instruction from the user",
        errorCode: IBP_ERROR_CODES.CONFIRMATION_REQUIRED,
      };
    }

    return {
      action: input.action,
      outcome: "allow",
      riskLevel,
      reason:
        riskLevel === "R0"
          ? "Authorized read-only browser operation"
          : riskLevel === "R1"
            ? "Authorized reversible browser interaction"
            : riskLevel === "R2"
              ? "Authorized action backed by an explicit user instruction"
              : "Authorized high-power action backed by an explicit user instruction",
    };
  }
}
