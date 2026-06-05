import type { QuoteTweetDraft } from "@/features/generation/generation-events";

export type GenerationIntake = {
  sourceTweetUrl: string;
  usersDirection: string;
};

export type GenerationRun = {
  id: string;
  label: string;
  sourceTweetUrl: string;
  usersDirection: string;
  status: "running" | "completed";
  draftCount: number;
  draftTarget: number;
  drafts: QuoteTweetDraft[];
};

type GenerationEventListener = (message: MessageEvent<string>) => void;

export type GenerationEventSource = {
  addEventListener(
    type: "progress" | "completed",
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
