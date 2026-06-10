export type { GenerationRun, SavedRunStore } from "@/services/saved-runs";

export type GenerationRunInput = {
  sourceTweetUrl: string;
  usersDirection: string;
};

type GenerationEventListener = (message: MessageEvent<string>) => void;

export type GenerationEventSource = {
  addEventListener(
    type: "enrichment-completed" | "run-state" | "progress" | "completed" | "failed",
    listener: GenerationEventListener,
  ): void;
  close(): void;
};

export type GenerationEventSourceFactory = (url: string) => GenerationEventSource;

export type SubmissionState =
  | { kind: "idle" }
  | { kind: "invalid"; message: string }
  | { kind: "accepted" }
  | { kind: "blocked"; message: string };
