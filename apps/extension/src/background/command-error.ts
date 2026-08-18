export class ExtensionCommandError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ExtensionCommandError";
  }
}
