import { InvictumControlClient } from "@invictum/agent-sdk";
import type {
  AgentElement,
  BrowserTab,
  FindElementsData,
  HandleJavaScriptDialogData,
  HttpAuthStateData,
  PageSnapshot,
} from "@invictum/protocol";

const browser = new InvictumControlClient({
  context: {
    sessionId: "chrome-auth-dialog-smoke",
    agentId: "local-development-agent",
    clientId: "integration-smoke",
    sessionAuthorized: true,
  },
});
const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "fixture-user-auth-dialog-smoke",
};
const fixtureUrl = "http://127.0.0.1:47822/basic-form";
const authUrl = `http://127.0.0.1:47822/basic-auth?nonce=${Date.now()}`;

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const findOne = async (
  tabId: number,
  snapshot: PageSnapshot,
  criteria: Record<string, unknown>,
): Promise<AgentElement> => {
  const found = await browser.call<FindElementsData>("browser.find_elements", {
    tabId,
    documentId: snapshot.metadata.documentId,
    domRevision: snapshot.metadata.domRevision,
    matchMode: "exact",
    maxResults: 2,
    ...criteria,
  });
  if (found.count !== 1) throw new Error(`Expected one element, received ${found.count}`);
  return found.matches[0]!.element;
};

try {
  await browser.call("system.ping");
  const listed = await browser.call<{ tabs: BrowserTab[] }>("browser.list_tabs");
  const tab = listed.tabs.find(
    (candidate) =>
      candidate.active && !candidate.restricted && candidate.url.startsWith(fixtureUrl),
  );
  if (tab === undefined) {
    throw new Error(`Open the active fixture first: ${fixtureUrl}`);
  }

  const result = await browser.withReservedTab(tab.tabId, async () => {
    await browser.call("browser.navigate", {
      tabId: tab.tabId,
      url: authUrl,
      active: true,
      waitUntil: "none",
      timeoutMs: 5_000,
    });
    let authState: HttpAuthStateData | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      authState = await browser.call<HttpAuthStateData>("browser.get_http_auth_state", {
        tabId: tab.tabId,
      });
      if (authState.challengeDetected) break;
      await sleep(100);
    }
    if (authState?.challengeDetected !== true || authState.scheme?.toLowerCase() !== "basic") {
      throw new Error("Fixture Basic Auth challenge was not detected");
    }
    const authenticated = await browser.call<{
      authenticated: true;
      credentialsRetained: false;
    }>("browser.authenticate_http", {
      tabId: tab.tabId,
      username: "fixture-user",
      password: "fixture-password",
      authorization,
      timeoutMs: 10_000,
    });
    await browser.call("browser.wait_for", {
      tabId: tab.tabId,
      condition: { type: "selector", value: "#auth-success" },
      timeoutMs: 5_000,
    });

    await browser.call("browser.navigate", {
      tabId: tab.tabId,
      url: fixtureUrl,
      active: true,
      waitUntil: "complete",
      timeoutMs: 10_000,
    });
    let snapshot = await browser.call<PageSnapshot>("browser.get_page_snapshot", {
      tabId: tab.tabId,
      detail: "interactive",
    });
    const email = await findOne(tab.tabId, snapshot, { tag: "input", label: "Email" });
    const password = await findOne(tab.tabId, snapshot, { tag: "input", label: "Password" });
    if (!email.hasValue || !password.hasValue || !password.sensitive) {
      throw new Error("Prefilled credential presence/redaction invariant failed");
    }
    const confirm = await findOne(tab.tabId, snapshot, {
      role: "button",
      name: "Open confirm",
    });
    const dialog = await browser.call<HandleJavaScriptDialogData>(
      "browser.handle_javascript_dialog",
      {
        tabId: tab.tabId,
        accept: true,
        trigger: {
          type: "click",
          documentId: snapshot.metadata.documentId,
          domRevision: snapshot.metadata.domRevision,
          elementId: confirm.elementId,
        },
        authorization,
        timeoutMs: 5_000,
      },
    );
    await browser.call("browser.wait_for", {
      tabId: tab.tabId,
      condition: { type: "text", value: "Confirm accepted." },
      timeoutMs: 5_000,
    });
    snapshot = await browser.call<PageSnapshot>("browser.get_page_snapshot", {
      tabId: tab.tabId,
      detail: "minimal",
    });
    return {
      authenticated: authenticated.authenticated,
      credentialsRetained: authenticated.credentialsRetained,
      prefilledCredentialPresence: email.hasValue && password.hasValue,
      passwordSensitive: password.sensitive,
      dialog: {
        handled: dialog.handled,
        accepted: dialog.accepted,
        type: dialog.type,
        triggerType: dialog.triggerType,
      },
      finalTitle: snapshot.page.title,
    };
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.closeSession().catch(() => undefined);
}
