// @vitest-environment node
import { Buffer } from "node:buffer";
import { describe, expect, test, vi } from "vitest";
import { parseImageGenerationStreamEvent } from "@/services/generation";
import { defaultImagePrompt } from "@/services/generation/default-image-prompt";
import type { ImageVariationProvider } from "@/services/generation/image-generation-service";
import {
  createInMemoryImageBytesStore,
  imageStoragePath,
} from "@/services/saved-runs/image-bytes-store";
import { persistImageOptionsBytes } from "@/services/saved-runs/persist-image-set-bytes";
import { type PersistImageOptions, streamUploadedImageGenerationRun } from "./route";

// Shape tests keep the streamed options verbatim — byte persistence has its own
// dedicated test (and unit tests under saved-runs) so it never touches the
// network here.
const passthroughPersist: PersistImageOptions = async ({ options }) => options;

describe("uploaded image generation route", () => {
  test("streams a completed uploaded image set from a multipart request", async () => {
    const response = await streamUploadedImageGenerationRun(buildUploadRequest(), {
      createUploadId: () => "upload-1",
      now: () => new Date("2026-06-05T10:20:00.000Z"),
      persistImageOptions: passthroughPersist,
      provider: buildProvider(),
    });
    const events = await readUploadedImageStreamEvents(response);

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(events.map((event) => event.type)).toEqual([
      "image-set-completed",
      "image-generation-completed",
    ]);

    const completed = events[0];

    if (completed.type !== "image-set-completed") {
      throw new Error("Expected an image-set-completed event.");
    }

    expect(completed.imageSet).toMatchObject({
      id: "uploaded-image-set-upload-1",
      selectedImageOriginal: {
        candidateId: "uploaded-original-upload-1",
        origin: "user-uploaded",
      },
    });
    expect(completed.imageSet.options).toHaveLength(5);
    expect(events[1]).toMatchObject({
      type: "image-generation-completed",
      state: {
        imageSet: expect.objectContaining({ id: "uploaded-image-set-upload-1" }),
        status: "completed",
      },
    });
  });

  test("generates regardless of the base-set phase — the route takes only a run id and a file", async () => {
    const response = await streamUploadedImageGenerationRun(
      buildUploadRequest({ runId: "run-without-a-base-set" }),
      {
        createUploadId: () => "upload-1",
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        persistImageOptions: passthroughPersist,
        provider: buildProvider(),
      },
    );
    const events = await readUploadedImageStreamEvents(response);

    expect(response.status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      "image-set-completed",
      "image-generation-completed",
    ]);
  });

  test("persists the bytes and rewrites option URLs to non-colliding server routes", async () => {
    const store = createInMemoryImageBytesStore("operator-1", new Map());
    const fetchBytes = vi.fn(async (url: string) => ({
      bytes: Buffer.from(`bytes:${url}`),
      contentType: "image/png",
    }));
    const response = await streamUploadedImageGenerationRun(
      buildUploadRequest({ runId: "saved-run" }),
      {
        createUploadId: () => "upload-1",
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        persistImageOptions: ({ options, origin, runId }) =>
          persistImageOptionsBytes({ fetchBytes, options, origin, runId, store }),
        provider: buildProvider(),
      },
    );
    const events = await readUploadedImageStreamEvents(response);
    const completed = events.find((event) => event.type === "image-set-completed");

    if (completed?.type !== "image-set-completed") {
      throw new Error("Expected an image-set-completed event.");
    }

    expect(completed.imageSet.options).toHaveLength(5);

    for (const option of completed.imageSet.options) {
      // Every option is served by the unchanged run image route, and its ids are
      // keyed off the upload so they never collide with the source-derived set.
      expect(option.id.startsWith("uploaded-image-set-upload-1")).toBe(true);
      expect(option.url).toBe(
        `https://tech-news-roaster.test/api/runs/saved-run/images/${option.id}`,
      );
      expect(await store.get(imageStoragePath("saved-run", option.id))).not.toBeNull();
    }

    expect(completed.imageSet.selectedImageOriginal.url).toBe(completed.imageSet.options[0].url);
    expect(fetchBytes).toHaveBeenCalledTimes(5);
  });

  test("always steers generation with the Default Image Prompt", async () => {
    const generateVariations = vi.fn<ImageVariationProvider["generateVariations"]>(
      async ({ variationCount }) => buildVariations(variationCount),
    );
    const response = await streamUploadedImageGenerationRun(buildUploadRequest(), {
      createUploadId: () => "upload-1",
      now: () => new Date("2026-06-05T10:20:00.000Z"),
      persistImageOptions: passthroughPersist,
      provider: buildProvider({ generateVariations }),
    });

    await readUploadedImageStreamEvents(response);

    expect(generateVariations).toHaveBeenCalledTimes(1);
    expect(generateVariations).toHaveBeenCalledWith(
      expect.objectContaining({
        userImagePrompt: defaultImagePrompt,
      }),
    );
  });

  test("streams a failed set keeping the uploaded original persisted and referenced", async () => {
    const store = createInMemoryImageBytesStore("operator-1", new Map());
    const fetchBytes = vi.fn(async (url: string) => ({
      bytes: Buffer.from(`bytes:${url}`),
      contentType: "image/png",
    }));
    const generateVariations = vi
      .fn<ImageVariationProvider["generateVariations"]>()
      .mockRejectedValue(new Error("The configured image model failed."));
    const response = await streamUploadedImageGenerationRun(
      buildUploadRequest({ runId: "saved-run" }),
      {
        createUploadId: () => "upload-1",
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        persistImageOptions: ({ options, origin, runId }) =>
          persistImageOptionsBytes({ fetchBytes, options, origin, runId, store }),
        provider: buildProvider({ generateVariations }),
      },
    );
    const events = await readUploadedImageStreamEvents(response);

    expect(events.map((event) => event.type)).toEqual([
      "image-set-failed",
      "image-generation-completed",
    ]);

    const failed = events[0];

    if (failed.type !== "image-set-failed") {
      throw new Error("Expected an image-set-failed event.");
    }

    expect(failed.failedImageSet).toMatchObject({
      message: "The configured image model failed.",
      selectedImageId: "uploaded-original-upload-1",
    });
    expect(failed.failedImageSet.debugLog).toEqual(
      expect.arrayContaining([expect.stringContaining("The configured image model failed.")]),
    );
    // The uploaded original is persisted and the failed set points at the stored
    // bytes, so the operator can still see the image they fed it.
    expect(failed.failedImageSet.selectedImageOriginal?.url).toBe(
      "https://tech-news-roaster.test/api/runs/saved-run/images/uploaded-image-set-upload-1-original",
    );
    expect(
      await store.get(imageStoragePath("saved-run", "uploaded-image-set-upload-1-original")),
    ).not.toBeNull();
    // Only the original is persisted on a variation failure — no variation bytes.
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(events[1]).toMatchObject({
      type: "image-generation-completed",
      state: { status: "failed" },
    });
  });

  test("reports a debuggable failed set when persistence throws, not a broken stream", async () => {
    const response = await streamUploadedImageGenerationRun(buildUploadRequest(), {
      createUploadId: () => "upload-1",
      now: () => new Date("2026-06-05T10:20:00.000Z"),
      persistImageOptions: async () => {
        throw new Error("Operator authentication required.");
      },
      provider: buildProvider(),
    });
    const events = await readUploadedImageStreamEvents(response);

    expect(response.status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      "image-set-failed",
      "image-generation-completed",
    ]);

    const failed = events[0];

    if (failed.type !== "image-set-failed") {
      throw new Error("Expected an image-set-failed event.");
    }

    expect(failed.failedImageSet.message).toBe("Operator authentication required.");
    expect(failed.failedImageSet.debugLog).toEqual(
      expect.arrayContaining([expect.stringContaining("Operator authentication required.")]),
    );
  });

  test("rejects an unsupported content type before generation", async () => {
    const generateVariations = vi.fn<ImageVariationProvider["generateVariations"]>();
    const response = await streamUploadedImageGenerationRun(
      buildUploadRequest({ filename: "upload.gif", type: "image/gif" }),
      {
        createUploadId: () => "upload-1",
        provider: buildProvider({ generateVariations }),
      },
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(generateVariations).not.toHaveBeenCalled();
  });

  test("rejects an over-cap upload before generation", async () => {
    const generateVariations = vi.fn<ImageVariationProvider["generateVariations"]>();
    const response = await streamUploadedImageGenerationRun(
      buildUploadRequest({ bytes: Buffer.alloc(10 * 1024 * 1024 + 1), type: "image/png" }),
      {
        createUploadId: () => "upload-1",
        provider: buildProvider({ generateVariations }),
      },
    );

    expect(response.status).toBe(400);
    expect(generateVariations).not.toHaveBeenCalled();
  });

  test.each([
    { name: "missing image file", request: buildUploadRequest({ includeImage: false }) },
    { name: "missing run id", request: buildUploadRequest({ runId: "" }) },
  ])("rejects $name before opening the stream", async ({ request }) => {
    const response = await streamUploadedImageGenerationRun(request);

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});

async function readUploadedImageStreamEvents(response: Response) {
  const rawEvents = await response.text();

  return rawEvents
    .trim()
    .split("\n\n")
    .map((rawEvent) => {
      const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));

      if (!dataLine) {
        throw new Error("Missing SSE data line.");
      }

      return parseImageGenerationStreamEvent(JSON.parse(dataLine.replace("data: ", "")));
    });
}

function buildUploadRequest({
  bytes = Buffer.from("uploaded-bytes"),
  filename = "upload.png",
  includeImage = true,
  runId = "saved-run",
  type = "image/png",
}: {
  bytes?: Buffer;
  filename?: string;
  includeImage?: boolean;
  runId?: string;
  type?: string;
} = {}) {
  const formData = new FormData();
  formData.append("runId", runId);

  if (includeImage) {
    formData.append("image", new Blob([new Uint8Array(bytes)], { type }), filename);
  }

  return new Request("https://tech-news-roaster.test/api/generation-runs/image-generation/upload", {
    body: formData,
    method: "POST",
  });
}

function buildVariations(variationCount: number) {
  return Array.from({ length: variationCount }, (_, index) => ({
    altText: `Uploaded visual variation ${index + 1}.`,
    url: `https://example.com/uploaded-variation-${index + 1}.png`,
  }));
}

function buildProvider(overrides: Partial<ImageVariationProvider> = {}): ImageVariationProvider {
  return {
    imageModelProvenance: {
      model: "image-model-v1",
      provider: "test-provider",
    },
    async generateVariations({ variationCount }) {
      return buildVariations(variationCount);
    },
    ...overrides,
  };
}
