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
        "google/gemini-2.5-flash-image",
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
      enrichment: {
        credentials: {
          apiKey: false,
        },
        mode: "off",
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
        AI_GATEWAY_IMAGE_MODEL: "google/image-launch",
        AI_GATEWAY_OPENAI_MODEL: "openai/launch",
        OPERATOR_ALLOWLISTED_EMAILS: "operator@example.test",
        OUTSIDE_X_ENRICHMENT_API_KEY: "enrichment-secret",
        OUTSIDE_X_ENRICHMENT_ENDPOINT: "https://enrichment.example.test/enrich",
        SUPABASE_ANON_KEY: "anon-secret",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
        SUPABASE_URL: "https://project.supabase.test",
        TWITTERAPI_IO_API_KEY: "twitter-secret",
      },
      fetcher: buildModelCatalogFetcher(
        ["anthropic/launch", "google/image-launch", "google/launch", "openai/launch"],
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
          imageModel: {
            available: true,
            id: "google/image-launch",
          },
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
      enrichment: {
        credentials: {
          apiKey: true,
        },
        mode: "configured",
      },
      persistence: {
        credentials: {
          operatorAllowlistedEmail: true,
          supabaseAnonKey: true,
          supabaseServiceRoleKey: true,
          supabaseUrl: true,
        },
        mode: "live",
      },
      productionReady: true,
    });
    expect(serializedStatus).not.toContain("gateway-secret");
    expect(serializedStatus).not.toContain("enrichment-secret");
    expect(serializedStatus).not.toContain("twitter-secret");
    expect(serializedStatus).not.toContain("anon-secret");
    expect(serializedStatus).not.toContain("service-role-secret");
  });

  test("reports outside-X enrichment endpoint and bearer token configuration", async () => {
    const response = await runtimeStatus({
      env: {
        OUTSIDE_X_ENRICHMENT_API_KEY: "enrichment-secret",
        OUTSIDE_X_ENRICHMENT_ENDPOINT: "https://enrichment.example.test",
      },
      fetcher: buildModelCatalogFetcher([]),
    });

    await expect(response.json()).resolves.toMatchObject({
      enrichment: {
        credentials: {
          apiKey: true,
        },
        mode: "configured",
      },
    });
  });

  test("marks production not ready without the outside-X enrichment endpoint and bearer token", async () => {
    const response = await runtimeStatus({
      env: {
        AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/launch",
        AI_GATEWAY_API_KEY: "gateway-secret",
        AI_GATEWAY_GOOGLE_MODEL: "google/launch",
        AI_GATEWAY_IMAGE_MODEL: "google/image-launch",
        AI_GATEWAY_OPENAI_MODEL: "openai/launch",
        OPERATOR_ALLOWLISTED_EMAILS: "operator@example.test",
        SUPABASE_ANON_KEY: "anon-secret",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
        SUPABASE_URL: "https://project.supabase.test",
        TWITTERAPI_IO_API_KEY: "twitter-secret",
      },
      fetcher: buildModelCatalogFetcher([
        "anthropic/launch",
        "google/image-launch",
        "google/launch",
        "openai/launch",
      ]),
    });

    await expect(response.json()).resolves.toMatchObject({
      enrichment: {
        credentials: {
          apiKey: false,
        },
        mode: "off",
      },
      productionReady: false,
    });
  });

  test("reports the Supabase persistence boundary as off when its credentials are missing", async () => {
    const response = await runtimeStatus({
      env: {
        OPERATOR_ALLOWLISTED_EMAILS: "operator@example.test",
        SUPABASE_URL: "https://project.supabase.test",
      },
      fetcher: buildModelCatalogFetcher([]),
    });

    await expect(response.json()).resolves.toMatchObject({
      persistence: {
        credentials: {
          operatorAllowlistedEmail: true,
          supabaseAnonKey: false,
          supabaseServiceRoleKey: false,
          supabaseUrl: true,
        },
        mode: "off",
      },
    });
  });

  test("marks production not ready when the Supabase boundary is incomplete", async () => {
    const response = await runtimeStatus({
      env: {
        AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/launch",
        AI_GATEWAY_API_KEY: "gateway-secret",
        AI_GATEWAY_GOOGLE_MODEL: "google/launch",
        AI_GATEWAY_IMAGE_MODEL: "google/image-launch",
        AI_GATEWAY_OPENAI_MODEL: "openai/launch",
        OUTSIDE_X_ENRICHMENT_API_KEY: "enrichment-secret",
        OUTSIDE_X_ENRICHMENT_ENDPOINT: "https://enrichment.example.test/enrich",
        TWITTERAPI_IO_API_KEY: "twitter-secret",
      },
      fetcher: buildModelCatalogFetcher([
        "anthropic/launch",
        "google/image-launch",
        "google/launch",
        "openai/launch",
      ]),
    });

    await expect(response.json()).resolves.toMatchObject({
      persistence: {
        mode: "off",
      },
      productionReady: false,
    });
  });

  test("marks unavailable configured model IDs as not production ready", async () => {
    const response = await runtimeStatus({
      env: {
        AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/missing",
        AI_GATEWAY_API_KEY: "gateway-secret",
        AI_GATEWAY_GOOGLE_MODEL: "google/launch",
        AI_GATEWAY_IMAGE_MODEL: "google/image-launch",
        AI_GATEWAY_OPENAI_MODEL: "openai/launch",
        TWITTERAPI_IO_API_KEY: "twitter-secret",
      },
      fetcher: buildModelCatalogFetcher(["google/image-launch", "google/launch", "openai/launch"]),
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
      fetcher: async () => new Response("Gateway catalog unavailable.", { status: 503 }),
    });

    await expect(response.json()).resolves.toMatchObject({
      generation: {
        aiGateway: {
          catalogReachable: false,
          imageModel: {
            available: false,
          },
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

function buildModelCatalogFetcher(modelIds: string[], requests: string[] = []): typeof fetch {
  return async (input) => {
    requests.push(String(input));

    return Response.json({
      data: modelIds.map((id) => ({ id })),
    });
  };
}
