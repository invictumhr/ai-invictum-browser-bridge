import { afterEach, describe, expect, it, vi } from "vitest";

import { IBP_ERROR_CODES, ManageCssParametersSchema } from "@invictum/protocol";

import { ChromeCssAdapter } from "./css.js";

afterEach(() => vi.unstubAllGlobals());

const authorization = {
  source: "explicit_user_instruction" as const,
  instructionId: "user-css-test",
};

describe("ChromeCssAdapter", () => {
  it("stores exact injected CSS so it can remove it and clean it on unlock", async () => {
    const values: Record<string, unknown> = {};
    const insertCSS = vi.fn().mockResolvedValue(undefined);
    const removeCSS = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/" }) },
      scripting: { insertCSS, removeCSS },
      storage: {
        session: {
          set: vi.fn(async (items: Record<string, unknown>) => Object.assign(values, items)),
          get: vi.fn(async (key: string | null) =>
            key === null ? { ...values } : { [key]: values[key] },
          ),
          remove: vi.fn(async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
          }),
        },
      },
    });

    const adapter = new ChromeCssAdapter();
    const added = await adapter.manage(
      ManageCssParametersSchema.parse({
        operation: "add",
        tabId: 3,
        css: "#panel { outline: 2px solid rgb(255 0 0); }",
        origin: "USER",
        authorization,
      }),
    );
    expect(added).toMatchObject({ operation: "add", applied: true, cleanupOnUnlock: true });
    expect(insertCSS).toHaveBeenCalledWith({
      target: { tabId: 3, allFrames: false },
      css: "#panel { outline: 2px solid rgb(255 0 0); }",
      origin: "USER",
    });

    const removed = await adapter.manage(
      ManageCssParametersSchema.parse({
        operation: "remove",
        tabId: 3,
        injectionId: added.injectionId,
        authorization,
      }),
    );
    expect(removed).toMatchObject({ operation: "remove", removed: true });
    expect(removeCSS).toHaveBeenCalledWith({
      target: { tabId: 3, allFrames: false },
      css: "#panel { outline: 2px solid rgb(255 0 0); }",
      origin: "USER",
    });

    await adapter.manage(
      ManageCssParametersSchema.parse({
        operation: "add",
        tabId: 3,
        css: "#panel { opacity: .9; }",
        authorization,
      }),
    );
    await adapter.clearTab(3);
    expect(Object.keys(values)).toHaveLength(0);
  });

  it("denies CSS that can load external resources", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn().mockResolvedValue(true) },
      tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.test/" }) },
    });
    for (const css of [
      '.avatar { background-image: url("https://tracker.test/a.png"); }',
      '.avatar { background-image: image-set("https://tracker.test/a.png" 1x); }',
      '.avatar { background-image: image("https://tracker.test/a.png"); }',
      String.raw`.avatar { background-image: u\72l("https://tracker.test/a.png"); }`,
      '.avatar { background-image: url/**/("https://tracker.test/a.png"); }',
      'input[value^="a"] { outline-color: red; }',
      "input::after { content: attr(value); }",
      "input { -webkit-text-security: none; }",
    ]) {
      await expect(
        new ChromeCssAdapter().manage(
          ManageCssParametersSchema.parse({
            operation: "add",
            tabId: 3,
            css,
            authorization,
          }),
        ),
      ).rejects.toMatchObject({ code: IBP_ERROR_CODES.SCRIPT_POLICY_DENIED });
    }
  });
});
