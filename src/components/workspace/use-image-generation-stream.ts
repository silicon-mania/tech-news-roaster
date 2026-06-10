"use client";

import type { Dispatch, SetStateAction } from "react";
import type { ImageGenerationInput } from "@/services/generation";
import { parseImageGenerationStreamEvent } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import {
  buildImageGenerationParentRun,
  collectSelectedImageOriginals,
  getImageGenerationStartedAt,
} from "@/services/workspace";
import { upsertById } from "@/utils/upsert-by-id";

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
          const imageSets = upsertById(run.imageSets ?? [], event.imageSet);
          const selectedImageOriginals = upsertById(
            run.selectedImageOriginals ?? [],
            event.imageSet.selectedImageOriginal,
          );
          const updatedRun: GenerationRun = {
            ...run,
            imageModelProvenance: event.imageSet.imageModelProvenance,
            imageSets,
            phase: "image-generation-running",
            selectedImageOriginals,
          };
          scheduleRunAutosave(updatedRun);

          return updatedRun;
        }

        if (event.type === "image-set-failed") {
          const failedImageSets = upsertById(run.failedImageSets ?? [], event.failedImageSet);
          const selectedImageOriginals = event.failedImageSet.selectedImageOriginal
            ? upsertById(
                run.selectedImageOriginals ?? [],
                event.failedImageSet.selectedImageOriginal,
              )
            : run.selectedImageOriginals;
          const updatedRun: GenerationRun = {
            ...run,
            failedImageSets,
            phase: "image-generation-running",
            selectedImageOriginals,
          };
          scheduleRunAutosave(updatedRun);

          return updatedRun;
        }

        const imageGenerationState: NonNullable<GenerationRun["imageGenerationState"]> = {
          selectedImageIds: input.selectedImageIds,
          startedAt: getImageGenerationStartedAt(run) ?? new Date().toISOString(),
          userImagePrompt: input.userImagePrompt,
          completedAt: event.state.completedAt,
          status: event.state.status,
        };

        const updatedRun: GenerationRun = {
          ...run,
          failedImageSets: event.state.failedImageSets,
          imageGenerationState,
          imageModelProvenance:
            event.state.imageSets.at(0)?.imageModelProvenance ?? run.imageModelProvenance,
          imageSets: event.state.imageSets,
          phase:
            event.state.status === "completed"
              ? "image-generation-complete"
              : "image-generation-partially-failed",
          selectedImageOriginals: collectSelectedImageOriginals({
            failedImageSets: event.state.failedImageSets,
            imageSets: event.state.imageSets,
            currentSelectedImageOriginals: run.selectedImageOriginals ?? [],
          }),
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

        const failedImageSets = input.selectedImageIds.map((selectedImageId) => ({
          id: `failed-image-set-${selectedImageId}`,
          failedAt,
          message,
          selectedImageId,
        }));

        const updatedRun: GenerationRun = {
          ...run,
          failedImageSets,
          imageGenerationState: {
            selectedImageIds: input.selectedImageIds,
            startedAt: getImageGenerationStartedAt(run) ?? failedAt,
            userImagePrompt: input.userImagePrompt,
            completedAt: failedAt,
            status: "failed",
          },
          phase: "image-generation-partially-failed",
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
