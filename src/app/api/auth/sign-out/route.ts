import { isSupabaseConfigured } from "@/services/auth";
import {
  createOperatorAuthClient,
  type OperatorAuthClientFactory,
} from "@/services/auth/operator-auth";

export const dynamic = "force-dynamic";

type SignOutDependencies = {
  createAuthClient?: OperatorAuthClientFactory;
  env?: Readonly<Record<string, string | undefined>>;
};

export async function POST() {
  return signOutOperator();
}

export async function signOutOperator({
  createAuthClient = createOperatorAuthClient,
  env = process.env,
}: SignOutDependencies = {}) {
  if (!isSupabaseConfigured(env)) {
    return Response.json({ ok: true });
  }

  const authClient = await createAuthClient(env);
  await authClient.signOut();

  return Response.json({ ok: true });
}
