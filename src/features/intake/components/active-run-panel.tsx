"use client";

import { Check, ChevronLeft, ChevronRight, Download, Expand, Loader2, X } from "lucide-react";
import Image from "next/image";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type {
  FailedImageSet,
  GenerationResultStates,
  ImageGenerationInput,
  ImageModelProvenance,
  ImageSet,
  NewsLinkedImage,
} from "@/features/generation/generation-events";
import { draftTarget, parseImageGenerationInput } from "@/features/generation/generation-events";
import { getRunPhaseLabel } from "../run-phase";
import type { GenerationRun } from "../types";
import { DraftComparison } from "./draft-comparison";

type ActiveRunPanelProps = {
  activeRun: GenerationRun | null;
  onDraftTextChange: (draftId: string, text: string) => void;
  onStartImageGeneration: (input: ImageGenerationInput) => void;
};

export function ActiveRunPanel({
  activeRun,
  onDraftTextChange,
  onStartImageGeneration,
}: ActiveRunPanelProps) {
  if (!activeRun) {
    return <section aria-label="Empty draft canvas" className="min-h-72 sm:min-h-88" />;
  }

  const sourceTweetPreview = activeRun.sourceTweet ? (
    <SourceTweetPreview text={activeRun.sourceTweet.text} />
  ) : null;
  const hasImageGenerationContent = Boolean(
    activeRun.newsLinkedImages?.length ||
    activeRun.imageSets?.length ||
    activeRun.failedImageSets?.length,
  );
  const imageGenerationArea = hasImageGenerationContent ? (
    <ImageGenerationArea
      parentRunId={activeRun.id}
      run={activeRun}
      onStartImageGeneration={onStartImageGeneration}
    />
  ) : null;

  if (activeRun.status === "running") {
    return (
      <section className="mx-auto grid w-full max-w-5xl gap-3 self-start">
        {sourceTweetPreview}
        <RunWorkspaceLayout imageGenerationArea={imageGenerationArea}>
          <GenerationWaitingState run={activeRun} />
        </RunWorkspaceLayout>
      </section>
    );
  }

  if (activeRun.status === "failed") {
    return (
      <section className="mx-auto grid w-full max-w-5xl gap-3 self-start">
        {sourceTweetPreview}
        <RunWorkspaceLayout imageGenerationArea={imageGenerationArea}>
          <GenerationFailureState run={activeRun} />
        </RunWorkspaceLayout>
      </section>
    );
  }
  const hasCompleteDraftStack =
    activeRun.drafts.length === draftTarget && activeRun.draftCount === draftTarget;

  return (
    <section
      aria-label="Completed draft canvas"
      className="mx-auto grid w-full max-w-5xl gap-3 self-start">
      {sourceTweetPreview}
      <RunWorkspaceLayout imageGenerationArea={imageGenerationArea}>
        {hasCompleteDraftStack ? (
          <DraftComparison
            drafts={activeRun.drafts}
            fallbackDisclosure={activeRun.fallbackDisclosure}
            onDraftTextChange={onDraftTextChange}
          />
        ) : (
          <GenerationWaitingState run={activeRun} />
        )}
      </RunWorkspaceLayout>
    </section>
  );
}

function RunWorkspaceLayout({
  children,
  imageGenerationArea,
}: {
  children: ReactNode;
  imageGenerationArea: ReactNode;
}) {
  if (!imageGenerationArea) {
    return children;
  }

  return (
    <div className="grid items-start gap-4">
      <div className="min-w-0">{children}</div>
      {imageGenerationArea}
    </div>
  );
}

function SourceTweetPreview({ text }: { text: string }) {
  return (
    <aside
      aria-label="Source Tweet Preview"
      className="top-2 z-10 px-3.5 mb-6 shadow-lg shadow-black/30 backdrop-blur-sm max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-slate-950/90 p-1.5">
          <Image
            alt=""
            aria-hidden
            className="h-full w-full object-contain"
            height={28}
            src="/assets/x-light.png"
            width={28}
          />
        </span>
        <div className="grid min-w-0 gap-1">
          <p className="text-xs text-slate-500">Source post</p>
          <p className="line-clamp-2 wrap-break-word text-slate-200 text-sm leading-6">{text}</p>
        </div>
      </div>
    </aside>
  );
}

function GenerationWaitingState({ run }: { run: GenerationRun }) {
  const progressStages = buildGenerationProgressStages(run.generationResultStates);

  return (
    <section
      aria-label="Generation waiting state"
      aria-live="polite"
      className="grid min-h-80 place-items-center sm:min-h-96">
      <div className="grid w-full max-w-3xl justify-items-center gap-5 text-center">
        <p className="editorial-serif text-6xl text-slate-100 tracking-normal sm:text-7xl">
          {run.draftCount}/{run.draftTarget}
        </p>
        <p className="text-slate-500 text-xs uppercase tracking-[0.18em]">drafts</p>
        <p className="text-slate-400 text-sm">{getRunPhaseLabel(run)}</p>
        {progressStages.length > 0 ? (
          <ul
            aria-label="Generation progress"
            className="grid w-full gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-left sm:grid-cols-2">
            {progressStages.map((stage) => (
              <li
                key={stage.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-slate-950/50 px-3 py-2">
                <span className="text-slate-200 text-sm">{stage.label}</span>
                <span className={stage.className}>{stage.statusLabel}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function buildGenerationProgressStages(generationResultStates: GenerationResultStates | undefined) {
  if (!generationResultStates) {
    return [];
  }

  return [
    {
      label: "Joke Context Gathering",
      ...describeStageStatus(generationResultStates.contextGathering.status),
    },
    {
      label: "Text Generation",
      ...describeStageStatus(generationResultStates.textGeneration.status),
    },
    {
      label: "News-Linked Image Discovery",
      ...describeStageStatus(generationResultStates.newsLinkedImageDiscovery.status),
    },
    {
      label: "Visual Joke Generation",
      ...describeStageStatus(generationResultStates.visualJokeGeneration.status),
    },
    {
      label: "Image Generation",
      ...describeStageStatus(generationResultStates.imageGeneration.status),
    },
  ];
}

function describeStageStatus(
  status: "not-started" | "running" | "completed" | "failed" | "partially-failed",
) {
  if (status === "running") {
    return {
      className:
        "inline-flex items-center rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-sky-200 text-xs uppercase tracking-[0.14em]",
      statusLabel: "Running",
    };
  }

  if (status === "completed") {
    return {
      className:
        "inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-emerald-200 text-xs uppercase tracking-[0.14em]",
      statusLabel: "Complete",
    };
  }

  if (status === "failed" || status === "partially-failed") {
    return {
      className:
        "inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-rose-200 text-xs uppercase tracking-[0.14em]",
      statusLabel: status === "failed" ? "Failed" : "Partial",
    };
  }

  return {
    className:
      "inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-400 text-xs uppercase tracking-[0.14em]",
    statusLabel: "Not started",
  };
}

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

function ImageGenerationArea({
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

function ImageResultsArea({
  failedImageSets,
  imageSets,
}: {
  failedImageSets: FailedImageSet[];
  imageSets: ImageSet[];
}) {
  const [activeModal, setActiveModal] = useState<{
    imageSetId: string;
    optionId: string;
  } | null>(null);
  const activeImageSet = activeModal
    ? imageSets.find((imageSet) => imageSet.id === activeModal.imageSetId)
    : null;
  const activeOptionIndex =
    activeImageSet && activeModal
      ? activeImageSet.options.findIndex((option) => option.id === activeModal.optionId)
      : -1;

  return (
    <section aria-label="Image results area" className="grid gap-3">
      <div className="grid gap-4">
        {imageSets.map((imageSet, imageSetIndex) => (
          <article
            aria-label={`Image set ${imageSetIndex + 1}`}
            className="grid min-w-0 gap-2 rounded-sm bg-slate-950/45 p-2"
            key={imageSet.id}>
            <p className="font-medium text-slate-200 text-xs">
              {imageSet.selectedImageOriginal.title ?? `Image set ${imageSetIndex + 1}`}
            </p>
            <div className="overflow-x-auto pb-2">
              <ul className="flex w-max gap-2 pr-2">
                {imageSet.options.map((option, optionIndex) => (
                  <li
                    className="w-[min(70vw,18rem)] shrink-0 lg:w-[min(18vw,300px)]"
                    key={option.id}>
                    <div className="group grid w-full gap-1.5 rounded-sm bg-slate-950/40 text-left transition">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-slate-900">
                        <button
                          type="button"
                          aria-label={`Open ${option.label} from image set ${imageSetIndex + 1}`}
                          onClick={() =>
                            setActiveModal({
                              imageSetId: imageSet.id,
                              optionId: option.id,
                            })
                          }
                          className="block h-full w-full focus:outline-none focus:ring-2 focus:ring-sky-300/25">
                          <Image
                            alt={option.altText ?? option.label}
                            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                            height={240}
                            loading={imageSetIndex === 0 && optionIndex === 0 ? "eager" : "lazy"}
                            src={option.url}
                            unoptimized
                            width={320}
                          />
                        </button>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 shadow-lg shadow-black/30 transition group-hover:opacity-100 group-focus-within:opacity-100">
                          <button
                            type="button"
                            aria-label={`Expand ${option.label} from image set ${
                              imageSetIndex + 1
                            }`}
                            onClick={() =>
                              setActiveModal({
                                imageSetId: imageSet.id,
                                optionId: option.id,
                              })
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-slate-950/80 text-slate-100 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300/25">
                            <Expand aria-hidden className="h-3.5 w-3.5" />
                          </button>
                          <a
                            aria-label={`Download ${option.label} from image set ${
                              imageSetIndex + 1
                            }`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-slate-950/80 text-slate-100 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300/25"
                            download={buildImageDownloadName(imageSet, option)}
                            href={option.url}>
                            <Download aria-hidden className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                      <span className="px-0.5 text-slate-400 text-xs">{option.label}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
        {failedImageSets.map((failedImageSet, failedIndex) => (
          <article
            aria-label={`Failed image set ${failedIndex + 1}`}
            className="grid gap-1 rounded-sm border border-rose-400/20 bg-rose-950/10 p-3"
            key={failedImageSet.id}>
            <p className="font-medium text-rose-100 text-sm">Image set failed</p>
            <p className="text-rose-200/80 text-xs leading-5">{failedImageSet.message}</p>
          </article>
        ))}
      </div>
      {activeImageSet && activeOptionIndex >= 0 ? (
        <ImageOptionModal
          imageSet={activeImageSet}
          optionIndex={activeOptionIndex}
          onClose={() => setActiveModal(null)}
          onOptionIndexChange={(optionIndex) =>
            setActiveModal({
              imageSetId: activeImageSet.id,
              optionId: activeImageSet.options[optionIndex]?.id ?? "",
            })
          }
        />
      ) : null}
    </section>
  );
}

function ImageOptionModal({
  imageSet,
  optionIndex,
  onClose,
  onOptionIndexChange,
}: {
  imageSet: ImageSet;
  optionIndex: number;
  onClose: () => void;
  onOptionIndexChange: (optionIndex: number) => void;
}) {
  const option = imageSet.options[optionIndex];
  const canGoPrevious = optionIndex > 0;
  const canGoNext = optionIndex < imageSet.options.length - 1;

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", closeOnEscape);

    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      aria-label={`${option.label} image option`}
      aria-modal="true"
      className="fixed inset-0 z-50 grid grid-rows-[auto_1fr_auto] bg-slate-950/96 p-3 text-slate-100 backdrop-blur-sm sm:p-5"
      role="dialog">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{option.label}</p>
          <p className="truncate text-slate-500 text-xs">
            {imageSet.selectedImageOriginal.title ?? imageSet.id}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            aria-label="Download current image option"
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-slate-100 text-slate-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/20"
            download={buildImageDownloadName(imageSet, option)}
            href={option.url}>
            <Download aria-hidden className="h-4 w-4" />
          </a>
          <button
            type="button"
            aria-label="Close image option"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-slate-900/80 text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid min-h-0 place-items-center py-4">
        <Image
          alt={option.altText ?? option.label}
          className="max-h-full w-auto max-w-full object-contain"
          height={900}
          src={option.url}
          unoptimized
          width={1200}
        />
      </div>
      <div className="grid grid-cols-2 items-center gap-2">
        <button
          type="button"
          aria-label="Previous image option"
          disabled={!canGoPrevious}
          onClick={() => onOptionIndexChange(optionIndex - 1)}
          className="inline-flex h-10 items-center justify-center rounded-sm bg-slate-900/80 text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next image option"
          disabled={!canGoNext}
          onClick={() => onOptionIndexChange(optionIndex + 1)}
          className="inline-flex h-10 items-center justify-center rounded-sm bg-slate-900/80 text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function getImageTitle(image: NewsLinkedImage, index: number) {
  return image.title ?? `News-linked image ${index + 1}`;
}

function formatImageModelProvenance(provenance: ImageModelProvenance) {
  return provenance.model;
}

function buildImageDownloadName(imageSet: ImageSet, option: ImageSet["options"][number]) {
  return `${imageSet.id}-${option.label.toLowerCase().replaceAll(" ", "-")}`;
}

function getDisplayImageUrl(image: NewsLinkedImage, index: number) {
  if (image.url.startsWith("https://example.com/")) {
    return `https://picsum.photos/seed/${encodeURIComponent(
      image.id || `image-${index + 1}`,
    )}/320/240`;
  }

  return image.url;
}

function GenerationFailureState({ run }: { run: GenerationRun }) {
  return (
    <section
      aria-label="Generation failure state"
      aria-live="polite"
      className="grid min-h-[20rem] place-items-center sm:min-h-[24rem]">
      <p className="max-w-sm text-center text-rose-200 text-sm leading-6">
        {run.failureMessage ?? "Source tweet could not be retrieved."}
      </p>
    </section>
  );
}
