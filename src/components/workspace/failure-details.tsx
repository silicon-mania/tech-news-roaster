import type { GenerationResultStates } from "@/services/generation";

export type StageFailure = {
  debugLog?: string[];
  failedAt?: string;
  message: string;
  startedAt?: string;
};

export function FailureDetails({ failure }: { failure: StageFailure }) {
  const lines = [
    failure.startedAt ? `Started: ${failure.startedAt}` : null,
    failure.failedAt ? `Failed: ${failure.failedAt}` : null,
    `Message: ${failure.message}`,
    ...(failure.debugLog ?? []).map((entry, index) => `${index + 1}. ${entry}`),
  ].filter((line): line is string => Boolean(line));

  return (
    <pre className="whitespace-pre-wrap break-words rounded-md bg-card p-3 text-foreground/90 text-sm leading-6">
      {lines.join("\n")}
    </pre>
  );
}

export function getStageFailure(
  stage:
    | GenerationResultStates["contextGathering"]
    | GenerationResultStates["newsLinkedImageDiscovery"]
    | GenerationResultStates["textGeneration"]
    | GenerationResultStates["visualJokeGeneration"]
    | undefined,
): StageFailure | undefined {
  if (stage?.status !== "failed") {
    return undefined;
  }

  return {
    debugLog: "debugLog" in stage ? stage.debugLog : undefined,
    failedAt: stage.failedAt,
    message: stage.message,
    startedAt: stage.startedAt,
  };
}
