import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import type { CompositeRasterizer } from "@/services/final-quote-tweet-image";
import {
  buildStubbedGenerationEvents,
  type GenerationProviderId,
  type GenerationStreamEvent,
  type ImageGenerationInput,
  type ImageGenerationStreamEvent,
  type ImageOriginalCandidate,
  type ImageSet,
  type NewsLinkedImage,
  parseFailedImageSet,
  parseImageSet,
  parseJokeContextSnapshot,
  parseVisualJokeSet,
  type QuoteTweetDraft,
  type VisualJokeSet,
} from "@/services/generation";
import { buildReplySignals } from "@/services/outside-x-enrichment";
import type { RuntimeStatus } from "@/services/runtime-status";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import type { SavedRunStore } from "@/services/workspace";
import { type GenerationRun, type GenerationRunInput, Workspace } from "./workspace";

export class FakeGenerationEventSource {
  readonly listeners = new Map<
    "enrichment-completed" | "run-state" | "progress" | "completed" | "failed",
    ((message: MessageEvent<string>) => void)[]
  >();
  closed = false;

  addEventListener(
    type: "enrichment-completed" | "run-state" | "progress" | "completed" | "failed",
    listener: (message: MessageEvent<string>) => void,
  ) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  emit(event: GenerationStreamEvent) {
    const message = new MessageEvent(event.type, {
      data: JSON.stringify(event),
    });

    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(message);
    }
  }
}

export function renderWorkspace({
  generationEventSources = [],
  imageGenerationStreamFetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(""),
  ),
  isDesktop = false,
  initialActiveRunId,
  initialRuns,
  initialRuntimeStatus,
  onStartGenerationRun = vi.fn(),
  onStartImageGeneration = vi.fn(),
  rasterizeComposite,
  runtimeEnvironment,
  // Default to an empty in-memory store so tests never reach the network through
  // the production HTTP store; tests that assert on persistence pass their own.
  savedRunStore = createMemorySavedRunStore(),
}: {
  generationEventSources?: FakeGenerationEventSource[];
  imageGenerationStreamFetcher?: typeof fetch;
  isDesktop?: boolean;
  initialActiveRunId?: string;
  initialRuns?: GenerationRun[];
  initialRuntimeStatus?: RuntimeStatus;
  onStartGenerationRun?: (input: GenerationRunInput) => void;
  onStartImageGeneration?: (input: ImageGenerationInput) => void;
  rasterizeComposite?: CompositeRasterizer;
  runtimeEnvironment?: "development" | "production";
  savedRunStore?: SavedRunStore;
} = {}) {
  const generationStreamUrls: string[] = [];

  // The runs sidebar persists its pinned state to localStorage; clear it so each
  // test starts from the collapsed state regardless of what earlier tests pinned.
  window.localStorage.clear();
  stubDesktopMediaQuery(isDesktop);

  render(
    <>
      <Workspace
        generationEventSourceFactory={(url) => {
          generationStreamUrls.push(url);
          const eventSource = new FakeGenerationEventSource();

          generationEventSources.push(eventSource);

          return eventSource;
        }}
        imageGenerationStreamFetcher={imageGenerationStreamFetcher}
        initialActiveRunId={initialActiveRunId}
        initialRuns={initialRuns}
        initialRuntimeStatus={initialRuntimeStatus}
        onStartGenerationRun={onStartGenerationRun}
        onStartImageGeneration={onStartImageGeneration}
        rasterizeComposite={rasterizeComposite}
        runtimeEnvironment={runtimeEnvironment}
        savedRunStore={savedRunStore}
      />
      <Toaster />
    </>,
  );

  return {
    sourceTweetUrlInput: screen.getByLabelText(/source tweet url/i),
    generateButton: screen.getByRole("button", { name: /^run$/i }),
    generationStreamUrls,
  };
}

export function createMemorySavedRunStore(initialRuns: GenerationRun[] = []) {
  const savedRuns = new Map(initialRuns.map((run) => [run.id, run]));
  const sortedRuns = () =>
    Array.from(savedRuns.values()).sort((left, right) => {
      const leftSavedAt = Date.parse(left.savedAt ?? "");
      const rightSavedAt = Date.parse(right.savedAt ?? "");

      return rightSavedAt - leftSavedAt;
    });
  const save = vi.fn(async (run: GenerationRun) => {
    savedRuns.set(run.id, run);
  });
  const deleteRun = vi.fn(async (runId: string) => {
    savedRuns.delete(runId);
  });
  const listPaginated = vi.fn(
    async ({ cursor, limit }: { cursor?: string | null; limit: number }) => {
      const runs = sortedRuns();
      const offset = cursor ? Number.parseInt(cursor, 10) : 0;
      const nextOffset = offset + limit;

      return {
        nextCursor: nextOffset < runs.length ? String(nextOffset) : null,
        runs: runs.slice(offset, nextOffset),
      };
    },
  );
  const loadById = vi.fn(async (runId: string) => savedRuns.get(runId) ?? null);
  const markSeen = vi.fn(async (runId: string) => {
    const run = savedRuns.get(runId);

    if (run) {
      savedRuns.set(runId, { ...run, seenAt: "2026-06-06T10:30:00.000Z" });
    }
  });
  const store = {
    savedRuns,
    list: async () => sortedRuns(),
    listPaginated,
    loadById,
    save,
    delete: deleteRun,
    markSeen,
  };

  return store;
}

function stubDesktopMediaQuery(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

export function buildCompletedRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
  const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/1234567890");
  // When a run carries News-Linked Images, mirror the server and offer them as
  // Image Original Candidates so the selection grid has something to render.
  const imageOriginalCandidates =
    overrides.imageOriginalCandidates ??
    overrides.newsLinkedImages?.map((newsLinkedImage) => ({
      altText: newsLinkedImage.altText,
      id: newsLinkedImage.id,
      origin: "news-linked-image" as const,
      sourceUrl: newsLinkedImage.sourceUrl,
      title: newsLinkedImage.title,
      url: newsLinkedImage.url,
    }));

  return {
    id: "saved-run",
    label: "Saved run",
    sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
    usersDirection: "Keep it dry.",
    status: "completed",
    draftCount: 3,
    draftTarget: 3,
    sourceTweet: tweetContext.sourceTweet,
    imageOriginalCandidates,
    drafts: [
      buildSavedDraft({
        id: "draft-openai",
        provider: "openai",
        text: "Quote-tweet draft: first saved draft.",
      }),
      buildSavedDraft({
        id: "draft-anthropic",
        provider: "anthropic",
        text: "Quote-tweet draft: second saved draft.",
      }),
      buildSavedDraft({
        id: "draft-google",
        provider: "google",
        text: "Quote-tweet draft: third saved draft.",
      }),
    ],
    ...overrides,
    uploadedImageSets: overrides.uploadedImageSets ?? [],
  };
}

export function buildCompletedV3Run(overrides: Partial<GenerationRun> = {}): GenerationRun {
  const sourceTweetId = "1234567890";
  const newsLinkedImages = buildNewsLinkedImages();
  const imageSet = buildImageSet(newsLinkedImages[0]);
  const jokeContextSnapshot = buildJokeContextSnapshot(sourceTweetId);
  const visualJokeSet = buildVisualJokeSet();
  const imageGenerationState: NonNullable<GenerationRun["imageGenerationState"]> = {
    completedAt: "2026-06-06T10:25:00.000Z",
    selectedImageId: newsLinkedImages[0].id,
    startedAt: "2026-06-06T10:20:00.000Z",
    status: "completed",
    userImagePrompt: "Make the image feel launch-ready.",
  };
  const generationResultStates: NonNullable<GenerationRun["generationResultStates"]> = {
    contextGathering: {
      completedAt: "2026-06-06T10:10:00.000Z",
      jokeContextSnapshot,
      startedAt: "2026-06-06T10:08:00.000Z",
      status: "completed",
    },
    imageGeneration: imageGenerationState,
    newsLinkedImageDiscovery: {
      completedAt: "2026-06-06T10:13:00.000Z",
      newsLinkedImages,
      startedAt: "2026-06-06T10:11:00.000Z",
      status: "completed",
    },
    textGeneration: {
      completedAt: "2026-06-06T10:14:00.000Z",
      draftCount: 3,
      startedAt: "2026-06-06T10:11:00.000Z",
      status: "completed",
    },
    visualJokeGeneration: {
      completedAt: "2026-06-06T10:15:00.000Z",
      startedAt: "2026-06-06T10:11:00.000Z",
      status: "completed",
      visualJokeSet,
    },
  };

  return buildCompletedRun({
    generationResultStates,
    imageGenerationState,
    imageModelProvenance: imageSet.imageModelProvenance,
    imageOriginalCandidates: buildImageOriginalCandidates(),
    imageSet,
    jokeContextSnapshot,
    newsLinkedImages,
    phase: "image-generation-complete",
    savedAt: "2026-06-06T10:26:00.000Z",
    selectedImageOriginal: imageSet.selectedImageOriginal,
    selectedVisualJoke: {
      selectedAt: "2026-06-06T10:16:00.000Z",
      visualJokeId: visualJokeSet.jokes[1].id,
    },
    visualJokeDirection: "Ground every visual joke in the source media and lock-in replies.",
    visualJokeSet,
    ...overrides,
  });
}

export function buildSavedDraft({
  id,
  provider,
  text,
}: {
  id: string;
  provider: GenerationProviderId;
  text: string;
}): QuoteTweetDraft {
  const providerNames: Record<GenerationProviderId, string> = {
    anthropic: "Anthropic",
    google: "Google",
    openai: "OpenAI",
  };

  return {
    angle: `${provider} angle`,
    id,
    modelProvenance: `${providerNames[provider]} local draft model`,
    provider,
    text,
    visibleRationale: `${providerNames[provider]} rationale.`,
  };
}

export function buildRuntimeStatus(overrides: Partial<RuntimeStatus> = {}): RuntimeStatus {
  const status: RuntimeStatus = {
    enrichment: {
      credentials: {
        apiKey: false,
      },
      mode: "off",
    },
    generation: {
      aiGateway: {
        catalogReachable: false,
        imageModel: {
          available: false,
          id: "google/gemini-2.5-flash-image",
        },
        models: {
          anthropic: {
            available: false,
            id: "anthropic/claude-sonnet-4.6",
          },
          google: {
            available: false,
            id: "google/gemini-3-flash",
          },
          openai: {
            available: false,
            id: "openai/gpt-5.4-mini",
          },
        },
        visualJokeModel: {
          available: false,
          id: "openai/gpt-5.5",
        },
      },
      credentials: {
        aiGatewayApiKey: false,
      },
      mode: "local",
    },
    persistence: {
      credentials: {
        operatorAllowlistedEmail: false,
        supabaseAnonKey: false,
        supabaseServiceRoleKey: false,
        supabaseUrl: false,
      },
      mode: "off",
    },
    productionCredentials: {
      aiGatewayApiKey: false,
      twitterApiIoApiKey: false,
    },
    productionReady: false,
    retrieval: {
      credentials: {
        twitterApiIoApiKey: false,
      },
      mode: "fixture",
    },
  };

  return {
    ...status,
    ...overrides,
  };
}

export function buildGenerationEvents({
  sourceTweetUrl,
  usersDirection = "",
}: {
  sourceTweetUrl: string;
  usersDirection?: string;
}) {
  const tweetContext = buildFixtureTweetContext(sourceTweetUrl);

  return buildStubbedGenerationEvents({
    replySignals: buildReplySignals(tweetContext),
    sourceTweet: tweetContext.sourceTweet,
    sourceTweetUrl,
    usersDirection,
  });
}

export function buildNewsLinkedImages(): NewsLinkedImage[] {
  return [
    {
      id: "news-linked-image-1",
      url: "https://picsum.photos/seed/news-linked-image-1/320/240",
      altText: "Launch product screenshot.",
      title: "Launch visual",
    },
    {
      id: "news-linked-image-2",
      url: "https://picsum.photos/seed/news-linked-image-2/320/240",
      altText: "Platform update chart.",
      title: "Platform visual",
    },
    {
      id: "news-linked-image-3",
      url: "https://picsum.photos/seed/news-linked-image-3/320/240",
      altText: "Strategy memo excerpt.",
      title: "Strategy visual",
    },
  ];
}

export function buildImageOriginalCandidates(): ImageOriginalCandidate[] {
  return buildNewsLinkedImages().map((newsLinkedImage) => ({
    altText: newsLinkedImage.altText,
    id: newsLinkedImage.id,
    origin: "news-linked-image",
    sourceUrl: newsLinkedImage.sourceUrl,
    title: newsLinkedImage.title,
    url: newsLinkedImage.url,
  }));
}

export function buildJokeContextSnapshot(sourceTweetId: string) {
  return parseJokeContextSnapshot({
    capturedAt: "2026-06-06T10:10:00.000Z",
    sourceTweetId,
    structuredContext: {
      authorContext: {
        authoritySignals: ["Operator is close to the launch."],
        displayName: "Silicon Mania",
        handle: "@siliconmania",
        relationshipToTopic: "Announcing its own workflow launch.",
      },
      forbiddenAssumptions: ["Do not invent missing product details."],
      jokeContextQuality: {
        status: "usable",
        summary: "Enough context exists to support grounded jokes.",
      },
      jokeableTensions: ["The launch promises simplicity while increasing platform dependence."],
      replySignals: {
        representativeSnippets: [
          {
            authorHandle: "@replyguy",
            replyId: `${sourceTweetId}-reply-1`,
            signal: "Audience reads this as workflow lock-in.",
            snippet: "Cool, now every workflow starts looking locked in.",
          },
        ],
        summary: "Replies focus on workflow lock-in and operator pressure.",
      },
      sourceTweetClaim: "The source tweet claims the launch removes the final workflow bottleneck.",
      sourceTweetMediaExtraction: {
        mediaKinds: ["image"],
        notableDetails: ["Launch card shows one-click workflow automation."],
        summary: "The media shows a workflow automation launch card.",
        visibleText: ["One-click workflow automation"],
      },
      supportingFacts: ["The rollout is framed as an operator productivity update."],
      unknowns: ["No pricing detail is confirmed in the source tweet."],
    },
  });
}

export function buildVisualJokeSet(): VisualJokeSet {
  return parseVisualJokeSet({
    generatedAt: "2026-06-06T10:14:00.000Z",
    id: "visual-joke-set-1",
    targetPerSection: 7,
    jokes: [
      {
        id: "visual-joke-1",
        order: 1,
        section: "satire",
        text: "A one-click launch button labeled 'Eventually, manual work.'",
      },
      {
        id: "visual-joke-2",
        order: 1,
        section: "tech-positive",
        text: "A workflow map where every exit arrow points back to the login screen.",
      },
      {
        id: "visual-joke-3",
        order: 1,
        section: "experimental",
        text: "A dashboard celebrating that the bottleneck has been promoted to admin.",
      },
      {
        id: "visual-joke-4",
        order: 2,
        section: "satire",
        text: "A polished product card with one button: 'Automate explaining this later.'",
      },
      {
        id: "visual-joke-5",
        order: 2,
        section: "tech-positive",
        text: "A launch graphic where confetti falls only on the terms-of-service checkbox.",
      },
    ],
    topPicks: [{ reason: "Sharpest satire angle.", visualJokeId: "visual-joke-1" }],
  });
}

export function buildImageSet(newsLinkedImage: NewsLinkedImage): ImageSet {
  return parseImageSet({
    id: `image-set-${newsLinkedImage.id}`,
    completedAt: "2026-06-05T10:21:00.000Z",
    imageModelProvenance: {
      model: "mock-image-model",
      provider: "openai",
    },
    selectedImageOriginal: {
      altText: newsLinkedImage.altText,
      candidateId: newsLinkedImage.id,
      id: `selected-original-${newsLinkedImage.id}`,
      origin: "news-linked-image",
      preparedAt: "2026-06-05T10:20:00.000Z",
      sourceUrl: newsLinkedImage.sourceUrl,
      title: newsLinkedImage.title,
      url: newsLinkedImage.url,
    },
    options: [
      {
        altText: newsLinkedImage.altText,
        id: `image-option-${newsLinkedImage.id}-original`,
        kind: "original",
        label: "Original",
        url: newsLinkedImage.url,
      },
      {
        altText: `${newsLinkedImage.title} variation 1.`,
        id: `image-option-${newsLinkedImage.id}-variation-1`,
        kind: "variation",
        label: "Variation 1",
        url: `https://example.com/${newsLinkedImage.id}-variation-1.jpg`,
      },
      {
        altText: `${newsLinkedImage.title} variation 2.`,
        id: `image-option-${newsLinkedImage.id}-variation-2`,
        kind: "variation",
        label: "Variation 2",
        url: `https://example.com/${newsLinkedImage.id}-variation-2.jpg`,
      },
      {
        altText: `${newsLinkedImage.title} variation 3.`,
        id: `image-option-${newsLinkedImage.id}-variation-3`,
        kind: "variation",
        label: "Variation 3",
        url: `https://example.com/${newsLinkedImage.id}-variation-3.jpg`,
      },
      {
        altText: `${newsLinkedImage.title} variation 4.`,
        id: `image-option-${newsLinkedImage.id}-variation-4`,
        kind: "variation",
        label: "Variation 4",
        url: `https://example.com/${newsLinkedImage.id}-variation-4.jpg`,
      },
    ],
  });
}

export function buildFailedImageSet(newsLinkedImage: NewsLinkedImage) {
  return parseFailedImageSet({
    failedAt: "2026-06-05T10:22:00.000Z",
    id: `failed-image-set-${newsLinkedImage.id}`,
    message: "The configured image model failed.",
    selectedImageId: newsLinkedImage.id,
  });
}

export function buildImageGenerationStreamResponse(events: ImageGenerationStreamEvent[]) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
          );
        }

        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
      },
    },
  );
}
