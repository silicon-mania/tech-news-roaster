import { z } from "zod";
import { isAllowlistedOperatorEmail, isSupabaseConfigured } from "@/services/auth";
import {
  createOperatorAuthClient,
  type OperatorAuthClientFactory,
} from "@/services/auth/operator-auth";

export const dynamic = "force-dynamic";

const requestCodeSchema = z.object({
  email: z.string().email(),
});

type RequestCodeDependencies = {
  createAuthClient?: OperatorAuthClientFactory;
  env?: Readonly<Record<string, string | undefined>>;
};

export async function POST(request: Request) {
  return requestOperatorCode(request);
}

export async function requestOperatorCode(
  request: Request,
  { createAuthClient = createOperatorAuthClient, env = process.env }: RequestCodeDependencies = {},
) {
  if (!isSupabaseConfigured(env)) {
    return Response.json({ error: "Operator authentication is not configured." }, { status: 503 });
  }

  const body = requestCodeSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Enforce the single-operator allowlist before touching Supabase: a
  // non-allowlisted email never receives a code, so it can neither sign in nor
  // create an account.
  if (!isAllowlistedOperatorEmail(body.data.email, env)) {
    return Response.json({ error: "This email is not allowed to sign in." }, { status: 403 });
  }

  const authClient = await createAuthClient(env);
  const { error } = await authClient.requestCode(body.data.email);

  if (error) {
    // Log the real provider error server-side (e.g. "Error sending confirmation
    // email" when SMTP is misconfigured) while keeping the client message
    // generic. The most common cause is Supabase email/SMTP not being set up.
    console.error("Operator sign-in code request failed.", error);

    return Response.json({ error: "The sign-in code could not be sent." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
