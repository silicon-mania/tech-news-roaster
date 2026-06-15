import { resolveRunRepository } from "@/services/saved-runs/run-repository";
import { type RunsRouteDependencies, unauthorizedResponse } from "../route-support";

export const dynamic = "force-dynamic";

type RunRouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(_request: Request, context: RunRouteContext) {
  const { runId } = await context.params;

  return loadRunById(runId);
}

export async function DELETE(_request: Request, context: RunRouteContext) {
  const { runId } = await context.params;

  return deleteRunById(runId);
}

export async function loadRunById(
  runId: string,
  { resolveRepository = resolveRunRepository }: RunsRouteDependencies = {},
): Promise<Response> {
  const resolution = await resolveRepository();

  if ("unauthorized" in resolution) {
    return unauthorizedResponse();
  }

  const run = await resolution.repository.loadById(runId);

  if (!run) {
    return Response.json({ error: "Run not found." }, { status: 404 });
  }

  return Response.json({ run });
}

export async function deleteRunById(
  runId: string,
  { resolveRepository = resolveRunRepository }: RunsRouteDependencies = {},
): Promise<Response> {
  const resolution = await resolveRepository();

  if ("unauthorized" in resolution) {
    return unauthorizedResponse();
  }

  await resolution.repository.delete(runId);

  return Response.json({ ok: true });
}
