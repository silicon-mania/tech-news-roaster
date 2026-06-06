import { describe, expect, test } from "vitest";
import { runtimeStatus } from "./route";

describe("runtime status route", () => {
  test("reports missing credentials without exposing secret values", async () => {
    const response = await runtimeStatus({
      env: {
        NODE_ENV: "production",
      },
      fetcher: buildModelCatalogFetcher([
        "anthropic/claude-sonnet-4.6",
        "google/gemini-3-flash",
        "openai/gpt-5.4-mini",
      ]),
    });
    const status = await response.json();
    const serializedStatus = JSON.stringify(status);

    expect(status).toMatchObject({
      retrieval: {
        mode: "fixture",
        credentials: {
          twitterApiIoApiKey: false,
        },
      },
      generation: {
        mode: "local",
        credentials: {
          aiGatewayApiKey: false,
        },
      },
      productionCredentials: {
        aiGatewayApiKey: false,
        twitterApiIoApiKey: false,
      },
      productionReady: false,
    });
    expect(serializedStatus).not.toContain("TWITTERAPI_IO_API_KEY");
    expect(serializedStatus).not.toContain("AI_GATEWAY_API_KEY");
  });

  test("reports live retrieval and generation when required credentials and models are available", async () => {
    const fetchRequests: string[] = [];
    const response = await runtimeStatus({
      env: {
        AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/launch",
        AI_GATEWAY_API_KEY: "gateway-secret",
        AI_GATEWAY_GOOGLE_MODEL: "google/launch",
        AI_GATEWAY_OPENAI_MODEL: "openai/launch",
        TWITTERAPI_IO_API_KEY: "twitter-secret",
      },
      fetcher: buildModelCatalogFetcher(
        ["anthropic/launch", "google/launch", "openai/launch"],
        fetchRequests,
      ),
    });
    const status = await response.json();
    const serializedStatus = JSON.stringify(status);

    expect(fetchRequests).toEqual(["https://ai-gateway.vercel.sh/v1/models"]);
    expect(status).toMatchObject({
      retrieval: {
        mode: "live",
        credentials: {
          twitterApiIoApiKey: true,
        },
      },
      generation: {
        mode: "live",
        credentials: {
          aiGatewayApiKey: true,
        },
        aiGateway: {
          catalogReachable: true,
          models: {
            anthropic: {
              available: true,
              id: "anthropic/launch",
            },
            google: {
              available: true,
              id: "google/launch",
            },
            openai: {
              available: true,
              id: "openai/launch",
            },
          },
        },
      },
      productionReady: true,
    });
    expect(serializedStatus).not.toContain("gateway-secret");
    expect(serializedStatus).not.toContain("twitter-secret");
  });

  test("reports optional outside-X enrichment configuration", async () => {
    const response = await runtimeStatus({
      env: {
        OUTSIDE_X_ENRICHMENT_ENDPOINT: "https://enrichment.example.test",
      },
      fetcher: buildModelCatalogFetcher([]),
    });

    await expect(response.json()).resolves.toMatchObject({
      enrichment: {
        mode: "configured",
      },
    });
  });

  test("marks unavailable configured model IDs as not production ready", async () => {
    const response = await runtimeStatus({
      env: {
        AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/missing",
        AI_GATEWAY_API_KEY: "gateway-secret",
        AI_GATEWAY_GOOGLE_MODEL: "google/launch",
        AI_GATEWAY_OPENAI_MODEL: "openai/launch",
        TWITTERAPI_IO_API_KEY: "twitter-secret",
      },
      fetcher: buildModelCatalogFetcher(["google/launch", "openai/launch"]),
    });

    await expect(response.json()).resolves.toMatchObject({
      generation: {
        aiGateway: {
          catalogReachable: true,
          models: {
            anthropic: {
              available: false,
              id: "anthropic/missing",
            },
            google: {
              available: true,
              id: "google/launch",
            },
            openai: {
              available: true,
              id: "openai/launch",
            },
          },
        },
      },
      productionReady: false,
    });
  });

  test("treats an unreachable model catalog as unavailable without calling generation providers", async () => {
    const response = await runtimeStatus({
      env: {
        AI_GATEWAY_API_KEY: "gateway-secret",
        TWITTERAPI_IO_API_KEY: "twitter-secret",
      },
      fetcher: async () =>
        new Response("Gateway catalog unavailable.", { status: 503 }),
    });

    await expect(response.json()).resolves.toMatchObject({
      generation: {
        aiGateway: {
          catalogReachable: false,
          models: {
            anthropic: {
              available: false,
            },
            google: {
              available: false,
            },
            openai: {
              available: false,
            },
          },
        },
      },
      productionReady: false,
    });
  });
});

function buildModelCatalogFetcher(
  modelIds: string[],
  requests: string[] = [],
): typeof fetch {
  return async (input) => {
    requests.push(String(input));

    return Response.json({
      data: modelIds.map((id) => ({ id })),
    });
  };
}
