import type { NativeHostLogger } from "./bridge.js";

const sanitizeError = (error: unknown): Readonly<Record<string, unknown>> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 1_000),
    };
  }
  return { name: "UnknownError", message: "An unknown error occurred" };
};

const write = (level: "error" | "info" | "warn", event: string, fields = {}): void => {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      component: "native-host",
      level,
      event,
      ...fields,
    })}\n`,
  );
};

export const stderrLogger: NativeHostLogger = {
  error: (event, error) => {
    write("error", event, sanitizeError(error));
  },
  info: (event, fields) => {
    write("info", event, fields);
  },
  warn: (event, fields) => {
    write("warn", event, fields);
  },
};
