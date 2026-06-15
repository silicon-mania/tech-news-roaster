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
} from "@/services/generation";
import {
  type ImageVariationProvider,
  type SelectedImageOriginalPreparer,
  streamImageSetForRun as streamImageSetForRunService,
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
  streamImageSetForRun?: typeof streamImageSetForRunService;
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
  const streamImageSetForRun = dependencies.streamImageSetForRun ?? streamImageSetForRunService;
  const now = dependencies.now ?? (() => new Date());
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
            imageSet = serviceEvent.imageSet;
            enqueueImageGenerationEvent(controller, encoder, {
              type: "image-set-completed",
              imageSet: serviceEvent.imageSet,
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
