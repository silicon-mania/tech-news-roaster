import { Buffer } from "node:buffer";
import { describe, expect, test, vi } from "vitest";
import { parseImageSet } from "@/services/generation";
import { buildImageSet } from "@/services/generation/test-fixtures";
import { createInMemoryImageBytesStore, imageStoragePath } from "./image-bytes-store";
import { persistImageSetBytes, servedImageUrl } from "./persist-image-set-bytes";

const origin = "https://app.test";

describe("persistImageSetBytes", () => {
  test("writes every option's bytes to storage and rewrites URLs to server routes", async () => {
    const imageSet = parseImageSet(buildImageSet());
    const store = createInMemoryImageBytesStore("operator-1", new Map());
    const fetchBytes = vi.fn(async (url: string) => ({
      bytes: Buffer.from(`bytes-for:${url}`),
      contentType: "image/jpeg",
    }));

    const persisted = await persistImageSetBytes({
      fetchBytes,
      imageSet,
      origin,
      runId: "run-1",
      store,
    });

    // Every option URL now points at this run's image route, not the source.
    for (const option of persisted.options) {
      expect(option.url).toBe(servedImageUrl({ optionId: option.id, origin, runId: "run-1" }));
    }

    // The original's bytes were fetched from the source and written under its id.
    expect(fetchBytes).toHaveBeenCalledTimes(5);
    expect(fetchBytes).toHaveBeenCalledWith(imageSet.options[0].url);

    const storedOriginal = await store.get(imageStoragePath("run-1", imageSet.options[0].id));
    expect(storedOriginal?.bytes.toString()).toBe(`bytes-for:${imageSet.options[0].url}`);
    expect(storedOriginal?.contentType).toBe("image/jpeg");

    const storedVariation = await store.get(imageStoragePath("run-1", imageSet.options[1].id));
    expect(storedVariation?.bytes.toString()).toBe(`bytes-for:${imageSet.options[1].url}`);
  });

  test("repoints the Selected Image Original at its stored original", async () => {
    const imageSet = parseImageSet(buildImageSet());
    const store = createInMemoryImageBytesStore("operator-1", new Map());

    const persisted = await persistImageSetBytes({
      fetchBytes: async () => ({ bytes: Buffer.from("x"), contentType: "image/png" }),
      imageSet,
      origin,
      runId: "run-1",
      store,
    });

    expect(persisted.selectedImageOriginal.url).toBe(persisted.options[0].url);
  });

  test("decodes inlined base64 data URLs without touching the network", async () => {
    const original = buildImageSet();
    const toDataUrl = (label: string) =>
      `data:image/png;base64,${Buffer.from(label).toString("base64")}`;
    const dataUrlImageSet = parseImageSet({
      ...original,
      selectedImageOriginal: { ...original.selectedImageOriginal, url: toDataUrl("original") },
      options: original.options.map((option, index) => ({
        ...option,
        url: toDataUrl(index === 0 ? "original" : `variation-${index}`),
      })),
    });
    const store = createInMemoryImageBytesStore("operator-1", new Map());

    const persisted = await persistImageSetBytes({
      imageSet: dataUrlImageSet,
      origin,
      runId: "run-1",
      store,
    });

    const storedOriginal = await store.get(imageStoragePath("run-1", persisted.options[0].id));
    expect(storedOriginal?.bytes.toString()).toBe("original");
    expect(storedOriginal?.contentType).toBe("image/png");

    const storedVariation = await store.get(imageStoragePath("run-1", persisted.options[1].id));
    expect(storedVariation?.bytes.toString()).toBe("variation-1");
  });
});
