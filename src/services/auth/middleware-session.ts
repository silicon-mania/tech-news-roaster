import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { resolveOperatorGate } from "./operator-gate";
import { readSupabaseConfig } from "./supabase-config";
import { createSupabaseServerClient } from "./supabase-server-client";

/**
 * The server-side session check. It refreshes the operator session, then either
 * lets the request through, redirects an unauthenticated page request to the
 * sign-in surface, or rejects an unauthenticated API request with 401. When
 * Supabase is unconfigured it is a no-op so local fixture development is
 * unaffected.
 */
export async function updateOperatorSession(request: NextRequest): Promise<NextResponse> {
  const config = readSupabaseConfig(process.env);

  if (!config) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createSupabaseServerClient(config, {
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }

      response = NextResponse.next({ request });

      for (const { name, options, value } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const decision = resolveOperatorGate({
    hasOperator: Boolean(user),
    isConfigured: true,
    pathname: request.nextUrl.pathname,
  });

  if (decision.type === "redirect") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = decision.location;

    const redirectResponse = NextResponse.redirect(redirectUrl);

    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }

    return redirectResponse;
  }

  if (decision.type === "unauthorized") {
    return NextResponse.json({ error: "Operator authentication required." }, { status: 401 });
  }

  return response;
}
