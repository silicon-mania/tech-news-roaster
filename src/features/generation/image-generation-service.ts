import { Buffer } from "node:buffer";
import {
  readConfiguredAiGatewayImageModel,
  readEnvValue,
} from "./ai-gateway-models";
import {
  type FailedImageSet,
  type ImageGenerationInput,
  type ImageModelProvenance,
  type ImageSet,
  type NewsLinkedImage,
  parseFailedImageSet,
  parseImageGenerationInput,
  parseImageSet,
  parseSelectedImageOriginal,
  type SavedGenerationRun,
  type SelectedImageOriginal,
} from "./generation-events";

const generatedVariationTarget = 2;

type ImageModelEnvironment = Readonly<Record<string, string | undefined>>;

export type ParentGenerationRunForImages = Pick<
  SavedGenerationRun,
  "id" | "newsLinkedImages"
>;

export type PreparedSelectedImageOriginal = {
  dataUrl: string;
  mediaType: string;
  selectedImageOriginal: SelectedImageOriginal;
};

export type SelectedImageOriginalPreparer = (input: {
  newsLinkedImage: NewsLinkedImage;
  now: () => Date;
}) => Promise<PreparedSelectedImageOriginal>;

type GeneratedImageVariation = {
  altText?: string;
  url: string;
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
  failedImageSets: FailedImageSet[];
  imageModelProvenance: ImageModelProvenance;
  imageSets: ImageSet[];
  selectedImageOriginals: SelectedImageOriginal[];
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

export async function generateImageSetsForRun(
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
  const imageSets: ImageSet[] = [];
  const failedImageSets: FailedImageSet[] = [];
  const selectedImageOriginals: SelectedImageOriginal[] = [];

  for await (const event of streamImageSetsForRun(
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
      imageSets.push(event.imageSet);
      selectedImageOriginals.push(event.selectedImageOriginal);
    } else {
      failedImageSets.push(event.failedImageSet);

      if (event.selectedImageOriginal) {
        selectedImageOriginals.push(event.selectedImageOriginal);
      }
    }
  }

  return {
    failedImageSets,
    imageModelProvenance: provider.imageModelProvenance,
    imageSets,
    selectedImageOriginals,
  };
}

export async function* streamImageSetsForRun(
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

  const selectedImages = resolveSelectedNewsLinkedImages({
    newsLinkedImages: parentRun.newsLinkedImages,
    selectedImageIds: parsedInput.selectedImageIds,
  });
  const now = options.now ?? (() => new Date());
  const prepare =
    options.prepareSelectedImageOriginal ?? prepareSelectedImageOriginal;
  const provider = options.provider ?? createDefaultImageVariationProvider();

  for (const newsLinkedImage of selectedImages) {
    let preparedOriginal: PreparedSelectedImageOriginal | undefined;

    try {
      preparedOriginal = await prepare({
        newsLinkedImage,
        now,
      });

      const variations = await provider.generateVariations({
        original: preparedOriginal,
        userImagePrompt: parsedInput.userImagePrompt,
        variationCount: generatedVariationTarget,
      });

      yield {
        type: "image-set-completed",
        imageModelProvenance: provider.imageModelProvenance,
        imageSet: buildImageSet({
          imageModelProvenance: provider.imageModelProvenance,
          newsLinkedImage,
          now,
          selectedImageOriginal: preparedOriginal.selectedImageOriginal,
          variations,
        }),
        selectedImageOriginal: preparedOriginal.selectedImageOriginal,
      };
    } catch (error) {
      yield {
        type: "image-set-failed",
        failedImageSet: buildFailedImageSet({
          message: normalizeFailureMessage(error),
          newsLinkedImage,
          now,
          selectedImageOriginal: preparedOriginal?.selectedImageOriginal,
        }),
        imageModelProvenance: provider.imageModelProvenance,
        selectedImageOriginal: preparedOriginal?.selectedImageOriginal,
      };
    }
  }
}

export async function prepareSelectedImageOriginal({
  newsLinkedImage,
  now,
}: {
  newsLinkedImage: NewsLinkedImage;
  now: () => Date;
}): Promise<PreparedSelectedImageOriginal> {
  const response = await fetch(newsLinkedImage.url);

  if (!response.ok) {
    throw new Error(
      `Selected image original could not be fetched (${response.status}).`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.byteLength === 0) {
    throw new Error("Selected image original was empty.");
  }

  const mediaType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const selectedImageOriginal = parseSelectedImageOriginal({
    altText: newsLinkedImage.altText,
    id: `selected-original-${newsLinkedImage.id}`,
    newsLinkedImageId: newsLinkedImage.id,
    preparedAt: now().toISOString(),
    sourceUrl: newsLinkedImage.sourceUrl,
    title: newsLinkedImage.title,
    url: newsLinkedImage.url,
  });

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
          `${original.selectedImageOriginal.newsLinkedImageId}-${index + 1}`,
        )}/1024/768`,
      }));
    },
  };
}

function createAiGatewayImageVariationProvider({
  apiKey,
  baseUrl,
  model,
}: {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
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

      const response = await fetch(
        `${(baseUrl ?? "https://ai-gateway.vercel.sh/v1").replace(
          /\/$/,
          "",
        )}/images/edits`,
        {
          body: JSON.stringify({
            image: original.dataUrl,
            model,
            n: variationCount,
            prompt: userImagePrompt,
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(
          `Image generation failed (${response.status}): ${await readGatewayError(
            response,
          )}`,
        );
      }

      const payload = (await response.json()) as {
        data?: Array<{
          b64_json?: string;
          revised_prompt?: string;
          url?: string;
        }>;
      };
      const variations =
        payload.data?.map((variation, index) => ({
          altText:
            variation.revised_prompt ??
            `Generated visual variation ${index + 1}.`,
          url:
            variation.url ??
            (variation.b64_json
              ? `data:image/png;base64,${variation.b64_json}`
              : undefined),
        })) ?? [];

      if (variations.some((variation) => !variation.url)) {
        throw new Error("Image provider returned a variation without a URL.");
      }

      return variations as GeneratedImageVariation[];
    },
  };
}

function resolveSelectedNewsLinkedImages({
  newsLinkedImages,
  selectedImageIds,
}: {
  newsLinkedImages: ParentGenerationRunForImages["newsLinkedImages"];
  selectedImageIds: ImageGenerationInput["selectedImageIds"];
}) {
  const newsLinkedImageById = new Map(
    (newsLinkedImages ?? []).map((image) => [image.id, image]),
  );

  return selectedImageIds.map((selectedImageId) => {
    const newsLinkedImage = newsLinkedImageById.get(selectedImageId);

    if (!newsLinkedImage) {
      throw new Error(
        `Selected image ID ${selectedImageId} is not available on the parent run.`,
      );
    }

    return newsLinkedImage;
  });
}

function buildImageSet({
  imageModelProvenance,
  newsLinkedImage,
  now,
  selectedImageOriginal,
  variations,
}: {
  imageModelProvenance: ImageModelProvenance;
  newsLinkedImage: NewsLinkedImage;
  now: () => Date;
  selectedImageOriginal: SelectedImageOriginal;
  variations: GeneratedImageVariation[];
}) {
  if (variations.length !== generatedVariationTarget) {
    throw new Error("Image provider must return exactly two variations.");
  }

  const imageSetId = `image-set-${newsLinkedImage.id}`;

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
      {
        altText: variations[0].altText,
        id: `${imageSetId}-variation-1`,
        kind: "variation",
        label: "Variation 1",
        url: variations[0].url,
      },
      {
        altText: variations[1].altText,
        id: `${imageSetId}-variation-2`,
        kind: "variation",
        label: "Variation 2",
        url: variations[1].url,
      },
    ],
    selectedImageOriginal,
  });
}

function buildFailedImageSet({
  message,
  newsLinkedImage,
  now,
  selectedImageOriginal,
}: {
  message: string;
  newsLinkedImage: NewsLinkedImage;
  now: () => Date;
  selectedImageOriginal?: SelectedImageOriginal;
}) {
  return parseFailedImageSet({
    failedAt: now().toISOString(),
    id: `failed-image-set-${newsLinkedImage.id}`,
    message,
    selectedImageId: newsLinkedImage.id,
    selectedImageOriginal,
  });
}

function normalizeFailureMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Image generation failed for the selected original.";
}

async function readGatewayError(response: Response) {
  try {
    return (await response.text()).slice(0, 500) || "No error body returned.";
  } catch {
    return "No error body returned.";
  }
}

function readAiGatewayApiKey(env: ImageModelEnvironment) {
  return (
    readEnvValue(env.AI_GATEWAY_API_KEY) ??
    readEnvValue(env.VERCEL_AI_GATEWAY_API_KEY)
  );
}
