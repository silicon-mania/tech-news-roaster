import {
  type JokeContextSnapshot,
  parseJokeContextSnapshot,
  parseSourceTweetMediaExtraction,
  parseStructuredJokeContext,
  type SourceTweetMediaExtraction,
  type StructuredJokeContext,
} from "@/services/generation";
import {
  type SourceTweetMediaUnderstanding,
  understandSourceTweetMedia,
} from "@/services/media-understanding";
import type { RetrievedSourceTweet, RetrievedTweetContext } from "@/services/tweet-retrieval";

const noMediaPlaceholderKind = "unknown";
const jokeContextFailureMessage = "Joke context gathering could not form usable context.";
const representativeReplySnippetLimit = 5;

export type JokeContextGatheringInput = {
  tweetContext: RetrievedTweetContext;
};

type SupportingResearchInput = {
  mediaUnderstanding: SourceTweetMediaUnderstanding;
  replySignals: StructuredJokeContext["replySignals"];
  sourceTweet: RetrievedSourceTweet;
  sourceTweetClaim: string;
};

type SupportingResearchOutput = {
  forbiddenAssumptions: string[];
  jokeableTensions: string[];
  supportingFacts: string[];
  unknowns: string[];
};

type JokeContextGatheringOptions = {
  captureNow?: () => string;
  researchSupportingContext?: (input: SupportingResearchInput) => Promise<SupportingResearchOutput>;
  understandMedia?: (input: {
    mediaReferences: RetrievedSourceTweet["mediaReferences"];
  }) => Promise<SourceTweetMediaUnderstanding>;
};

export class JokeContextGatheringError extends Error {
  readonly debugLog: string[];
  readonly userMessage = jokeContextFailureMessage;

  constructor(message = jokeContextFailureMessage, debugLog: string[] = []) {
    super(message);
    this.debugLog = debugLog;
    this.name = "JokeContextGatheringError";
  }
}

export async function gatherJokeContext(
  { tweetContext }: JokeContextGatheringInput,
  {
    captureNow = () => new Date().toISOString(),
    researchSupportingContext = researchSupportingContextWithFixtures,
    understandMedia = understandSourceTweetMedia,
  }: JokeContextGatheringOptions = {},
): Promise<JokeContextSnapshot> {
  const debugLog = [
    `Starting joke context gathering for source tweet ${tweetContext.sourceTweet.id}.`,
  ];
  const sourceTweetClaim = buildSourceTweetClaim(tweetContext.sourceTweet);
  const replySignals = buildReplySignals(tweetContext.replies);
  const mediaUnderstanding = await safelyUnderstandMedia(
    tweetContext.sourceTweet.mediaReferences,
    understandMedia,
    debugLog,
  );
  const shouldResearch = shouldUseSupportingResearch({
    replySignals,
    sourceTweet: tweetContext.sourceTweet,
    sourceTweetClaim,
    sourceTweetMediaUnderstanding: mediaUnderstanding,
  });
  const supportingResearch = shouldResearch
    ? await safelyResearchSupportingContext(
        {
          mediaUnderstanding,
          replySignals,
          sourceTweet: tweetContext.sourceTweet,
          sourceTweetClaim,
        },
        researchSupportingContext,
        debugLog,
      )
    : emptySupportingResearchOutput();

  debugLog.push(
    shouldResearch
      ? "Supporting research ran because the local context looked incomplete."
      : "Supporting research was not needed because the source tweet, media read, and replies were already informative.",
  );

  const sourceTweetMediaExtraction = buildSourceTweetMediaExtraction({
    mediaUnderstanding,
    sourceTweet: tweetContext.sourceTweet,
  });
  const authorContext = buildAuthorContext(tweetContext.sourceTweet);
  const supportingFacts = buildSupportingFacts({
    replySignals,
    sourceTweetClaim,
    sourceTweetMediaExtraction,
    supportingResearch,
  });
  const unknowns = buildUnknowns({
    replySignals,
    sourceTweet: tweetContext.sourceTweet,
    sourceTweetClaim,
    sourceTweetMediaUnderstanding: mediaUnderstanding,
    supportingResearch,
  });
  const jokeableTensions = buildJokeableTensions({
    replySignals,
    sourceTweet: tweetContext.sourceTweet,
    sourceTweetMediaExtraction,
    supportingResearch,
  });
  const forbiddenAssumptions = buildForbiddenAssumptions({
    replySignals,
    sourceTweet: tweetContext.sourceTweet,
    sourceTweetMediaUnderstanding: mediaUnderstanding,
    supportingResearch,
  });

  if (
    shouldFailContext({
      replySignals,
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetClaim,
      sourceTweetMediaUnderstanding: mediaUnderstanding,
      supportingFacts,
    })
  ) {
    debugLog.push(
      "Context failed because the source tweet text was too thin and no reliable media or supporting context recovered the news.",
    );
    throw new JokeContextGatheringError(jokeContextFailureMessage, debugLog);
  }

  const structuredContext = parseStructuredJokeContext({
    authorContext,
    forbiddenAssumptions,
    jokeContextQuality: buildJokeContextQuality({
      replySignals,
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetMediaUnderstanding: mediaUnderstanding,
      supportingResearch,
    }),
    jokeableTensions,
    replySignals,
    sourceTweetClaim,
    sourceTweetMediaExtraction,
    supportingFacts,
    unknowns,
  });

  debugLog.push(
    `Context completed with quality status "${structuredContext.jokeContextQuality.status}".`,
  );

  return parseJokeContextSnapshot({
    capturedAt: captureNow(),
    sourceTweetId: tweetContext.sourceTweet.id,
    structuredContext,
  });
}

async function researchSupportingContextWithFixtures(
  input: SupportingResearchInput,
): Promise<SupportingResearchOutput> {
  const cueText = collapseWhitespace(
    [
      input.sourceTweetClaim,
      input.mediaUnderstanding.extraction?.summary,
      input.replySignals.summary,
      ...input.replySignals.representativeSnippets.map((snippet) => snippet.snippet),
    ]
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
  const supportingFacts: string[] = [];
  const unknowns: string[] = [];
  const forbiddenAssumptions: string[] = [];
  const jokeableTensions: string[] = [];

  if (cueText.match(/\b(agent|autopilot|workflow|automation|copilot)\b/)) {
    supportingFacts.push(
      "The post reads like an AI workflow or coordination announcement rather than a generic brand update.",
    );
    jokeableTensions.push(
      "The product promises less work while introducing another layer of workflow management.",
    );
  }

  if (cueText.match(/\b(price|pricing|tier|quota|seat|cost|premium)\b/)) {
    supportingFacts.push("Pricing or access controls are part of the public read on the launch.");
    jokeableTensions.push(
      "The announcement sells simplicity while the surrounding cues still point back to pricing pressure.",
    );
  }

  if (cueText.match(/\b(lock-in|platform|moat|ecosystem)\b/)) {
    supportingFacts.push(
      "The audience is already reading the announcement through platform power.",
    );
    jokeableTensions.push(
      "A convenience story doubles as a distribution or lock-in story once the incentives are inspected.",
    );
  }

  if (supportingFacts.length === 0) {
    unknowns.push("No extra supporting fact was confirmed beyond the source tweet and replies.");
  }

  forbiddenAssumptions.push(
    "Do not smuggle in a broader competitive narrative unless the source tweet or replies actually support it.",
  );

  return {
    forbiddenAssumptions,
    jokeableTensions,
    supportingFacts,
    unknowns,
  };
}

async function safelyUnderstandMedia(
  mediaReferences: RetrievedSourceTweet["mediaReferences"],
  understandMedia: NonNullable<JokeContextGatheringOptions["understandMedia"]>,
  debugLog: string[],
) {
  try {
    const mediaUnderstanding = await understandMedia({ mediaReferences });

    debugLog.push(`Media understanding returned status "${mediaUnderstanding.status}".`);

    return mediaUnderstanding;
  } catch (error) {
    debugLog.push(
      `Media understanding threw and was treated as unavailable: ${formatErrorMessage(error)}.`,
    );

    return buildUnavailableMediaUnderstanding(mediaReferences, formatErrorMessage(error));
  }
}

async function safelyResearchSupportingContext(
  input: SupportingResearchInput,
  researchSupportingContext: NonNullable<JokeContextGatheringOptions["researchSupportingContext"]>,
  debugLog: string[],
) {
  try {
    return await researchSupportingContext(input);
  } catch (error) {
    debugLog.push(
      `Supporting research failed and context fell back to local signals only: ${formatErrorMessage(error)}.`,
    );

    return emptySupportingResearchOutput();
  }
}

function buildUnavailableMediaUnderstanding(
  mediaReferences: RetrievedSourceTweet["mediaReferences"],
  message: string,
): SourceTweetMediaUnderstanding {
  if (mediaReferences.length === 0) {
    return {
      extraction: null,
      mediaReads: [],
      status: "not-needed",
    };
  }

  return {
    extraction: null,
    mediaReads: mediaReferences.map((mediaReference) => ({
      kind: mediaReference.kind,
      mediaReferenceId: mediaReference.id,
      message,
      status: "failed",
    })),
    status: "unavailable",
  };
}

function buildSourceTweetClaim(sourceTweet: RetrievedSourceTweet) {
  const normalizedText = collapseWhitespace(sourceTweet.text);

  return normalizedText.endsWith(".") ? normalizedText : `${normalizedText}.`;
}

function buildReplySignals(
  replies: RetrievedTweetContext["replies"],
): StructuredJokeContext["replySignals"] {
  const representativeSnippets = replies
    .slice()
    .sort((left, right) => calculateReplyEngagement(right) - calculateReplyEngagement(left))
    .slice(0, representativeReplySnippetLimit)
    .map((reply) => ({
      authorHandle: reply.author.username,
      replyId: reply.id,
      signal: classifyReplySignal(reply.text),
      snippet: collapseWhitespace(reply.text),
    }));

  return {
    representativeSnippets,
    summary: summarizeReplySignals(representativeSnippets),
  };
}

function calculateReplyEngagement(reply: RetrievedTweetContext["replies"][number]) {
  return reply.metrics.likes + reply.metrics.quotes + reply.metrics.replies + reply.metrics.reposts;
}

function classifyReplySignal(replyText: string) {
  const lowerReplyText = collapseWhitespace(replyText).toLowerCase();

  if (lowerReplyText.match(/\b(price|pricing|tier|quota|seat|cost|premium)\b/)) {
    return "pricing pressure";
  }

  if (lowerReplyText.match(/\b(lock-in|lock in|platform|moat|workflow)\b/)) {
    return "platform lock-in";
  }

  if (lowerReplyText.includes("?") || lowerReplyText.match(/\b(really|actually|sure|doubt)\b/)) {
    return "skepticism";
  }

  if (lowerReplyText.match(/\b(new|again|same old|still the same)\b/)) {
    return "hype fatigue";
  }

  if (lowerReplyText.match(/\b(lol|lmao|haha|joke)\b/)) {
    return "mockery";
  }

  return "audience read";
}

function summarizeReplySignals(
  representativeSnippets: StructuredJokeContext["replySignals"]["representativeSnippets"],
) {
  if (representativeSnippets.length === 0) {
    return "Replies are too sparse to establish a durable audience read yet.";
  }

  const distinctSignals = dedupeValues(representativeSnippets.map((snippet) => snippet.signal));

  if (distinctSignals.length === 1) {
    return `Replies cluster around ${distinctSignals[0]}.`;
  }

  return `Replies cluster around ${joinWithCommasAndAnd(distinctSignals.slice(0, 3))}.`;
}

function buildSourceTweetMediaExtraction({
  mediaUnderstanding,
  sourceTweet,
}: {
  mediaUnderstanding: SourceTweetMediaUnderstanding;
  sourceTweet: RetrievedSourceTweet;
}): SourceTweetMediaExtraction {
  if (mediaUnderstanding.extraction) {
    return mediaUnderstanding.extraction;
  }

  if (mediaUnderstanding.status === "not-needed") {
    return parseSourceTweetMediaExtraction({
      mediaKinds: [noMediaPlaceholderKind],
      notableDetails: [],
      summary:
        "The source tweet has no attached media, so the context relies on the text, author framing, and replies.",
      visibleText: [],
    });
  }

  return parseSourceTweetMediaExtraction({
    mediaKinds:
      dedupeValues(sourceTweet.mediaReferences.map((mediaReference) => mediaReference.kind))
        .length > 0
        ? dedupeValues(sourceTweet.mediaReferences.map((mediaReference) => mediaReference.kind))
        : [noMediaPlaceholderKind],
    notableDetails: [
      "The source tweet includes media references, but the media-understanding step could not recover a reliable full read.",
    ],
    summary:
      "The source tweet includes media, but the reliable context had to fall back to text, metadata, and replies.",
    visibleText: dedupeValues(
      sourceTweet.mediaReferences
        .map((mediaReference) => mediaReference.altText)
        .filter((altText): altText is string => Boolean(altText)),
    ).slice(0, 3),
  });
}

function buildAuthorContext(
  sourceTweet: RetrievedSourceTweet,
): StructuredJokeContext["authorContext"] {
  const identity = `${sourceTweet.author.displayName} ${sourceTweet.author.username}`.toLowerCase();
  const readsLikePublication = identity.match(/\b(news|journal|media|times|post|daily|mania)\b/);
  const readsLikePrimaryActor = collapseWhitespace(sourceTweet.text)
    .toLowerCase()
    .match(/\b(we|our|i)\b/);
  const role = readsLikePublication
    ? "Tech publication"
    : readsLikePrimaryActor
      ? "Company or founder voice"
      : "Commentator";
  const relationshipToTopic = readsLikePublication
    ? "A commentary voice translating the news for a tech audience."
    : readsLikePrimaryActor
      ? "A likely primary actor framing the news from inside the announcement."
      : "A public observer framing the news from outside the primary product org.";

  return {
    authoritySignals:
      dedupeValues(
        [
          sourceTweet.mediaReferences.length > 0
            ? "The author attached primary media directly to the source tweet."
            : null,
          sourceTweet.metrics.views > 5_000
            ? "The source tweet is already drawing meaningful public attention."
            : null,
          readsLikePublication
            ? "The account identity reads like a tech commentary or publication voice."
            : null,
        ].filter((signal): signal is string => Boolean(signal)),
      ).length > 0
        ? dedupeValues(
            [
              sourceTweet.mediaReferences.length > 0
                ? "The author attached primary media directly to the source tweet."
                : null,
              sourceTweet.metrics.views > 5_000
                ? "The source tweet is already drawing meaningful public attention."
                : null,
              readsLikePublication
                ? "The account identity reads like a tech commentary or publication voice."
                : null,
            ].filter((signal): signal is string => Boolean(signal)),
          )
        : ["The source tweet itself is the primary source of context."],
    displayName: sourceTweet.author.displayName,
    handle: sourceTweet.author.username,
    relationshipToTopic,
    role,
  };
}

function buildSupportingFacts({
  replySignals,
  sourceTweetClaim,
  sourceTweetMediaExtraction,
  supportingResearch,
}: {
  replySignals: StructuredJokeContext["replySignals"];
  sourceTweetClaim: string;
  sourceTweetMediaExtraction: SourceTweetMediaExtraction;
  supportingResearch: SupportingResearchOutput;
}) {
  return dedupeValues(
    [
      `Source tweet anchor: ${sourceTweetClaim}`,
      `Media read: ${sourceTweetMediaExtraction.summary}`,
      replySignals.representativeSnippets.length > 0 ? `Reply read: ${replySignals.summary}` : null,
      ...supportingResearch.supportingFacts,
    ].filter((fact): fact is string => Boolean(fact)),
  );
}

function buildUnknowns({
  replySignals,
  sourceTweet,
  sourceTweetClaim,
  sourceTweetMediaUnderstanding,
  supportingResearch,
}: {
  replySignals: StructuredJokeContext["replySignals"];
  sourceTweet: RetrievedSourceTweet;
  sourceTweetClaim: string;
  sourceTweetMediaUnderstanding: SourceTweetMediaUnderstanding;
  supportingResearch: SupportingResearchOutput;
}) {
  return dedupeValues(
    [
      isThinSourceTweetText(sourceTweetClaim)
        ? "The source tweet leaves some of the product or news specifics implicit."
        : null,
      sourceTweet.mediaReferences.length > 0 && sourceTweetMediaUnderstanding.status !== "completed"
        ? "Some source-tweet media details remained unavailable."
        : null,
      replySignals.representativeSnippets.length === 0
        ? "Reply consensus has not formed yet."
        : null,
      ...supportingResearch.unknowns,
    ].filter((unknown): unknown is string => Boolean(unknown)),
  );
}

function buildJokeableTensions({
  replySignals,
  sourceTweet,
  sourceTweetMediaExtraction,
  supportingResearch,
}: {
  replySignals: StructuredJokeContext["replySignals"];
  sourceTweet: RetrievedSourceTweet;
  sourceTweetMediaExtraction: SourceTweetMediaExtraction;
  supportingResearch: SupportingResearchOutput;
}) {
  const cueText = collapseWhitespace(
    [
      sourceTweet.text,
      sourceTweetMediaExtraction.summary,
      sourceTweetMediaExtraction.visibleText.join(" "),
      replySignals.summary,
    ].join(" "),
  ).toLowerCase();
  const tensions = dedupeValues(
    [
      cueText.match(/\b(agent|autopilot|copilot|automation|workflow)\b/)
        ? "The launch promises less work while introducing another control surface to manage."
        : null,
      cueText.match(/\b(price|pricing|tier|quota|seat|cost|premium)\b/)
        ? "The product sells relief while the surrounding cues keep pointing back to pricing pressure."
        : null,
      cueText.match(/\b(lock-in|platform|ecosystem|moat)\b/)
        ? "The convenience story also reads like a platform-power or lock-in story."
        : null,
      cueText.match(/\b(skeptic|really|actually|again|same)\b/)
        ? "The announcement wants to sound inevitable while the audience reads it as another cycle of hype."
        : null,
      ...supportingResearch.jokeableTensions,
    ].filter((tension): tension is string => Boolean(tension)),
  );

  return tensions.length > 0
    ? tensions
    : [
        "The announcement sells certainty while leaving room for a new dependency or incentive trap.",
      ];
}

function buildForbiddenAssumptions({
  replySignals,
  sourceTweet,
  sourceTweetMediaUnderstanding,
  supportingResearch,
}: {
  replySignals: StructuredJokeContext["replySignals"];
  sourceTweet: RetrievedSourceTweet;
  sourceTweetMediaUnderstanding: SourceTweetMediaUnderstanding;
  supportingResearch: SupportingResearchOutput;
}) {
  return dedupeValues(
    [
      "Do not claim timelines, adoption numbers, or business outcomes that the Source Tweet does not show.",
      sourceTweet.mediaReferences.length > 0 && sourceTweetMediaUnderstanding.status !== "completed"
        ? "Do not pretend the unread media confirmed details that were never extracted."
        : null,
      replySignals.representativeSnippets.length === 0
        ? "Do not invent an audience consensus that is not present in the replies."
        : null,
      ...supportingResearch.forbiddenAssumptions,
    ].filter((assumption): assumption is string => Boolean(assumption)),
  );
}

function shouldUseSupportingResearch({
  replySignals,
  sourceTweet,
  sourceTweetClaim,
  sourceTweetMediaUnderstanding,
}: {
  replySignals: StructuredJokeContext["replySignals"];
  sourceTweet: RetrievedSourceTweet;
  sourceTweetClaim: string;
  sourceTweetMediaUnderstanding: SourceTweetMediaUnderstanding;
}) {
  return (
    (isThinSourceTweetText(sourceTweetClaim) &&
      !hasReliableMediaRead(sourceTweetMediaUnderstanding)) ||
    (replySignals.representativeSnippets.length === 0 &&
      sourceTweet.mediaReferences.length === 0 &&
      isThinSourceTweetText(sourceTweetClaim))
  );
}

function shouldFailContext({
  replySignals,
  sourceTweet,
  sourceTweetClaim,
  sourceTweetMediaUnderstanding,
  supportingFacts,
}: {
  replySignals: StructuredJokeContext["replySignals"];
  sourceTweet: RetrievedSourceTweet;
  sourceTweetClaim: string;
  sourceTweetMediaUnderstanding: SourceTweetMediaUnderstanding;
  supportingFacts: string[];
}) {
  if (!isThinSourceTweetText(sourceTweetClaim)) {
    return false;
  }

  if (hasReliableMediaRead(sourceTweetMediaUnderstanding)) {
    return false;
  }

  const hasNonMediaRecovery =
    replySignals.representativeSnippets.length > 0 || supportingFacts.length >= 3;

  return sourceTweet.mediaReferences.length === 0 ? !hasNonMediaRecovery : !hasNonMediaRecovery;
}

function hasReliableMediaRead(sourceTweetMediaUnderstanding: SourceTweetMediaUnderstanding) {
  return sourceTweetMediaUnderstanding.extraction !== null;
}

function buildJokeContextQuality({
  replySignals,
  sourceTweet,
  sourceTweetMediaUnderstanding,
  supportingResearch,
}: {
  replySignals: StructuredJokeContext["replySignals"];
  sourceTweet: RetrievedSourceTweet;
  sourceTweetMediaUnderstanding: SourceTweetMediaUnderstanding;
  supportingResearch: SupportingResearchOutput;
}) {
  const textIsThin = isThinSourceTweetText(sourceTweet.text);

  if (
    !textIsThin &&
    sourceTweetMediaUnderstanding.status === "completed" &&
    replySignals.representativeSnippets.length > 0
  ) {
    return {
      status: "strong",
      summary:
        "The source tweet, media read, and replies provide enough anchored context for grounded satire.",
    };
  }

  if (
    sourceTweetMediaUnderstanding.status === "degraded" ||
    sourceTweetMediaUnderstanding.status === "unavailable" ||
    supportingResearch.supportingFacts.length > 0
  ) {
    return {
      status: "usable",
      summary:
        "The context is anchored and usable, but at least one support layer stayed degraded or had to be inferred.",
    };
  }

  if (textIsThin) {
    return {
      status: "thin",
      summary:
        "The context is usable but thin, so jokes should stay very close to the explicit claim and visible cues.",
    };
  }

  return {
    status: "usable",
    summary:
      "The context is usable, though the strongest cues are concentrated in only part of the run.",
  };
}

function emptySupportingResearchOutput(): SupportingResearchOutput {
  return {
    forbiddenAssumptions: [],
    jokeableTensions: [],
    supportingFacts: [],
    unknowns: [],
  };
}

function isThinSourceTweetText(text: string) {
  const normalizedText = collapseWhitespace(text);
  const wordCount = normalizedText.split(" ").filter(Boolean).length;

  return normalizedText.length < 80 || wordCount < 12;
}

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function dedupeValues<T>(values: T[]) {
  return [...new Set(values)];
}

function joinWithCommasAndAnd(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}
