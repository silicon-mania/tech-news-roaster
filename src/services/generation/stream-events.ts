import { z } from "zod";
import {
  failedImageSetSchema,
  imageGenerationTerminalStateSchema,
  imageSetSchema,
} from "./image-generation";

// The Server-Sent Events the operator-triggered Image Generation flow streams to
// the workspace. (The manual *generation* run no longer streams — it composes and
// persists server-side in one request — so only the Image Generation events remain.)

const imageSetCompletedEventSchema = z
  .object({
    type: z.literal("image-set-completed"),
    imageSet: imageSetSchema,
  })
  .strict();

const imageSetFailedEventSchema = z
  .object({
    type: z.literal("image-set-failed"),
    failedImageSet: failedImageSetSchema,
  })
  .strict();

const imageGenerationCompletedEventSchema = z
  .object({
    type: z.literal("image-generation-completed"),
    state: imageGenerationTerminalStateSchema,
  })
  .strict();

const imageGenerationStreamEventSchema = z.discriminatedUnion("type", [
  imageSetCompletedEventSchema,
  imageSetFailedEventSchema,
  imageGenerationCompletedEventSchema,
]);

export type ImageGenerationStreamEvent = z.infer<typeof imageGenerationStreamEventSchema>;

export function parseImageGenerationStreamEvent(event: unknown): ImageGenerationStreamEvent {
  return imageGenerationStreamEventSchema.parse(event);
}
