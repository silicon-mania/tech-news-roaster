"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ImageGenerationInput } from "@/services/generation";
import { parseImageGenerationStreamEvent } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { buildImageGenerationParentRun, getImageGenerationStartedAt } from "@/services/workspace";

export function useImageGenerationStream({
  scheduleRunAutosave,
  setRuns,
  streamFetcher,
}: {
  scheduleRunAutosave: (run: GenerationRun) => void;
  setRuns: Dispatch<SetStateAction<GenerationRun[]>>;
  streamFetcher: typeof fetch;
}) {
  async function streamImageGeneration(input: ImageGenerationInput, parentRun: GenerationRun) {
    try {
      const response = await streamFetcher("/api/generation-runs/image-generation/stream", {
        body: JSON.stringify({
          input,
          parentRun: buildImageGenerationParentRun(parentRun),
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readImageGenerationErrorMessage(response));
      }

      if (!response.body) {
        await consumeImageGenerationEvents(await response.text(), input);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let bufferedText = "";

      while (true) {
        const { done, value } = await reader.read();

        bufferedText += decoder.decode(value, { stream: !done });

        let eventBoundary = bufferedText.indexOf("\n\n");

        while (eventBoundary !== -1) {
          const rawEvent = bufferedText.slice(0, eventBoundary);

          consumeImageGenerationEvent(rawEvent, input);
          bufferedText = bufferedText.slice(eventBoundary + 2);
          eventBoundary = bufferedText.indexOf("\n\n");
        }

        if (done) {
          const finalEvent = bufferedText.trim();

          if (finalEvent.length > 0) {
            consumeImageGenerationEvent(finalEvent, input);
          }

          return;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim() ? error.message : "Image generation failed.";

      markImageGenerationFailed(input, message);
    }
  }

  async function consumeImageGenerationEvents(rawEvents: string, input: ImageGenerationInput) {
    for (const rawEvent of rawEvents.trim().split("\n\n")) {
      if (rawEvent.trim().length > 0) {
        consumeImageGenerationEvent(rawEvent, input);
      }
    }
  }

  function consumeImageGenerationEvent(rawEvent: string, input: ImageGenerationInput) {
    const dataLines = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.replace(/^data: /, ""));

    if (dataLines.length === 0) {
      return;
    }

    const event = parseImageGenerationStreamEvent(JSON.parse(dataLines.join("\n")));

    setRuns((currentRuns) =>
      currentRuns.map((run) => {
        if (run.id !== input.parentRunId) {
          return run;
        }

        if (event.type === "image-set-completed") {
          const updatedRun: GenerationRun = {
            ...run,
            imageModelProvenance: event.imageSet.imageModelProvenance,
            imageSet: event.imageSet,
            phase: "image-generation-running",
            selectedImageOriginal: event.imageSet.selectedImageOriginal,
          };
          scheduleRunAutosave(updatedRun);

          return updatedRun;
        }

        if (event.type === "image-set-failed") {
          const updatedRun: GenerationRun = {
            ...run,
            failedImageSet: event.failedImageSet,
            phase: "image-generation-running",
            selectedImageOriginal:
              event.failedImageSet.selectedImageOriginal ?? run.selectedImageOriginal,
          };
          scheduleRunAutosave(updatedRun);

          return updatedRun;
        }

        const imageGenerationState: NonNullable<GenerationRun["imageGenerationState"]> = {
          selectedImageId: input.selectedImageId,
          startedAt: getImageGenerationStartedAt(run) ?? new Date().toISOString(),
          userImagePrompt: input.userImagePrompt,
          completedAt: event.state.completedAt,
          status: event.state.status,
        };

        const updatedRun: GenerationRun = {
          ...run,
          failedImageSet: event.state.failedImageSet,
          imageGenerationState,
          imageModelProvenance:
            event.state.imageSet?.imageModelProvenance ?? run.imageModelProvenance,
          imageSet: event.state.imageSet,
          phase:
            event.state.status === "completed"
              ? "image-generation-complete"
              : "image-generation-failed",
          selectedImageOriginal:
            event.state.imageSet?.selectedImageOriginal ??
            event.state.failedImageSet?.selectedImageOriginal ??
            run.selectedImageOriginal,
        };
        scheduleRunAutosave(updatedRun);

        return updatedRun;
      }),
    );
  }

  function markImageGenerationFailed(input: ImageGenerationInput, message: string) {
    const failedAt = new Date().toISOString();

    setRuns((currentRuns) =>
      currentRuns.map((run) => {
        if (run.id !== input.parentRunId) {
          return run;
        }

        const updatedRun: GenerationRun = {
          ...run,
          failedImageSet: {
            id: `failed-image-set-${input.selectedImageId}`,
            failedAt,
            message,
            selectedImageId: input.selectedImageId,
          },
          imageGenerationState: {
            selectedImageId: input.selectedImageId,
            startedAt: getImageGenerationStartedAt(run) ?? failedAt,
            userImagePrompt: input.userImagePrompt,
            completedAt: failedAt,
            status: "failed",
          },
          phase: "image-generation-failed",
        };
        scheduleRunAutosave(updatedRun);

        return updatedRun;
      }),
    );
  }

  return { streamImageGeneration };
}

async function readImageGenerationErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: unknown };

    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    return "Image generation failed.";
  }

  return "Image generation failed.";
}
