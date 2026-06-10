import type { z } from "zod";
import type { retrievedSourceTweetSchema } from "@/services/tweet-retrieval";
import type { NewsLinkedImage } from "./news-linked-image";
import type { QuoteTweetDraft } from "./quote-tweet-draft";
import { buildCompletedGenerationRunEvents, type GenerationStreamEvent } from "./stream-events";

type StubbedGenerationInput = {
  sourceTweetUrl: string;
  sourceTweet: z.infer<typeof retrievedSourceTweetSchema>;
  replySignals: unknown[];
  enrichmentContext?: {
    items: unknown[];
    newsLinkedImages: NewsLinkedImage[];
  };
  usersDirection: string;
};

export function buildStubbedGenerationEvents({
  enrichmentContext,
  replySignals,
  sourceTweet,
  sourceTweetUrl,
  usersDirection,
}: StubbedGenerationInput): GenerationStreamEvent[] {
  const runLabel = buildStubbedRunLabel(sourceTweetUrl);
  const directionClause = usersDirection
    ? ` It respects the user's direction: ${usersDirection}`
    : "";
  const replySignalClause =
    replySignals.length > 0
      ? " It also reads the reply signals without exposing them as a research panel."
      : "";
  const enrichmentClause =
    enrichmentContext && enrichmentContext.items.length > 0
      ? " It uses outside-X context only as hidden supporting material."
      : "";
  const contextClause = `${directionClause}${replySignalClause}${enrichmentClause}`;
  const drafts: QuoteTweetDraft[] = [
    {
      angle: "platform leverage",
      id: "draft-openai",
      text: `Quote-tweet draft: The real story is not the launch, it is the leverage. This update turns one product move into a pressure test for every platform trying to own the next interface.${contextClause}`,
      modelProvenance: "local draft model",
      provider: "openai",
      visibleRationale: "Frames the news around platform leverage and interface ownership.",
    },
    {
      angle: "incentive shift",
      id: "draft-anthropic",
      text: `Quote-tweet draft: Useful tech news usually hides in the incentives. If this works, the winner is not just the team shipping faster, but the company that makes everyone else adapt around it.${contextClause}`,
      modelProvenance: "local draft model",
      provider: "anthropic",
      visibleRationale:
        "Emphasizes incentives, adaptation pressure, and the strategic second-order effect.",
    },
    {
      angle: "distribution bet",
      id: "draft-google",
      text: `Quote-tweet draft: This looks like a feature, but it behaves like a distribution bet. Watch who gets access first, who gets priced out, and who suddenly has to explain their roadmap.${contextClause}`,
      modelProvenance: "local draft model",
      provider: "google",
      visibleRationale:
        "Treats the update as a distribution bet with pricing and access consequences.",
    },
  ];

  return buildCompletedGenerationRunEvents({
    run: {
      label: runLabel,
      sourceTweet,
      drafts,
      newsLinkedImages: enrichmentContext?.newsLinkedImages,
    },
  });
}

function buildStubbedRunLabel(sourceTweetUrl: string) {
  const statusId = sourceTweetUrl.match(/status\/([^/?#]+)/)?.[1] ?? "tweet";

  return `Drafts for ${statusId}`;
}
