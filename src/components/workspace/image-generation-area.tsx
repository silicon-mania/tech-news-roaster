"use client";

import { Check, X } from "lucide-react";
import Image from "next/image";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ImageGenerationInput } from "@/services/generation";
import { parseImageGenerationInput } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { getRunPhaseLabel } from "@/services/workspace";
import { formatImageModelProvenance, getDisplayImageUrl, getImageTitle } from "./image-helpers";
import { ImageResultsArea } from "./image-results-area";

type ImageGenerationAreaStatusKind = "loading" | "success" | "failed";

function getImageGenerationAreaStatus(run: GenerationRun): {
  kind: ImageGenerationAreaStatusKind;
  label: string;
} {
  const label = getRunPhaseLabel(run);
  const imageGenerationStatus = run.imageGenerationState?.status;

  if (run.phase === "failed" || run.status === "failed") {
    return { kind: "failed", label };
  }

  if (
    imageGenerationStatus === "failed" ||
    imageGenerationStatus === "partially-failed" ||
    run.phase === "image-generation-partially-failed"
  ) {
    return { kind: "failed", label };
  }

  if (imageGenerationStatus === "completed" || run.phase === "image-generation-complete") {
    return { kind: "success", label };
  }

  if (
    imageGenerationStatus === "running" ||
    imageGenerationStatus === "not-started" ||
    run.phase === "image-generation-running" ||
    run.phase === "enrichment-running" ||
    run.phase === "text-generation-running" ||
    run.phase === "waiting-for-image-selection" ||
    (!run.phase && run.status === "running")
  ) {
    return { kind: "loading", label };
  }

  if (run.status === "completed" && (run.imageSets?.length ?? 0) > 0) {
    return { kind: "success", label };
  }

  return { kind: "loading", label };
}

function ImageGenerationAreaStatus({ run }: { run: GenerationRun }) {
  const { kind, label } = getImageGenerationAreaStatus(run);

  return (
    <p className="inline-flex items-center gap-1.5 text-muted-foreground text-xs" role="status">
      {kind === "success" ? (
        <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-success" />
      ) : null}
      {kind === "failed" ? (
        <X aria-hidden className="h-3.5 w-3.5 shrink-0 text-destructive" />
      ) : null}
      <span>{label}</span>
    </p>
  );
}

export function ImageGenerationArea({
  parentRunId,
  run,
  onSelectedGeneratedImageChange,
  onStartImageGeneration,
}: {
  parentRunId: string;
  run: GenerationRun;
  onSelectedGeneratedImageChange: (runId: string, imageOptionId: string | null) => void;
  onStartImageGeneration: (input: ImageGenerationInput) => void;
}) {
  const images = run.newsLinkedImages ?? [];
  const imageSets = run.imageSets ?? [];
  const failedImageSets = run.failedImageSets ?? [];
  const imageGenerationState = run.imageGenerationState;
  const imageGenerationStatus = imageGenerationState?.status;
  const expectedImageSetCount =
    imageGenerationState?.status === "running" ? imageGenerationState.selectedImageIds.length : 0;
  const canSelectSourceImages =
    images.length > 0 && (!imageGenerationStatus || imageGenerationStatus === "not-started");
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [userImagePrompt, setUserImagePrompt] = useState("");
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const trimmedUserImagePrompt = userImagePrompt.trim();
  const canStartImageGeneration = selectedImageIds.length > 0 && trimmedUserImagePrompt.length > 0;

  useEffect(() => {
    const availableImageIds = new Set(images.map((image) => image.id));

    setSelectedImageIds((currentImageIds) =>
      currentImageIds.filter((imageId) => availableImageIds.has(imageId)),
    );
  }, [images]);

  function toggleImageSelection(imageId: string) {
    setSelectedImageIds((currentImageIds) => {
      if (currentImageIds.includes(imageId)) {
        setSelectionMessage(null);
        return currentImageIds.filter((currentImageId) => currentImageId !== imageId);
      }

      if (currentImageIds.length >= 2) {
        setSelectionMessage("Choose up to two images.");
        return currentImageIds;
      }

      setSelectionMessage(null);
      return [...currentImageIds, imageId];
    });
  }

  function submitImageGeneration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canStartImageGeneration) {
      return;
    }

    onStartImageGeneration(
      parseImageGenerationInput({
        parentRunId,
        selectedImageIds,
        userImagePrompt: trimmedUserImagePrompt,
      }),
    );
  }

  return (
    <>
      <h1 className="font-medium text-foreground text-lg md:text-2xl">Image generation</h1>
      <aside aria-label="Image generation area" className="grid gap-3 bg-card/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-muted-foreground text-xs">
            {run.imageModelProvenance ? formatImageModelProvenance(run.imageModelProvenance) : null}
          </p>
          <ImageGenerationAreaStatus run={run} />
        </div>
        {imageSets.length > 0 || failedImageSets.length > 0 || expectedImageSetCount > 0 ? (
          <ImageResultsArea
            expectedImageSetCount={expectedImageSetCount}
            failedImageSets={failedImageSets}
            imageSets={imageSets}
            selectedGeneratedImageOptionId={run.selectedGeneratedImage?.imageOptionId ?? null}
            onSelectedGeneratedImageChange={(imageOptionId) =>
              onSelectedGeneratedImageChange(parentRunId, imageOptionId)
            }
          />
        ) : null}
        {canSelectSourceImages ? (
          <>
            <div className="overflow-x-auto pb-2">
              <ul className="flex w-max gap-2 pr-2">
                {images.map((image, index) => (
                  <li
                    className="w-[min(70vw,18rem)] shrink-0 lg:w-[min(18vw,300px)]"
                    key={image.id}>
                    <button
                      type="button"
                      aria-label={`Select ${getImageTitle(image, index)} for image generation`}
                      aria-pressed={selectedImageIds.includes(image.id)}
                      onClick={() => toggleImageSelection(image.id)}
                      className={`group grid w-full gap-1.5 rounded-md text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                        selectedImageIds.includes(image.id)
                          ? "bg-primary/10 ring-1 ring-primary/60"
                          : "bg-card/50"
                      }`}>
                      <span className="relative aspect-[4/3] overflow-hidden rounded-md bg-secondary">
                        <Image
                          alt={image.altText ?? image.title ?? `News-linked image ${index + 1}`}
                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                          height={240}
                          loading={index === 0 ? "eager" : "lazy"}
                          src={getDisplayImageUrl(image, index)}
                          unoptimized
                          width={320}
                        />
                      </span>
                      <span className="px-0.5 text-muted-foreground text-xs">
                        {getImageTitle(image, index)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {selectionMessage ? (
              <p className="text-muted-foreground text-xs" role="status">
                {selectionMessage}
              </p>
            ) : null}
            <form className="grid gap-2" onSubmit={submitImageGeneration}>
              <label
                className="font-medium text-foreground/80 text-xs"
                htmlFor={`${parentRunId}-user-image-prompt`}>
                User Image Prompt
              </label>
              <Textarea
                id={`${parentRunId}-user-image-prompt`}
                aria-label="User Image Prompt"
                value={userImagePrompt}
                onChange={(event) => setUserImagePrompt(event.target.value)}
                className="min-h-20 resize-y rounded-md border-transparent bg-card/80 px-3 py-2 text-sm leading-6 placeholder:text-muted-foreground/60 dark:bg-card/80"
                placeholder="Describe the visual variation to generate."
              />
              <Button
                className="justify-self-start"
                disabled={!canStartImageGeneration}
                type="submit">
                Start image generation
              </Button>
            </form>
          </>
        ) : null}
      </aside>
    </>
  );
}
