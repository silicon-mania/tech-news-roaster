import { describe, expect, test } from "vitest";
import type { JokeContextSnapshot, VisualJokeSet } from "@/services/generation";
import {
  buildEnrichmentCompletedEvent,
  buildGenerationFailureEvent,
  buildGenerationRunStateEvent,
  buildStubbedGenerationEvents,
  parseCompletedGenerationRunPayload,
  parseGenerationResultStates,
  parseGenerationStreamEvent,
  parseImageGenerationInput,
  parseImageGenerationStreamEvent,
  parseJokeContextSnapshot,
  parseSavedGenerationRun,
  parseSelectedVisualJoke,
  parseStructuredJokeContext,
  parseVisualJoke,
  parseVisualJokeDirectionText,
  parseVisualJokeMetadata,
  parseVisualJokeSet,
} from "@/services/generation";
import { buildReplySignals } from "@/services/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";

describe("generation event contracts", () => {
  test("builds deterministic progress events followed by a completed run", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const events = buildStubbedGenerationEvents({
      replySignals: buildReplySignals(tweetContext),
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "Keep it skeptical.",
    });

    expect(events.map((event) => event.type)).toEqual([
      "progress",
      "progress",
      "progress",
      "completed",
    ]);
    expect(events[0]).toMatchObject({
      type: "progress",
      label: "Drafts for 2468",
      draftCount: 1,
      draftTarget: 3,
      sourceTweet: expect.objectContaining({
        text: expect.stringContaining("agent workspace"),
      }),
    });
    expect(events[3]).toMatchObject({
      type: "completed",
      run: {
        label: "Drafts for 2468",
        sourceTweet: expect.objectContaining({
          text: expect.stringContaining("agent workspace"),
        }),
        drafts: expect.arrayContaining([
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "openai",
            visibleRationale: expect.stringContaining("platform leverage"),
          }),
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "anthropic",
          }),
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "google",
          }),
        ]),
      },
    });
  });

  test("rejects completed runs without exactly three drafts", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    expect(() =>
      parseCompletedGenerationRunPayload({
        label: "Incomplete run",
        sourceTweet: tweetContext.sourceTweet,
        drafts: [
          {
            angle: "incomplete",
            id: "one",
            text: "Quote-tweet draft: One draft is not a completed comparison.",
            modelProvenance: "local draft model",
            provider: "openai",
            visibleRationale: "This should still fail because it is alone.",
          },
        ],
      }),
    ).toThrow();
  });

  test("builds a short failed retrieval event", () => {
    expect(
      parseGenerationStreamEvent(
        buildGenerationFailureEvent("Source tweet could not be retrieved."),
      ),
    ).toEqual({
      type: "failed",
      message: "Source tweet could not be retrieved.",
    });
  });

  test("rejects unknown stream event shapes", () => {
    expect(() =>
      parseGenerationStreamEvent({
        type: "progress",
        label: "Drafts for 123",
        draftCount: 1,
        draftTarget: 3,
      }),
    ).toThrow();
  });

  test("validates enrichment-completed events without hidden enrichment text", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const event = buildEnrichmentCompletedEvent({
      sourceTweet: tweetContext.sourceTweet,
      newsLinkedImages: [
        {
          id: "news-linked-image-1",
          url: "https://example.com/news-linked-image.jpg",
          altText: "Product launch screenshot.",
          sourceUrl: "https://example.com/report",
          title: "Launch visual",
        },
      ],
    });

    expect(parseGenerationStreamEvent(event)).toEqual({
      type: "enrichment-completed",
      sourceTweet: tweetContext.sourceTweet,
      newsLinkedImages: [
        {
          id: "news-linked-image-1",
          url: "https://example.com/news-linked-image.jpg",
          altText: "Product launch screenshot.",
          sourceUrl: "https://example.com/report",
          title: "Launch visual",
        },
      ],
    });
    expect(JSON.stringify(event)).not.toContain("summary");
    expect(JSON.stringify(event)).not.toContain("retrievedAt");
  });

  test("validates image-generation input and rejects raw URL submission", () => {
    expect(
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
        userImagePrompt: "Make the product visual punchier.",
      }),
    ).toEqual({
      parentRunId: "run-1",
      selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
      userImagePrompt: "Make the product visual punchier.",
    });
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["https://example.com/image.jpg"],
        userImagePrompt: "Use this URL.",
      }),
    ).toThrow();
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["news-linked-image-1", "news-linked-image-2", "news-linked-image-3"],
        userImagePrompt: "Too many images.",
      }),
    ).toThrow();
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["news-linked-image-1"],
        userImagePrompt: " ",
      }),
    ).toThrow();
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["news-linked-image-1"],
        imageUrls: ["https://example.com/image.jpg"],
        userImagePrompt: "Reject unknown raw URL fields.",
      }),
    ).toThrow();
  });

  test("validates image stream events, image sets, failed sets, and terminal state", () => {
    const imageSet = buildImageSet();
    const failedImageSet = {
      id: "failed-image-set-1",
      failedAt: "2026-06-05T10:22:00.000Z",
      message: "The image model rejected the selected original.",
      selectedImageId: "news-linked-image-2",
    };

    expect(
      parseImageGenerationStreamEvent({
        type: "image-set-completed",
        imageSet,
      }),
    ).toMatchObject({
      type: "image-set-completed",
      imageSet: {
        imageModelProvenance: {
          model: "image-model-v1",
          provider: "ai-gateway",
        },
      },
    });
    expect(
      parseImageGenerationStreamEvent({
        type: "image-set-failed",
        failedImageSet,
      }),
    ).toEqual({
      type: "image-set-failed",
      failedImageSet,
    });
    expect(
      parseImageGenerationStreamEvent({
        type: "image-generation-completed",
        state: {
          status: "partially-failed",
          completedAt: "2026-06-05T10:25:00.000Z",
          imageSets: [imageSet],
          failedImageSets: [failedImageSet],
        },
      }),
    ).toMatchObject({
      type: "image-generation-completed",
      state: {
        status: "partially-failed",
      },
    });
    expect(() =>
      parseImageGenerationStreamEvent({
        type: "image-generation-completed",
        state: {
          status: "completed",
          completedAt: "2026-06-05T10:25:00.000Z",
          imageSets: [imageSet],
          failedImageSets: [failedImageSet],
        },
      }),
    ).toThrow();
  });

  test("validates v2 saved runs and rejects invalid one-time image states", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const imageSet = buildImageSet();

    expect(
      parseSavedGenerationRun({
        id: "run-1",
        label: "Drafts for 2468",
        sourceTweetUrl: "https://x.com/siliconmania/status/2468",
        usersDirection: "Keep it skeptical.",
        status: "completed",
        phase: "image-generation-complete",
        draftCount: 3,
        draftTarget: 3,
        sourceTweet: tweetContext.sourceTweet,
        savedAt: "2026-06-05T10:30:00.000Z",
        drafts: buildStubbedGenerationEvents({
          replySignals: buildReplySignals(tweetContext),
          sourceTweet: tweetContext.sourceTweet,
          sourceTweetUrl: "https://x.com/siliconmania/status/2468",
          usersDirection: "Keep it skeptical.",
        }).flatMap((event) => (event.type === "progress" ? [event.draft] : [])),
        imageGenerationState: {
          status: "completed",
          selectedImageIds: ["news-linked-image-1"],
          userImagePrompt: "Make it brighter.",
          startedAt: "2026-06-05T10:20:00.000Z",
          completedAt: "2026-06-05T10:25:00.000Z",
        },
        imageModelProvenance: {
          model: "image-model-v1",
          provider: "ai-gateway",
        },
        imageSets: [imageSet],
        selectedImageOriginals: [imageSet.selectedImageOriginal],
      }),
    ).toMatchObject({
      id: "run-1",
      imageGenerationState: {
        status: "completed",
      },
    });
    expect(() =>
      parseSavedGenerationRun({
        id: "run-1",
        label: "Drafts for 2468",
        sourceTweetUrl: "https://x.com/siliconmania/status/2468",
        usersDirection: "",
        status: "completed",
        draftCount: 3,
        draftTarget: 3,
        drafts: [],
        imageGenerationState: {
          status: "retryable",
        },
      }),
    ).toThrow();
  });

  test("validates v3 context, visual joke, and independent result-state contracts", () => {
    const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());
    const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());
    const generationResultStates = parseGenerationResultStates(
      buildGenerationResultStates({
        jokeContextSnapshot,
        visualJokeSet,
      }),
    );

    expect(parseStructuredJokeContext(buildStructuredJokeContext())).toMatchObject({
      sourceTweetClaim: "The source tweet claims the launch removes the final workflow bottleneck.",
    });
    expect(parseVisualJokeDirectionText("  Dark, sharp tech satire only.  ")).toBe(
      "Dark, sharp tech satire only.",
    );
    expect(parseVisualJokeMetadata(buildVisualJokeMetadata())).toMatchObject({
      jokePattern: "truthful misdirection",
    });
    expect(parseVisualJoke(visualJokeSet.jokes[0])).toMatchObject({
      recommended: true,
      rank: 1,
    });
    expect(parseSelectedVisualJoke(null, visualJokeSet)).toBeNull();
    expect(generationResultStates.newsLinkedImageDiscovery.status).toBe("failed");
    expect(generationResultStates.textGeneration.status).toBe("completed");
    expect(
      parseGenerationResultStates({
        contextGathering: {
          debugLog: ["Started context gathering.", "No usable claim remained."],
          failedAt: "2026-06-06T10:10:00.000Z",
          message: "Joke context gathering could not form usable context.",
          startedAt: "2026-06-06T10:08:00.000Z",
          status: "failed",
        },
        imageGeneration: {
          status: "not-started",
        },
        newsLinkedImageDiscovery: {
          status: "not-started",
        },
        textGeneration: {
          status: "not-started",
        },
        visualJokeGeneration: {
          status: "not-started",
        },
      }).contextGathering,
    ).toMatchObject({
      debugLog: ["Started context gathering.", "No usable claim remained."],
      status: "failed",
    });
    expect(
      parseGenerationStreamEvent(
        buildGenerationRunStateEvent({
          generationResultStates,
          label: "Drafts for 2468",
          sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468")
            .sourceTweet,
        }),
      ),
    ).toMatchObject({
      type: "run-state",
      generationResultStates: {
        contextGathering: {
          status: "completed",
        },
        visualJokeGeneration: {
          status: "completed",
        },
      },
    });

    expect(
      parseCompletedGenerationRunPayload({
        label: "Drafts for 2468",
        sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468").sourceTweet,
        drafts: buildStubbedGenerationEvents({
          replySignals: buildReplySignals(
            buildFixtureTweetContext("https://x.com/siliconmania/status/2468"),
          ),
          sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468")
            .sourceTweet,
          sourceTweetUrl: "https://x.com/siliconmania/status/2468",
          usersDirection: "Keep it skeptical.",
        }).flatMap((event) => (event.type === "progress" ? [event.draft] : [])),
        jokeContextSnapshot,
        generationResultStates,
        selectedVisualJoke: {
          selectedAt: "2026-06-06T10:14:00.000Z",
          visualJokeId: visualJokeSet.jokes[2].id,
        },
        visualJokeDirection: "Dark, sharp tech satire only.",
        visualJokeSet,
      }),
    ).toMatchObject({
      selectedVisualJoke: {
        visualJokeId: visualJokeSet.jokes[2].id,
      },
      visualJokeSet: {
        jokes: expect.arrayContaining([expect.objectContaining({ recommended: true, rank: 1 })]),
      },
    });
  });

  test("allows completed runs with failed text generation when another creative branch succeeds", () => {
    const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());
    const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());

    expect(
      parseCompletedGenerationRunPayload({
        label: "Drafts for 9999",
        sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/9999").sourceTweet,
        drafts: [],
        jokeContextSnapshot,
        generationResultStates: {
          contextGathering: {
            completedAt: "2026-06-06T10:10:00.000Z",
            jokeContextSnapshot,
            startedAt: "2026-06-06T10:08:00.000Z",
            status: "completed",
          },
          imageGeneration: {
            status: "not-started",
          },
          newsLinkedImageDiscovery: {
            failedAt: "2026-06-06T10:10:25.000Z",
            message: "No qualifying news-linked images were found.",
            startedAt: "2026-06-06T10:10:02.000Z",
            status: "failed",
          },
          textGeneration: {
            failedAt: "2026-06-06T10:10:30.000Z",
            message: "Text generation could not produce a usable draft set.",
            startedAt: "2026-06-06T10:10:01.000Z",
            status: "failed",
          },
          visualJokeGeneration: {
            completedAt: "2026-06-06T10:10:40.000Z",
            startedAt: "2026-06-06T10:10:03.000Z",
            status: "completed",
            visualJokeSet,
          },
        },
        visualJokeSet,
      }),
    ).toMatchObject({
      drafts: [],
      generationResultStates: {
        textGeneration: {
          status: "failed",
        },
        visualJokeGeneration: {
          status: "completed",
        },
      },
    });
  });

  test("rejects invalid v3 joke context payloads", () => {
    expect(() =>
      parseStructuredJokeContext({
        ...buildStructuredJokeContext(),
        jokeableTensions: [],
      }),
    ).toThrow();

    expect(() =>
      parseJokeContextSnapshot({
        ...buildJokeContextSnapshot(),
        structuredContext: {
          ...buildStructuredJokeContext(),
          sourceTweetMediaExtraction: {
            summary: "Media read",
            visibleText: ["Headline"],
            notableDetails: ["UI screenshot"],
            mediaKinds: [],
          },
        },
      }),
    ).toThrow();
  });

  test("rejects invalid visual joke set sizes and missing recommended ordering", () => {
    expect(() =>
      parseVisualJokeSet({
        ...buildVisualJokeSet(),
        jokes: buildVisualJokes(4),
      }),
    ).toThrow();

    expect(() =>
      parseVisualJokeSet({
        ...buildVisualJokeSet(),
        jokes: [buildVisualJoke(0, { recommended: false }), ...buildVisualJokes(7).slice(1)],
      }),
    ).toThrow();
  });

  test("rejects malformed visual joke metadata and out-of-set selections", () => {
    const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());

    expect(() =>
      parseVisualJokeMetadata({
        ...buildVisualJokeMetadata(),
        shortRationale: " ",
      }),
    ).toThrow();

    expect(() =>
      parseVisualJoke({
        ...buildVisualJoke(0),
        metadata: {
          ...buildVisualJokeMetadata(),
          referencedFact: " ",
        },
      }),
    ).toThrow();

    expect(() =>
      parseSelectedVisualJoke(
        {
          selectedAt: "2026-06-06T10:14:00.000Z",
          visualJokeId: "visual-joke-missing",
        },
        visualJokeSet,
      ),
    ).toThrow();

    expect(() =>
      parseCompletedGenerationRunPayload({
        label: "Drafts for 2468",
        sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468").sourceTweet,
        drafts: buildStubbedGenerationEvents({
          replySignals: buildReplySignals(
            buildFixtureTweetContext("https://x.com/siliconmania/status/2468"),
          ),
          sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468")
            .sourceTweet,
          sourceTweetUrl: "https://x.com/siliconmania/status/2468",
          usersDirection: "Keep it skeptical.",
        }).flatMap((event) => (event.type === "progress" ? [event.draft] : [])),
        selectedVisualJoke: {
          selectedAt: "2026-06-06T10:14:00.000Z",
          visualJokeId: "visual-joke-missing",
        },
        visualJokeSet,
      }),
    ).toThrow();
  });
});

function buildImageSet() {
  return {
    id: "image-set-1",
    completedAt: "2026-06-05T10:21:00.000Z",
    imageModelProvenance: {
      model: "image-model-v1",
      provider: "ai-gateway",
    },
    selectedImageOriginal: {
      id: "selected-original-1",
      newsLinkedImageId: "news-linked-image-1",
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
    ],
  };
}

function buildStructuredJokeContext() {
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

function buildJokeContextSnapshot() {
  return {
    capturedAt: "2026-06-06T10:10:00.000Z",
    sourceTweetId: "2468",
    structuredContext: buildStructuredJokeContext(),
  };
}

function buildVisualJokeMetadata() {
  return {
    jokePattern: "truthful misdirection",
    jokeTarget: "platform pricing logic",
    referencedFact: "The launch screenshot foregrounds premium workflow controls.",
    shortRationale: "Turns the feature reveal into a pricing-pressure punchline.",
  };
}

type VisualJokeFixture = {
  id: string;
  metadata: ReturnType<typeof buildVisualJokeMetadata>;
  rank: number;
  recommended: boolean;
  text: string;
};

function buildVisualJoke(index: number, overrides: Partial<VisualJokeFixture> = {}) {
  const joke = {
    id: `visual-joke-${index + 1}`,
    metadata: buildVisualJokeMetadata(),
    rank: index + 1,
    recommended: index === 0,
    text: `Visual joke ${index + 1}`,
  };

  return {
    ...joke,
    ...overrides,
  };
}

function buildVisualJokes(count: number) {
  return Array.from({ length: count }, (_, index) => buildVisualJoke(index));
}

function buildVisualJokeSet() {
  return {
    generatedAt: "2026-06-06T10:12:00.000Z",
    id: "visual-joke-set-1",
    jokes: buildVisualJokes(8),
    targetCount: 8,
  };
}

function buildGenerationResultStates({
  jokeContextSnapshot,
  visualJokeSet,
}: {
  jokeContextSnapshot: JokeContextSnapshot;
  visualJokeSet: VisualJokeSet;
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
    visualJokeGeneration: {
      status: "completed",
      startedAt: "2026-06-06T10:10:03.000Z",
      completedAt: "2026-06-06T10:10:40.000Z",
      visualJokeSet,
    },
    imageGeneration: {
      status: "not-started",
    },
  };
}
