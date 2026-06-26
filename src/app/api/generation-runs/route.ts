import {
  type ComposeManualRunInput,
  composeManualRun,
} from "@/services/manual-run/compose-manual-run";
import { parseSourceTweetUrl } from "@/services/workspace";

export const dynamic = "force-dynamic";

/**
 * A Manual Run is composed synchronously in the request (tweet retrieval → joke
 * context → three-provider Text Generation + News-Linked Image Discovery + News
 * Category classification → Image Original Candidates), unlike the lighter runs
 * read/write endpoint. It does no Image Generation, so it needs a longer-than-
 * default window but a smaller one than the image-generating automated path.
 * Vercel clamps this to the plan/Fluid-compute maximum. See docs/deployment.md.
 */
export const maxDuration = 300;

type GenerationRunsRouteDependencies = {
  compose?: typeof composeManualRun;
};

export async function POST(request: Request) {
  return createGenerationRun(request);
}

/**
 * Composes and persists a Manual Run under the signed-in Operator Account, then
 * returns the persisted run. Mirrors the bot-ingest contract: a composition that
 * ends in a failed run is still persisted and returned (HTTP 200 with a
 * failed-status run) so the workspace can show it; an unresolved operator is 401
 * (the same gate the runs endpoint uses, applied inside the composer); a
 * missing/invalid Source Tweet URL is 400. No path publishes to X.
 */
export async function createGenerationRun(
  request: Request,
  { compose = composeManualRun }: GenerationRunsRouteDependencies = {},
): Promise<Response> {
  const body = await readManualRunBody(request);

  if (!body.ok) {
    return Response.json({ error: body.error }, { status: 400 });
  }

  const result = await compose(body.value);

  if ("unauthorized" in result) {
    return Response.json({ error: "Operator authentication required." }, { status: 401 });
  }

  return Response.json({ run: result.run });
}

type ManualRunBody = { ok: true; value: ComposeManualRunInput } | { ok: false; error: string };

async function readManualRunBody(request: Request): Promise<ManualRunBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "Request body must be JSON." };
  }

  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { runId, sourceTweetUrl, usersDirection } = body as {
    runId?: unknown;
    sourceTweetUrl?: unknown;
    usersDirection?: unknown;
  };

  if (typeof sourceTweetUrl !== "string") {
    return {
      ok: false,
      error: "Provide the source tweet URL as a string field 'sourceTweetUrl'.",
    };
  }

  // The same validator the Workspace submit form uses, so the route accepts exactly
  // what the form accepts; it trims and returns the cleaned URL.
  const parsedUrl = parseSourceTweetUrl(sourceTweetUrl);

  if (!parsedUrl.success) {
    return { ok: false, error: parsedUrl.message };
  }

  if (usersDirection !== undefined && typeof usersDirection !== "string") {
    return { ok: false, error: "usersDirection must be a string when provided." };
  }

  if (runId !== undefined && (typeof runId !== "string" || runId.trim().length === 0)) {
    return { ok: false, error: "runId must be a non-empty string when provided." };
  }

  return {
    ok: true,
    value: {
      sourceTweetUrl: parsedUrl.url,
      // The operator's optional creative steering; empty when none was submitted.
      usersDirection: usersDirection ?? "",
      // The client-minted run id rides through for a stable optimistic UI; the
      // composer mints one when absent.
      ...(runId ? { runId } : {}),
    },
  };
}
