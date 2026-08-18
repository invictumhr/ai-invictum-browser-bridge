export class ControlError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ControlError";
  }
}

export class ControlClient {
  readonly #baseUrl: string;
  public constructor(
    baseUrl: string | undefined,
    private readonly context: Record<string, unknown>,
  ) {
    this.#baseUrl = (baseUrl ?? "http://127.0.0.1:47820").replace(/\/$/, "");
  }

  public async health(): Promise<Record<string, unknown>> {
    return this.request("/v1/health");
  }

  public async call(
    action: string,
    parameters: unknown = {},
    options: { idempotencyKey?: string } = {},
  ): Promise<unknown> {
    return this.request("/v1/call", {
      action,
      parameters,
      context: this.context,
      ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
    });
  }

  public async closeSession(): Promise<unknown> {
    return this.request("/v1/session/close", { context: this.context });
  }

  private async request(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    const parsed = (await response.json()) as {
      ok: boolean;
      data?: Record<string, unknown>;
      error?: { code: string; message: string; retryable: boolean; details?: unknown };
    };
    if (!parsed.ok) {
      throw new ControlError(
        parsed.error?.code ?? "CONTROL_ERROR",
        parsed.error?.message ?? `Control API returned HTTP ${response.status}`,
        parsed.error?.retryable ?? false,
        parsed.error?.details,
      );
    }
    return parsed.data ?? parsed;
  }
}
