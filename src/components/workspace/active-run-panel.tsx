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
import { NewsCategorySection } from "./news-category-section";
import { NewsCategorySectionSkeleton } from "./news-category-section-skeleton";
import { QuietRunReveals } from "./quiet-run-reveals";
import { SectionHeader } from "./section-header";
import { SourceTweetPreview } from "./source-tweet-preview";
import { TextGenerationSection } from "./text-generation-section";
import { TextGenerationSkeleton } from "./text-generation-skeleton";

type ActiveRunPanelProps = {
  activeRun: GenerationRun | null;
  isUploadGenerating: boolean;
  onDraftTextChange: (draftId: string, text: string) => void;
  onNewsCategoryChange: (newsCategory: string) => void;
  onNewsCategoryCustomChange: (newsCategory: string) => void;
  onSelectedDraftChange: (draftId: string | null) => void;
  onSelectedGeneratedImageChange: (runId: string, imageOptionId: string | null) => void;
  onStartImageGeneration: (input: ImageGenerationInput) => void;
  onUploadImage: (runId: string, file: File) => void;
};

export function ActiveRunPanel({
  activeRun,
  isUploadGenerating,
  onDraftTextChange,
  onNewsCategoryChange,
  onNewsCategoryCustomChange,
  onSelectedDraftChange,
  onSelectedGeneratedImageChange,
  onStartImageGeneration,
  onUploadImage,
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
  // run is still in flight. This lets text reveal before images, images reveal
  // before text, etc., rather than gating every section on the whole run.
  // The Image work area (which carries the uploader trigger) surfaces as soon as
  // there is anything image-related to act on — Image Original Candidates to pick
  // from, the source-derived set or its failure, or any Uploaded Image Set. It is
  // deliberately not gated by the base-set phase, so on a manual run the operator
  // can upload before (or instead of) generating the candidate-based set while
  // `imageSet` is still absent and candidates are unselected (ADR-0025).
  const hasImageGenerationContent = Boolean(
    activeRun.imageOriginalCandidates?.length ||
      activeRun.newsLinkedImages?.length ||
      activeRun.imageSet ||
      activeRun.failedImageSet ||
      activeRun.uploadedImageSets?.length,
  );
  const imageDiscoveryFailure = getStageFailure(
    activeRun.generationResultStates?.newsLinkedImageDiscovery,
  );
  const imageGenerationArea = hasImageGenerationContent ? (
    <ImageGenerationArea
      parentRunId={activeRun.id}
      run={activeRun}
      isUploadGenerating={isUploadGenerating}
      onSelectedGeneratedImageChange={onSelectedGeneratedImageChange}
      onStartImageGeneration={onStartImageGeneration}
      onUploadImage={onUploadImage}
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

  const hasCompleteDraftStack =
    activeRun.drafts.length === draftTarget && activeRun.draftCount === draftTarget;
  const textGenerationFailure = getStageFailure(activeRun.generationResultStates?.textGeneration);
  const textGenerationArea = isFailed ? (
    <GenerationFailureState run={activeRun} />
  ) : hasCompleteDraftStack ? (
    <DraftComparison
      drafts={activeRun.drafts}
      fallbackDisclosure={activeRun.fallbackDisclosure}
      selectedDraftId={activeRun.selectedDraftId ?? null}
      onDraftTextChange={onDraftTextChange}
      onSelectedDraftChange={onSelectedDraftChange}
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
      className="mx-auto grid w-full max-w-5xl gap-6 self-start">
      {sourceTweetPreview}
      {/* The News Category editor — the same shared chips the Selected Run sidebar
          uses — as its own section in the workspace column, headed by the same
          SectionHeader as Text/Image generation so it reads at the same scale.
          While the run is in flight it holds the section's footprint as a skeleton
          (the classifier result only lands on completion, ADR-0027 / issue 004);
          once complete the real editor takes its place with no layout shift. */}
      {isRunning || isCompleted ? (
        <section
          aria-busy={isRunning}
          aria-label="News category"
          className="mb-6 grid min-w-0 gap-3">
          <SectionHeader title="News category" />
          {isCompleted ? (
            <NewsCategorySection
              newsCategory={activeRun.newsCategory}
              newsCategoryClassification={activeRun.newsCategoryClassification}
              onNewsCategoryChange={onNewsCategoryChange}
              onNewsCategoryCustomChange={onNewsCategoryCustomChange}
            />
          ) : (
            <NewsCategorySectionSkeleton />
          )}
        </section>
      ) : null}
      <RunWorkspaceLayout
        imageGenerationArea={imageGenerationArea}
        usersDirection={activeRun.usersDirection}>
        {textGenerationArea}
      </RunWorkspaceLayout>
    </section>
  );
}

function RunWorkspaceLayout({
  children,
  imageGenerationArea,
  usersDirection,
}: {
  children: ReactNode;
  imageGenerationArea: ReactNode;
  usersDirection: string;
}) {
  if (!imageGenerationArea) {
    return children;
  }

  return (
    <section aria-label="Responsive creative workspace" className="grid items-start gap-12">
      <TextGenerationSection usersDirection={usersDirection}>{children}</TextGenerationSection>
      {/* Each image-area variant (the picker, its skeleton, the discovery-failure
          card) is a fragment of header + body. Wrapping it in the same `gap-3` grid
          TextGenerationSection uses gives its title→content the same gap as every
          other section, instead of inheriting this section's larger inter-section
          gap. */}
      <div className="grid min-w-0 gap-3">{imageGenerationArea}</div>
    </section>
  );
}
