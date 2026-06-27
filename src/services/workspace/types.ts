export type { GenerationRun, SavedRunStore } from "@/services/saved-runs";

export type GenerationRunInput = {
  sourceTweetUrl: string;
  usersDirection: string;
};

export type SubmissionState =
  | { kind: "idle" }
  | { kind: "invalid"; message: string }
  | { kind: "accepted" }
  | { kind: "blocked"; message: string };
