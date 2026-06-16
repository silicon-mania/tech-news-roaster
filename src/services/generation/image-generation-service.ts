import { Buffer } from "node:buffer";
import {
  type FailedImageSet,
  type ImageGenerationInput,
  type ImageModelProvenance,
  type ImageOriginalCandidate,
  type ImageSet,
  parseFailedImageSet,
  parseImageGenerationInput,
  parseImageSet,
  type SavedGenerationRun,
  type SelectedImageOriginal,
  selectedImageOriginalFromCandidate,
} from "@/services/generation";
import { fetchWithTimeout, readTimeoutMs } from "@/utils/fetch-with-timeout";
import { readConfiguredAiGatewayImageModel, readEnvValue } from "./ai-gateway-models";
import { describeErrorDetail, summarizeErrorMessage } from "./error-detail";

const generatedVariationTarget = 4;
// The AI Gateway image request is wrapped in this timeout so a hung gateway (no
// response headers — undici's UND_ERR_HEADERS_TIMEOUT, ~300s) fails fast with a
// clear message instead of silently stalling until the client stream drops and
// the operator only sees a bare "Failed to fetch". Tunable via env.
const defaultImageGenerationTimeoutMs = 120_000;

type ImageModelEnvironment = Readonly<Record<string, string | undefined>>;

export type ParentGenerationRunForImages = Pick<
  SavedGenerationRun,
  "id" | "imageOriginalCandidates"
>;

export type PreparedSelectedImageOriginal = {
  dataUrl: string;
  mediaType: string;
  selectedImageOriginal: SelectedImageOriginal;
};

export type SelectedImageOriginalPreparer = (input: {
  candidate: ImageOriginalCandidate;
  now: () => Date;
}) => Promise<PreparedSelectedImageOriginal>;

type GeneratedImageVariation = {
  altText?: string;
  url: string;
};

const gatewayImageCompletionSchema = {
  parse(payload: unknown): GeneratedImageVariation {
    const record = toRecord(payload);
    const choices = toArray(record.choices);
    const firstChoice = toRecord(choices[0]);
    const message = toRecord(firstChoice.message);
    const images = toArray(message.images);
    const firstImage = toRecord(images[0]);
    const imageUrl = toRecord(firstImage.image_url);
    const url = readString(imageUrl.url);

    if (!url) {
      throw new Error("Image provider returned a variation without a URL.");
    }

    return {
      altText: readString(message.content),
      url,
    };
  },
};

export type ImageVariationProvider = {
  imageModelProvenance: ImageModelProvenance;
  generateVariations(input: {
    original: PreparedSelectedImageOriginal;
    userImagePrompt: string;
    variationCount: typeof generatedVariationTarget;
  }): Promise<GeneratedImageVariation[]>;
};

export type ImageGenerationServiceResult = {
  failedImageSet?: FailedImageSet;
  imageModelProvenance: ImageModelProvenance;
  imageSet?: ImageSet;
  selectedImageOriginal?: SelectedImageOriginal;
};

export type ImageGenerationServiceStreamEvent =
  | {
      type: "image-set-completed";
      imageModelProvenance: ImageModelProvenance;
      imageSet: ImageSet;
      selectedImageOriginal: SelectedImageOriginal;
    }
  | {
      type: "image-set-failed";
      failedImageSet: FailedImageSet;
      imageModelProvenance: ImageModelProvenance;
      selectedImageOriginal?: SelectedImageOriginal;
    };

export async function generateImageSetForRun(
  {
    input,
    parentRun,
  }: {
    input: ImageGenerationInput;
    parentRun: ParentGenerationRunForImages;
  },
  options: {
    now?: () => Date;
    prepareSelectedImageOriginal?: SelectedImageOriginalPreparer;
    provider?: ImageVariationProvider;
  } = {},
): Promise<ImageGenerationServiceResult> {
  const provider = options.provider ?? createDefaultImageVariationProvider();
  const result: ImageGenerationServiceResult = {
    imageModelProvenance: provider.imageModelProvenance,
  };

  for await (const event of streamImageSetForRun(
    {
      input,
      parentRun,
    },
    {
      ...options,
      provider,
    },
  )) {
    if (event.type === "image-set-completed") {
      result.imageSet = event.imageSet;
      result.selectedImageOriginal = event.selectedImageOriginal;
    } else {
      result.failedImageSet = event.failedImageSet;

      if (event.selectedImageOriginal) {
        result.selectedImageOriginal = event.selectedImageOriginal;
      }
    }
  }

  return result;
}

export async function* streamImageSetForRun(
  {
    input,
    parentRun,
  }: {
    input: ImageGenerationInput;
    parentRun: ParentGenerationRunForImages;
  },
  options: {
    now?: () => Date;
    prepareSelectedImageOriginal?: SelectedImageOriginalPreparer;
    provider?: ImageVariationProvider;
  } = {},
): AsyncGenerator<ImageGenerationServiceStreamEvent> {
  const parsedInput = parseImageGenerationInput(input);

  if (parentRun.id !== parsedInput.parentRunId) {
    throw new Error("Image generation input does not match the parent run.");
  }

  const candidate = resolveSelectedImageOriginalCandidate({
    imageOriginalCandidates: parentRun.imageOriginalCandidates,
    selectedImageId: parsedInput.selectedImageId,
  });
  const now = options.now ?? (() => new Date());
  const prepare = options.prepareSelectedImageOriginal ?? prepareSelectedImageOriginal;
  const provider = options.provider ?? createDefaultImageVariationProvider();

  let preparedOriginal: PreparedSelectedImageOriginal | undefined;
  // Which step we are in, so a failure names where it broke (fetching the
  // selected original vs. calling the image model).
  let step = "prepare-selected-original";

  try {
    preparedOriginal = await prepare({
      candidate,
      now,
    });

    step = "generate-variations";
    const variations = await provider.generateVariations({
      original: preparedOriginal,
      userImagePrompt: parsedInput.userImagePrompt,
      variationCount: generatedVariationTarget,
    });

    yield {
      type: "image-set-completed",
      imageModelProvenance: provider.imageModelProvenance,
      imageSet: buildImageSet({
        candidate,
        imageModelProvenance: provider.imageModelProvenance,
        now,
        selectedImageOriginal: preparedOriginal.selectedImageOriginal,
        variations,
      }),
      selectedImageOriginal: preparedOriginal.selectedImageOriginal,
    };
  } catch (error) {
    const message = normalizeFailureMessage(error);
    const debugLog = [
      ...describeErrorDetail(error),
      `Step: ${step}`,
      `Selected image: ${candidate.id} (${candidate.origin})`,
      `Original URL: ${candidate.url}`,
      `Image model: ${provider.imageModelProvenance.provider}/${provider.imageModelProvenance.model}`,
      `User Image Prompt length: ${parsedInput.userImagePrompt.length}`,
    ];

    console.error("[image-generation] image set failed", { debugLog, message, step });

    yield {
      type: "image-set-failed",
      failedImageSet: buildFailedImageSet({
        candidate,
        debugLog,
        message,
        now,
        selectedImageOriginal: preparedOriginal?.selectedImageOriginal,
      }),
      imageModelProvenance: provider.imageModelProvenance,
      selectedImageOriginal: preparedOriginal?.selectedImageOriginal,
    };
  }
}

export async function prepareSelectedImageOriginal({
  candidate,
  now,
}: {
  candidate: ImageOriginalCandidate;
  now: () => Date;
}): Promise<PreparedSelectedImageOriginal> {
  const response = await fetch(candidate.url);

  if (!response.ok) {
    throw new Error(`Selected image original could not be fetched (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.byteLength === 0) {
    throw new Error("Selected image original was empty.");
  }

  const mediaType = response.headers.get("content-type") ?? "application/octet-stream";
  const selectedImageOriginal = selectedImageOriginalFromCandidate(candidate, now().toISOString());

  return {
    dataUrl: `data:${mediaType};base64,${bytes.toString("base64")}`,
    mediaType,
    selectedImageOriginal,
  };
}

function createDefaultImageVariationProvider(
  env: ImageModelEnvironment = process.env,
): ImageVariationProvider {
  const model = readConfiguredAiGatewayImageModel(env);
  const apiKey = readAiGatewayApiKey(env);

  if (!apiKey && env.NODE_ENV !== "production") {
    return createLocalImageVariationProvider(model);
  }

  return createAiGatewayImageVariationProvider({
    apiKey,
    baseUrl: readEnvValue(env.AI_GATEWAY_BASE_URL),
    model,
    timeoutMs: readImageGenerationTimeoutMs(env),
  });
}

function createLocalImageVariationProvider(
  model = readConfiguredAiGatewayImageModel(process.env),
): ImageVariationProvider {
  return {
    imageModelProvenance: {
      model,
      provider: "local",
    },
    async generateVariations({ original, variationCount }) {
      return Array.from({ length: variationCount }, (_, index) => ({
        altText: `Generated visual variation ${index + 1}.`,
        url: `https://picsum.photos/seed/${encodeURIComponent(
          `${original.selectedImageOriginal.candidateId}-${index + 1}`,
        )}/1024/768`,
      }));
    },
  };
}

function createAiGatewayImageVariationProvider({
  apiKey,
  baseUrl,
  model,
  timeoutMs,
}: {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
  timeoutMs: number;
}): ImageVariationProvider {
  return {
    imageModelProvenance: {
      model,
      provider: "ai-gateway",
    },
    async generateVariations({ original, userImagePrompt, variationCount }) {
      if (!apiKey) {
        throw new Error("AI Gateway credentials are not configured.");
      }

      const gatewayBaseUrl = (baseUrl ?? "https://ai-gateway.vercel.sh/v1").replace(/\/$/, "");
      const variations = await Promise.all(
        Array.from({ length: variationCount }, async (_, index) => {
          const response = await fetchWithTimeout(`${gatewayBaseUrl}/chat/completions`, {
            body: JSON.stringify({
              messages: [
                {
                  content: [
                    {
                      text: buildImageVariationPrompt({
                        index,
                        original,
                        userImagePrompt,
                        variationCount,
                      }),
                      type: "text",
                    },
                    {
                      image_url: {
                        url: original.dataUrl,
                      },
                      type: "image_url",
                    },
                  ],
                  role: "user",
                },
              ],
              model,
            }),
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            method: "POST",
            operationLabel: "Image generation",
            timeoutMs,
            upstreamLabel: "the AI Gateway",
          });

          if (!response.ok) {
            throw new Error(
              `Image generation failed (${response.status}): ${await readGatewayError(response)}`,
            );
          }

          const variation = gatewayImageCompletionSchema.parse(await response.json());

          return {
            altText: variation.altText ?? `Generated visual variation ${index + 1}.`,
            url: variation.url,
          };
        }),
      );

      return variations;
    },
  };
}

function buildImageVariationPrompt({
  index,
  original,
  userImagePrompt,
  variationCount,
}: {
  index: number;
  original: PreparedSelectedImageOriginal;
  userImagePrompt: string;
  variationCount: number;
}) {
  return [
    `Create variation ${index + 1} of ${variationCount} from the attached image.`,
    "Use the attached image as the visual reference and preserve its core subject.",
    "Follow this user image prompt:",
    userImagePrompt,
    original.selectedImageOriginal.title
      ? `Original image title: ${original.selectedImageOriginal.title}`
      : null,
    original.selectedImageOriginal.altText
      ? `Original image alt text: ${original.selectedImageOriginal.altText}`
      : null,
    "Return one generated image.",
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveSelectedImageOriginalCandidate({
  imageOriginalCandidates,
  selectedImageId,
}: {
  imageOriginalCandidates: ParentGenerationRunForImages["imageOriginalCandidates"];
  selectedImageId: ImageGenerationInput["selectedImageId"];
}) {
  const candidate = (imageOriginalCandidates ?? []).find(
    (imageOriginalCandidate) => imageOriginalCandidate.id === selectedImageId,
  );

  if (!candidate) {
    throw new Error(`Selected image ID ${selectedImageId} is not available on the parent run.`);
  }

  return candidate;
}

function buildImageSet({
  candidate,
  imageModelProvenance,
  now,
  selectedImageOriginal,
  variations,
}: {
  candidate: ImageOriginalCandidate;
  imageModelProvenance: ImageModelProvenance;
  now: () => Date;
  selectedImageOriginal: SelectedImageOriginal;
  variations: GeneratedImageVariation[];
}) {
  if (variations.length !== generatedVariationTarget) {
    throw new Error("Image provider must return exactly four variations.");
  }

  const imageSetId = `image-set-${candidate.id}`;

  return parseImageSet({
    completedAt: now().toISOString(),
    id: imageSetId,
    imageModelProvenance,
    options: [
      {
        altText: selectedImageOriginal.altText,
        id: `${imageSetId}-original`,
        kind: "original",
        label: "Original",
        url: selectedImageOriginal.url,
      },
      ...variations.map((variation, index) => ({
        altText: variation.altText,
        id: `${imageSetId}-variation-${index + 1}`,
        kind: "variation" as const,
        label: `Variation ${index + 1}`,
        url: variation.url,
      })),
    ],
    selectedImageOriginal,
  });
}

function buildFailedImageSet({
  candidate,
  debugLog,
  message,
  now,
  selectedImageOriginal,
}: {
  candidate: ImageOriginalCandidate;
  debugLog?: string[];
  message: string;
  now: () => Date;
  selectedImageOriginal?: SelectedImageOriginal;
}) {
  return parseFailedImageSet({
    debugLog,
    failedAt: now().toISOString(),
    id: `failed-image-set-${candidate.id}`,
    message,
    selectedImageId: candidate.id,
    selectedImageOriginal,
  });
}

function normalizeFailureMessage(error: unknown) {
  return summarizeErrorMessage(error, "Image generation failed for the selected original.");
}

async function readGatewayError(response: Response) {
  try {
    return (await response.text()).slice(0, 500) || "No error body returned.";
  } catch {
    return "No error body returned.";
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readAiGatewayApiKey(env: ImageModelEnvironment) {
  return readEnvValue(env.AI_GATEWAY_API_KEY) ?? readEnvValue(env.VERCEL_AI_GATEWAY_API_KEY);
}

function readImageGenerationTimeoutMs(env: ImageModelEnvironment): number {
  return readTimeoutMs(env.AI_GATEWAY_IMAGE_TIMEOUT_MS, defaultImageGenerationTimeoutMs);
}
