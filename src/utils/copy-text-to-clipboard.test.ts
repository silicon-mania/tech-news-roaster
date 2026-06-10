import { describe, expect, test, vi } from "vitest";
import { copyTextToClipboard } from "./copy-text-to-clipboard";

function stubClipboard(clipboard: { writeText?: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
}

describe("copyTextToClipboard", () => {
  test("returns true when the clipboard write succeeds", async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard({ writeText });

    await expect(copyTextToClipboard("Draft text")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Draft text");
  });

  test("returns false when the clipboard write is rejected", async () => {
    stubClipboard({
      writeText: vi.fn(async () => {
        throw new Error("denied");
      }),
    });

    await expect(copyTextToClipboard("Draft text")).resolves.toBe(false);
  });

  test("returns false when the clipboard is unavailable", async () => {
    stubClipboard(undefined);

    await expect(copyTextToClipboard("Draft text")).resolves.toBe(false);
  });
});
