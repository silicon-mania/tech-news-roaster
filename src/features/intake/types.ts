import type { SavedGenerationRun } from "@/services/generation";

export type GenerationIntake = {
  sourceTweetUrl: string;
  usersDirection: string;
};

export type GenerationRun = SavedGenerationRun;

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

export type SavedRunStore = {
  list(): Promise<GenerationRun[]>;
  save(run: GenerationRun): Promise<void>;
  delete(runId: string): Promise<void>;
};
