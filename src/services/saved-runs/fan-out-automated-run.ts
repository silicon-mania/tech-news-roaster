import "server-only";

import type { SavedGenerationRun } from "@/services/generation";
import { createImageBytesStore, type ImageBytesStore, imageStoragePath } from "./image-bytes-store";
import { createRunRepository } from "./run-repository";
import type { RunRepository } from "./types";

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

/** A signed-in operator a finished Automated Run is copied to. */
export type FanOutTarget = { email: string; userId: string };

/** The result of attempting to copy one run into one operator's account. */
export type FanOutCopyOutcome =
  | { email: string; userId: string; status: "copied" }
  | { email: string; userId: string; status: "failed"; error: string };

export type FanOutAutomatedRunDependencies = {
  /** Builds a target-owned run repository. Defaults to the real owner-scoped store. */
  createRunRepository?: (ownerId: string, env: SupabaseEnvironment) => RunRepository;
  /** Builds an owner-scoped image-bytes store. Defaults to the real owner-scoped store. */
  createImageBytesStore?: (ownerId: string, env: SupabaseEnvironment) => ImageBytesStore;
  env?: SupabaseEnvironment;
};

/**
 * Duplicates one finished Automated Run — already composed once under the Primary
 * Operator (the anchor) — into every **other** signed-in operator's Operator Account,
 * so each holds an independently editable copy (ADR-0024, issue 012).
 *
 * Each copy reuses the **same run id** and a **verbatim payload**: stored image URLs
 * are owner-less (`/api/runs/.../images/...`) and resolve against the session operator,
 * so the payload needs no rewriting — only the underlying image-option **bytes** (the
 * Selected Image Original plus its four variations) are copied from the anchor's storage
 * prefix into the target's. The anchor is filtered out (`target.userId === anchorOwnerId`)
 * because it already holds the original. The composed run is left unseen, so each verbatim
 * copy is unseen too and appears as new in that operator's feed.
 *
 * Fan-out is **best-effort per operator**: a failed copy is captured as a `failed`
 * outcome and isolated — the anchor's run and the other operators' copies are unaffected,
 * and there is no retry (consistent with No Automatic Retry). The caller logs the
 * outcomes and reports the per-operator copy counts.
 */
export async function fanOutAutomatedRun(
  {
    run,
    anchorOwnerId,
    targets,
  }: {
    run: SavedGenerationRun;
    anchorOwnerId: string;
    targets: readonly FanOutTarget[];
  },
  dependencies: FanOutAutomatedRunDependencies = {},
): Promise<FanOutCopyOutcome[]> {
  const env = dependencies.env ?? process.env;
  const makeRepository = dependencies.createRunRepository ?? createRunRepository;
  const makeImageStore = dependencies.createImageBytesStore ?? createImageBytesStore;

  const anchorImageStore = makeImageStore(anchorOwnerId, env);
  const outcomes: FanOutCopyOutcome[] = [];

  for (const target of targets) {
    // The anchor already holds the composed original — never copy a run onto itself.
    if (target.userId === anchorOwnerId) {
      continue;
    }

    try {
      await copyImageBytes({
        run,
        anchorImageStore,
        targetImageStore: makeImageStore(target.userId, env),
      });
      // Save after the bytes land, so a copy that appears in the feed always has its
      // images reachable. The payload is verbatim — same id, owner-less URLs unchanged.
      await makeRepository(target.userId, env).save(run);

      outcomes.push({ email: target.email, userId: target.userId, status: "copied" });
    } catch (error) {
      outcomes.push({
        email: target.email,
        userId: target.userId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return outcomes;
}

/**
 * Copies the run's image-option bytes from the anchor's storage prefix into the target
 * operator's. The owner-less option path (`${runId}/${optionId}`) is identical in both
 * prefixes; the store applies the owner segment by construction. A run with no Image Set
 * (image generation failed or never ran) has no bytes to copy — only its payload.
 */
async function copyImageBytes({
  run,
  anchorImageStore,
  targetImageStore,
}: {
  run: SavedGenerationRun;
  anchorImageStore: ImageBytesStore;
  targetImageStore: ImageBytesStore;
}): Promise<void> {
  const options = run.imageSet?.options ?? [];

  for (const option of options) {
    const path = imageStoragePath(run.id, option.id);
    const stored = await anchorImageStore.get(path);

    if (!stored) {
      throw new Error(`Anchor image bytes missing for option ${option.id} of run ${run.id}.`);
    }

    await targetImageStore.put(path, stored.bytes, stored.contentType);
  }
}
