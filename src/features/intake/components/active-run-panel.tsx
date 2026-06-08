import Image from "next/image";
import type { ReactNode } from "react";
import type { NewsLinkedImage } from "@/features/generation/generation-events";
import { draftTarget } from "@/features/generation/generation-events";
import { getRunPhaseLabel } from "../run-phase";
import type { GenerationRun } from "../types";
import { DraftComparison } from "./draft-comparison";

type ActiveRunPanelProps = {
  activeRun: GenerationRun | null;
  onDraftTextChange: (draftId: string, text: string) => void;
};

export function ActiveRunPanel({
  activeRun,
  onDraftTextChange,
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
      phaseLabel={getRunPhaseLabel(activeRun)}
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
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
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
  phaseLabel,
}: {
  images: NewsLinkedImage[];
  phaseLabel: string;
}) {
  return (
    <aside
      aria-label="Image generation area"
      className="grid gap-3 rounded-sm border border-slate-800/80 bg-slate-950/35 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-slate-100 text-sm">Image generation</p>
        <p className="text-slate-500 text-xs">{phaseLabel}</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {images.map((image, index) => (
          <li key={image.id}>
            <figure className="grid gap-1.5">
              <div className="aspect-[4/3] overflow-hidden rounded-sm border border-slate-800 bg-slate-950">
                <Image
                  alt={
                    image.altText ??
                    image.title ??
                    `News-linked image ${index + 1}`
                  }
                  className="h-full w-full object-cover"
                  height={240}
                  src={image.url}
                  unoptimized
                  width={320}
                />
              </div>
              <figcaption className="line-clamp-2 text-slate-500 text-xs leading-5">
                {image.title ?? `News-linked image ${index + 1}`}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </aside>
  );
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
