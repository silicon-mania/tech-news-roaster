import type { GenerationProviderId } from "@/services/generation";

type AiGatewayModelEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Which AI Gateway credential a run authenticates with. Mirrors a run's
 * `origin`: "manual" is a Workspace run, "automated" is the unattended Discovery
 * Sweep / cron (and the automated-only Newsworthiness Filter). The two map to
 * separate Vercel AI Gateway keys so a spend limit on the automated key can cap
 * the cron without throttling Workspace users (see {@link readAiGatewayApiKey}).
 */
export type GatewayRunKind = "automated" | "manual";

const defaultAiGatewayModels: Record<GenerationProviderId, string> = {
  anthropic: "anthropic/claude-sonnet-4.6",
  google: "google/gemini-3-flash",
  openai: "openai/gpt-5.4-mini",
};

const defaultAiGatewayImageModel = "google/gemini-2.5-flash-image";

export function readConfiguredAiGatewayModels(env: AiGatewayModelEnvironment) {
  return {
    anthropic: readEnvValue(env.AI_GATEWAY_ANTHROPIC_MODEL) ?? defaultAiGatewayModels.anthropic,
    google: readEnvValue(env.AI_GATEWAY_GOOGLE_MODEL) ?? defaultAiGatewayModels.google,
    openai: readEnvValue(env.AI_GATEWAY_OPENAI_MODEL) ?? defaultAiGatewayModels.openai,
  } satisfies Record<GenerationProviderId, string>;
}

export function readConfiguredAiGatewayImageModel(env: AiGatewayModelEnvironment) {
  return readEnvValue(env.AI_GATEWAY_IMAGE_MODEL) ?? defaultAiGatewayImageModel;
}

export function readEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}

/**
 * Resolves the AI Gateway credential for a run. Manual runs (the Workspace
 * default) use `AI_GATEWAY_API_KEY ?? VERCEL_AI_GATEWAY_API_KEY` — unchanged.
 * Automated runs prefer `AI_GATEWAY_AUTOMATED_API_KEY` so its Vercel spend limit
 * caps the cron without throttling Workspace users, and fall back to the shared
 * key when it is unset, preserving pre-split behavior until the cron key is
 * configured. Both `enrich/route.ts` and `runtime-status.ts` keep their own
 * shared-key reads — only the in-app generation pipeline splits.
 */
export function readAiGatewayApiKey(
  env: AiGatewayModelEnvironment,
  runKind: GatewayRunKind = "manual",
) {
  const sharedKey =
    readEnvValue(env.AI_GATEWAY_API_KEY) ?? readEnvValue(env.VERCEL_AI_GATEWAY_API_KEY);

  if (runKind === "automated") {
    return readEnvValue(env.AI_GATEWAY_AUTOMATED_API_KEY) ?? sharedKey;
  }

  return sharedKey;
}
