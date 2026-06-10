import { readRuntimeStatus } from "@/services/runtime-status";

export const dynamic = "force-dynamic";

export async function GET() {
  return runtimeStatus();
}

export async function runtimeStatus(dependencies: Parameters<typeof readRuntimeStatus>[0] = {}) {
  const status = await readRuntimeStatus(dependencies);

  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
