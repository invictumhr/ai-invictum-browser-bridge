import { randomUUID } from "node:crypto";

import { InvictumControlClient } from "@invictum/agent-sdk";
import type {
  CloseTabData,
  GetTerminalsData,
  OpenTabData,
  TerminalInputData,
  TerminalReadData,
} from "@invictum/protocol";

const fixtureUrl =
  process.env.INVICTUM_TERMINAL_FIXTURE_URL ?? "http://127.0.0.1:47822/xterm-terminal";
const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-local-terminal-smoke",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const main = async (): Promise<void> => {
  const client = new InvictumControlClient({
    context: {
      sessionId: `integration-terminal-${randomUUID()}`,
      agentId: "integration-terminal",
      clientId: "chrome-terminal-smoke",
      sessionAuthorized: true,
    },
  });
  let tabId: number | undefined;
  try {
    const opened = await client.call<OpenTabData>("browser.open_tab", {
      url: fixtureUrl,
      active: false,
    });
    tabId = opened.tab.tabId;
    assert(!opened.tab.active, "Terminal fixture stole browser focus");

    await client.withReservedTab(tabId, async (browser) => {
      const detected = await browser.getTerminals(tabId!);
      assert(detected.count === 1, `Expected one terminal, received ${detected.count}`);
      const terminal = detected.terminals[0];
      assert(terminal !== undefined, "Terminal descriptor is missing");
      assert(terminal.renderer === "canvas", "Fixture was not detected as a canvas terminal");
      assert(terminal.trustedInputAvailable, "Trusted terminal input is unavailable");

      const reference = {
        tabId: tabId!,
        documentId: terminal.documentId,
        domRevision: terminal.domRevision,
        terminalId: terminal.terminalId,
        authorization,
      };
      const before = await browser.readTerminal(reference);
      assert(before.text.includes("fixture@test:~$"), "Initial shell prompt was not read");

      const executed = await browser.executeTerminal(reference, "printf terminal-ok");
      assert(executed.tabActivated === false, "Terminal input activated the background tab");
      assert(
        executed.draftVerification === "buffer_observed",
        `Terminal draft verification was ${executed.draftVerification}`,
      );
      assert(executed.output.text.includes("terminal-ok"), "Terminal output was not observed");
      assert(executed.output.matched && !executed.output.timedOut, "Prompt wait did not complete");

      const refreshed = await browser.getTerminals(tabId!);
      const current = refreshed.terminals[0];
      assert(current !== undefined, "Terminal disappeared after trusted input");
      const secret = await browser.executeTerminal(
        {
          tabId: tabId!,
          documentId: current.documentId,
          domRevision: current.domRevision,
          terminalId: current.terminalId,
          authorization,
        },
        "show-secret",
      );
      assert(!secret.output.text.includes("fixture-password"), "Password was not redacted");
      assert(!secret.output.text.includes("fixture-token-value"), "Token was not redacted");

      const summary: {
        detected: GetTerminalsData;
        before: TerminalReadData;
        executed: TerminalInputData;
      } = { detected, before, executed };
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          terminalCount: summary.detected.count,
          source: summary.before.source,
          trustedInput: summary.executed.trustedInput,
          tabActivated: summary.executed.tabActivated,
          redactionsApplied: secret.output.redactionsApplied,
        })}\n`,
      );
    });
  } finally {
    if (tabId !== undefined) {
      await client
        .call<CloseTabData>("browser.close_tab", { tabId, authorization })
        .catch(() => undefined);
    }
    await client.closeSession().catch(() => undefined);
  }
};

await main();
