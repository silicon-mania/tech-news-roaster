import type { QuoteTweetDraft } from "@/features/generation/generation-events";
import type { RetrievedSourceTweet } from "@/features/tweet-retrieval/tweet-retrieval";

export type GenerationIntake = {
  sourceTweetUrl: string;
  usersDirection: string;
};

export type GenerationRun = {
  id: string;
  label: string;
  sourceTweetUrl: string;
  usersDirection: string;
  status: "running" | "completed" | "failed";
  draftCount: number;
  draftTarget: number;
  drafts: QuoteTweetDraft[];
  sourceTweet?: RetrievedSourceTweet;
  failureMessage?: string;
  savedAt?: string;
};

type GenerationEventListener = (message: MessageEvent<string>) => void;

export type GenerationEventSource = {
  addEventListener(
    type: "progress" | "completed" | "failed",
    listener: GenerationEventListener,
  ): void;
  close(): void;
};

export type GenerationEventSourceFactory = (
  url: string,
) => GenerationEventSource;

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
