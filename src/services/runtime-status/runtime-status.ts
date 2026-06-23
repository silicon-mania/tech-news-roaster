import { z } from "zod";
import { readOperatorAllowlist } from "@/services/auth";
import { type GenerationProviderId, generationProviderIds } from "@/services/generation";
import {
  readConfiguredAiGatewayImageModel,
  readConfiguredAiGatewayModels,
  readEnvValue,
} from "@/services/generation/ai-gateway-models";

type RuntimeStatusEnvironment = Readonly<Record<string, string | undefined>>;

type RuntimeStatusOptions = {
  env?: RuntimeStatusEnvironment;
  fetcher?: typeof fetch;
};

type AiGatewayModelStatus = {
  available: boolean;
  id: string;
};

export type RuntimeStatus = {
  enrichment: {
    credentials: {
      apiKey: boolean;
    };
    mode: "configured" | "off";
  };
  generation: {
    aiGateway: {
      catalogReachable: boolean;
      imageModel: AiGatewayModelStatus;
      models: Record<GenerationProviderId, AiGatewayModelStatus>;
    };
    credentials: {
      aiGatewayApiKey: boolean;
    };
    mode: "live" | "local";
  };
  persistence: {
    credentials: {
      operatorAllowlistedEmail: boolean;
      supabaseAnonKey: boolean;
      supabaseServiceRoleKey: boolean;
      supabaseUrl: boolean;
    };
    mode: "live" | "off";
  };
  productionCredentials: {
    aiGatewayApiKey: boolean;
    twitterApiIoApiKey: boolean;
  };
  productionReady: boolean;
  retrieval: {
    credentials: {
      twitterApiIoApiKey: boolean;
    };
    mode: "fixture" | "live";
  };
};

const defaultAiGatewayBaseUrl = "https://ai-gateway.vercel.sh/v1";

const aiGatewayModelCatalogSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export async function readRuntimeStatus({
  env = process.env,
  fetcher = fetch,
}: RuntimeStatusOptions = {}): Promise<RuntimeStatus> {
  const twitterApiIoApiKey = hasEnvValue(env.TWITTERAPI_IO_API_KEY);
  const outsideXEnrichmentApiKey = hasEnvValue(env.OUTSIDE_X_ENRICHMENT_API_KEY);
  const outsideXEnrichmentEndpoint = hasEnvValue(env.OUTSIDE_X_ENRICHMENT_ENDPOINT);
  const aiGatewayApiKey =
    hasEnvValue(env.AI_GATEWAY_API_KEY) || hasEnvValue(env.VERCEL_AI_GATEWAY_API_KEY);
  const supabaseUrl = hasEnvValue(env.SUPABASE_URL);
  const supabaseAnonKey = hasEnvValue(env.SUPABASE_ANON_KEY);
  const supabaseServiceRoleKey = hasEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);
  const operatorAllowlistedEmail = readOperatorAllowlist(env).size > 0;
  const persistenceReady =
    supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey && operatorAllowlistedEmail;
  const configuredModelIds = readConfiguredAiGatewayModels(env);
  const configuredImageModelId = readConfiguredAiGatewayImageModel(env);
  const modelCatalog = await readAiGatewayModelCatalog({
    baseUrl: env.AI_GATEWAY_BASE_URL,
    fetcher,
  });
  const models = {} as Record<GenerationProviderId, AiGatewayModelStatus>;

  for (const providerId of generationProviderIds) {
    models[providerId] = {
      available: modelCatalog.modelIds.has(configuredModelIds[providerId]),
      id: configuredModelIds[providerId],
    };
  }
  const allConfiguredModelsAvailable = generationProviderIds.every(
    (providerId) => models[providerId].available,
  );
  const imageModel = {
    available: modelCatalog.modelIds.has(configuredImageModelId),
    id: configuredImageModelId,
  };

  return {
    enrichment: {
      credentials: {
        apiKey: outsideXEnrichmentApiKey,
      },
      mode: outsideXEnrichmentEndpoint ? "configured" : "off",
    },
    generation: {
      aiGateway: {
        catalogReachable: modelCatalog.catalogReachable,
        imageModel,
        models,
      },
      credentials: {
        aiGatewayApiKey,
      },
      mode: aiGatewayApiKey ? "live" : "local",
    },
    persistence: {
      credentials: {
        operatorAllowlistedEmail,
        supabaseAnonKey,
        supabaseServiceRoleKey,
        supabaseUrl,
      },
      mode: persistenceReady ? "live" : "off",
    },
    productionCredentials: {
      aiGatewayApiKey,
      twitterApiIoApiKey,
    },
    productionReady:
      twitterApiIoApiKey &&
      aiGatewayApiKey &&
      outsideXEnrichmentEndpoint &&
      outsideXEnrichmentApiKey &&
      allConfiguredModelsAvailable &&
      imageModel.available &&
      persistenceReady,
    retrieval: {
      credentials: {
        twitterApiIoApiKey,
      },
      mode: twitterApiIoApiKey ? "live" : "fixture",
    },
  };
}

/**
 * Whether the Runtime Readiness Gate clears the boundaries an automated Discovery
 * Sweep requires before it starts anything: live followed-accounts retrieval, live
 * Supabase persistence, and the image model present in the AI Gateway catalog. A
 * sweep that finds this `false` starts nothing that cycle (PRD user story 20), so
 * automation never produces broken half-runs.
 *
 * Text-generation model availability is deliberately *not* gated here: Provider
 * Fallback lets an Automated Run complete on a subset of the three text providers,
 * so requiring all three would reject runs that would otherwise succeed.
 */
export function isDiscoverySweepReady(status: RuntimeStatus): boolean {
  return (
    status.retrieval.mode === "live" &&
    status.persistence.mode === "live" &&
    status.generation.aiGateway.imageModel.available
  );
}

async function readAiGatewayModelCatalog({
  baseUrl,
  fetcher,
}: {
  baseUrl?: string;
  fetcher: typeof fetch;
}) {
  try {
    const response = await fetcher(buildModelCatalogUrl(baseUrl));

    if (!response.ok) {
      return {
        catalogReachable: false,
        modelIds: new Set<string>(),
      };
    }

    const catalog = aiGatewayModelCatalogSchema.parse(await response.json());

    return {
      catalogReachable: true,
      modelIds: new Set(catalog.data.map((model) => model.id)),
    };
  } catch {
    return {
      catalogReachable: false,
      modelIds: new Set<string>(),
    };
  }
}

function buildModelCatalogUrl(baseUrl?: string) {
  const normalizedBaseUrl = readEnvValue(baseUrl) ?? defaultAiGatewayBaseUrl;

  return `${normalizedBaseUrl.replace(/\/$/, "")}/models`;
}

function hasEnvValue(value: string | undefined) {
  return Boolean(readEnvValue(value));
}
