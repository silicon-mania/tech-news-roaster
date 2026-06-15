import { z } from "zod";

export const generationRunPhaseSchema = z.enum([
  "enrichment-running",
  "text-generation-running",
  "waiting-for-image-selection",
  "image-generation-running",
  "image-generation-failed",
  "image-generation-complete",
  "failed",
]);
