import { z } from "zod";
import { isAllowlistedOperatorEmail, isSupabaseConfigured } from "@/services/auth";
import {
  createOperatorAuthClient,
  type OperatorAuthClientFactory,
} from "@/services/auth/operator-auth";

export const dynamic = "force-dynamic";

const verifyCodeSchema = z.object({
  code: z.string().trim().min(1),
  email: z.string().email(),
});

type VerifyCodeDependencies = {
  createAuthClient?: OperatorAuthClientFactory;
  env?: Readonly<Record<string, string | undefined>>;
};

export async function POST(request: Request) {
  return verifyOperatorCode(request);
}

export async function verifyOperatorCode(
  request: Request,
  { createAuthClient = createOperatorAuthClient, env = process.env }: VerifyCodeDependencies = {},
) {
  if (!isSupabaseConfigured(env)) {
    return Response.json({ error: "Operator authentication is not configured." }, { status: 503 });
  }

  const body = verifyCodeSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return Response.json({ error: "Enter the code that was emailed to you." }, { status: 400 });
  }

  if (!isAllowlistedOperatorEmail(body.data.email, env)) {
    return Response.json({ error: "This email is not allowed to sign in." }, { status: 403 });
  }

  const authClient = await createAuthClient(env);
  const { error } = await authClient.verifyCode({ code: body.data.code, email: body.data.email });

  if (error) {
    console.error("Operator sign-in code verification failed.", error);

    return Response.json({ error: "That code is invalid or has expired." }, { status: 401 });
  }

  // On success the Supabase client has written the session cookies via the
  // route handler's cookie adapter, so the operator is now signed in.
  return Response.json({ ok: true });
}
