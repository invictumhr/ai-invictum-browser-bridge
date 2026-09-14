import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { OperationJournal } from "./operation-journal.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("durable operation journal", () => {
  it("turns an interrupted operation into unknown and never stores the raw idempotency key", () => {
    const directory = mkdtempSync(join(tmpdir(), "ibb-journal-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "operations.jsonl");
    const registryKey = ["session", "browser.submit_form", "1", "publish-post-42"].join("\u0000");
    const first = new OperationJournal(path);
    first.start({
      registryKey,
      action: "browser.submit_form",
      tabScope: "1",
      idempotencyKey: "publish-post-42",
      parameterHash: "a".repeat(64),
    });

    expect(readFileSync(path, "utf8")).not.toContain("publish-post-42");
    const restarted = new OperationJournal(path);
    expect(restarted.find(registryKey)).toMatchObject({ state: "unknown" });
    expect(restarted.uncertainCount).toBe(1);
  });

  it("remembers completed operations across process instances", () => {
    const directory = mkdtempSync(join(tmpdir(), "ibb-journal-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "operations.jsonl");
    const registryKey = ["session", "browser.download", "7", "asset"].join("\u0000");
    const journal = new OperationJournal(path);
    const operation = journal.start({
      registryKey,
      action: "browser.download",
      tabScope: "7",
      idempotencyKey: "asset",
      parameterHash: "b".repeat(64),
    });
    journal.finish(operation, "completed");

    expect(new OperationJournal(path).find(registryKey)).toMatchObject({ state: "completed" });
  });

  it("also remembers failed attempts so the same logical mutation is never replayed blindly", () => {
    const directory = mkdtempSync(join(tmpdir(), "ibb-journal-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "operations.jsonl");
    const registryKey = ["session", "browser.click", "9", "publish-once"].join("\u0000");
    const journal = new OperationJournal(path);
    const operation = journal.start({
      registryKey,
      action: "browser.click",
      tabScope: "9",
      idempotencyKey: "publish-once",
      parameterHash: "c".repeat(64),
    });
    journal.finish(operation, "failed", "BROWSER_API_ERROR");

    expect(new OperationJournal(path).find(registryKey)).toMatchObject({
      state: "failed",
      errorCode: "BROWSER_API_ERROR",
    });
  });
});
