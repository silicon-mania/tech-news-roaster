import type { JokeContextSnapshot } from "@/services/generation";

export function buildImageSet() {
  return {
    id: "image-set-1",
    completedAt: "2026-06-05T10:21:00.000Z",
    imageModelProvenance: {
      model: "image-model-v1",
      provider: "ai-gateway",
    },
    selectedImageOriginal: {
      id: "selected-original-1",
      candidateId: "news-linked-image-candidate-news-linked-image-1",
      origin: "news-linked-image",
      url: "https://example.com/news-linked-image.jpg",
      altText: "Product launch screenshot.",
      preparedAt: "2026-06-05T10:20:00.000Z",
      sourceUrl: "https://example.com/report",
      title: "Launch visual",
    },
    options: [
      {
        id: "image-option-original-1",
        kind: "original",
        label: "Original",
        url: "https://example.com/news-linked-image.jpg",
        altText: "Product launch screenshot.",
      },
      {
        id: "image-option-variation-1",
        kind: "variation",
        label: "Variation 1",
        url: "https://example.com/generated-1.jpg",
        altText: "Generated visual variation 1.",
      },
      {
        id: "image-option-variation-2",
        kind: "variation",
        label: "Variation 2",
        url: "https://example.com/generated-2.jpg",
        altText: "Generated visual variation 2.",
      },
      {
        id: "image-option-variation-3",
        kind: "variation",
        label: "Variation 3",
        url: "https://example.com/generated-3.jpg",
        altText: "Generated visual variation 3.",
      },
      {
        id: "image-option-variation-4",
        kind: "variation",
        label: "Variation 4",
        url: "https://example.com/generated-4.jpg",
        altText: "Generated visual variation 4.",
      },
    ],
  };
}

// A completed Uploaded Image Set (ADR-0025): one operator-supplied original
// (origin `user-uploaded`) plus four variations, with globally-unique option ids
// distinct from the source-derived `buildImageSet` so cross-set resolution is
// exercised without id collisions.
export function buildUploadedImageSet() {
  return {
    id: "uploaded-image-set-1",
    completedAt: "2026-06-05T11:21:00.000Z",
    imageModelProvenance: {
      model: "image-model-v1",
      provider: "ai-gateway",
    },
    selectedImageOriginal: {
      id: "selected-original-uploaded-1",
      candidateId: "uploaded-original-1",
      origin: "user-uploaded",
      url: "https://example.com/uploaded-original.jpg",
      altText: "Operator-uploaded image.",
      preparedAt: "2026-06-05T11:20:00.000Z",
    },
    options: [
      {
        id: "uploaded-option-original",
        kind: "original",
        label: "Original",
        url: "https://example.com/uploaded-original.jpg",
        altText: "Operator-uploaded image.",
      },
      {
        id: "uploaded-option-variation-1",
        kind: "variation",
        label: "Variation 1",
        url: "https://example.com/uploaded-generated-1.jpg",
        altText: "Uploaded visual variation 1.",
      },
      {
        id: "uploaded-option-variation-2",
        kind: "variation",
        label: "Variation 2",
        url: "https://example.com/uploaded-generated-2.jpg",
        altText: "Uploaded visual variation 2.",
      },
      {
        id: "uploaded-option-variation-3",
        kind: "variation",
        label: "Variation 3",
        url: "https://example.com/uploaded-generated-3.jpg",
        altText: "Uploaded visual variation 3.",
      },
      {
        id: "uploaded-option-variation-4",
        kind: "variation",
        label: "Variation 4",
        url: "https://example.com/uploaded-generated-4.jpg",
        altText: "Uploaded visual variation 4.",
      },
    ],
  };
}

export function buildStructuredJokeContext() {
  return {
    sourceTweetClaim: "The source tweet claims the launch removes the final workflow bottleneck.",
    sourceTweetMediaExtraction: {
      summary: "A product UI screenshot emphasizes a new autopilot control surface.",
      visibleText: ["Autopilot", "Ship faster"],
      notableDetails: [
        "A pricing badge dominates the layout.",
        "The screenshot shows usage quotas.",
      ],
      mediaKinds: ["image"],
    },
    authorContext: {
      displayName: "Silicon Mania",
      handle: "siliconmania",
      relationshipToTopic: "Operator watching platform incentives in public.",
      role: "Tech publication",
      authoritySignals: ["Frequent AI product analysis", "Known for startup commentary"],
    },
    replySignals: {
      summary: "Replies focus on pricing pressure and whether the promise is actually new.",
      representativeSnippets: [
        {
          authorHandle: "shipfaster",
          replyId: "reply-1",
          signal: "skepticism",
          snippet: "So we automated the screenshot, not the work.",
        },
      ],
    },
    supportingFacts: [
      "The launch centers on AI workflow automation.",
      "Pricing and access tiers are central to the announcement.",
    ],
    unknowns: ["Adoption numbers are not public yet."],
    jokeableTensions: [
      "The product promises labor reduction while adding premium coordination overhead.",
    ],
    forbiddenAssumptions: ["Do not claim the launch replaces entire teams."],
    jokeContextQuality: {
      status: "strong",
      summary: "The tweet, media, and replies provide enough context for grounded satire.",
    },
  };
}

export function buildJokeContextSnapshot() {
  return {
    capturedAt: "2026-06-06T10:10:00.000Z",
    sourceTweetId: "2468",
    structuredContext: buildStructuredJokeContext(),
  };
}

export function buildGenerationResultStates({
  jokeContextSnapshot,
}: {
  jokeContextSnapshot: JokeContextSnapshot;
}) {
  return {
    contextGathering: {
      status: "completed",
      startedAt: "2026-06-06T10:08:00.000Z",
      completedAt: "2026-06-06T10:10:00.000Z",
      jokeContextSnapshot,
    },
    textGeneration: {
      status: "completed",
      startedAt: "2026-06-06T10:10:01.000Z",
      completedAt: "2026-06-06T10:10:30.000Z",
      draftCount: 3,
    },
    newsLinkedImageDiscovery: {
      status: "failed",
      startedAt: "2026-06-06T10:10:02.000Z",
      failedAt: "2026-06-06T10:10:25.000Z",
      message: "No qualifying news-linked images were found.",
    },
    imageGeneration: {
      status: "not-started",
    },
  };
}
