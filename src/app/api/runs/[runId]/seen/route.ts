import { resolveRunRepository } from "@/services/saved-runs/run-repository";
import { type RunsRouteDependencies, unauthorizedResponse } from "../../route-support";

export const dynamic = "force-dynamic";

type RunRouteContext = {
  params: Promise<{ runId: string }>;
};

export async function POST(_request: Request, context: RunRouteContext) {
  const { runId } = await context.params;

  return markRunSeen(runId);
}

export async function markRunSeen(
  runId: string,
  { resolveRepository = resolveRunRepository }: RunsRouteDependencies = {},
): Promise<Response> {
  const resolution = await resolveRepository();

  if ("unauthorized" in resolution) {
    return unauthorizedResponse();
  }

  await resolution.repository.markSeen(runId);

  return Response.json({ ok: true });
}
