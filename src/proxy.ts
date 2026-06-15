import type { NextRequest } from "next/server";
import { updateOperatorSession } from "@/services/auth/middleware-session";

// Next 16's request-interception convention (the renamed "middleware"). It runs
// the server-side operator session check on every matched request.
export async function proxy(request: NextRequest) {
  return updateOperatorSession(request);
}

export const config = {
  matcher: [
    // Run on every request except Next internals and static assets. The gate
    // itself (resolveOperatorGate) decides which of these paths are public.
    "/((?!_next/static|_next/image|favicon.ico|assets/|fonts/|.*\\.(?:png|jpe?g|gif|svg|ico|webp|ttf|woff2?)$).*)",
  ],
};
