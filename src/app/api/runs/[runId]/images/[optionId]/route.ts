import { imageStoragePath, resolveImageBytesStore } from "@/services/saved-runs/image-bytes-store";
import { unauthorizedResponse } from "../../../route-support";

export const dynamic = "force-dynamic";

/**
 * The single seam this route is driven through. Defaulting to
 * {@link resolveImageBytesStore} keeps the ownership gate and Supabase wiring in
 * one place; tests inject a fake store (or an unauthorized result) so the route
 * contract is exercised without a backend.
 */
export type ImageBytesRouteDependencies = {
  resolveStore?: typeof resolveImageBytesStore;
};

type ImageRouteContext = {
  params: Promise<{ optionId: string; runId: string }>;
};

export async function GET(_request: Request, context: ImageRouteContext) {
  const { optionId, runId } = await context.params;

  return serveImageBytes({ optionId, runId });
}

/**
 * Streams one stored Image Option's bytes back to the browser. The bytes live in
 * owner-scoped object storage and are reached only through this route, so a
 * reopened run loads its images with no regeneration and never sees a storage
 * key or credential (ADR-0019).
 */
export async function serveImageBytes(
  { optionId, runId }: { optionId: string; runId: string },
  { resolveStore = resolveImageBytesStore }: ImageBytesRouteDependencies = {},
): Promise<Response> {
  const resolution = await resolveStore();

  if ("unauthorized" in resolution) {
    return unauthorizedResponse();
  }

  const stored = await resolution.store.get(imageStoragePath(runId, optionId));

  if (!stored) {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(stored.bytes), {
    headers: {
      // Bytes are content-addressed by run + option id and never change, so the
      // browser can cache them hard; keep it private to the operator.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Type": stored.contentType,
    },
  });
}
