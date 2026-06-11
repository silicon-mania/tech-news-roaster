import { afterEach, describe, expect, test, vi } from "vitest";
import { rasterizeCompositeToPng } from "./rasterize-composite";
import { quoteTweetFrame } from "./template";

const { toPngMock } = vi.hoisted(() => ({ toPngMock: vi.fn() }));

vi.mock("html-to-image", () => ({ toPng: toPngMock }));

afterEach(() => {
  toPngMock.mockReset();
  Reflect.deleteProperty(document, "fonts");
});

describe("rasterizeCompositeToPng", () => {
  test("captures only after document.fonts.ready, at the template's native size at 2x density", async () => {
    let releaseFonts = () => {};
    const fontsReady = new Promise((resolve) => {
      releaseFonts = () => resolve(undefined);
    });

    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: fontsReady },
    });
    toPngMock.mockResolvedValue("data:image/png;base64,captured-composite");

    const compositeNode = document.createElement("figure");
    const capturePromise = rasterizeCompositeToPng(compositeNode);

    // While the bundled serif is still loading, nothing may be rasterized —
    // otherwise the headline bakes in a fallback typeface.
    await Promise.resolve();
    await Promise.resolve();
    expect(toPngMock).not.toHaveBeenCalled();

    releaseFonts();

    await expect(capturePromise).resolves.toBe("data:image/png;base64,captured-composite");
    expect(toPngMock).toHaveBeenCalledTimes(1);
    expect(toPngMock).toHaveBeenCalledWith(compositeNode, {
      canvasHeight: quoteTweetFrame.height,
      canvasWidth: quoteTweetFrame.width,
      pixelRatio: 2,
    });
  });
});
