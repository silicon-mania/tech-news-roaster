import { Buffer } from "node:buffer";
import {
  describeErrorDetail,
  type FailedImageSet,
  type ImageGenerationStreamEvent,
  type ImageOption,
  type ImageSet,
  parseFailedImageSet,
  parseImageGenerationStreamEvent,
  parseImageSet,
  summarizeErrorMessage,
} from "@/services/generation";
import {
  type ImageVariationProvider,
  streamUploadedImageSetForRun as streamUploadedImageSetForRunService,
  type UploadedImageOriginalPreparer,
} from "@/services/generation/image-generation-service";
import { persistImageOptionsToOwnerStorage } from "@/services/saved-runs/persist-image-set-to-owner-storage";

export const dynamic = "force-dynamic";

// ~10 MB server-side cap, validated independently of the client picker (ADR-0025).
const maxUploadBytes = 10 * 1024 * 1024;

// Accepted upload content types. A stray `image/jpg` (some browsers/OSes send it
// for `.jpg`) is tolerated and normalized to the canonical `image/jpeg`.
const allowedImageMediaTypes = new Map<string, string>([
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/png", "image/png"],
  ["image/webp", "image/webp"],
]);

type UploadedImageSetRequest = {
  bytes: Buffer;
  mediaType: string;
  runId: string;
};

/**
 * Persists a list of Image Options' bytes to owner-scoped storage and returns
 * them with their URLs rewritten to server routes. Injected so tests exercise the
 * route without a storage backend or the network.
 */
export type PersistImageOptions = (params: {
  options: ImageOption[];
  origin: string;
  runId: string;
}) => Promise<ImageOption[]>;

type UploadedImageSetStreamDependencies = {
  createUploadId?: () => string;
  now?: () => Date;
  persistImageOptions?: PersistImageOptions;
  prepareUploadedImageOriginal?: UploadedImageOriginalPreparer;
  provider?: ImageVariationProvider;
  streamUploadedImageSetForRun?: typeof streamUploadedImageSetForRunService;
};

export async function POST(request: Request) {
  return streamUploadedImageGenerationRun(request);
}

export async function streamUploadedImageGenerationRun(
  request: Request,
  dependencies: UploadedImageSetStreamDependencies = {},
) {
  const parsedRequest = await readUploadedImageSetRequest(request);

  if ("error" in parsedRequest) {
    return Response.json(
      {
        message: parsedRequest.error,
      },
      {
        status: 400,
      },
    );
  }

  const encoder = new TextEncoder();
  const streamUploadedImageSetForRun =
    dependencies.streamUploadedImageSetForRun ?? streamUploadedImageSetForRunService;
  const persistImageOptions = dependencies.persistImageOptions ?? persistImageOptionsToOwnerStorage;
  const now = dependencies.now ?? (() => new Date());
  const origin = new URL(request.url).origin;
  // One id per upload attempt, so this set's options never collide with another
  // upload on the same run. Derived from `now()` so an injected clock makes it
  // deterministic in tests.
  const uploadId = dependencies.createUploadId?.() ?? `upload-${now().getTime()}`;
  const { runId } = parsedRequest;

  const stream = new ReadableStream({
    async start(controller) {
      let imageSet: ImageSet | undefined;
      let failedImageSet: FailedImageSet | undefined;

      try {
        for await (const serviceEvent of streamUploadedImageSetForRun(
          {
            upload: {
              bytes: parsedRequest.bytes,
              mediaType: parsedRequest.mediaType,
            },
            uploadId,
          },
          {
            now,
            prepareUploadedImageOriginal: dependencies.prepareUploadedImageOriginal,
            provider: dependencies.provider,
          },
        )) {
          if (serviceEvent.type === "image-set-completed") {
            // Persist the bytes and rewrite the option URLs before emitting, so
            // both this event and the terminal state carry only server routes —
            // the saved run never holds raw bytes (ADR-0019).
            imageSet = await persistUploadedImageSet({
              imageSet: serviceEvent.imageSet,
              origin,
              persistImageOptions,
              runId,
            });
            enqueueImageGenerationEvent(controller, encoder, {
              type: "image-set-completed",
              imageSet,
            });
          } else {
            // A variation failure still persists the uploaded original, so the
            // failed set references stored bytes — the operator can see which
            // upload failed and the image they fed it (ADR-0025).
            failedImageSet = await persistUploadedFailedImageSet({
              failedImageSet: serviceEvent.failedImageSet,
              origin,
              persistImageOptions,
              runId,
              uploadId,
            });
            enqueueImageGenerationEvent(controller, encoder, {
              type: "image-set-failed",
              failedImageSet,
            });
          }
        }

        enqueueImageGenerationEvent(controller, encoder, {
          type: "image-generation-completed",
          state: {
            completedAt: now().toISOString(),
            failedImageSet,
            imageSet,
            status: imageSet ? "completed" : "failed",
          },
        });
        controller.close();
      } catch (error) {
        // A throw here (byte persistence failing, an unexpected error) would
        // otherwise abort the SSE stream, leaving the client to surface a bare
        // "Failed to fetch". Instead, report a real, debuggable failure through
        // the stream and close cleanly — so the Quiet Failure Details show why.
        console.error("[image-generation] uploaded stream failed before completion", error);

        if (!imageSet && !failedImageSet) {
          failedImageSet = buildStreamFailureImageSet({
            error,
            now,
            uploadId,
          });
          enqueueImageGenerationEvent(controller, encoder, {
            type: "image-set-failed",
            failedImageSet,
          });
        }

        enqueueImageGenerationEvent(controller, encoder, {
          type: "image-generation-completed",
          state: {
            completedAt: now().toISOString(),
            failedImageSet,
            imageSet,
            status: imageSet ? "completed" : "failed",
          },
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

async function persistUploadedImageSet({
  imageSet,
  origin,
  persistImageOptions,
  runId,
}: {
  imageSet: ImageSet;
  origin: string;
  persistImageOptions: PersistImageOptions;
  runId: string;
}): Promise<ImageSet> {
  const persistedOptions = await persistImageOptions({
    options: [...imageSet.options],
    origin,
    runId,
  });

  return parseImageSet({
    ...imageSet,
    options: persistedOptions,
    selectedImageOriginal: {
      ...imageSet.selectedImageOriginal,
      url: persistedOptions[0].url,
    },
  });
}

async function persistUploadedFailedImageSet({
  failedImageSet,
  origin,
  persistImageOptions,
  runId,
  uploadId,
}: {
  failedImageSet: FailedImageSet;
  origin: string;
  persistImageOptions: PersistImageOptions;
  runId: string;
  uploadId: string;
}): Promise<FailedImageSet> {
  const { selectedImageOriginal } = failedImageSet;

  // Preparation failed before an original existed — nothing to persist.
  if (!selectedImageOriginal) {
    return failedImageSet;
  }

  const [persistedOriginal] = await persistImageOptions({
    options: [
      {
        altText: selectedImageOriginal.altText,
        // Same option id the completed set would use, so the original is served
        // by the unchanged `/api/runs/{runId}/images/{optionId}` route.
        id: `uploaded-image-set-${uploadId}-original`,
        kind: "original",
        label: "Original",
        url: selectedImageOriginal.url,
      },
    ],
    origin,
    runId,
  });

  return parseFailedImageSet({
    ...failedImageSet,
    selectedImageOriginal: {
      ...selectedImageOriginal,
      url: persistedOriginal.url,
    },
  });
}

function buildStreamFailureImageSet({
  error,
  now,
  uploadId,
}: {
  error: unknown;
  now: () => Date;
  uploadId: string;
}): FailedImageSet {
  return parseFailedImageSet({
    debugLog: [
      ...describeErrorDetail(error),
      "Step: uploaded-image-generation-stream (persistence / streaming)",
      `Uploaded original: ${uploadId}`,
    ],
    failedAt: now().toISOString(),
    id: `failed-uploaded-image-set-${uploadId}`,
    message: summarizeErrorMessage(
      error,
      "Uploaded image generation failed before it could complete.",
    ),
    selectedImageId: `uploaded-original-${uploadId}`,
  });
}

async function readUploadedImageSetRequest(
  request: Request,
): Promise<UploadedImageSetRequest | { error: string }> {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return {
      error: "Uploaded image request must be multipart form data.",
    };
  }

  const runIdValue = formData.get("runId");
  const runId = typeof runIdValue === "string" ? runIdValue.trim() : "";

  if (!isRunLocalId(runId)) {
    return {
      error: "A valid parent run id is required.",
    };
  }

  const file = formData.get("image");

  if (!(file instanceof Blob)) {
    return {
      error: "Upload exactly one image file.",
    };
  }

  const mediaType = allowedImageMediaTypes.get(file.type.trim().toLowerCase());

  if (!mediaType) {
    return {
      error: "Uploaded image must be a JPG, PNG, or WebP file.",
    };
  }

  if (file.size > maxUploadBytes) {
    return {
      error: "Uploaded image is too large (max 10 MB).",
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  if (bytes.byteLength === 0) {
    return {
      error: "Uploaded image was empty.",
    };
  }

  // Re-check against the decoded bytes — `file.size` is a hint, not a guarantee.
  if (bytes.byteLength > maxUploadBytes) {
    return {
      error: "Uploaded image is too large (max 10 MB).",
    };
  }

  return {
    bytes,
    mediaType,
    runId,
  };
}

function isRunLocalId(value: string): boolean {
  // A run-local id, not a raw URL, and safe as a storage path segment.
  return value.length > 0 && !value.includes("/") && !/^https?:\/\//i.test(value);
}

function enqueueImageGenerationEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: ImageGenerationStreamEvent,
) {
  const validatedEvent = parseImageGenerationStreamEvent(event);

  controller.enqueue(
    encoder.encode(`event: ${validatedEvent.type}\ndata: ${JSON.stringify(validatedEvent)}\n\n`),
  );
}
