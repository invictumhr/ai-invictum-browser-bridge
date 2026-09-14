import { afterEach, describe, expect, it, vi } from "vitest";

import { ChromeDownloadAdapter } from "./downloads.js";

afterEach(() => vi.unstubAllGlobals());

const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-download-1",
};

describe("managed downloads", () => {
  it("stores only managed metadata and returns no absolute path", async () => {
    let session: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      downloads: {
        download: vi.fn(async () => 17),
        search: vi.fn(async () => [
          {
            id: 17,
            state: "complete",
            danger: "safe",
            bytesReceived: 123,
            totalBytes: 123,
            filename: "C:\\Users\\person\\Downloads\\report.pdf",
            url: "https://example.test/report.pdf?token=secret#fragment",
          },
        ]),
        cancel: vi.fn(async () => undefined),
      },
      storage: {
        session: {
          get: vi.fn(async (key: string) => ({ [key]: session[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => {
            session = { ...session, ...value };
          }),
        },
      },
    });
    const result = await new ChromeDownloadAdapter().start({
      tabId: 3,
      url: "https://example.test/report.pdf?token=secret",
      maxBytes: 1_000,
      authorization,
    });
    expect(result).toMatchObject({ downloadId: 17, fileName: "report.pdf", managed: true });
    expect(result.url).toBe("https://example.test/report.pdf");
    expect(JSON.stringify(result)).not.toContain("Users");
  });

  it("blocks executable filenames before Chrome starts a download", async () => {
    const download = vi.fn(async () => 1);
    vi.stubGlobal("chrome", {
      downloads: { download },
      storage: { session: { get: vi.fn(async () => ({})), set: vi.fn() } },
    });
    await expect(
      new ChromeDownloadAdapter().start({
        tabId: 3,
        url: "https://example.test/tool.exe",
        filename: "tool.exe",
        maxBytes: 1_000,
        authorization,
      }),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(download).not.toHaveBeenCalled();
  });

  it("removes a completed file when the server changes its final name to an executable", async () => {
    let session: Record<string, unknown> = {};
    const removeFile = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      downloads: {
        download: vi.fn(async () => 19),
        search: vi.fn(async () => [
          {
            id: 19,
            state: "complete",
            danger: "safe",
            bytesReceived: 100,
            totalBytes: 100,
            filename: "C:\\Downloads\\renamed.exe",
            url: "https://example.test/download",
          },
        ]),
        cancel: vi.fn(async () => undefined),
        removeFile,
      },
      storage: {
        session: {
          get: vi.fn(async (key: string) => ({ [key]: session[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => {
            session = { ...session, ...value };
          }),
        },
      },
    });

    const result = await new ChromeDownloadAdapter().start({
      tabId: 3,
      url: "https://example.test/download",
      maxBytes: 1_000,
      authorization,
    });
    expect(result.state).toBe("interrupted");
    expect(removeFile).toHaveBeenCalledWith(19);
  });

  it("enforces byte and final-file boundaries even when the caller does not wait", async () => {
    let session: Record<string, unknown> = {};
    let changed: ((delta: { id: number }) => void) | undefined;
    let item = {
      id: 21,
      state: "in_progress",
      danger: "safe",
      bytesReceived: 1,
      totalBytes: 0,
      filename: "C:\\Downloads\\pending.tmp",
      url: "https://example.test/download",
    };
    const cancel = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      downloads: {
        download: vi.fn(async () => 21),
        search: vi.fn(async () => [item]),
        cancel,
        onChanged: { addListener: vi.fn((listener) => (changed = listener)) },
      },
      storage: {
        session: {
          get: vi.fn(async (key: string) => ({ [key]: session[key] })),
          set: vi.fn(async (value: Record<string, unknown>) => {
            session = { ...session, ...value };
          }),
        },
      },
    });
    await new ChromeDownloadAdapter().start({
      tabId: 3,
      url: "https://example.test/download",
      maxBytes: 1_000,
      authorization,
    });
    item = { ...item, bytesReceived: 2_000, filename: "C:\\Downloads\\tool.exe" };
    changed?.({ id: 21 });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith(21));
  });
});
