import "server-only";

import type { ImageSet } from "@/services/generation";
import { resolveImageBytesStore } from "./image-bytes-store";
import { persistImageSetBytes } from "./persist-image-set-bytes";

/**
 * Resolves the signed-in Operator Account's object storage and moves an Image
 * Set's bytes into it, returning the Image Set with every option URL rewritten
 * to an owner-scoped `/api/runs/.../images/...` route (ADR-0019). The single
 * persistence step shared by the manual image-generation route and the
 * server-side Automated Run composition, so a run's bytes always land under the
 * same owner regardless of which path produced them.
 *
 * Throws when Supabase is configured but no operator is signed in — the same
 * gate {@link resolveImageBytesStore} applies to every owner-scoped read/write.
 */
export async function persistImageSetToOwnerStorage({
  imageSet,
  origin,
  runId,
}: {
  imageSet: ImageSet;
  origin: string;
  runId: string;
}): Promise<ImageSet> {
  const resolution = await resolveImageBytesStore();

  if ("unauthorized" in resolution) {
    throw new Error("Operator authentication required.");
  }

  return persistImageSetBytes({ imageSet, origin, runId, store: resolution.store });
}
