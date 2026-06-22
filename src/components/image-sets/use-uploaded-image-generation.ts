"use client";

import { type Dispatch, type SetStateAction, useState } from "react";
import { toast } from "sonner";
import {
  describeErrorDetail,
  parseImageGenerationStreamEvent,
  summarizeErrorMessage,
  type UploadedImageSetEntry,
} from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";

const uploadStreamUrl = "/api/generation-runs/image-generation/upload";

/**
 * Owns the streaming upload→generate lifecycle for Uploaded Image Sets (ADR-0025)
 * and the single in-flight state shared across a surface. Posting the file streams
 * Server-Sent Events that mirror the image-generation contract; on the terminal
 * event the streamed entry (completed or retained failure) is folded into the
 * run's `uploadedImageSets` and the whole run payload is persisted through the
 * surface's existing save path (`persistRun` — the sidebar's immediate save or the
 * workspace autosave). Generation is serialized — `generatingRunId` disables the
 * trigger until it resolves — so concurrent appends can't clobber each other.
 *
 * Surface-agnostic: it never touches the DOM and takes the run-list setter plus a
 * persist callback, so the sidebar and the workspace drive it identically.
 */
export function useUploadedImageGeneration({
  persistRun,
  setRuns,
  uploadFetcher = fetch,
}: {
  persistRun: (run: GenerationRun) => void;
  setRuns: Dispatch<SetStateAction<GenerationRun[]>>;
  uploadFetcher?: typeof fetch;
}) {
  const [generatingRunId, setGeneratingRunId] = useState<string | null>(null);

  function appendEntry(runId: string, entry: UploadedImageSetEntry) {
    setRuns((currentRuns) =>
      currentRuns.map((run) => {
        if (run.id !== runId) {
          return run;
        }

        const updatedRun: GenerationRun = {
          ...run,
          uploadedImageSets: [...(run.uploadedImageSets ?? []), entry],
        };
        persistRun(updatedRun);

        return updatedRun;
      }),
    );
  }

  // Fold only on the terminal event: it carries the persisted Image Set (with
  // server-route URLs) or the retained failed set, so the run never holds raw
  // bytes and an entry is appended exactly once.
  function consumeUploadEvent(runId: string, rawEvent: string) {
    const dataLines = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.replace(/^data: /, ""));

    if (dataLines.length === 0) {
      return;
    }

    const event = parseImageGenerationStreamEvent(JSON.parse(dataLines.join("\n")));

    if (event.type !== "image-generation-completed") {
      return;
    }

    if (event.state.status === "completed" && event.state.imageSet) {
      appendEntry(runId, { imageSet: event.state.imageSet, status: "completed" });

      return;
    }

    if (event.state.failedImageSet) {
      appendEntry(runId, { failedImageSet: event.state.failedImageSet, status: "failed" });
      toast.error("Couldn't generate from your uploaded image");
    }
  }

  function consumeUploadEvents(runId: string, rawEvents: string) {
    for (const rawEvent of rawEvents.trim().split("\n\n")) {
      if (rawEvent.trim().length > 0) {
        consumeUploadEvent(runId, rawEvent);
      }
    }
  }

  async function uploadImage(runId: string, file: File) {
    // One generation at a time per surface (no server-side locking, ADR-0025).
    if (generatingRunId) {
      return;
    }

    setGeneratingRunId(runId);

    try {
      const formData = new FormData();
      formData.append("runId", runId);
      formData.append("image", file);

      const response = await uploadFetcher(uploadStreamUrl, {
        body: formData,
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readUploadErrorMessage(response));
      }

      if (!response.body) {
        consumeUploadEvents(runId, await response.text());

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
          consumeUploadEvent(runId, bufferedText.slice(0, eventBoundary));
          bufferedText = bufferedText.slice(eventBoundary + 2);
          eventBoundary = bufferedText.indexOf("\n\n");
        }

        if (done) {
          const finalEvent = bufferedText.trim();

          if (finalEvent.length > 0) {
            consumeUploadEvent(runId, finalEvent);
          }

          break;
        }
      }
    } catch (error) {
      // The stream dropped before the server reported a result — retain a failed
      // set so the attempt is visible, and toast quietly (retry is a fresh upload).
      const failedAt = new Date().toISOString();
      const idSuffix = failedAt.replaceAll(/[^0-9a-z]/gi, "");

      appendEntry(runId, {
        failedImageSet: {
          debugLog: [
            ...describeErrorDetail(error),
            `Step: client uploaded-image-generation stream (POST ${uploadStreamUrl})`,
            "The stream ended before the server reported a result — check the server logs for the underlying error.",
          ],
          failedAt,
          id: `failed-uploaded-image-set-client-${idSuffix}`,
          message: summarizeErrorMessage(error, "Uploaded image generation failed."),
          selectedImageId: `uploaded-original-client-${idSuffix}`,
        },
        status: "failed",
      });
      toast.error("Couldn't generate from your uploaded image");
    } finally {
      setGeneratingRunId(null);
    }
  }

  return { generatingRunId, uploadImage };
}

async function readUploadErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: unknown };

    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    return "Uploaded image generation failed.";
  }

  return "Uploaded image generation failed.";
}
