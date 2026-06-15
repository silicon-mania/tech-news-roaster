import { resolveRunRepository } from "@/services/saved-runs/run-repository";
import {
  clampPageLimit,
  type RunsRouteDependencies,
  safeParseRun,
  unauthorizedResponse,
} from "./route-support";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return listRuns(request);
}

export async function POST(request: Request) {
  return saveRun(request);
}

/**
 * Lists the Operator Account's runs. Without a `limit` query param it returns
 * the full list (the workspace sidebar hydration); with `limit` it returns one
 * page plus a `nextCursor` — there is no ten-run cap.
 */
export async function listRuns(
  request: Request,
  { resolveRepository = resolveRunRepository }: RunsRouteDependencies = {},
): Promise<Response> {
  const resolution = await resolveRepository();

  if ("unauthorized" in resolution) {
    return unauthorizedResponse();
  }

  const searchParams = new URL(request.url).searchParams;
  const limitParam = searchParams.get("limit");

  if (limitParam === null) {
    const runs = await resolution.repository.list();

    return Response.json({ runs });
  }

  const page = await resolution.repository.listPaginated({
    cursor: searchParams.get("cursor"),
    limit: clampPageLimit(limitParam),
  });

  return Response.json(page);
}

export async function saveRun(
  request: Request,
  { resolveRepository = resolveRunRepository }: RunsRouteDependencies = {},
): Promise<Response> {
  const resolution = await resolveRepository();

  if ("unauthorized" in resolution) {
    return unauthorizedResponse();
  }

  const parsed = safeParseRun(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json({ error: "Invalid run." }, { status: 400 });
  }

  await resolution.repository.save(parsed.run);

  return Response.json({ ok: true });
}
