import { ZodError } from "zod";
import {
  type FailedImageSet,
  type ImageGenerationInput,
  type ImageGenerationParentRun,
  type ImageGenerationStreamEvent,
  type ImageSet,
  parseImageGenerationInput,
  parseImageGenerationParentRun,
  parseImageGenerationStreamEvent,
} from "@/services/generation/generation-events";
import {
  type ImageVariationProvider,
  type SelectedImageOriginalPreparer,
  streamImageSetsForRun as streamImageSetsForRunService,
} from "@/services/generation/image-generation-service";

export const dynamic = "force-dynamic";

type ImageGenerationStreamRequest = {
  input: ImageGenerationInput;
  parentRun: ImageGenerationParentRun;
};

type ImageGenerationStreamDependencies = {
  now?: () => Date;
  prepareSelectedImageOriginal?: SelectedImageOriginalPreparer;
  provider?: ImageVariationProvider;
  streamImageSetsForRun?: typeof streamImageSetsForRunService;
};

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
  const streamImageSetsForRun = dependencies.streamImageSetsForRun ?? streamImageSetsForRunService;
  const now = dependencies.now ?? (() => new Date());
  const stream = new ReadableStream({
    async start(controller) {
      const imageSets: ImageSet[] = [];
      const failedImageSets: FailedImageSet[] = [];

      try {
        for await (const serviceEvent of streamImageSetsForRun(
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
            imageSets.push(serviceEvent.imageSet);
            enqueueImageGenerationEvent(controller, encoder, {
              type: "image-set-completed",
              imageSet: serviceEvent.imageSet,
            });
          } else {
            failedImageSets.push(serviceEvent.failedImageSet);
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
            failedImageSets,
            imageSets,
            status: inferTerminalStatus({ failedImageSets, imageSets }),
          },
        });
        controller.close();
      } catch (error) {
        controller.error(error);
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

  if (!parentRun.newsLinkedImages || parentRun.newsLinkedImages.length === 0) {
    return "Image Generation is not available until enrichment provides images.";
  }

  if (hasImageGenerationStarted(parentRun)) {
    return "Image Generation has already started for this run.";
  }

  const availableImageIds = new Set(parentRun.newsLinkedImages.map((image) => image.id));
  const unavailableImageId = input.selectedImageIds.find(
    (selectedImageId) => !availableImageIds.has(selectedImageId),
  );

  if (unavailableImageId) {
    return `Selected image ID ${unavailableImageId} is not available on the parent run.`;
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

function inferTerminalStatus({
  failedImageSets,
  imageSets,
}: {
  failedImageSets: FailedImageSet[];
  imageSets: ImageSet[];
}) {
  if (imageSets.length > 0 && failedImageSets.length === 0) {
    return "completed";
  }

  if (imageSets.length > 0 && failedImageSets.length > 0) {
    return "partially-failed";
  }

  return "failed";
}

function hasImageGenerationStarted(run: ImageGenerationParentRun) {
  return (
    (run.imageGenerationState && run.imageGenerationState.status !== "not-started") ||
    (run.imageSets?.length ?? 0) > 0 ||
    (run.failedImageSets?.length ?? 0) > 0 ||
    (run.selectedImageOriginals?.length ?? 0) > 0 ||
    run.phase === "image-generation-running" ||
    run.phase === "image-generation-partially-failed" ||
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
    const selectedImageIssue = error.issues.find((issue) =>
      issue.path.includes("selectedImageIds"),
    );

    if (promptIssue) {
      return "User Image Prompt is required.";
    }

    if (selectedImageIssue) {
      return "Select one or two images.";
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Image generation request is invalid.";
}
