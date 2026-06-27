import { parseSavedGenerationRun } from "@/services/generation";
import type { GenerationRun, GenerationRunInput } from "./types";

const generationRunsEndpoint = "/api/generation-runs";

/**
 * Composes a Manual Run server-side in one request (no streaming) and resolves to
 * the persisted run. The client mints the
 * run id and passes it through so the optimistic placeholder and the returned run
 * share one id (stable optimistic UI; one id avoids collisions on the owner/run
 * composite key). The route persists under the signed-in Operator and returns the
 * finished run — including a failed-status run (HTTP 200), which resolves normally
 * so the workspace can show it. Only an unresolved operator (401) or a
 * missing/invalid URL (400) reject, carrying the route's message for the caller's
 * submission error state. Like `httpSavedRunStore`, the browser reaches Supabase
 * only through the server route, so service keys never enter the bundle (ADR-0019).
 */
export async function submitManualRun(
  runId: string,
  runInput: GenerationRunInput,
  { fetcher = fetch }: { fetcher?: typeof fetch } = {},
): Promise<GenerationRun> {
  const response = await fetcher(generationRunsEndpoint, {
    body: JSON.stringify({
      runId,
      sourceTweetUrl: runInput.sourceTweetUrl,
      usersDirection: runInput.usersDirection,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await readSubmitErrorMessage(response));
  }

  const body = (await response.json()) as { run?: unknown };

  return parseSavedGenerationRun(body.run);
}

/**
 * The route reports a rejected submission as `{ error }` (401 unauthorized, 400
 * bad/missing URL). Surface that message — mirroring the old stream's `failed`
 * event — and fall back to a generic line when the body is missing or not JSON.
 */
async function readSubmitErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };

    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Non-JSON or empty body — fall through to the generic message.
  }

  return "Failed to start the generation run.";
}
