import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  buildCompletedGenerationRunEvents,
  buildEnrichmentCompletedEvent,
  buildGenerationFailureEvent,
  buildGenerationRunStateEvent,
  buildStubbedGenerationEvents,
  type GenerationProviderId,
  type GenerationStreamEvent,
  type ImageGenerationInput,
  type ImageGenerationStreamEvent,
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
import { type GenerationIntake, type GenerationRun, IntakeWorkspace } from "./intake-workspace";

class FakeGenerationEventSource {
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

function renderWorkspace({
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
  runtimeEnvironment,
  savedRunStore,
}: {
  generationEventSources?: FakeGenerationEventSource[];
  imageGenerationStreamFetcher?: typeof fetch;
  isDesktop?: boolean;
  initialActiveRunId?: string;
  initialRuns?: GenerationRun[];
  initialRuntimeStatus?: RuntimeStatus;
  onStartGenerationRun?: (intake: GenerationIntake) => void;
  onStartImageGeneration?: (input: ImageGenerationInput) => void;
  runtimeEnvironment?: "development" | "production";
  savedRunStore?: SavedRunStore;
} = {}) {
  const generationStreamUrls: string[] = [];

  stubDesktopMediaQuery(isDesktop);

  render(
    <IntakeWorkspace
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
      runtimeEnvironment={runtimeEnvironment}
      savedRunStore={savedRunStore}
    />,
  );

  return {
    sourceTweetUrlInput: screen.getByLabelText(/source tweet url/i),
    generateButton: screen.getByRole("button", { name: /^run$/i }),
    generationStreamUrls,
  };
}

function createMemorySavedRunStore(initialRuns: GenerationRun[] = []) {
  const savedRuns = new Map(initialRuns.map((run) => [run.id, run]));
  const save = vi.fn(async (run: GenerationRun) => {
    savedRuns.set(run.id, run);
  });
  const deleteRun = vi.fn(async (runId: string) => {
    savedRuns.delete(runId);
  });
  const store = {
    savedRuns,
    list: async () =>
      Array.from(savedRuns.values()).sort((left, right) => {
        const leftSavedAt = Date.parse(left.savedAt ?? "");
        const rightSavedAt = Date.parse(right.savedAt ?? "");

        return rightSavedAt - leftSavedAt;
      }),
    save,
    delete: deleteRun,
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

function buildCompletedRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
  const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/1234567890");

  return {
    id: "saved-run",
    label: "Saved run",
    sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
    usersDirection: "Keep it dry.",
    status: "completed",
    draftCount: 3,
    draftTarget: 3,
    sourceTweet: tweetContext.sourceTweet,
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
  };
}

function buildCompletedV3Run(overrides: Partial<GenerationRun> = {}): GenerationRun {
  const sourceTweetId = "1234567890";
  const newsLinkedImages = buildNewsLinkedImages();
  const imageSet = buildImageSet(newsLinkedImages[0]);
  const failedImageSet = buildFailedImageSet(newsLinkedImages[1]);
  const jokeContextSnapshot = buildJokeContextSnapshot(sourceTweetId);
  const visualJokeSet = buildVisualJokeSet();
  const imageGenerationState: NonNullable<GenerationRun["imageGenerationState"]> = {
    completedAt: "2026-06-06T10:25:00.000Z",
    selectedImageIds: [newsLinkedImages[0].id, newsLinkedImages[1].id],
    startedAt: "2026-06-06T10:20:00.000Z",
    status: "partially-failed",
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
    failedImageSets: [failedImageSet],
    generationResultStates,
    imageGenerationState,
    imageModelProvenance: imageSet.imageModelProvenance,
    imageSets: [imageSet],
    jokeContextSnapshot,
    newsLinkedImages,
    phase: "image-generation-partially-failed",
    savedAt: "2026-06-06T10:26:00.000Z",
    selectedImageOriginals: [imageSet.selectedImageOriginal],
    selectedVisualJoke: {
      selectedAt: "2026-06-06T10:16:00.000Z",
      visualJokeId: visualJokeSet.jokes[1].id,
    },
    visualJokeDirection: "Ground every visual joke in the source media and lock-in replies.",
    visualJokeSet,
    ...overrides,
  });
}

function buildSavedDraft({
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

function buildRuntimeStatus(overrides: Partial<RuntimeStatus> = {}): RuntimeStatus {
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
          id: "openai/gpt-5.4-mini",
        },
      },
      credentials: {
        aiGatewayApiKey: false,
      },
      mode: "local",
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

function buildGenerationEvents({
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

function buildNewsLinkedImages(): NewsLinkedImage[] {
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

function buildJokeContextSnapshot(sourceTweetId: string) {
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

function buildVisualJokeSet(): VisualJokeSet {
  return parseVisualJokeSet({
    generatedAt: "2026-06-06T10:14:00.000Z",
    id: "visual-joke-set-1",
    targetCount: 5,
    jokes: [
      {
        id: "visual-joke-1",
        metadata: {
          jokePattern: "status-theater",
          jokeTarget: "Workflow launch pressure",
          referencedFact: "The launch is framed as one-click automation.",
          shortRationale: "It turns productivity theatre into the visual gag.",
        },
        rank: 1,
        recommended: true,
        text: "A one-click launch button labeled 'Eventually, manual work.'",
      },
      {
        id: "visual-joke-2",
        metadata: {
          jokePattern: "literalized-platform-risk",
          jokeTarget: "Platform dependence",
          referencedFact: "Replies read the workflow as lock-in.",
          shortRationale: "It makes lock-in visible without inventing details.",
        },
        rank: 2,
        text: "A workflow map where every exit arrow points back to the login screen.",
      },
      {
        id: "visual-joke-3",
        metadata: {
          jokePattern: "enterprise-understatement",
          jokeTarget: "Operator pressure",
          referencedFact: "The rollout promises productivity.",
          shortRationale: "It plays the launch tone against the operator burden.",
        },
        rank: 3,
        text: "A dashboard celebrating that the bottleneck has been promoted to admin.",
      },
      {
        id: "visual-joke-4",
        metadata: {
          jokePattern: "button-label-reversal",
          jokeTarget: "Automation expectations",
          referencedFact: "The media shows one-click workflow automation.",
          shortRationale: "It keeps the joke grounded in the visible UI claim.",
        },
        rank: 4,
        text: "A polished product card with one button: 'Automate explaining this later.'",
      },
      {
        id: "visual-joke-5",
        metadata: {
          jokePattern: "soft-dystopia",
          jokeTarget: "Productivity framing",
          referencedFact: "The source tweet frames the launch as productivity.",
          shortRationale: "It lightly darkens the stated product promise.",
        },
        rank: 5,
        text: "A launch graphic where confetti falls only on the terms-of-service checkbox.",
      },
    ],
  });
}

function buildImageSet(newsLinkedImage: NewsLinkedImage): ImageSet {
  return parseImageSet({
    id: `image-set-${newsLinkedImage.id}`,
    completedAt: "2026-06-05T10:21:00.000Z",
    imageModelProvenance: {
      model: "mock-image-model",
      provider: "openai",
    },
    selectedImageOriginal: {
      altText: newsLinkedImage.altText,
      id: `selected-original-${newsLinkedImage.id}`,
      newsLinkedImageId: newsLinkedImage.id,
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
    ],
  });
}

function buildFailedImageSet(newsLinkedImage: NewsLinkedImage) {
  return parseFailedImageSet({
    failedAt: "2026-06-05T10:22:00.000Z",
    id: `failed-image-set-${newsLinkedImage.id}`,
    message: "The configured image model failed.",
    selectedImageId: newsLinkedImage.id,
  });
}

function buildImageGenerationStreamResponse(events: ImageGenerationStreamEvent[]) {
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

describe("IntakeWorkspace", () => {
  test("renders an almost empty draft-first shell before any run exists", () => {
    renderWorkspace();

    expect(screen.getByRole("heading", { name: "TECH NEWS ROASTER" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /primary intake bar/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /empty draft canvas/i })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: /runs drawer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /^user's direction$/i })).not.toBeInTheDocument();
  });

  test("submits a valid direct Source Tweet URL with optional User's Direction", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, " https://x.com/siliconmania/status/1234567890 ");
    await user.click(screen.getByRole("button", { name: /open user's direction panel/i }));
    const usersDirectionInput = screen.getByRole("textbox", {
      name: /^user's direction$/i,
    });
    await user.type(usersDirectionInput, "Make it sharper about platform risk.");
    await user.click(
      screen.getByRole("button", {
        name: /close user's direction panel/i,
      }),
    );
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "Make it sharper about platform risk.",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Intake accepted.");
    expect(screen.getByRole("region", { name: /compressed intake bar/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "0/3",
    );

    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(
      screen.getByRole("button", {
        name: /new generation run.*just now/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Enrichment running")).toBeInTheDocument();
    expect(generateButton).toBeDisabled();
  });

  test("rejects invalid URLs before generation starts", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, "https://example.com/posts/123");
    await user.click(generateButton);

    expect(startGenerationRun).not.toHaveBeenCalled();
    const intakeBar = screen.getByRole("region", {
      name: /primary intake bar/i,
    });
    expect(within(intakeBar).getByRole("alert")).toHaveTextContent(
      "Use a direct x.com or twitter.com status URL.",
    );
    expect(sourceTweetUrlInput).toHaveAttribute("aria-invalid", "true");
  });

  test("allows User's Direction to stay empty", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, "https://twitter.com/siliconmania/status/987654321");
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://twitter.com/siliconmania/status/987654321",
      usersDirection: "",
    });
  });

  test("warns in development when live APIs are enabled but still allows runs", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      initialRuntimeStatus: buildRuntimeStatus({
        enrichment: {
          credentials: {
            apiKey: true,
          },
          mode: "configured",
        },
        generation: {
          ...buildRuntimeStatus().generation,
          credentials: {
            aiGatewayApiKey: true,
          },
          mode: "live",
        },
      }),
      onStartGenerationRun: startGenerationRun,
      runtimeEnvironment: "development",
    });

    expect(screen.getByText("Live APIs enabled. Runs may use paid quota.")).toBeInTheDocument();
    expect(generateButton).toBeEnabled();

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "",
    });
  });

  test("warns in development when news-linked images are unavailable", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      initialRuntimeStatus: buildRuntimeStatus({
        enrichment: {
          credentials: {
            apiKey: false,
          },
          mode: "off",
        },
      }),
      onStartGenerationRun: startGenerationRun,
      runtimeEnvironment: "development",
    });

    expect(
      screen.getByText(
        "News-linked images unavailable. Set OUTSIDE_X_ENRICHMENT_ENDPOINT to enable image generation.",
      ),
    ).toBeInTheDocument();
    expect(generateButton).toBeEnabled();

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "",
    });
  });

  test("disables Run in production when live integrations are not ready", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton, generationStreamUrls } = renderWorkspace({
      initialRuntimeStatus: buildRuntimeStatus({
        productionReady: false,
      }),
      onStartGenerationRun: startGenerationRun,
      runtimeEnvironment: "production",
    });

    expect(generateButton).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Live integrations are not configured.");

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    expect(startGenerationRun).not.toHaveBeenCalled();
    expect(generationStreamUrls).toEqual([]);
  });

  test("allows production runs when live integrations are ready", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      initialRuntimeStatus: buildRuntimeStatus({
        productionReady: true,
      }),
      onStartGenerationRun: startGenerationRun,
      runtimeEnvironment: "production",
    });

    expect(generateButton).toBeEnabled();
    expect(screen.queryByText("Live integrations are not configured.")).not.toBeInTheDocument();

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "",
    });
  });

  test("does not render preset steering controls", () => {
    renderWorkspace();

    expect(screen.queryByLabelText(/angle/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/draft's tone/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/length/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/publish mode/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/preset/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  test("opens the runs drawer and User's Direction panel from opposite sides on desktop and mobile-sized viewports", async () => {
    const user = userEvent.setup();

    vi.stubGlobal("innerWidth", 1280);
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: /open runs drawer, 0 runs/i }));
    expect(screen.getByRole("complementary", { name: /runs drawer/i })).toHaveClass("left-0");

    await user.click(screen.getByRole("button", { name: /close runs drawer/i }));
    await user.click(screen.getByRole("button", { name: /open user's direction panel/i }));
    expect(
      screen.getByRole("complementary", {
        name: /user's direction panel/i,
      }),
    ).toHaveClass("right-0");

    await user.type(
      screen.getByRole("textbox", { name: /^user's direction$/i }),
      "Respect the SEC angle.",
    );
    await user.click(
      screen.getByRole("button", {
        name: /close user's direction panel/i,
      }),
    );
    expect(screen.getByTitle("User's Direction has content")).toBeInTheDocument();

    vi.stubGlobal("innerWidth", 390);
    await user.click(screen.getByRole("button", { name: /open runs drawer, 0 runs/i }));
    expect(screen.getByRole("complementary", { name: /runs drawer/i })).toBeInTheDocument();
  });

  test("keeps the running run inspectable and prevents another in-flight run", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(
      screen.getByRole("button", {
        name: /new generation run.*just now/i,
      }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByTitle("Enrichment running")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "0/3",
    );
    expect(generateButton).toBeDisabled();

    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledTimes(1);
  });

  test("selecting a run replaces the active run", async () => {
    const user = userEvent.setup();
    const seededRuns: GenerationRun[] = [
      {
        id: "first-run",
        label: "First run",
        sourceTweetUrl: "https://x.com/siliconmania/status/111",
        usersDirection: "",
        status: "running",
        draftCount: 0,
        draftTarget: 3,
        drafts: [],
      },
      {
        id: "second-run",
        label: "Second run",
        sourceTweetUrl: "https://x.com/siliconmania/status/222",
        usersDirection: "Lean into the business model.",
        status: "running",
        draftCount: 1,
        draftTarget: 3,
        drafts: [],
      },
    ];

    renderWorkspace({
      initialActiveRunId: "first-run",
      initialRuns: seededRuns,
    });

    expect(screen.getByRole("region", { name: /compressed intake bar/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "0/3",
    );

    await user.click(screen.getByRole("button", { name: /open runs drawer, 2 runs/i }));
    await user.click(screen.getByRole("button", { name: /second run/i }));

    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "1/3",
    );
    expect(screen.queryByRole("complementary", { name: /runs drawer/i })).not.toBeInTheDocument();
  });

  test("receives progressive SSE updates and reveals exactly three completed drafts", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(screen.getByRole("button", { name: /open user's direction panel/i }));
    const usersDirectionInput = screen.getByRole("textbox", {
      name: /^user's direction$/i,
    });
    await user.type(usersDirectionInput, "Keep the joke dry.");
    await user.click(
      screen.getByRole("button", {
        name: /close user's direction panel/i,
      }),
    );
    await user.click(generateButton);

    const events = buildGenerationEvents({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "Keep the joke dry.",
    });

    expect(generationEventSources).toHaveLength(1);

    act(() => {
      generationEventSources[0]?.emit(events[0]);
    });

    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*just now/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Text generation running")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close runs drawer/i }));
    const sourceTweetPreview = screen.getByRole("complementary", {
      name: /source tweet preview/i,
    });

    expect(sourceTweetPreview).toHaveTextContent("agent workspace");
    expect(sourceTweetPreview).not.toHaveTextContent("https://x.com");
    expect(sourceTweetPreview).not.toHaveTextContent("Silicon Mania");
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/local draft model/i)).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[1]);
      generationEventSources[0]?.emit(events[2]);
    });

    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "3/3",
    );
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[3]);
    });

    expect(generationEventSources[0]?.closed).toBe(true);
    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*just now/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Completed")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
    expect(screen.getAllByText(/local draft model/i)).toHaveLength(3);
  });

  test("renders compact generation progress from run-state events without polling", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
    });
    const sourceTweetUrl = "https://x.com/siliconmania/status/2468";
    const tweetContext = buildFixtureTweetContext(sourceTweetUrl);

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "running",
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
          },
          label: "Drafts for 2468",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
    });

    const progress = screen.getByLabelText(/generation progress/i);

    expect(progress).toHaveTextContent("Context gathering");
    expect(progress).toHaveTextContent("Running");
    expect(progress).toHaveTextContent("Draft creation");
    expect(progress).toHaveTextContent("Queued");
    expect(progress).toHaveTextContent("Image generation");

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("2468"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              startedAt: "2026-06-06T10:10:02.000Z",
              status: "running",
            },
            textGeneration: {
              startedAt: "2026-06-06T10:10:01.000Z",
              status: "running",
            },
            visualJokeGeneration: {
              startedAt: "2026-06-06T10:10:03.000Z",
              status: "running",
            },
          },
          label: "Drafts for 2468",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
    });

    expect(progress).toHaveTextContent("Complete");
    expect(progress).toHaveTextContent("Image discovery");
    expect(progress).toHaveTextContent("Visual jokes");
    expect(progress).toHaveTextContent("Queued");

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("2468"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              completedAt: "2026-06-06T10:12:00.000Z",
              newsLinkedImages: buildNewsLinkedImages(),
              startedAt: "2026-06-06T10:10:02.000Z",
              status: "completed",
            },
            textGeneration: {
              startedAt: "2026-06-06T10:10:01.000Z",
              status: "running",
            },
            visualJokeGeneration: {
              startedAt: "2026-06-06T10:10:03.000Z",
              status: "running",
            },
          },
          label: "Drafts for 2468",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
    });

    const readyForImageGenerationProgress = screen.getByLabelText(/generation progress/i);

    expect(readyForImageGenerationProgress).toHaveTextContent("Not started");

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("2468"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              failedAt: "2026-06-06T10:12:00.000Z",
              message: "Image discovery failed.",
              startedAt: "2026-06-06T10:10:02.000Z",
              status: "failed",
            },
            textGeneration: {
              startedAt: "2026-06-06T10:10:01.000Z",
              status: "running",
            },
            visualJokeGeneration: {
              startedAt: "2026-06-06T10:10:03.000Z",
              status: "running",
            },
          },
          label: "Drafts for 2468",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
    });

    const imageDiscoveryFailedProgress = screen.getByLabelText(/generation progress/i);

    expect(imageDiscoveryFailedProgress).toHaveTextContent("Failed");
    expect(imageDiscoveryFailedProgress).toHaveTextContent("Unavailable");
  });

  test("renders the full v3 happy path as separated responsive creative result areas", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const completedV3Run = buildCompletedV3Run({
      imageGenerationState: {
        status: "not-started",
      },
      phase: "waiting-for-image-selection",
    });
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
    });

    if (!completedV3Run.sourceTweet) {
      throw new Error("Expected completed v3 fixture to include a Source Tweet.");
    }
    const sourceTweet = completedV3Run.sourceTweet;

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    act(() => {
      for (const event of buildCompletedGenerationRunEvents({
        run: {
          drafts: completedV3Run.drafts,
          generationResultStates: completedV3Run.generationResultStates,
          imageGenerationState: completedV3Run.imageGenerationState,
          jokeContextSnapshot: completedV3Run.jokeContextSnapshot,
          label: completedV3Run.label,
          newsLinkedImages: completedV3Run.newsLinkedImages,
          phase: completedV3Run.phase,
          selectedVisualJoke: completedV3Run.selectedVisualJoke,
          sourceTweet,
          visualJokeDirection: completedV3Run.visualJokeDirection,
          visualJokeSet: completedV3Run.visualJokeSet,
        },
      })) {
        generationEventSources[0]?.emit(event);
      }
    });

    const responsiveWorkspace = screen.getByLabelText(/responsive creative workspace/i);
    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });
    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(responsiveWorkspace).not.toHaveClass("lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]");
    expect(
      draftStack.compareDocumentPosition(visualJokeArea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      visualJokeArea.compareDocumentPosition(imageGenerationArea) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(draftStack).toHaveTextContent("Quote-tweet draft: first saved draft.");
    expect(visualJokeArea).toHaveTextContent(
      "A workflow map where every exit arrow points back to the login screen.",
    );
    expect(imageGenerationArea).toHaveTextContent("Launch visual");
    expect(imageGenerationArea).toHaveTextContent("Waiting for image selection");
  });

  test("unlocks image selection from enrichment while text generation keeps streaming", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    const tweetContext = buildFixtureTweetContext(sourceTweetUrl);
    const newsLinkedImages = buildNewsLinkedImages();

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    act(() => {
      generationEventSources[0]?.emit(
        buildEnrichmentCompletedEvent({
          sourceTweet: tweetContext.sourceTweet,
          newsLinkedImages,
        }),
      );
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(imageGenerationArea).toHaveTextContent("Launch visual");
    expect(imageGenerationArea).toHaveTextContent("Platform visual");
    expect(imageGenerationArea).toHaveTextContent("Text generation running");
    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "0/3",
    );
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(screen.getByTitle("Text generation running")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close runs drawer/i }));

    const events = buildGenerationEvents({
      sourceTweetUrl,
      usersDirection: "",
    });

    act(() => {
      generationEventSources[0]?.emit(events[0]);
    });

    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "1/3",
    );
    expect(
      screen.getByRole("complementary", {
        name: /image generation area/i,
      }),
    ).toHaveTextContent("Launch visual");

    act(() => {
      generationEventSources[0]?.emit(events[1]);
      generationEventSources[0]?.emit(events[2]);
    });

    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "3/3",
    );
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[3]);
    });

    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", {
        name: /image generation area/i,
      }),
    ).toHaveTextContent("Waiting for image selection");
    expect(generateButton).toBeEnabled();
    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageGenerationState: {
          status: "not-started",
        },
        newsLinkedImages,
        phase: "waiting-for-image-selection",
      }),
    );

    await user.click(generateButton);

    expect(generationEventSources).toHaveLength(2);
  });

  test("gates image generation on selected image IDs and the user image prompt", async () => {
    const user = userEvent.setup();
    const startImageGeneration = vi.fn();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            status: "not-started",
          },
          newsLinkedImages,
          phase: "waiting-for-image-selection",
        }),
      ],
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });
    const imageGenerationButton = within(imageGenerationArea).getByRole("button", {
      name: /^image generation$/i,
    });

    expect(
      draftStack.compareDocumentPosition(imageGenerationArea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(imageGenerationButton).toBeDisabled();

    await user.type(
      within(imageGenerationArea).getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make it feel like a serious product launch, not a meme.",
    );

    expect(imageGenerationButton).toBeDisabled();

    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select platform visual/i,
      }),
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select strategy visual/i,
      }),
    );

    expect(imageGenerationArea).toHaveTextContent("Choose up to two images.");
    expect(
      within(imageGenerationArea).getByRole("button", {
        name: /select strategy visual/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(imageGenerationButton).toBeEnabled();

    await user.click(imageGenerationButton);

    expect(startImageGeneration).toHaveBeenCalledWith({
      parentRunId: "saved-run",
      selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
      userImagePrompt: "Make it feel like a serious product launch, not a meme.",
    });
    expect(JSON.stringify(startImageGeneration.mock.calls[0]?.[0])).not.toMatch(
      /picsum|Launch product screenshot|Platform update chart/i,
    );
    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageGenerationState: expect.objectContaining({
          selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
          status: "running",
          userImagePrompt: "Make it feel like a serious product launch, not a meme.",
        }),
        newsLinkedImages: newsLinkedImages.slice(0, 2),
        phase: "image-generation-running",
      }),
    );
  });

  test("renders visual jokes as copyable optional selections without exposing metadata or gating images", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    const startImageGeneration = vi.fn();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const visualJokeSet = buildVisualJokeSet();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            status: "not-started",
          },
          newsLinkedImages,
          phase: "waiting-for-image-selection",
          selectedVisualJoke: null,
          visualJokeSet,
        }),
      ],
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });
    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(
      draftStack.compareDocumentPosition(visualJokeArea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      visualJokeArea.compareDocumentPosition(imageGenerationArea) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(visualJokeArea).getAllByRole("article")).toHaveLength(5);
    expect(within(visualJokeArea).getByText("(Recommended)")).toBeInTheDocument();
    expect(
      within(visualJokeArea).getByRole("button", {
        name: /select visual joke 1/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(within(visualJokeArea).queryByRole("textbox")).not.toBeInTheDocument();
    expect(visualJokeArea).not.toHaveTextContent("status-theater");
    expect(visualJokeArea).not.toHaveTextContent("It turns productivity theatre");

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /copy visual joke 2/i,
      }),
    );

    expect(writeText).toHaveBeenCalledWith(
      "A workflow map where every exit arrow points back to the login screen.",
    );

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /select visual joke 2/i,
      }),
    );

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedVisualJoke: expect.objectContaining({
            visualJokeId: "visual-joke-2",
          }),
          visualJokeSet,
        }),
      ),
    );
    expect(savedRunStore.save.mock.calls.at(-1)?.[0].visualJokeSet).toBe(visualJokeSet);
    expect(
      within(visualJokeArea).getByRole("button", {
        name: /clear visual joke 2 selection/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /clear visual joke 2 selection/i,
      }),
    );

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedVisualJoke: null,
          visualJokeSet,
        }),
      ),
    );
    expect(savedRunStore.save.mock.calls.at(-1)?.[0].visualJokeSet).toBe(visualJokeSet);

    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    );
    await user.type(
      within(imageGenerationArea).getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make it feel like a serious product launch image.",
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /^image generation$/i,
      }),
    );

    expect(startImageGeneration).toHaveBeenCalledWith({
      parentRunId: "saved-run",
      selectedImageIds: ["news-linked-image-1"],
      userImagePrompt: "Make it feel like a serious product launch image.",
    });
  });

  test("opens quiet context and direction reveals without turning context into a control surface", async () => {
    const user = userEvent.setup();
    const jokeContextSnapshot = buildJokeContextSnapshot("1234567890");
    const visualJokeDirection =
      "Visual Joke Direction line one.\nPreserve this exact internal direction.";

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          jokeContextSnapshot,
          visualJokeDirection,
          visualJokeSet: buildVisualJokeSet(),
        }),
      ],
    });

    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const directionButton = screen.getByRole("button", {
      name: /open visual joke direction/i,
    });

    expect(screen.queryByText(/^Direction$/)).not.toBeInTheDocument();
    expect(directionButton).toHaveClass("rounded");
    expect(directionButton).toHaveClass("hover:bg-slate-800/45");
    expect(
      draftStack.compareDocumentPosition(directionButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /open joke context snapshot/i }));

    const contextDialog = screen.getByRole("dialog", {
      name: /joke context snapshot/i,
    });

    expect(contextDialog).toHaveTextContent("Source Tweet Claim");
    expect(contextDialog).toHaveTextContent(
      "The source tweet claims the launch removes the final workflow bottleneck.",
    );
    expect(contextDialog).toHaveTextContent("Jokeable Tensions");
    expect(contextDialog).not.toHaveTextContent(/approve|retry|repair/i);
    expect(within(contextDialog).queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(
      within(contextDialog).getByRole("button", {
        name: /close joke context snapshot/i,
      }),
    );
    await user.click(directionButton);

    const directionDialog = screen.getByRole("dialog", {
      name: /visual joke direction/i,
    });

    expect(
      within(directionDialog).getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === "pre" && element.textContent === visualJokeDirection,
      ),
    ).toBeInTheDocument();

    await user.click(
      within(directionDialog).getByRole("button", {
        name: /close visual joke direction/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /open visual joke direction/i }));

    expect(
      within(screen.getByRole("dialog", { name: /visual joke direction/i })).getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === "pre" && element.textContent === visualJokeDirection,
      ),
    ).toBeInTheDocument();
  });

  test("keeps context and visual joke failure details behind quiet reveals", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
    });
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    const tweetContext = buildFixtureTweetContext(sourceTweetUrl);

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              debugLog: ["Started fixture context gathering.", "Tweet text stayed too thin."],
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
          },
          label: "Drafts for 1234567890",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
      generationEventSources[0]?.emit(
        buildGenerationFailureEvent("Joke context gathering could not form usable context."),
      );
    });

    const failureState = screen.getByRole("region", {
      name: /generation failure state/i,
    });

    expect(failureState).toHaveTextContent("Joke context gathering could not form usable context.");
    expect(failureState).not.toHaveTextContent("Tweet text stayed too thin.");

    await user.click(
      within(failureState).getByRole("button", {
        name: /open joke context debug log/i,
      }),
    );

    expect(screen.getByRole("dialog", { name: /joke context debug log/i })).toHaveTextContent(
      "Tweet text stayed too thin.",
    );

    await user.click(screen.getByRole("button", { name: /close joke context debug log/i }));

    cleanup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("1234567890"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              status: "not-started",
            },
            textGeneration: {
              completedAt: "2026-06-06T10:13:00.000Z",
              draftCount: 3,
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "completed",
            },
            visualJokeGeneration: {
              failedAt: "2026-06-06T10:14:00.000Z",
              message: "Visual joke generation hit a provider timeout.",
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "failed",
            },
          },
        }),
      ],
    });

    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });

    expect(visualJokeArea).toHaveTextContent("This result area could not be completed.");
    expect(visualJokeArea).not.toHaveTextContent("provider timeout");

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /open visual joke failure details/i,
      }),
    );

    expect(screen.getByRole("dialog", { name: /visual joke failure details/i })).toHaveTextContent(
      "Visual joke generation hit a provider timeout.",
    );
  });

  test("keeps image discovery failure details behind a quiet image-work result area", async () => {
    const user = userEvent.setup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("1234567890"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              debugLog: ["Serper quota was exhausted before image results returned."],
              failedAt: "2026-06-06T10:12:00.000Z",
              message: "News-linked image discovery could not complete.",
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "failed",
            },
            textGeneration: {
              completedAt: "2026-06-06T10:13:00.000Z",
              draftCount: 3,
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "completed",
            },
            visualJokeGeneration: {
              completedAt: "2026-06-06T10:15:00.000Z",
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "completed",
              visualJokeSet: buildVisualJokeSet(),
            },
          },
          imageGenerationState: {
            status: "not-started",
          },
          newsLinkedImages: undefined,
          phase: undefined,
          visualJokeSet: buildVisualJokeSet(),
        }),
      ],
    });

    const imageWorkArea = screen.getByRole("region", {
      name: /image work creative result area/i,
    });

    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /visual joke creative result area/i }),
    ).toBeInTheDocument();
    expect(imageWorkArea).toHaveTextContent("This result area could not be completed.");
    expect(imageWorkArea).not.toHaveTextContent("Serper quota");
    expect(imageWorkArea).not.toHaveTextContent("News-linked image discovery could not complete.");

    await user.click(
      within(imageWorkArea).getByRole("button", {
        name: /open image discovery failure details/i,
      }),
    );

    const detailsDialog = screen.getByRole("dialog", {
      name: /image discovery failure details/i,
    });

    expect(detailsDialog).toHaveTextContent("News-linked image discovery could not complete.");
    expect(detailsDialog).toHaveTextContent("Serper quota was exhausted");
  });

  test("renders image sets, failed image states, modal navigation, and image downloads", async () => {
    const user = userEvent.setup();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);
    const failedImageSet = buildFailedImageSet(newsLinkedImages[1]);

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          failedImageSets: [failedImageSet],
          imageGenerationState: {
            completedAt: "2026-06-05T10:23:00.000Z",
            selectedImageIds: [newsLinkedImages[0].id, newsLinkedImages[1].id],
            startedAt: "2026-06-05T10:20:00.000Z",
            status: "partially-failed",
            userImagePrompt: "Make it feel like a serious product launch image.",
          },
          imageModelProvenance: imageSet.imageModelProvenance,
          imageSets: [imageSet],
          newsLinkedImages: newsLinkedImages.slice(0, 2),
          phase: "image-generation-partially-failed",
          selectedImageOriginals: [imageSet.selectedImageOriginal],
        }),
      ],
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });
    const imageResultsArea = within(imageGenerationArea).getByRole("region", {
      name: /image results area/i,
    });
    const failedState = within(imageResultsArea).getByRole("article", {
      name: /failed image set 1/i,
    });

    expect(imageGenerationArea).toHaveTextContent(imageSet.imageModelProvenance.model);
    expect(
      within(imageResultsArea).getByRole("article", {
        name: /^image set 1$/i,
      }),
    ).toHaveTextContent("Original");
    expect(imageResultsArea).toHaveTextContent("Variation 1");
    expect(imageResultsArea).toHaveTextContent("Variation 2");
    expect(failedState).toHaveTextContent("This image set could not be generated.");
    expect(failedState).not.toHaveTextContent("The configured image model failed.");
    expect(within(failedState).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(imageResultsArea).getByRole("link", {
        name: /download original from image set 1/i,
      }),
    ).toHaveAttribute("href", imageSet.options[0].url);
    expect(
      screen.getByRole("button", {
        name: /copy draft 1/i,
      }),
    ).toBeInTheDocument();

    await user.click(
      within(failedState).getByRole("button", {
        name: /open quiet failure details for failed image set 1/i,
      }),
    );

    expect(screen.getByRole("dialog", { name: /quiet failure details/i })).toHaveTextContent(
      "The configured image model failed.",
    );

    await user.click(screen.getByRole("button", { name: /close quiet failure details/i }));

    await user.click(
      within(imageResultsArea).getByRole("button", {
        name: /open original from image set 1/i,
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: /original image option/i,
    });

    expect(
      within(dialog).getByRole("link", {
        name: /download current image option/i,
      }),
    ).toHaveAttribute("href", imageSet.options[0].url);

    await user.click(
      within(dialog).getByRole("button", {
        name: /next image option/i,
      }),
    );

    expect(
      screen.getByRole("dialog", {
        name: /variation 1 image option/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /download current image option/i,
      }),
    ).toHaveAttribute("href", imageSet.options[1].url);

    await user.click(
      screen.getByRole("button", {
        name: /previous image option/i,
      }),
    );

    expect(
      screen.getByRole("dialog", {
        name: /original image option/i,
      }),
    ).toBeInTheDocument();
  });

  test("streams image generation results into the active run", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);
    const failedImageSet = buildFailedImageSet(newsLinkedImages[1]);
    const jokeContextSnapshot = buildJokeContextSnapshot("1234567890");
    const visualJokeSet = buildVisualJokeSet();
    const selectedVisualJoke = {
      selectedAt: "2026-06-06T10:16:00.000Z",
      visualJokeId: visualJokeSet.jokes[1].id,
    };
    const imageGenerationStreamFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        buildImageGenerationStreamResponse([
          {
            type: "image-set-completed",
            imageSet,
          },
          {
            type: "image-set-failed",
            failedImageSet,
          },
          {
            type: "image-generation-completed",
            state: {
              completedAt: "2026-06-05T10:23:00.000Z",
              failedImageSets: [failedImageSet],
              imageSets: [imageSet],
              status: "partially-failed",
            },
          },
        ]),
    );

    renderWorkspace({
      imageGenerationStreamFetcher,
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            status: "not-started",
          },
          jokeContextSnapshot,
          newsLinkedImages,
          phase: "waiting-for-image-selection",
          selectedVisualJoke,
          usersDirection: "Keep the text skeptical about platform risk.",
          visualJokeDirection: "Internal visual joke direction.",
          visualJokeSet,
        }),
      ],
      savedRunStore,
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select platform visual/i,
      }),
    );
    await user.type(
      within(imageGenerationArea).getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make it feel like a serious product launch image.",
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /^image generation$/i,
      }),
    );

    expect(imageGenerationStreamFetcher).toHaveBeenCalledWith(
      "/api/generation-runs/image-generation/stream",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(imageGenerationStreamFetcher.mock.calls[0]?.[1]?.body)).parentRun
        .imageGenerationState,
    ).toEqual({
      status: "not-started",
    });
    expect(JSON.parse(String(imageGenerationStreamFetcher.mock.calls[0]?.[1]?.body))).toEqual({
      input: {
        parentRunId: "saved-run",
        selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
        userImagePrompt: "Make it feel like a serious product launch image.",
      },
      parentRun: {
        id: "saved-run",
        imageGenerationState: {
          status: "not-started",
        },
        newsLinkedImages,
        phase: "waiting-for-image-selection",
      },
    });
    expect(JSON.stringify(imageGenerationStreamFetcher.mock.calls[0]?.[1]?.body)).not.toMatch(
      /jokeContextSnapshot|visualJokeDirection|visualJokeSet|selectedVisualJoke|platform risk/i,
    );
    await waitFor(() =>
      expect(
        within(imageGenerationArea).getByRole("region", {
          name: /image results area/i,
        }),
      ).toHaveTextContent("Variation 2"),
    );
    expect(imageGenerationArea).toHaveTextContent("Partial image failure");
    expect(imageGenerationArea).not.toHaveTextContent("The configured image model failed.");
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedImageSets: [failedImageSet],
          imageGenerationState: expect.objectContaining({
            status: "partially-failed",
          }),
          imageSets: [imageSet],
          jokeContextSnapshot,
          phase: "image-generation-partially-failed",
          selectedVisualJoke,
          visualJokeDirection: "Internal visual joke direction.",
          visualJokeSet,
        }),
      ),
    );
  });

  test("persists image-generation progress before the terminal stream event", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    const imageGenerationStreamFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              streamController = controller;
            },
          }),
          {
            headers: {
              "Content-Type": "text/event-stream",
            },
          },
        ),
    );

    renderWorkspace({
      imageGenerationStreamFetcher,
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            status: "not-started",
          },
          newsLinkedImages,
          phase: "waiting-for-image-selection",
        }),
      ],
      savedRunStore,
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    );
    await user.type(
      within(imageGenerationArea).getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make it feel like a serious product launch image.",
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /^image generation$/i,
      }),
    );

    await waitFor(() => expect(streamController).toBeDefined());

    act(() => {
      streamController?.enqueue(
        encoder.encode(
          `event: image-set-completed\ndata: ${JSON.stringify({
            type: "image-set-completed",
            imageSet,
          })}\n\n`,
        ),
      );
    });

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          imageModelProvenance: imageSet.imageModelProvenance,
          imageSets: [imageSet],
          phase: "image-generation-running",
          selectedImageOriginals: [imageSet.selectedImageOriginal],
        }),
      ),
    );

    act(() => {
      streamController?.close();
    });
  });

  test("opens the generation stream with the accepted intake", async () => {
    const user = userEvent.setup();
    const { sourceTweetUrlInput, generateButton, generationStreamUrls } = renderWorkspace();

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/13579");
    await user.click(screen.getByRole("button", { name: /open user's direction panel/i }));
    const usersDirectionInput = screen.getByRole("textbox", {
      name: /^user's direction$/i,
    });
    await user.type(usersDirectionInput, "Challenge the premise.");
    await user.click(
      screen.getByRole("button", {
        name: /close user's direction panel/i,
      }),
    );
    await user.click(generateButton);

    expect(generationStreamUrls).toEqual([
      "/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F13579&usersDirection=Challenge+the+premise.",
    ]);
  });

  test("automatically saves every completed Generation Run", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    const events = buildGenerationEvents({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "",
    });

    act(() => {
      for (const event of events) {
        generationEventSources[0]?.emit(event);
      }
    });

    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^run-/),
        label: "Drafts for 1234567890",
        sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
        status: "completed",
        draftCount: 3,
        sourceTweet: expect.objectContaining({
          text: expect.stringContaining("agent workspace"),
        }),
        savedAt: expect.any(String),
      }),
    );
    expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890");

    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*just now/i,
      }),
    ).toBeInTheDocument();
  });

  test("automatically saves completed v3 runs with context, visual jokes, selection, image state, and independent result states", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    const completedV3Run = buildCompletedV3Run();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    if (!completedV3Run.sourceTweet) {
      throw new Error("Expected completed v3 fixture to include a Source Tweet.");
    }

    const events = buildCompletedGenerationRunEvents({
      run: {
        drafts: completedV3Run.drafts,
        failedImageSets: completedV3Run.failedImageSets,
        generationResultStates: completedV3Run.generationResultStates,
        imageGenerationState: completedV3Run.imageGenerationState,
        imageModelProvenance: completedV3Run.imageModelProvenance,
        imageSets: completedV3Run.imageSets,
        jokeContextSnapshot: completedV3Run.jokeContextSnapshot,
        label: completedV3Run.label,
        newsLinkedImages: completedV3Run.newsLinkedImages,
        phase: completedV3Run.phase,
        selectedImageOriginals: completedV3Run.selectedImageOriginals,
        selectedVisualJoke: completedV3Run.selectedVisualJoke,
        sourceTweet: completedV3Run.sourceTweet,
        visualJokeDirection: completedV3Run.visualJokeDirection,
        visualJokeSet: completedV3Run.visualJokeSet,
      },
    });

    act(() => {
      for (const event of events) {
        generationEventSources[0]?.emit(event);
      }
    });

    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        drafts: completedV3Run.drafts,
        failedImageSets: completedV3Run.failedImageSets,
        generationResultStates: completedV3Run.generationResultStates,
        imageGenerationState: completedV3Run.imageGenerationState,
        imageSets: completedV3Run.imageSets,
        jokeContextSnapshot: completedV3Run.jokeContextSnapshot,
        newsLinkedImages: completedV3Run.newsLinkedImages,
        selectedImageOriginals: completedV3Run.selectedImageOriginals,
        selectedVisualJoke: completedV3Run.selectedVisualJoke,
        visualJokeDirection: completedV3Run.visualJokeDirection,
        visualJokeSet: completedV3Run.visualJokeSet,
      }),
    );
  });

  test("reopens Saved Runs from the drawer without regenerating", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Previously saved run" }),
    ]);
    const { generationStreamUrls, sourceTweetUrlInput } = renderWorkspace({
      savedRunStore,
    });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs drawer, 1 runs/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /previously saved run.*just now/i,
      }),
    );

    expect(generationStreamUrls).toEqual([]);
    expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890");
    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", {
        name: /source tweet preview/i,
      }),
    ).toHaveTextContent("agent workspace");
    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
  });

  test("reopens v3 Saved Runs with selected visual jokes, exact joke sets, failures, and no regeneration", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const startImageGeneration = vi.fn();
    const imageGenerationStreamFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(""),
    );
    const savedRun = buildCompletedV3Run({
      label: "Persisted v3 run",
      usersDirection: "Keep the saved direction.",
    });
    const savedRunStore = createMemorySavedRunStore([savedRun]);
    const { generationStreamUrls, sourceTweetUrlInput } = renderWorkspace({
      imageGenerationStreamFetcher,
      onStartGenerationRun: startGenerationRun,
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs drawer, 1 runs/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /persisted v3 run/i,
      }),
    );

    expect(generationStreamUrls).toEqual([]);
    expect(startGenerationRun).not.toHaveBeenCalled();
    expect(startImageGeneration).not.toHaveBeenCalled();
    expect(imageGenerationStreamFetcher).not.toHaveBeenCalled();
    expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890");

    await user.click(screen.getByRole("button", { name: /open user's direction panel/i }));
    expect(screen.getByRole("textbox", { name: /^user's direction$/i })).toHaveValue(
      "Keep the saved direction.",
    );
    await user.click(screen.getByRole("button", { name: /close user's direction panel/i }));

    await user.click(screen.getByRole("button", { name: /open joke context snapshot/i }));
    expect(screen.getByRole("dialog", { name: /joke context snapshot/i })).toHaveTextContent(
      "The source tweet claims the launch removes the final workflow bottleneck.",
    );
    await user.click(screen.getByRole("button", { name: /close joke context snapshot/i }));

    await user.click(screen.getByRole("button", { name: /open visual joke direction/i }));
    expect(screen.getByRole("dialog", { name: /visual joke direction/i })).toHaveTextContent(
      "Ground every visual joke in the source media and lock-in replies.",
    );
    await user.click(screen.getByRole("button", { name: /close visual joke direction/i }));

    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });
    expect(within(visualJokeArea).getAllByRole("article")).toHaveLength(5);
    expect(
      within(visualJokeArea).getByRole("button", {
        name: /clear visual joke 2 selection/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(visualJokeArea).toHaveTextContent(
      "A launch graphic where confetti falls only on the terms-of-service checkbox.",
    );

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });
    expect(
      within(imageGenerationArea).getByRole("region", {
        name: /image results area/i,
      }),
    ).toHaveTextContent("Variation 2");
    expect(imageGenerationArea).toHaveTextContent("Image set failed");
    expect(imageGenerationArea).not.toHaveTextContent("The configured image model failed.");
  });

  test("reopens text-successful Saved Runs with unstarted image generation still eligible", async () => {
    const user = userEvent.setup();
    const startImageGeneration = vi.fn();
    const newsLinkedImages = buildNewsLinkedImages();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({
        imageGenerationState: {
          status: "not-started",
        },
        label: "Image-ready saved run",
        newsLinkedImages,
        phase: "waiting-for-image-selection",
      }),
    ]);
    const { generationStreamUrls } = renderWorkspace({
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs drawer, 1 runs/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /image-ready saved run.*just now/i,
      }),
    );

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(generationStreamUrls).toEqual([]);
    expect(imageGenerationArea).toHaveTextContent("Waiting for image selection");
    expect(imageGenerationArea).toHaveTextContent("Launch visual");

    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    );
    await user.type(
      within(imageGenerationArea).getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make the visual feel launch-ready.",
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /^image generation$/i,
      }),
    );

    expect(startImageGeneration).toHaveBeenCalledWith({
      parentRunId: "saved-run",
      selectedImageIds: ["news-linked-image-1"],
      userImagePrompt: "Make the visual feel launch-ready.",
    });
  });

  test("shows retrieval failure feedback without saving a completed run", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationFailureEvent("Source tweet could not be retrieved."),
      );
    });

    expect(generationEventSources[0]?.closed).toBe(true);
    expect(screen.getByRole("region", { name: /generation failure state/i })).toHaveTextContent(
      "Source tweet could not be retrieved.",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Source tweet could not be retrieved.");
    expect(savedRunStore.save).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(screen.getByTitle("Failed")).toBeInTheDocument();
  });

  test("renders completed drafts as a single-open stack with provider provenance and controls", async () => {
    const user = userEvent.setup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedRun()],
    });

    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const expandedFirstDraft = within(draftStack).getByRole("article", {
      name: /expanded draft 1/i,
    });
    const collapsedSecondDraft = within(draftStack).getByRole("article", {
      name: /collapsed draft 2/i,
    });

    expect(within(draftStack).queryByText("Saved run")).not.toBeInTheDocument();
    expect(
      within(expandedFirstDraft).getByRole("button", {
        name: /copy draft 1/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(expandedFirstDraft).getByRole("button", {
        name: /show visible rationale for draft 1/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(collapsedSecondDraft).getByText("Quote-tweet draft: second saved draft."),
    ).toHaveClass("line-clamp-3");
    expect(
      within(draftStack).getByRole("img", {
        name: /chatgpt provider icon/i,
      }),
    ).toHaveAttribute("src", expect.stringContaining("chatgpt.png"));
    expect(
      within(draftStack).getByRole("img", {
        name: /claude provider icon/i,
      }),
    ).toHaveAttribute("src", expect.stringContaining("claude.png"));
    expect(
      within(draftStack).getByRole("img", {
        name: /gemini provider icon/i,
      }),
    ).toHaveAttribute("src", expect.stringContaining("gemini.png"));

    await user.click(
      within(collapsedSecondDraft).getByRole("button", {
        name: /expand draft 2/i,
      }),
    );

    expect(
      within(draftStack).getByRole("article", {
        name: /expanded draft 2/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(draftStack).getByRole("article", {
        name: /collapsed draft 1/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(draftStack).getByRole("button", {
        name: /copy draft 2/i,
      }),
    ).toBeInTheDocument();
  });

  test("enters plain-text editing only after clicking an already-expanded draft", async () => {
    const user = userEvent.setup();
    const completedRun = buildCompletedRun({
      drafts: [
        buildSavedDraft({
          id: "draft-openai",
          provider: "openai",
          text: "First line.\nSecond line.",
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
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [completedRun],
    });

    const expandedFirstDraft = screen.getByRole("article", {
      name: /expanded draft 1/i,
    });

    expect(
      within(expandedFirstDraft).queryByRole("textbox", {
        name: /edit draft 1/i,
      }),
    ).not.toBeInTheDocument();
    expect(expandedFirstDraft).toHaveTextContent("First line.");

    await user.click(
      within(expandedFirstDraft).getByRole("button", {
        name: /edit draft 1/i,
      }),
    );

    expect(
      within(expandedFirstDraft).getByRole("textbox", {
        name: /edit draft 1/i,
      }),
    ).toHaveValue("First line.\nSecond line.");
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("preserves line breaks, hides autosave state, and copies the current draft text", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);
    const completedRun = buildCompletedRun({
      imageGenerationState: {
        completedAt: "2026-06-05T10:23:00.000Z",
        selectedImageIds: [newsLinkedImages[0].id],
        startedAt: "2026-06-05T10:20:00.000Z",
        status: "completed",
        userImagePrompt: "Keep the image polished.",
      },
      imageModelProvenance: imageSet.imageModelProvenance,
      imageSets: [imageSet],
      newsLinkedImages: newsLinkedImages.slice(0, 1),
      phase: "image-generation-complete",
      selectedImageOriginals: [imageSet.selectedImageOriginal],
    });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [completedRun],
      savedRunStore,
    });

    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
    expect(
      screen.getByRole("button", {
        name: /show visible rationale for draft 1/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /export/i })).toBeNull();
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /edit draft 1/i,
      }),
    );
    const draftEditor = screen.getByRole("textbox", {
      name: /edit draft 1/i,
    });

    await user.clear(draftEditor);
    await user.type(draftEditor, "Edited first line.{enter}Edited second line.");

    expect(screen.queryByText(/autosave|saving/i)).not.toBeInTheDocument();
    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "saved-run",
        drafts: expect.arrayContaining([
          expect.objectContaining({
            id: "draft-openai",
            text: "Edited first line.\nEdited second line.",
          }),
        ]),
        imageGenerationState: completedRun.imageGenerationState,
        imageSets: [imageSet],
        newsLinkedImages: newsLinkedImages.slice(0, 1),
        selectedImageOriginals: [imageSet.selectedImageOriginal],
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: /copy draft 1/i,
      }),
    );

    expect(writeText).toHaveBeenCalledWith("Edited first line.\nEdited second line.");
  });

  test("reopens the latest edited Saved Run content without regenerating", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ id: "saved-run", label: "Editable saved run" }),
      buildCompletedRun({
        id: "other-run",
        label: "Other saved run",
        sourceTweetUrl: "https://x.com/siliconmania/status/222",
        drafts: [
          buildSavedDraft({
            id: "other-openai",
            provider: "openai",
            text: "Other first draft.",
          }),
          buildSavedDraft({
            id: "other-anthropic",
            provider: "anthropic",
            text: "Other second draft.",
          }),
          buildSavedDraft({
            id: "other-google",
            provider: "google",
            text: "Other third draft.",
          }),
        ],
      }),
    ]);
    const { generationStreamUrls } = renderWorkspace({ savedRunStore });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs drawer, 2 runs/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /editable saved run/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /edit draft 1/i,
      }),
    );
    const draftEditor = screen.getByRole("textbox", {
      name: /edit draft 1/i,
    });

    await user.clear(draftEditor);
    await user.type(draftEditor, "Latest edit line one.{enter}Line two.");
    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /open runs drawer, 2 runs/i }));
    await user.click(
      screen.getByRole("button", {
        name: /other saved run/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /open runs drawer, 2 runs/i }));
    await user.click(
      screen.getByRole("button", {
        name: /editable saved run/i,
      }),
    );

    expect(generationStreamUrls).toEqual([]);
    expect(
      screen.getByRole("article", {
        name: /expanded draft 1/i,
      }),
    ).toHaveTextContent("Latest edit line one. Line two.");
  });

  test("reusing the same source tweet creates an independent Saved Run", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ id: "original-saved-run" }),
    ]);
    const { generateButton, sourceTweetUrlInput } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await screen.findByRole("button", {
      name: /open runs drawer, 1 runs/i,
    });
    await waitFor(() =>
      expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890"),
    );
    await user.clear(sourceTweetUrlInput);
    await waitFor(() => expect(sourceTweetUrlInput).toHaveValue(""));
    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    const events = buildGenerationEvents({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "Keep it dry.",
    });

    act(() => {
      for (const event of events) {
        generationEventSources[0]?.emit(event);
      }
    });

    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.savedRuns.has("original-saved-run")).toBe(true);
    const newSavedRun = [...savedRunStore.savedRuns.values()].find(
      (savedRun) => savedRun.id !== "original-saved-run",
    );

    expect(newSavedRun).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^run-/),
        sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
        usersDirection: "Keep it dry.",
      }),
    );
  });

  test("renders saved-run relative dates", async () => {
    const dateNow = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-06-05T12:00:00.000Z").getTime());
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({
        label: "Three weeks old",
        savedAt: "2026-05-15T12:00:00.000Z",
      }),
    ]);

    renderWorkspace({ savedRunStore });

    const user = userEvent.setup();
    expect(
      await screen.findByRole("button", {
        name: /open runs drawer, 1 runs/i,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(
      screen.getByRole("button", {
        name: /three weeks old.*3 weeks ago/i,
      }),
    ).toBeInTheDocument();

    dateNow.mockRestore();
  });

  test("deletes saved runs through a desktop hover affordance", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Disposable run" }),
    ]);

    renderWorkspace({ isDesktop: true, savedRunStore });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs drawer, 1 runs/i,
      }),
    );
    await user.hover(
      screen.getByRole("button", {
        name: /disposable run.*just now/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /delete saved run: disposable run/i,
      }),
    );

    await waitFor(() => expect(savedRunStore.delete).toHaveBeenCalledWith("saved-run"));
    expect(
      screen.queryByRole("button", {
        name: /disposable run/i,
      }),
    ).not.toBeInTheDocument();
  });

  test("omits the delete affordance on mobile", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Mobile saved run" }),
    ]);

    renderWorkspace({ isDesktop: false, savedRunStore });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs drawer, 1 runs/i,
      }),
    );

    expect(
      screen.queryByRole("button", {
        name: /delete saved run: mobile saved run/i,
      }),
    ).not.toBeInTheDocument();
  });
});
