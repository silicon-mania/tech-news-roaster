"use client";

import Image from "next/image";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import type {
  ImageGenerationInput,
  NewsLinkedImage,
} from "@/features/generation/generation-events";
import {
  draftTarget,
  parseImageGenerationInput,
} from "@/features/generation/generation-events";
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
    return (
      <section
        aria-label="Empty draft canvas"
        className="min-h-72 sm:min-h-88"
      />
    );
  }

  const sourceTweetPreview = activeRun.sourceTweet ? (
    <SourceTweetPreview text={activeRun.sourceTweet.text} />
  ) : null;
  const imageGenerationArea = activeRun.newsLinkedImages?.length ? (
    <NewsLinkedImageArea
      images={activeRun.newsLinkedImages}
      parentRunId={activeRun.id}
      phaseLabel={getRunPhaseLabel(activeRun)}
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
    activeRun.drafts.length === draftTarget &&
    activeRun.draftCount === draftTarget;

  return (
    <section
      aria-label="Completed draft canvas"
      className="mx-auto grid w-full max-w-5xl gap-3 self-start"
    >
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
      className="top-2 z-10 px-3.5 mb-6 shadow-lg shadow-black/30 backdrop-blur-sm max-w-3xl mx-auto"
    >
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
          <p className="line-clamp-2 wrap-break-word text-slate-200 text-sm leading-6">
            {text}
          </p>
        </div>
      </div>
    </aside>
  );
}

function GenerationWaitingState({ run }: { run: GenerationRun }) {
  return (
    <section
      aria-label="Generation waiting state"
      aria-live="polite"
      className="grid min-h-80 place-items-center sm:min-h-96"
    >
      <div className="grid justify-items-center gap-3 text-center">
        <p className="editorial-serif text-6xl text-slate-100 tracking-normal sm:text-7xl">
          {run.draftCount}/{run.draftTarget}
        </p>
        <p className="text-slate-500 text-xs uppercase tracking-[0.18em]">
          drafts
        </p>
        <p className="text-slate-400 text-sm">{getRunPhaseLabel(run)}</p>
      </div>
    </section>
  );
}

function NewsLinkedImageArea({
  images,
  parentRunId,
  phaseLabel,
  onStartImageGeneration,
}: {
  images: NewsLinkedImage[];
  parentRunId: string;
  phaseLabel: string;
  onStartImageGeneration: (input: ImageGenerationInput) => void;
}) {
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [userImagePrompt, setUserImagePrompt] = useState("");
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const trimmedUserImagePrompt = userImagePrompt.trim();
  const canStartImageGeneration =
    selectedImageIds.length > 0 && trimmedUserImagePrompt.length > 0;

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
        return currentImageIds.filter(
          (currentImageId) => currentImageId !== imageId,
        );
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
    <aside
      aria-label="Image generation area"
      className="grid gap-3 rounded-sm border border-slate-800/80 bg-slate-950/35 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-slate-100 text-sm">Image generation</p>
        <p className="text-slate-500 text-xs">{phaseLabel}</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {images.map((image, index) => (
          <li key={image.id}>
            <button
              type="button"
              aria-label={`Select ${getImageTitle(
                image,
                index,
              )} for image generation`}
              aria-pressed={selectedImageIds.includes(image.id)}
              onClick={() => toggleImageSelection(image.id)}
              className={`grid h-full w-full gap-1.5 rounded-sm border p-1.5 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300/20 ${
                selectedImageIds.includes(image.id)
                  ? "border-sky-300/60 bg-sky-300/10"
                  : "border-slate-800 bg-slate-950/20 hover:border-slate-700"
              }`}
            >
              <span className="aspect-[4/3] overflow-hidden rounded-sm border border-slate-800 bg-slate-950">
                <Image
                  alt={
                    image.altText ??
                    image.title ??
                    `News-linked image ${index + 1}`
                  }
                  className="h-full w-full object-cover"
                  height={240}
                  loading={index === 0 ? "eager" : "lazy"}
                  src={getDisplayImageUrl(image, index)}
                  unoptimized
                  width={320}
                />
              </span>
              <span className="line-clamp-2 text-slate-500 text-xs leading-5">
                {getImageTitle(image, index)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selectionMessage ? (
        <p className="text-slate-400 text-xs" role="status">
          {selectionMessage}
        </p>
      ) : null}
      <form className="grid gap-2" onSubmit={submitImageGeneration}>
        <label
          className="font-medium text-slate-300 text-xs"
          htmlFor={`${parentRunId}-user-image-prompt`}
        >
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
          className="justify-self-start rounded-sm border border-slate-700 bg-slate-100 px-3 py-2 font-medium text-slate-950 text-sm transition hover:bg-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-500"
        >
          Image Generation
        </button>
      </form>
    </aside>
  );
}

function getImageTitle(image: NewsLinkedImage, index: number) {
  return image.title ?? `News-linked image ${index + 1}`;
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
      className="grid min-h-[20rem] place-items-center sm:min-h-[24rem]"
    >
      <p className="max-w-sm text-center text-rose-200 text-sm leading-6">
        {run.failureMessage ?? "Source tweet could not be retrieved."}
      </p>
    </section>
  );
}
