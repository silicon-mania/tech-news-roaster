"use client";

import { Check, Loader2, X } from "lucide-react";
import Image from "next/image";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
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
    <p className="inline-flex items-center gap-1.5 text-slate-500 text-xs" role="status">
      {kind === "loading" ? (
        <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-300" />
      ) : null}
      {kind === "success" ? (
        <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      ) : null}
      {kind === "failed" ? <X aria-hidden className="h-3.5 w-3.5 shrink-0 text-rose-400" /> : null}
      <span>{label}</span>
    </p>
  );
}

export function ImageGenerationArea({
  parentRunId,
  run,
  onStartImageGeneration,
}: {
  parentRunId: string;
  run: GenerationRun;
  onStartImageGeneration: (input: ImageGenerationInput) => void;
}) {
  const images = run.newsLinkedImages ?? [];
  const imageSets = run.imageSets ?? [];
  const failedImageSets = run.failedImageSets ?? [];
  const imageGenerationStatus = run.imageGenerationState?.status;
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
      <h1 className="font-medium text-slate-100 text-lg md:text-2xl">Image generation</h1>
      <aside aria-label="Image generation area" className="grid gap-3 bg-slate-950/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-slate-500 text-xs">
            {run.imageModelProvenance ? formatImageModelProvenance(run.imageModelProvenance) : null}
          </p>
          <ImageGenerationAreaStatus run={run} />
        </div>
        {imageSets.length > 0 || failedImageSets.length > 0 ? (
          <ImageResultsArea failedImageSets={failedImageSets} imageSets={imageSets} />
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
                      className={`group grid w-full gap-1.5 rounded-sm text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300/25 ${
                        selectedImageIds.includes(image.id)
                          ? "bg-sky-300/10 ring-1 ring-sky-300/60"
                          : "bg-slate-950/40"
                      }`}>
                      <span className="relative aspect-[4/3] overflow-hidden rounded-sm bg-slate-900">
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
                      <span className="px-0.5 text-slate-400 text-xs">
                        {getImageTitle(image, index)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {selectionMessage ? (
              <p className="text-slate-400 text-xs" role="status">
                {selectionMessage}
              </p>
            ) : null}
            <form className="grid gap-2" onSubmit={submitImageGeneration}>
              <label
                className="font-medium text-slate-300 text-xs"
                htmlFor={`${parentRunId}-user-image-prompt`}>
                User Image Prompt
              </label>
              <textarea
                id={`${parentRunId}-user-image-prompt`}
                aria-label="User Image Prompt"
                value={userImagePrompt}
                onChange={(event) => setUserImagePrompt(event.target.value)}
                className="min-h-20 resize-y rounded-sm border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-100 text-sm leading-6 outline-none transition placeholder:text-slate-600 focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/20"
                placeholder="Describe the visual variation to generate."
              />
              <button
                type="submit"
                disabled={!canStartImageGeneration}
                className="justify-self-start rounded-sm border border-slate-700 bg-slate-100 px-3 py-2 font-medium text-slate-950 text-sm transition hover:bg-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-500">
                Image Generation
              </button>
            </form>
          </>
        ) : null}
      </aside>
    </>
  );
}
