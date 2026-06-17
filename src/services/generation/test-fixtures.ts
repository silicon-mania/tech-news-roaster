import type { JokeContextSnapshot, VisualJokeSet } from "@/services/generation";

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

// The three Visual Joke Sections in direction order. Fixture jokes round-robin
// across them so any count still produces contiguous within-section order.
const visualJokeSectionOrder = ["satire", "tech-positive", "experimental"] as const;

type VisualJokeFixture = {
  id: string;
  order: number;
  section: (typeof visualJokeSectionOrder)[number];
  text: string;
};

export function buildVisualJoke(index: number, overrides: Partial<VisualJokeFixture> = {}) {
  const joke = {
    id: `visual-joke-${index + 1}`,
    order: Math.floor(index / visualJokeSectionOrder.length) + 1,
    section: visualJokeSectionOrder[index % visualJokeSectionOrder.length],
    text: `Visual joke ${index + 1}`,
  };

  return {
    ...joke,
    ...overrides,
  };
}

export function buildVisualJokes(count: number) {
  return Array.from({ length: count }, (_, index) => buildVisualJoke(index));
}

export function buildVisualJokeSet() {
  return {
    generatedAt: "2026-06-06T10:12:00.000Z",
    id: "visual-joke-set-1",
    jokes: buildVisualJokes(6),
    targetPerSection: 7,
    topPicks: [
      { reason: "Sharpest satire angle.", visualJokeId: "visual-joke-1" },
      { reason: "Strong tech-positive flip.", visualJokeId: "visual-joke-2" },
    ],
  };
}

// The pre-categorized ranked-eight Visual Joke Set shape (with per-joke
// `metadata`/`rank`/`recommended` and a set-level `targetCount`). It predates
// the categorized schema and fails its strict validation, so it exists only to
// exercise the saved-run back-compat gate — never to round-trip.
export function buildLegacyVisualJokeSet() {
  return {
    generatedAt: "2026-06-06T10:12:00.000Z",
    id: "visual-joke-set-legacy",
    jokes: [1, 2].map((rank) => ({
      id: `legacy-visual-joke-${rank}`,
      metadata: {
        jokePattern: "Juxtaposition",
        jokeTarget: "The launch hype",
        referencedFact: "The keynote ran long.",
        shortRationale: "Plays the timing against the promise.",
      },
      rank,
      recommended: rank === 1,
      text: `Legacy visual joke ${rank}`,
    })),
    targetCount: 8,
  };
}

export function buildGenerationResultStates({
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
