import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";
import {
  createInMemoryImageBytesStore,
  type ImageBytesStoreResolution,
  imageStoragePath,
} from "@/services/saved-runs/image-bytes-store";
import { serveImageBytes } from "./route";

async function seededStore() {
  const store = createInMemoryImageBytesStore("operator-1", new Map());
  await store.put(
    imageStoragePath("run-1", "image-set-run-1-variation-1"),
    Buffer.from("variation-bytes"),
    "image/png",
  );

  return store;
}

describe("run image bytes route", () => {
  test("serves stored bytes with their content type on reopen", async () => {
    const store = await seededStore();

    const response = await serveImageBytes(
      { optionId: "image-set-run-1-variation-1", runId: "run-1" },
      { resolveStore: async (): Promise<ImageBytesStoreResolution> => ({ store }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("variation-bytes");
  });

  test("returns 404 when the option has no stored bytes", async () => {
    const store = await seededStore();

    const response = await serveImageBytes(
      { optionId: "image-set-run-1-missing", runId: "run-1" },
      { resolveStore: async (): Promise<ImageBytesStoreResolution> => ({ store }) },
    );

    expect(response.status).toBe(404);
  });

  test("rejects an unauthenticated request", async () => {
    const response = await serveImageBytes(
      { optionId: "image-set-run-1-variation-1", runId: "run-1" },
      { resolveStore: async (): Promise<ImageBytesStoreResolution> => ({ unauthorized: true }) },
    );

    expect(response.status).toBe(401);
  });
});
