"use client";

import type { ReactNode } from "react";
import type { ImageGenerationInput } from "@/services/generation";
import { draftTarget } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { CreativeFailureArea } from "./creative-failure-area";
import { DraftComparison } from "./draft-comparison";
import { getStageFailure } from "./failure-details";
import { GenerationFailureState } from "./generation-failure-state";
import { ImageGenerationArea } from "./image-generation-area";
import { ImageGenerationSkeleton } from "./image-generation-skeleton";
import { QuietRunReveals } from "./quiet-run-reveals";
import { SourceTweetPreview } from "./source-tweet-preview";
import { TextGenerationSection } from "./text-generation-section";
import { TextGenerationSkeleton } from "./text-generation-skeleton";
import { VisualJokeArea } from "./visual-joke-area";
import { VisualJokeSkeleton } from "./visual-joke-skeleton";

type ActiveRunPanelProps = {
  activeRun: GenerationRun | null;
  onDraftTextChange: (draftId: string, text: string) => void;
  onSelectedGeneratedImageChange: (runId: string, imageOptionId: string | null) => void;
  onSelectedVisualJokeChange: (runId: string, visualJokeId: string | null) => void;
  onStartImageGeneration: (input: ImageGenerationInput) => void;
};

export function ActiveRunPanel({
  activeRun,
  onDraftTextChange,
  onSelectedGeneratedImageChange,
  onSelectedVisualJokeChange,
  onStartImageGeneration,
}: ActiveRunPanelProps) {
  if (!activeRun) {
    return <section aria-label="Empty draft canvas" className="min-h-72 sm:min-h-88" />;
  }

  const isRunning = activeRun.status === "running";
  const isFailed = activeRun.status === "failed";
  const isCompleted = activeRun.status === "completed";

  const sourceTweetPreview = activeRun.sourceTweet ? (
    <SourceTweetPreview
      contextReveal={<QuietRunReveals run={activeRun} />}
      text={activeRun.sourceTweet.text}
    />
  ) : null;

  // Each section resolves independently — content if its own data has arrived,
  // otherwise its failure (if that stage failed), otherwise a skeleton while the
  // run is still in flight. This lets text reveal before visual jokes, images
  // reveal before text, etc., rather than gating every section on the whole run.
  const hasImageGenerationContent = Boolean(
    activeRun.newsLinkedImages?.length ||
      activeRun.imageSets?.length ||
      activeRun.failedImageSets?.length,
  );
  const imageDiscoveryFailure = getStageFailure(
    activeRun.generationResultStates?.newsLinkedImageDiscovery,
  );
  const imageGenerationArea = hasImageGenerationContent ? (
    <ImageGenerationArea
      parentRunId={activeRun.id}
      run={activeRun}
      onSelectedGeneratedImageChange={onSelectedGeneratedImageChange}
      onStartImageGeneration={onStartImageGeneration}
    />
  ) : imageDiscoveryFailure ? (
    <CreativeFailureArea
      ariaLabel="Image Work Creative Result Area"
      detailsLabel="Image Discovery Failure Details"
      heading="Image work"
      failure={imageDiscoveryFailure}
    />
  ) : isRunning ? (
    <ImageGenerationSkeleton />
  ) : null;

  const visualJokeFailure = getStageFailure(activeRun.generationResultStates?.visualJokeGeneration);
  const visualJokeArea = activeRun.visualJokeSet ? (
    <VisualJokeArea
      run={activeRun}
      visualJokeSet={activeRun.visualJokeSet}
      onSelectedVisualJokeChange={onSelectedVisualJokeChange}
    />
  ) : visualJokeFailure ? (
    <CreativeFailureArea
      ariaLabel="Visual Joke Creative Result Area"
      detailsLabel="Visual Joke Failure Details"
      heading="Visual jokes"
      failure={visualJokeFailure}
    />
  ) : isRunning ? (
    <VisualJokeSkeleton />
  ) : null;

  const hasCompleteDraftStack =
    activeRun.drafts.length === draftTarget && activeRun.draftCount === draftTarget;
  const textGenerationFailure = getStageFailure(activeRun.generationResultStates?.textGeneration);
  const textGenerationArea = isFailed ? (
    <GenerationFailureState run={activeRun} />
  ) : hasCompleteDraftStack ? (
    <DraftComparison
      drafts={activeRun.drafts}
      fallbackDisclosure={activeRun.fallbackDisclosure}
      onDraftTextChange={onDraftTextChange}
    />
  ) : textGenerationFailure ? (
    <CreativeFailureArea
      ariaLabel="Text Generation Creative Result Area"
      detailsLabel="Text Generation Failure Details"
      heading="Drafts"
      failure={textGenerationFailure}
    />
  ) : isRunning ? (
    <TextGenerationSkeleton />
  ) : null;

  return (
    <section
      aria-label={isCompleted ? "Completed draft canvas" : undefined}
      className="mx-auto grid w-full max-w-5xl gap-3 self-start">
      {sourceTweetPreview}
      <RunWorkspaceLayout
        imageGenerationArea={imageGenerationArea}
        usersDirection={activeRun.usersDirection}
        visualJokeArea={visualJokeArea}>
        {textGenerationArea}
      </RunWorkspaceLayout>
    </section>
  );
}

function RunWorkspaceLayout({
  children,
  imageGenerationArea,
  usersDirection,
  visualJokeArea,
}: {
  children: ReactNode;
  imageGenerationArea: ReactNode;
  usersDirection: string;
  visualJokeArea: ReactNode;
}) {
  if (!imageGenerationArea && !visualJokeArea) {
    return children;
  }

  return (
    <section aria-label="Responsive creative workspace" className="grid items-start gap-4">
      <TextGenerationSection usersDirection={usersDirection}>{children}</TextGenerationSection>
      {visualJokeArea}
      {imageGenerationArea}
    </section>
  );
}
