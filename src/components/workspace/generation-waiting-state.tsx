import type { GenerationResultStates } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { getRunPhaseLabel } from "@/services/workspace";

export function GenerationWaitingState({ run }: { run: GenerationRun }) {
  const progressStages = buildGenerationProgressStages(run.generationResultStates);

  return (
    <section
      aria-label="Generation waiting state"
      aria-live="polite"
      className="grid min-h-80 place-items-center sm:min-h-96">
      <div className="grid w-full max-w-3xl justify-items-center gap-5 text-center">
        <p className="editorial-serif text-6xl text-foreground tracking-normal sm:text-7xl">
          {run.draftCount}/{run.draftTarget}
        </p>
        <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">drafts</p>
        <p className="text-muted-foreground text-sm">{getRunPhaseLabel(run)}</p>
        {progressStages.length > 0 ? (
          <ul
            aria-label="Generation progress"
            className="grid w-full gap-1.5 rounded-md bg-secondary/40 p-2 text-left sm:grid-cols-2 lg:grid-cols-5">
            {progressStages.map((stage) => (
              <li
                key={stage.label}
                className="grid min-w-0 gap-1 rounded-md bg-card/70 px-2.5 py-2">
                <span className="truncate text-foreground/90 text-xs">{stage.label}</span>
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
  const contextStatus = generationResultStates.contextGathering.status;
  const imageDiscoveryStatus = generationResultStates.newsLinkedImageDiscovery.status;

  return [
    {
      label: "Context gathering",
      ...describeStageStatus(contextStatus),
    },
    {
      label: "Draft creation",
      ...describeStageStatus(generationResultStates.textGeneration.status, {
        blocked: contextStatus === "failed",
        queued: contextStatus === "not-started" || contextStatus === "running",
      }),
    },
    {
      label: "Image discovery",
      ...describeStageStatus(imageDiscoveryStatus, {
        blocked: contextStatus === "failed",
        queued: contextStatus === "not-started" || contextStatus === "running",
      }),
    },
    {
      label: "Visual jokes",
      ...describeStageStatus(generationResultStates.visualJokeGeneration.status, {
        blocked: contextStatus === "failed",
        queued: contextStatus === "not-started" || contextStatus === "running",
      }),
    },
    {
      label: "Image generation",
      ...describeStageStatus(generationResultStates.imageGeneration.status, {
        blocked: contextStatus === "failed" || imageDiscoveryStatus === "failed",
        queued: imageDiscoveryStatus === "not-started" || imageDiscoveryStatus === "running",
      }),
    },
  ];
}

function describeStageStatus(
  status: "not-started" | "running" | "completed" | "failed" | "partially-failed",
  options: { blocked?: boolean; queued?: boolean } = {},
) {
  if (status === "running") {
    return {
      className:
        "inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-primary text-xs",
      statusLabel: "Running",
    };
  }

  if (status === "completed") {
    return {
      className:
        "inline-flex items-center rounded-full bg-success/10 px-2 py-1 text-success text-xs",
      statusLabel: "Complete",
    };
  }

  if (status === "failed" || status === "partially-failed") {
    return {
      className:
        "inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 text-destructive text-xs",
      statusLabel: status === "failed" ? "Failed" : "Partial",
    };
  }

  if (status === "not-started" && options.blocked) {
    return {
      className:
        "inline-flex w-fit items-center rounded-md bg-secondary/60 px-1.5 py-0.5 text-[0.68rem] text-muted-foreground/70",
      statusLabel: "Unavailable",
    };
  }

  if (status === "not-started" && options.queued) {
    return {
      className:
        "inline-flex w-fit items-center rounded-md bg-secondary/60 px-1.5 py-0.5 text-[0.68rem] text-muted-foreground",
      statusLabel: "Queued",
    };
  }

  return {
    className:
      "inline-flex w-fit items-center rounded-md bg-secondary/60 px-1.5 py-0.5 text-[0.68rem] text-muted-foreground",
    statusLabel: "Not started",
  };
}
