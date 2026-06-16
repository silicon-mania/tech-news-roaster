import { ZodError } from "zod";
import {
  describeErrorDetail,
  type FailedImageSet,
  type ImageGenerationInput,
  type ImageGenerationParentRun,
  type ImageGenerationStreamEvent,
  type ImageSet,
  parseFailedImageSet,
  parseImageGenerationInput,
  parseImageGenerationParentRun,
  parseImageGenerationStreamEvent,
  summarizeErrorMessage,
} from "@/services/generation";
import {
  type ImageVariationProvider,
  type SelectedImageOriginalPreparer,
  streamImageSetForRun as streamImageSetForRunService,
} from "@/services/generation/image-generation-service";
import { resolveImageBytesStore } from "@/services/saved-runs/image-bytes-store";
import { persistImageSetBytes } from "@/services/saved-runs/persist-image-set-bytes";

export const dynamic = "force-dynamic";

type ImageGenerationStreamRequest = {
  input: ImageGenerationInput;
  parentRun: ImageGenerationParentRun;
};

/**
 * Persists an Image Set's bytes to owner-scoped object storage and returns the
 * Image Set with its option URLs rewritten to server routes. Injected so tests
 * exercise the route without a storage backend or the network.
 */
export type PersistImageSet = (params: {
  imageSet: ImageSet;
  origin: string;
  runId: string;
}) => Promise<ImageSet>;

type ImageGenerationStreamDependencies = {
  now?: () => Date;
  persistImageSet?: PersistImageSet;
  prepareSelectedImageOriginal?: SelectedImageOriginalPreparer;
  provider?: ImageVariationProvider;
  streamImageSetForRun?: typeof streamImageSetForRunService;
};

/**
 * The default persistence step: bytes land in the signed-in operator's object
 * storage and every option URL becomes a `/api/runs/.../images/...` route, so
 * the streamed (and later saved) Image Set never carries raw bytes or a storage
 * key. Throws when Supabase is configured but no operator is signed in.
 */
export async function persistImageSetToObjectStorage({
  imageSet,
  origin,
  runId,
}: {
  imageSet: ImageSet;
  origin: string;
  runId: string;
}): Promise<ImageSet> {
  const resolution = await resolveImageBytesStore();

  if ("unauthorized" in resolution) {
    throw new Error("Operator authentication required.");
  }

  return persistImageSetBytes({ imageSet, origin, runId, store: resolution.store });
}

export async function POST(request: Request) {
  return streamImageGenerationRun(request);
}

export async function streamImageGenerationRun(
  request: Request,
  dependencies: ImageGenerationStreamDependencies = {},
) {
  const parsedRequest = await readImageGenerationStreamRequest(request);

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
  const streamImageSetForRun = dependencies.streamImageSetForRun ?? streamImageSetForRunService;
  const persistImageSet = dependencies.persistImageSet ?? persistImageSetToObjectStorage;
  const now = dependencies.now ?? (() => new Date());
  const origin = new URL(request.url).origin;
  const stream = new ReadableStream({
    async start(controller) {
      let imageSet: ImageSet | undefined;
      let failedImageSet: FailedImageSet | undefined;

      try {
        for await (const serviceEvent of streamImageSetForRun(
          {
            input: parsedRequest.input,
            parentRun: parsedRequest.parentRun,
          },
          {
            now,
            prepareSelectedImageOriginal: dependencies.prepareSelectedImageOriginal,
            provider: dependencies.provider,
          },
        )) {
          if (serviceEvent.type === "image-set-completed") {
            // Persist the bytes and rewrite the option URLs before emitting, so
            // both this event and the terminal state carry only server routes —
            // the saved run never holds raw bytes (ADR-0019).
            imageSet = await persistImageSet({
              imageSet: serviceEvent.imageSet,
              origin,
              runId: parsedRequest.parentRun.id,
            });
            enqueueImageGenerationEvent(controller, encoder, {
              type: "image-set-completed",
              imageSet,
            });
          } else {
            failedImageSet = serviceEvent.failedImageSet;
            enqueueImageGenerationEvent(controller, encoder, {
              type: "image-set-failed",
              failedImageSet: serviceEvent.failedImageSet,
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
        console.error("[image-generation] stream failed before completion", error);

        if (!imageSet && !failedImageSet) {
          failedImageSet = buildStreamFailureImageSet({
            error,
            now,
            selectedImageId: parsedRequest.input.selectedImageId,
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

function buildStreamFailureImageSet({
  error,
  now,
  selectedImageId,
}: {
  error: unknown;
  now: () => Date;
  selectedImageId: string;
}): FailedImageSet {
  return parseFailedImageSet({
    debugLog: [
      ...describeErrorDetail(error),
      "Step: image-generation-stream (persistence / streaming)",
      `Selected image: ${selectedImageId}`,
    ],
    failedAt: now().toISOString(),
    id: `failed-image-set-${selectedImageId}`,
    message: summarizeErrorMessage(error, "Image generation failed before it could complete."),
    selectedImageId,
  });
}

async function readImageGenerationStreamRequest(
  request: Request,
): Promise<ImageGenerationStreamRequest | { error: string }> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      error: "Image generation request body must be valid JSON.",
    };
  }

  try {
    const bodyRecord = toRecord(body);
    const parentRun = parseImageGenerationParentRun(bodyRecord.parentRun);
    const input = parseImageGenerationInput(bodyRecord.input);
    const startValidationError = validateImageGenerationStart({
      input,
      parentRun,
    });

    if (startValidationError) {
      return {
        error: startValidationError,
      };
    }

    return {
      input,
      parentRun,
    };
  } catch (error) {
    return {
      error: normalizeRequestValidationError(error),
    };
  }
}

function validateImageGenerationStart({ input, parentRun }: ImageGenerationStreamRequest) {
  if (parentRun.id !== input.parentRunId) {
    return "Image generation input does not match the parent run.";
  }

  if (!parentRun.imageOriginalCandidates || parentRun.imageOriginalCandidates.length === 0) {
    return "Image Generation is not available until image original candidates are ready.";
  }

  if (hasImageGenerationStarted(parentRun)) {
    return "Image Generation has already started for this run.";
  }

  const isSelectedImageAvailable = parentRun.imageOriginalCandidates.some(
    (candidate) => candidate.id === input.selectedImageId,
  );

  if (!isSelectedImageAvailable) {
    return `Selected image ID ${input.selectedImageId} is not available on the parent run.`;
  }

  return null;
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

function hasImageGenerationStarted(run: ImageGenerationParentRun) {
  return (
    (run.imageGenerationState && run.imageGenerationState.status !== "not-started") ||
    Boolean(run.imageSet) ||
    Boolean(run.failedImageSet) ||
    Boolean(run.selectedImageOriginal) ||
    run.phase === "image-generation-running" ||
    run.phase === "image-generation-failed" ||
    run.phase === "image-generation-complete"
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Image generation request body must be an object.");
  }

  return value as Record<string, unknown>;
}

function normalizeRequestValidationError(error: unknown) {
  if (error instanceof ZodError) {
    const promptIssue = error.issues.find((issue) => issue.path.includes("userImagePrompt"));
    const selectedImageIssue = error.issues.find((issue) => issue.path.includes("selectedImageId"));

    if (promptIssue) {
      return "User Image Prompt is required.";
    }

    if (selectedImageIssue) {
      return "Select an image original.";
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Image generation request is invalid.";
}
