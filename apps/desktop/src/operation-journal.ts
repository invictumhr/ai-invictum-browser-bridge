import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export type OperationState = "pending" | "completed" | "failed" | "unknown";

export interface OperationJournalRecord {
  version: 1;
  operationId: string;
  registryKeyHash: string;
  action: string;
  tabScope: string;
  idempotencyKeyHash: string;
  parameterHash: string;
  state: OperationState;
  timestamp: string;
  errorCode?: string;
}

const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_LOADED_RECORDS = 20_000;
const MAX_JOURNAL_BYTES = 10 * 1024 * 1024;

export const hashRegistryKey = (registryKey: string): string =>
  createHash("sha256").update(registryKey).digest("hex");

/** Append-only crash journal. It never stores action parameters or results. */
export class OperationJournal {
  readonly #path: string;
  readonly #latest = new Map<string, OperationJournalRecord>();

  public constructor(path: string) {
    this.#path = path;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#load();
  }

  public get uncertainCount(): number {
    return [...this.#latest.values()].filter(
      (entry) => entry.state === "pending" || entry.state === "unknown",
    ).length;
  }

  public find(registryKey: string): OperationJournalRecord | undefined {
    const entry = this.#latest.get(hashRegistryKey(registryKey));
    if (entry === undefined) return undefined;
    if (Date.now() - Date.parse(entry.timestamp) > RETENTION_MS) return undefined;
    return { ...entry };
  }

  public start(input: {
    registryKey: string;
    action: string;
    tabScope: string;
    idempotencyKey: string;
    parameterHash: string;
  }): OperationJournalRecord {
    const record: OperationJournalRecord = {
      version: 1,
      operationId: randomUUID(),
      registryKeyHash: hashRegistryKey(input.registryKey),
      action: input.action,
      tabScope: input.tabScope,
      idempotencyKeyHash: createHash("sha256").update(input.idempotencyKey).digest("hex"),
      parameterHash: input.parameterHash,
      state: "pending",
      timestamp: new Date().toISOString(),
    };
    this.#append(record);
    return record;
  }

  public finish(
    operation: OperationJournalRecord,
    state: Exclude<OperationState, "pending">,
    errorCode?: string,
  ): void {
    this.#append({
      ...operation,
      state,
      timestamp: new Date().toISOString(),
      ...(errorCode === undefined ? {} : { errorCode }),
    });
  }

  #append(record: OperationJournalRecord): void {
    appendFileSync(this.#path, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    this.#latest.set(record.registryKeyHash, record);
    if (statSync(this.#path).size > MAX_JOURNAL_BYTES) this.#compact();
  }

  #compact(): void {
    const cutoff = Date.now() - RETENTION_MS;
    const retained = [...this.#latest.values()]
      .filter((entry) => Date.parse(entry.timestamp) >= cutoff)
      .slice(-MAX_LOADED_RECORDS);
    writeFileSync(
      this.#path,
      retained.map((entry) => JSON.stringify(entry)).join("\n") + (retained.length > 0 ? "\n" : ""),
      { encoding: "utf8", mode: 0o600 },
    );
  }

  #load(): void {
    if (!existsSync(this.#path)) return;
    const lines = readFileSync(this.#path, "utf8").split(/\r?\n/u).filter(Boolean);
    for (const line of lines.slice(-MAX_LOADED_RECORDS)) {
      try {
        const parsed = JSON.parse(line) as Partial<OperationJournalRecord>;
        if (
          parsed.version !== 1 ||
          typeof parsed.registryKeyHash !== "string" ||
          typeof parsed.operationId !== "string" ||
          typeof parsed.action !== "string" ||
          typeof parsed.tabScope !== "string" ||
          typeof parsed.idempotencyKeyHash !== "string" ||
          typeof parsed.parameterHash !== "string" ||
          typeof parsed.timestamp !== "string" ||
          !["pending", "completed", "failed", "unknown"].includes(parsed.state ?? "")
        ) {
          continue;
        }
        const record = parsed as OperationJournalRecord;
        // A process that ended while an operation was pending cannot know
        // whether Chrome applied it. Treat it as unknown and fail closed.
        this.#latest.set(record.registryKeyHash, {
          ...record,
          state: record.state === "pending" ? "unknown" : record.state,
        });
      } catch {
        // Ignore a partial final line left by an abrupt shutdown.
      }
    }
  }
}
