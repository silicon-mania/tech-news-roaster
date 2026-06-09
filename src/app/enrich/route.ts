import { z } from "zod";

export const dynamic = "force-dynamic";

const serperBaseUrl = "https://google.serper.dev";
const defaultEnrichmentModel = "google/gemini-3-flash";
const defaultAiGatewayBaseUrl = "https://ai-gateway.vercel.sh/v1";

const sourceTweetSchema = z
  .object({
    id: z.string().min(1),
    url: z.string().url(),
    text: z.string().min(1),
    createdAt: z.string().datetime(),
    author: z
      .object({
        username: z.string().min(1),
        displayName: z.string().min(1),
      })
      .strict(),
    metrics: z
      .object({
        replies: z.number().int().nonnegative(),
        reposts: z.number().int().nonnegative(),
        quotes: z.number().int().nonnegative(),
        likes: z.number().int().nonnegative(),
        views: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const replySignalSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    engagementScore: z.number().int().nonnegative(),
  })
  .strict();

const enrichmentRequestSchema = z
  .object({
    sourceTweet: sourceTweetSchema,
    replySignals: z.array(replySignalSchema).max(6),
    usersDirection: z.string(),
  })
  .strict();

const enrichmentItemSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    url: z.string().url().optional(),
  })
  .strict();

const newsLinkedImageSchema = z
  .object({
    url: z.string().url(),
    altText: z.string().min(1).optional(),
    sourceUrl: z.string().url().optional(),
    title: z.string().min(1).optional(),
  })
  .strict();

const enrichmentResponseSchema = z
  .object({
    retrievedAt: z.string().datetime(),
    items: z.array(enrichmentItemSchema).min(1).max(5),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5),
  })
  .strict();

const serperOrganicResultSchema = z
  .object({
    title: z.string().optional(),
    link: z.string().optional(),
    snippet: z.string().optional(),
    imageUrl: z.string().optional(),
  })
  .passthrough();

const serperSearchResponseSchema = z
  .object({
    organic: z.array(serperOrganicResultSchema).optional(),
    news: z.array(serperOrganicResultSchema).optional(),
  })
  .passthrough();

const serperImageResultSchema = z
  .object({
    title: z.string().optional(),
    imageUrl: z.string().optional(),
    link: z.string().optional(),
    source: z.string().optional(),
  })
  .passthrough();

const serperImagesResponseSchema = z
  .object({
    images: z.array(serperImageResultSchema).optional(),
  })
  .passthrough();

const gatewayResponseSchema = z
  .object({
    choices: z
      .array(
        z.object({
          message: z.object({
            content: z.string().min(1),
          }),
        }),
      )
      .min(1),
  })
  .passthrough();

const summarizedItemsSchema = z
  .object({
    items: z.array(enrichmentItemSchema).min(1).max(5),
  })
  .strict();

type EnrichmentRequest = z.infer<typeof enrichmentRequestSchema>;
type EnrichmentItem = z.infer<typeof enrichmentItemSchema>;
type NewsLinkedImage = z.infer<typeof newsLinkedImageSchema>;

type FindingCandidate = {
  title: string;
  summary: string;
  url: string;
};

type ImageCandidate = {
  index: number;
  title?: string;
  url: string;
  sourceUrl?: string;
};

export async function POST(request: Request) {
  const authFailure = authorizeRequest(request);

  if (authFailure) {
    return authFailure;
  }

  const serperApiKey = readEnvValue(process.env.SERPER_API_KEY);

  if (!serperApiKey) {
    return Response.json(
      { message: "Serper credentials are not configured." },
      { status: 500 },
    );
  }

  const parsedRequest = enrichmentRequestSchema.safeParse(
    await readRequestJson(request),
  );

  if (!parsedRequest.success) {
    return Response.json(
      { message: "Invalid enrichment request." },
      { status: 400 },
    );
  }

  try {
    const query = buildSearchQuery(parsedRequest.data);
    const [searchPayload, imagesPayload] = await Promise.all([
      searchSerper("search", query, serperApiKey),
      searchSerper("images", query, serperApiKey),
    ]);
    const findingCandidates = extractFindingCandidates(searchPayload);

    if (findingCandidates.length === 0) {
      return Response.json(
        { message: "No outside-X findings were found." },
        { status: 422 },
      );
    }

    const items = await summarizeFindings({
      candidates: findingCandidates,
      input: parsedRequest.data,
    });
    const newsLinkedImages = selectNewsLinkedImages({
      fallbackSearchPayload: searchPayload,
      imagesPayload,
      items,
    });

    if (newsLinkedImages.length === 0) {
      return Response.json(
        { message: "No news-linked images were found." },
        { status: 422 },
      );
    }

    return Response.json(
      enrichmentResponseSchema.parse({
        retrievedAt: new Date().toISOString(),
        items,
        newsLinkedImages,
      }),
    );
  } catch (error) {
    console.error("Outside-X enrichment failed.", error);

    return Response.json(
      { message: "Outside-X enrichment failed." },
      { status: 502 },
    );
  }
}

function authorizeRequest(request: Request) {
  const expectedApiKey = readEnvValue(process.env.OUTSIDE_X_ENRICHMENT_API_KEY);

  if (!expectedApiKey) {
    return Response.json(
      { message: "Outside-X enrichment API key is not configured." },
      { status: 500 },
    );
  }

  if (request.headers.get("Authorization") !== `Bearer ${expectedApiKey}`) {
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  }

  return null;
}

async function readRequestJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function buildSearchQuery({ replySignals, sourceTweet }: EnrichmentRequest) {
  const replyContext = replySignals
    .slice(0, 2)
    .map((replySignal) => replySignal.text)
    .join(" ");
  const query = [
    sourceTweet.text,
    sourceTweet.author.displayName,
    sourceTweet.author.username,
    replyContext,
  ]
    .filter(Boolean)
    .join(" ");

  return truncateAtWordBoundary(query.replace(/\s+/g, " ").trim(), 420);
}

async function searchSerper(
  kind: "images" | "search",
  query: string,
  apiKey: string,
) {
  const response = await fetch(`${serperBaseUrl}/${kind}`, {
    body: JSON.stringify({
      num: 10,
      q: query,
    }),
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Serper ${kind} search failed (${response.status}).`);
  }

  return response.json();
}

function extractFindingCandidates(payload: unknown): FindingCandidate[] {
  const searchPayload = serperSearchResponseSchema.parse(payload);
  const candidates = [
    ...(searchPayload.news ?? []),
    ...(searchPayload.organic ?? []),
  ];
  const seenUrls = new Set<string>();

  return candidates.flatMap((candidate) => {
    const url = normalizeHttpUrl(candidate.link);
    const title = candidate.title?.trim();

    if (!url || !title || seenUrls.has(url)) {
      return [];
    }

    seenUrls.add(url);

    return [
      {
        title,
        summary:
          candidate.snippet?.trim() ??
          "External context related to the source tweet.",
        url,
      },
    ];
  });
}

async function summarizeFindings({
  candidates,
  input,
}: {
  candidates: FindingCandidate[];
  input: EnrichmentRequest;
}): Promise<EnrichmentItem[]> {
  try {
    const gatewayKey = readAiGatewayApiKey();

    if (!gatewayKey) {
      throw new Error("AI Gateway credentials are not configured.");
    }

    const response = await fetch(`${readAiGatewayBaseUrl()}/chat/completions`, {
      body: JSON.stringify({
        messages: [
          {
            content:
              "You select concise external news context for a tech-news quote-tweet system. Return only JSON.",
            role: "system",
          },
          {
            content: JSON.stringify({
              task: "Select 1 to 5 relevant outside-X findings. Use only the provided candidates.",
              outputShape: {
                items: [
                  {
                    title: "Article/report title",
                    summary:
                      "One short hidden news context sentence used by text generation.",
                    url: "Candidate URL",
                  },
                ],
              },
              sourceTweet: input.sourceTweet,
              replySignals: input.replySignals,
              usersDirection: input.usersDirection,
              candidates: candidates.slice(0, 10),
            }),
            role: "user",
          },
        ],
        model:
          readEnvValue(process.env.OUTSIDE_X_ENRICHMENT_MODEL) ??
          defaultEnrichmentModel,
        temperature: 0.2,
      }),
      headers: {
        Authorization: `Bearer ${gatewayKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`AI Gateway summarization failed (${response.status}).`);
    }

    const payload = gatewayResponseSchema.parse(await response.json());
    const summarized = summarizedItemsSchema.parse(
      JSON.parse(extractJsonObject(payload.choices[0].message.content)),
    );

    return summarized.items;
  } catch (error) {
    console.warn("Using deterministic Serper snippets for enrichment.", error);

    return candidates.slice(0, 5).map((candidate) => ({
      title: candidate.title,
      summary: truncateAtWordBoundary(candidate.summary, 220),
      url: candidate.url,
    }));
  }
}

function selectNewsLinkedImages({
  fallbackSearchPayload,
  imagesPayload,
  items,
}: {
  fallbackSearchPayload: unknown;
  imagesPayload: unknown;
  items: EnrichmentItem[];
}): NewsLinkedImage[] {
  const imageCandidates = extractImageCandidates({
    fallbackSearchPayload,
    imagesPayload,
  });
  const findingDomains = new Set(
    items
      .map((item) => (item.url ? readDomain(item.url) : null))
      .filter((domain): domain is string => Boolean(domain)),
  );
  const seenUrls = new Set<string>();

  return imageCandidates
    .map((image) => ({
      image,
      score:
        image.sourceUrl && findingDomains.has(readDomain(image.sourceUrl) ?? "")
          ? 1
          : 0,
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.image.index - right.image.index,
    )
    .flatMap(({ image }) => {
      if (seenUrls.has(image.url)) {
        return [];
      }

      seenUrls.add(image.url);

      return [
        newsLinkedImageSchema.parse({
          url: image.url,
          altText: image.title,
          sourceUrl: image.sourceUrl,
          title: image.title,
        }),
      ];
    })
    .slice(0, 5);
}

function extractImageCandidates({
  fallbackSearchPayload,
  imagesPayload,
}: {
  fallbackSearchPayload: unknown;
  imagesPayload: unknown;
}): ImageCandidate[] {
  const imagePayload = serperImagesResponseSchema.parse(imagesPayload);
  const searchPayload = serperSearchResponseSchema.parse(fallbackSearchPayload);
  const searchResults = [
    ...(searchPayload.news ?? []),
    ...(searchPayload.organic ?? []),
  ];
  const imageResults = imagePayload.images ?? [];

  return [
    ...imageResults.flatMap((result, index) => {
      const url = normalizeHttpUrl(result.imageUrl);

      if (!url) {
        return [];
      }

      return [
        {
          index,
          sourceUrl: normalizeHttpUrl(result.link) ?? undefined,
          title: result.title?.trim() || result.source?.trim() || undefined,
          url,
        },
      ];
    }),
    ...searchResults.flatMap((result, index) => {
      const url = normalizeHttpUrl(result.imageUrl);

      if (!url) {
        return [];
      }

      return [
        {
          index: imageResults.length + index,
          sourceUrl: normalizeHttpUrl(result.link) ?? undefined,
          title: result.title?.trim() || undefined,
          url,
        },
      ];
    }),
  ];
}

function normalizeHttpUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function readDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function readAiGatewayApiKey() {
  return (
    readEnvValue(process.env.AI_GATEWAY_API_KEY) ??
    readEnvValue(process.env.VERCEL_AI_GATEWAY_API_KEY)
  );
}

function readAiGatewayBaseUrl() {
  return (
    readEnvValue(process.env.AI_GATEWAY_BASE_URL) ?? defaultAiGatewayBaseUrl
  ).replace(/\/$/, "");
}

function readEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}

function stripJsonFences(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

function extractJsonObject(value: string) {
  const strippedValue = stripJsonFences(value);
  const objectStart = strippedValue.indexOf("{");
  const objectEnd = strippedValue.lastIndexOf("}");

  if (objectStart === -1 || objectEnd === -1 || objectEnd < objectStart) {
    return strippedValue;
  }

  return strippedValue.slice(objectStart, objectEnd + 1);
}

function truncateAtWordBoundary(value: string, maxCharacters: number) {
  if (value.length <= maxCharacters) {
    return value;
  }

  const sliceLength = Math.max(1, maxCharacters - 3);
  const truncated = value.slice(0, sliceLength);
  const lastSpace = truncated.lastIndexOf(" ");

  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : sliceLength)}...`;
}
