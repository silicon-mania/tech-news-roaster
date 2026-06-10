import { z } from "zod";

export const draftTarget = 3;

export const generationProviderIds = ["openai", "anthropic", "google"] as const;

export type GenerationProviderId = (typeof generationProviderIds)[number];

export const generationProviderIdSchema = z.enum(generationProviderIds);
