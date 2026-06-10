"use client";

import type { ReactNode } from "react";
import type { ImageGenerationInput } from "@/services/generation";
import { draftTarget } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { CreativeFailureArea } from "./creative-failure-area";
import { DraftComparison } from "./draft-comparison";
import { getStageFailure } from "./failure-details";
import { GenerationFailureState } from "./generation-failure-state";
import { GenerationWaitingState } from "./generation-waiting-state";
import { ImageGenerationArea } from "./image-generation-area";
import { QuietRunReveals } from "./quiet-run-reveals";
import { SourceTweetPreview } from "./source-tweet-preview";
import { VisualJokeArea } from "./visual-joke-area";

type ActiveRunPanelProps = {
  activeRun: GenerationRun | null;
  onDraftTextChange: (draftId: string, text: string) => void;
  onSelectedVisualJokeChange: (runId: string, visualJokeId: string | null) => void;
  onStartImageGeneration: (input: ImageGenerationInput) => void;
};

export function ActiveRunPanel({
  activeRun,
  onDraftTextChange,
  onSelectedVisualJokeChange,
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
  const imageDiscoveryFailure = getStageFailure(
    activeRun.generationResultStates?.newsLinkedImageDiscovery,
  );
  const imageGenerationArea = hasImageGenerationContent ? (
    <ImageGenerationArea
      parentRunId={activeRun.id}
      run={activeRun}
      onStartImageGeneration={onStartImageGeneration}
    />
  ) : imageDiscoveryFailure ? (
    <CreativeFailureArea
      ariaLabel="Image Work Creative Result Area"
      detailsLabel="Image Discovery Failure Details"
      heading="Image work"
      failure={imageDiscoveryFailure}
    />
  ) : null;
  const visualJokeArea = activeRun.visualJokeSet ? (
    <VisualJokeArea
      run={activeRun}
      visualJokeSet={activeRun.visualJokeSet}
      onSelectedVisualJokeChange={onSelectedVisualJokeChange}
    />
  ) : getStageFailure(activeRun.generationResultStates?.visualJokeGeneration) ? (
    <CreativeFailureArea
      ariaLabel="Visual Joke Creative Result Area"
      detailsLabel="Visual Joke Failure Details"
      heading="Visual jokes"
      failure={getStageFailure(activeRun.generationResultStates?.visualJokeGeneration)}
    />
  ) : null;

  if (activeRun.status === "running") {
    return (
      <section className="mx-auto grid w-full max-w-5xl gap-3 self-start">
        {sourceTweetPreview}
        <RunWorkspaceLayout
          imageGenerationArea={imageGenerationArea}
          visualJokeArea={visualJokeArea}>
          <QuietRunReveals run={activeRun} />
          <GenerationWaitingState run={activeRun} />
        </RunWorkspaceLayout>
      </section>
    );
  }

  if (activeRun.status === "failed") {
    return (
      <section className="mx-auto grid w-full max-w-5xl gap-3 self-start">
        {sourceTweetPreview}
        <RunWorkspaceLayout
          imageGenerationArea={imageGenerationArea}
          visualJokeArea={visualJokeArea}>
          <QuietRunReveals run={activeRun} />
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
      <RunWorkspaceLayout imageGenerationArea={imageGenerationArea} visualJokeArea={visualJokeArea}>
        <QuietRunReveals run={activeRun} />
        {hasCompleteDraftStack ? (
          <DraftComparison
            drafts={activeRun.drafts}
            fallbackDisclosure={activeRun.fallbackDisclosure}
            onDraftTextChange={onDraftTextChange}
          />
        ) : getStageFailure(activeRun.generationResultStates?.textGeneration) ? (
          <CreativeFailureArea
            ariaLabel="Text Generation Creative Result Area"
            detailsLabel="Text Generation Failure Details"
            heading="Drafts"
            failure={getStageFailure(activeRun.generationResultStates?.textGeneration)}
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
  visualJokeArea,
}: {
  children: ReactNode;
  imageGenerationArea: ReactNode;
  visualJokeArea: ReactNode;
}) {
  if (!imageGenerationArea && !visualJokeArea) {
    return children;
  }

  return (
    <section aria-label="Responsive creative workspace" className="grid items-start gap-4">
      <div className="min-w-0">{children}</div>
      {visualJokeArea}
      {imageGenerationArea}
    </section>
  );
}
