import { z } from "zod";
import { type GenerationProviderId, generationProviderIds } from "@/services/generation";
import {
  readConfiguredAiGatewayImageModel,
  readConfiguredAiGatewayModels,
  readConfiguredAiGatewayVisualJokeModel,
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
      visualJokeModel: AiGatewayModelStatus;
    };
    credentials: {
      aiGatewayApiKey: boolean;
    };
    mode: "live" | "local";
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
  const configuredModelIds = readConfiguredAiGatewayModels(env);
  const configuredImageModelId = readConfiguredAiGatewayImageModel(env);
  const configuredVisualJokeModelId = readConfiguredAiGatewayVisualJokeModel(env);
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
  const visualJokeModel = {
    available: modelCatalog.modelIds.has(configuredVisualJokeModelId),
    id: configuredVisualJokeModelId,
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
        visualJokeModel,
      },
      credentials: {
        aiGatewayApiKey,
      },
      mode: aiGatewayApiKey ? "live" : "local",
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
      visualJokeModel.available,
    retrieval: {
      credentials: {
        twitterApiIoApiKey,
      },
      mode: twitterApiIoApiKey ? "live" : "fixture",
    },
  };
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
