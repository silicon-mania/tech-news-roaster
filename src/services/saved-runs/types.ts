import type { SavedGenerationRun } from "@/services/generation";

export type GenerationRun = SavedGenerationRun;

export type SavedRunStore = {
  list(): Promise<GenerationRun[]>;
  save(run: GenerationRun): Promise<void>;
  delete(runId: string): Promise<void>;
};
