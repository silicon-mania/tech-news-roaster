import type { GenerationProviderId } from "./generation-events";

type AiGatewayModelEnvironment = Readonly<Record<string, string | undefined>>;

const defaultAiGatewayModels: Record<GenerationProviderId, string> = {
  anthropic: "anthropic/claude-sonnet-4.6",
  google: "google/gemini-3-flash",
  openai: "openai/gpt-5.4-mini",
};

const defaultAiGatewayImageModel = "google/gemini-2.5-flash-image-preview";

export function readConfiguredAiGatewayModels(env: AiGatewayModelEnvironment) {
  return {
    anthropic:
      readEnvValue(env.AI_GATEWAY_ANTHROPIC_MODEL) ??
      defaultAiGatewayModels.anthropic,
    google:
      readEnvValue(env.AI_GATEWAY_GOOGLE_MODEL) ??
      defaultAiGatewayModels.google,
    openai:
      readEnvValue(env.AI_GATEWAY_OPENAI_MODEL) ??
      defaultAiGatewayModels.openai,
  } satisfies Record<GenerationProviderId, string>;
}

export function readConfiguredAiGatewayImageModel(
  env: AiGatewayModelEnvironment,
) {
  return readEnvValue(env.AI_GATEWAY_IMAGE_MODEL) ?? defaultAiGatewayImageModel;
}

export function readEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}
