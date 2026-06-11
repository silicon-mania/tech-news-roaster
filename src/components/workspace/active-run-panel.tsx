"use client";

import type { ReactNode } from "react";
import type { CompositeRasterizer } from "@/services/final-quote-tweet-image";
import type { ImageGenerationInput } from "@/services/generation";
import { draftTarget } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { CreativeFailureArea } from "./creative-failure-area";
import { DraftComparison } from "./draft-comparison";
import { getStageFailure } from "./failure-details";
import { FinalQuoteTweetImageArea } from "./final-quote-tweet-image-area";
import { GenerationFailureState } from "./generation-failure-state";
import { GenerationWaitingState } from "./generation-waiting-state";
import { ImageGenerationArea } from "./image-generation-area";
import { QuietRunReveals } from "./quiet-run-reveals";
import { SourceTweetPreview } from "./source-tweet-preview";
import { VisualJokeArea } from "./visual-joke-area";
import { VisualJokeSkeleton } from "./visual-joke-skeleton";

type ActiveRunPanelProps = {
  activeRun: GenerationRun | null;
  onDraftTextChange: (draftId: string, text: string) => void;
  onSelectedGeneratedImageChange: (runId: string, imageOptionId: string | null) => void;
  onSelectedVisualJokeChange: (runId: string, visualJokeId: string | null) => void;
  onStartImageGeneration: (input: ImageGenerationInput) => void;
  rasterizeComposite?: CompositeRasterizer;
};

export function ActiveRunPanel({
  activeRun,
  onDraftTextChange,
  onSelectedGeneratedImageChange,
  onSelectedVisualJokeChange,
  onStartImageGeneration,
  rasterizeComposite,
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
  ) : activeRun.status === "running" ? (
    <VisualJokeSkeleton />
  ) : null;
  // Derived-on-demand consumer (ADR 0018): it reads the run's two picks and
  // re-renders the composite from them plus the baked template. Gated on the
  // same image-generation content as the image work area, so it appears only
  // once variations exist (or follows the failure pattern when generation
  // failed entirely) and self-hides into a quiet empty state otherwise.
  const finalQuoteTweetImageArea = hasImageGenerationContent ? (
    <FinalQuoteTweetImageArea rasterizeComposite={rasterizeComposite} run={activeRun} />
  ) : null;

  if (activeRun.status === "running") {
    return (
      <section className="mx-auto grid w-full max-w-5xl gap-3 self-start">
        {sourceTweetPreview}
        <RunWorkspaceLayout
          finalQuoteTweetImageArea={finalQuoteTweetImageArea}
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
          finalQuoteTweetImageArea={finalQuoteTweetImageArea}
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
      <RunWorkspaceLayout
        finalQuoteTweetImageArea={finalQuoteTweetImageArea}
        imageGenerationArea={imageGenerationArea}
        visualJokeArea={visualJokeArea}>
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
  finalQuoteTweetImageArea,
  imageGenerationArea,
  visualJokeArea,
}: {
  children: ReactNode;
  finalQuoteTweetImageArea: ReactNode;
  imageGenerationArea: ReactNode;
  visualJokeArea: ReactNode;
}) {
  if (!imageGenerationArea && !visualJokeArea && !finalQuoteTweetImageArea) {
    return children;
  }

  return (
    <section aria-label="Responsive creative workspace" className="grid items-start gap-4">
      <div className="min-w-0">{children}</div>
      {visualJokeArea}
      {imageGenerationArea}
      {finalQuoteTweetImageArea}
    </section>
  );
}
