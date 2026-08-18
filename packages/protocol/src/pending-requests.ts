import { IBP_ERROR_CODES } from "@invictum/shared-types";

import { IbpProtocolError } from "./errors.js";

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: IbpProtocolError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PendingRequestHandle<T> {
  promise: Promise<T>;
  cancel: (reason?: string) => boolean;
}

export class PendingRequestRegistry<T> {
  readonly #pending = new Map<string, PendingRequest<T>>();

  public register(messageId: string, timeoutMs: number): PendingRequestHandle<T> {
    if (this.#pending.has(messageId)) {
      throw new Error(`A pending request already exists for message ${messageId}`);
    }

    let resolvePromise!: (value: T) => void;
    let rejectPromise!: (reason: IbpProtocolError) => void;
    const promise = new Promise<T>((resolve, reject: (reason: IbpProtocolError) => void) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const timer = setTimeout(() => {
      this.reject(
        messageId,
        new IbpProtocolError(
          IBP_ERROR_CODES.TIMEOUT,
          `Request ${messageId} timed out after ${timeoutMs} ms`,
          true,
        ),
      );
    }, timeoutMs);

    this.#pending.set(messageId, {
      resolve: resolvePromise,
      reject: rejectPromise,
      timer,
    });

    return {
      promise,
      cancel: (reason = "Request cancelled") =>
        this.reject(messageId, new IbpProtocolError(IBP_ERROR_CODES.CANCELLED, reason, false)),
    };
  }

  public resolve(messageId: string, value: T): boolean {
    const pending = this.#pending.get(messageId);
    if (pending === undefined) {
      return false;
    }

    clearTimeout(pending.timer);
    this.#pending.delete(messageId);
    pending.resolve(value);
    return true;
  }

  public reject(messageId: string, reason: IbpProtocolError): boolean {
    const pending = this.#pending.get(messageId);
    if (pending === undefined) {
      return false;
    }

    clearTimeout(pending.timer);
    this.#pending.delete(messageId);
    pending.reject(reason);
    return true;
  }

  public rejectAll(reason: IbpProtocolError): void {
    for (const messageId of [...this.#pending.keys()]) {
      this.reject(messageId, reason);
    }
  }

  public get size(): number {
    return this.#pending.size;
  }
}
