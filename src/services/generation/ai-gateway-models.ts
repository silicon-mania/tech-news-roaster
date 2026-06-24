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
 * Resolves the AI Gateway credential for a run. The two run kinds map to two
 * separate, independently-billed Vercel keys with **no fallback between them**:
 * manual (Workspace) runs use `AI_GATEWAY_API_KEY`, automated (cron) runs use
 * `AI_GATEWAY_AUTOMATED_API_KEY`. Keeping them distinct lets a spend limit on the
 * automated key cap the cron without ever touching the manual key. Returns
 * undefined when the relevant key is unset — local dev then falls back to local
 * providers; production requires both keys.
 */
export function readAiGatewayApiKey(
  env: AiGatewayModelEnvironment,
  runKind: GatewayRunKind = "manual",
) {
  return runKind === "automated"
    ? readEnvValue(env.AI_GATEWAY_AUTOMATED_API_KEY)
    : readEnvValue(env.AI_GATEWAY_API_KEY);
}
